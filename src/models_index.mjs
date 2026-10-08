// What the gateway actually serves, cached on disk from its own /v1/models.
// The first call asks the gateway; later calls read the cache. The cache lets the
// resolver see every model on the gateway, not only the ones a hand-written
// providers[*].models list names, so the priority list can stay short and
// unversioned.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function homeDir() {
  return process.env.ZOE_HOME || path.join(os.homedir(), '.zoe');
}

function indexPath() {
  return path.join(homeDir(), 'models.json');
}
const TIMEOUT = 60e3;
const IMAGE_RE = /image|wan|qwen|grok[-_.]?4[-_.]?\d?image|gemini[-_.]?\d?image|sora|dall[-_.]?e|z[-_.]?image|kling|imagen|seedream/i;
const VIDEO_RE = /video|sora|veo|kling|hunyuan|seedance|wani2v/i;

function classify(id) {
  if (VIDEO_RE.test(id)) return 'video';
  if (IMAGE_RE.test(id)) return 'image';
  return null;
}

function empty() {
  return { at: 0, models: [], image: [], video: [], by_provider: {} };
}

export function read(home) {
  const file = home ? path.join(home, 'models.json') : indexPath();
  if (!fs.existsSync(file)) return empty();
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!j || !Array.isArray(j.models)) return empty();
    const image = [];
    const video = [];
    const by_provider = {};
    for (const m of j.models) {
      const cat = classify(m.id);
      if (cat === 'image') image.push(m.id);
      else if (cat === 'video') video.push(m.id);
      const p = m.provider_id;
      if (p) (by_provider[p] ||= []).push(m.id);
    }
    return { at: j.at || 0, models: j.models, image, video, by_provider };
  } catch (err) {
    return { ...empty(), error: err.message };
  }
}

// Asks the gateway for the live list and writes the cache. A caller passes the
// address and key it has already verified, so this file never reads an env var on
// its own.
export async function refresh({ base, key }) {
  if (!base) throw new Error('no gateway base_url to refresh models.json from');
  if (!key) throw new Error('gateway key is empty; set the api_key_env named in the provider config');
  const url = String(base).replace(/\/+$/, '') + '/models';
  const res = await fetch(url, {
    headers: { authorization: 'Bearer ' + key },
    signal: AbortSignal.timeout(TIMEOUT)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(url + ' said HTTP ' + res.status + ': ' + text.slice(0, 200));
  let j;
  try { j = JSON.parse(text); } catch (e) { throw new Error(url + ' answered non-JSON: ' + text.slice(0, 200)); }
  const list = j.data || j || [];
  // The gateway's owned_by tags models by who trained them (openai, xai, ...). zoe
  // speaks through a single codex channel, so collapse the openai family onto the
  // codex provider id. The original owned_by is preserved as 'vendor' for reporting.
  const models = list.map((m) => {
    const vendor = m.owned_by || m.provider_id || m.provider || null;
    const provider_id = vendor === 'openai' ? 'codex' : vendor;
    return {
      id: m.id,
      provider_id,
      vendor,
      name: m.name || null,
      mode: (m.architecture && (m.architecture.modality || (m.architecture.output_modalities || []).join(','))) || null
    };
  }).filter((m) => m.id);
  const out = { at: Date.now(), models };
  fs.mkdirSync(path.dirname(indexPath()), { recursive: true });
  fs.writeFileSync(indexPath(), JSON.stringify(out, null, 2) + '\n');
  return read();
}

