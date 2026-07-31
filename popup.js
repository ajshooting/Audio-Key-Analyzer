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

  chrome.runtime.sendMessage({
    target: 'background',
    action: 'startAnalysis',
    detectionTime: detectionTimeSeconds
  }, (response) => {
    if (chrome.runtime.lastError) {
      clearCurrentTimeout();
      updateResult(null, null, null, `Communication Error: ${chrome.runtime.lastError.message}`);
    } else if (!response?.success) {
      clearCurrentTimeout();
      updateResult(null, null, null, `Background Error: ${response?.error || 'Unknown error'}`);
    } else {
      log('Background capture started successfully. The popup may now be closed.');
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
  if (request.target && request.target !== 'popup') {
    return;
  }

  if (request.action === 'updateResult') {
    log('Received final result.');
    // タイムアウトをクリア（推定完了時）
    clearCurrentTimeout();
    updateResult(request.key, request.scale, request.bpm, request.error);
  } else if (request.action === 'log') {
    log(`[${request.source}] ${request.message}`);
  } else if (request.action === 'analysisStatus') {
    updateStatus(i18n(request.status === 'computing' ? 'computing' : 'capturingAudio'));
  }
};

document.addEventListener('DOMContentLoaded', initializePopup);
