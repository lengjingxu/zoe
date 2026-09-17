import { rotate } from './state.mjs';
import { pickNote } from './note.mjs';

const STOP = new Set([
  '我们', '可以', '这个', '那个', '一下', '什么', '现在', '然后', '所以', '但是', '需要', '帮我', '怎么',
  '一个', '就是', '已经', '还是', '如果', '因为', '这样', '那样', '没有', '不是', '他们', '自己', '这里',
  '时候', '东西', '问题', '任务', '使用', '进行', '以及', '或者', '并且', '而且', '不过', '还有', '看看',
  '应该', '可能', '如何', '是否', '直接', '主要', '一些', '这是', '那是', '看下', '这图', '我的', '你的'
]);

const NOISE = new Set([
  'already', 'json', 'chrome', 'application', 'cache', 'accept', 'content', 'header', 'https', 'http',
  'curl', 'post', 'true', 'false', 'null', 'charset', 'utf8', 'gzip', 'connection', 'bearer', 'cookie',
  'session', 'script', 'node', 'file', 'path', 'name', 'type', 'line', 'code', 'text', 'data', 'value',
  'string', 'object', 'array', 'function', 'const', 'import', 'export', 'undefined', 'error', 'please',
  'using', 'used', 'make', 'need', 'want', 'like', 'also', 'then', 'than', 'which', 'when', 'where'
]);

const EDGE = /^[的了是和与及或对把被让给到在从就都也还很更最太再又这那其之我你他她它们个有没会能要想使什]|[的了是和与及或个呢吧啊]$/;

// A prop is a thing you can put on a desk. Phrases about talking and thinking
// are not things.
const NOT_PROP = /什么|怎么|可以|讨论|地方|时候|现在|是否|应该|需要|意思|区别|方式|内容/;

const SIGNALS = [
  { mood: '在攻坚', words: ['报错', '失败', '翻车', 'bug', '紧急', '排查', '卡住', '超时', 'error', 'fail', '重构', '补齐'] },
  { mood: '在收尾', words: ['完成', '成功', '上线', '通过', '发布', '搞定', '合并', 'done', 'shipped'] },
  { mood: '在铺开', words: ['设计', '方案', '规划', '调研', '对比', '评估', '整理'] }
];

const SLOTS = [
  [0, 5, '深夜'],
  [5, 8, '清晨'],
  [8, 12, '上午'],
  [12, 14, '午间'],
  [14, 18, '下午'],
  [18, 24, '夜间']
];

export function build({ collected, preset, state, config, now = Date.now() }) {
  const items = collected.items;
  if (!items.length) return { idle: true, at: now, from: collected.from, to: collected.to };

  const recent = items.slice(-40).reverse();
  const date = new Date(now);
  const keywords = topKeywords(recent.map((i) => i.text));
  const mood = moodOf(recent, date);
  const note = pickNote({
    notes: preset.notes,
    now,
    history: state.history,
    mood,
    gapHours: preset.note_gap_hours
  });
  // A note needs something to be held on and a way of being held toward the camera,
  // or it is just one more small thing in a corner nobody can read.
  const missing = ['notePoses', 'note_layout'].filter((key) => !preset[key]?.length);
  if (note && missing.length) {
    throw new Error('preset ' + preset.name + ' has notes but no ' + missing.join(' and '));
  }

  return {
    idle: false,
    at: now,
    from: collected.from,
    to: collected.to,
    topic: pickTopic(recent) || '(unnamed)',
    project: pickProject(items),
    keywords,
    slot: slotOf(date.getHours()),
    weekday: date.getDay() === 0 || date.getDay() === 6 ? 'weekend' : 'weekday',
    mood,
    scene: rotate(preset.scenes, state.history, 'scene'),
    note,
    interaction: rotate(note ? preset.notePoses : preset.interactions, state.history, 'interaction'),
    wish: config.wishes?.length ? rotate(config.wishes, state.history, 'wish') : null,
    props: pickProps({ recent, keywords, memory: collected.memory || [], state }),
    desk: (state.props || []).slice().sort((a, b) => b.last - a.last).slice(0, 2).map((p) => p.name),
    evidence: recent.slice(0, 3).map((i) => ({ source: i.source, project: i.project, text: i.text.slice(0, 80) }))
  };
}

