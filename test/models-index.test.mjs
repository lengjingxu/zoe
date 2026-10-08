import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, configured } from '../src/models.mjs';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const cfg = {
  models: { priority: ['gpt-image-2', 'gpt-image-2.5'] },
  providers: [{ id: 'codex', api_key_env: 'X', base_url: 'http://x', models: [] }]
};

test('configured reads only the providers list when there is no index', () => {
  assert.deepEqual(configured(cfg, undefined).map((m) => m.id), []);
  assert.deepEqual(configured(cfg, { models: [] }).map((m) => m.id), []);
});

test('configured joins in models the gateway knows about, filtered by provider', () => {
  const index = {
    models: [
      { id: 'gpt-image-2', provider_id: 'codex' },
      { id: 'gpt-image-2.5', provider_id: 'codex' },
      { id: 'gpt-image-2.5-flare', provider_id: 'codex' },
      { id: 'grok-imagine-image', provider_id: 'xai' },
      { id: 'qwen-image-3.0', provider_id: 'yun' }
    ]
  };
  const ids = configured(cfg, index).map((m) => m.id);
  assert.ok(ids.includes('gpt-image-2'));
  assert.ok(ids.includes('gpt-image-2.5'));
  assert.ok(ids.includes('gpt-image-2.5-flare'));
  assert.ok(!ids.includes('grok-imagine-image'), 'other providers are kept out');
  assert.ok(!ids.includes('qwen-image-3.0'), 'providers not in the config are kept out');
});

test('resolve uses the index to reach a model that the config never named', () => {
  const index = { models: [{ id: 'gpt-image-2.5-flare', provider_id: 'codex' }] };
  const pick = resolve({ ...cfg, models: { priority: ['gpt-image-2.5-flare'] } }, undefined, { index });
  assert.equal(pick.id, 'gpt-image-2.5-flare');
  assert.equal(pick.provider_id, 'codex');
  assert.equal(pick.index_used, true);
});

test('resolve without an index still throws when the id is not configured', () => {
  assert.throws(
    () => resolve({ ...cfg, models: { priority: ['gpt-image-2.5-flare'] } }, undefined, { index: undefined }),
    /none of the priority models/
  );
});

test('models_index classifies and groups the live gateway list', async () => {
  const { read } = await import('../src/models_index.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoe-midx-'));
  const fixture = {
    at: Date.now(),
    models: [
      { id: 'gpt-image-2.5', provider_id: 'openai' },
      { id: 'gpt-image-2.5-flare', provider_id: 'openai' },
      { id: 'qwen-image-3.0', provider_id: 'aliyun' },
      { id: 'wan2.7-image-pro', provider_id: 'aliyun' },
      { id: 'grok-imagine-image', provider_id: 'xai' },
      { id: 'grok-imagine-video-1.5', provider_id: 'xai' },
      { id: 'gemini-3.7-pro-low', provider_id: 'antigravity' },
      { id: 'random-text-model', provider_id: 'openai' }
    ]
  };
  fs.writeFileSync(path.join(dir, 'models.json'), JSON.stringify(fixture, null, 2));
  try {
    const got = read(dir);
    assert.deepEqual([...got.image].sort(), [
      'gpt-image-2.5', 'gpt-image-2.5-flare', 'grok-imagine-image', 'qwen-image-3.0', 'wan2.7-image-pro'
    ]);
    assert.deepEqual(got.video, ['grok-imagine-video-1.5']);
    assert.equal(got.by_provider['openai'].length, 3);
    assert.equal(got.by_provider['aliyun'].length, 2);
    assert.equal(got.by_provider['antigravity'].length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test('a codex-only config keeps grok / qwen / gemini out of the candidate set', () => {
  const codexOnly = {
    models: { priority: ['gpt-image-2.5*', 'gpt-image-2', 'gpt-image-1.5'] },
    providers: [{ id: 'codex', api_key_env: 'X', base_url: 'http://x', models: [] }]
  };
  const index = {
    models: [
      { id: 'gpt-image-2.5', provider_id: 'codex' },
      { id: 'gpt-image-2', provider_id: 'codex' },
      { id: 'grok-imagine-image', provider_id: 'xai' },
      { id: 'qwen-image-3.0', provider_id: 'yun' },
      { id: 'gemini-3.1-flash-image', provider_id: 'antigravity' },
      { id: 'wan2.7-image-pro', provider_id: 'aliyun' }
    ]
  };
  const pick = resolve(codexOnly, undefined, { index });
  assert.equal(pick.id, 'gpt-image-2.5');
  assert.equal(pick.provider_id, 'codex');
  const ids = pick.available;
  assert.ok(!ids.includes('grok-imagine-image'), 'grok is filtered out by the codex provider');
  assert.ok(!ids.includes('qwen-image-3.0'), 'qwen is filtered out');
  assert.ok(!ids.includes('gemini-3.1-flash-image'), 'gemini is filtered out');
  assert.ok(!ids.includes('wan2.7-image-pro'), 'wan is filtered out');
});

test('configured keeps an openai-vendor model that survived the codex alias', () => {
  const codexOnly = {
    providers: [{ id: 'codex', api_key_env: 'X', base_url: 'http://x', models: [] }]
  };
  // Pretend refresh() already wrote a fixture where openai was renamed to codex.
  const index = { models: [{ id: 'gpt-image-2.5-flare', provider_id: 'codex', vendor: 'openai' }] };
  const ids = configured(codexOnly, index).map((m) => m.id);
  assert.ok(ids.includes('gpt-image-2.5-flare'), 'the codex-renamed openai model is reachable');
});
