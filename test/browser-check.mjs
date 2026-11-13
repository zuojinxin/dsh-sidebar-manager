// node test/browser-check.mjs — the real plugin in a real browser.
//
// jsdom proves the DOM plumbing but not the cascade: it does not lay anything
// out, and its selector engine is not Chromium's, so a rule such as
// `nav > :has(> button.panelRow)` cannot be verified there at all. This script
// closes that gap the same way docs/render-demo.mjs does -- headless Edge, the
// real lib/client.js injected verbatim, invented data -- and then drives the
// plugin through the exact interaction that broke: the host's own "more" entry,
// which DSH 0.2.1-rc.3 renders as a row wrapped in an anchor element rather
// than a bare <button> child of the list.
//
// The fixture copies the host's markup and the host's geometry, because the
// drag path hit-tests real boxes: with invented sizes the drop target would
// never match and the check would pass for the wrong reason.
//
//   node test/browser-check.mjs            (SNC_EDGE overrides the browser path)
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const EDGE = process.env.SNC_EDGE ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const STORE = 'dsh-sidebar-nav-collapse:state';

/* ---- the fixture: DSH's panel list as 0.2.2-rc.2 emits it ----
   The class prefix is the build's own (`wtg9ga_`); the plugin matches on the
   key fragment (`panelList` / `panelRow` / `moreAnchor`), so using the real
   prefix also proves it does not depend on a particular hash.

   Since 0.2.2-rc.2 the sidebar scroll body is a CSS Grid with explicit
   placement, not a flex column: .scrollArea carries
   grid-template-columns 4px minmax(0,1fr) …, grid-template-rows
   8px max-content 2px max-content, and its two host children claim their cells
   (.panelList 2/2, .regionArea 2/4). An unplaced child auto-flows into that 4px
   gutter and the 8px first row -- which is exactly how the wrapper broke, so the
   fixture has to reproduce the grid or the check cannot see the failure at all. */
const row = (label) =>
  `<button type="button" class="wtg9ga_panelRow" aria-label="${label}">` +
  `<span class="wtg9ga_panelGlyph">▦</span><span class="wtg9ga_panelTitle">${label}</span></button>`;
const entry = (label) => `<div class="wtg9ga_panelEntry wtg9ga_panelEntryWide">${row(label)}</div>`;
const moreRow = (label = '更多') =>
  `<span class="wtg9ga_moreAnchor"><button type="button" class="wtg9ga_panelRow" aria-label="${label}" ` +
  `aria-haspopup="menu" aria-expanded="false"><span class="wtg9ga_panelGlyph">▦</span>` +
  `<span class="wtg9ga_panelTitle">${label}</span></button></span>`;
const PANELS = ['插件', '插件市场', '任务看板', '上下文洞察', '自动化任务'];
const VIEWS = ['对话', '上下页', '画廊'];

/* ---- the host's real action glyphs, copied out of the DSH build --------------
   These are not decoration: the whole point of the rail check below is that
   aligning boxes is not the same as aligning pixels, and that only shows up if
   the fixture draws the host's actual ink. `project-add-outline` ends its stroke
   at x=14.55 of a 16px viewBox (so 15.05 after the 0.5px half-stroke), and
   `sliders-two-outline` at 14.2 -- a plain circle at r=7 would end at 15 and
   quietly make a wrong CSS look right. */
const ICON_ADD =
  '<svg viewBox="0 0 16 16" fill="none" stroke-width="1" aria-hidden="true">' +
  '<path d="M5.54492 2.06738C5.91034 2.06738 6.20654 2.36359 6.20654 2.729" stroke="currentColor"/>' +
  '<path d="M9.75977 4.50208H14.5509" stroke="currentColor"/>' +
  '<path d="M12.1492 6.89758L12.1492 2.10642" stroke="currentColor"/></svg>';
const ICON_SLIDERS =
  '<svg viewBox="0 0 16 16" fill="none" stroke-width="1" stroke-linecap="round" aria-hidden="true">' +
  '<path d="M2.3 5h5.85M12.05 5h1.65" stroke="currentColor"/>' +
  '<circle cx="9.95" cy="5" r="1.45" stroke="currentColor"/>' +
  '<path d="M2.3 11h1.65M7.85 11h5.85" stroke="currentColor"/>' +
  '<circle cx="5.75" cy="11" r="1.45" stroke="currentColor"/></svg>';
const ICON_GLASS =
  '<svg viewBox="0 0 16 16" fill="none" stroke-width="1" stroke-linecap="round" aria-hidden="true">' +
  '<circle cx="7.1" cy="7.1" r="4.6" stroke="currentColor"/>' +
  '<path d="M10.5 10.5 14 14" stroke="currentColor"/></svg>';

