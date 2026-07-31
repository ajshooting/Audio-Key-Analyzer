const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

test('manifest declares the required compatibility and least-privilege settings', () => {
  const manifest = readJson('manifest.json');

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.minimum_chrome_version, '116');
  assert.deepEqual([...manifest.permissions].sort(), ['offscreen', 'storage', 'tabCapture']);
  assert.deepEqual(manifest.sandbox.pages, ['sandbox.html']);
  assert.equal('web_accessible_resources' in manifest, false);
});

test('popup localization keys exist in every locale', () => {
  const popup = fs.readFileSync(path.join(ROOT, 'popup.html'), 'utf8');
  const keys = [...popup.matchAll(/data-i18n="([^"]+)"/g)].map(match => match[1]);

  assert.ok(keys.length > 0);
  for (const locale of ['ja', 'en']) {
    const messages = readJson(`_locales/${locale}/messages.json`);
    for (const key of keys) {
      assert.ok(messages[key]?.message, `${key} is missing from the ${locale} locale`);
    }
  }
});
