import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { frameBytes, endpoint, draw } from '../src/proxy.mjs';

const TINY_JPEG =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAx' +
  'NDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEA' +
  'AD8AKp//2Q==';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoe-proxy-'));
const tiny = path.join(dir, 'tiny.jpg');
fs.writeFileSync(tiny, Buffer.from(TINY_JPEG, 'base64'));

test('a still under the limit goes up as it is', () => {
  const got = frameBytes(tiny);
  assert.equal(got.type, 'image/jpeg');
  assert.ok(got.bytes.equals(fs.readFileSync(tiny)), 'the bytes are the file, not a re-encode');
});

test('a still past the limit is shrunk before it is encoded', () => {
  const big = path.join(dir, 'big.bmp');
  execFileSync('sips', ['-Z', '2000', '-s', 'format', 'bmp', tiny, '--out', big], { stdio: 'ignore' });
  assert.ok(fs.statSync(big).size > 1e6, 'the fixture really is past the limit');
  const got = frameBytes(big);
  assert.equal(got.type, 'image/jpeg', 'what goes up is a jpeg, whatever came in');
  assert.ok(got.bytes.length < fs.statSync(big).size / 8, 'the body that goes up is a fraction of the file');
});

process.env.ZOE_TEST_BASE = 'http://10.0.0.1:8080/v1/';
process.env.ZOE_TEST_KEY = 'sk-test';
const provider = (extra) => ({
  providers: [{ id: 'proxy', api_key_env: 'ZOE_TEST_KEY', models: ['m'], ...extra }]
});

test('the address comes from the environment when the provider names a variable', () => {
  assert.equal(endpoint(provider({ base_url_env: 'ZOE_TEST_BASE' }), 'm').base, 'http://10.0.0.1:8080/v1');
});

test('a gateway with a public address can still be written in the file', () => {
  assert.equal(endpoint(provider({ base_url: 'http://localhost:1234/v1' }), 'm').base, 'http://localhost:1234/v1');
});

test('an address that resolves to nothing stops the run and names the variable', () => {
  assert.throws(() => endpoint(provider({ base_url_env: 'ZOE_TEST_NOTHING' }), 'm'), /ZOE_TEST_NOTHING/);
  assert.throws(() => endpoint(provider({}), 'm'), /no address/);
});

test('makeSeamlessLoop safely returns original buffer when input cannot be processed', async () => {
  const { makeSeamlessLoop } = await import('../src/proxy.mjs');
  const dummy = Buffer.from('not-a-video-stream');
  const out = makeSeamlessLoop(dummy);
  assert.ok(Buffer.isBuffer(out));
  assert.equal(out.toString(), dummy.toString());
});

test('a chat-image model returns the image embedded in the message', async () => {
  const url = 'data:image/jpeg;base64,' + TINY_JPEG;
  const original = global.fetch;
  global.fetch = async () => ({
    ok: true,
    text: async () => JSON.stringify({ choices: [{ message: { images: [{ image_url: { url } }] } }] })
  });
  try {
    const cfg = {
      size: '1792x1024',
      models: { priority: ['gemini-3.1-flash-image'], chat_image: ['gemini-3.1-flash-image'] },
      providers: [{ id: 'proxy', api_key_env: 'ZOE_TEST_KEY', base_url: 'http://localhost:1234/v1', models: ['gemini-3.1-flash-image'] }]
    };
    const drawn = await draw(cfg, { prompt: 'test picture' });
    assert.equal(drawn.model, 'gemini-3.1-flash-image');
    assert.ok(drawn.buffer.length > 10);
  } finally {
    global.fetch = original;
  }
});
