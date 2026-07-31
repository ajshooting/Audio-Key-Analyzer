const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('audio capture and buffering stay outside the popup and service worker', () => {
  const popup = read('popup.js');
  const background = read('background.js');
  const offscreen = read('offscreen.js');

  assert.doesNotMatch(popup, /tabCapture\.capture|AudioContext|AudioWorkletNode/);
  assert.doesNotMatch(background, /pendingAudioData|audioData\s*:/);
  assert.doesNotMatch(`${popup}\n${background}\n${offscreen}`, /Array\.from\(audioBuffer\)/);
  assert.match(background, /tabCapture\.getMediaStreamId\(\)/);
  assert.match(offscreen, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(offscreen, /\[audioData\.buffer\]/);
});

test('cross-context messages validate their intended source', () => {
  const offscreen = read('offscreen.js');
  const sandbox = read('sandbox.js');

  assert.match(offscreen, /event\.source !== iframe\.contentWindow/);
  assert.match(sandbox, /event\.source !== parent/);
});

test('service worker state contains no audio and uses session storage', () => {
  const background = read('background.js');

  assert.match(background, /chrome\.storage\.session\.get/);
  assert.match(background, /chrome\.storage\.session\.set/);
  assert.doesNotMatch(background, /let isProcessing|pendingAudioData/);
});

test('popup delegates key and BPM formatting to the tested display helpers', () => {
  const popup = read('popup.js');

  assert.match(popup, /AudioKeyDisplay\.formatKeyWithRelative/);
  assert.match(popup, /AudioKeyDisplay\.formatApproximateBpm/);
});

test('tab playback is restored before the analysis worklet is initialized', () => {
  const offscreen = read('offscreen.js');
  const playbackContext = offscreen.indexOf("new AudioContext({ latencyHint: 'interactive' })");
  const workletInitialization = offscreen.indexOf('analysisContext.audioWorklet.addModule');

  assert.ok(playbackContext >= 0);
  assert.ok(workletInitialization > playbackContext);
  assert.match(offscreen, /playbackGain\.gain\.linearRampToValueAtTime\(1/);
  assert.match(offscreen, /fadeOutPlayback\(playbackContext, playbackGain\)/);
  assert.doesNotMatch(offscreen, /analysisSource\.connect\(analysisContext\.destination\)/);
});
