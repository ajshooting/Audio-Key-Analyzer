function sendLog(message) {
  chrome.runtime.sendMessage({
    action: 'log',
    source: 'offscreen',
    message: message
  }).catch(() => { }); // エラーを無視
}

let iframeReady = false;
const messageQueue = [];
let iframe;

function processMessageQueue() {
  while (messageQueue.length > 0) {
    const msg = messageQueue.shift();
    sendLog(`Processing queued message of type '${msg.type}'.`);
    iframe.contentWindow.postMessage(msg, '*');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  sendLog('Document loaded. Creating sandbox iframe.');
  iframe = document.createElement('iframe');
  iframe.src = chrome.runtime.getURL('sandbox.html');
  iframe.style.display = 'none';

  iframe.onload = () => {
    sendLog('Sandbox iframe is fully loaded.');
    iframeReady = true;
    processMessageQueue();
  };

  iframe.onerror = (error) => {
    sendLog(`Iframe load error: ${error}`);
  };

  document.body.appendChild(iframe);

  // Background からのメッセージを処理
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.target === 'offscreen') {
      if (iframeReady) {
        sendLog(`Forwarding '${msg.type}' to sandbox immediately.`);
        iframe.contentWindow.postMessage(msg, '*');
      } else {
        sendLog(`Queuing message '${msg.type}' until sandbox is ready.`);
        messageQueue.push(msg);
      }
      sendResponse({ success: true });
      return false;
    }
    sendResponse({ success: false, error: 'Not for offscreen' });
    return false;
  });

  // Sandbox からのメッセージを処理
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data) return;

    // ログメッセージの処理
    if (data.action === 'log') {
      chrome.runtime.sendMessage(data).catch(() => { });
      return;
    }

    switch (data.type) {
      case 'ready':
        sendLog('Received sandbox-ready. Notifying background.');
        chrome.runtime.sendMessage({ action: 'sandbox-ready' }).catch(() => { });
        break;
      case 'result':
        sendLog('Received result from sandbox. Notifying background.');
        chrome.runtime.sendMessage({
          action: 'analysisComplete',
          key: data.key,
          scale: data.scale,
          bpm: data.bpm,
          error: data.error
        }).catch(() => { });
        break;
      default:
        sendLog(`Unknown message type: ${data.type}`);
    }
  });
});