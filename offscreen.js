const AUDIO_SAMPLE_RATE = 44100;
const ANALYSIS_TIMEOUT_BUFFER_MS = 22000;

let iframe;
let iframeReady = false;
let sandboxReady = false;
let sandboxInitializationError = null;
let analysisRunning = false;
let currentAnalysis = null;
let localAnalysisState = { status: 'idle' };
const sandboxWaiters = [];

function sendLog(message, source = 'offscreen') {
  chrome.runtime.sendMessage({
    target: 'popup',
    action: 'log',
    source,
    message
  }).catch(() => { });
}

async function sendToBackground(message, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await chrome.runtime.sendMessage({
        target: 'background',
        ...message
      });
      if (!response?.success) {
        throw new Error(response?.error || 'Background rejected the message.');
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise(resolve => setTimeout(resolve, attempt * 250));
      }
    }
  }
  throw lastError;
}

function updateLocalStatus(status) {
  localAnalysisState = {
    ...localAnalysisState,
    status
  };
  sendToBackground({ action: 'analysisStatus', status }).catch(error => {
    sendLog(`Could not report analysis status: ${error.message}`);
  });
}

function settleSandboxWaiters(error) {
  while (sandboxWaiters.length > 0) {
    const { resolve, reject } = sandboxWaiters.shift();
    if (error) {
      reject(error);
    } else {
      resolve();
    }
  }
}

function waitForSandbox() {
  if (sandboxReady) {
    return Promise.resolve();
  }
  if (sandboxInitializationError) {
    return Promise.reject(sandboxInitializationError);
  }
  return new Promise((resolve, reject) => {
    sandboxWaiters.push({ resolve, reject });
  });
}

function postToSandbox(message, transfer = []) {
  if (!iframeReady || !iframe?.contentWindow) {
    throw new Error('Analysis sandbox is not available.');
  }
  iframe.contentWindow.postMessage(message, '*', transfer);
}

function abortError(signal) {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error('Audio capture was cancelled.');
}

async function captureAudio(streamId, detectionTime, signal) {
  let stream = null;
  let audioContext = null;
  let source = null;
  let workletNode = null;
  let abortHandler = null;

  try {
    if (signal.aborted) {
      throw abortError(signal);
    }

    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });

    if (signal.aborted) {
      throw abortError(signal);
    }

    audioContext = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE });
    await audioContext.audioWorklet.addModule(chrome.runtime.getURL('audio-processor.js'));
    await audioContext.resume();

    source = audioContext.createMediaStreamSource(stream);
    workletNode = new AudioWorkletNode(audioContext, 'audio-processor');

    const totalSamples = audioContext.sampleRate * detectionTime;
    const audioBuffer = new Float32Array(totalSamples);
    let bufferPosition = 0;

    sendLog(`Capturing ${detectionTime} seconds at ${audioContext.sampleRate} Hz.`);

    return await new Promise((resolve, reject) => {
      let settled = false;

      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        callback(value);
      };

      abortHandler = () => finish(reject, abortError(signal));
      signal.addEventListener('abort', abortHandler, { once: true });

      workletNode.port.onmessage = (event) => {
        const audioChunk = event.data;
        const samplesToCopy = Math.min(audioChunk.length, totalSamples - bufferPosition);
        audioBuffer.set(audioChunk.subarray(0, samplesToCopy), bufferPosition);
        bufferPosition += samplesToCopy;

        if (bufferPosition >= totalSamples) {
          finish(resolve, audioBuffer);
        }
      };

      workletNode.onprocessorerror = () => {
        finish(reject, new Error('Audio processor stopped unexpectedly.'));
      };

      for (const track of stream.getAudioTracks()) {
        track.addEventListener('ended', () => {
          finish(reject, new Error('Tab audio capture ended before enough audio was collected.'));
        }, { once: true });
      }

      source.connect(workletNode);
      workletNode.connect(audioContext.destination);
      source.connect(audioContext.destination);
    });
  } finally {
    if (abortHandler) {
      signal.removeEventListener('abort', abortHandler);
    }
    if (workletNode) {
      workletNode.port.onmessage = null;
      workletNode.disconnect();
    }
    if (source) {
      source.disconnect();
    }
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    if (audioContext && audioContext.state !== 'closed') {
      await audioContext.close().catch(() => { });
    }
  }
}

