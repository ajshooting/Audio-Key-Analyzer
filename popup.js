const startButton = document.getElementById('start-button');
const resultDiv = document.getElementById('result');
const logsDiv = document.getElementById('logs');
const detectionTimeInput = document.getElementById('detection-time');
const toggleLogsButton = document.getElementById('toggle-logs');

let isLogsVisible = false;

function i18n(messageName, substitutions) {
  return chrome.i18n.getMessage(messageName, substitutions);
}

function log(message) {
  logsDiv.textContent += `${message}\n`;
  logsDiv.scrollTop = logsDiv.scrollHeight;
}

function toggleLogs() {
  isLogsVisible = !isLogsVisible;
  logsDiv.style.display = isLogsVisible ? 'block' : 'none';
  toggleLogsButton.textContent = isLogsVisible ? i18n('hideLogsButton') : i18n('showLogsButton');
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    element.textContent = i18n(key);
  });
}

function replaceResult(...elements) {
  resultDiv.replaceChildren(...elements);
}

function createMessage(text, className, color) {
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  if (className) paragraph.className = className;
  if (color) paragraph.style.color = color;
  return paragraph;
}

function updateStatus(message, computing = false) {
  replaceResult(createMessage(message, computing ? 'computing' : null));
}

function updateResult(key, scale, bpm, error) {
  startButton.disabled = false;

  if (error) {
    replaceResult(createMessage(`${i18n('errorPrefix')} ${error}`, null, 'red'));
    return;
  }

  if (!key) {
    updateStatus(i18n('initialMessage'));
    return;
  }

  const keyResult = createMessage(`${i18n('keyLabel')} ${key} ${scale || ''}`.trim(), null, 'green');
  keyResult.style.fontSize = '18px';
  keyResult.style.fontWeight = 'bold';
  const elements = [keyResult];

  if (Number.isFinite(Number(bpm))) {
    const bpmResult = createMessage(`${i18n('bpmLabel')} ${Math.round(Number(bpm))}`, null, 'blue');
    bpmResult.style.fontSize = '16px';
    bpmResult.style.fontWeight = 'bold';
    elements.push(bpmResult);
  }

  replaceResult(...elements);
}

function renderAnalysisState(state) {
  switch (state?.status) {
    case 'starting':
    case 'capturing':
      startButton.disabled = true;
      updateStatus(i18n('capturingAudio'));
      break;
    case 'computing':
      startButton.disabled = true;
      updateStatus(i18n('computing'), true);
      break;
    case 'completed':
      updateResult(state.result?.key, state.result?.scale, state.result?.bpm, null);
      break;
    case 'error':
      updateResult(null, null, null, state.error || 'Unknown error');
      break;
    default:
      startButton.disabled = false;
      updateStatus(i18n('initialMessage'));
  }
}

function requestAnalysisState() {
  chrome.runtime.sendMessage({
    target: 'background',
    action: 'getAnalysisState'
  }, (response) => {
    if (chrome.runtime.lastError) {
      updateResult(null, null, null, `Communication Error: ${chrome.runtime.lastError.message}`);
    } else if (!response?.success) {
      updateResult(null, null, null, `Background Error: ${response?.error || 'Unknown error'}`);
    } else {
      renderAnalysisState(response.state);
    }
  });
}

function startCapture() {
  logsDiv.textContent = '';
  log('Capture button clicked.');
  startButton.disabled = true;
  updateStatus(i18n('capturingAudio'));

  const detectionTimeSeconds = parseInt(detectionTimeInput.value, 10) || 8;
  log(`Detection time set to: ${detectionTimeSeconds} seconds`);

  chrome.runtime.sendMessage({
    target: 'background',
    action: 'startAnalysis',
    detectionTime: detectionTimeSeconds
  }, (response) => {
    if (chrome.runtime.lastError) {
      updateResult(null, null, null, `Communication Error: ${chrome.runtime.lastError.message}`);
    } else if (!response?.success) {
      renderAnalysisState(response?.state);
      if (!response?.state) {
        updateResult(null, null, null, `Background Error: ${response?.error || 'Unknown error'}`);
      }
    } else {
      log('Background capture started successfully. The popup may now be closed.');
      renderAnalysisState(response.state);
    }
  });
}

function handleMessages(request) {
  if (request.target !== 'popup') {
    return;
  }

  if (request.action === 'analysisStateChanged') {
    renderAnalysisState(request.state);
  } else if (request.action === 'log') {
    log(`[${request.source}] ${request.message}`);
  }
}

function initializePopup() {
  applyI18n();
  startButton.addEventListener('click', startCapture);
  toggleLogsButton.addEventListener('click', toggleLogs);
  chrome.runtime.onMessage.addListener(handleMessages);
  requestAnalysisState();
}

document.addEventListener('DOMContentLoaded', initializePopup);
