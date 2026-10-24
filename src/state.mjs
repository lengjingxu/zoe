import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const EMPTY = { version: 1, history: [], pool: [] };

export function load(file) {
  if (!fs.existsSync(file)) return structuredClone(EMPTY);
  try {
    return { ...structuredClone(EMPTY), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    throw new Error('state file is not valid JSON, refusing to overwrite it: ' + file + ': ' + e.message);
  }
}

export function save(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + String.fromCharCode(10));
}

export function prune(state, now, reuseHours, keepHistory = 200) {
  state.pool = (state.pool || []).filter((x) => x.expires_at > now && x.image && fs.existsSync(x.image));
  state.pool = onePerPicture(state.pool);
  state.history = (state.history || []).slice(-keepHistory);
  return state;
}

// The desktop keeps a copy of every wallpaper it shows, so the same picture can sit
// in the pool under two names. The pool holds one entry per picture: the newest copy.
function onePerPicture(pool) {
  const pictures = new Map();
  for (const entry of pool) {
    const key = pictureKey(entry.image);
    const held = pictures.get(key);
    if (!held || entry.at > held.at) pictures.set(key, entry);
  }
  return [...pictures.values()];
}

function pictureKey(file) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return file; // unreadable: the path is the only name this picture has
  }
}

// A prompt-only generation resets the compounding cost of image-to-image. Keep this
// decision in state so an hourly run can tell whether the room is due for a reset.
export function freshDue(history, now, hours) {
  const last = [...(history || [])].reverse().find((entry) => entry.fresh === true);
  return !last || now - last.at >= hours * 3600e3;
}

// A picture is a rebuild when it was drawn from the prompt alone. That happens when
// the reset is due on the clock, and also when the gateway drops the request that
// carried the previous picture: the room was rebuilt either way, so the record says
// what happened rather than what was planned.
export function rebuiltFromPrompt(due, ref) {
  return due || !ref;
}

// One line per picture: enough for the next hour to know what was drawn, and no more.
export function remember(state, entry, { now, reuseHours }) {
  state.history.push(entry);
  state.pool.push({ at: now, expires_at: now + reuseHours * 3600e3, image: entry.image, topic: entry.topic });
  return state;
}

// A picture that comes back is the same picture under a new file name, so the pool
// entry follows it instead of joining the pool a second time. The rotation then moves
// on to another picture instead of handing back the one just shown.
export function reuse(state, picked, image, { now, reuseHours }) {
  const i = state.pool.findIndex((p) => p.image === picked);
  const kept = i >= 0 ? state.pool[i] : { topic: 'idle reuse' };
  const entry = { ...kept, at: now, expires_at: now + reuseHours * 3600e3, image };
  if (i >= 0) state.pool[i] = entry;
  else state.pool.push(entry);
  state.history.push({ at: now, image, topic: 'idle reuse' });
  return state;
}

// Picks the option used longest ago, so a small pool rotates instead of repeating.
// Never-used options win, and history stores ids rather than the objects they name.
export function rotate(pool, history, field) {
  if (!pool?.length) throw new Error('rotate: empty pool for ' + field);
  const id = (value) => (value && typeof value === 'object' ? value.id : value);
  const last = new Map();
  history.forEach((h, i) => {
    if (h[field] != null) last.set(id(h[field]), i);
  });
  let pick = pool[0];
  let pickIdx = last.has(id(pick)) ? last.get(id(pick)) : -1;
  for (const option of pool.slice(1)) {
    const idx = last.has(id(option)) ? last.get(id(option)) : -1;
    if (idx < pickIdx) {
      pick = option;
      pickIdx = idx;
    }
  }
  return pick;
}
