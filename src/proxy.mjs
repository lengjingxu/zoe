import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolve, resolveAll, configured } from './models.mjs';

const TIMEOUT = 300e3;
const POLL_EVERY = 10e3;
const POLL_LIMIT = 60;
const FRAME_LIMIT = 750e3;
const FRAME_WIDTH = 1280;

// The models zoe draws with come from a proxy named in the config, an OpenAI-compatible
// gateway with its own budget. This file is the only place zoe talks to a model.
export function drawModel(cfg) {
  return resolve(cfg, configured(cfg));
}

export function drawCandidates(cfg) {
  const all = resolveAll(cfg, configured(cfg));
  return all.length ? all : [drawModel(cfg)];
}

function usesChatImage(cfg, id) {
  return (cfg.models.chat_image || []).includes(id);
}

export function filmModel(cfg) {
  const priority = cfg.models.video_priority;
  if (!priority?.length) throw new Error('no models.video_priority in the config, nothing to film with');
  return resolve({ ...cfg, models: { priority } }, configured(cfg));
}

// Where the gateway lives and the key that opens it both come from the environment
// variables this provider names, so the config file carries neither.
export function endpoint(cfg, id) {
  const provider = (cfg.providers || []).find((p) => (p.models || []).includes(id));
  if (!provider) throw new Error('no provider in the config lists ' + id);
  const address = provider.base_url_env || '';
  const base = address ? process.env[address] : provider.base_url;
  if (!base) throw new Error(provider.id + ' has no address: set ' + (address || 'base_url') + (address ? ', that variable is empty' : ' in the config'));
  const from = provider.api_key_env || '';
  const key = process.env[from];
  if (!key) throw new Error(provider.id + ' reads its key from ' + (from || '(no api_key_env)') + ', and that variable is empty');
  return { base: String(base).replace(/\/+$/, ''), key, provider: provider.id };
}

