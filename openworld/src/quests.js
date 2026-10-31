/* 任务：数据驱动的一串步骤（去某处 / 找人 / 采集 / 杀敌 / 互动），
   追踪条 + 画面里的路标按当前步骤的目标点算。 */
import { PLACES } from './world/layout.js';

export const QUESTS = [
  { id: 'arrive', name: '初到渡头', auto: true, giver: null, desc: '溪边的小村，先找村里管事的里正说上话。',
    steps: [{ type: 'talk', npc: '里正', text: '去找里正', at: [-96, 30] }], reward: { coins: 10 } },
  { id: 'herbs', name: '阿婆的药', giver: '渡头阿婆', desc: '阿婆咳了半月，要三株七叶草熬药。竹坞里最多。',
    steps: [{ type: 'collect', item: 'herb', count: 3, text: '采七叶草', at: [PLACES.bamboo.x, PLACES.bamboo.z] }, { type: 'talk', npc: '渡头阿婆', text: '把药草交给阿婆', at: [-118, 36] }],
    reward: { coins: 30 } },
  { id: 'bandits', name: '黑石寨', giver: '里正', requires: ['arrive'], desc: '黑石寨的山贼三番五次下山抢粮，县兵又不来。里正托你去收拾几个。',
    steps: [{ type: 'kill', camp: 'camp1', count: 3, text: '击退黑石寨山贼', at: [PLACES.camp1.x, PLACES.camp1.z] }, { type: 'talk', npc: '里正', text: '回去向里正复命', at: [-96, 30] }],
    reward: { coins: 80 } },
  { id: 'beacon', name: '青屏烽火', giver: '里正', requires: ['bandits'], desc: '山贼虽退，寨子还在。点起青屏烽台，县城看见烽火才会派兵。',
    steps: [{ type: 'interact', id: 'beacon', text: '登上青屏山，点燃烽火', at: [PLACES.beacon.x, PLACES.beacon.z] }], reward: { coins: 100, maxHp: 10 } },
  { id: 'pray', name: '山神祠的香火', giver: '守祠的老道', desc: '祠里香火断了三年。上一炷香，山神会记得你。',
    steps: [{ type: 'interact', id: 'shrine', text: '在山神祠上香', at: [PLACES.shrine.x, PLACES.shrine.z] }], reward: { coins: 20, maxHp: 10 } },
  { id: 'ferry', name: '泛舟一程', giver: '船夫老周', desc: '老周的乌篷船借你划一程，顺溪往南。',
    steps: [{ type: 'boat', dist: 80, text: '划乌篷船离开埠头 80 米', at: [PLACES.dock.x, PLACES.dock.z] }], reward: { coins: 20 } },
];

export function createQuests(world) {
  const state = {};   // id -> {status, step, n, boatStart}
  for (const q of QUESTS) state[q.id] = { status: q.auto ? 'active' : 'locked', step: 0, n: 0 };
  let tracked = 'arrive';
  const byId = id => QUESTS.find(q => q.id === id);

  function available(q) {
    const s = state[q.id]; if (s.status !== 'locked') return false;
    return !(q.requires || []).some(r => state[r].status !== 'done');
  }
  function start(id) { const s = state[id]; if (s.status !== 'locked') return; s.status = 'active'; s.step = 0; s.n = 0; if (!tracked || state[tracked].status !== 'active') tracked = id; world.notify(`接下任务：${byId(id).name}`); }
  function advance(q) {
    const s = state[q.id]; s.step++; s.n = 0;
    if (s.step >= q.steps.length) {
      s.status = 'done'; const r = q.reward || {};
      if (r.coins) world.giveCoins(r.coins); if (r.maxHp) world.player.maxHp += r.maxHp;
      world.notify(`任务完成：${q.name}${r.coins ? ` · 得铜钱 ${r.coins}` : ''}`);
      if (tracked === q.id) tracked = QUESTS.find(x => state[x.id].status === 'active')?.id || null;
    } else world.notify(`${q.name}：${q.steps[s.step].text}`);
  }
  const current = () => { const q = tracked && byId(tracked); if (!q || state[q.id].status !== 'active') return null; return { q, s: state[q.id], step: q.steps[state[q.id].step] }; };

  /** 事件：talk(npcName) / collect(item) / kill(campId) / interact(id) / boat(distance) */
  function event(type, payload) {
    for (const q of QUESTS) {
      const s = state[q.id]; if (s.status !== 'active') continue;
      const st = q.steps[s.step]; if (st.type !== type) continue;
      if (type === 'talk' && st.npc === payload) { if (st.type === 'talk' && q.steps[s.step - 1]?.type === 'collect') world.takeItem(q.steps[s.step - 1].item, q.steps[s.step - 1].count); advance(q); }
      else if (type === 'collect' && st.item === payload) { s.n = world.countItem(payload); if (s.n >= st.count) advance(q); }
      else if (type === 'kill' && st.camp === payload) { s.n++; if (s.n >= st.count) advance(q); }
      else if (type === 'interact' && st.id === payload) advance(q);
      else if (type === 'boat' && payload >= st.dist) advance(q);
    }
  }
  /** 和 NPC 说话时：有可接的任务就接，正好是当前步骤的目标就推进。返回要显示的台词。 */
  function talk(npc) {
    const name = npc.def.name;
    event('talk', name);
    const give = npc.def.quest && byId(npc.def.quest);
    if (give && available(give)) { start(give.id); return { name, text: give.desc, quest: give.name }; }
    const cur = current();
    if (cur && cur.step.type === 'talk' && cur.step.npc === name) return { name, text: '去吧，我等你的消息。' };
    const active = QUESTS.find(q => q.giver === name && state[q.id].status === 'active');
    if (active) return { name, text: `${active.steps[state[active.id].step].text}，别耽搁。` };
    return { name, text: npc.def.lines[Math.floor(Math.random() * npc.def.lines.length)] };
  }
  function progressText(q) { const s = state[q.id]; if (s.status !== 'active') return ''; const st = q.steps[s.step]; return st.count ? `${st.text} ${Math.min(s.n, st.count)}/${st.count}` : st.text; }
  function serialize() { return { state: JSON.parse(JSON.stringify(state)), tracked }; }
  function restore(d) { if (!d) return; for (const id in d.state) if (state[id]) Object.assign(state[id], d.state[id]); tracked = d.tracked; }

  return { QUESTS, state, start, event, talk, current, progressText, available, serialize, restore, get tracked() { return tracked; }, set tracked(v) { tracked = v; } };
}
