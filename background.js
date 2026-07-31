const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
const OFFSCREEN_DOCUMENT_URL = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);

let creatingOffscreenDocument = null;
let isProcessing = false;

async function hasOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [OFFSCREEN_DOCUMENT_URL]
  });
  return contexts.length > 0;
}

async function setupOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    return;
  }

  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK', 'IFRAME_SCRIPTING'],
      justification: 'Capture and preserve active-tab audio, then analyze it locally in a sandboxed iframe.'
    });
  }

  try {
    await creatingOffscreenDocument;
  } finally {
    creatingOffscreenDocument = null;
  }
}

async function closeOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    await chrome.offscreen.closeDocument();
  }
}

function sendResultToPopup(result) {
  chrome.runtime.sendMessage({
    target: 'popup',
    action: 'updateResult',
    ...result
  }).catch(() => { });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || msg.target !== 'background') {
    return false;
  }

  switch (msg.action) {
    case 'startAnalysis': {
      const detectionTime = Number(msg.detectionTime);
      if (!Number.isInteger(detectionTime) || detectionTime < 3 || detectionTime > 30) {
        sendResponse({ success: false, error: 'Detection time must be between 3 and 30 seconds.' });
        return false;
      }

      if (isProcessing) {
        sendResponse({ success: false, error: 'Already processing' });
        return false;
      }

      isProcessing = true;

      (async () => {
        try {
          await setupOffscreenDocument();
          const streamId = await chrome.tabCapture.getMediaStreamId();
          const response = await chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'start-analysis',
            streamId,
            detectionTime
          });

          if (!response?.success) {
            throw new Error(response?.error || 'Offscreen document did not accept the analysis request.');
          }

          sendResponse({ success: true });
        } catch (error) {
          isProcessing = false;
          await closeOffscreenDocument().catch(() => { });
          sendResultToPopup({ error: `Setup Error: ${error.message}` });
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
    }

    case 'analysisComplete': {
      isProcessing = false;
      sendResultToPopup({
        key: msg.key,
        scale: msg.scale,
        bpm: msg.bpm,
        error: msg.error
      });
      closeOffscreenDocument().catch(() => { });
      sendResponse({ success: true });
      return false;
    }

    default:
      sendResponse({ success: false, error: 'Unknown action' });
      return false;
  }
});