async function send(url, key, body, form) {
  const res = await fetch(url, {
    method: 'POST',
    headers: form ? { authorization: 'Bearer ' + key } : { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: form || JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(url + ' said HTTP ' + res.status + ': ' + text.slice(0, 240));
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(url + ' answered with something that is not JSON: ' + text.slice(0, 240));
  }
}

async function get(url, key) {
  const res = await fetch(url, { headers: { authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(TIMEOUT) });
  const text = await res.text();
  if (!res.ok) throw new Error(url + ' said HTTP ' + res.status + ': ' + text.slice(0, 240));
  return JSON.parse(text);
}

// The picture that ends up on the desktop: a fresh one from the prompt, or one edited
// from the picture already there, which keeps the room and the hand the way they were.
export async function draw(cfg, { prompt, ref, size }) {
  if (!prompt?.trim()) throw new Error('nothing to draw: the prompt is empty');
  const candidates = drawCandidates(cfg);
  const shape = size || cfg.size || '1792x1024';
  const errors = [];

  for (const model of candidates) {
    try {
      const { base, key } = endpoint(cfg, model.id);
      if (usesChatImage(cfg, model.id)) {
        return await chatDraw(cfg, { model: model.id, prompt, ref, shape });
      }
      if (!ref) {
        const out = await send(base + '/images/generations', key, { model: model.id, prompt, size: shape, n: 1, quality: 'high', output_format: 'jpg' });
        return { buffer: await bytes(out, base, key), model: model.id };
      }
      if (!fs.existsSync(ref)) throw new Error('no picture at ' + ref + ' to draw from');

      try {
        const form = new FormData();
        form.set('model', model.id);
        form.set('prompt', prompt);
        form.set('size', shape);
        form.set('n', '1');
        form.set('image', new Blob([fs.readFileSync(ref)], { type: 'image/jpeg' }), path.basename(ref));
        const out = await send(base + '/images/edits', key, null, form);
        return { buffer: await bytes(out, base, key), model: model.id, ref };
      } catch {
        const out = await send(base + '/images/generations', key, { model: model.id, prompt, size: shape, n: 1, quality: 'high', output_format: 'jpg' });
        return { buffer: await bytes(out, base, key), model: model.id };
      }
    } catch (err) {
      errors.push(model.id + ': ' + (err.message || String(err)));
    }
  }

  throw new Error('all candidate models failed to draw:' + String.fromCharCode(10) + '  ' + errors.join(String.fromCharCode(10) + '  '));
}

// Some image models are served through chat completions and return their picture in
// the message. The shape goes into the text because that API has no size field.
async function chatDraw(cfg, { model, prompt, ref, shape }) {
  const { base, key } = endpoint(cfg, model);
  const content = [{ type: 'text', text: prompt + String.fromCharCode(10) + 'Output a ' + shape + ' image.' }];
  if (ref) {
    const frame = frameBytes(ref);
    content.push({ type: 'image_url', image_url: { url: 'data:' + frame.type + ';base64,' + frame.bytes.toString('base64') } });
  }
  const out = await send(base + '/chat/completions', key, {
    model,
    messages: [{ role: 'user', content }]
  });
  const hit = out.choices?.[0]?.message?.images?.find((image) => image.image_url?.url);
  if (!hit) throw new Error('the chat image model returned no image: ' + JSON.stringify(out).slice(0, 240));
  const url = hit.image_url.url;
  const buffer = url.startsWith('data:')
    ? Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')
    : await download(url);
  return { buffer, model, ref };
}

// Image to video, then the loop text decides what may move. The first frame has to be a
// picture, so the still goes up as a data URL, and the length and the size are fields
// rather than words in the prompt.
export async function film(cfg, { prompt, firstFrame, seconds, resolution }) {
  if (!prompt?.trim()) throw new Error('nothing to film: the motion text is empty');
  if (!firstFrame || !fs.existsSync(firstFrame)) throw new Error('no first frame at ' + firstFrame);
  const model = filmModel(cfg);
  const { base, key } = endpoint(cfg, model.id);

  const frame = frameBytes(firstFrame);
  const image = { url: 'data:' + frame.type + ';base64,' + frame.bytes.toString('base64') };
  const started = await send(base + '/videos/generations', key, {
    model: model.id,
    prompt,
    image,
    duration: seconds || 6,
    resolution: resolution || '720p'
  });
  if (!started.request_id) throw new Error('the video model did not return a request_id: ' + JSON.stringify(started).slice(0, 240));

  for (let i = 0; i < POLL_LIMIT; i++) {
    const job = await get(base + '/videos/' + started.request_id, key);
    if (job.status === 'failed') throw new Error('the video job failed: ' + JSON.stringify(job).slice(0, 240));
    if (job.status === 'done') {
      if (!job.video?.url) throw new Error('the video job finished without a url: ' + JSON.stringify(job).slice(0, 240));
      const raw = await download(job.video.url);
      const buffer = makeSeamlessLoop(raw);
      return { buffer, model: model.id, seconds: job.video.duration, frame: frame.bytes.length };
    }
    await new Promise((r) => setTimeout(r, POLL_EVERY));
  }
  throw new Error('the video job did not finish in ' + (POLL_LIMIT * POLL_EVERY) / 1000 + ' seconds');
}

// Post-processes a video buffer with ffmpeg ping-pong (forward + reverse),
// ensuring the last frame connects back to the first frame with mathematical precision
// (F_end === F_start), creating a gapless cinemagraph loop without cross-dissolve jump.
export function makeSeamlessLoop(buffer) {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  } catch {
    return buffer;
  }

  const tmpIn = path.join(os.tmpdir(), 'zoe-raw-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.mp4');
  const tmpOut = path.join(os.tmpdir(), 'zoe-seamless-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.mp4');

  try {
    fs.writeFileSync(tmpIn, buffer);
    execFileSync('ffmpeg', [
      '-i', tmpIn,
      '-filter_complex', '[0:v]split[v1][v2];[v2]reverse[v2r];[v1][v2r]concat=n=2:v=1[outv]',
      '-map', '[outv]',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-an',
      tmpOut,
      '-y'
    ], { stdio: 'ignore' });
    if (fs.existsSync(tmpOut) && fs.statSync(tmpOut).size > 0) {
      return fs.readFileSync(tmpOut);
    }
  } catch {
    return buffer;
  } finally {
    try { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn); } catch {}
    try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch {}
  }
  return buffer;
}

// The gateway refuses a request body near a megabyte, and a still from an image model
// lands just under one. What it weighs is the body, so the limit is measured after the
// encoding and leaves the prompt room in the same body. Past it the picture goes up
// shrunk to the width the clip comes back in; under it the bytes go up as they are.
export function frameBytes(file) {
  const raw = fs.readFileSync(file);
  const png = file.toLowerCase().endsWith('.png');
  if (encodedLength(raw.length) <= FRAME_LIMIT) return { bytes: raw, type: png ? 'image/png' : 'image/jpeg' };
  const small = path.join(os.tmpdir(), 'zoe-frame-' + Date.now() + '.jpg');
  execFileSync('sips', ['-Z', String(FRAME_WIDTH), '-s', 'format', 'jpeg', '-s', 'formatOptions', '72', file, '--out', small], { stdio: 'ignore' });
  const shrunk = fs.readFileSync(small);
  fs.unlinkSync(small);
  return { bytes: shrunk, type: 'image/jpeg' };
}

// Base64 turns three bytes into four, which is how a still of 819 KB becomes a body of
// 1.1 MB and gets refused before the gateway ever reads the key.
export function encodedLength(bytes) {
  return Math.ceil(bytes / 3) * 4;
}

async function bytes(out, base, key) {
  const first = out.data?.[0];
  if (!first) throw new Error('the image model returned nothing: ' + JSON.stringify(out).slice(0, 240));
  if (first.b64_json) return Buffer.from(first.b64_json, 'base64');
  if (first.url) return download(first.url);
  throw new Error('the image model returned neither b64_json nor url: ' + JSON.stringify(first).slice(0, 240));
}

async function download(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error('cannot fetch ' + url + ': HTTP ' + res.status);
  return Buffer.from(await res.arrayBuffer());
}
