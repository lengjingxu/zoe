#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, loadPreset, writeDefaultConfig, ZOE_HOME, STATE_PATH, CONFIG_PATH } from '../src/config.mjs';
import { collect, detect } from '../src/sources.mjs';
import { build } from '../src/brief.mjs';
import { compose } from '../src/prompt.mjs';
import * as modelList from '../src/models.mjs';
import * as renderer from '../src/renderer.mjs';
import * as wallpaper from '../src/wallpaper.mjs';
import * as store from '../src/state.mjs';

const argv = parseArgs(process.argv.slice(2));
const briefFile = path.join(ZOE_HOME, 'brief.json');
const log = (...parts) => console.log('[zoe]', ...parts);

main().catch((err) => {
  console.error('[zoe] ' + err.message);
  process.exit(1);
});

async function main() {
  const cfg = loadConfig();
  switch (argv._[0]) {
    case 'init':
      return log('config written to ' + writeDefaultConfig());
    case 'detect':
      return cmdDetect();
    case 'models':
      return cmdModels(cfg);
    case 'gather':
      return cmdGather(cfg);
    case 'brief':
      return cmdBrief(cfg);
    case 'prompt':
      return cmdPrompt(cfg);
    case 'render':
      return cmdRender(cfg);
    case 'show':
      return cmdShow(cfg);
    case 'tick':
      return cmdTick(cfg);
    case 'status':
      return cmdStatus(cfg);
    default:
      return usage();
  }
}

async function cmdDetect() {
  const found = detect();
  console.log(JSON.stringify({
    cindy_db: found.cindy,
    codex_homes: found.codexHomes,
    claude_code_homes: found.ccHomes,
    memory_dirs: found.memoryDirs
  }, null, 2));
}

async function cmdModels(cfg) {
  if (argv.import) {
    const raw = argv.import === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(argv.import, 'utf8');
    return log('model list saved to ' + modelList.importModels(JSON.parse(raw)));
  }
  const cache = modelList.cached();
  console.log('priority  : ' + cfg.models.priority.join('  ->  '));
  console.log('source    : ' + (cache ? 'client list from ' + new Date(cache.at).toLocaleString() : 'config providers (no client list imported yet)'));
  try {
    const pick = modelList.resolve(cfg);
    console.log('available : ' + pick.available.join(', '));
    console.log('picked    : ' + pick.id + (pick.skipped.length ? '   (skipped ' + pick.skipped.join(', ') + ')' : ''));
  } catch (err) {
    console.log('available : (none)');
    console.log('picked    : nothing, ' + err.message.split('\n')[0]);
  }
}

async function cmdGather(cfg) {
  const hours = num(argv.hours, cfg.hours);
  const out = await collect(cfg, { hours });
  const counts = out.items.reduce((acc, i) => ({ ...acc, [i.source]: (acc[i.source] || 0) + 1 }), {});
  log('window: last ' + hours + 'h   items: ' + out.items.length + '  ' + JSON.stringify(counts));
  for (const item of out.items.slice(-num(argv.limit, 20))) {
    console.log('  ' + new Date(item.at).toLocaleTimeString() + '  ' + item.source.padEnd(11) + '  ' + (item.project || '-').padEnd(16) + '  ' + item.text.slice(0, 90));
  }
  log('memory: ' + out.memory.length + ' long-term notes');
  if (argv.json) console.log(JSON.stringify(out, null, 2));
}

async function cmdBrief(cfg) {
  const preset = loadPreset(cfg.preset);
  const state = store.prune(store.load(STATE_PATH), Date.now(), cfg.reuse_hours);
  const collected = await collect(cfg, { hours: num(argv.hours, cfg.hours) });
  const brief = build({ collected, preset, state, config: cfg });
  fs.mkdirSync(ZOE_HOME, { recursive: true });
  fs.writeFileSync(briefFile, JSON.stringify(brief, null, 2) + '\n');
  if (brief.idle) {
    log('nothing happened in the last ' + num(argv.hours, cfg.hours) + 'h, no brief to draw');
    log('reuse pool holds ' + state.pool.length + ' wallpapers');
    return;
  }
  log('brief written to ' + briefFile);
  console.log(JSON.stringify(brief, null, 2));
}

async function cmdPrompt(cfg) {
  const preset = loadPreset(cfg.preset);
  const brief = JSON.parse(fs.readFileSync(argv.brief || briefFile, 'utf8'));
  console.log(compose({ brief, preset }));
}

async function cmdRender(cfg) {
  const preset = loadPreset(cfg.preset);
  const brief = JSON.parse(fs.readFileSync(argv.brief || briefFile, 'utf8'));
  const prompt = compose({ brief, preset });
  const model = modelList.resolve(cfg);
  log('drawing with ' + model.id + (model.skipped.length ? ' (skipped ' + model.skipped.join(', ') + ')' : ''));
  const bytes = await renderer.generate(cfg, model, prompt);
  const file = path.join(cfg.out_dir, 'raw_' + Date.now() + '.jpg');
  fs.mkdirSync(cfg.out_dir, { recursive: true });
  fs.writeFileSync(file, bytes);
  log('image written to ' + file);
}

