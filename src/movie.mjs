import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { REPO, ZOE_HOME } from './config.mjs';

const SRC = path.join(REPO, 'native', 'DesktopMovie.swift');
const BIN = path.join(ZOE_HOME, 'bin', 'zoe-desktop-movie');
const RUNNING = path.join(ZOE_HOME, 'movie.json');

// macOS has no supported way to put a movie behind the desktop icons, so zoe
// builds a small window of its own at the desktop layer. It is compiled from
// source on first use and cached in ~/.zoe/bin.
function binary() {
  if (fs.existsSync(BIN) && fs.statSync(BIN).mtimeMs >= fs.statSync(SRC).mtimeMs) return BIN;
  fs.mkdirSync(path.dirname(BIN), { recursive: true });
  execFileSync('swiftc', ['-O', SRC, '-o', BIN], { stdio: ['ignore', 'ignore', 'inherit'] });
  return BIN;
}

export function running() {
  if (!fs.existsSync(RUNNING)) return null;
  const state = JSON.parse(fs.readFileSync(RUNNING, 'utf8'));
  if (!alive(state.pid)) {
    fs.unlinkSync(RUNNING);
    return null;
  }
  return state;
}

export function play(file) {
  const abs = path.resolve(file || '');
  if (!fs.existsSync(abs)) throw new Error('no such video: ' + abs);
  stop();
  const child = spawn(binary(), [abs], { detached: true, stdio: 'ignore' });
  child.unref();
  sleep(400);
  if (!alive(child.pid)) throw new Error('the desktop movie died on start: ' + abs);
  fs.mkdirSync(ZOE_HOME, { recursive: true });
  const state = { pid: child.pid, file: abs, at: Date.now() };
  fs.writeFileSync(RUNNING, JSON.stringify(state, null, 2) + '\n');
  return state;
}

export function stop() {
  const state = running();
  if (!state) return null;
  process.kill(state.pid, 'SIGTERM');
  if (!waitGone(state.pid)) throw new Error('the desktop movie did not stop: pid ' + state.pid);
  fs.unlinkSync(RUNNING);
  return state;
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function waitGone(pid) {
  for (let i = 0; i < 50 && alive(pid); i++) sleep(20);
  return !alive(pid);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
