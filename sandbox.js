function sendLog(message) {
  parent.postMessage({ action: 'log', source: 'sandbox', message: message }, '*');
}

let essentia;

window.addEventListener('message', async function (event) {
  if (event.source !== parent || !event.data || typeof event.data !== 'object') {
    return;
  }

  try {
    if (event.data.type === 'init-sandbox') {
      sendLog('Received init message.');

      // 重複チェック
      if (essentia) {
        sendLog('Essentia already initialized, sending ready signal.');
        parent.postMessage({ type: 'ready' }, '*');
        return;
      }

      try {
        // EssentiaWASMが利用可能か確認
        if (typeof EssentiaWASM !== 'function') {
          throw new Error('EssentiaWASM function not found');
        }

        sendLog('Initializing WASM module...');
        // EssentiaWASMを直接呼び出して初期化
        const wasmModule = await EssentiaWASM();
        sendLog('WASM module initialized. Checking for Essentia...');

        // Essentiaクラスが利用可能か確認
        if (typeof Essentia !== 'function') {
          throw new Error('Essentia class not found');
        }

        sendLog('Instantiating Essentia...');
        // Essentiaインスタンスを作成
        essentia = new Essentia(wasmModule);
        sendLog('Essentia instantiated successfully.');
        sendLog('Essentia version: ' + essentia.version);
        sendLog('Available algorithms: ' + essentia.algorithmNames.length);

        parent.postMessage({ type: 'ready' }, '*');
        return;
      } catch (initError) {
        sendLog(`Initialization error: ${initError.message}`);
        parent.postMessage({
          type: 'result',
          error: `Initialization Error: ${initError.message}`
        }, '*');
        return;
      }
    }

    if (event.data.type === 'audio-data') {
      sendLog('Received audio data. Starting analysis...');
      if (!essentia) {
        throw new Error('Essentia not initialized.');
      }

      const audioData = event.data.audioData;
      sendLog(`Audio data received: ${typeof audioData}`);
      sendLog(`Audio data constructor: ${audioData ? audioData.constructor.name : 'null'}`);
      sendLog(`Audio data keys: ${audioData ? Object.keys(audioData).join(', ') : 'none'}`);

      if (!audioData) {
        throw new Error('No audio data received');
      }

      let processedAudioData;

      // 新しい形式の処理
      if (audioData.type === 'Float32Array' && audioData.buffer) {
        sendLog('Reconstructing Float32Array from ArrayBuffer');
        processedAudioData = new Float32Array(audioData.buffer);
        sendLog(`Reconstructed Float32Array with length: ${processedAudioData.length}`);
      } else if (audioData.type === 'Array' && audioData.data) {
        sendLog(`Converting array data to Float32Array: ${audioData.data.length} elements`);
        sendLog(`First few elements: ${audioData.data.slice(0, 5).join(', ')}`);
        processedAudioData = new Float32Array(audioData.data);
        sendLog(`Converted array to Float32Array with length: ${processedAudioData.length}`);
      }
      // 従来の形式の処理
      else if (audioData instanceof Float32Array) {
        processedAudioData = audioData;
        sendLog(`Direct Float32Array with length: ${audioData.length}`);
      } else if (Array.isArray(audioData) || (audioData.buffer && audioData.byteLength)) {
        processedAudioData = new Float32Array(audioData);
        sendLog(`Converted to Float32Array with length: ${processedAudioData.length}`);
      } else {
        sendLog(`Attempting to handle unknown format: ${JSON.stringify(Object.keys(audioData))}`);
        throw new Error(`Unsupported audio data format: ${typeof audioData}`);
      }

      sendLog(`Processing ${processedAudioData.length} samples`);

      if (processedAudioData.length === 0) {
        throw new Error('Audio data is empty');
      }

      try {
        let vector;
        try {
          // Float32Arrayをstd::vector<float>に変換
          vector = essentia.arrayToVector(processedAudioData);
          sendLog('Audio data converted to vector.');

          // キー検出
          const keyResult = essentia.KeyExtractor(vector);
          sendLog(`KeyExtractor completed. Result: ${keyResult.key} ${keyResult.scale}`);

          // BPM検出のための準備
          sendLog('Starting BPM detection...');

          // BPM検出用アルゴリズム
          let bpmResult = null;
          try {
            // RhythmExtractor2013アルゴリズムを使用
            const rhythmResult = essentia.RhythmExtractor2013(vector);
            bpmResult = rhythmResult.bpm;
            sendLog(`BPM detection completed. BPM: ${bpmResult}`);
          } catch (bpmError) {
            sendLog(`BPM detection failed, trying alternative method: ${bpmError.message}`);

            // 代替方法: PercivalBpmEstimator
            try {
              const bpmEstimate = essentia.PercivalBpmEstimator(vector);
              bpmResult = bpmEstimate.bpm;
              sendLog(`Alternative BPM detection completed. BPM: ${bpmResult}`);
            } catch (altBpmError) {
              sendLog(`Alternative BPM detection also failed: ${altBpmError.message}`);
              // BPMは取得できないが、キーは返す
            }
          }

          parent.postMessage({
            type: 'result',
            key: keyResult.key,
            scale: keyResult.scale,
            bpm: bpmResult
          }, '*');
        } finally {
          // WASM側に確保されたベクターは成功・失敗にかかわらず解放する
          if (vector) {
            vector.delete();
          }
        }

      } catch (analysisError) {
        sendLog(`Analysis error: ${analysisError.message}`);
        parent.postMessage({
          type: 'result',
          error: `Analysis Error: ${analysisError.message}`
        }, '*');
      }
    }
  } catch (error) {
    sendLog(`ERROR: ${error.message}`);
    parent.postMessage({
      type: 'result',
      error: `Sandbox Error: ${error.message}`
    }, '*');
  }
});
