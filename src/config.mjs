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
  fresh_hours: 3,
  out_dir: path.join(HOME, 'Pictures', 'zoe'),
  size: '1792x1024',
  keep_wallpapers: 40,
  room_max: 6,
  room_keep_days: 30,
  room_add_per_run: 1,
  models: {
    // Only codex/openai image models: 2.5 line first (covers 2.5 / 2.5-flare / 2.5-sunburst),
    // then 2, then 1.5. A gpt-image-3 would fall through until the priority is updated.
    // No grok / qwen / gemini / external gateway: a clone with only
    // XDT_CODEX_API_KEY + ZOE_BASE_URL resolves cleanly.
    priority: ['gpt-image-2.5*', 'gpt-image-2', 'gpt-image-1.5'],
    chat_image: [],
    // The codex side has no video, so film has no candidate: an empty list
    // stops the run and names the gap rather than picking a different gateway.
    video_priority: []
  },
  providers: [
    {
      // The single channel zoe speaks to. The live gateway index fills models.
      // priority + providers together confine the resolver to this codex slot.
      id: 'codex',
      api_key_env: 'XDT_CODEX_API_KEY',
      base_url_env: 'ZOE_BASE_URL',
      models: []
    }
  ],
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
  cfg.providers = (file.providers && file.providers.length) ? file.providers : DEFAULTS.providers;
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
