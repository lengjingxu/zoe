import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { keyFor, payload, push, resolveToken, ossSign } from '../src/publish.mjs';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function tempImage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoe-publish-'));
  const file = path.join(dir, 'wallpaper_1_d1.jpg');
  fs.writeFileSync(file, Buffer.from(png, 'base64'));
  return file;
}

test('a picture is keyed by its hour, in milliseconds', () => {
  assert.equal(keyFor(1792476299005), '1792476299005.jpg');
  assert.equal(keyFor('1792476299005.7'), '1792476299005.jpg');
  assert.throws(() => keyFor(0), /bad timestamp/);
  assert.throws(() => keyFor('later'), /bad timestamp/);
});

test('the payload carries the panel fields and never the prompt', () => {
  const body = payload({ at: 1792476299005, topic: 'a long hour', scene: 'shanghai-lujiazui', model: 'gpt-image-2.5', fresh: true });
  assert.equal(body.key, '1792476299005.jpg');
  assert.equal(body.meta.topic, 'a long hour');
  assert.equal(body.meta.scene, 'shanghai-lujiazui');
  assert.equal(body.meta.fresh, true);
  assert.equal(Object.keys(body).sort().join(','), 'key,meta');
});

test('a topic longer than the wall takes is cut, not refused', () => {
  const body = payload({ at: 1, topic: 'x'.repeat(900) });
  assert.equal(body.meta.topic.length, 300);
});

test('the token comes from the config, then the environment, then a clear error', () => {
  assert.equal(resolveToken({ token: 'abc' }), 'abc');
  process.env.ZOE_PUBLISH_TEST_TOKEN = 'fromenv';
  assert.equal(resolveToken({ token_env: 'ZOE_PUBLISH_TEST_TOKEN' }), 'fromenv');
  assert.throws(() => resolveToken({ token_env: 'ZOE_PUBLISH_MISSING_TOKEN' }), /no publish token/);
});

