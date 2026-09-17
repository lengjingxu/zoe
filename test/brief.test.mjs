import test from 'node:test';
import assert from 'node:assert/strict';
import { build, topKeywords } from '../src/brief.mjs';
import { compose } from '../src/prompt.mjs';

const preset = {
  style: 'STYLE',
  character: 'CHARACTER',
  layout: 'LAYOUT',
  negative: ['CGI'],
  scenes: [{ id: 'a', desc: 'scene a' }, { id: 'b', desc: 'scene b' }],
  interactions: [{ id: 'A', desc: 'interaction a' }, { id: 'B', desc: 'interaction b' }],
  idle: 'idle scene'
};

const item = (text, minutesAgo, extra = {}) => ({
  at: 1789650000000 - minutesAgo * 60000,
  source: 'cindy',
  project: 'demo',
  text,
  ...extra
});

const collected = (items, memory = []) => ({ from: 0, to: 1789650000000, items, memory });

test('an empty window has nothing to draw', () => {
  const brief = build({ collected: collected([]), preset, state: { history: [], props: [] }, config: {} });
  assert.equal(brief.idle, true);
  assert.throws(() => compose({ brief, preset }), /idle/);
});

test('the scene rotates instead of repeating', () => {
  const state = { history: [], props: [] };
  const items = [item('优惠券分类', 1)];
  const first = build({ collected: collected(items), preset, state, config: {} });
  state.history.push({ scene: first.scene.id, interaction: first.interaction.id });
  const second = build({ collected: collected(items), preset, state, config: {} });
  assert.notEqual(first.scene.id, second.scene.id);
  state.history.push({ scene: second.scene.id, interaction: second.interaction.id });
  const third = build({ collected: collected(items), preset, state, config: {} });
  assert.equal(third.scene.id, first.scene.id, 'with two options it goes back to the first');
});

test('identifiers and one-off fragments are not keywords', () => {
  const words = topKeywords([
    'alipayjsessionid 是 一回事，优惠券分类要看',
    'alipayjsessionid 又变了，优惠券分类还是老样子',
    '人物在画 我说过一句就没了'
  ]).map((k) => k.word);
  assert.ok(!words.some((w) => w.includes('session')), JSON.stringify(words));
  assert.ok(words.some((w) => w.includes('优惠券')), JSON.stringify(words));
  assert.ok(!words.includes('人物在画'), JSON.stringify(words));
});

test('props are things, not turns of phrase', () => {
  const brief = build({
    collected: collected([item('电梯长 145x157x236，斜着放 3 米杆子行不行', 2)], [
      { title: '优惠券分类口径', text: '低于7折算混补' },
      { title: '怎么提取记忆', text: 'x' }
    ]),
    preset,
    state: { history: [], props: [] },
    config: {}
  });
  assert.deepEqual(brief.props, ['145x157x236', '3米']);
  assert.ok(!brief.props.some((p) => p.includes('怎么')), JSON.stringify(brief.props));
});

test('a note from long memory has to touch today to lead the picture', () => {
  const brief = build({
    collected: collected(
      [item('优惠券分类口径要改成混补', 1), item('优惠券分类口径再确认一下', 2)],
      [
        { at: 1, title: '家庭税务结构', text: '工资与小微收款' },
        { at: 2, title: '优惠券分类规范', text: '低于7折是混补' }
      ]
    ),
    preset,
    state: { history: [], props: [] },
    config: {}
  });
  assert.equal(brief.props[0], '优惠券分类规范', JSON.stringify(brief.props));
  assert.ok(brief.props.includes('家庭税务结构'), 'the unrelated one still reaches the desk, just second');
});

test('the prompt carries style, the moment, the layout and the open area', () => {
  const brief = build({
    collected: collected([item('把优惠券分类的口径改成低于7折算混补', 1)]),
    preset,
    state: { history: [], props: [] },
    config: {}
  });
  const text = compose({ brief, preset });
  assert.ok(text.includes('STYLE'));
  assert.ok(text.includes('CHARACTER'));
  assert.ok(text.includes('LAYOUT'));
  assert.ok(text.includes('低于7折算混补'), 'the picture is tied to what is happening now');
  assert.ok(text.includes('Avoid: CGI'));
  assert.ok(text.length < 2500);
});

test('a long topic is cut short, on a boundary when there is one', () => {
  const long = '把优惠券分类的口径改成低于7折算混补，85折以上算品牌券，剩下的都算联合券，另外神价券单独一个分类';
  const brief = build({
    collected: collected([item(long, 1)]),
    preset,
    state: { history: [], props: [] },
    config: {}
  });
  const text = compose({ brief, preset });
  const line = text.split('\n').find((l) => l.includes('in the middle of this right now'));
  assert.ok(line.length < 90, line);
  assert.ok(!line.includes('神价券'), 'the tail is dropped: ' + line);
  assert.ok(line.includes('低于7折'), 'the start is kept: ' + line);
});
