import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { frameBytes } from '../src/proxy.mjs';

const TINY_JPEG =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAx' +
  'NDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEA' +
  'AD8AKp//2Q==';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoe-frame-'));
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
