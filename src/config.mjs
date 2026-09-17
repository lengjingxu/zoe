import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const HOME = os.homedir();
export const REPO = path.resolve(import.meta.dirname, '..');
export const ZOE_HOME = process.env.ZOE_HOME || path.join(HOME, '.zoe');
export const CONFIG_PATH = path.join(ZOE_HOME, 'config.json');
export const STATE_PATH = path.join(ZOE_HOME, 'state.json');
export const ROOM_PATH = path.join(ZOE_HOME, 'room.json');
export const PROMPT_PATH = path.join(ZOE_HOME, 'prompt.txt');

const DEFAULTS = {
  preset: 'hojo',
  hours: 1,
  reuse_hours: 6,
  out_dir: path.join(HOME, 'Pictures', 'zoe'),
  keep_wallpapers: 40,
  room_max: 6,
  room_keep_days: 30,
  room_add_per_run: 1,
  models: {
    priority: ['xai/grok-imagine-image-2.0', 'openai/gpt-image-2']
  },
  providers: [],
  sources: { cindy: true, codex: true, claudecode: true, memory: true },
  ignore: ['壁纸', 'wallpaper', 'zoe ', '[UI_ACTION_TRIGGER]', '[Schedule]', 'AGENTS.md instructions'],
  wishes: [],
  refresh: { dock_restart: true }
};

export function loadConfig(overrides = {}) {
  const file = fs.existsSync(CONFIG_PATH) ? read(CONFIG_PATH) : {};
  const cfg = { ...DEFAULTS, ...file, ...overrides };
  cfg.sources = { ...DEFAULTS.sources, ...(file.sources || {}), ...(overrides.sources || {}) };
  cfg.models = { ...DEFAULTS.models, ...(file.models || {}), ...(overrides.models || {}) };
  cfg.refresh = { ...DEFAULTS.refresh, ...(file.refresh || {}), ...(overrides.refresh || {}) };
  return cfg;
}

export function loadPreset(name) {
  const candidates = [
    path.join(ZOE_HOME, 'presets', `${name}.json`),
    path.join(REPO, 'presets', `${name}.json`),
    path.resolve(name)
  ];
  const hit = candidates.find((p) => fs.existsSync(p));
  if (!hit) throw new Error(`preset not found: ${name}\nlooked in:\n  ${candidates.join('\n  ')}`);
  return { file: hit, ...read(hit) };
}

export function writeDefaultConfig() {
  fs.mkdirSync(ZOE_HOME, { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULTS, null, 2) + '\n');
  return CONFIG_PATH;
}

function read(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`cannot read ${file}: ${e.message}`);
  }
}
