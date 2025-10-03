const startButton = document.getElementById('start-button');
const resultDiv = document.getElementById('result');
const logsDiv = document.getElementById('logs');
const detectionTimeInput = document.getElementById('detection-time');
const toggleLogsButton = document.getElementById('toggle-logs');

let isLogsVisible = false;
let currentTimeout = null; // タイムアウトIDを管理
let handleMessages; // 関数変数として宣言

// i18n helper function
function i18n(messageName, substitutions) {
  return chrome.i18n.getMessage(messageName, substitutions);
}

function log(message) {
  logsDiv.innerHTML += message + '\n';
  logsDiv.scrollTop = logsDiv.scrollHeight;
}

function toggleLogs() {
  isLogsVisible = !isLogsVisible;
  logsDiv.style.display = isLogsVisible ? 'block' : 'none';
  toggleLogsButton.textContent = isLogsVisible ? i18n('hideLogsButton') : i18n('showLogsButton');
}

function clearCurrentTimeout() {
  if (currentTimeout) {
    clearTimeout(currentTimeout);
    log('Timeout cleared successfully.');
    currentTimeout = null;
  } else {
    log('No active timeout to clear.');
  }
}

function initializePopup() {
  log('Popup opened.');

  // i18nテキストを適用
  applyI18n();

  // ポップアップ開始時に古いタイムアウトをクリア
  clearCurrentTimeout();

  updateStatus(i18n('initialMessage'));

  startButton.addEventListener('click', startCapture);
  toggleLogsButton.addEventListener('click', toggleLogs);
  chrome.runtime.onMessage.addListener(handleMessages);
}

function applyI18n() {
  // data-i18n属性を持つすべての要素にテキストを適用
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    element.textContent = i18n(key);
  });
}

function startCapture() {
  updateStatus(i18n('capturingAudio'));
  logsDiv.innerHTML = '';
  log('Capture button clicked.');
  startButton.disabled = true;

  // 既存のタイムアウトをクリア
  clearCurrentTimeout();

  // ユーザーが設定した検出時間を取得
  const detectionTimeSeconds = parseInt(detectionTimeInput.value) || 8;
  log(`Detection time set to: ${detectionTimeSeconds} seconds`);

  // タイムアウト処理を追加（設定時間 + 22秒のバッファ）
  const timeoutDuration = (detectionTimeSeconds + 22) * 1000;
  currentTimeout = setTimeout(() => {
    updateResult(null, null, null, i18n('timeoutError'));
    log(`Process timed out after ${timeoutDuration / 1000} seconds`);
    currentTimeout = null;
  }, timeoutDuration);

  // 結果を受信したらタイムアウトをクリア
  const originalHandleMessages = handleMessages;
  handleMessages = (request) => {
    if (request.action === 'updateResult') {
      clearCurrentTimeout();
      handleMessages = originalHandleMessages; // 元の関数に戻す
    }
    originalHandleMessages(request);
  };

  chrome.tabCapture.capture({ audio: true, video: false }, async (capturedStream) => {
    if (chrome.runtime.lastError || !capturedStream) {
      clearCurrentTimeout();
      const errorMsg = chrome.runtime.lastError ? chrome.runtime.lastError.message : "Stream not available.";
      updateResult(null, null, null, `Capture Error: ${errorMsg}`);
      return;
    }

    let stream = capturedStream;
    try {
      let audioContext = new AudioContext();
      await audioContext.audioWorklet.addModule('audio-processor.js');
      const source = audioContext.createMediaStreamSource(stream);
      let workletNode = new AudioWorkletNode(audioContext, 'audio-processor');

      const totalSamples = audioContext.sampleRate * detectionTimeSeconds; // ユーザー設定の時間を使用
      const audioBuffer = new Float32Array(totalSamples);
      let bufferPosition = 0;

      workletNode.port.onmessage = (event) => {
        const audioChunk = event.data;
        if (bufferPosition + audioChunk.length < totalSamples) {
          audioBuffer.set(audioChunk, bufferPosition);
          bufferPosition += audioChunk.length;
        } else {
          const remainingLength = totalSamples - bufferPosition;
          if (remainingLength > 0) {
            audioBuffer.set(audioChunk.subarray(0, remainingLength), bufferPosition);
          }

          // クリーンアップ
          if (workletNode) {
            workletNode.port.onmessage = null;
            workletNode.disconnect();
            workletNode = null;
          }
          if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
          }
          if (audioContext && audioContext.state !== 'closed') {
            audioContext.close();
            audioContext = null;
          }

          log(`Audio captured: ${audioBuffer.length} samples, sending to background.`);
          // Float32Arrayを通常の配列に変換してから送信
          const audioArray = Array.from(audioBuffer);
          log(`Converted to array with length: ${audioArray.length}`);

          // 計算中メッセージを表示
          updateStatus(i18n('computing'));

          chrome.runtime.sendMessage(
            {
              action: 'processAudio',
              audioData: audioArray,
              detectionTime: detectionTimeSeconds
            },
            (response) => {
              if (chrome.runtime.lastError) {
                clearCurrentTimeout();
                log(`Error sending message: ${chrome.runtime.lastError.message}`);
                updateResult(null, null, null, `Communication Error: ${chrome.runtime.lastError.message}`);
              } else if (response && !response.success) {
                clearCurrentTimeout();
                log(`Background error: ${response.error || 'Unknown error'}`);
                updateResult(null, null, null, `Background Error: ${response.error || 'Unknown error'}`);
              } else {
                log('Message sent successfully to background.');
              }
            }
          );
        }
      };

      source.connect(workletNode);
      source.connect(audioContext.destination);
    } catch (error) {
      clearCurrentTimeout();
      updateResult(null, null, null, `Audio Setup Error: ${error.message}`);
    }
  });
}

function updateStatus(message) {
  // 計算中メッセージのチェックを国際化対応
  if (message === i18n('computing')) {
    resultDiv.innerHTML = `<p class="computing">${message}</p>`;
  } else {
    resultDiv.innerHTML = `<p>${message}</p>`;
  }
}

function updateResult(key, scale, bpm, error) {
  // 結果表示時に確実にタイムアウトをクリア
  clearCurrentTimeout();

  if (error) {
    resultDiv.innerHTML = `<p style="color: red;">${i18n('errorPrefix')} ${error}</p>`;
  } else if (key) {
    let resultText = `<p style="color: green; font-size: 18px; font-weight: bold;">${i18n('keyLabel')} ${key} ${scale || ''}</p>`;
    if (bpm) {
      resultText += `<p style="color: blue; font-size: 16px; font-weight: bold;">${i18n('bpmLabel')} ${Math.round(bpm)}</p>`;
    }
    resultDiv.innerHTML = resultText;
  }
  startButton.disabled = false;
}

handleMessages = function (request) {
  if (request.action === 'updateResult') {
    log('Received final result.');
    // タイムアウトをクリア（推定完了時）
    clearCurrentTimeout();
    updateResult(request.key, request.scale, request.bpm, request.error);
  } else if (request.action === 'log') {
    log(`[${request.source}] ${request.message}`);
  }
};

document.addEventListener('DOMContentLoaded', initializePopup);
