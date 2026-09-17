import fs from 'node:fs';
import path from 'node:path';
import { ZOE_HOME } from './config.mjs';

export const CACHE = path.join(ZOE_HOME, 'models.json');

// What the client says it can draw with, once it has told us. Written by
// 'zoe models --import'.
export function cached() {
  if (!fs.existsSync(CACHE)) return null;
  const data = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  if (!Array.isArray(data.models)) throw new Error(CACHE + ' has no models array');
  return data;
}

export function importModels(raw) {
  const models = Array.isArray(raw) ? raw : raw.models;
  if (!Array.isArray(models) || !models.length) throw new Error('expected {models:[{id,provider_id}, ...]}');
  fs.mkdirSync(ZOE_HOME, { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify({ at: Date.now(), models }, null, 2) + '\n');
  return CACHE;
}

// Walks the configured priority list and returns the first model that is actually
// reachable. The caller always sees the id it will use and what was skipped, so a
// run can never be quietly downgraded to a different model.
export function resolve(config, available) {
  const source = available || (cached() && cached().models) || providerModels(config);
  const ids = source.map((m) => m.id);
  const skipped = [];
  for (const want of config.models.priority) {
    const hit = matches(want, ids);
    if (hit) return { id: hit, provider_id: providerOf(source, hit), wanted: want, available: ids, skipped };
    skipped.push(want);
  }
  throw new Error(
    'none of the priority models are available\n' +
    '  want: ' + config.models.priority.join(' -> ') + '\n' +
    '  have: ' + (ids.join(', ') || '(nothing)')
  );
}

export function providerOf(list, id) {
  const hit = list.find((m) => m.id === id);
  return hit ? hit.provider_id : null;
}

function matches(want, ids) {
  if (ids.includes(want)) return want;
  if (!want.includes('*')) return null;
  const re = new RegExp('^' + want.split('*').map(escape).join('.*') + '$');
  const found = ids.filter((id) => re.test(id));
  if (!found.length) return null;
  // A wildcard is for version drift, so the newest numbered variant wins and a
  // plain match is the fallback.
  return found.sort((a, b) => version(b) - version(a))[0];
}

function version(id) {
  const hit = id.match(/(\d+(?:\.\d+)*)\D*$/);
  return hit ? Number.parseFloat(hit[1]) : -1;
}

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function providerModels(config) {
  return (config.providers || []).flatMap((p) => (p.models || []).map((id) => ({ id, provider_id: p.id })));
}
