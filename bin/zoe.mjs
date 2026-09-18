#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, loadPreset, writeDefaultConfig, ZOE_HOME, STATE_PATH, CONFIG_PATH, ROOM_PATH, PROMPT_PATH } from '../src/config.mjs';
import { collect, detect, longMemory } from '../src/sources.mjs';
import { check } from '../src/check.mjs';
import * as roomMod from '../src/room.mjs';
import * as modelList from '../src/models.mjs';
import * as wallpaper from '../src/wallpaper.mjs';
import * as store from '../src/state.mjs';
import * as movie from '../src/movie.mjs';
import { animate } from '../src/motion.mjs';
import * as proxy from '../src/proxy.mjs';

const argv = parseArgs(process.argv.slice(2));
const log = (...parts) => console.log('[zoe]', ...parts);

main().catch((err) => {
  console.error('[zoe] ' + err.message);
  process.exit(1);
});

// This file is the toolbox. What the picture is about is decided by whoever runs it:
// the skill in SKILL.md reads the data these commands print and hands the result back.
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
    case 'room':
      return cmdRoom(cfg);
    case 'prompt':
      return cmdPrompt(cfg);
    case 'show':
      return cmdShow(cfg);
    case 'last':
      return cmdLast();
    case 'draw':
      return cmdDraw(cfg);
    case 'film':
      return cmdFilm(cfg);
    case 'reuse':
      return cmdReuse(cfg);
    case 'motion':
      return cmdMotion(cfg);
    case 'loop':
      return cmdLoop(cfg);
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
  console.log('priority  : ' + cfg.models.priority.join('  ->  '));
  console.log('video     : ' + (cfg.models.video_priority || []).join('  ->  '));
  console.log('providers : ' + (cfg.providers || []).map((p) => p.id + ' (' + (p.models || []).length + ' models)').join(', ') || '(none in the config)');
  try {
    const pick = modelList.resolve(cfg);
    console.log('available : ' + pick.available.join(', '));
    console.log('picked    : ' + pick.id + (pick.skipped.length ? '   (skipped ' + pick.skipped.join(', ') + ')' : ''));
  } catch (err) {
    console.log('available : (none)');
    console.log('picked    : nothing, ' + err.message.split(String.fromCharCode(10))[0]);
  }
}

// Everything zoe is allowed to know about this hour, as text, and as JSON on request.
async function cmdGather(cfg) {
  const hours = num(argv.hours, cfg.hours);
  const out = await collect(cfg, { hours });
  const counts = out.items.reduce((acc, i) => ({ ...acc, [i.source]: (acc[i.source] || 0) + 1 }), {});
  log('window: last ' + hours + 'h   items: ' + out.items.length + '  ' + JSON.stringify(counts));
  for (const item of out.items.slice(-num(argv.limit, 40))) {
    console.log('  ' + new Date(item.at).toLocaleTimeString() + '  ' + item.source.padEnd(11) + '  ' + (item.project || '-').padEnd(16) + '  ' + item.text.slice(0, 120));
  }
  log('memory: ' + out.memory.length + ' long-term notes');
  if (argv.json) console.log(JSON.stringify(out, null, 2));
}

// The room: what stands in it now, what it could take out of the long memory, and what
// has been there long enough to go. The agent furnishes it; this only holds the door.
async function cmdRoom(cfg) {
  const preset = loadPreset(cfg.preset);
  const now = Date.now();
  const room = roomMod.load(ROOM_PATH);
  if (argv.write) {
    const next = roomMod.apply(room, JSON.parse(readInput(argv.write)), {
      memory: longMemory(), now, max: cfg.room_max, perRun: cfg.room_add_per_run
    });
    roomMod.save(ROOM_PATH, next);
    return log('the room holds ' + next.symbols.length + ': ' + next.symbols.map((s) => s.id + ' ' + s.memory.title).join(' | '));
  }
  const view = roomMod.state(room, { memory: longMemory(), now });
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  console.log('room      ' + view.symbols.length + ' of ' + cfg.room_max + ' things');
  for (const s of view.symbols) {
    console.log('          ' + s.id + '  ' + s.thing);
    console.log('                ' + s.memory + '  |  remembered ' + day(s.remembered) + '  |  in the room ' + s.in_room_days + ' days  |  drawn ' + s.shown + ' times');
  }
  const old = view.symbols.filter((s) => s.in_room_days > cfg.room_keep_days);
  console.log('to retire ' + (old.length ? old.map((s) => s.id + ' (' + s.in_room_days + ' days)').join(', ') : 'nothing has been here longer than ' + cfg.room_keep_days + ' days'));
  if (preset.room) console.log('lives     ' + preset.room);
  console.log('memory    ' + view.candidates.length + ' note(s) not in the room yet');
  for (const m of view.candidates) console.log('            ' + m.title + '   remembered ' + day(m.remembered));
  console.log('schema    ' + '{"add":[{"memory":"<title, exactly as listed>","thing":"<one line of English: what it looks like and where it stands>"}],"retire":["<id>"]}');
  console.log('then      zoe room --write /tmp/zoe-room.json   (at most ' + cfg.room_add_per_run + ' new per run, the room holds ' + cfg.room_max + ')');
}

