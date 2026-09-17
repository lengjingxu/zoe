import test from 'node:test';
import assert from 'node:assert/strict';
import { pickNote } from '../src/note.mjs';
import { build } from '../src/brief.mjs';
import { compose } from '../src/prompt.mjs';

// Local hours, so the clock cases hold wherever the suite runs.
const at = (hour, minutes = 0) => new Date(2026, 8, 17, hour, minutes, 0).getTime();
const item = (text, minutesAgo, now) => ({ at: now - minutesAgo * 60000, source: 'cindy', project: 'demo', text });
const collected = (now, items) => ({ from: 0, to: now, items, memory: [] });

const preset = {
  name: 'fixture',
  style: 'STYLE',
  character: 'CHARACTER',
  layout: 'LAYOUT',
  negative: ['CGI', 'text'],
  scenes: [{ id: 'a', desc: 'scene a' }],
  interactions: [{ id: 'A', desc: 'interaction a' }],
  notes: [
    { id: 'meal', line: '该吃饭了', hours: [12] },
    { id: 'lunch', line: '一起吃饭', hours: [12] },
    { id: 'done', line: '干得漂亮', mood: '在收尾' }
  ],
  note_layout: 'NOTE_LAYOUT',
  notePoses: [{ id: 'N-hold', desc: 'holding up a small note' }],
  idle: 'idle scene'
};

test('a preset with no notes never holds one up', () => {
  assert.equal(pickNote({ notes: undefined, now: at(12), history: [] }), null);
  assert.equal(pickNote({ notes: [], now: at(12), history: [] }), null);
});

test('a note is rare: the gap holds even when the hour fits', () => {
  const history = [{ at: at(12) - 3600e3, note: 'meal' }];
  assert.equal(pickNote({ notes: preset.notes, now: at(12), history }), null);
  assert.ok(pickNote({ notes: preset.notes, now: at(12) + 24 * 3600e3, history }), 'the next day has room for one');
});

test('the clock decides first, the mood only fills in', () => {
  assert.equal(pickNote({ notes: preset.notes, now: at(12), history: [] }).line, '该吃饭了');
  assert.equal(pickNote({ notes: preset.notes, now: at(6), history: [], mood: '清晨，在收尾，节奏很松' }).line, '干得漂亮');
  assert.equal(pickNote({ notes: preset.notes, now: at(6), history: [], mood: '清晨，节奏很松' }), null);
});

test('the next note is one that has not been said in a while', () => {
  const history = [{ at: at(12) - 5 * 3600e3, note: 'meal' }];
  assert.equal(pickNote({ notes: preset.notes, now: at(12), history }).id, 'lunch');
});

test('a preset with notes but nowhere to hold them stops the run', () => {
  const { notePoses, ...bare } = preset;
  const now = at(12);
  assert.throws(
    () => build({ collected: collected(now, [item('把优惠券分类的口径改一下', 1, now)]), preset: bare, state: { history: [], props: [] }, config: {}, now }),
    /notePoses/
  );
});

test('the note reaches the picture, and the ban on text lifts for that one line only', () => {
  const now = at(12);
  const brief = build({ collected: collected(now, [item('把优惠券分类的口径改一下', 1, now)]), preset, state: { history: [], props: [] }, config: {}, now });
  assert.equal(brief.note.id, 'meal');
  assert.equal(brief.interaction.id, 'N-hold', 'she holds the note instead of the usual pose');
  const text = compose({ brief, preset });
  assert.ok(text.includes('该吃饭了'));
  assert.ok(text.includes('NOTE_LAYOUT'), 'the note picture gets its own layout');
  assert.ok(!text.split(String.fromCharCode(10)).includes('LAYOUT'), 'and not the usual one');
  assert.ok(text.includes('Avoid: CGI'));
  assert.ok(!text.includes('Avoid: CGI, text'), 'the ban on text steps aside here');
});

test('a picture without a note still bans text', () => {
  const now = at(6);
  const brief = build({ collected: collected(now, [item('把优惠券分类的口径改一下', 1, now)]), preset, state: { history: [], props: [] }, config: {}, now });
  assert.equal(brief.note, null);
  assert.equal(brief.interaction.id, 'A');
  const text = compose({ brief, preset });
  assert.ok(text.includes('LAYOUT'), 'without a note the usual layout is back');
  assert.ok(text.includes('Avoid: CGI, text'));
});
