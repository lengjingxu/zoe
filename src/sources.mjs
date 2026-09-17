import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';

const HOME = os.homedir();
const CINDY = path.join(HOME, 'Library', 'Application Support', 'Cindy');
const uniq = (a) => [...new Set(a.filter(Boolean))];
const RANK = { cindy: 3, codex: 2, claudecode: 1 };

// Which clients are installed on this machine, and where they keep their transcripts.
export function detect() {
  const codexHomes = uniq([
    process.env.CODEX_HOME,
    path.join(CINDY, 'codex-home'),
    path.join(HOME, '.codex')
  ]).filter((d) => fs.existsSync(path.join(d, 'sessions')));

  const ccHomes = uniq([process.env.CLAUDE_CONFIG_DIR, path.join(HOME, '.claude')]).filter((d) =>
    fs.existsSync(path.join(d, 'projects'))
  );

  const owners = path.join(CINDY, 'owners');
  const memoryDirs = fs.existsSync(owners)
    ? fs.readdirSync(owners).map((o) => path.join(owners, o, 'maker-memory')).filter((d) => fs.existsSync(d))
    : [];

  return { cindy: cindyDb(), codexHomes, ccHomes, memoryDirs };
}

// Everything the clients did inside the window, newest last. Transcripts are
// whole-session files, so the window is applied to each line, not to the file.
export async function collect(cfg, { hours, now = Date.now(), found } = {}) {
  const span = (hours ?? cfg.hours) * 3600e3;
  const from = now - span;
  const clients = found || detect();
  const items = [];

  if (cfg.sources.cindy && clients.cindy) items.push(...cindyItems(clients.cindy, from));
  if (cfg.sources.codex) items.push(...(await codexItems(clients.codexHomes || [], from)));
  if (cfg.sources.claudecode) items.push(...ccItems(clients.ccHomes || [], from));

  const memory = cfg.sources.memory ? memoryItems(clients.memoryDirs || []) : [];
  return {
    from,
    to: now,
    clients,
    items: collapse(items).filter((i) => keep(cfg, i)),
    memory
  };
}

function keep(cfg, item) {
  if (!item.text || item.text.length < 2) return false;
  if (/^</.test(item.text)) return false;
  return !(cfg.ignore || []).some((needle) => item.text.includes(needle));
}

// The client database and the agent transcript hold the same sentences. Keep one
// copy: the one from the client, because it carries the real session title.
function collapse(items) {
  const best = new Map();
  for (const item of items.sort((a, b) => a.at - b.at)) {
    const key = item.text.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 24);
    if (key.length < 2) continue;
    const seen = best.get(key);
    if (!seen || RANK[item.source] > RANK[seen.source]) best.set(key, item);
  }
  return [...best.values()].sort((a, b) => a.at - b.at);
}

// ---------------------------------------------------------------- cindy client

export function cindyDb() {
  if (!fs.existsSync(CINDY)) return null;
  const dbs = fs
    .readdirSync(CINDY)
    .filter((f) => f.startsWith('cindy-') && f.endsWith('.db'))
    .map((f) => path.join(CINDY, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return dbs.find((db) => sqlite(db, "SELECT name FROM sqlite_master WHERE name='messages'").length) || null;
}

function sqlite(db, sql) {
  const out = execFileSync('sqlite3', ['-json', '-readonly', db, sql], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024
  });
  return out.trim() ? JSON.parse(out) : [];
}

function cindyItems(db, from) {
  const rows = sqlite(
    db,
    `SELECT m.created_at AS at, s.title AS project,
       CASE WHEN json_valid(m.content) THEN json_extract(m.content, '$.text') ELSE m.content END AS text
     FROM messages m LEFT JOIN sessions s ON m.session_id = s.id
     WHERE m.role = 'user' AND m.rewind_at IS NULL AND m.created_at >= ${Math.floor(from)}
     ORDER BY m.created_at DESC LIMIT 300`
  );
  return rows.map((r) => ({ at: r.at, source: 'cindy', project: r.project || '', text: clean(r.text) }));
}

// ------------------------------------------------------------ codex transcripts

async function codexItems(homes, from) {
  const items = [];
  for (const home of homes) {
    for (const file of recent(path.join(home, 'sessions'), from)) {
      items.push(...(await parseRollout(file, home, from)));
    }
  }
  return items;
}

async function parseRollout(file, home, from) {
  const out = [];
  let cwd = '';
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row.type === 'session_meta') {
      cwd = row.payload?.cwd || '';
      continue;
    }
    const payload = row.payload;
    if (row.type !== 'event_msg' || payload?.item?.type !== 'UserMessage') continue;
    const at = millis(payload.completed_at_ms) || millis(Date.parse(row.timestamp));
    if (!at || at < from) continue;
    const text = clean(promptOf(payload.item.content));
    if (text) out.push({ at, source: 'codex', project: projectName(cwd) || path.basename(home), text });
  }
  return out;
}