// The prompt in use, and the only way a new one gets in. It is checked against the
// preset and the room first, so no hour can quietly drop the layout or the bans.
async function cmdPrompt(cfg) {
  if (!argv.write) {
    if (!fs.existsSync(PROMPT_PATH)) return log('no prompt has been written yet: ' + PROMPT_PATH);
    return console.log(fs.readFileSync(PROMPT_PATH, 'utf8').trim());
  }
  const preset = loadPreset(cfg.preset);
  const room = roomMod.load(ROOM_PATH);
  const text = readInput(argv.write).trim();
  check({ text, preset, room, note: argv.note ? noteLine(preset, argv.note) : null });
  fs.mkdirSync(ZOE_HOME, { recursive: true });
  fs.writeFileSync(PROMPT_PATH, text + String.fromCharCode(10));
  log('prompt stored at ' + PROMPT_PATH);
  console.log(text);
}

async function cmdShow(cfg) {
  const now = Date.now();
  const state = store.prune(store.load(STATE_PATH), now, cfg.reuse_hours);
  const given = argv.image || argv._[1];
  const image = path.resolve(given);
  const unique = putOnDesktop(cfg, image);
  store.remember(state, {
    at: now,
    image: unique,
    topic: argv.topic || path.basename(image),
    scene: argv.scene || null,
    interaction: argv.pose || null,
    note: argv.note || null,
    model: argv.model || null
  }, { now, reuseHours: cfg.reuse_hours });
  store.save(STATE_PATH, state);
  roomMod.save(ROOM_PATH, roomMod.touch(roomMod.load(ROOM_PATH), now));
  const gone = wallpaper.prune(cfg.out_dir, cfg.keep_wallpapers);
  log('desktop set to ' + unique + (gone.length ? ', pruned ' + gone.length + ' old file(s)' : ''));
}

// An empty hour should not cost a picture: bring one back from the pool instead.
async function cmdReuse(cfg) {
  const now = Date.now();
  const state = store.prune(store.load(STATE_PATH), now, cfg.reuse_hours);
  if (!state.pool.length) return log('the pool is empty, nothing to bring back');
  const image = store.rotate(state.pool.map((p) => p.image), state.history, 'image');
  const unique = putOnDesktop(cfg, image, now);
  store.remember(state, { at: now, image: unique, topic: 'idle reuse' }, { now, reuseHours: cfg.reuse_hours });
  store.save(STATE_PATH, state);
  log('brought back ' + unique);
}

async function cmdMotion(cfg) {
  const preset = loadPreset(cfg.preset);
  console.log(animate({ preset, seconds: num(argv.seconds, null), resolution: argv.resolution }));
}

// The desktop takes one thing at a time: a movie and a still picture cannot both be
// the wallpaper, so starting either stops the other.
async function cmdLoop(cfg) {
  if (argv.stop) {
    const was = movie.stop();
    return log(was ? 'took the movie off the desktop: ' + was.file : 'no movie was playing');
  }
  const file = argv.video || argv._[1];
  if (!file) {
    const now = movie.running();
    return log(now ? 'playing ' + now.file + ' (pid ' + now.pid + ')' : 'nothing playing on the desktop');
  }
  const state = movie.play(file);
  log('playing ' + state.file + ' at the desktop layer (pid ' + state.pid + ')');
}

// What the last hours did, so the next one can avoid repeating them.
async function cmdStatus(cfg) {
  const state = store.load(STATE_PATH);
  console.log('config     : ' + CONFIG_PATH);
  console.log('out_dir    : ' + cfg.out_dir);
  console.log('preset     : ' + cfg.preset);
  console.log('room       : ' + roomMod.load(ROOM_PATH).symbols.length + ' keepsake(s)');
  console.log('runs       : ' + state.history.length);
  for (const run of state.history.slice(-num(argv.hours, 6))) {
    console.log('  ' + new Date(run.at).toLocaleString() + '  ' + (run.topic || '-') + '  scene=' + (run.scene || '-') + '  pose=' + (run.interaction || '-') + '  note=' + (run.note || '-') + '  ' + (run.model || ''));
  }
  console.log('pool       : ' + state.pool.length + ' wallpaper(s) still reusable');
  const playing = movie.running();
  console.log('movie      : ' + (playing ? playing.file + ' (pid ' + playing.pid + ')' : '(none)'));
  console.log('desktop    : ' + wallpaper.current());
}

