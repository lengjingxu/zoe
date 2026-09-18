// Walks the configured priority list and returns the first model that is actually
// reachable. The caller always sees the id it will use and what was skipped, so a
// run can never be quietly downgraded to a different model.
export function resolve(config, available) {
  const source = available || configured(config);
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

export function resolveAll(config, available) {
  const source = available || configured(config);
  const ids = source.map((m) => m.id);
  const hits = [];
  for (const want of (config.models.priority || [])) {
    const hit = matches(want, ids);
    if (hit && !hits.some((h) => h.id === hit)) {
      hits.push({ id: hit, provider_id: providerOf(source, hit), wanted: want });
    }
  }
  return hits;
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

export function configured(config) {
  return (config.providers || []).flatMap((p) => (p.models || []).map((id) => ({ id, provider_id: p.id })));
}