const page = (record) => `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>panel list fixture</title>
<style>
  body { margin: 0; font: 13px/1.4 system-ui, sans-serif; }
  /* the host sidebar root defines these tokens; rows and our group row read them */
  #side { width: 269px; padding: 8px;
    --dsh-sidebar-inline-padding: 8px; --dsh-sidebar-row-padding: 12px;
    --dsh-sidebar-label-gap: 6px; --dsh-sidebar-paint-inset: 3px; }
  /* copied from SidebarRoot.module.css: the drag path reads these boxes */
  .wtg9ga_scrollRegion { position: relative; display: flex; flex-direction: column; }
  .wtg9ga_scrollArea {
    display: grid;
    grid-template-columns: 4px minmax(0, 1fr) calc(var(--dsh-sidebar-inline-padding) - 2px);
    grid-template-rows: 8px max-content 2px max-content;
    align-content: start;
    margin-left: -4px; margin-right: calc(2px - var(--dsh-sidebar-inline-padding));
    overflow-x: hidden; overflow-y: auto;
  }
  .wtg9ga_scrollArea::before, .wtg9ga_scrollArea::after { content: ''; grid-column: 2; pointer-events: none; }
  .wtg9ga_scrollArea::before { grid-row: 1; }
  .wtg9ga_scrollArea::after { grid-row: 3; }
  .wtg9ga_panelList { grid-column: 2; grid-row: 2;
    flex: none; display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; }
  .wtg9ga_panelEntry { position: relative; display: flex;
    border-inline: var(--dsh-sidebar-paint-inset) solid transparent;
    background-clip: padding-box; border-radius: 12px; }
  .wtg9ga_panelRow { box-sizing: border-box; display: flex; align-items: center;
    gap: var(--dsh-sidebar-label-gap);
    min-height: 32px; margin: 0;
    padding: 5px calc(var(--dsh-sidebar-row-padding) - var(--dsh-sidebar-paint-inset));
    border: none; border-inline: var(--dsh-sidebar-paint-inset) solid transparent;
    background: 0 0; background-clip: padding-box;
    border-radius: 12px; font: inherit; line-height: 22px; text-align: left; cursor: pointer; }
  /* THE HOST'S WIDE-ENTRY RULE. Inside a .panelEntry the wrapper owns the inset
     and the paint box, so the host strips both off the button underneath it:
     "border-inline: 0", "background: 0 0", "width: 100%", "padding-right: 38px".
     The fixture has to carry this or the plugin is tested against a host that
     does not exist -- which is exactly how a 3px double-inset bug survived a
     green run. Our anchor is a different wrapper, so nothing here reaches it. */
  .wtg9ga_panelEntryWide .wtg9ga_panelRow {
    background: 0 0; border-inline: 0; width: 100%; margin: 0; padding-right: 38px; }
  .wtg9ga_panelRow:hover { background: rgba(0, 0, 0, .06); }
  .wtg9ga_moreAnchor { display: flex; flex-direction: column; }
  .wtg9ga_panelGlyph { flex: none; display: inline-flex; align-items: center; justify-content: center; }
  .wtg9ga_panelTitle { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .wtg9ga_regionArea { grid-column: 2; grid-row: 4; min-height: 0; min-width: 0;
    display: flex; flex-direction: column; }
  #workspaces { min-height: 240px; }
  /* copied from WorkspaceBrowser.module.css: the "工作区" section header. The
     plugin has to line up with THIS header, so the fixture has to carry it --
     the caption sits on its label's left edge, the two action boxes on its two
     icon buttons' rails. Sizes are the host's: 28px icon boxes, a 4px gap, 16px
     glyphs, padding-left 12px with no painted border, the label pulled 1px left,
     and the header bleeding 3px past the content column. */
  .wb_sectionHeader { box-sizing: border-box; display: flex; align-items: center;
    justify-content: flex-end; gap: 4px; height: 36px;
    padding-left: var(--dsh-sidebar-row-padding);
    border-radius: 12px; overflow: hidden;
    padding-right: 1px; }
  .wb_sectionLabel { position: relative; left: -1px; max-width: 45%; line-height: 20px; }
  .wb_searchSlot { display: flex; align-items: center; margin-left: auto; max-width: 28px; }
  .wb_headerActions { display: flex; align-items: center; gap: 4px; max-width: 60px; }
  .wb_iconButton { flex: none; box-sizing: border-box; display: inline-flex;
    align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0;
    border: 0; border-radius: 6px; background: 0 0; cursor: pointer; }
  .wb_iconButton > svg { display: block; width: 16px; height: 16px; }
  /* ---- the host's RAIL ------------------------------------------------------
     Copied from SidebarRoot.module.css .root.collapsed / .collapsed .panelList /
     .collapsed .panelRow: the sidebar pads 18/10/6, so the content column is
     56 - 20 = 36px, the lists open their gap to 12px, and every panel row
     becomes a centred 36x36 icon box with no painted border. The plugin has to
     fit ONE control into that 36px, so the fixture has to be that narrow or the
     overflow it is meant to catch would never happen.

     The collapse is a class on the sidebar root, exactly as the host does it
     (its root class, then the same class plus "collapsed", swapped when the
     slide settles). The plugin matches the "collapsed" fragment, never the
     build's hash prefix. */
  #side.wtg9ga_collapsed { box-sizing: border-box; width: 56px; padding: 18px 10px 6px; }
  #side.wtg9ga_collapsed .wtg9ga_scrollArea {
    display: flex; flex-direction: column; margin: 0; padding: 0; }
  #side.wtg9ga_collapsed .wtg9ga_panelList { gap: 12px; margin-bottom: 12px; }
  #side.wtg9ga_collapsed .wtg9ga_panelEntry { border-inline: 0; }
  #side.wtg9ga_collapsed .wtg9ga_panelRow {
    width: 36px; height: 36px; justify-content: center; margin: 0;
    padding: 0; border-inline: 0; }
  #side.wtg9ga_collapsed .wtg9ga_panelTitle { display: none; }
  /* copied from the conversation header: the view row and its "..." launcher */
  #chat { width: 620px; padding: 8px; }
  .an3WzG_tabs { position: relative; display: flex; flex-wrap: wrap; align-items: flex-start;
    gap: 16px 20px; width: 100%; min-width: 0; margin-top: 10px; padding-left: 8px; box-sizing: border-box; }
  .an3WzG_viewTabs { display: flex; flex-wrap: wrap; gap: 32px; min-width: 0; min-height: 25px; }
  /* copied from ConversationView.module.css: the tab's 10/9 padding and 35px
     min-height, and the label inside its own span. The plugin's box has to line
     up with THIS, so the fixture has to carry the real metrics -- a symmetric
     tab would make a wrong alignment look right. */
  .an3WzG_tab { position: relative; box-sizing: border-box; min-height: 35px;
    margin: -10px -10px 0; padding: 10px 10px 9px; border: none;
    background: 0 0; font: inherit; font-size: 13px; font-weight: 500; line-height: 16px; cursor: pointer; }
  .an3WzG_tabLabel { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 88px; }
  .an3WzG_viewsMoreAnchor { flex: none; }
  /* the host's tooltip bubble, verbatim shape (Tooltip.module.css): fixed, so it
     costs no layout. The plugin must never turn that into a flow box. */
  .tb_bubble { display: inline-flex; align-items: safe center; gap: 8px;
    position: fixed; z-index: 100; width: max-content; box-sizing: border-box;
    max-width: min(50vw, calc(100vw - 24px)); padding: 3px 7px;
    border-radius: var(--dsw-radius-sm); background: #222; color: #fff;
    font-size: 13px; line-height: 20px; white-space: pre-line; pointer-events: none; }
  .an3WzG_viewsMore { width: 22px; height: 22px; margin-top: -3px; padding: 0;
    border: none; background: 0 0; cursor: pointer; }
</style></head>
<body>
<div id="side">
  <div class="wtg9ga_scrollRegion">
    <div class="wtg9ga_scrollArea">
      <nav class="wtg9ga_panelList" aria-label="全局面板">
        ${PANELS.map(entry).join('')}
        ${moreRow()}
        <!-- 0.2.1-rc.5 renders the hover tooltip as a CHILD OF THE LIST, and it is
             position:fixed precisely so it costs no layout. Anything of ours that
             styles "every direct child" would drag it into the flow and shift the
             whole list -- see the check near the end of this file. -->
        <span class="tb_bubble" role="tooltip">插件</span>
      </nav>
      <div class="wtg9ga_regionArea" id="workspaces">
        <div class="wb_sectionHeader">
          <span class="wb_sectionLabel">工作区</span>
          <span class="wb_searchSlot"><button type="button" class="wb_iconButton" aria-label="搜索工作区">${ICON_GLASS}</button></span>
          <span class="wb_headerActions">
            <button type="button" class="wb_iconButton" aria-label="视图选项">${ICON_SLIDERS}</button>
            <button type="button" class="wb_iconButton" aria-label="添加工作区">${ICON_ADD}</button>
          </span>
        </div>
        workspace / sessions
      </div>
    </div>
  </div>
</div>
<div id="chat">
  <div class="an3WzG_tabs">
    <div class="an3WzG_viewTabs" role="tablist" data-conversation-tabs="">
      ${VIEWS.map((v, i) => `<button type="button" role="tab" aria-selected="${i === 0}" class="an3WzG_tab${i === 0 ? ' an3WzG_tabActive' : ''}"><span class="an3WzG_tabLabel">${v}</span></button>`).join('')}
    </div>
    <span class="an3WzG_viewsMoreAnchor"><button type="button" class="an3WzG_viewsMore" aria-label="更多会话视图" aria-haspopup="menu" aria-expanded="false"></button></span>
  </div>
</div>
<script>
  // the record the plugin would find on disk, seeded before it boots
  ${record ? `localStorage.setItem(${JSON.stringify(STORE)}, ${JSON.stringify(JSON.stringify(record))});`
           : 'localStorage.clear();'}
</script>
<script>window.__ModuleLoader__ = { load: (m) => { window.__bundle = m; } };</script>
<script src="/lib/client.js"></script>
<script>
  const client = window.__bundle.factory(() => { throw new Error('unexpected dependency'); });
  const disposers = [];
  client.apply({ effect: (fn) => { disposers.push(fn()); } });
  window.__dispose = () => disposers.forEach((fn) => fn());
  window.__ready = true;
</script>
</body></html>`;

/* ---- a throwaway origin: file:// has an opaque origin, so localStorage would
   be unavailable and the order-replay check could not run at all ---- */
const source = await readFile(join(repo, 'lib', 'client.js'), 'utf8');
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/lib/client.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    res.end(source);
    return;
  }
  const record = url.searchParams.get('record');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(page(record ? JSON.parse(record) : null));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}/`;

const browser = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--force-device-scale-factor=1',
  '--remote-debugging-port=0', `--user-data-dir=${join(repo, 'node_modules', '.edge-check')}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

let socket;
let failures = 0;
const pass = (name) => console.log(`  ✓ ${name}`);
const check = (name, fn, detail) => {
  try { fn(); pass(name); }
  catch (error) {
    failures++;
    console.log(`  ✗ ${name}\n      ${error.message.split('\n')[0]}`);
    if (detail) console.log(`      got: ${JSON.stringify(detail())}`);
  }
};

