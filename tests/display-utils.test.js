const assert = require('node:assert/strict');
const test = require('node:test');

const {
  formatApproximateBpm,
  formatKeyWithRelative
} = require('../display-utils.js');

test('major keys include their relative minor key', () => {
  assert.equal(formatKeyWithRelative('C', 'major'), 'C (Am)');
  assert.equal(formatKeyWithRelative('C#', 'major'), 'C# (A#m)');
  assert.equal(formatKeyWithRelative('Bb', 'major'), 'Bb (Gm)');
});

test('minor keys include their relative major key', () => {
  assert.equal(formatKeyWithRelative('A', 'minor'), 'Am (C)');
  assert.equal(formatKeyWithRelative('D#', 'minor'), 'D#m (F#)');
  assert.equal(formatKeyWithRelative('Eb', 'minor'), 'Ebm (Gb)');
});

test('unknown key formats retain the original result', () => {
  assert.equal(formatKeyWithRelative('H', 'major'), 'H major');
  assert.equal(formatKeyWithRelative('C', 'unknown'), 'C unknown');
});

test('BPM is rounded and marked as an estimate', () => {
  assert.equal(formatApproximateBpm(124.6, 'BPM:'), 'BPM ≈ 125');
  assert.equal(formatApproximateBpm(null, 'BPM'), null);
  assert.equal(formatApproximateBpm('not-a-number', 'BPM'), null);
});
