import test from 'node:test';
import assert from 'node:assert/strict';
import { animate } from '../src/motion.mjs';

const preset = { name: 'demo', motion: 'MOTION' };

test('the loop text carries the motion and the hold, and nothing else', () => {
  const text = animate({ preset });
  assert.ok(text.startsWith('MOTION'));
  assert.ok(text.includes('framing never changes'), 'the composition is pinned, not up to the model');
  assert.equal(text.split(String.fromCharCode(10)).length, 2, 'the length and the size are fields now, not words');
  assert.ok(!text.includes('--duration'), text);
});

test('a preset with no motion block stops instead of shipping a still', () => {
  assert.throws(() => animate({ preset: { name: 'flat' } }), /no motion block/);
});
