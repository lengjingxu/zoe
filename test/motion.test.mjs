import test from 'node:test';
import assert from 'node:assert/strict';
import { animate } from '../src/motion.mjs';

const preset = { name: 'demo', motion: 'MOTION', hold: 'HOLD' };

test('the loop text carries the motion and the hold, and nothing else', () => {
  const text = animate({ preset });
  assert.equal(text, 'MOTION' + String.fromCharCode(10) + 'HOLD');
  assert.equal(text.split(String.fromCharCode(10)).length, 2, 'the length and the size are fields now, not words');
  assert.ok(!text.includes('--duration'), text);
});

test('a preset with no motion block stops instead of shipping a still', () => {
  assert.throws(() => animate({ preset: { name: 'flat' } }), /no motion block/);
});

test('a preset with no hold block stops instead of shipping a loop with a seam', () => {
  assert.throws(() => animate({ preset: { name: 'loose', motion: 'MOTION' } }), /no hold block/);
});