// A user turn in a transcript carries the harness scaffolding as separate parts.
// Only the parts the human actually typed are interesting.
function promptOf(content) {
  return (content || [])
    .map((c) => c.text)
    .filter(Boolean)
    .filter((t) => !/^\s*</.test(t) && !t.includes('AGENTS.md instructions'))
    .join(' ');
}

// ------------------------------------------------------- claude code transcripts

function ccItems(homes, from) {
  const items = [];
  for (const home of homes) {
    for (const file of recent(path.join(home, 'projects'), from, '.jsonl', 5)) {
      let cwd = '';
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        let row;
        try {
          row = JSON.parse(line);
        } catch {
          continue;
        }
        cwd = row.cwd || cwd;
        if (row.type !== 'user' || row.isSidechain) continue;
        const at = millis(Date.parse(row.timestamp));
        if (!at || at < from) continue;
        const content = row.message?.content;
        const text = clean(
          typeof content === 'string' ? content : (content || []).filter((p) => p.type === 'text').map((p) => p.text).join(' ')
        );
        if (text) items.push({ at, source: 'claudecode', project: projectName(cwd) || path.basename(home), text });
      }
    }
  }
  return items;
}

// ------------------------------------------------------------------- long memory

function memoryItems(dirs) {
  const out = [];
  for (const dir of dirs) {
    for (const file of mdFiles(dir)) {
      const head = fs.readFileSync(file, 'utf8').split('\n').slice(0, 30).join('\n');
      const title = head.match(/^title:\s*(.+)$/m)?.[1];
      if (!title) continue;
      out.push({
        at: fs.statSync(file).mtimeMs,
        source: 'memory',
        project: path.basename(dir),
        title: title.trim(),
        text: (head.match(/^description:\s*(.+)$/m)?.[1] || '').trim()
      });
    }
  }
  return out.sort((a, b) => b.at - a.at).slice(0, 60);
}

// ------------------------------------------------------------------------ utils

function mdFiles(root, out = [], depth = 0) {
  if (depth > 2) return out;
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, e.name);
    if (e.isDirectory()) mdFiles(p, out, depth + 1);
    else if (e.name.endsWith('.md') && e.name !== 'MEMORY.md') out.push(p);
  }
  return out;
}

function recent(root, from, ext = '.jsonl', depth = 6) {
  const files = [];
  const walk = (dir, level) => {
    if (level > depth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, level + 1);
      else if (e.name.endsWith(ext) && fs.statSync(p).mtimeMs >= from) files.push(p);
    }
  };
  walk(root, 0);
  return files.sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs).slice(-40);
}

function projectName(cwd) {
  const parts = String(cwd || '').split('/').filter(Boolean);
  const i = parts.lastIndexOf('codepro');
  if (i >= 0 && parts[i + 1]) return parts[i + 1];
  if (parts.includes('Cindy')) return 'cindy';
  return parts[parts.length - 1] || '';
}

function millis(value) {
  return typeof value === 'number' && value > 1e11 ? value : 0;
}

function clean(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[a-z][a-z0-9-]*>[\s\S]*?<\/[a-z][a-z0-9-]*>/gi, ' ')
    .replace(/<cindy-[^>]*>[\s\S]*$/i, ' ')
    .replace(/curl\s+-{1,2}[^\n]*/gi, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/cindy:\/\/\S+/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/#{1,6}\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
