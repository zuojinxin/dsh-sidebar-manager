/* Ad-hoc probe: with a slot registry present, do two same-named entries become
   DISTINCT records? The registry is what the host's own sidebar shell reads, so
   the fixture supplies it the way the host would.
   Run: node test/probe-panel-id.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const { JSDOM } = require_(process.env.SNC_JSDOM || 'jsdom');
const path = fileURLToPath(new URL('../lib/client.js', import.meta.url));
const KEY = 'dsh-sidebar-nav-collapse:state';
const code = fs.readFileSync(path, 'utf8');

const entry = (label, glyph = '*') =>
  `<div class="wtg9ga_panelEntry wtg9ga_panelEntryWide">` +
  `<button class="wtg9ga_panelRow" aria-label="${label}">` +
  `<span class="wtg9ga_panelGlyph">${glyph}</span><span class="wtg9ga_panelTitle">${label}</span></button>` +
  `<button type="button" class="wtg9ga_panelUnpin" aria-label="从侧边栏取消固定${label}">p</button></div>`;
/* the two same-named rows draw DIFFERENT icons, which is what the plugin uses to
   tie each row to its registered id */
const nav = (rows) =>
  `<nav class="wtg9ga_panelList" aria-label="全局面板">${rows.map((r) => entry(r.label, r.glyph)).join('')}</nav>`;

/* the host's slot registry, in the shape ctx.slots exposes: entriesOfSlot(key)
   returns [{ options: { id, label, order } }] */
function makeSlots(panels) {
  return {
    entriesOfSlot: () => panels.map((p) => ({ options: { id: p.id, label: p.label, order: p.order ?? 0 } })),
    subscribe: () => () => {},
  };
}

function boot(rows, record, panels) {
  const dom = new JSDOM(`<!doctype html><html><body>${nav(rows)}</body></html>`, { url: 'http://localhost/' });
  const doc = dom.window.document;
  dom.window.localStorage.setItem(KEY, JSON.stringify(record));
  doc.addEventListener('click', (event) => {
    const pin = event.target.closest && event.target.closest('button[class*="panelUnpin"]');
    if (!pin) return;
    pin.closest('[class*="panelEntry"]')?.remove();
  }, true);
  let bundle;
  vm.runInNewContext(code, {
    window: Object.assign(dom.window, { __ModuleLoader__: { load: (v) => { bundle = v; } } }),
    document: doc,
    MutationObserver: dom.window.MutationObserver,
  });
  const client = bundle.factory(() => { throw Error('unexpected dependency'); });
  const slots = makeSlots(panels);
  const disposers = [];
  /* the host provides every declared dependency as a property on ctx, which is
     why the plugin declares `inject: ['slots']` */
  client.apply({
    effect: (fn) => { disposers.push(fn()); },
    slots,
    get: (name) => (name === 'slots' ? slots : undefined),
  });
  return { doc, dom, disposers };
}
const settle = async () => { for (let i = 0; i < 14; i += 1) await new Promise((r) => setTimeout(r, 0)); };
const stateOf = (dom) => JSON.parse(dom.window.localStorage.getItem(KEY));
const labelsOf = (doc) => [...doc.querySelectorAll('nav button[class*="panelRow"]')]
  .map((b) => b.getAttribute('aria-label'));
const ROWS = [{ label: '笔记', glyph: 'A' }, { label: '笔记', glyph: 'B' }, { label: '任务看板', glyph: 'C' }];
const base = (over = {}) => ({ v: 3, folded: false, hidden: [], views: [], actions: [], order: [], orderViews: [], pins: [], ...over });
let bad = 0;
const report = (label, ok, detail) => {
  if (!ok) bad += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}\n       ${detail}`);
};

/* two different plugins, both showing 笔记, with distinct registered ids */
const PANELS = [
  { id: 'plugin-a.notes', label: '笔记' },
  { id: 'plugin-b.notes', label: '笔记' },
  { id: 'plugin-c.board', label: '任务看板' },
];

/* 1. unpin the FIRST 笔记: the record must name plugin-a, not the label */
{
  const run = boot(ROWS, base(), PANELS);
  await settle();
  const first = [...run.doc.querySelectorAll('[class*="panelEntry"]')]
    .filter((el) => el.querySelector('[class*="panelRow"]').getAttribute('aria-label') === '笔记')[0];
  first.querySelector('button[class*="panelUnpin"]').click();
  await settle();
  const s = stateOf(run.dom);
  report('取消固定一条：记录按真实 id 存', JSON.stringify(s.pins) === JSON.stringify(['plugin-a.notes']),
    `pins=${JSON.stringify(s.pins)} 期望=["plugin-a.notes"]`);
  report('另一条同名入口保留', labelsOf(run.doc).filter((n) => n === '笔记').length === 1,
    `侧栏=${JSON.stringify(labelsOf(run.doc))}`);
  run.disposers.reverse().forEach((f) => f());
}

/* 2. restart with plugin-a remembered: only THAT row is taken */
{
  const run = boot(ROWS, base({ pins: ['plugin-a.notes'] }), PANELS);
  await settle();
  const left = labelsOf(run.doc);
  report('重启：只有被记住的那一条被取消固定',
    left.filter((n) => n === '笔记').length === 1,
    `侧栏=${JSON.stringify(left)} （id 区分成功，另一条笔记没被误伤）`);
  run.disposers.reverse().forEach((f) => f());
}

/* 3. hiding one same-named entry: also per id now */
{
  const run = boot(ROWS, base(), PANELS);
  await settle();
  const gear = run.doc.querySelector('.snc-bud');
  gear.click();
  const box = run.doc.querySelectorAll('[data-snc-check]')[0];
  box.checked = false;
  box.dispatchEvent(new run.dom.window.Event('change', { bubbles: true }));
  await settle();
  gear.click();
  await settle();
  const s = stateOf(run.dom);
  report('隐藏一条：记录按真实 id 存', JSON.stringify(s.hidden) === JSON.stringify(['plugin-a.notes']),
    `hidden=${JSON.stringify(s.hidden)} 侧栏=${JSON.stringify(labelsOf(run.doc))}`);
  run.disposers.reverse().forEach((f) => f());
}

/* 4. no registry at all: falls back to labels, unchanged behaviour */
{
  const run = boot([{ label: '笔记', glyph: 'A' }, { label: '任务看板', glyph: 'B' }], base(), []);
  await settle();
  const first = [...run.doc.querySelectorAll('[class*="panelEntry"]')]
    .find((el) => el.querySelector('[class*="panelRow"]').getAttribute('aria-label') === '笔记');
  first.querySelector('button[class*="panelUnpin"]').click();
  await settle();
  const s = stateOf(run.dom);
  report('没有 registry 时回退到标签（旧行为不变）', JSON.stringify(s.pins) === JSON.stringify(['笔记']),
    `pins=${JSON.stringify(s.pins)} 期望=["笔记"]`);
  run.disposers.reverse().forEach((f) => f());
}

console.log(bad === 0 ? '\n有 registry 时按 id 区分；没有时退回标签' : `\n${bad} 项与预期不符`);