async function cmdShow(cfg) {
  const state = store.prune(store.load(STATE_PATH), Date.now(), cfg.reuse_hours);
  const brief = argv.brief ? JSON.parse(fs.readFileSync(argv.brief, 'utf8')) : {};
  const image = path.resolve(argv.image || argv._[1]);
  const unique = wallpaper.show(image, cfg.out_dir, cfg.refresh);
  store.remember(state, {
    at: Date.now(),
    image: unique,
    topic: brief.topic || path.basename(image),
    scene: brief.scene && brief.scene.id,
    interaction: brief.interaction && brief.interaction.id,
    props: brief.props || [],
    model: argv.model || (brief.model || null)
  }, { now: Date.now(), reuseHours: cfg.reuse_hours });
  store.save(STATE_PATH, state);
  const gone = wallpaper.prune(cfg.out_dir, cfg.keep_wallpapers);
  log('desktop set to ' + unique + (gone.length ? ', pruned ' + gone.length + ' old file(s)' : ''));
}

async function cmdTick(cfg) {
  const preset = loadPreset(cfg.preset);
  const now = Date.now();
  const state = store.prune(store.load(STATE_PATH), now, cfg.reuse_hours);
  const collected = await collect(cfg, { hours: cfg.hours, now });
  let brief = build({ collected, preset, state, config: cfg });

  if (brief.idle && state.pool.length) {
    const image = store.rotate(state.pool.map((p) => p.image), state.history, 'image');
    const unique = wallpaper.show(image, cfg.out_dir, cfg.refresh, now);
    store.remember(state, { at: now, image: unique, topic: 'idle reuse' }, { now, reuseHours: cfg.reuse_hours });
    store.save(STATE_PATH, state);
    return log('nothing new to answer, brought back ' + image);
  }
  if (brief.idle) {
    brief = idleBrief(cfg, preset, state, now);
    log('nothing new to answer, drawing a quiet one');
  }

  const prompt = compose({ brief, preset });
  const model = modelList.resolve(cfg);
  log('topic: ' + brief.topic);
  log('drawing with ' + model.id);
  const bytes = await renderer.generate(cfg, model, prompt);
  fs.mkdirSync(cfg.out_dir, { recursive: true });
  const raw = path.join(cfg.out_dir, 'raw_' + now + '.jpg');
  fs.writeFileSync(raw, bytes);
  const unique = wallpaper.show(raw, cfg.out_dir, cfg.refresh, now);
  fs.unlinkSync(raw);

  store.remember(state, {
    at: now, image: unique, topic: brief.topic, scene: brief.scene.id, interaction: brief.interaction.id,
    props: brief.props, model: model.id, prompt
  }, { now, reuseHours: cfg.reuse_hours });
  store.save(STATE_PATH, state);
  wallpaper.prune(cfg.out_dir, cfg.keep_wallpapers);
  log('desktop is now ' + unique);
}

function idleBrief(cfg, preset, state, now) {
  const hour = new Date(now).getHours();
  return {
    idle: false,
    quiet: true,
    at: now,
    topic: 'idle',
    keywords: [],
    slot: hour + ':00',
    weekday: now,
    mood: 'nothing on fire, room to breathe',
    scene: store.rotate(preset.scenes, state.history, 'scene'),
    interaction: { id: 'idle', desc: preset.idle },
    wish: null,
    props: [],
    desk: (state.props || []).slice().sort((a, b) => b.last - a.last).slice(0, 2).map((p) => p.name)
  };
}

async function cmdStatus(cfg) {
  const state = store.load(STATE_PATH);
  const last = state.history[state.history.length - 1];
  console.log('config     : ' + CONFIG_PATH);
  console.log('out_dir    : ' + cfg.out_dir);
  console.log('preset     : ' + cfg.preset);
  console.log('runs       : ' + state.history.length);
  console.log('last run   : ' + (last ? new Date(last.at).toLocaleString() + '  ' + last.topic + '  ' + (last.model || '') : '(never)'));
  console.log('pool       : ' + state.pool.length + ' wallpaper(s) still reusable');
  console.log('props      : ' + (state.props.map((p) => p.name + ' x' + p.count).join(', ') || '(none yet)'));
  console.log('desktop    : ' + wallpaper.current());
}

function usage() {
  console.log([
    'zoe <command>',
    '',
    '  init                     write a default config to ~/.zoe/config.json',
    '  detect                   show which clients were found on this machine',
    '  models [--import -]      show the model priority list and which one wins',
    '  gather [--hours N]       what zoe can see right now',
    '  brief  [--hours N]       turn that into a brief for one picture',
    '  prompt [--brief FILE]    the exact text sent to the image model',
    '  render [--brief FILE]    draw it with the configured provider (standalone)',
    '  show --image FILE        put an image on every desktop and record it',
    '  tick                     gather, brief, draw, show (standalone)',
    '  status                   history, reuse pool, props ledger'
  ].join('\n'));
}

function parseArgs(list) {
  const out = { _: [] };
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.startsWith('--')) out[a.slice(2)] = list[i + 1] && !list[i + 1].startsWith('--') ? list[++i] : true;
    else out._.push(a);
  }
  return out;
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

