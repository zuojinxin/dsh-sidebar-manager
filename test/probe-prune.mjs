/* Ad-hoc probe: "只管理已有的入口" -- an entry that is gone must lose its record.
   The subtlety this checks: an UNPINNED entry is also absent from the sidebar, so
   absence alone cannot mean "gone". The list's own "更多" menu is the one place
   that distinguishes them.
   Run: node test/probe-prune.mjs */
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
  `<span class="wtg9ga_panelGlyph">*</span><span class="wtg9ga_panelTitle">${label}</span></button>` +
  `<button type="button" class="wtg9ga_panelUnpin" aria-label="从侧边栏取消固定${label}">p</button></div>`;
const nav = (labels) =>
  `<nav class="wtg9ga_panelList" aria-label="全局面板">${labels.map(entry).join('')}</nav>`;
/* the host's own "更多" menu: one row per unpinned launcher, rendered from the
   live panel registry. That is the evidence this prune reads. */
const menu = (labels) =>
  `<div class="EWdd3W_viewsMoreMenu" role="menu">${labels.map((l) =>
    `<div class="EWdd3W_sidebarEntry"><button type="button" role="menuitem">` +
    `<span class="EWdd3W_entryName"><span class="EWdd3W_entryTitle">${l}</span></span></button>` +
    `<span class="EWdd3W_pinAnchor"><button type="button" role="menuitem" class="EWdd3W_pinButton"` +
    ` aria-label="将${l}固定到侧边栏"></button></span></div>`).join('')}</div>`;

function boot(labels, record, menuLabels = []) {
  const dom = new JSDOM(
    `<!doctype html><html><body>${nav(labels)}${menuLabels.length > 0 ? `<div id="menu">${menu(menuLabels)}</div>` : ''}</body></html>`,
    { url: 'http://localhost/' });
  const doc = dom.window.document;
  dom.window.localStorage.setItem(KEY, JSON.stringify(record));
  let presses = 0;
  doc.addEventListener('click', (event) => {
    const pin = event.target.closest && event.target.closest('button[class*="panelUnpin"]');
    if (!pin) return;
    presses += 1;
    pin.closest('[class*="panelEntry"]')?.remove();
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
  return { doc, dom, disposers, stats: () => ({ presses }) };
}
/* Pruning happens only at a STATED MOMENT -- boot, entering edit mode, or the
   page becoming visible -- never on a passing frame. So a scenario that expects a
   record to be dropped has to trigger one of those moments, and a scenario that
   expects one to survive must not. */
const settle = async (doc) => {
  for (let i = 0; i < 10; i += 1) await new Promise((r) => setTimeout(r, 0));
};
/* enter edit mode: one of the three moments that may prune */
const stateMoment = async (doc) => {
  const gear = doc.querySelector('.snc-bud');
  if (gear !== null) gear.click();
  for (let i = 0; i < 10; i += 1) await new Promise((r) => setTimeout(r, 0));
};
const stateOf = (dom) => JSON.parse(dom.window.localStorage.getItem(KEY));
const base = (over = {}) => ({ v: 3, folded: false, hidden: [], views: [], actions: [], order: [], orderViews: [], pins: [], ...over });
let bad = 0;
const report = (label, ok, detail) => {
  if (!ok) bad += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}\n       ${detail}`);
};

/* 1. plugin uninstalled: row gone AND absent from the menu -> record dropped */
{
  const run = boot(['插件', '任务看板'], base({ pins: ['任务看板'] }), ['任务看板']);
  await settle(run.doc);
  const before = stateOf(run.dom);
  /* the plugin is uninstalled: the host stops rendering the row AND drops it
     from the menu (its panel is no longer registered) */
  run.doc.getElementById('menu').innerHTML = '';
  run.doc.querySelector('nav').innerHTML = '';
  run.doc.querySelector('nav').insertAdjacentHTML('beforeend', entry('插件'));
  await settle(run.doc);
  /* no prune yet: a bare redraw is not evidence... */
  const idle = stateOf(run.dom);
  /* ...but entering edit mode is a stated moment, and there it goes */
  await stateMoment(run.doc);
  const after = stateOf(run.dom);
  report('插件卸载：重渲染不清，编辑态才清',
    idle.pins.length === 1 && after.pins.length === 0,
    `之前 pins=${JSON.stringify(before.pins)} → 重渲染后=${JSON.stringify(idle.pins)} → 编辑态后=${JSON.stringify(after.pins)}`);
  run.disposers.reverse().forEach((f) => f());
}

/* 2. merely unpinned: row gone from the sidebar but STILL in the menu -> kept */
{
  const run = boot(['插件'], base({ pins: ['任务看板'] }), ['任务看板']);
  await settle(run.doc);
  const after = stateOf(run.dom);
  report('只是取消固定：记录保留', after.pins.includes('任务看板'),
    `pins=${JSON.stringify(after.pins)} （行不在侧栏，但在「更多」里）`);
  run.disposers.reverse().forEach((f) => f());
}

/* 3. hidden entry still in the list: keep; hidden entry gone: drop */
{
  const run = boot(['插件', '任务看板'], base({ hidden: ['任务看板'] }));
  await settle(run.doc);
  const kept = stateOf(run.dom).hidden;
  /* now the plugin goes away entirely */
  run.doc.querySelector('nav').innerHTML = entry('插件');
  await settle(run.doc);
  const midRedraw = stateOf(run.dom).hidden;
  await stateMoment(run.doc);
  const dropped = stateOf(run.dom).hidden;
  report('隐藏的入口：还在就留，消失后等时机才清',
    kept.length === 1 && midRedraw.length === 1 && dropped.length === 0,
    `在时 hidden=${JSON.stringify(kept)} → 消失后(重渲染)=${JSON.stringify(midRedraw)} → 编辑态后=${JSON.stringify(dropped)}`);
  run.disposers.reverse().forEach((f) => f());
}

/* 4. the user's own pin press must still be recorded, with the menu CLOSED --
      which is the normal state (the menu only exists while it is open) */
{
  /* the real steady state: no menu element in the document at all */
  const run = boot(['插件', '任务看板'], base(), []);
  [...run.doc.querySelectorAll('[class*="panelEntry"]')]
    .find((el) => el.querySelector('[class*="panelRow"]').getAttribute('aria-label') === '任务看板')
    .querySelector('button[class*="panelUnpin"]').click();
  await settle(run.doc);
  const after = stateOf(run.dom);
  report('用户按图钉（菜单未打开）：记录写入', after.pins.includes('任务看板'),
    `pins=${JSON.stringify(after.pins)} 宿主按压=${run.stats().presses}`);
  run.disposers.reverse().forEach((f) => f());
}

console.log(bad === 0 ? '\n入口消失即清记录，且不影响正常取消固定' : `\n${bad} 项与预期不符`);





