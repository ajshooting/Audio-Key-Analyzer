class AudioProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const inputChannels = inputs[0];
    if (!inputChannels || inputChannels.length === 0) {
      return true;
    }

    const leftChannel = inputChannels[0];
    const rightChannel = inputChannels[1];
    const monoChannel = new Float32Array(leftChannel.length);

    if (rightChannel) {
      for (let i = 0; i < leftChannel.length; i++) {
        monoChannel[i] = (leftChannel[i] + rightChannel[i]) * 0.5;
      }
    } else {
      monoChannel.set(leftChannel);
    }

    // Post the mono audio data back to the offscreen document.
    this.port.postMessage(monoChannel, [monoChannel.buffer]);

    // Keep the processor alive.
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
