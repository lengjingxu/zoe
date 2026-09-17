import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolve, providerOf } from '../src/models.mjs';
import { load, save, prune, remember, rotate } from '../src/state.mjs';

const config = { models: { priority: ['xai/grok-imagine-image-2.0', 'openai/gpt-image-2'] }, providers: [] };
const client = (ids) => ids.map((id) => ({ id, provider_id: id.split('/')[0] }));

test('grok wins when the client has it', () => {
  const pick = resolve(config, client(['openai/gpt-image-2', 'xai/grok-imagine-image-2.0']));
  assert.equal(pick.id, 'xai/grok-imagine-image-2.0');
  assert.equal(pick.provider_id, 'xai');
  assert.deepEqual(pick.skipped, []);
});

test('gpt-image-2 is used only when grok is missing, and it says so', () => {
  const pick = resolve(config, client(['openai/gpt-image-2', 'qwen/qwen-image-3']));
  assert.equal(pick.id, 'openai/gpt-image-2');
  assert.deepEqual(pick.skipped, ['xai/grok-imagine-image-2.0']);
});

test('a wildcard follows the newest variant of a family', () => {
  const wild = { ...config, models: { priority: ['xai/grok-imagine-image*'] } };
  assert.equal(resolve(wild, client(['xai/grok-imagine-image', 'xai/grok-imagine-image-2.0'])).id, 'xai/grok-imagine-image-2.0');
});

test('nothing available is an error, not a quiet downgrade', () => {
  assert.throws(() => resolve(config, client(['some/other-model'])), /none of the priority models/);
});

test('the reuse pool drops what expired or went missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoe-state-'));
  const keep = path.join(dir, 'keep.jpg');
  fs.writeFileSync(keep, 'x');
  const state = {
    history: [],
    props: [],
    pool: [
      { image: keep, expires_at: 2000 },
      { image: path.join(dir, 'gone.jpg'), expires_at: 2000 },
      { image: keep, expires_at: 1000 }
    ]
  };
  prune(state, 1500, 6);
  assert.deepEqual(state.pool.map((p) => p.image), [keep]);
});

test('remembering a run keeps the desk props for next time', () => {
  const state = { history: [], props: [], pool: [] };
  remember(state, { at: 100, image: '/x/a.jpg', topic: 't', props: ['145x157x236'] }, { now: 100, reuseHours: 6 });
  remember(state, { at: 200, image: '/x/b.jpg', topic: 't', props: ['145x157x236'] }, { now: 200, reuseHours: 6 });
  assert.equal(state.history.length, 2);
  assert.equal(state.pool.length, 2);
  assert.equal(state.pool[0].expires_at, 100 + 6 * 3600e3);
  assert.deepEqual(state.props, [{ name: '145x157x236', first: 100, last: 200, count: 2 }]);
});

test('state on disk survives a round trip and refuses to be clobbered', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoe-state-'));
  const file = path.join(dir, 'state.json');
  assert.deepEqual(load(file), { version: 1, history: [], props: [], pool: [] });
  save(file, { version: 1, history: [{ at: 1 }], props: [], pool: [] });
  assert.equal(load(file).history.length, 1);
  fs.writeFileSync(file, '{ truncated');
  assert.throws(() => load(file), /refusing to overwrite/);
});

test('rotation prefers whatever was used longest ago', () => {
  const history = [{ scene: 'a' }, { scene: 'b' }, { scene: 'a' }];
  assert.equal(rotate(['a', 'b', 'c'], history, 'scene'), 'c');
  assert.equal(rotate(['a', 'b'], history, 'scene'), 'b');
});

