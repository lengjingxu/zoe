import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'zoe-movie-'));
process.env.ZOE_HOME = home;
const movie = await import('../src/movie.mjs');

const pidFile = path.join(home, 'movie.json');
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test('nothing playing is nothing playing', () => {
  assert.equal(movie.running(), null);
  assert.equal(movie.stop(), null);
});

test('a pid file left by a dead player does not count as a movie', () => {
  fs.writeFileSync(pidFile, JSON.stringify({ pid: 999999, file: '/tmp/gone.mp4', at: 1 }));
  assert.equal(movie.running(), null);
  assert.ok(!fs.existsSync(pidFile), 'the stale record is cleared, not left to lie');
});

// A player is started by one zoe run and stopped by a later one, so the test
// starts it from a shell that exits, leaving it under launchd like the real one.
test('stop ends the player and forgets it', async () => {
  const shell = spawn('/bin/sh', ['-c', 'sleep 60 & echo $!'], { stdio: ['ignore', 'pipe', 'ignore'] });
  const pid = Number(await new Promise((done) => shell.stdout.once('data', (d) => done(d.toString()))));
  await new Promise((done) => shell.once('exit', done));

  fs.writeFileSync(pidFile, JSON.stringify({ pid, file: '/tmp/x.mp4', at: Date.now() }));
  assert.equal(movie.running().pid, pid);

  assert.equal(movie.stop().pid, pid);
  assert.equal(movie.running(), null);
  assert.ok(!fs.existsSync(pidFile));
  assert.equal(alive(pid), false, 'the player is really gone');
});

test('play on a file that is not there is an error, not a black desktop', () => {
  assert.throws(() => movie.play(path.join(home, 'nope.mp4')), /no such video/);
});
