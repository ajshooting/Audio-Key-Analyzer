const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function createSandboxHarness() {
  const messages = [];
  const listeners = new Map();
  const parent = {
    postMessage(message) {
      messages.push(message);
    }
  };
  let vectorDeleted = false;

  class MockEssentia {
    constructor() {
      this.version = 'test';
      this.algorithmNames = [];
    }

    arrayToVector(audioData) {
      assert.ok(audioData instanceof Float32Array);
      return {
        delete() {
          vectorDeleted = true;
        }
      };
    }

    KeyExtractor() {
      return { key: 'C', scale: 'major' };
    }

    RhythmExtractor2013() {
      throw new Error('primary estimator unavailable');
    }

    PercivalBpmEstimator() {
      return { bpm: 128 };
    }
  }

  const context = {
    console,
    Float32Array,
    parent,
    Essentia: MockEssentia,
    EssentiaWASM: async () => ({}),
    document: {},
    window: {
      addEventListener(type, listener) {
        listeners.set(type, listener);
      }
    }
  };

  const source = fs.readFileSync(path.join(ROOT, 'sandbox.js'), 'utf8');
  vm.runInNewContext(source, context, { filename: 'sandbox.js' });

  return {
    parent,
    messages,
    get messageListener() {
      return listeners.get('message');
    },
    wasVectorDeleted() {
      return vectorDeleted;
    }
  };
}

test('sandbox ignores messages that are not sent by its parent', async () => {
  const harness = createSandboxHarness();

  await harness.messageListener({
    source: {},
    data: { type: 'init-sandbox' }
  });

  assert.deepEqual(harness.messages, []);
});

test('sandbox returns the numeric Percival BPM and releases the WASM vector', async () => {
  const harness = createSandboxHarness();

  await harness.messageListener({
    source: harness.parent,
    data: { type: 'init-sandbox' }
  });
  assert.ok(harness.messages.some(message => message.type === 'ready'));

  await harness.messageListener({
    source: harness.parent,
    data: {
      type: 'audio-data',
      audioData: {
        type: 'Float32Array',
        buffer: new Float32Array([0, 0.5, -0.5]).buffer
      }
    }
  });

  const result = harness.messages.find(message => message.type === 'result');
  assert.equal(result.type, 'result');
  assert.equal(result.key, 'C');
  assert.equal(result.scale, 'major');
  assert.equal(result.bpm, 128);
  assert.equal(harness.wasVectorDeleted(), true);
});