function completeAnalysis(result) {
  if (!analysisRunning) {
    return;
  }

  analysisRunning = false;
  const analysis = currentAnalysis;
  currentAnalysis = null;

  if (analysis) {
    clearTimeout(analysis.timeoutId);
    analysis.abortController.abort(new Error('Analysis finished.'));
  }

  const error = typeof result.error === 'string' && result.error.length > 0
    ? result.error
    : null;
  const completedState = {
    status: error ? 'error' : 'completed',
    finishedAt: Date.now()
  };

  if (error) {
    completedState.error = error;
  } else {
    completedState.result = {
      key: result.key,
      scale: result.scale,
      bpm: result.bpm
    };
  }
  localAnalysisState = completedState;

  sendToBackground({
    action: 'analysisComplete',
    key: result.key,
    scale: result.scale,
    bpm: result.bpm,
    ...(error ? { error } : {})
  }).catch(sendError => {
    sendLog(`Could not report the final result: ${sendError.message}`);
  });
}

async function runAnalysis(streamId, detectionTime, signal) {
  try {
    const audioData = await captureAudio(streamId, detectionTime, signal);
    updateLocalStatus('computing');
    await waitForSandbox();

    if (signal.aborted) {
      throw abortError(signal);
    }

    sendLog(`Captured ${audioData.length} samples. Sending them directly to the sandbox.`);
    postToSandbox({
      type: 'audio-data',
      audioData: {
        type: 'Float32Array',
        buffer: audioData.buffer
      }
    }, [audioData.buffer]);
  } catch (error) {
    completeAnalysis({ error: `Audio Error: ${error.message}` });
  }
}

function startAnalysis(streamId, detectionTime) {
  if (analysisRunning) {
    return { success: false, error: 'Already processing' };
  }
  if (typeof streamId !== 'string' || streamId.length === 0) {
    return { success: false, error: 'Invalid tab capture stream ID.' };
  }
  if (!Number.isInteger(detectionTime) || detectionTime < 3 || detectionTime > 30) {
    return { success: false, error: 'Detection time must be between 3 and 30 seconds.' };
  }

  analysisRunning = true;
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort(new Error('Analysis timed out.'));
    completeAnalysis({ error: 'Timeout: Processing is taking too long.' });
  }, (detectionTime * 1000) + ANALYSIS_TIMEOUT_BUFFER_MS);

  currentAnalysis = { abortController, timeoutId };
  localAnalysisState = { status: 'capturing' };
  updateLocalStatus('capturing');
  runAnalysis(streamId, detectionTime, abortController.signal);
  return { success: true };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || msg.target !== 'offscreen') {
    return false;
  }

  switch (msg.type) {
    case 'start-analysis':
      sendResponse(startAnalysis(msg.streamId, Number(msg.detectionTime)));
      return false;
    case 'get-analysis-state':
      sendResponse({ success: true, state: localAnalysisState });
      return false;
    default:
      sendResponse({ success: false, error: 'Unknown offscreen message' });
      return false;
  }
});

window.addEventListener('message', (event) => {
  if (!iframe || event.source !== iframe.contentWindow) {
    return;
  }

  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.action === 'log') {
    sendLog(data.message, 'sandbox');
    return;
  }

  switch (data.type) {
    case 'ready':
      sandboxReady = true;
      settleSandboxWaiters();
      sendLog('Analysis sandbox is ready.');
      break;
    case 'result':
      if (!sandboxReady && data.error) {
        sandboxInitializationError = new Error(data.error);
        settleSandboxWaiters(sandboxInitializationError);
      } else {
        completeAnalysis({
          key: data.key,
          scale: data.scale,
          bpm: data.bpm,
          error: data.error
        });
      }
      break;
    default:
      sendLog(`Unknown sandbox message type: ${data.type}`);
  }
});

window.addEventListener('DOMContentLoaded', () => {
  iframe = document.createElement('iframe');
  iframe.src = chrome.runtime.getURL('sandbox.html');
  iframe.style.display = 'none';

  iframe.onload = () => {
    iframeReady = true;
    postToSandbox({ type: 'init-sandbox' });
  };

  iframe.onerror = () => {
    sandboxInitializationError = new Error('Analysis sandbox failed to load.');
    settleSandboxWaiters(sandboxInitializationError);
  };

  document.body.appendChild(iframe);
});
