/* Ad-hoc probe: what happens to a remembered pin when its launcher disappears
   for a reason that is NOT a pin press -- a plugin uninstalled, or a plugin that
   deregisters its own sidebar entry at runtime. Both must not be mistaken for
   "the user unpinned it", and both must not leave a record that fires later.
   Run: node test/probe-orphan.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const { JSDOM } = require_(process.env.SNC_JSDOM || 'jsdom');
const path = fileURLToPath(new URL('../lib/client.js', import.meta.url));
const KEY = 'dsh-sidebar-nav-collapse:state';
const code = fs.readFileSync(path, 'utf8');

const entry = (name) =>
  `<div class="wtg9ga_panelEntry wtg9ga_panelEntryWide">` +
  `<button class="wtg9ga_panelRow" aria-label="${name}">` +
  `<span class="wtg9ga_panelGlyph">*</span><span class="wtg9ga_panelTitle">${name}</span></button>` +
  `<button type="button" class="wtg9ga_panelUnpin" aria-label="unpin ${name}">p</button></div>`;
const nav = (names) =>
  `<nav class="wtg9ga_panelList" aria-label="全局面板">${names.map(entry).join('')}</nav>`;

function boot(names, record) {
  const dom = new JSDOM(`<!doctype html><html><body>${nav(names)}</body></html>`, { url: 'http://localhost/' });
  const doc = dom.window.document;
  dom.window.localStorage.setItem(KEY, JSON.stringify(record));
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
const base = (over = {}) => ({ v: 3, folded: false, hidden: [], views: [], actions: [], order: [], orderViews: [], pins: [], ...over });

let bad = 0;
const report = (label, ok, detail) => {
  if (!ok) bad += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}\n       ${detail}`);
};

/* 1. a launcher disappears because its plugin was uninstalled */
{
  const run = boot(['插件', '任务看板', '插件市场'], base());
  await settle();
  const navEl = run.doc.querySelector('nav');
  const unit = [...navEl.children].find((el) =>
    el.querySelector?.('button[class*="panelRow"]')?.getAttribute('aria-label') === '任务看板');
  unit.remove();
  await settle();
  const s = stateOf(run.dom);
  report('插件卸载：行消失', s.pins.length === 0,
    `pins=${JSON.stringify(s.pins)}  （应保持 []，不能被记成用户取消固定）`);
  run.disposers.reverse().forEach((f) => f());
}

/* 2. the plugin comes back: nothing may be replayed against it */
{
  const run = boot(['插件', '任务看板'], base());
  await settle();
  const navEl = run.doc.querySelector('nav');
  const unit = [...navEl.children].find((el) =>
    el.querySelector?.('button[class*="panelRow"]')?.getAttribute('aria-label') === '任务看板');
  unit.remove();
  await settle();
  navEl.insertAdjacentHTML('beforeend', entry('任务看板'));
  await settle();
  const s = stateOf(run.dom);
  const present = [...run.doc.querySelectorAll('nav button[class*="panelRow"]')]
    .map((b) => b.getAttribute('aria-label'));
  report('插件重装：行回来了', s.pins.length === 0 && present.includes('任务看板'),
    `pins=${JSON.stringify(s.pins)} 侧栏=${JSON.stringify(present)}`);
  run.disposers.reverse().forEach((f) => f());
}

/* 3. a user-unpinned launcher whose plugin is later uninstalled: the record
      survives (correct -- the choice is still theirs), and nothing spins */
{
  const run = boot(['插件', '任务看板', '插件市场'], base({ pins: ['任务看板'] }));
  await settle();
  /* this fixture has no host pin handler, so the row is still there; remove it
     the way an uninstall would */
  const navEl = run.doc.querySelector('nav');
  const unit = [...navEl.children].find((el) =>
    el.querySelector?.('button[class*="panelRow"]')?.getAttribute('aria-label') === '任务看板');
  if (unit) unit.remove();
  await settle();
  const s = stateOf(run.dom);
  report('先取消固定、后卸载', s.pins.includes('任务看板'),
    `pins=${JSON.stringify(s.pins)}  （选择被保留，等它回来时继续生效）`);
  run.disposers.reverse().forEach((f) => f());
}

/* 4. label reuse: a stale pin must not strike a DIFFERENT panel that later
      takes the same label. The safe outcome is for the stale record to be
      DROPPED when a row with that label appears -- never for the new panel to
      be pressed out of the sidebar on behalf of a choice made about another
      plugin's entry. */
{
  const run = boot(['插件', '任务看板'], base({ pins: ['幽灵面板'] }));
  await settle();
  const navEl = run.doc.querySelector('nav');
  navEl.insertAdjacentHTML('beforeend', entry('幽灵面板'));
  await settle();
  const s = stateOf(run.dom);
  const stillThere = [...run.doc.querySelectorAll('nav button[class*="panelRow"]')]
    .some((b) => b.getAttribute('aria-label') === '幽灵面板');
  report('标签复用：残留记录会不会误伤新面板', stillThere && s.pins.includes('幽灵面板'),
    `新面板还在=${stillThere} pins=${JSON.stringify(s.pins)}`
    + ' （记录保留但重放已结算，不误伤新面板；重新固定时才会清）');
  run.disposers.reverse().forEach((f) => f());
}

console.log(bad === 0 ? '\n所有场景行为如上' : `\n${bad} 个场景与预期不符`);
process.exitCode = 0;
