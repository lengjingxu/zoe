import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as room from '../src/room.mjs';

const NOW = 1789650000000;
const DAY = 86400e3;
const memory = Array.from({ length: 7 }, (_, i) => ({ title: '记忆 ' + i, at: NOW - i * DAY, text: '笔记 ' + i }));
const thing = (i) => 'keepsake number ' + i + ' standing on the shelf above the desk';
const none = () => room.load(path.join(os.tmpdir(), 'zoe-no-such-room.json'));
const grow = (state, i, at = NOW) =>
  room.apply(state, { add: [{ memory: '记忆 ' + i, thing: thing(i) }] }, { memory, now: at, max: 6 });

test('a memory becomes one line of English standing in the room', () => {
  const state = grow(none(), 0);
  assert.equal(state.symbols.length, 1);
  assert.equal(state.symbols[0].id, 'k1');
  assert.equal(state.symbols[0].thing, thing(0));
  assert.equal(state.symbols[0].memory.title, '记忆 0');
  assert.equal(state.symbols[0].memory.at, NOW);
  assert.equal(state.symbols[0].added_at, NOW);
});

test('a memory that was not offered cannot be turned into anything', () => {
  assert.throws(
    () => room.apply(none(), { add: [{ memory: '凭空想出来的事', thing }] }, { memory, now: NOW, max: 6 }),
    /no memory called/
  );
});

test('a thing has to be one line of English', () => {
  const call = (text) => () => room.apply(none(), { add: [{ memory: '记忆 0', thing: text }] }, { memory, now: NOW, max: 6 });
  assert.throws(call('架子上的小摆件，有点旧'), /has to be English/);
  assert.throws(call('a cup'), /8 to 140/);
  assert.throws(call('x'.repeat(141)), /8 to 140/);
});

test('the same memory does not go into the room twice', () => {
  const once = grow(none(), 0);
  assert.throws(() => grow(once, 0), /already in the room/);
});

test('the room has a size, so an addition has to make space', () => {
  let state = none();
  for (let i = 0; i < 6; i++) state = grow(state, i);
  assert.equal(state.symbols.length, 6);
  assert.throws(() => grow(state, 6), /retire as many as you add/);
  assert.equal(grow(room.apply(state, { retire: ['k1'] }, { memory, now: NOW, max: 6 }), 6).symbols.length, 6);
});

test('retiring something that is not there is an error', () => {
  assert.throws(() => room.apply(grow(none(), 0), { retire: ['k9'] }, { memory, now: NOW, max: 6 }), /nothing in the room is called k9/);
});

test('one addition at a time is enough for an hour', () => {
  assert.throws(
    () => room.apply(none(), { add: [{ memory: '记忆 0', thing: thing(0) }, { memory: '记忆 1', thing: thing(1) }] }, { memory, now: NOW, max: 6 }),
    /at most 1/
  );
});

test('the room list says what has been there long enough to go', () => {
  const old = room.apply(none(), { add: [{ memory: '记忆 0', thing: thing(0) }] }, { memory, now: NOW - 40 * DAY, max: 6 });
  const view = room.state(old, { memory, now: NOW });
  assert.equal(view.symbols[0].in_room_days, 40);
  assert.equal(view.symbols[0].shown, 0);
  assert.ok(!view.candidates.some((c) => c.title === '记忆 0'), 'what is already in the room is not offered again');
  assert.ok(view.candidates.some((c) => c.title === '记忆 1'));
});

test('a picture counts as the whole room being drawn', () => {
  const state = room.touch(grow(none(), 0), NOW + 1000);
  assert.equal(state.symbols[0].shown, 1);
  assert.equal(state.symbols[0].seen_at, NOW + 1000);
});

test('the room list survives a round trip and refuses to be clobbered', () => {
  const file = path.join(os.tmpdir(), 'zoe-room-test-' + process.pid + '.json');
  room.save(file, grow(none(), 0));
  assert.equal(room.load(file).symbols[0].memory.title, '记忆 0');
  fs.writeFileSync(file, '{ not json');
  assert.throws(() => room.load(file), /refusing to overwrite/);
  fs.unlinkSync(file);
});
