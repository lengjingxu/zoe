// Walks the configured priority list and returns the first model that is actually
// reachable. The candidate set starts from providers[*].models, then is widened by
// any model in the live gateway index whose provider is one the config names. The
// caller always sees the id it will use, what was skipped, and which provider
// surfaced it, so a run can never be quietly downgraded to a different model.
export function resolve(config, available, opts = {}) {
  const source = available || configured(config, opts.index);
  const ids = source.map((m) => m.id);
  const skipped = [];
  for (const want of config.models.priority || []) {
    const hit = matches(want, ids);
    if (hit) return { id: hit, provider_id: providerOf(source, hit), wanted: want, available: ids, skipped, index_used: !!opts.index };
    skipped.push(want);
  }
  throw new Error(
    'none of the priority models are available\n' +
    '  want: ' + (config.models.priority || []).join(' -> ') + '\n' +
    '  have: ' + (ids.join(', ') || '(nothing)')
  );
}

export function resolveAll(config, available, opts = {}) {
  const source = available || configured(config, opts.index);
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

// Lists every model the resolver can pick. Starts from providers[*].models and then
// adds models the gateway index knows about, as long as their provider is one the
// config names. A model the index knows but the config does not name a provider for
// is intentionally left out: it has no address and no key.
export function configured(config, index) {
  const listed = (config.providers || []).flatMap((p) => (p.models || []).map((id) => ({ id, provider_id: p.id })));
  if (!index || !index.models) return listed;
  const providerIds = new Set((config.providers || []).map((p) => p.id));
  const seen = new Set(listed.map((m) => m.id));
  for (const m of index.models) {
    if (m.provider_id && providerIds.has(m.provider_id) && !seen.has(m.id)) {
      listed.push({ id: m.id, provider_id: m.provider_id });
      seen.add(m.id);
    }
  }
  return listed;
}
