/* Ad-hoc probe: what happens when TWO panels carry the SAME label?
   DSH renders each row with `key={id}` and `aria-label={label}`, so the id is
   unique but the label is not. This plugin keys everything (hidden, order, pins)
   on the label, because the host renders no id attribute on the row.
   Run: node test/probe-duplicate-label.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const { JSDOM } = require_(process.env.SNC_JSDOM || 'jsdom');
const path = fileURLToPath(new URL('../lib/client.js', import.meta.url));
const KEY = 'dsh-sidebar-nav-collapse:state';
const code = fs.readFileSync(path, 'utf8');

const entry = (label) =>
  `<div class="wtg9ga_panelEntry wtg9ga_panelEntryWide">` +
  `<button class="wtg9ga_panelRow" aria-label="${label}">` +
  `<span class="wtg9ga_panelTitle">${label}</span></button>` +
  `<button type="button" class="wtg9ga_panelUnpin" aria-label="unpin ${label}">p</button></div>`;
const nav = (labels) =>
  `<nav class="wtg9ga_panelList" aria-label="全局面板">${labels.map(entry).join('')}</nav>`;

function boot(labels, record) {
  const dom = new JSDOM(`<!doctype html><html><body>${nav(labels)}</body></html>`, { url: 'http://localhost/' });
  const doc = dom.window.document;
  dom.window.localStorage.setItem(KEY, JSON.stringify(record));
  doc.addEventListener('click', (event) => {
    const pin = event.target.closest && event.target.closest('button[class*="panelUnpin"]');
    if (!pin) return;
    const unit = pin.closest('[class*="panelEntry"]');
    if (unit) unit.remove();
  }, true);
  let bundle;
  vm.runInNewContext(code, {
    window: Object.assign(dom.window, { __ModuleLoader__: { load: (v) => { bundle = v; } } }),
    document: doc,
    MutationObserver: dom.window.MutationObserver,
  });
  const client = bundle.factory(() => { throw Error('unexpected dependency'); });
  const disposers = [];
  client.apply({ effect: (fn) => { disposers.push(fn()); } });
  return { doc, dom, disposers };
}
const settle = async () => { for (let i = 0; i < 12; i += 1) await new Promise((r) => setTimeout(r, 0)); };
const stateOf = (dom) => JSON.parse(dom.window.localStorage.getItem(KEY));
const labelsOf = (doc) => [...doc.querySelectorAll('nav button[class*="panelRow"]')]
  .map((b) => b.getAttribute('aria-label'));
const base = (over = {}) => ({ v: 3, folded: false, hidden: [], views: [], actions: [], order: [], orderViews: [], pins: [], ...over });
const close = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('场景：两个插件都叫「笔记」，是两条不同的面板行\n');

/* 1. hiding one by its checkbox hides BOTH */
{
  const run = boot(['笔记', '笔记', '插件'], base());
  await settle();
  const gear = run.doc.querySelector('.snc-bud');
  gear.click();
  /* uncheck the FIRST 笔记 row */
  const box = run.doc.querySelectorAll('[data-snc-check]')[0];
  box.checked = false;
  box.dispatchEvent(new run.dom.window.Event('change', { bubbles: true }));
  await settle();
  gear.click();
  await settle();
  const live = labelsOf(run.doc);
  console.log(`隐藏第一条「笔记」后：侧栏=${JSON.stringify(live)}`);
  console.log(`  ${live.filter((n) => n === '笔记').length === 0
    ? '⚠ 两条都消失了（隐藏按标签记录，同名共用一条记录）'
    : '✓ 只影响一条'}`);
  run.disposers.reverse().forEach((f) => f());
}

/* 2. unpinning one by its pin removes -- and remembers -- which one? */
{
  const run = boot(['笔记', '笔记', '插件'], base());
  await settle();
  const first = [...run.doc.querySelectorAll('[class*="panelEntry"]')]
    .find((el) => el.querySelector('[class*="panelRow"]').getAttribute('aria-label') === '笔记');
  first.querySelector('button[class*="panelUnpin"]').click();
  await settle();
  const live = labelsOf(run.doc);
  const s = stateOf(run.dom);
  console.log(`\n按第一条「笔记」的图钉后：侧栏=${JSON.stringify(live)}`);
  console.log(`  pins=${JSON.stringify(s.pins)}`);
  console.log(`  ${live.filter((n) => n === '笔记').length === 1
    ? '✓ 只移除了一条，另一条保留'
    : '⚠ 两条都被移除'}`);
  run.disposers.reverse().forEach((f) => f());
}

/* 3. the reload: does the remembered "笔记" strike BOTH on next boot? */
{
  const run = boot(['笔记', '笔记', '插件'], base({ pins: ['笔记'] }));
  await settle();
  await settle();
  const live = labelsOf(run.doc);
  const kept = live.filter((n) => n === '笔记').length;
  console.log(`\n带着 pins=['笔记'] 重启：侧栏=${JSON.stringify(live)}`);
  console.log(`  ${kept === 1 ? '✓ 只取消固定一条，同名面板未被误伤' : `⚠ 记录命中 ${2 - kept} 条，用户只按过一次`}`);
  run.disposers.reverse().forEach((f) => f());
}

/* 4. order: two identical labels -- can they even be ordered independently? */
{
  const run = boot(['A', '笔记', '笔记', 'Z'], base({ order: ['Z', '笔记', '笔记', 'A'] }));
  await settle();
  const live = labelsOf(run.doc);
  console.log(`\n保存顺序 [Z,笔记,笔记,A] 应用后：${JSON.stringify(live)}`);
  console.log(`  ${close(live, ['Z', '笔记', '笔记', 'A']) ? '✓ 顺序可复现' : '⚠ 顺序无法区分两条同名项'}`);
  run.disposers.reverse().forEach((f) => f());
}

console.log('\n结论：同名入口在当前实现下是「同一条记录」——隐藏、固定、排位都共用。');
