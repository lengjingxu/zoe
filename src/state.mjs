import fs from 'node:fs';
import path from 'node:path';

const EMPTY = { version: 1, history: [], props: [], pool: [] };

export function load(file) {
  if (!fs.existsSync(file)) return structuredClone(EMPTY);
  try {
    return { ...structuredClone(EMPTY), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    throw new Error(`state file is not valid JSON, refusing to overwrite it: ${file}: ${e.message}`);
  }
}

export function save(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
}

export function prune(state, now, reuseHours, keepHistory = 200) {
  state.pool = (state.pool || []).filter((x) => x.expires_at > now && x.image && fs.existsSync(x.image));
  state.history = (state.history || []).slice(-keepHistory);
  return state;
}

export function remember(state, entry, { now, reuseHours }) {
  state.history.push(entry);
  state.pool.push({ at: now, expires_at: now + reuseHours * 3600e3, image: entry.image, topic: entry.topic });
  for (const name of entry.props || []) {
    const hit = state.props.find((p) => p.name === name);
    if (hit) {
      hit.count += 1;
      hit.last = now;
    } else {
      state.props.push({ name, first: now, last: now, count: 1 });
    }
  }
  return state;
}

// Picks the option that was used longest ago, so a small pool rotates instead of
// repeating. Never-used options win. Ties keep pool order, so output is
// reproducible. History stores ids; the pool may hold the objects those ids name.
export function rotate(pool, history, field) {
  if (!pool?.length) throw new Error(`rotate: empty pool for ${field}`);
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
