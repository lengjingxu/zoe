import fs from 'node:fs';
import path from 'node:path';

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
  state.history = (state.history || []).slice(-keepHistory);
  return state;
}

// One line per picture: enough for the next hour to know what was drawn, and no more.
export function remember(state, entry, { now, reuseHours }) {
  state.history.push(entry);
  state.pool.push({ at: now, expires_at: now + reuseHours * 3600e3, image: entry.image, topic: entry.topic });
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
