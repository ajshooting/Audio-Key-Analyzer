const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
const OFFSCREEN_DOCUMENT_URL = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
const ANALYSIS_STATE_KEY = 'analysisState';
const ACTIVE_STATUSES = new Set(['starting', 'capturing', 'computing']);

let creatingOffscreenDocument = null;
let startOperation = null;

function defaultAnalysisState() {
  return { status: 'idle' };
}

async function getStoredAnalysisState() {
  const stored = await chrome.storage.session.get(ANALYSIS_STATE_KEY);
  return stored[ANALYSIS_STATE_KEY] || defaultAnalysisState();
}

function broadcastAnalysisState(state) {
  chrome.runtime.sendMessage({
    target: 'popup',
    action: 'analysisStateChanged',
    state
  }).catch(() => { });
}

async function setAnalysisState(state) {
  const nextState = {
    ...state,
    updatedAt: Date.now()
  };
  await chrome.storage.session.set({ [ANALYSIS_STATE_KEY]: nextState });
  broadcastAnalysisState(nextState);
  return nextState;
}

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

function interruptedState(state, message) {
  return {
    status: 'error',
    detectionTime: state.detectionTime,
    startedAt: state.startedAt,
    finishedAt: Date.now(),
    error: message
  };
}

async function reconcileAnalysisState() {
  const storedState = await getStoredAnalysisState();
  if (!ACTIVE_STATUSES.has(storedState.status)) {
    return storedState;
  }

  const offscreenExists = await hasOffscreenDocument();
  const startingRecently = storedState.status === 'starting'
    && Date.now() - storedState.startedAt < 10000;

  if (!offscreenExists) {
    if (startingRecently) {
      return storedState;
    }
    return setAnalysisState(interruptedState(
      storedState,
      'The analysis was interrupted because its background document was closed.'
    ));
  }

  try {
    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'get-analysis-state'
    });
    const offscreenState = response?.state;

    if (!response?.success || !offscreenState) {
      return storedState;
    }

    if (offscreenState.status === 'completed' || offscreenState.status === 'error') {
      const reconciledState = await setAnalysisState({
        ...offscreenState,
        detectionTime: storedState.detectionTime,
        startedAt: storedState.startedAt,
        finishedAt: offscreenState.finishedAt || Date.now()
      });
      await closeOffscreenDocument().catch(() => { });
      return reconciledState;
    }

    if (ACTIVE_STATUSES.has(offscreenState.status) && offscreenState.status !== storedState.status) {
      return setAnalysisState({
        ...storedState,
        status: offscreenState.status
      });
    }
  } catch {
    return storedState;
  }

  return storedState;
}

async function performStartAnalysis(detectionTime) {
  const currentState = await reconcileAnalysisState();
  if (ACTIVE_STATUSES.has(currentState.status)) {
    return { success: false, error: 'Already processing', state: currentState };
  }

  const startedAt = Date.now();
  await setAnalysisState({
    status: 'starting',
    detectionTime,
    startedAt
  });

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

    const state = await getStoredAnalysisState();
    if (state.status === 'starting') {
      const capturingState = await setAnalysisState({
        ...state,
        status: 'capturing'
      });
      return { success: true, state: capturingState };
    }
    return { success: true, state };
  } catch (error) {
    const errorState = await setAnalysisState({
      status: 'error',
      detectionTime,
      startedAt,
      finishedAt: Date.now(),
      error: `Setup Error: ${error.message}`
    });
    await closeOffscreenDocument().catch(() => { });
    return { success: false, error: error.message, state: errorState };
  }
}

async function startAnalysis(detectionTime) {
  if (startOperation) {
    await startOperation.catch(() => { });
    const state = await getStoredAnalysisState();
    return { success: false, error: 'Already processing', state };
  }

  startOperation = performStartAnalysis(detectionTime);
  try {
    return await startOperation;
  } finally {
    startOperation = null;
  }
}

async function updateAnalysisStatus(status) {
  if (!ACTIVE_STATUSES.has(status)) {
    throw new Error('Invalid analysis status.');
  }

  const state = await getStoredAnalysisState();
  if (!ACTIVE_STATUSES.has(state.status)) {
    return state;
  }

  return setAnalysisState({
    ...state,
    status
  });
}

async function completeAnalysis(message) {
  const previousState = await getStoredAnalysisState();
  const error = typeof message.error === 'string' && message.error.length > 0
    ? message.error
    : null;
  const completedState = {
    status: error ? 'error' : 'completed',
    detectionTime: previousState.detectionTime,
    startedAt: previousState.startedAt,
    finishedAt: Date.now()
  };

  if (error) {
    completedState.error = error;
  } else {
    completedState.result = {
      key: message.key,
      scale: message.scale,
      bpm: message.bpm
    };
  }

  return setAnalysisState(completedState);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || msg.target !== 'background') {
    return false;
  }

  let operation;

  switch (msg.action) {
    case 'startAnalysis': {
      const detectionTime = Number(msg.detectionTime);
      if (!Number.isInteger(detectionTime) || detectionTime < 3 || detectionTime > 30) {
        sendResponse({ success: false, error: 'Detection time must be between 3 and 30 seconds.' });
        return false;
      }
      operation = startAnalysis(detectionTime);
      break;
    }
    case 'getAnalysisState':
      operation = reconcileAnalysisState().then(state => ({ success: true, state }));
      break;
    case 'analysisStatus':
      operation = updateAnalysisStatus(msg.status).then(state => ({ success: true, state }));
      break;
    case 'analysisComplete':
      operation = completeAnalysis(msg).then(state => ({ success: true, state }));
      break;
    default:
      sendResponse({ success: false, error: 'Unknown action' });
      return false;
  }

  const closeAfterResponse = msg.action === 'analysisComplete';
  operation
    .then(response => {
      sendResponse(response);
      if (closeAfterResponse) {
        closeOffscreenDocument().catch(() => { });
      }
    })
    .catch(error => sendResponse({ success: false, error: error.message }));
  return true;
});
