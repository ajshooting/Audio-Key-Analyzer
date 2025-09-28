const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
let pendingAudioData = null;
let isProcessing = false;

async function hasOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });
  return contexts.length > 0;
}

async function setupOffscreenDocument() {
  try {
    const hasDocument = await hasOffscreenDocument();
    if (!hasDocument) {
      sendLog('Creating new offscreen document...');
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: ['USER_MEDIA'],
        justification: 'Audio processing using Essentia.js via sandboxed iframe.'
      });
      sendLog('Offscreen document created.');
      // ドキュメントが完全に準備されるまで少し待つ
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      sendLog('Offscreen document already exists.');
    }
  } catch (error) {
    sendLog(`Error in setupOffscreenDocument: ${error.message}`);
    throw error;
  }
}

async function closeOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    await chrome.offscreen.closeDocument();
    sendLog('Offscreen document closed.');
  }
}

function sendLog(message) {
  chrome.runtime.sendMessage({
    action: 'log',
    source: 'background',
    message: message
  }).catch(() => { }); // エラーを無視（popup が閉じている場合など）
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.action) {
    case 'processAudio':
      if (isProcessing) {
        sendLog('Already processing, ignoring new request.');
        sendResponse({ success: false, error: 'Already processing' });
        return false;
      }
      isProcessing = true;
      sendLog('Received audio data from popup.');

      // 音声データの詳細をログ出力
      const audioData = msg.audioData;
      sendLog(`Audio data type: ${typeof audioData}`);
      sendLog(`Audio data constructor: ${audioData ? audioData.constructor.name : 'null'}`);
      sendLog(`Audio data is array: ${Array.isArray(audioData)}`);
      sendLog(`Audio data length: ${audioData ? audioData.length : 'undefined'}`);

      if (!audioData || !Array.isArray(audioData) || audioData.length === 0) {
        sendLog('Invalid or empty audio data received');
        isProcessing = false;
        sendResponse({ success: false, error: 'Invalid audio data' });
        return false;
      }

      pendingAudioData = audioData;

      (async () => {
        try {
          await setupOffscreenDocument();
          sendLog('Offscreen document is ready, sending init message.');

          // 少し待ってからメッセージを送信
          setTimeout(() => {
            // Essentiaファイルの正しいURLを生成
            const essentiaWasmUrl = chrome.runtime.getURL('essentia/dist/essentia-wasm.web.js');
            const essentiaCoreUrl = chrome.runtime.getURL('essentia/dist/essentia.js-core.umd.js');

            chrome.runtime.sendMessage({
              target: 'offscreen',
              type: 'init-sandbox',
              essentiaWasmUrl: essentiaWasmUrl,
              essentiaCoreUrl: essentiaCoreUrl
            }).catch(err => sendLog(`Error sending init message: ${err.message}`));
          }, 100);

          sendResponse({ success: true });
        } catch (error) {
          sendLog(`Error setting up offscreen: ${error.message}`);
          isProcessing = false;
          chrome.runtime.sendMessage({
            action: 'updateResult',
            error: `Setup Error: ${error.message}`
          }).catch(() => { });
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true; // 非同期レスポンスを有効にする

    case 'sandbox-ready':
      sendLog('Sandbox is ready. Sending audio data.');
      if (pendingAudioData) {
        sendLog(`Sending audio data - type: ${typeof pendingAudioData}, is array: ${Array.isArray(pendingAudioData)}, length: ${pendingAudioData.length}`);

        // 配列として受信したデータをそのまま送信
        let audioDataToSend = {
          data: pendingAudioData,
          type: 'Array'
        };

        sendLog(`Prepared audio data object with ${audioDataToSend.data.length} samples`);

        chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'audio-data',
          audioData: audioDataToSend
        }).catch(err => sendLog(`Error sending audio data: ${err.message}`));
        pendingAudioData = null;
      } else {
        sendLog('No pending audio data to send');
      }
      sendResponse({ success: true });
      return false;

    case 'analysisComplete':
      isProcessing = false;
      sendLog('Analysis complete. Sending result to popup.');
      const result = {
        key: msg.key,
        scale: msg.scale,
        bpm: msg.bpm,
        error: msg.error
      };
      chrome.runtime.sendMessage({
        action: 'updateResult',
        ...result
      }).catch(() => { });
      closeOffscreenDocument();
      sendResponse({ success: true });
      return false;

    case 'log':
      // ログメッセージをpopupに転送
      chrome.runtime.sendMessage(msg).catch(() => { });
      sendResponse({ success: true });
      return false;
  }

  sendResponse({ success: false, error: 'Unknown action' });
  return false;
});