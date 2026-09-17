import fs from 'node:fs';
import path from 'node:path';

const EMPTY = { version: 1, updated_at: 0, symbols: [] };
const DAY = 86400e3;

export function load(file) {
  if (!fs.existsSync(file)) return structuredClone(EMPTY);
  try {
    return { ...structuredClone(EMPTY), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    throw new Error('room file is not valid JSON, refusing to overwrite it: ' + file + ': ' + e.message);
  }
}

export function save(file, room) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(room, null, 2) + String.fromCharCode(10));
}

// What the agent chooses with: what stands in the room now and how long it has been
// there, and which memories have not become anything yet.
export function state(room, { memory = [], now }) {
  const held = new Set(room.symbols.map((s) => s.memory.title));
  return {
    symbols: room.symbols.map((s) => ({
      id: s.id,
      thing: s.thing,
      memory: s.memory.title,
      remembered: s.memory.at,
      in_room_days: Math.floor((now - s.added_at) / DAY),
      shown: s.shown || 0
    })),
    candidates: memory
      .filter((m) => m.title && !held.has(m.title))
      .map((m) => ({ title: m.title, remembered: m.at, age_days: Math.floor((now - m.at) / DAY) }))
  };
}

// The agent's decision, checked before any of it is written. A memory has to be one
// it was shown, the thing has to be one line of English, and the room has a size.
export function apply(room, decision, { memory = [], now, max, perRun = 1 }) {
  const add = decision.add || [];
  const retire = decision.retire || [];
  if (add.length > perRun) throw new Error('room: ' + add.length + ' new keepsakes, at most ' + perRun + ' at a time');
  for (const id of retire) {
    if (!room.symbols.some((s) => s.id === id)) throw new Error('room: nothing in the room is called ' + id);
  }

  const kept = room.symbols.filter((s) => !retire.includes(s.id));
  const held = new Set(kept.map((s) => s.memory.title));
  let counter = Math.max(0, ...room.symbols.map((s) => Number(String(s.id).replace(/\D/g, '')) || 0));

  for (const item of add) {
    const source = memory.find((m) => m.title === item.memory);
    if (!source) throw new Error('room: no memory called ' + JSON.stringify(item.memory) + ' in the list you were given');
    if (held.has(source.title)) throw new Error('room: ' + source.title + ' is already in the room');
    const thing = String(item.thing || '');
    if (thing.length < 8 || thing.length > 140) throw new Error('room: the thing for ' + source.title + ' has to be one line of 8 to 140 characters');
    if (/[\u4e00-\u9fa5]/.test(thing)) throw new Error('room: the thing for ' + source.title + ' has to be English, it goes into an English prompt');
    held.add(source.title);
    kept.push({
      id: 'k' + ++counter,
      memory: { title: source.title, at: source.at, text: String(source.text || '').slice(0, 200) },
      thing,
      added_at: now,
      seen_at: now,
      shown: 0
    });
  }

  if (kept.length > max) {
    throw new Error('room: that would leave ' + kept.length + ' keepsakes and the room holds ' + max + ', so retire as many as you add');
  }
  return { version: 1, updated_at: now, symbols: kept };
}

// Everything in the room is in every picture, so one touch covers all of them.
export function touch(room, now) {
  for (const s of room.symbols) {
    s.seen_at = now;
    s.shown = (s.shown || 0) + 1;
  }
  return room;
}
