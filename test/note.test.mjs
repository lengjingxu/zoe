import test from 'node:test';
import assert from 'node:assert/strict';
import { paper } from '../src/note.mjs';

const preset = {
  note_gap_hours: 4,
  note_layout: 'HELD-FORWARD',
  notes: [
    { id: 'meal', line: '该吃饭了', hours: [11, 12, 13] },
    { id: 'sleep', line: '该睡了', hours: [0, 1, 2] },
    { id: 'push', line: '别急', mood: '在攻坚' }
  ],
  notePoses: [{ id: 'N-hold', desc: 'holding it out' }]
};

const at = (hours, minutes = 0) => new Date(2026, 8, 18, hours, minutes).getTime();

test('an hour with nothing recorded is free to hold paper', () => {
  const view = paper({ history: [] }, preset, at(12));
  assert.equal(view.last, null);
  assert.equal(view.quiet, true);
  assert.equal(view.hours, null);
});

test('paper that went up inside the gap is too soon', () => {
  const state = { history: [{ at: at(10), note: 'meal' }, { at: at(11), note: null }] };
  const view = paper(state, preset, at(12));
  assert.equal(view.last.note, 'meal', 'a picture with no note does not reset the gap');
  assert.equal(view.quiet, false);
});

test('paper older than the gap is due again', () => {
  const view = paper({ history: [{ at: at(6), note: 'sleep' }] }, preset, at(12));
  assert.equal(view.hours, 6);
  assert.equal(view.quiet, true);
});

test('the hour keeps only the notes that name it, plus the ones that fit any hour', () => {
  assert.deepEqual(paper({ history: [] }, preset, at(12)).fits.map((n) => n.id), ['meal', 'push']);
  assert.deepEqual(paper({ history: [] }, preset, at(2)).fits.map((n) => n.id), ['sleep', 'push']);
});

test('the ways she holds paper and the layout travel with the answer', () => {
  const view = paper({ history: [] }, preset, at(12));
  assert.equal(view.layout, 'HELD-FORWARD');
  assert.deepEqual(view.poses.map((p) => p.id), ['N-hold']);
});
