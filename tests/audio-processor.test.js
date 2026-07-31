const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function loadAudioProcessor() {
  let registeredProcessor;
  let postedMessage;

  class FakeAudioWorkletProcessor {
    constructor() {
      this.port = {
        postMessage(data, transfer) {
          postedMessage = { data, transfer };
        }
      };
    }
  }

  const context = {
    AudioWorkletProcessor: FakeAudioWorkletProcessor,
    Float32Array,
    registerProcessor(name, processorClass) {
      registeredProcessor = { name, processorClass };
    }
  };

  const source = fs.readFileSync(path.join(ROOT, 'audio-processor.js'), 'utf8');
  vm.runInNewContext(source, context, { filename: 'audio-processor.js' });

  return {
    createProcessor() {
      return new registeredProcessor.processorClass();
    },
    getPostedMessage() {
      return postedMessage;
    },
    getName() {
      return registeredProcessor.name;
    }
  };
}

test('audio worklet averages stereo channels and transfers mono data', () => {
  const loaded = loadAudioProcessor();
  const processor = loaded.createProcessor();

  const keepAlive = processor.process([[
    new Float32Array([1, -1, 0.5]),
    new Float32Array([-1, 1, 0.25])
  ]], [], {});

  const posted = loaded.getPostedMessage();
  assert.equal(loaded.getName(), 'audio-processor');
  assert.equal(keepAlive, true);
  assert.deepEqual(Array.from(posted.data), [0, 0, 0.375]);
  assert.equal(posted.transfer.length, 1);
  assert.equal(posted.transfer[0], posted.data.buffer);
});

test('audio worklet preserves an existing mono channel', () => {
  const loaded = loadAudioProcessor();
  const processor = loaded.createProcessor();

  processor.process([[
    new Float32Array([0.25, -0.5, 1])
  ]], [], {});

  assert.deepEqual(Array.from(loaded.getPostedMessage().data), [0.25, -0.5, 1]);
});
