import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDue, rebuiltFromPrompt } from '../src/state.mjs';

const hour = 3600e3;

test('a run with no recorded fresh generation is due', () => {
  assert.equal(freshDue([{ fresh: false }], 1000, 3), true);
});

test('fresh generations repeat every three hours, with the previous two hours edited', () => {
  const history = [
    { at: 0, fresh: true },
    { at: hour, fresh: false },
    { at: 2 * hour, fresh: false }
  ];
  assert.equal(freshDue(history, 2 * hour + 1, 3), false);
  assert.equal(freshDue(history, 3 * hour, 3), true);
});

test('a picture drawn from the prompt alone is a rebuild, whether or not one was due', () => {
  assert.equal(rebuiltFromPrompt(true, null), true, 'the reset was due');
  assert.equal(rebuiltFromPrompt(false, null), true, 'the gateway dropped the reference request');
  assert.equal(rebuiltFromPrompt(false, '/tmp/previous.jpg'), false, 'the picture was edited from the last one');
});
