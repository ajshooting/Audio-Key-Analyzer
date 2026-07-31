const AUDIO_SAMPLE_RATE = 44100;

let iframe;
let iframeReady = false;
let sandboxReady = false;
let sandboxInitializationError = null;
let analysisRunning = false;
const sandboxWaiters = [];

function sendLog(message, source = 'offscreen') {
  chrome.runtime.sendMessage({
    target: 'popup',
    action: 'log',
    source,
    message
  }).catch(() => { });
}

function notifyPopupStatus(status) {
  chrome.runtime.sendMessage({
    target: 'popup',
    action: 'analysisStatus',
    status
  }).catch(() => { });
}

function notifyAnalysisComplete(result) {
  chrome.runtime.sendMessage({
    target: 'background',
    action: 'analysisComplete',
    ...result
  }).catch(() => { });
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

async function captureAudio(streamId, detectionTime) {
  let stream = null;
  let audioContext = null;
  let source = null;
  let workletNode = null;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });

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

async function runAnalysis(streamId, detectionTime) {
  try {
    notifyPopupStatus('capturing');
    const audioData = await captureAudio(streamId, detectionTime);
    notifyPopupStatus('computing');
    await waitForSandbox();

    sendLog(`Captured ${audioData.length} samples. Sending them directly to the sandbox.`);
    postToSandbox({
      type: 'audio-data',
      audioData: {
        type: 'Float32Array',
        buffer: audioData.buffer
      }
    }, [audioData.buffer]);
  } catch (error) {
    analysisRunning = false;
    notifyAnalysisComplete({ error: `Audio Error: ${error.message}` });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || msg.target !== 'offscreen') {
    return false;
  }

  if (msg.type !== 'start-analysis') {
    sendResponse({ success: false, error: 'Unknown offscreen message' });
    return false;
  }

  if (analysisRunning) {
    sendResponse({ success: false, error: 'Already processing' });
    return false;
  }

  analysisRunning = true;
  runAnalysis(msg.streamId, msg.detectionTime);
  sendResponse({ success: true });
  return false;
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
      } else if (analysisRunning) {
        analysisRunning = false;
        notifyAnalysisComplete({
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
