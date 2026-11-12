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
    border-inline: var(--dsh-sidebar-paint-inset) solid transparent; }
  .wtg9ga_panelRow { box-sizing: border-box; display: flex; align-items: center;
    gap: var(--dsh-sidebar-label-gap);
    min-height: 32px; margin: 0;
    padding: 5px calc(var(--dsh-sidebar-row-padding) - var(--dsh-sidebar-paint-inset));
    border: none; border-inline: var(--dsh-sidebar-paint-inset) solid transparent;
    background: 0 0; background-clip: padding-box;
    border-radius: 12px; font: inherit; line-height: 22px; text-align: left; cursor: pointer; }
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
  /* copied from the conversation header: the view row and its "..." launcher */
  #chat { width: 620px; padding: 8px; }
  .an3WzG_tabs { position: relative; display: flex; flex-wrap: wrap; align-items: flex-start;
    gap: 16px 20px; width: 100%; min-width: 0; margin-top: 10px; padding-left: 8px; box-sizing: border-box; }
  .an3WzG_viewTabs { display: flex; flex-wrap: wrap; gap: 32px; min-width: 0; min-height: 25px; }
  .an3WzG_tab { position: relative; min-height: 25px; padding: 0 0 9px; border: none;
    background: 0 0; font: inherit; font-size: 13px; font-weight: 500; line-height: 16px; cursor: pointer; }
  .an3WzG_viewsMoreAnchor { flex: none; }
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
      ${VIEWS.map((v, i) => `<button type="button" role="tab" aria-selected="${i === 0}" class="an3WzG_tab${i === 0 ? ' an3WzG_tabActive' : ''}">${v}</button>`).join('')}
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
    const unitOf = (name) => [...nav.children]
      .find((el) => el.getAttribute('aria-label') === name ||
        el.querySelector(':scope > button[class*="panelRow"][aria-label="' + name + '"]'));
    const bareUnit = unitOf('任务看板');
    const bare = bareUnit?.querySelector('button[class*="panelRow"]');
    return {
      order: [...nav.children].map(label),
      anchorParent: anchor.parentElement.tagName,
      anchorInsideNav: anchor.closest('nav') !== null,
      editing: document.querySelector('.snc-shell')?.dataset.sncEditing,
      boxes: document.querySelectorAll('[data-snc-check]').length,
      anchorCtl: !!anchor.querySelector(':scope > .snc-ctl'),
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
        return {
          bareBox: at(rowUnit, ':scope > .snc-ctl > [data-snc-check]'),
          moreBox: at(anchor, ':scope > .snc-ctl > [data-snc-check]'),
          bareGrip: at(rowUnit, ':scope > .snc-ctl > [data-snc-drag]'),
          moreGrip: at(anchor, ':scope > .snc-ctl > [data-snc-drag]'),
          bareTitle: at(rowUnit, '[class*="panelTitle"]'),
          moreTitle: at(anchor, '[class*="panelTitle"]'),
        };
      })(),
      moreBox: !!anchor.querySelector(':scope > .snc-ctl > [data-snc-check]'),
      moreHandle: !!anchor.querySelector(':scope > .snc-ctl > [data-snc-drag]'),
      anchorDisplay: getComputedStyle(anchor).display,
      anchorOpacity: getComputedStyle(anchor).opacity,
      hiddenFlag: anchor.dataset.sncHidden || null,
      bareFlag: bareUnit?.dataset.sncHidden || null,
      bareInNav: !!bareUnit && bareUnit.parentElement === nav,
      bareCtl: !!bareUnit?.querySelector(':scope > .snc-ctl'),
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
  }, () => s.align);
  /* ---- 3. unchecking hides the anchor, and the anchor stays whole ---- */
  await evaluate(`(() => {
    const box = document.querySelector('[class*="moreAnchor"]').querySelector(':scope > .snc-ctl > [data-snc-check]');
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
    const box = document.querySelector('[class*="moreAnchor"]').querySelector(':scope > .snc-ctl > [data-snc-check]');
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
    const box = unit.querySelector(':scope > .snc-ctl > [data-snc-check]');
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
    const handle = anchor.querySelector(':scope > .snc-ctl > [data-snc-drag]');
    const target = anchor.parentElement.firstElementChild;
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

  /* ---- 9. a host re-render while editing must not throw -------------------
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
    const unit = [...nav.children]
      .find((el) => el.querySelector('button[class*="panelRow"][aria-label="上下文洞察"]'));
    const next = unit.nextElementSibling;
    let threw = null;
    try {
      nav.removeChild(unit);
      nav.insertBefore(unit.cloneNode(true), next);
    } catch (error) { threw = String(error); }
    return {
      threw,
      rows: nav.children.length,
      owned: [...nav.children].every((el) => !!el.querySelector(':scope > .snc-ctl')),
    };
  })()`);
  check('a host re-render while editing neither throws nor strands a control', () => {
    assert.equal(rerender.threw, null, 'the row was still where the host left it');
    assert.equal(rerender.rows, PANELS.length + 1, 'the list is intact');
    assert.equal(rerender.owned, true, 'every row still carries its own controls');
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
    assert.equal(s.editing, undefined, 'no shell left behind');
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
