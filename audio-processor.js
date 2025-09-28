class AudioProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    // We only need the first channel of the first input.
    const inputChannel = inputs[0][0];

    // Post the audio data back to the main thread (popup.js).
    // The data is sent as a Float32Array.
    if (inputChannel) {
      this.port.postMessage(inputChannel);
    }

    // Keep the processor alive.
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);