import test from 'node:test';
import assert from 'node:assert/strict';
import { check, rules } from '../src/check.mjs';

const preset = {
  name: 'fixture',
  style: 'STYLE',
  character: 'CHARACTER',
  cats: 'FOUR-RESIDENT-CATS',
  layout: 'WIDE-SHOT-OPEN',
  note_layout: 'NOTE-HELD-FORWARD',
  negative: ['CGI', 'text']
};
const room = { symbols: [{ id: 'k1', thing: 'a postcard propped on the windowsill' }] };

const prompt = (over = {}) => [
  'STYLE',
  'Subject: CHARACTER',
  'FOUR-RESIDENT-CATS',
  'They are in the middle of this right now: 优惠券分类',
  'Kept in this room: a postcard propped on the windowsill.',
  'WIDE-SHOT-OPEN',
  'Avoid: CGI, text.',
  ...(over.extra || [])
].join(String.fromCharCode(10));

test('a prompt that keeps every rule goes through, unchanged', () => {
  const text = prompt();
  assert.equal(check({ text, preset, room }), text);
});

test('a prompt that dropped a rule is refused, and says which', () => {
  assert.throws(() => check({ text: prompt().replace('WIDE-SHOT-OPEN', ''), preset, room }), /the layout paragraph/);
  assert.throws(() => check({ text: prompt().replace('STYLE', ''), preset, room }), /the style paragraph/);
  assert.throws(() => check({ text: prompt().replace('FOUR-RESIDENT-CATS', ''), preset, room }), /the resident cats/);
  assert.throws(() => check({ text: prompt().replace('CGI', 'anything'), preset, room }), /the ban on CGI/);
  assert.throws(() => check({ text: prompt().replace('a postcard propped on the windowsill', ''), preset, room }), /the keepsake/);
});

test('the note picture is held to the note and to its own layout', () => {
  const text = prompt().replace('WIDE-SHOT-OPEN', 'NOTE-HELD-FORWARD') + String.fromCharCode(10) + '该吃饭了';
  assert.equal(check({ text, preset, room, note: '该吃饭了' }), text);
  assert.throws(() => check({ text, preset, room }), /the layout paragraph/, 'without a note it is the usual layout that is owed');
  assert.throws(() => check({ text: text.replace('该吃饭了', ''), preset, room, note: '该吃饭了' }), /the note she is holding/);
});

test('the ban on text steps aside for the one picture that is text', () => {
  assert.deepEqual(rules({ preset, room, note: '该吃饭了' }).negative, ['CGI']);
  assert.deepEqual(rules({ preset, room }).negative, ['CGI', 'text']);
});

test('an hour cannot smuggle in a novel', () => {
  assert.throws(() => check({ text: prompt() + 'x'.repeat(4000), preset, room }), /4000/);
});
