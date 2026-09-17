import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SET_ALL = [
  'on run argv',
  '  set target to POSIX file (item 1 of argv)',
  '  tell application "System Events"',
  '    repeat with i from 1 to (count of desktops)',
  '      set picture of desktop i to target',
  '    end repeat',
  '  end tell',
  'end run'
].join('\n');

const SET_ONE = [
  'on run argv',
  '  set target to POSIX file (item 1 of argv)',
  '  tell application "System Events" to set picture of desktop (item 2 of argv as integer) to target',
  'end run'
].join('\n');

const READ_ALL = 'tell application "System Events" to get picture of every desktop';

// macOS caches a wallpaper by path, so a fresh path is the only reliable way to
// make the change land on every desktop right away.
export function show(image, outDir, refresh, tag) {
  const opts = refresh || {};
  fs.mkdirSync(outDir, { recursive: true });
  const unique = path.join(outDir, 'wallpaper_' + (tag || Date.now()) + '.jpg');
  if (path.resolve(image) !== path.resolve(unique)) fs.copyFileSync(image, unique);

  execFileSync('osascript', ['-e', SET_ALL, unique], { encoding: 'utf8' });
  for (const i of missing(unique)) {
    execFileSync('osascript', ['-e', SET_ONE, unique, String(i)], { encoding: 'utf8' });
  }
  if (opts.dock_restart !== false) execFileSync('killall', ['Dock'], { encoding: 'utf8' });

  const missed = missing(unique);
  if (missed.length) throw new Error('desktop ' + missed.join(', ') + ' would not take ' + unique);
  return unique;
}

// macOS drops a wallpaper change now and then, so ask the desktops what they are
// showing instead of trusting that the set worked.
function missing(unique) {
  const out = execFileSync('osascript', ['-e', READ_ALL], { encoding: 'utf8' });
  return out
    .split(',')
    .map((p) => p.trim())
    .map((p, i) => (p === unique ? 0 : i + 1))
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
  const doomed = [...oldest(outDir, /^wallpaper_\d+\.jpg$/, keep), ...oldest(outDir, /^loop_\d+\.mp4$/, 6)];
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