try {
  const ws = await new Promise((resolve, reject) => {
    let buffered = '';
    const timer = setTimeout(() => reject(new Error('Edge did not report a DevTools port in 20s')), 20000);
    browser.stderr.on('data', (chunk) => {
      buffered += chunk;
      const m = buffered.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    browser.on('error', reject);
  });

  socket = new WebSocket(ws);
  await new Promise((res, rej) => { socket.onopen = res; socket.onerror = rej; });

  let seq = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const slot = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) slot.reject(new Error(JSON.stringify(message.error)));
    else slot.resolve(message.result);
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 640, height: 520, deviceScaleFactor: 1, mobile: false });

  /* every evaluate runs in the page, so the helpers below are page-side */
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails, null, 1));
    return result.result.value;
  };
  const boot = async (record) => {
    await call('Page.navigate', { url: record ? `${origin}?record=${encodeURIComponent(JSON.stringify(record))}` : origin });
    for (let i = 0; i < 100; i++) {
      if (await evaluate('window.__ready === true')) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('the fixture did not boot');
  };
  const snapshot = () => evaluate(`(() => {
    const nav = document.querySelector('nav[class*="panelList"]');
    const anchor = document.querySelector('[class*="moreAnchor"]');
    const label = (el) => (el.getAttribute('aria-label') || el.querySelector('button[class*="panelRow"]')?.getAttribute('aria-label') || '').trim();
    /* 0.2.2-rc.2 wraps every pinned row in div.panelEntry (the unpin button and
       the row's own paint box live there), so "the unit" is the nav's direct
       child, never the button: that is where our controls go. */
    /* our group row now lives INSIDE the list, so every "the host's children"
       walk has to step over it. One helper, used everywhere below, so the
       exclusion cannot drift between checks.
       A host may also keep non-row things in the list -- 0.2.1-rc.5 renders the
       hover tooltip there -- so a child only counts when it IS a row or owns one. */
    const isRowUnit = (el) => el.matches('button[class*="panelRow"]')
      || !!el.querySelector(':scope > button[class*="panelRow"]');
    const hostChildren = (list) => [...list.children]
      .filter((el) => !el.classList.contains('snc-group') && isRowUnit(el));
    const unitOf = (name) => [...hostChildren(nav)]
      .find((el) => el.getAttribute('aria-label') === name ||
        el.querySelector(':scope > button[class*="panelRow"][aria-label="' + name + '"]'));
    const bareUnit = unitOf('任务看板');
    const bare = bareUnit?.querySelector('button[class*="panelRow"]');
    return {
      order: hostChildren(nav).map(label),
      groupFirst: nav.firstElementChild?.classList?.contains('snc-group') || false,
      anchorParent: anchor.parentElement.tagName,
      anchorInsideNav: anchor.closest('nav') !== null,
      editing: nav.dataset.sncEditing,
      boxes: document.querySelectorAll('[data-snc-check]').length,
      /* our controls live INSIDE the row button, exactly as they do on every
         other entry -- putting them on the anchor would make the anchor a flex
         row of [controls][button] and shift the button's own inset */
      anchorCtl: !!anchor.querySelector(':scope > button[class*="panelRow"] > .snc-ctl'),
      /* …and where that box starts is COPIED from a real host row rather than
         hard-coded for a known host shape (see syncRowMetrics). This asserts the
         copy itself, so a fixture built like one host cannot silently bless code
         that only works on that host. */
      rowMetrics: (() => {
        const navStyle = getComputedStyle(nav);
        const unit = hostChildren(nav).find((el) => el.querySelector('button[class*="panelRow"]'))
          || null;
        const unitStyle = unit ? getComputedStyle(unit) : null;
        const read = (name) => navStyle.getPropertyValue(name).trim() || null;
        return {
          anchorMargin: read('--snc-more-margin'),
          anchorBorder: read('--snc-more-border'),
          btnBorder: read('--snc-btn-border'),
          hostMargin: unitStyle ? unitStyle.marginInlineStart : null,
          hostBorder: unitStyle ? unitStyle.borderInlineStartWidth : null,
        };
      })(),
      /* the anchor has no margin or padding of its own, so the controls inside
         it must be told where the rows above and below start */
      align: (() => {
        const rowUnit = unitOf('插件');
        const at = (unit, sel) => {
          const node = unit?.querySelector(sel);
          if (!node) return null;
          const r = node.getBoundingClientRect();
          const u = unit.getBoundingClientRect();
          // dy is measured against the row itself, so rows at different heights
          // still compare: it says whether the control is centred in its row
          return { left: Math.round(r.left), dy: Math.round((r.top + r.height / 2) - (u.top + u.height / 2)) };
        };
        /* Controls live INSIDE each row's button on every entry -- bare rows, the
           host's entry wrappers, and our anchor around the "more" button alike.
           Probing ":scope > .snc-ctl" only worked while the wrapper carried them. */
        const ctlIn = (unit, rest) => unit?.querySelector(':scope > .snc-ctl' + rest)
          || unit?.querySelector(':scope > button[class*="panelRow"] > .snc-ctl' + rest)
          || null;
        return {
          bareBox: at(rowUnit, ':scope > button[class*="panelRow"] > .snc-ctl > [data-snc-check]'),
          moreBox: at(anchor, ':scope > button[class*="panelRow"] > .snc-ctl > [data-snc-check]'),
          bareGrip: at(rowUnit, ':scope > button[class*="panelRow"] > .snc-ctl > [data-snc-drag]'),
          moreGrip: at(anchor, ':scope > button[class*="panelRow"] > .snc-ctl > [data-snc-drag]'),
          bareTitle: at(rowUnit, '[class*="panelTitle"]'),
          moreTitle: at(anchor, '[class*="panelTitle"]'),
          /* the two hosts that answer this differ: a .panelEntry carries the
             shared paint inset as a border, a bare .moreAnchor gets it from us.
             Either way the controls must END UP on the same x -- the inset is
             bookkeeping, not a visible offset. */
          bareCtlLeft: (() => {
            const c = rowUnit?.querySelector(':scope > button[class*="panelRow"] > .snc-ctl')
              || rowUnit?.querySelector(':scope > .snc-ctl');
            return c ? Math.round(c.getBoundingClientRect().left) : null;
          })(),
          moreCtlLeft: (() => {
            const c = anchor?.querySelector(':scope > button[class*="panelRow"] > .snc-ctl');
            return c ? Math.round(c.getBoundingClientRect().left) : null;
          })(),
          /* The GLYPH and the LABEL are what a user reads as "the row's content".
             They must start on the same x as every other row's, or the last row
             looks indented even when its checkbox lines up. */
          bareGlyphLeft: (() => {
            const g = rowUnit?.querySelector('[class*="panelGlyph"]');
            return g ? Math.round(g.getBoundingClientRect().left) : null;
          })(),
          moreGlyphLeft: (() => {
            const g = anchor?.querySelector('[class*="panelGlyph"]');
            return g ? Math.round(g.getBoundingClientRect().left) : null;
          })(),
          /* …and the highlit pill must be the same shape, or the row stops
             reading as one control: a panelEntry paints its fill up to the
             padding box (inside the transparent inset), so an anchor without the
             same clip starts its fill at the checkbox instead of behind it. */
          barePillLeft: (() => {
            const cs = rowUnit ? getComputedStyle(rowUnit) : null;
            const r = rowUnit?.getBoundingClientRect();
            return r ? Math.round(r.left + parseFloat(cs.borderInlineStartWidth || '0')) : null;
          })(),
          morePillLeft: (() => {
            const cs = anchor ? getComputedStyle(anchor) : null;
            const r = anchor?.getBoundingClientRect();
            return r ? Math.round(r.left + parseFloat(cs.borderInlineStartWidth || '0')) : null;
          })(),
          bareClip: rowUnit ? getComputedStyle(rowUnit).backgroundClip : null,
          moreClip: anchor ? getComputedStyle(anchor).backgroundClip : null,
          bareBtnBorder: rowUnit?.querySelector(':scope > button[class*="panelRow"]')
            ? getComputedStyle(rowUnit.querySelector(':scope > button[class*="panelRow"]')).borderInlineStartWidth : null,
          moreBtnBorder: anchor?.querySelector(':scope > button[class*="panelRow"]')
            ? getComputedStyle(anchor.querySelector(':scope > button[class*="panelRow"]')).borderInlineStartWidth : null,
        };
      })(),
      moreBox: !!anchor.querySelector(':scope > button[class*="panelRow"] > .snc-ctl > [data-snc-check]'),
      moreHandle: !!anchor.querySelector(':scope > button[class*="panelRow"] > .snc-ctl > [data-snc-drag]'),
      anchorDisplay: getComputedStyle(anchor).display,
      anchorOpacity: getComputedStyle(anchor).opacity,
      hiddenFlag: anchor.dataset.sncHidden || null,
      bareFlag: bareUnit?.dataset.sncHidden || null,
      bareInNav: !!bareUnit && bareUnit.parentElement === nav,
      bareCtl: !!(bareUnit?.querySelector(':scope > button[class*="panelRow"] > .snc-ctl')
        || bareUnit?.querySelector(':scope > .snc-ctl')),
      bareDisplay: bareUnit ? getComputedStyle(bareUnit).display : null,
      bareEntry: !!bareUnit && bareUnit !== bare,
      stored: JSON.parse(localStorage.getItem(${JSON.stringify(STORE)}) || 'null'),
      viewRow: (() => {
        const strip = document.querySelector('div[data-conversation-tabs]');
        const more = document.querySelector('[class*="viewsMoreAnchor"]');
        const box = document.querySelector('[data-snc-more-check]');
        const button = more?.querySelector('button');
        const rect = button?.getBoundingClientRect();
        const boxRect = box?.getBoundingClientRect();
        /* Compare the CHECKBOXES, not the ctl columns: inside a tab the box sits
           below the 20px grip, while the launcher has a box and no grip, so equal
           ctl tops would actually put the two boxes 2px apart. The box is the
           thing a user sees on the line. The pinned view (对话) carries no box,
           so the first tab WITH one is the reference. */
        const tabBox = [...(strip?.querySelectorAll('button[role="tab"]') || [])]
          .map((tab) => tab.querySelector('.snc-ctl > input'))
          .find(Boolean) || null;
        const launcherBox = more?.querySelector(':scope > .snc-ctl > input');
        const topOf = (el) => (el ? Math.round(el.getBoundingClientRect().top) : null);
        /* The glyph is the third line that has to agree: a row can have every box
           on one line and still look wrong because the "…" ink sits above the
           neighbours' text. Compare centre-lines, since the two boxes differ in
           height (22px button vs 16px label band). */
        const centreOf = (el) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return Math.round((r.top + r.bottom) / 2);
        };
        const firstLabel = strip?.querySelector('[class*="tabLabel"]');
        const launcherGlyph = more?.querySelector(':scope > button');
        return {
          parent: more?.parentElement?.className || null,
          isRowChild: !!more && more.parentElement === strip.parentElement,
          display: more ? getComputedStyle(more).display : null,
          opacity: more ? getComputedStyle(more).opacity : null,
          flag: more?.dataset.sncHidden || null,
          box: !!box,
          boxLeftOfButton: !!(boxRect && rect && boxRect.right <= rect.left + 1),
          buttonWidth: rect ? Math.round(rect.width) : null,
          ctl: !!more?.querySelector(':scope > .snc-ctl'),
          handle: !!more?.querySelector(':scope > .snc-ctl > [data-snc-drag]'),
          boxTop: topOf(launcherBox),
          tabBoxTop: topOf(tabBox),
          glyphCentre: centreOf(launcherGlyph),
          labelCentre: centreOf(firstLabel),
          order: strip ? [...strip.querySelectorAll('button[role="tab"]')].map((b) => b.textContent) : [],
        };
      })(),
      /* the two rails the group row has to land on. Measured straight off the
         host section header in the fixture, so a change to either side moves
         the numbers instead of silencing the check.

         "glyph" here means INK, not box: getBoundingClientRect() on an svg only
         reports the 16px/14px element, and the entire bug this check exists for
         was that the boxes matched while the ink did not. So every glyph number
         below is the union of the path/circle bounding boxes mapped through
         getScreenCTM(), grown by half a stroke width. */
      rail: (() => {
        const groupEl = document.querySelector('.snc-group');
        const caption = groupEl?.querySelector('.snc-caption');
        const bud = groupEl?.querySelector('.snc-bud');
        const chev = groupEl?.querySelector('.snc-chev');
        const label = document.querySelector('.wb_sectionLabel');
        const actions = [...document.querySelectorAll('.wb_headerActions > .wb_iconButton')];
        const box = (el) => el?.getBoundingClientRect() || null;
        const ink = (el) => {
          const svg = el?.querySelector('svg');
          if (!svg) return null;
          const ctm = svg.getScreenCTM();
          if (!ctm) return null;
          let out = null;
          for (const node of svg.querySelectorAll('path, circle, rect, line, polyline')) {
            const b = node.getBBox();
            const pad = (parseFloat(getComputedStyle(node).strokeWidth) || 0) / 2;
            const pts = [[b.x - pad, b.y - pad], [b.x + b.width + pad, b.y + b.height + pad]];
            for (const [x, y] of pts) {
              const p = new DOMPoint(x, y).matrixTransform(ctm);
              out = out
                ? { left: Math.min(out.left, p.x), right: Math.max(out.right, p.x),
                    top: Math.min(out.top, p.y), bottom: Math.max(out.bottom, p.y) }
                : { left: p.x, right: p.x, top: p.y, bottom: p.y };
            }
          }
          return out;
        };
        const view = ink(actions[0]);
        const add = ink(actions[1]);
        return {
          hasGroup: !!groupEl,
          // left: the caption box against the host label's box
          captionLeft: box(caption) ? Math.round(box(caption).left) : null,
          labelLeft: box(label) ? Math.round(box(label).left) : null,
          // right: our two glyphs' INK against the header's two icons' ink
          chevRight: ink(chev) ? Math.round(ink(chev).right * 100) / 100 : null,
          addRight: add ? Math.round(add.right * 100) / 100 : null,
          budRight: ink(bud) ? Math.round(ink(bud).right * 100) / 100 : null,
          viewRight: view ? Math.round(view.right * 100) / 100 : null,
          // the group box must still be a row wide: no bleed on the hover fill
          groupRight: box(groupEl) ? Math.round(box(groupEl).right) : null,
          // ...but the chevron's press box does overhang the column, exactly as
          // the host's last icon button does: that is what puts the ink on rail
          chevBoxRight: box(chev) ? Math.round(box(chev).right) : null,
          addBoxRight: box(actions[1]) ? Math.round(box(actions[1]).right) : null,
          columnRight: (() => {
            const col = document.querySelector('[class*="regionArea"]');
            return col ? Math.round(col.getBoundingClientRect().right) : null;
          })(),
        };
      })(),
      /* ---- the rail ----------------------------------------------------------
         Everything the "one control in a 36px column" fix has to be judged on.
         Boxes, not opacity: the bug was that BOTH pockets stayed in the flow and
         overran each other, so what matters is which ones are laid out at all
         (display/visibility) and where their right edges land. */
      railState: (() => {
        const shell = document.querySelector('nav[class*="panelList"]');
        const groupEl = document.querySelector('.snc-group');
        const caption = document.querySelector('.snc-caption');
        const bud = document.querySelector('.snc-bud');
        const chev = document.querySelector('.snc-chev');
        const side = document.querySelector('#side');
        const box = (el) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return {
            left: Math.round(r.left), right: Math.round(r.right),
            width: Math.round(r.width), height: Math.round(r.height),
            display: cs.display, opacity: Number(cs.opacity),
          };
        };
        /* "laid out" = occupies its own box: the row is a flex container, so a
           pocket that is display:none contributes nothing and one that is merely
           invisible still does. The check needs the first kind. */
        const laid = (b) => !!b && b.display !== 'none' && b.width > 0 && b.height > 0;
        return {
          sideWidth: side ? Math.round(side.getBoundingClientRect().width) : null,
          flag: shell?.dataset.sncRail || null,
          editing: shell?.dataset.sncEditing || null,
          group: box(groupEl),
          caption: box(caption),
          bud: box(bud),
          chev: box(chev),
          /* the two buttons the fix has to end up with exactly one of */
          laidBuds: [bud].filter((el) => laid(box(el))).length,
          laidChevs: [chev].filter((el) => laid(box(el))).length,
          /* the group box must not outgrow the column it sits in, or the row
             spills onto whatever is beside it -- this is what "挤在一起" was */
          groupOverflows: (() => {
            const g = groupEl?.getBoundingClientRect();
            const s = side?.getBoundingClientRect();
            if (!g || !s) return null;
            const cs = getComputedStyle(side);
            const inner = s.right - parseFloat(cs.paddingRight);
            return Math.round(g.right - inner);
          })(),
        };
      })(),
    };
  })()`);

  console.log('browser-check: the host "more" entry');

  /* ---- 1. it is recognised at all ---- */
  await boot(null);
  let s = await snapshot();
  check('the list boots with the more entry last, as the host renders it', () => {
    assert.deepEqual(s.order, [...PANELS, '更多']);
    assert.equal(s.anchorParent, 'NAV', 'the anchor is still a child of the list');
    assert.equal(s.editing, 'false');
  });

  /* ---- 1b. the group row sits on the host section header's rails ----------
     The host does not align a section heading the way it aligns its rows, and it
     lets the header's trailing icons hang outside the content column. Both facts
     are invisible to a jsdom test, so they are measured here: the caption box must
     start where the "工作区" label box starts, and the chevron's INK must end where
     "添加工作区"'s ink ends. All of it is read off the fixture, so the numbers move
     with the CSS instead of being pinned twice.

     The ink wording is the whole lesson of this check. An earlier version compared
     svg boxes and passed while the arrow was visibly 4.45px short: the host's 16px
     glyphs keep slack inside their viewBox (project-add-outline stops at 15.05),
     ours fills its 14px box (9.6), so equal boxes put unequal ink on screen.
     A sub-pixel tolerance is allowed because the fixture rounds nothing and the
     two strokes are 0.5px and 0.7px thick. */
  check('the group row lands on the section header rails, left and right', () => {
    const r = s.rail;
    assert.equal(r.hasGroup, true, 'the group row exists');
    assert.equal(r.captionLeft, r.labelLeft, `caption ${r.captionLeft} vs label ${r.labelLeft}`);
    // Ink, not boxes: the host draws its 16px icons inside a 28px button and we draw a
    // 14px chevron inside a 20px one, so different box widths still land the same pixels.
    // The measured window (1 css px == 1 screenshot px) puts both glyphs right edge on
    // the same column; the antialiasing halo in a screenshot is worth about a pixel, and
    // the chevron must never overshoot the host glyph, so the window is asymmetric.
    assert.ok(r.chevRight <= r.addRight + 0.5 && r.chevRight >= r.addRight - 3,
      `chevron ink ${r.chevRight} vs add ink ${r.addRight}`);
    assert.ok(Math.abs(r.budRight - r.viewRight) <= 1.2,
      `gear ink ${r.budRight} vs view ink ${r.viewRight}`);
    // the hover fill must stay a row wide: only the press target bleeds, not the box
    assert.equal(r.groupRight, r.columnRight, `group ${r.groupRight} vs column ${r.columnRight}`);
    // The two glyph families cannot share a box width and need not: the host draws a
    // 16px icon in a 28px button, we draw a 14px chevron in a 20px one. What must hold is
    // the ink rail above, plus this: the press target stays inside the content column.
    assert.ok(r.chevBoxRight <= r.columnRight,
      `chevron box ${r.chevBoxRight} must not overhang column ${r.columnRight}`);
  }, () => s.rail);

  /* ---- 2. edit mode wraps the anchor, not just the button ---- */
  await evaluate(`document.querySelector('.snc-bud').click()`);
  await new Promise((r) => setTimeout(r, 80));
  s = await snapshot();
  check('edit mode gives the more entry a checkbox and a handle', () => {
    assert.equal(s.editing, 'true');
    assert.equal(s.boxes, PANELS.length + 1, 'every row got a box, including 更多');
    assert.equal(s.moreBox, true);
    assert.equal(s.moreHandle, true);
    assert.equal(s.anchorParent, 'NAV', 'the anchor is decorated in place, never wrapped');
    assert.equal(s.anchorCtl, true, 'the controls live inside it');
    assert.equal(s.anchorDisplay, 'flex', 'and it is still laid out');
    /* the box the anchor starts from is read off a real host row, so this row
       follows whatever the host does instead of assuming one host's shape */
    assert.equal(s.rowMetrics.anchorMargin, s.rowMetrics.hostMargin,
      `the anchor must mirror a row unit's margin (${s.rowMetrics.anchorMargin} vs ${s.rowMetrics.hostMargin})`);
    assert.equal(s.rowMetrics.anchorBorder, s.rowMetrics.hostBorder,
      `the anchor must mirror a row unit's border (${s.rowMetrics.anchorBorder} vs ${s.rowMetrics.hostBorder})`);
  });

  check('the more row lines up with the rows above and below it', () => {
    const a = s.align;
    const near = (x, y) => Math.abs(x - y) <= 1;
    assert.ok(a.moreGrip && a.bareGrip, 'both rows carry a grip');
    assert.ok(near(a.moreGrip.left, a.bareGrip.left), `grip ${a.moreGrip.left} vs ${a.bareGrip.left}`);
    assert.ok(near(a.moreBox.left, a.bareBox.left), `box ${a.moreBox.left} vs ${a.bareBox.left}`);
    assert.ok(near(a.moreTitle.left, a.bareTitle.left), `title ${a.moreTitle.left} vs ${a.bareTitle.left}`);
    assert.ok(near(a.moreGrip.dy, a.bareGrip.dy), `grip dy ${a.moreGrip.dy} vs ${a.bareGrip.dy}`);
    assert.ok(near(a.moreBox.dy, a.bareBox.dy), `box dy ${a.moreBox.dy} vs ${a.bareBox.dy}`);
    /* the controls themselves, by absolute x: this is what a user sees as "the
       last row is indented a little further right than the others" */
    assert.ok(near(a.moreCtlLeft, a.bareCtlLeft),
      `controls must share a left edge (more ${a.moreCtlLeft} vs row ${a.bareCtlLeft})`);
    /* the glyph and the label, i.e. the row's actual content */
    assert.ok(near(a.moreGlyphLeft, a.bareGlyphLeft),
      `the glyph must share a left edge (more ${a.moreGlyphLeft} vs row ${a.bareGlyphLeft})`);
    /* and the row must still read as ONE control: same painted pill, same clip */
    assert.ok(near(a.morePillLeft, a.barePillLeft),
      `the highlit pill must start in the same place (more ${a.morePillLeft} vs row ${a.barePillLeft})`);
    assert.equal(a.moreClip, a.bareClip, `the fill must be clipped the same way (${a.moreClip} vs ${a.bareClip})`);
    assert.equal(a.moreBtnBorder, a.bareBtnBorder,
      `the button must carry no inset of its own (${a.moreBtnBorder} vs ${a.bareBtnBorder})`);
  }, () => s.align);
  /* ---- 3. unchecking hides the anchor, and the anchor stays whole ---- */
  await evaluate(`(() => {
    const box = document.querySelector('[class*="moreAnchor"]').querySelector(':scope > button[class*="panelRow"] > .snc-ctl > [data-snc-check]');
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await new Promise((r) => setTimeout(r, 260));
  s = await snapshot();
  check('unchecking hides it by key, and it stays reachable while editing', () => {
    assert.deepEqual(s.stored.hidden, ['更多']);
    assert.equal(s.anchorOpacity, '0.45', 'faded, not removed, while editing');
    assert.equal(s.anchorDisplay, 'flex');
    assert.equal(s.anchorInsideNav, true, 'the button was not pulled out of its anchor');
  }, () => s);

  /* ---- 4. leaving edit mode applies the hide to the anchor itself ---- */
  await evaluate(`document.querySelector('.snc-bud').click()`);
  await new Promise((r) => setTimeout(r, 80));
  s = await snapshot();
  check('outside edit mode the anchor is display:none, the list still holds it', () => {
    assert.equal(s.editing, 'false');
    assert.equal(s.anchorParent, 'NAV');
    assert.equal(s.hiddenFlag, 'true', 'the flag sits on the unit, not on the button');
    assert.equal(s.anchorDisplay, 'none', ':has() rule matches a wrapper that owns a row');
    assert.deepEqual(s.order.includes('更多'), true);
  });

  /* ---- 5. re-showing it restores the row ---- */
  await evaluate(`document.querySelector('.snc-bud').click()`);
  await new Promise((r) => setTimeout(r, 80));
  await evaluate(`(() => {
    const box = document.querySelector('[class*="moreAnchor"]').querySelector(':scope > button[class*="panelRow"] > .snc-ctl > [data-snc-check]');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('.snc-bud').click();
  })()`);
  await new Promise((r) => setTimeout(r, 80));
  s = await snapshot();
  check('checking it again brings the row back', () => {
    assert.deepEqual(s.stored.hidden, []);
    assert.equal(s.hiddenFlag, null);
    assert.equal(s.anchorDisplay, 'flex');
  });

  /* ---- 6. a bare row behaves the same as the wrapped one ---- */
  await evaluate(`document.querySelector('.snc-bud').click()`);
  await new Promise((r) => setTimeout(r, 80));
  await evaluate(`(() => {
    const nav = document.querySelector('nav[class*="panelList"]');
    // rc.2 puts the row inside div.panelEntry, so the unit is that div
    const unit = [...nav.children].find((el) => el.querySelector('button[class*="panelRow"][aria-label="任务看板"]'));
    const box = unit.querySelector(':scope > button[class*="panelRow"] > .snc-ctl > [data-snc-check]')
      || unit.querySelector(':scope > .snc-ctl > [data-snc-check]');
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await new Promise((r) => setTimeout(r, 260));
  s = await snapshot();
  check('a bare row is flagged on its unit, not on the button', () => {
    assert.deepEqual(s.stored.hidden, ['任务看板']);
    assert.equal(s.bareEntry, true, 'the row sits in an entry wrapper');
    assert.equal(s.bareFlag, 'true', 'the flag goes on the unit the host owns');
    assert.equal(s.bareInNav, true, 'and the unit is still a child of the list');
  }, () => s);
  await evaluate(`document.querySelector('.snc-bud').click()`);
  await new Promise((r) => setTimeout(r, 120));
  s = await snapshot();
  check('outside edit mode that bare row is display:none', () => {
    assert.equal(s.bareDisplay, 'none');
  }, () => s);
  // put it back, so the order check below starts from a clean record
  await boot(null);

  /* ---- 7. a stored order must not lift it above the list ---- */
  await boot({ v: 2, folded: false, hidden: [], views: [],
    order: ['任务看板', '插件', '插件市场', '上下文洞察', '自动化任务'], orderViews: [] });
  s = await snapshot();
  check('a saved order applies to the rows and leaves the more entry last', () => {
    assert.deepEqual(s.order, ['任务看板', '插件', '插件市场', '上下文洞察', '自动化任务', '更多']);
  });

  /* ---- 7. it drags like any other row, with real boxes ---- */
  await evaluate(`document.querySelector('.snc-bud').click()`);
  await new Promise((r) => setTimeout(r, 80));
  await evaluate(`(() => {
    const anchor = document.querySelector('[class*="moreAnchor"]');
    const handle = anchor.querySelector(':scope > button[class*="panelRow"] > .snc-ctl > [data-snc-drag]');
    /* the first HOST entry, not the list's first child: our group row sits at the
       head of the list and is deliberately not a drop target, and the host may
       keep non-row things in the list too (0.2.1-rc.5 renders the hover tooltip
       there). A drop target has to be something that owns a row. */
    const target = [...anchor.parentElement.children].find((el) =>
      !el.classList.contains('snc-group')
      && (el.matches('button[class*="panelRow"]')
        || !!el.querySelector(':scope > button[class*="panelRow"]')));
    const from = handle.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const x = to.left + to.width / 2;
    const fire = (node, type, clientY) => node.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0,
      buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY,
    }));
    // the press lands on the handle itself: the plugin reads event.target
    fire(handle, 'pointerdown', from.top + from.height / 2);
    // two moves, so a threshold before the drag actually starts is cleared
    fire(document, 'pointermove', from.top + from.height / 2 - 20);
    fire(document, 'pointermove', to.top + 6);
    fire(document, 'pointerup', to.top + 6);
  })()`);
  await new Promise((r) => setTimeout(r, 200));
  s = await snapshot();
  check('dragging it to the top reorders it and saves that order', () => {
    assert.equal(s.order[0], '更多');
    assert.equal(s.stored.order[0], '更多', 'the drag was committed to the record');
    assert.equal(s.stored.order.length, PANELS.length + 1, 'every unit is in the saved list');
  }, () => ({ order: s.order, stored: s.stored.order }));

  /* ---- 8. the view row's "..." launcher: a sibling of the tablist ---- */
  s = await snapshot();
  check('the view row launcher gets a box and no handle, at its host width', () => {
    assert.equal(s.viewRow.box, true, 'it is recognised at all');
    assert.equal(s.viewRow.handle, false, 'the strip owns the tab order, not this');
    assert.equal(s.viewRow.isRowChild, true, 'decorated in place, never wrapped');
    assert.equal(s.viewRow.ctl, true, 'the box lives inside the anchor');
    assert.equal(s.viewRow.buttonWidth, 22, 'the host width survives the wrapper');
    assert.equal(s.viewRow.boxLeftOfButton, true, 'the box sits in front of it');
    assert.equal(s.viewRow.boxTop, s.viewRow.tabBoxTop,
      `the launcher box must sit on the tabs' box line (its ${s.viewRow.boxTop} vs tab ${s.viewRow.tabBoxTop})`);
    /* …and the glyph itself, or the row still reads as "the ... is floating up"
       even though every box lines up */
    assert.ok(Math.abs(s.viewRow.glyphCentre - s.viewRow.labelCentre) <= 1,
      `the "…" ink must share the label's centre line (glyph ${s.viewRow.glyphCentre} vs label ${s.viewRow.labelCentre})`);
  }, () => s.viewRow);

  await evaluate(`(() => {
    const box = document.querySelector('[data-snc-more-check]');
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await new Promise((r) => setTimeout(r, 260));
  s = await snapshot();
  check('hiding it fades it while editing and removes it outside', () => {
    assert.equal(s.viewRow.flag, 'true');
    assert.equal(s.viewRow.opacity, '0.45', 'faded, still clickable, while editing');
    assert.equal(s.viewRow.display, 'flex');
    assert.deepEqual(s.stored.views, ['更多会话视图'], 'stored under the stable key');
  }, () => s.viewRow);

  await evaluate(`document.querySelector('.snc-bud').click()`);
  await new Promise((r) => setTimeout(r, 120));
  s = await snapshot();
  check('outside edit mode the launcher is gone and no tab moved', () => {
    assert.equal(s.viewRow.display, 'none');
    assert.equal(s.viewRow.isRowChild, true, 'the anchor is back where the host put it');
    assert.deepEqual(s.viewRow.order, VIEWS);
  }, () => s.viewRow);

  /* ---- 9. the host's rail: exactly one control in a 36px column -------------
     The reported bug (issue #3's sibling): collapse the sidebar to the rail and
     this row kept its wide shape -- caption plus TWO 28px pockets is 56px of
     fixed ink, and the caption can shrink to zero, so both icons spilled over
     each other in the middle of a 36px column.

     Two things are checked and both matter:
     1. structurally, exactly one of the two pockets is laid out (the other must
        be display:none, not merely transparent -- an invisible 28px box still
        eats the column and still overlaps its neighbour);
     2. geometrically, the row's box stays inside the column the host gives it.
     The flag itself is checked separately, because a stylesheet that happens to
     look right while the flag is stale would break the next `.snc-*` rule that
     keys off it. */
  /* the drag section above already left a clean, wide boot with its order saved,
     so the rail section starts from THAT state instead of re-booting: a fresh
     boot() would wipe the record the final "order survived unload" check needs. */
  const railWide = await evaluate(`(() => {
    const shell = document.querySelector('nav[class*="panelList"]');
    return { flag: shell.dataset.sncRail || null, side: Math.round(document.querySelector('#side').getBoundingClientRect().width) };
  })()`);
  check('a wide sidebar carries no rail flag', () => {
    assert.equal(railWide.flag, null, 'the rail flag must only exist on a rail');
    assert.ok(railWide.side > 200, `fixture starts wide (${railWide.side}px)`);
  }, () => railWide);

  /* Collapse the way the host does it: swap the sidebar root's class. This is
     the path that has to work, because the class flip carries no childList
     mutation -- a plugin that only repainted on child changes would sit on a
     stale flag until something else re-rendered. */
  await evaluate(`document.querySelector('#side').classList.add('wtg9ga_collapsed')`);
  await new Promise((r) => setTimeout(r, 120));
  s = await snapshot();
  check('collapsing the host sidebar puts the row into rail shape', () => {
    assert.equal(s.railState.sideWidth, 56, 'the fixture is the host rail width');
    assert.equal(s.railState.flag, 'true', 'the class flip alone republished the flag');
  }, () => s.railState);

  check('the rail row lays out exactly one control, and it is the fold arrow', () => {
    assert.equal(s.railState.laidChevs, 1, 'the chevron is the one that stays');
    assert.equal(s.railState.laidBuds, 0, 'the gear must leave the flow, not just fade');
    assert.equal(s.railState.caption.display, 'none', 'no width for a caption in a rail');
  }, () => s.railState);

  check('the rail control is the host 36x36 rail box, not a 28px wide-state pocket', () => {
    assert.equal(s.railState.chev.width, 36, `chevron box ${s.railState.chev.width}`);
    assert.equal(s.railState.chev.height, 36, `chevron box ${s.railState.chev.height}`);
    assert.equal(s.railState.group.height, 36, `row height ${s.railState.group.height}`);
  }, () => s.railState);

  check('the rail row stays inside the column: no overlap of the two icons', () => {
    assert.ok(s.railState.groupOverflows <= 0,
      `row overhangs the column by ${s.railState.groupOverflows}px`);
  }, () => s.railState);

  /* In the rail the gear has nothing to act on (its checkboxes and drag handles
     live on list rows that are now icons), so it is the arrow that survives.
     The arrow has to still fold: that is the one operation the rail still
     supports, and it is what opens the list back up. */
  await evaluate(`document.querySelector('.snc-group').click()`);
  await new Promise((r) => setTimeout(r, 80));
  const railFolded = await evaluate(`(() => {
    const list = document.querySelector('nav[class*="panelList"]');
    const row = document.querySelector('.snc-group');
    /* folding hides the HOST's entries, not the list: the row lives inside the
       list now, so hiding the list would take the row with it. What must be
       gone is every child that is not our row -- and the row must stay laid out. */
    const others = [...list.children].filter((el) => el !== row);
    return {
      folded: list.dataset.sncFolded,
      listDisplay: getComputedStyle(list).display,
      hiddenEntries: others.filter((el) => getComputedStyle(el).display === 'none').length,
      totalEntries: others.length,
      rowVisible: row.getBoundingClientRect().height > 0,
    };
  })()`);
  check('the surviving rail arrow still folds the list', () => {
    assert.equal(railFolded.folded, 'true');
    assert.notEqual(railFolded.listDisplay, 'none', 'the list itself stays: the row lives in it');
    assert.equal(railFolded.hiddenEntries, railFolded.totalEntries,
      'every host entry is hidden while folded');
    assert.equal(railFolded.rowVisible, true, 'and the row is still there to unfold it again');
  }, () => railFolded);
  await evaluate(`document.querySelector('.snc-group').click()`);
  await new Promise((r) => setTimeout(r, 80));

  /* Editing is the one state where the gear must NOT be the one dropped: it is
     the only way out of the mode, and the arrow cannot fold while editing
     anyway. Enter edit while wide (where the gear is reachable), then collapse. */
  await evaluate(`document.querySelector('.snc-bud').click()`);
  await new Promise((r) => setTimeout(r, 80));
  s = await snapshot();
  check('enter edit mode while wide, then collapse: the gear is the survivor', () => {
    assert.equal(s.railState.editing, 'true', 'edit mode is on');
    assert.equal(s.railState.laidBuds, 1, 'the gear must stay: it is the only exit');
    assert.equal(s.railState.laidChevs, 0, 'the arrow cannot fold while editing anyway');
  }, () => s.railState);
  check('the rail row is still a single 36px box while editing', () => {
    assert.ok(s.railState.groupOverflows <= 0,
      `row overhangs the column by ${s.railState.groupOverflows}px`);
  }, () => s.railState);

  /* The host's "more" row is not inside a .panelEntry: while editing it gets the
     shared paint inset straight on the anchor, because that is where a row
     wrapper's inset would be. In the RAIL the host zeroes the inset on every
     .panelEntry, so an anchor that kept its 3px border would sit 3px right of
     the entries above it -- visible as the grip and the box stepping inwards on
     the last row only. Reported from a real window; asserted here so the border
     cannot come back unconditionally. */
  const railMore = await evaluate(`(() => {
    const nav = document.querySelector('nav[class*="panelList"]');
    const anchor = nav.querySelector('[class*="moreAnchor"]');
    const bareEntry = [...nav.children].find((el) => el.querySelector(':scope > button[class*="panelRow"][aria-label="任务看板"]'));
    const ctlX = (unit) => {
      const c = unit.querySelector(':scope > button[class*="panelRow"] > .snc-ctl')
        || unit.querySelector(':scope > .snc-ctl');
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { left: Math.round(r.left), chevron: Math.round(r.width) };
    };
    return {
      more: ctlX(anchor),
      bare: ctlX(bareEntry),
      anchorBorder: getComputedStyle(anchor).borderInlineStartWidth,
      entryBorder: getComputedStyle(bareEntry).borderInlineStartWidth,
    };
  })()`);
  check('in the rail the more row keeps the entries\' inset: its box does not step in', () => {
    assert.ok(railMore.more && railMore.bare, 'both rows carry controls');
    assert.equal(railMore.more.left, railMore.bare.left,
      `controls must share a left edge (more ${railMore.more.left} vs row ${railMore.bare.left})`);
    /* and it must be the host's own rail geometry that decides this, not a value
       of ours: whatever the entries carry, the anchor carries the same */
    assert.equal(railMore.anchorBorder, railMore.entryBorder,
      'the anchor takes the same inset as a host entry in this state');
  }, () => railMore);

  /* ---- editing, then collapsing: one 36px box per row and nothing else ----
     The sidebar is now 36px wide but the mode is still on, so a row has to hold
     what still means something at that size: the box (the mode's whole point) and
     the glyph (the only identity a 36px row can carry). Left to the wide layout it
     held the grip AND the box AND the glyph -- 40px into 36 -- so the grip, the
     box and a sliced-off icon spilled out beside the column, and on a wrapper host
     the row stretched to the panel's full width. Reported from a real window with
     a screenshot. */
  const railEdit = await evaluate(`(() => {
    const nav = document.querySelector('nav[class*="panelList"]');
    const side = document.querySelector('#side').getBoundingClientRect();
    const rows = [];
    for (const btn of nav.querySelectorAll('button[class*="panelRow"]')) {
      const unit = btn.parentElement;
      const ctl = btn.querySelector(':scope > .snc-ctl') || unit.querySelector(':scope > .snc-ctl');
      const grip = ctl?.querySelector('[data-snc-drag]');
      const glyph = btn.querySelector('[class*="panelGlyph"]');
      const r = btn.getBoundingClientRect();
      const box = ctl?.querySelector('input');
      const b = box?.getBoundingClientRect();
      const visible = (el) => !!el && getComputedStyle(el).display !== 'none'
        && el.getBoundingClientRect().width > 0;
      /* the box and the glyph are ONE centred pair, so the measurement is the
         span they occupy together, not either box on its own */
      const gr = glyph ? glyph.getBoundingClientRect() : null;
      const pairLeft = gr && b ? Math.min(b.left, gr.left) : (b ? b.left : null);
      const pairRight = gr && b ? Math.max(b.right, gr.right) : (b ? b.right : null);
      rows.push({
        label: btn.getAttribute('aria-label'),
        rowWidth: Math.round(r.width),
        rowLeft: Math.round(r.left),
        rowRight: Math.round(r.right),
        gripShown: visible(grip),
        glyphShown: visible(glyph),
        boxWidth: b ? Math.round(b.width) : null,
        pairLeft: pairLeft === null ? null : Math.round(pairLeft),
        pairRight: pairRight === null ? null : Math.round(pairRight),
      });
    }
    return {
      sideRight: Math.round(side.right),
      listWidth: Math.round(nav.getBoundingClientRect().width),
      scrollWidth: nav.scrollWidth,
      rows,
    };
  })()`);
  check('editing then collapsing keeps one 36px box per row, with no overflow', () => {
    for (const row of railEdit.rows) {
      assert.equal(row.rowWidth, 36, `${row.label}: a rail row is one 36px square`);
      assert.ok(row.rowRight <= railEdit.sideRight,
        `${row.label}: the row must not spill past the column (${row.rowRight} > ${railEdit.sideRight})`);
      assert.equal(row.gripShown, false, `${row.label}: a one-column rail has nowhere to drag, so no grip`);
      /* the glyph STAYS: five identical squares would not say which row is which,
         and the label has no room to. It is what makes the rail still readable. */
      assert.equal(row.glyphShown, true, `${row.label}: the glyph stays, it is the row's identity`);
      assert.equal(row.boxWidth, 16, `${row.label}: the box keeps its size`);
      /* the pair is centred as one unit, and it has to FIT: 16 + 2 + 14 = 32 in 36 */
      const pairCentre = (row.pairLeft + row.pairRight) / 2;
      const rowCentre = row.rowLeft + row.rowWidth / 2;
      assert.ok(Math.abs(pairCentre - rowCentre) <= 1,
        `${row.label}: the box and glyph are centred together (${pairCentre} vs ${rowCentre})`);
      assert.ok(row.pairRight - row.pairLeft <= row.rowWidth,
        `${row.label}: the pair fits inside the square (${row.pairRight - row.pairLeft} > ${row.rowWidth})`);
    }
    /* nothing is hanging out of the list's own box either -- that is what made
       the column scroll sideways in the reported window */
    assert.ok(railEdit.scrollWidth <= railEdit.listWidth,
      `the list must not be wider than its own box (${railEdit.scrollWidth} vs ${railEdit.listWidth})`);
  }, () => railEdit);

  /* ---- a host overlay inside the list keeps its own box -------------------
     0.2.1-rc.5 renders the hover tooltip as a CHILD OF THE LIST and makes it
     position:fixed so it costs no layout. A rule of ours written as "every direct
     child" outranks that class, drags the bubble into the flow as a 36px box, and
     the list grows by a whole row -- every row below jumps down. Because the jump
     moves the pointer off the row, the tooltip then hides, the layout springs
     back, and the pointer is over the row again: an endless flicker. Only hosts
     that keep the bubble as a list child ever showed it, which is why one version
     had it and the other did not. */
  const overlay = await evaluate(`(() => {
    const nav = document.querySelector('nav[class*="panelList"]');
    const bubble = nav.querySelector('.tb_bubble');
    const rows = [...nav.querySelectorAll('button[class*="panelRow"]')];
    return {
      present: !!bubble,
      position: bubble ? getComputedStyle(bubble).position : null,
      width: bubble ? Math.round(bubble.getBoundingClientRect().width) : null,
      rowTops: rows.map((b) => Math.round(b.getBoundingClientRect().top)),
      navHeight: Math.round(nav.getBoundingClientRect().height),
      rail: nav.dataset.sncRail || null,
      editing: nav.dataset.sncEditing || null,
    };
  })()`);
  check('a host tooltip bubble in the list is never pulled into the layout', () => {
    assert.equal(overlay.present, true, 'the fixture carries the host bubble');
    assert.equal(overlay.editing, 'true', 'this is the edit state that styles list children');
    /* 40px wide is its own padding + text; 36 would mean our rule resized it */
    assert.equal(overlay.position, 'fixed',
      `the bubble must stay out of flow, it is at ${overlay.position}`);
    assert.notEqual(overlay.width, 36, 'the bubble must keep its own width, not a rail row width');
    /* …and the rows above it must not be displaced: an in-flow bubble would add
       one row-height plus the gap, so ONE pitch between consecutive rows would be
       roughly double the others. Uniform pitch is the whole assertion. */
    const pitches = overlay.rowTops.slice(1).map((t, i) => t - overlay.rowTops[i]);
    assert.ok(pitches.every((p) => p === pitches[0]),
      `every row keeps the same pitch, got ${pitches.join(',')}`);
  }, () => overlay);

  /* ---- …and reordering leaves that overlay exactly where the host put it ---
     The reorder used to lift our own header out, append every unit, then put the
     header back. Everything else the host keeps in the list was swept to the
     front by that append loop: a saved order replayed at boot moved the tooltip
     bubble from last child to first. The fix reorders IN PLACE, refilling the
     slots the units already occupy, so a host child never moves. */
  const overlayOrder = await evaluate(`(() => {
    const nav = document.querySelector('nav[class*="panelList"]');
    const before = [...nav.children].map((el) => el.classList.contains('snc-group') ? 'GROUP'
      : el.classList.contains('tb_bubble') ? 'BUBBLE'
      : (el.getAttribute('aria-label') || el.querySelector('button[class*="panelRow"]')?.getAttribute('aria-label') || '?'));
    return { before, record: JSON.parse(localStorage.getItem(${JSON.stringify(STORE)}) || 'null') };
  })()`);
  if (overlayOrder.record) {
    /* A stored order that differs from the DOM, replayed at boot: that is the path
       which actually runs the reorder loop. boot() is the fixture's own way in --
       it seeds the record before the plugin starts -- so no reload is needed and
       the real record can be put back the same way afterwards. */
    const reversed = { ...overlayOrder.record, order: PANELS.slice().reverse() };
    await boot(reversed);
    const after = await evaluate(`(() => {
      const nav = document.querySelector('nav[class*="panelList"]');
      return {
        index: [...nav.children].findIndex((el) => el.classList.contains('tb_bubble')),
        total: nav.children.length,
        order: [...nav.children].map((el) => el.classList.contains('snc-group') ? 'GROUP'
          : el.classList.contains('tb_bubble') ? 'BUBBLE'
          : (el.getAttribute('aria-label') || el.querySelector('button[class*="panelRow"]')?.getAttribute('aria-label') || '?')),
      };
    })()`);
    check('replaying a saved order never moves a host child of the list', () => {
      assert.ok(after.index >= 0, 'the bubble is still in the list');
      assert.equal(after.index, after.total - 1,
        `the bubble must stay where the host put it, at the end (index ${after.index} of ${after.total})`);
      /* and the rows really did re-order, or this check would pass vacuously */
      const rows = after.order.filter((k) => k !== 'GROUP' && k !== 'BUBBLE');
      const host = overlayOrder.before.filter((k) => k !== 'GROUP' && k !== 'BUBBLE');
      assert.notDeepEqual(rows, host, `the replay must have taken effect (${rows.join(',')})`);
    }, () => after);
    /* put the real record back, then the edit/rail state this block found */
    await boot(overlayOrder.record);
    await evaluate(`(() => {
      document.querySelector('#side')?.classList.add('wtg9ga_collapsed');
      document.querySelector('.snc-bud')?.click();
    })()`);
    await new Promise((r) => setTimeout(r, 150));
  }



  /* leave edit, then widen again: the wide layout has to come back untouched */
  await evaluate(`document.querySelector('.snc-bud').click()`);
  await new Promise((r) => setTimeout(r, 80));
  await evaluate(`document.querySelector('#side').classList.remove('wtg9ga_collapsed')`);
  await new Promise((r) => setTimeout(r, 120));
  s = await snapshot();
  check('expanding the sidebar again restores both controls', () => {
    assert.equal(s.railState.flag, null, 'the flag is dropped, not left behind');
    assert.equal(s.railState.laidBuds, 1, 'the gear is back');
    assert.equal(s.railState.laidChevs, 1, 'the arrow is back');
    assert.notEqual(s.railState.caption.display, 'none', 'the caption is back');
    assert.equal(s.railState.chev.width, 28, `wide pocket is 28px again (${s.railState.chev.width})`);
  }, () => s.railState);
  /* Back to a clean wide boot. The drag section above already left its order in
     the record, and section 10 asserts on that exact order, so the record is NOT
     cleared here -- boot() with no argument wipes localStorage, which would turn
     the final "the order survived unload" check into a false pass. */
  await evaluate(`document.querySelector('#side').classList.remove('wtg9ga_collapsed')`);
  await new Promise((r) => setTimeout(r, 60));

  /* ---- 9b. a host re-render while editing must not throw -------------------
     The reported bug: with rows wrapped in our own elements, React still held a
     reference to the wrapped button, so the first re-render that removed or
     re-inserted it threw NotFoundError and blanked the whole header. Nothing we
     own sits between the host and its rows any more, so the removal the host
     performs by reference has to just work. */
  await evaluate(`document.querySelector('.snc-bud').click()`);
  await new Promise((r) => setTimeout(r, 80));
  const rerender = await evaluate(`(() => {
    const nav = document.querySelector('nav[class*="panelList"]');
    // React owns the nav's children, and on 0.2.2-rc.2 a row's child is the
    // entry wrapper, not the button: remove and re-insert the unit itself
    const hostKid = (el) => !el.classList.contains('snc-group')
      && (el.matches('button[class*="panelRow"]')
        || !!el.querySelector(':scope > button[class*="panelRow"]'));
    const unit = [...nav.children].filter(hostKid)
      .find((el) => el.querySelector('button[class*="panelRow"][aria-label="上下文洞察"]'));
    const next = unit.nextElementSibling;
    let threw = null;
    try {
      nav.removeChild(unit);
      // insertBefore(node, null) appends -- the same call React makes when the
      // unit it re-inserts is the last one. Our row must survive that untouched.
      nav.insertBefore(unit.cloneNode(true), next);
    } catch (error) { threw = String(error); }
    const entries = [...nav.children].filter(hostKid);
    return {
      threw,
      rows: entries.length,
      owned: entries.every((el) => !!(el.querySelector(':scope > button[class*="panelRow"] > .snc-ctl')
        || el.querySelector(':scope > .snc-ctl'))),
      /* the row is still the list's FIRST child after all that: React inserting
         or removing entries must never displace it or throw */
      groupFirst: nav.firstElementChild?.classList?.contains('snc-group') || false,
      rowCount: nav.querySelectorAll('.snc-group').length,
      firstEl: (() => {
        const f = nav.firstElementChild;
        return f ? (f.tagName + '.' + String(f.className)).slice(0, 70) : null;
      })(),
      childOrder: [...nav.children].map((el) =>
        (el.getAttribute('aria-label') || el.querySelector('button[class*="panelRow"]')?.getAttribute('aria-label') || el.className || el.tagName).slice(0, 30)),
    };
  })()`);
  check('a host re-render while editing neither throws nor strands a control', () => {
    assert.equal(rerender.threw, null, 'the row was still where the host left it');
    assert.equal(rerender.rows, PANELS.length + 1, 'the list is intact');
    assert.equal(rerender.owned, true, 'every row still carries its own controls');
    assert.equal(rerender.groupFirst, true, 'and our row is still the list first child');
    assert.equal(rerender.rowCount, 1, 'the re-render did not duplicate the row');
  }, () => rerender);

  /* ---- 10. disabling the plugin hands the DOM back untouched ---- */
  await evaluate(`window.__dispose()`);
  await new Promise((r) => setTimeout(r, 80));
  s = await snapshot();
  check('unloading restores the host list exactly, anchor included', () => {
    // the drag above is the last word on the order, and it must survive
    assert.deepEqual(s.order, ['更多', '任务看板', '插件', '插件市场', '上下文洞察', '自动化任务']);
    assert.equal(s.anchorParent, 'NAV');
    assert.equal(s.anchorInsideNav, true);
    assert.equal(s.editing, undefined, 'no editing flag left on the host list');
    assert.equal(s.groupFirst, false, 'and no row left inside it');
    assert.equal(s.viewRow.parent, 'an3WzG_tabs', 'the launcher is bare again');
    assert.equal(s.viewRow.isRowChild, true);
    assert.equal(s.viewRow.buttonWidth, 22);
  }, () => s);
} finally {
  try { socket?.close(); } catch {}
  try { browser.kill(); } catch {}
  server.close();
}

console.log(failures === 0 ? '\nall browser checks passed' : `\n${failures} browser check(s) failed`);
process.exit(failures === 0 ? 0 : 1);