function putOnDesktop(cfg, image, tag) {
  const stopped = movie.stop();
  if (stopped) log('took the movie off the desktop');
  return wallpaper.show(image, cfg.out_dir, cfg.refresh, tag);
}

// The note is named by its id everywhere else, so name it by id here too.
function noteLine(preset, id) {
  const found = (preset.notes || []).find((n) => n.id === id);
  if (!found) throw new Error('preset ' + preset.name + ' has no note called ' + id + ': ' + (preset.notes || []).map((n) => n.id).join(', '));
  return found.line;
}

// The hour, drawn and filmed by the proxy the config names, so nothing else sits between
// the prompt and the desktop.
async function cmdDraw(cfg) {
  const prompt = (argv.prompt ? readInput(argv.prompt) : fs.readFileSync(PROMPT_PATH, 'utf8')).trim();
  const ref = refFor(argv.ref);
  const out = argv.out || path.join(os.tmpdir(), 'zoe-' + Date.now() + '.jpg');
  const drawn = await proxy.draw(cfg, { prompt, ref });
  fs.writeFileSync(out, drawn.buffer);
  log('drew with ' + drawn.model + (drawn.ref ? ' from ' + drawn.ref : ' from the prompt alone') + ' -> ' + out);
  console.log(out);
}

async function cmdFilm(cfg) {
  const preset = loadPreset(cfg.preset);
  const prompt = argv.prompt ? readInput(argv.prompt).trim() : animate({ preset });
  const firstFrame = !argv.firstFrame || argv.firstFrame === 'last' ? lastPicture() : argv.firstFrame;
  const out = argv.out || path.join(cfg.out_dir, 'loop_' + Date.now() + '.mp4');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const clip = await proxy.film(cfg, {
    prompt,
    firstFrame,
    seconds: num(argv.seconds, null),
    resolution: typeof argv.resolution === 'string' ? argv.resolution : null
  });
  fs.writeFileSync(out, clip.buffer);
  log('filmed with ' + clip.model + ' for ' + clip.seconds + 's from a ' + Math.round(clip.frame / 1024) + 'KB first frame -> ' + out);
  console.log(out);
}

// Where this hour comes from: the picture the last hour left, unless told otherwise.
function refFor(want) {
  if (want === 'none') return null;
  if (want && want !== 'last') return want;
  return lastPicture();
}

// The picture the last hour left on the desktop. The next hour is drawn from it.
function lastPicture() {
  const state = store.load(STATE_PATH);
  const run = [...state.history].reverse().find((h) => h.image && fs.existsSync(h.image));
  if (!run) throw new Error('no picture from a previous hour is still on disk: this is the first one, pass --ref none');
  return run.image;
}

// The file the next hour draws from. Handing it back as the reference is how the room
// stays the same room instead of being drawn again from nothing.
async function cmdLast() {
  const state = store.load(STATE_PATH);
  const run = [...state.history].reverse().find((h) => h.image && fs.existsSync(h.image));
  if (!run) return log('nothing from a previous hour is still on disk, so there is nothing to draw from');
  console.log(run.image);
}

function readInput(from) {
  return from === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(from, 'utf8');
}

function usage() {
  console.log([
    'zoe <command>',
    '',
    '  init                     write a default config to ~/.zoe/config.json',
    '  detect                   which clients were found on this machine, and where',
    '  models                   the model priority list, and which one wins',
    '  gather [--hours N] [--json]   what this hour looks like, from the transcripts',
    '  room                     what stands in the room, and the memory it could take',
    '  room --write FILE        add or retire keepsakes (one new per run, room of six)',
    '  prompt                   the prompt in use, the one the last hour drew with',
    '  prompt --write FILE      hand over a new one: checked, then stored',
    '      [--note ID]          the note id from the preset, when she holds paper',
    '  last                     the picture the last hour left, the one to draw from',
    '  draw [--ref FILE|none]   draw this hour through the gateway, print the file it landed in',
    '      [--prompt FILE] [--out FILE]',
    '  film [--first-frame F]   turn that still into a loop, print the file it landed in',
    '      [--prompt FILE] [--seconds N] [--out FILE]',
    '  show --image FILE        put an image on every desktop and record the hour',
    '      [--topic T] [--scene ID] [--pose WORDS] [--note ID] [--model M]',
    '  reuse                    bring a wallpaper back from the pool without drawing',
    '  motion                   the text that turns the picture on screen into a loop',
    '  loop --video FILE        play a movie at the desktop layer, under the icons',
    '  loop --stop              take the movie off the desktop',
    '  status [--hours N]       what the last hours drew, the pool, the desktop'
  ].join(String.fromCharCode(10)));
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