// The newest line is often just "ok" or "继续". Take the newest line that carries
// enough to draw, so the picture is about the work and not about acknowledgements.
function pickTopic(recent) {
  const candidates = recent.slice(0, 12).filter((i) => i.text.length >= 6);
  if (!candidates.length) return null;
  let best = candidates[0];
  let bestScore = -1;
  candidates.forEach((item, index) => {
    const score = Math.min(item.text.length, 60) - index * 6;
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  });
  return best.text.slice(0, 60);
}

function pickProject(items) {
  const counts = new Map();
  for (const i of items) counts.set(i.project, (counts.get(i.project) || 0) + (i.source === 'cindy' ? 3 : 1));
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

// Words that show up in more than one turn, and are not machine identifiers.
export function topKeywords(texts, limit = 12) {
  const docs = new Map();
  const total = new Map();

  for (const text of texts) {
    const here = new Set();
    const bump = (word) => {
      if (!usable(word)) return;
      total.set(word, (total.get(word) || 0) + 1);
      here.add(word);
    };
    for (const run of String(text).match(/[A-Za-z][A-Za-z0-9_.+-]*|[\u4e00-\u9fa5]{2,}/g) || []) {
      if (/^[A-Za-z]/.test(run)) bump(run.toLowerCase());
      else for (let size = 2; size <= 4; size++) for (let i = 0; i + size <= run.length; i++) bump(run.slice(i, i + size));
    }
    for (const word of here) docs.set(word, (docs.get(word) || 0) + 1);
  }

  const scored = [...total.keys()]
    .map((word) => ({ word, docs: docs.get(word) || 1, count: total.get(word) }))
    .filter((k) => k.docs >= 2)
    .sort((a, b) => b.docs * b.word.length - a.docs * a.word.length || b.word.length - a.word.length || a.word.localeCompare(b.word));

  const picked = [];
  for (const k of scored) {
    if (picked.some((p) => p.word.includes(k.word))) continue;
    picked.push(k);
    if (picked.length >= limit) break;
  }
  return picked.map((k) => ({ word: k.word, weight: k.docs * k.word.length }));
}

function usable(word) {
  if (!word || STOP.has(word) || NOISE.has(word)) return false;
  if (/^[A-Za-z]/.test(word)) return /^[a-z][a-z0-9_.+-]*$/.test(word) && word.length <= 14 && !/[0-9]{3,}/.test(word);
  if (/[0-9A-Za-z]/.test(word)) return false;
  return !EDGE.test(word);
}

// The concrete, personal details that make a picture feel like it is about your own
// day: a measured size, an amount, and something out of the long memory.
function pickProps({ recent, keywords, memory, state }) {
  const text = recent.map((i) => i.text).join(' ');
  const found = [];

  for (const m of text.match(/\d+\s*[x×*]\s*\d+(\s*[x×*]\s*\d+)?/g) || []) found.push(m.replace(/\s+/g, ''));
  for (const m of text.match(/\d+(\.\d+)?\s*(米|万元|万|%|公里|km)/g) || []) found.push(m.replace(/\s+/g, ''));

  const known = new Set((state.props || []).map((p) => p.name));
  const fresh = found.filter((name) => !known.has(name));
  return [...new Set([...fresh, ...fromMemory({ memory, keywords, known })])].slice(0, 2);
}

// A note from months ago becomes an easter egg only if it has something to do
// with today, so memory is ranked by overlap with this hour first, age second.
function fromMemory({ memory, keywords, known }) {
  const words = (keywords || []).map((k) => k.word);
  return (memory || [])
    .filter((m) => m.title && !known.has(m.title) && !NOT_PROP.test(m.title))
    .map((m) => ({ m, hit: words.filter((w) => m.title.includes(w) || (m.text || '').includes(w)).length }))
    .sort((a, b) => b.hit - a.hit || b.m.at - a.m.at)
    .map((x) => x.m.title);
}

function slotOf(hour) {
  return SLOTS.find(([from, to]) => hour >= from && hour < to)?.[2] || '夜间';
}

function moodOf(recent, date) {
  const text = recent.slice(0, 15).map((i) => i.text).join(' ').toLowerCase();
  const hit = SIGNALS.find((s) => s.words.some((w) => text.includes(w)));
  const load = recent.length >= 20 ? '节奏很密' : recent.length <= 4 ? '节奏很松' : '节奏平稳';
  return [slotOf(date.getHours()), hit?.mood, load].filter(Boolean).join('，');
}
