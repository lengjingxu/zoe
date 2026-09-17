import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { collect } from '../src/sources.mjs';
import { loadConfig } from '../src/config.mjs';

const now = Date.parse('2026-09-17T22:00:00+08:00');
const at = (minutesAgo) => new Date(now - minutesAgo * 60000).toISOString();

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zoe-test-'));
  const codex = path.join(root, 'codex-home', 'sessions', '2026', '09', '17');
  fs.mkdirSync(codex, { recursive: true });
  const cc = path.join(root, 'claude', 'projects', '-Users-me-codepro-demo');
  fs.mkdirSync(cc, { recursive: true });
  const memory = path.join(root, 'maker-memory', 'Users-me-Desktop-codepro-demo');
  fs.mkdirSync(memory, { recursive: true });
  fs.writeFileSync(
    path.join(memory, 'note.md'),
    '---\ntitle: 优惠券分类口径\ndescription: 低于7折算混补\n---\nbody\n'
  );
  return { root, codex, cc, memory };
}

function rollout(file, rows) {
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

const userTurn = (text, minutesAgo) => ({
  timestamp: at(minutesAgo),
  type: 'event_msg',
  payload: { type: 'item_completed', completed_at_ms: now - minutesAgo * 60000, item: { type: 'UserMessage', content: [{ text }] } }
});

test('reads only the window, and only the part a human typed', async () => {
  const { root, codex, cc, memory } = sandbox();
  rollout(path.join(codex, 'rollout-x.jsonl'), [
    { timestamp: at(600), type: 'session_meta', payload: { cwd: '/Users/me/Desktop/codepro/demo' } },
    userTurn('这是六个小时前说的话，不该出现', 360),
    userTurn('# AGENTS.md instructions\n<INSTRUCTIONS>不要提交</INSTRUCTIONS>', 31),
    userTurn('<environment_context>\n  <cwd>/Users/me/Desktop/codepro/demo</cwd>\n</environment_context>', 30),
    userTurn('我们把这个项目改成月复盘', 30),
    userTurn('已经发布体验版了 <cindy-host-image-references> The JSON lines below are attached', 20)
  ]);
  fs.writeFileSync(
    path.join(cc, 'abc.jsonl'),
    [
      JSON.stringify({ type: 'user', timestamp: at(10), cwd: '/Users/me/Desktop/codepro/demo', message: { content: '把电梯长杆的尺寸量一下 145x157x236' } }),
      JSON.stringify({ type: 'assistant', timestamp: at(9), message: { content: 'ok' } }),
      JSON.stringify({ type: 'user', timestamp: at(400), message: { content: '太老了' } })
    ].join('\n')
  );

  const out = await collect(loadConfig(), {
    hours: 1,
    now,
    found: { cindy: null, codexHomes: [path.join(root, 'codex-home')], ccHomes: [path.join(root, 'claude')], memoryDirs: [path.dirname(memory)] }
  });

  const texts = out.items.map((i) => i.text);
  assert.equal(texts.length, 3, JSON.stringify(texts));
  assert.ok(!texts.some((t) => t.includes('六个小时前')), 'older turns must be dropped');
  assert.ok(!texts.some((t) => t.includes('太老了')), 'older claude code turns must be dropped');
  assert.ok(!texts.some((t) => t.includes('AGENTS.md')), 'harness scaffolding must be dropped');
  assert.ok(texts.some((t) => t.includes('月复盘')), 'the typed sentence must survive');
  assert.ok(texts.some((t) => t.includes('145x157x236')), 'claude code turns must be read');
  assert.ok(!texts.some((t) => t.includes('cindy-host-image-references')), 'inline harness blocks must be stripped');
  assert.equal(out.items[0].project, 'demo');
  assert.equal(out.memory.length, 1);
  assert.equal(out.memory[0].title, '优惠券分类口径');
});

test('one sentence said in both places is kept once, from the client', async () => {
  const { root, codex, memory } = sandbox();
  const db = path.join(root, 'cindy-test.db');
  execFileSync('sqlite3', [
    db,
    'CREATE TABLE sessions (id text primary key, title text);\n' +
      'CREATE TABLE messages (id text primary key, session_id text, role text, content text, created_at integer, rewind_at integer);\n' +
      'INSERT INTO sessions VALUES (\'s1\', \'优惠券分类代码与IP源表\');\n' +
      "INSERT INTO messages VALUES ('m1','s1','user','{\"text\":\"低于7折是混补，85折以上是品牌券\"}'," +
      (now - 15 * 60000) +
      ',NULL);\n'
  ]);
  rollout(path.join(codex, 'rollout-y.jsonl'), [
    { timestamp: at(600), type: 'session_meta', payload: { cwd: '/Users/me/Library/Application Support/Cindy/owners/x/dialogues/2026-09-17/abc' } },
    userTurn('低于7折是混补，85折以上是品牌券', 15)
  ]);

  const out = await collect(loadConfig(), {
    hours: 1,
    now,
    found: { cindy: db, codexHomes: [path.join(root, 'codex-home')], ccHomes: [], memoryDirs: [path.dirname(memory)] }
  });

  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].source, 'cindy');
  assert.equal(out.items[0].project, '优惠券分类代码与IP源表');
});

test('harness noise and wallpaper talk are ignored', async () => {
  const { root, codex, memory } = sandbox();
  rollout(path.join(codex, 'rollout-z.jsonl'), [
    userTurn('[UI_ACTION_TRIGGER] The previous turn errored partway through', 5),
    userTurn('把这张壁纸换成紫发', 4),
    userTurn('检查下任务的执行情况', 3)
  ]);
  const out = await collect(loadConfig(), {
    hours: 1,
    now,
    found: { cindy: null, codexHomes: [path.join(root, 'codex-home')], ccHomes: [], memoryDirs: [path.dirname(memory)] }
  });
  assert.deepEqual(out.items.map((i) => i.text), ['检查下任务的执行情况']);
});

