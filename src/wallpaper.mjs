import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SET_ONE = [
  'on run argv',
  '  set target to POSIX file (item 1 of argv)',
  '  tell application "System Events" to set picture of desktop (item 2 of argv as integer) to target',
  'end run'
].join('\n');

const READ_ALL = 'tell application "System Events" to get picture of every desktop';

// macOS caches a wallpaper by path, so every display gets its own fresh file. One
// shared timestamped path is not enough: one display can keep the old picture.
export function show(image, outDir, refresh, tag) {
  const opts = refresh || {};
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = tag || Date.now();
  const displays = desktopCount();
  const targets = Array.from({ length: displays }, (_, i) =>
    path.join(outDir, 'wallpaper_' + stamp + '_d' + (i + 1) + '.jpg')
  );
  for (const target of targets) {
    if (path.resolve(image) !== path.resolve(target)) fs.copyFileSync(image, target);
  }

  for (let attempt = 1; attempt <= 5; attempt++) {
    for (const i of missing(targets)) {
      execFileSync('osascript', ['-e', SET_ONE, targets[i - 1], String(i)], { encoding: 'utf8' });
    }
    if (missing(targets).length === 0) {
      if (opts.dock_restart !== false) execFileSync('killall', ['Dock'], { encoding: 'utf8' });
      if (missing(targets).length === 0) return targets[0];
    }
  }
  const missed = missing(targets);
  if (missed.length) throw new Error('desktop ' + missed.join(', ') + ' would not take its wallpaper');
  return targets[0];
}

// macOS drops a wallpaper change now and then, so ask the desktops what they are
// showing instead of trusting that the set worked.
function desktopCount() {
  const out = execFileSync('osascript', ['-e', 'tell application "System Events" to count desktops'], {
    encoding: 'utf8'
  });
  const count = Number(out.trim());
  if (!Number.isInteger(count) || count < 1) throw new Error('macOS reports ' + count + ' desktops');
  return count;
}

function missing(targets) {
  const out = execFileSync('osascript', ['-e', READ_ALL], { encoding: 'utf8' });
  return out
    .split(',')
    .map((p) => p.trim())
    .map((p, i) => (p === targets[i] ? 0 : i + 1))
    .filter(Boolean);
}

export function current() {
  const out = execFileSync('osascript', ['-e', 'tell application "System Events" to get picture of desktop 1'], {
    encoding: 'utf8'
  });
  return out.trim();
}

export function prune(outDir, keep) {
  if (!fs.existsSync(outDir) || !keep) return [];
  const doomed = [...oldest(outDir, /^wallpaper_\d+(?:_d\d+)?\.jpg$/, keep), ...oldest(outDir, /^loop_\d+\.mp4$/, 6)];
  for (const f of doomed) fs.unlinkSync(f);
  return doomed;
}

function oldest(outDir, pattern, keep) {
  return fs
    .readdirSync(outDir)
    .filter((f) => pattern.test(f))
    .map((f) => path.join(outDir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    .slice(keep);
}
