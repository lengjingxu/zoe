import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SET_ALL = [
  'on run argv',
  '  set target to POSIX file (item 1 of argv)',
  '  tell application "System Events"',
  '    repeat with d in desktops',
  '      set picture of d to target',
  '    end repeat',
  '  end tell',
  'end run'
].join('\n');

// macOS caches a wallpaper by path, so a fresh path is the only reliable way to
// make the change land on every desktop right away.
export function show(image, outDir, refresh, tag) {
  const opts = refresh || {};
  fs.mkdirSync(outDir, { recursive: true });
  const unique = path.join(outDir, 'wallpaper_' + (tag || Date.now()) + '.jpg');
  if (path.resolve(image) !== path.resolve(unique)) fs.copyFileSync(image, unique);

  execFileSync('osascript', ['-e', SET_ALL, unique], { encoding: 'utf8' });
  if (opts.dock_restart !== false) execFileSync('killall', ['Dock'], { encoding: 'utf8' });
  return unique;
}

export function current() {
  const out = execFileSync('osascript', ['-e', 'tell application "System Events" to get picture of desktop 1'], {
    encoding: 'utf8'
  });
  return out.trim();
}

export function prune(outDir, keep) {
  if (!fs.existsSync(outDir) || !keep) return [];
  const files = fs
    .readdirSync(outDir)
    .filter((f) => /^wallpaper_\d+\.jpg$/.test(f))
    .map((f) => path.join(outDir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  const doomed = files.slice(keep);
  for (const f of doomed) fs.unlinkSync(f);
  return doomed;
}

