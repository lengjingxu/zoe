import test from 'node:test';
import assert from 'node:assert/strict';
import { animate } from '../src/motion.mjs';

const preset = { name: 'demo', motion: 'MOTION' };

test('the loop text carries the motion, the hold and the model parameters', () => {
  const text = animate({ preset });
  assert.ok(text.startsWith('MOTION'));
  assert.ok(text.includes('framing never changes'), 'the composition is pinned, not up to the model');
  assert.ok(text.endsWith('--duration 6 --resolution 720p'), text);
});

test('seconds and resolution are passed through instead of being guessed', () => {
  assert.ok(animate({ preset, seconds: 10, resolution: '480p' }).endsWith('--duration 10 --resolution 480p'));
});

test('a picture with a note keeps the note still and readable', () => {
  const text = animate({ preset, note: { line: '该吃饭了' } });
  assert.ok(text.includes('stays crisp and readable'));
  assert.ok(!animate({ preset }).includes('crisp and readable'), 'a picture without a note is left alone');
});

test('a preset with no motion block stops instead of shipping a still', () => {
  assert.throws(() => animate({ preset: { name: 'flat' } }), /no motion block/);
});
