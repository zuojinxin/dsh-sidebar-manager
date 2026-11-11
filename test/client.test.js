import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { JSDOM } = require_(process.env.SNC_JSDOM || 'jsdom');

const path = fileURLToPath(new URL('../lib/client.js', import.meta.url));
const panel = (name) => `<button class="_2H3hWW_panelRow" aria-label="${name}"><span class="_2H3hWW_panelGlyph">★</span><span class="_2H3hWW_panelTitle">${name}</span></button>`;
const navigation = (names = ['插件', '自动化任务', '上下文洞察', '扩展管理', '任务看板', '记忆系统']) =>
  `<nav class="_2H3hWW_panelList" aria-label="全局面板">${names.map(panel).join('')}</nav><div id="workspaces">Workspace and sessions</div>`;
/* DSH renders its own trailing "more" entry inside an anchor element: the popup
   it opens is positioned from that box, so the row is NOT a bare button child
   of the nav. Everything that walks the list has to cope with that shape. */
const more = (label = '更多') =>
  `<span class="_2H3hWW_moreAnchor"><button class="_2H3hWW_panelRow" aria-label="${label}" aria-haspopup="menu" aria-expanded="false">` +
  `<span class="_2H3hWW_panelGlyph">▦</span><span class="_2H3hWW_panelTitle">${label}</span></button></span>`;
const navigationWithMore = (names = ['插件', '自动化任务', '任务看板']) =>
  `<nav class="_2H3hWW_panelList" aria-label="全局面板">${names.map(panel).join('')}${more()}</nav><div id="workspaces">Workspace and sessions</div>`;

const STATE_KEY = 'dsh-sidebar-nav-collapse:state';
/* the fused record: one key, one version */
const stateOf = (window) => {
  const raw = window.localStorage.getItem(STATE_KEY);
  return raw === null ? null : JSON.parse(raw);
};
/* boot with an explicit record (or nothing at all) */
function start(html = navigation(), record) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${html}</body></html>`, { url: 'http://localhost/' });
  if (record !== undefined) dom.window.localStorage.setItem(STATE_KEY, JSON.stringify(record));
  let bundle;
  const code = fs.readFileSync(path, 'utf8');
  assert.match(code, /window\.__ModuleLoader__\.load/, 'client bundle must exist');
  vm.runInNewContext(code, {
    window: Object.assign(dom.window, { __ModuleLoader__: { load: (v) => { bundle = v; } } }),
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
  });
  const client = bundle.factory(() => { throw Error('unexpected dependency'); });
  const disposers = [];
  client.apply({ effect: (fn) => { disposers.push(fn()); } });
  return { dom, doc: dom.window.document, dispose: () => { for (const fn of disposers.reverse()) fn(); } };
}
/* v2 adds the two order lists; v1 records are still read and upgraded */
const rec = (over = {}) => ({ v: 2, folded: false, hidden: [], views: [], actions: [], order: [], orderViews: [], right: [], orderRight: [], ...over });
/* a v1 record, as an older build wrote it */
const recV1 = (over = {}) => ({ v: 1, folded: false, hidden: [], views: [], ...over });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const cssOf = (doc) => doc.querySelector('style[data-plugin-css="dsh-sidebar-manager"]').textContent;
const rows = (doc) => [...doc.querySelectorAll('nav button[class*="panelRow"]')];
const shadow = (doc) => doc.querySelector('.snc-shell');
const group = (doc) => doc.querySelector('.snc-group');
const gear = (doc) => doc.querySelector('.snc-bud');

test('wraps the host panel list and adds a group row plus a gear', () => {
  const { doc, dispose } = start();
  const shell = shadow(doc);
  assert.ok(shell, 'wrapper exists');
  // the host nav must stay a direct child of our wrapper, untouched inside
  const nav = shell.querySelector('nav[class*="panelList"]');
  assert.ok(nav, 'host nav moved under the wrapper');
  assert.equal(nav.children.length, 6, 'host nav keeps only its own rows');
  assert.equal(shell.parentElement.tagName, 'BODY');
  // group row mirrors a native panelRow box model
  const css = cssOf(doc);
  const groupRule = css.slice(css.indexOf('.snc-group {'), css.indexOf('}', css.indexOf('.snc-group {')));
  assert.match(groupRule, /min-height:\s*36px/);
  assert.match(groupRule, /padding:\s*7px 8px/);
  // gap 0: the caption takes the free width, so the two icons sit flush right
  assert.match(groupRule, /gap:\s*0/);
  assert.match(groupRule, /border-radius:\s*var\(--dsw-radius-md,\s*12px\)/);
  // the gear is a 20px press target next to the 20px chevron: the dead zone
  // between them is what keeps settings and fold from being hit by one press
  const gearRule = css.slice(css.indexOf('.snc-bud,\n.snc-chev {'), css.indexOf('}', css.indexOf('.snc-bud,\n.snc-chev {')));
  assert.match(gearRule, /width:\s*20px/);
  assert.match(gearRule, /height:\s*20px/);
  assert.match(gearRule, /border-radius:\s*var\(--dsw-radius-sm,\s*6px\)/);
  // no colour is hardcoded: everything is a live theme token with a fallback
  assert.match(gearRule, /--dsw-alias-label-tertiary/);
  dispose();
});

test('the group row is the toggle: starts expanded and folds the list', () => {
  const { doc, dom, dispose } = start();
  const shell = shadow(doc);
  assert.equal(group(doc).getAttribute('aria-expanded'), 'true');
  assert.equal(shell.dataset.sncFolded, 'false');
  assert.match(cssOf(doc), /\[data-snc-folded="true"\]\s*>\s*nav\[class\*="panelList"\]\s*\{\s*display:\s*none/);

  group(doc).click();
  assert.equal(shell.dataset.sncFolded, 'true');
  assert.equal(group(doc).getAttribute('aria-expanded'), 'false');
  assert.equal(group(doc).getAttribute('aria-label'), '展开扩展管理');
  // folding is remembered
  assert.equal(String(stateOf(dom.window).folded), 'true');

  group(doc).click();
  assert.equal(shell.dataset.sncFolded, 'false');
  assert.equal(String(stateOf(dom.window).folded), 'false');
  dispose();
});

test('the group row is a section header, not a seventh extension', () => {
  const { doc, dispose } = start(both());
  const row = group(doc);
  /* A1: the row is a named group header. It reads "扩展" -- a caption, not a
     panel name -- and it is styled as tertiary upper-case text so it cannot be
     mistaken for one of the extension entries below it. */
  assert.equal(row.querySelector('.snc-caption')?.textContent, '扩展');
  assert.equal(row.textContent.trim(), '扩展');
  /* the caption is inert: no press handler, no tab stop of its own */
  assert.equal(row.querySelector('.snc-caption').tabIndex, -1);
  /* the name survives where it still has to be reachable */
  assert.equal(row.getAttribute('aria-label'), '收起扩展管理');
  assert.equal(row.title, '收起扩展管理（点击切换）');
  /* the decoration is a real inline glyph, not a background image: the chevron
     svg is the only inline graphic left on the row now that the vine is gone */
  assert.ok(row.querySelector('.snc-chev > svg'), 'the chevron is an inline svg');
  /* the trailing edge carries exactly two actions, settings then fold */
  const tail = [...row.children].slice(-2);
  assert.deepEqual(tail.map((n) => n.className), ['snc-bud', 'snc-chev']);
  assert.equal(row.lastElementChild.className, 'snc-chev', 'the chevron is last');
  dispose();
});

test('the chevron reflects the fold state, the row is what folds', () => {
  const { doc, dispose } = start(both());
  const row = group(doc);
  const chev = row.querySelector('.snc-chev');
  /* the chevron is state, not a control: it is inert and untabbable, so the
     only way to fold is the row itself (arrow keys never land on it) */
  assert.equal(chev.getAttribute('aria-hidden'), 'true');
  assert.equal(chev.tabIndex, -1);
  assert.equal(chev.tagName, 'BUTTON', 'a button so the fold can also be pressed on it');
  /* the row's own attribute drives the rotation, so CSS needs no JS repaint */
  assert.match(cssOf(doc), /\.snc-group\[aria-expanded="false"\]\s*\.snc-chev\s*\{\s*transform:\s*rotate\(-90deg\)/);
  assert.equal(row.dataset.sncFolded, 'false');
  /* a press that lands on the chevron still folds: it bubbles to the row */
  chev.click();
  assert.equal(row.dataset.sncFolded, 'true', 'pressing the chevron folds the row');
  row.click();
  assert.equal(row.dataset.sncFolded, 'false');
  dispose();
});

test('the group row is keyboard operable', () => {
  const { doc, dispose } = start();
  const shell = shadow(doc);
  assert.equal(group(doc).getAttribute('role'), 'button');
  assert.equal(group(doc).tabIndex, 0);
  group(doc).dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(shell.dataset.sncFolded, 'true');
  group(doc).dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  assert.equal(shell.dataset.sncFolded, 'false');
  dispose();
});

test('a folded list is restored from storage on startup', () => {
  const { doc, dispose } = start(undefined, rec({ folded: true }));
  assert.equal(shadow(doc).dataset.sncFolded, 'true');
  assert.equal(group(doc).getAttribute('aria-expanded'), 'false');
  dispose();
});

test('the fold state survives a reload, both ways round', () => {
  /* fold it, then boot a SECOND window off the same storage and check the row
     comes back folded -- this is the "restart DSH and my layout is still
     there" promise, tested end to end rather than by reading the record */
  const first = start();
  group(first.doc).click();
  assert.equal(shadow(first.doc).dataset.sncFolded, 'true');
  const saved = stateOf(first.dom.window);
  first.dispose();
  assert.equal(saved.folded, true, 'the folded flag is in the record');

  const again = start(undefined, saved);
  assert.equal(shadow(again.doc).dataset.sncFolded, 'true', 'boots folded');
  assert.equal(group(again.doc).getAttribute('aria-expanded'), 'false');
  /* and expanding is remembered just as firmly -- an expanded list must not be
     re-folded on the next boot */
  group(again.doc).click();
  const expanded = stateOf(again.dom.window);
  again.dispose();
  assert.equal(expanded.folded, false);
  const third = start(undefined, expanded);
  assert.equal(shadow(third.doc).dataset.sncFolded, 'false', 'boots expanded');
  assert.equal(third.doc.querySelector('nav[class*="panelList"]').style.display, '');
  third.dispose();
});

test('the expanded header carries no fill and no rule at all', () => {
  const { doc, dispose } = start(both());
  const css = cssOf(doc);
  /* two bad versions are on record: a permanent tint (read as "selected") and
     a 1px bottom hairline (still noise). Neither may come back: NO rule may
     style .snc-group for its expanded or folded state. The row is structure
     and only the pointer lights it up. */
  assert.equal(/\.snc-group\[aria-expanded="[a-z]+"\]\s*\{/.test(css), false,
    'no rule may style the row by its expanded state');
  assert.equal(/\.snc-shell\[data-snc-folded="[a-z]+"\]\s*>\s*\.snc-group\s*\{/.test(css), false,
    'no rule may style the row by its fold state');
  assert.equal(/\.snc-group\s*\{[^}]*background-image/.test(css), false,
    'the row draws no rule of its own');
  /* hover is the only state that paints it */
  assert.match(css, /\.snc-group:hover\s*\{\s*background:/);
  dispose();
});

test('the caption uses the host type scale, not a hand-picked size', () => {
  const { doc, dispose } = start(both());
  const css = cssOf(doc);
  const cap = css.slice(css.indexOf('.snc-caption {'), css.indexOf('}', css.indexOf('.snc-caption {')));
  /* the native sidebar runs 500 / 14px / 22px for its rows; taking the tokens
     rather than literals means a theme change moves this row with it */
  assert.match(cap, /font-size:\s*var\(--dsw-font-s-strong-14-font-size,\s*14px\)/);
  assert.match(cap, /font-weight:\s*var\(--dsw-font-s-strong-14-font-weight,\s*500\)/);
  assert.match(cap, /line-height:\s*var\(--dsw-font-s-strong-14-line-height,\s*22px\)/);
  /* the caption is a section label, so it takes the section-label tier. Measured
     off a real sidebar, the native "工作区" heading is rgb(109,113,118), which is
     label-tertiary; label-secondary came out a step darker and made this row
     read like another navigation entry instead of a group header. */
  assert.match(cap, /color:\s*var\(--dsw-alias-label-tertiary/);
  /* the old 11px upper-case register is gone for good */
  assert.equal(/text-transform:\s*uppercase/.test(cap), false, 'no upper-casing');
  assert.equal(/font-size:\s*11px/.test(cap), false, 'no 11px caption');
  dispose();
});

test('the caption sits on the section-label indent, not on the row indent', () => {
  const { doc, dispose } = start(both());
  const css = cssOf(doc);
  const grp = css.slice(css.indexOf('.snc-group {'), css.indexOf('}', css.indexOf('.snc-group {')));
  /* Measured off a real sidebar screenshot: the native "工作区" heading starts at
     x=17 while this caption sat at x=22, so it read as out of column. The box
     keeps the row's 2px margin so the hover fill stays row-wide, and gives up
     5px of leading padding instead of widening or shifting the box. */
  assert.match(grp, /margin:\s*0\s*2px/, 'the box still lines up with a panel row');
  assert.match(grp, /padding:\s*7px\s+8px\s+7px\s+3px/, 'the label starts 5px further left');
  const pad = grp.match(/padding:\s*7px\s+8px\s+7px\s+(\d+)px/);
  assert.equal(Number(pad[1]), 3, '2px margin + 3px padding = the 5px section indent');
  dispose();
});

test('the gear is inside the group row, just before the chevron', () => {
  const { doc, dispose } = start();
  assert.equal(gear(doc).parentElement, group(doc), 'gear lives in the group row, not the nav');
  assert.equal(gear(doc).nextElementSibling?.className, 'snc-chev', 'gear sits ahead of the chevron');
  assert.equal(gear(doc).getAttribute('aria-pressed'), 'false');
  // clicking the gear must not toggle the group
  gear(doc).click();
  assert.equal(shadow(doc).dataset.sncFolded, 'false');
  assert.equal(gear(doc).getAttribute('aria-pressed'), 'true');
  dispose();
});

test('settings mode shows a checkbox in front of every extension', () => {
  const { doc, dispose } = start();
  const shell = shadow(doc);
  const nav = doc.querySelector('nav[class*="panelList"]');
  const hostRows = [...nav.children];
  assert.equal(doc.querySelectorAll('[data-snc-check]').length, 0);
  gear(doc).click();
  assert.equal(shell.dataset.sncEditing, 'true');
  assert.equal(doc.querySelectorAll('[data-snc-check]').length, 6);
  /* nothing the host owns is re-parented: the nav's children are still exactly
     the rows the host put there, and our controls live inside them */
  assert.deepEqual([...nav.children].map((el) => el.tagName + ':' + (el.getAttribute('aria-label') || '')),
    hostRows.map((el) => el.tagName + ':' + (el.getAttribute('aria-label') || '')),
    'the host rows are neither moved nor wrapped');
  assert.ok([...nav.children].every((el, i) => el === hostRows[i]), 'same nodes, same order');
  for (const box of doc.querySelectorAll('[data-snc-check]')) {
    const ctl = box.closest('.snc-ctl');
    assert.ok(ctl, 'the box sits in a control slot');
    assert.equal(box.parentElement, ctl);
    assert.equal(ctl.parentElement.parentElement, nav, 'the slot is inside a direct child of the nav');
    assert.ok(ctl.parentElement.matches('button[class*="panelRow"], [class*="moreAnchor"]'));
    // the drag handle is the outermost slot so it never sits between the box
    // and the row it describes
    assert.ok(ctl.firstElementChild.hasAttribute('data-snc-drag'), 'handle leads the controls');
    assert.equal(ctl.firstElementChild.nextElementSibling, box, 'checkbox follows the handle');
  }
  gear(doc).click();
  assert.equal(doc.querySelectorAll('[data-snc-check]').length, 0);
  assert.equal(shell.dataset.sncEditing, 'false');
  dispose();
});

test('a press on a control never reaches the row that owns it', () => {
  const { doc, dom, dispose } = start();
  gear(doc).click();
  const row = rows(doc).find((r) => r.getAttribute('aria-label') === '任务看板');
  let reached = 0;
  row.addEventListener('click', () => { reached += 1; });
  const box = row.querySelector(':scope > .snc-ctl > [data-snc-check]');
  box.click();
  assert.equal(reached, 0, 'the host row must not see the click, or it would select the panel');
  assert.equal(box.checked, false, 'the box still toggled');
  dispose();
});

test('unchecking hides an extension and persists it', async () => {
  const { doc, dom, dispose } = start();
  gear(doc).click();
  const entry = rows(doc).find((r) => r.getAttribute('aria-label') === '任务看板');
  const box = entry.querySelector(':scope > .snc-ctl > [data-snc-check]');
  box.checked = false;
  box.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await flush();
  // the flag lives on the row itself
  assert.equal(entry.dataset.sncHidden, 'true');
  assert.deepEqual(stateOf(dom.window).hidden, ['任务看板']);

  gear(doc).click();
  const after = rows(doc).find((r) => r.getAttribute('aria-label') === '任务看板');
  // the row is the unit, in edit mode and out of it
  assert.equal(after.parentElement.tagName, 'NAV');
  assert.equal(after.dataset.sncHidden, 'true');
  assert.match(cssOf(doc), /\[data-snc-hidden="true"\]\s*\{\s*display:\s*none/);
  dispose();
});

test('hidden extensions stay reachable while editing so they can be restored', () => {
  const { doc, dispose } = start(navigation(), rec({ hidden: ['记忆系统'] }));
  const shell = shadow(doc);
  const row = rows(doc).find((r) => r.getAttribute('aria-label') === '记忆系统');
  assert.equal(row.dataset.sncHidden, 'true');
  const css = cssOf(doc);
  const ruleStart = css.indexOf('.snc-shell[data-snc-editing="true"] > nav[class*="panelList"]');
  assert.ok(ruleStart >= 0, 'edit-mode override rule exists');
  assert.match(css.slice(ruleStart), /display:\s*flex\s*!important/);
  gear(doc).click();
  assert.equal(shell.dataset.sncEditing, 'true');
  assert.equal(row.querySelector(':scope > .snc-ctl > [data-snc-check]').checked, false);
  dispose();
});

/* ---------------------- the host's own trailing "more" entry ----------------------
   DSH 0.2.1-rc.3 appends a "more" entry to the panel list. It is the one row the
   host does not render as a bare button, so a walk that only looked at
   `nav > button.panelRow` never saw it: no checkbox, no handle, and the order
   replay (which appends every unit it knows) lifted it above the list. */
const navOrder = (doc) => [...doc.querySelector('nav[class*="panelList"]').children]
  .map((el) => ((el.getAttribute('aria-label') || '') ||
    (el.querySelector('button[class*="panelRow"]')?.getAttribute('aria-label') || '')).trim());

test('a row the host wraps in an anchor is still an entry', () => {
  const { doc, dispose } = start(navigationWithMore());
  gear(doc).click();
  const anchor = doc.querySelector('[class*="moreAnchor"]');
  assert.ok(anchor, 'the host anchor survives');
  assert.equal(anchor.parentElement.tagName, 'NAV', 'and stays exactly where the host put it');
  const ctl = anchor.querySelector(':scope > .snc-ctl');
  assert.ok(ctl, 'the more entry gets controls like every other row');
  const box = ctl.querySelector('[data-snc-check]');
  assert.ok(box, 'a checkbox');
  assert.equal(box.checked, true);
  assert.ok(ctl.querySelector('[data-snc-drag]'), 'and a drag handle');
  // the popup is placed from the anchor box, so the button must stay inside it
  assert.ok(anchor.querySelector('button[class*="panelRow"]'), 'the button is not pulled out of its anchor');
  dispose();
});

test('hiding the more entry takes its anchor with it, and gives it back', async () => {
  const { doc, dom, dispose } = start(navigationWithMore());
  gear(doc).click();
  const box = doc.querySelector('[class*="moreAnchor"] > .snc-ctl > [data-snc-check]');
  box.checked = false;
  box.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await flush();
  assert.deepEqual(stateOf(dom.window).hidden, ['更多']);
  gear(doc).click();
  const unit = doc.querySelector('[class*="moreAnchor"]');
  assert.equal(unit.parentElement.tagName, 'NAV', 'the anchor is the unit, not its button');
  assert.equal(unit.dataset.sncHidden, 'true', 'the flag sits on what is actually hidden');
  const css = cssOf(doc);
  const ruleStart = css.indexOf('nav[class*="panelList"] > button[class*="panelRow"][data-snc-hidden="true"]');
  assert.match(css.slice(ruleStart, css.indexOf('}', ruleStart)),
    /:has\(> button\[class\*="panelRow"\]\)\[data-snc-hidden="true"\]/, 'a wrapper that owns a row is hidden too');
  dispose();
});

test('a row the host removes mid-edit leaves nothing behind', async () => {
  /* the host's own "more" menu unpins a panel, which removes its button from
     the list while our controls sit inside it */
  const { doc, dispose } = start(navigationWithMore());
  gear(doc).click();
  rows(doc).find((r) => r.getAttribute('aria-label') === '任务看板').remove();
  await flush();
  assert.equal(doc.querySelectorAll('.snc-ctl').length, 3, 'only the remaining rows keep controls');
  assert.equal(doc.querySelectorAll('[data-snc-check]').length, 3, 'and no control outlives its row');
  assert.equal(doc.querySelectorAll('nav > *').length, 3, 'nothing is left in the list');
  dispose();
});

test('replaying a saved order leaves the more entry in its host slot', () => {
  const { doc, dispose } = start(navigationWithMore(), rec({ order: ['任务看板', '插件', '自动化任务'] }));
  // the stored order applies to the rows; the more entry is unknown to it, so it
  // keeps the slot the host gave it (last) instead of jumping above the list
  assert.deepEqual(navOrder(doc), ['任务看板', '插件', '自动化任务', '更多']);
  dispose();
});

test('a folded list still expands into edit mode so the gear stays usable', () => {
  const { doc, dispose } = start(undefined, rec({ folded: true }));
  const shell = shadow(doc);
  assert.equal(shell.dataset.sncFolded, 'true');
  // folding is CSS; the editing flag must win over it
  assert.match(cssOf(doc), /data-snc-editing="true"\]\s*>\s*nav\[class\*="panelList"\]\s*\{\s*display:\s*flex\s*!important/);
  gear(doc).click();
  assert.equal(doc.querySelectorAll('[data-snc-check]').length, 6);
  dispose();
});

test('entering edit mode unfolds a folded list, and leaving puts the fold back', async () => {
  const { doc, dom, dispose } = start();
  group(doc).click();
  assert.equal(shadow(doc).dataset.sncFolded, 'true');
  gear(doc).click();
  /* the gear has to reveal the checkboxes it is about to offer */
  assert.equal(shadow(doc).dataset.sncFolded, 'false', 'edit entry unfolds temporarily');
  assert.equal(doc.querySelectorAll('[data-snc-check]').length, 6);
  gear(doc).click();
  /* ...and then hand the fold back: a settings click must not silently cost
     the user a fold they had set */
  assert.equal(shadow(doc).dataset.sncFolded, 'true', 'the fold the user had is restored');
  assert.equal(group(doc).getAttribute('aria-expanded'), 'false');
  assert.equal(stateOf(dom.window).folded, true, 'and it is the state on disk too');
  // the user can still unfold on the way as usual
  group(doc).click();
  assert.equal(shadow(doc).dataset.sncFolded, 'false');
  dispose();
});

test('editing an already-open list does not fold it on exit', async () => {
  const { doc, dispose } = start();
  assert.equal(shadow(doc).dataset.sncFolded, 'false');
  gear(doc).click();
  gear(doc).click();
  assert.equal(shadow(doc).dataset.sncFolded, 'false', 'nothing to restore, so nothing changes');
  dispose();
});

test('survives a sidebar remount and ignores unknown entries', async () => {
  const { doc, dispose } = start(undefined, rec({ hidden: ['插件', '早已卸载的插件'] }));
  assert.equal(rows(doc).find((r) => r.getAttribute('aria-label') === '插件').dataset.sncHidden, 'true');
  assert.equal(rows(doc).length, 6);
  const nav = doc.querySelector('nav');
  // React re-renders the host nav: replace the whole wrapper subtree
  shadow(doc).outerHTML = navigation(['插件', '新插件']);
  await flush();
  const next = doc.querySelector('nav');
  assert.ok(next, 'nav remounted');
  const nextRows = next.querySelectorAll('button[class*="panelRow"]');
  assert.equal(nextRows[0].dataset.sncHidden, 'true');
  assert.equal(nextRows[1].hasAttribute('data-snc-hidden'), false);
  // one shell per wrapper, one gear per shell
  assert.equal(doc.querySelectorAll('.snc-shell').length, 1);
  assert.equal(doc.querySelectorAll('.snc-bud').length, 1);
  dispose();
});

test('host disable restores the DOM completely', async () => {
  const { doc, dispose } = start();
  gear(doc).click();
  assert.equal(doc.querySelectorAll('.snc-ctl').length, 6);
  dispose();
  assert.equal(doc.querySelector('.snc-shell'), null);
  assert.equal(doc.querySelector('.snc-bud'), null);
  assert.equal(doc.querySelector('.snc-group'), null);
  assert.equal(doc.querySelector('[data-plugin-css="dsh-sidebar-manager"]'), null);
  assert.equal(doc.querySelectorAll('.snc-ctl').length, 0);
  assert.equal(doc.querySelectorAll('[data-snc-check]').length, 0);
  // the nav is put back exactly where it was, children untouched
  const nav = doc.querySelector('nav');
  assert.equal(nav.parentElement.tagName, 'BODY');
  assert.equal(nav.children.length, 6);
  doc.body.insertAdjacentHTML('beforeend', navigation(['Late plugin']));
  await flush();
  assert.equal(doc.querySelectorAll('.snc-shell').length, 0);
});

test('English label is also matched without touching unrelated nav', () => {
  const { doc, dispose } = start(`<nav class="_2H3hWW_panelList" aria-label="Global panels">${panel('Plugins')}</nav><nav class="_2H3hWW_panelList" aria-label="Local">${panel('Local')}</nav>`);
  assert.equal(doc.querySelectorAll('.snc-shell').length, 1);
  assert.equal(doc.querySelector('.snc-shell').querySelector('nav').getAttribute('aria-label'), 'Global panels');
  assert.equal(doc.querySelector('nav[aria-label="Local"]').parentElement.tagName, 'BODY');
  dispose();
});

/* ---------------------- conversation view tabs (second group) ---------------------- */
const tabs = (labels = ['对话', '上下页', '画廊', '编队', '记忆系统'], activeIndex = 0) =>
  `<div class="_Dc7zOa_tabs" role="tablist" data-conversation-tabs="">${labels
    .map((l, i) => `<button type="button" role="tab" aria-selected="${i === activeIndex}" class="_Dc7zOa_tab${i === activeIndex ? ' _Dc7zOa_tabActive' : ''}">${l}</button>`)
    .join('')}</div>`;
const both = (labels, activeIndex) => navigation() + tabs(labels, activeIndex);
const strip = (doc) => doc.querySelector('div[data-conversation-tabs]');
const tabEls = (doc) => [...strip(doc).querySelectorAll('button[role="tab"]')];
const tabByLabel = (doc, label) => tabEls(doc).find((t) => t.textContent === label);
/* the host renders the row's "..." launcher as a SIBLING of the tablist */
const moreButton = (label = '更多会话视图') =>
  `<span class="_Dc7zOa_viewsMoreAnchor"><button type="button" class="_Dc7zOa_viewsMore" aria-label="${label}" aria-haspopup="menu" aria-expanded="false"></button></span>`;
const moreButtonOf = (doc) => doc.querySelector('[class*="viewsMoreAnchor"] button');
const moreAnchorOf = (doc) => doc.querySelector('[class*="viewsMoreAnchor"]');

test('view tabs are untouched until edit mode, then each gets its own checkbox', () => {
  const { doc, dispose } = start(both());
  const hostTabs = tabEls(doc);
  assert.equal(strip(doc).querySelectorAll('[data-snc-tab-check]').length, 0, 'no boxes at rest');
  assert.equal(strip(doc).querySelectorAll('.snc-ctl').length, 0, 'no controls at rest');
  assert.equal(tabEls(doc).length, 5);

  gear(doc).click();
  assert.equal(strip(doc).dataset.sncEditing, 'true');
  assert.equal(strip(doc).querySelectorAll('[data-snc-tab-check]').length, 4, 'chat has no box');
  /* the tab itself is the unit, and it keeps the slot the host gave it */
  assert.equal(strip(doc).children.length, 5, 'the host tabs are neither moved nor wrapped');
  assert.ok(hostTabs.every((tab) => tab.parentElement === strip(doc)), 'each tab is still a child of the strip');
  for (const box of strip(doc).querySelectorAll('[data-snc-tab-check]')) {
    assert.equal(box.closest('.snc-ctl').parentElement, box.closest('button[role="tab"]'),
      'the controls live inside the tab, so a press has to be stopped (onControlClick)');
  }
  assert.match(cssOf(doc), /data-conversation-tabs\]\[data-snc-editing="true"\]\s*\{\s*flex-wrap:\s*wrap/);

  gear(doc).click();
  assert.equal(strip(doc).dataset.sncEditing, 'false');
  assert.equal(strip(doc).querySelectorAll('.snc-ctl').length, 0, 'controls removed on exit');
});

test('unchecking a view tab hides it and is remembered', () => {
  const { doc, dom, dispose } = start(both());
  gear(doc).click();
  const box = strip(doc).querySelectorAll('[data-snc-tab-check]')[0];
  assert.equal(box.closest('.snc-ctl').parentElement.textContent.trim(), '上下页', 'box order skips chat');
  box.checked = false;
  box.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(tabByLabel(doc, '上下页').dataset.sncHidden, 'true');
  assert.deepEqual(stateOf(dom.window).views, ['上下页']);
  // still listed while editing so it can be brought back
  assert.equal(tabByLabel(doc, '上下页').hasAttribute('data-snc-hidden'), true);
  gear(doc).click();
  assert.equal(tabByLabel(doc, '上下页').dataset.sncHidden, 'true', 'stays hidden after exit');
  assert.match(cssOf(doc), /button\[role="tab"\]\[data-snc-hidden="true"\]\s*\{\s*display:\s*none/);
});

test('the chat view has no checkbox and can never be hidden', () => {
  const { doc, dom, dispose } = start(both());
  gear(doc).click();
  const chat = tabByLabel(doc, '对话');
  assert.equal(chat.querySelector('[data-snc-tab-check]'), null, 'no box in front of chat');
  // it still gets the grip, so the row stays aligned and it can be moved
  assert.ok(chat.querySelector(':scope > .snc-ctl > [data-snc-drag]'), 'a grip, but no box');
  // a stale store entry from an older build is reconciled away on paint
  assert.equal(chat.hasAttribute('data-snc-hidden'), false);
  assert.deepEqual(stateOf(dom.window).views, [], 'chat never lands in the record');
  dispose();
});

test('the row\'s "..." launcher gets a box of its own, but no drag handle', () => {
  const { doc, dom, dispose } = start(both(['对话', '上下页', '画廊'], 0) + moreButton());
  assert.equal(strip(doc).querySelector('[class*="viewsMore"]'), null, 'the host puts it outside the strip');
  assert.equal(moreAnchorOf(doc).querySelector('.snc-ctl'), null, 'no controls at rest');

  gear(doc).click();
  const anchor = moreAnchorOf(doc);
  assert.equal(anchor.parentElement.tagName, 'BODY', 'it stays exactly where the host put it');
  assert.ok(anchor.querySelector(':scope > .snc-ctl > [data-snc-more-check]'), 'checkbox inside the anchor');
  assert.equal(anchor.querySelector('.snc-drag'), null, 'no handle: the strip owns the tab order');

  const box = anchor.querySelector('[data-snc-more-check]');
  box.checked = false;
  box.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(anchor.dataset.sncHidden, 'true', 'the flag sits on the row, not on the inner button');
  assert.deepEqual(stateOf(dom.window).views, ['更多会话视图'], 'stored under the stable key');

  gear(doc).click();
  assert.equal(anchor.querySelector('.snc-ctl'), null, 'controls removed on exit');
  assert.equal(moreAnchorOf(doc).dataset.sncHidden, 'true', 'stays hidden after exit');
  assert.match(cssOf(doc), /~ \[class\*="viewsMoreAnchor"\]\[data-snc-hidden="true"\]/);
});

test('a launcher whose label follows the active view is still one entry', () => {
  const { doc, dom, dispose } = start(both(['对话', '画廊'], 0) + moreButton('更多会话视图 · 画廊'));
  gear(doc).click();
  const box = doc.querySelector('[data-snc-more-check]');
  box.checked = false;
  box.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.deepEqual(stateOf(dom.window).views, ['更多会话视图'], 'the suffix never becomes part of the key');
});

test('a launcher hidden in an earlier session comes back hidden', () => {
  const { doc, dispose } = start(both(['对话', '画廊'], 0) + moreButton(), rec({ views: ['更多会话视图'] }));
  assert.equal(moreAnchorOf(doc).dataset.sncHidden, 'true', 'no edit mode needed to apply it');
  gear(doc).click();
  assert.equal(doc.querySelector('[data-snc-more-check]').checked, false, 'the box agrees with the store');
  dispose();
});

/* The "..." menu is a portal: the host mounts it on <body>, outside the header,
   and its rows come from entry-customization through the views.actions slot --
   one menuitem per folded view (its label inside an entry-name span, plus a
   check mark when it is the active one) and two action rows that carry an icon
   instead of a label span. On a narrow screen this menu is the ONLY place the
   folded views exist, so it is where their boxes have to be. */
const viewsMenu = (labels = ['画廊', '编队', '记忆系统'], activeLabel = '画廊') =>
  `<div class="_Dc7zOa_viewsMoreMenu" role="menu">${labels
    .map((l) => `<button type="button" role="menuitem"><span class="EWdd3W_entryName"><span class="EWdd3W_entryTitle">${l}</span>${l === activeLabel ? '<svg class="EWdd3W_activeMark"></svg>' : ''}</span></button>`)
    .join('')}<button type="button" role="menuitem"><svg class="_x_icon"></svg>浏览更多插件</button><button type="button" role="menuitem"><svg class="_x_icon"></svg>创建你的插件</button></div>`;
const menuRows = (doc) => [...doc.querySelectorAll('[class*="viewsMoreMenu"] button[role="menuitem"]')];
const menuRowByLabel = (doc, label) => menuRows(doc).find((r) => r.textContent.trim() === label);
const menuBoxOf = (doc, label) => menuRowByLabel(doc, label)?.querySelector('[data-snc-menu-check]') || null;
/* a phone: two tabs in the strip, everything else folded into the menu */
const phone = (labels = ['对话', '上下页'], folded) => both(labels, 0) + moreButton() + viewsMenu(folded);

test('every row of the "..." menu gets a box: the folded views and the host rows', () => {
  const { doc, dispose } = start(phone());
  assert.equal(doc.querySelectorAll('[data-snc-menu-check]').length, 0, 'no boxes at rest');

  gear(doc).click();
  assert.equal(doc.querySelectorAll('[data-snc-menu-check]').length, 5, 'three views plus two host rows');
  assert.equal(menuBoxOf(doc, '画廊').closest('.snc-ctl').parentElement, menuRowByLabel(doc, '画廊'),
    'the box lives in the row, so a press has to be stopped (onControlClick)');
  // the two host rows are not views, but on a phone this menu is the only
  // place they exist at all, so they are toggleable there too
  assert.equal(menuRowByLabel(doc, '浏览更多插件').querySelector('.snc-ctl').parentElement,
    menuRowByLabel(doc, '浏览更多插件'));
  assert.equal(menuBoxOf(doc, '创建你的插件').checked, true);
  // the menu is portalled out of the strip, so the flag has to be on <html>
  assert.equal(doc.documentElement.dataset.sncEditing, 'true');
  assert.match(cssOf(doc), /\[class\*="viewsMoreMenu"\] button\[role="menuitem"\] > \.snc-ctl/);

  gear(doc).click();
  assert.equal(doc.querySelectorAll('[data-snc-menu-check]').length, 0, 'controls removed on exit');
  assert.equal(doc.documentElement.dataset.sncEditing, 'false');
  dispose();
});

test('a host row is hidden into its own list, not the views list', () => {
  const { doc, dom, dispose } = start(phone());
  gear(doc).click();
  const box = menuBoxOf(doc, '浏览更多插件');
  box.checked = false;
  box.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(menuRowByLabel(doc, '浏览更多插件').dataset.sncHidden, 'true');
  assert.deepEqual(stateOf(dom.window).actions, ['浏览更多插件'], 'the host rows keep their own list');
  assert.deepEqual(stateOf(dom.window).views, [], 'a host row is not a view');

  gear(doc).click();
  assert.equal(menuRowByLabel(doc, '浏览更多插件').dataset.sncHidden, 'true', 'stays hidden after exit');
  assert.equal(menuRowByLabel(doc, '创建你的插件').hasAttribute('data-snc-hidden'), false, 'the other one is untouched');
  dispose();
});

test('a hidden host row is not a view: no active-view refusal applies to it', () => {
  const { doc, dom, dispose } = start(phone());
  gear(doc).click();
  const box = menuBoxOf(doc, '创建你的插件');
  box.checked = false;
  box.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(box.checked, false, 'hidden outright, nothing to protect');
  assert.equal(box.hasAttribute('aria-invalid'), false);
  assert.deepEqual(stateOf(dom.window).actions, ['创建你的插件']);
  dispose();
});

test('a box in the menu hides a folded view and is remembered', () => {
  const { doc, dom, dispose } = start(phone());
  gear(doc).click();
  const box = menuBoxOf(doc, '编队');
  box.checked = false;
  box.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(menuRowByLabel(doc, '编队').dataset.sncHidden, 'true');
  assert.deepEqual(stateOf(dom.window).views, ['编队'], 'the same store the tabs write');

  gear(doc).click();
  assert.equal(menuRowByLabel(doc, '编队').dataset.sncHidden, 'true', 'stays hidden after exit');
  assert.match(cssOf(doc), /html\[data-snc-editing="false"\] \[class\*="viewsMoreMenu"\]/);
  dispose();
});

test('the active view cannot be hidden from the menu either', () => {
  const { doc, dom, dispose } = start(phone(['对话', '上下页'], ['画廊', '编队']));
  gear(doc).click();
  const active = menuBoxOf(doc, '画廊');
  active.checked = false;
  active.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(active.checked, true, 'refused, the box goes back');
  assert.equal(active.getAttribute('aria-invalid'), 'true');
  assert.deepEqual(stateOf(dom.window).views, [], 'nothing was stored');

  const other = menuBoxOf(doc, '编队');
  other.checked = false;
  other.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.deepEqual(stateOf(dom.window).views, ['编队'], 'a folded view that is not active still is');
  dispose();
});

test('a menu that opens while editing is painted without another gear press', async () => {
  const { doc, dispose } = start(both(['对话', '上下页'], 0) + moreButton());
  gear(doc).click();
  assert.equal(doc.querySelectorAll('[data-snc-menu-check]').length, 0, 'nothing to paint yet');
  doc.body.insertAdjacentHTML('beforeend', viewsMenu());
  await flush();
  assert.equal(doc.querySelectorAll('[data-snc-menu-check]').length, 5, 'the observer painted the portal');
  dispose();
});

test('a press on a menu box never selects the view or dismisses the menu', () => {
  const { doc, dom, dispose } = start(phone());
  gear(doc).click();
  const row = menuRowByLabel(doc, '编队');
  let reached = 0;
  row.addEventListener('click', () => { reached += 1; });
  const box = menuBoxOf(doc, '编队');
  assert.equal(box.checked, true, 'a visible view starts checked');
  box.click();
  assert.equal(reached, 0, 'the host row must not see the click, or the menu would close');
  assert.equal(box.checked, false, 'the box still toggled');
  assert.deepEqual(stateOf(dom.window).views, ['编队']);
  dispose();
});

test('a stored hidden view comes back hidden in the menu, with no edit mode', () => {
  const { doc, dispose } = start(phone(['对话', '上下页'], ['画廊', '编队']), rec({ views: ['画廊'] }));
  assert.equal(menuRowByLabel(doc, '画廊').dataset.sncHidden, 'true', 'applied on boot');
  assert.equal(menuRowByLabel(doc, '编队').hasAttribute('data-snc-hidden'), false);
  gear(doc).click();
  assert.equal(menuBoxOf(doc, '画廊').checked, false, 'the box agrees with the store');
  assert.equal(menuBoxOf(doc, '编队').checked, true);
  dispose();
});

test('the menu boxes go with the plugin when it is disabled', () => {
  const { doc, dispose } = start(phone());
  gear(doc).click();
  assert.equal(doc.querySelectorAll('[data-snc-menu-check]').length, 5);
  dispose();
  assert.equal(doc.querySelectorAll('[data-snc-menu-check]').length, 0, 'nothing left behind');
  assert.equal(doc.documentElement.hasAttribute('data-snc-editing'), false);
});

test('a stored hidden chat entry is dropped on boot', async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${both(['对话', '上下页', '画廊'], 0)}</body></html>`, { url: 'http://localhost/' });
  dom.window.localStorage.setItem(STATE_KEY, JSON.stringify(rec({ views: ['对话', '画廊'] })));
  let bundle;
  const code = fs.readFileSync(path, 'utf8');
  vm.runInNewContext(code, {
    window: Object.assign(dom.window, { __ModuleLoader__: { load: (v) => { bundle = v; } } }),
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
  });
  const client = bundle.factory(() => { throw Error('unexpected dependency'); });
  client.apply({ effect: (fn) => { fn(); } });
  const doc = dom.window.document;
  assert.equal(tabByLabel(doc, '对话').hasAttribute('data-snc-hidden'), false, 'chat is always visible');
  assert.equal(tabByLabel(doc, '画廊').dataset.sncHidden, 'true', 'the rest still applies');
  assert.deepEqual(stateOf(dom.window).views, ['画廊'], 'chat pruned from the store');
});

test('the active view cannot be hidden', () => {
  const { doc, dom, dispose } = start(both(['对话', '上下页', '画廊'], 2));
  gear(doc).click();
  const box = [...strip(doc).querySelectorAll('[data-snc-tab-check]')].find((b) => b.closest('.snc-ctl').parentElement.textContent.trim() === '画廊');
  assert.ok(box, 'the active non-chat view still has a box');
  assert.equal(box.checked, true);
  box.checked = false;
  box.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(tabByLabel(doc, '画廊').hasAttribute('data-snc-hidden'), false, 'active tab stays visible');
  assert.equal(box.checked, true, 'the box snaps back');
  assert.equal(box.getAttribute('aria-invalid'), 'true');
  assert.deepEqual(stateOf(dom.window).views, [], 'a refused hide leaves the record untouched');
});

test('a refused hide stops being announced as invalid once the tab is no longer active', async () => {
  const { doc, dom, dispose } = start(both(['对话', '上下页', '画廊'], 2));
  gear(doc).click();
  const boxOf = (label) => [...strip(doc).querySelectorAll('[data-snc-tab-check]')]
    .find((b) => b.closest('.snc-ctl').parentElement.textContent.trim() === label);

  const box = boxOf('画廊');
  box.checked = false;
  box.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(box.getAttribute('aria-invalid'), 'true', 'the refusal is announced');

  /* switching away is exactly what the refusal asked the user to do, so the
     flag must clear -- leaving it set would keep the control announced as
     broken for the rest of the session */
  tabByLabel(doc, '对话').setAttribute('aria-selected', 'true');
  tabByLabel(doc, '画廊').setAttribute('aria-selected', 'false');
  await flush();
  assert.equal(boxOf('画廊').hasAttribute('aria-invalid'), false, 'the refusal expires with the state it described');
  dispose();
});

test('stored hidden views are applied on boot and the active one is rescued', async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${both(['对话', '上下页', '画廊'], 1)}</body></html>`, { url: 'http://localhost/' });
  dom.window.localStorage.setItem(STATE_KEY, JSON.stringify(rec({ views: ['画廊', '上下页'] })));
  let bundle;
  const code = fs.readFileSync(path, 'utf8');
  vm.runInNewContext(code, {
    window: Object.assign(dom.window, { __ModuleLoader__: { load: (v) => { bundle = v; } } }),
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
  });
  const client = bundle.factory(() => { throw Error('unexpected dependency'); });
  client.apply({ effect: (fn) => { fn(); } });
  const doc = dom.window.document;
  assert.equal(tabByLabel(doc, '画廊').dataset.sncHidden, 'true');
  assert.equal(tabByLabel(doc, '上下页').hasAttribute('data-snc-hidden'), false, 'active view is rescued');
  assert.deepEqual(stateOf(dom.window).views, ['画廊']);
});

test('tabs that mount after the plugin are picked up', async () => {
  const { doc, dispose } = start(navigation());
  assert.equal(strip(doc), null);
  gear(doc).click();               // editing first: the strip is not mounted yet
  doc.body.insertAdjacentHTML('beforeend', tabs());
  await flush();
  assert.equal(strip(doc).dataset.sncEditing, 'true');
  assert.equal(strip(doc).querySelectorAll('[data-snc-tab-check]').length, 4, 'late strip is managed');
  dispose();
  assert.equal(doc.querySelectorAll('.snc-ctl').length, 0);
  assert.equal(doc.querySelectorAll('[data-snc-tab-check]').length, 0);
  assert.equal(strip(doc).hasAttribute('data-snc-editing'), false);
});

test('the two stores stay independent inside the one record', () => {
  const { doc, dom, dispose } = start(both());
  gear(doc).click();
  assert.equal(doc.querySelectorAll('[data-snc-check]').length, 6);
  assert.equal(doc.querySelectorAll('[data-snc-tab-check]').length, 4);
  const panelBox = doc.querySelectorAll('[data-snc-check]')[0];
  panelBox.checked = false;
  panelBox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.deepEqual(stateOf(dom.window).hidden, ['插件']);
  assert.deepEqual(stateOf(dom.window).views, [], 'view list untouched by a panel toggle');
  assert.equal(doc.querySelectorAll('.snc-shell').length, 1);
  dispose();
});

test('the whole record lives under one versioned key', () => {
  const { doc, dom, dispose } = start();
  gear(doc).click();
  const box = doc.querySelector('[data-snc-check]');
  box.checked = false;
  box.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  /* the fold gesture is inert while editing, so leave the mode first */
  gear(doc).click();
  group(doc).click();
  const keys = Object.keys(dom.window.localStorage).filter((k) => k.startsWith('dsh-sidebar-nav-collapse:'));
  assert.deepEqual(keys, [STATE_KEY], 'no per-field keys are written');
  const record = stateOf(dom.window);
  assert.equal(record.v, 2);
  assert.equal(record.folded, true);
  assert.deepEqual(record.hidden, ['插件']);
  assert.deepEqual(record.views, []);
  dispose();
});

test('the fold gesture is inert while editing, so its target can never vanish', () => {
  const { doc, dispose } = start();
  gear(doc).click();
  assert.equal(shadow(doc).dataset.sncEditing, 'true');
  /* folding now would hide the list the checkboxes live in, leaving a check
     mark on screen with nothing to act on */
  group(doc).click();
  assert.equal(shadow(doc).dataset.sncFolded, 'false', 'the list stays open');
  assert.equal(shadow(doc).dataset.sncEditing, 'true', 'and editing continues');
  assert.equal(group(doc).getAttribute('aria-disabled'), 'true');
  assert.match(group(doc).getAttribute('aria-label'), /编辑中/);

  /* leaving edit mode hands the fold back */
  gear(doc).click();
  assert.equal(group(doc).getAttribute('aria-disabled'), 'false');
  group(doc).click();
  assert.equal(shadow(doc).dataset.sncFolded, 'true');
  dispose();
});

test('a pre-version record is migrated on first boot, then written back', () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${navigation()}</body></html>`, { url: 'http://localhost/' });
  dom.window.localStorage.setItem('dsh-sidebar-nav-collapse:hidden', JSON.stringify(['记忆系统']));
  dom.window.localStorage.setItem('dsh-sidebar-nav-collapse:views', JSON.stringify(['画廊']));
  dom.window.localStorage.setItem('dsh-sidebar-nav-collapse:folded', 'true');
  let bundle;
  vm.runInNewContext(fs.readFileSync(path, 'utf8'), {
    window: Object.assign(dom.window, { __ModuleLoader__: { load: (v) => { bundle = v; } } }),
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
  });
  const client = bundle.factory(() => { throw Error('unexpected dependency'); });
  const disposers = [];
  client.apply({ effect: (fn) => { disposers.push(fn()); } });
  const doc = dom.window.document;
  // the migrated record is written on boot, so a rollback finds a clean one
  assert.deepEqual(stateOf(dom.window), rec({ folded: true, hidden: ['记忆系统'], views: ['画廊'] }));
  assert.equal(shadow(doc).dataset.sncFolded, 'true');
  gear(doc).click();
  const row = rows(doc).find((r) => (r.getAttribute('aria-label') || '').trim() === '记忆系统');
  assert.ok(row, 'migrated hidden row is reachable in edit mode');
  assert.equal(row.dataset.sncHidden, 'true');
  for (const fn of disposers.reverse()) fn();
});

test('a record from a newer schema is ignored instead of half-read', () => {
  const { doc, dom, dispose } = start(navigation(), { v: 99, folded: true, hidden: ['插件'], views: [] });
  assert.equal(shadow(doc).dataset.sncFolded, 'false', 'unknown version falls back to defaults');
  assert.equal(rows(doc)[0].hasAttribute('data-snc-hidden'), false);
  assert.equal(stateOf(dom.window).v, 2, 'the record is rewritten in the current schema');
  dispose();
});

test('a corrupt record never breaks the sidebar', () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${navigation()}</body></html>`, { url: 'http://localhost/' });
  dom.window.localStorage.setItem(STATE_KEY, '{not json');
  let bundle;
  vm.runInNewContext(fs.readFileSync(path, 'utf8'), {
    window: Object.assign(dom.window, { __ModuleLoader__: { load: (v) => { bundle = v; } } }),
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
  });
  const client = bundle.factory(() => { throw Error('unexpected dependency'); });
  const disposers = [];
  client.apply({ effect: (fn) => { disposers.push(fn()); } });
  const doc = dom.window.document;
  assert.ok(shadow(doc), 'shell still wraps the list');
  assert.equal(doc.querySelectorAll('.snc-bud').length, 1);
  assert.deepEqual(stateOf(dom.window), rec(), 'bad JSON is replaced by defaults');
  for (const fn of disposers.reverse()) fn();
});

test('hidden tabs carry no extra decoration, only the fade the sidebar uses', () => {
  const { doc, dispose } = start(both());
  const css = cssOf(doc);
  assert.doesNotMatch(css, /line-through/, 'no strikethrough on hidden tabs');
  const ruleStart = css.indexOf('> button[role="tab"][data-snc-hidden="true"]');
  assert.ok(ruleStart >= 0, 'hidden-tab rule exists');
  const rule = css.slice(ruleStart, css.indexOf('}', ruleStart));
  assert.match(rule, /opacity:\s*\.45/);
  // the sidebar row rule is the reference the tab must match
  const rowStart = css.indexOf('nav[class*="panelList"] > [data-snc-hidden="true"]');
  assert.ok(rowStart >= 0, 'hidden-row rule exists');
  assert.match(css.slice(rowStart, css.indexOf('}', rowStart)), /opacity:\s*\.45/);
  gear(doc).click();
  const tab = [...doc.querySelectorAll('[role="tab"]')].find((t) => t.textContent.trim() === '记忆系统');
  const box = tab.querySelector(':scope > .snc-ctl > [data-snc-tab-check]');
  box.checked = false;
  box.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
  assert.equal(tab.dataset.sncHidden, 'true');
  assert.equal(doc.defaultView.getComputedStyle(tab).textDecorationLine, 'none');
  dispose();
});

test('a row without an aria-label falls back to its own text and skips the glyph slot', () => {
  /* the glyph slot text ("★") is rendered by whichever plugin owns the entry,
     so it can change at any time; the label must not ride on it */
  const plain = '<button class="_2H3hWW_panelRow"><span class="_2H3hWW_panelGlyph">★</span><span class="_2H3hWW_panelTitle">插件</span></button>';
  const { doc, dom, dispose } = start(`<nav class="_2H3hWW_panelList" aria-label="全局面板">${plain}</nav>`);
  gear(doc).click();
  const row = doc.querySelector('button[class*="panelRow"]');
  const box = row.querySelector(':scope > .snc-ctl > [data-snc-check]');
  box.checked = false;
  box.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  const stored = stateOf(dom.window).hidden;
  assert.equal(stored.length, 1);
  assert.doesNotMatch(stored[0], /★/, 'glyph text is not part of the key');
  dispose();
});

test('the group row and the gear cannot be selected as text', () => {
  const { doc, dispose } = start(both());
  const css = cssOf(doc);
  const groupStart = css.indexOf('.snc-group {');
  assert.ok(groupStart >= 0);
  const rule = css.slice(groupStart, css.indexOf('}', groupStart));
  assert.match(rule, /user-select:\s*none/, 'dragging across the toggle must not select its label');
  assert.match(rule, /-webkit-user-select:\s*none/);
  assert.doesNotMatch(cssOf(doc), /\.snc-title\s*\{[^}]*user-select:\s*text/);
  dispose();
});

/* ---------------------------- reorder (drag and drop) ---------------------------- */
const orderOf = (doc) => rows(doc).map((r) => (r.getAttribute('aria-label') || '').trim());
const dragHandles = (doc) => [...doc.querySelectorAll('nav[class*="panelList"] .snc-ctl > [data-snc-drag]')];
/* jsdom has no layout: getBoundingClientRect is all-zero, so the midpoint test
   would never fire. This stubs a synthetic column (or row) whose positions are
   derived from the element's CURRENT index among its siblings, which is what a
   real layout does: reordering the DOM moves the boxes with it. */
const stubRects = (win, elements, axis = 'y', step = 40, size = 36) => {
  for (const el of elements) {
    el.getBoundingClientRect = () => {
      const siblings = [...el.parentElement.children].filter((c) => typeof c.getBoundingClientRect === 'function' && c.isConnected);
      const index = Math.max(0, siblings.indexOf(el));
      const start = index * step;
      return axis === 'y'
        ? { top: start, bottom: start + size, left: 0, right: 200, width: 200, height: size, x: 0, y: start }
        : { top: 0, bottom: size, left: start, right: start + size * 2.5, width: size * 2.5, height: size, x: start, y: 0 };
    };
  }
};
/* The insertion preview hit-tests against the WRAPPER (snc-entry / snc-tabitem),
   not the handle, so a stubbed drag needs the same synthetic geometry on both. */
const stubUnits = (win, units, axis = 'y', step = 40) => {
  stubRects(win, units, axis, step);
  for (const unit of units) {
    const handle = unit.querySelector('[data-snc-drag]');
    if (handle) handle.getBoundingClientRect = () => unit.getBoundingClientRect();
  }
  return units;
};
/* jsdom has no layout and therefore no hit testing, so elementFromPoint is
   stubbed from the same synthetic boxes: the first unit whose rectangle contains
   the point. This is what makes the insertion preview observable in tests. */
const stubHit = (win, elements, axis = 'y', step = 40, size = 36) => {
  win.document.elementFromPoint = (x, y) => elements.find((el) => {
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }) || null;
};
/* pointer events are captured on document, so they must be dispatched at a real
   target inside it: dispatching straight at document skips the capture path. */
const pointer = (win, type, target, x, y, pointerType = 'mouse') => {
  const ev = new win.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  Object.defineProperty(ev, 'pointerType', { value: pointerType });
  Object.defineProperty(ev, 'button', { value: 0 });
  target.dispatchEvent(ev);
  return ev;
};
const dropMarks = (doc) => [...doc.querySelectorAll('[data-snc-drop]')].map((el) => {
  const label = el.getAttribute('aria-label') || el.querySelector('button')?.getAttribute('aria-label') || el.textContent.trim();
  return label + ':' + el.dataset.sncDrop;
});

test('no drag handle exists outside edit mode', () => {
  const { doc, dispose } = start(both());
  /* the handles are created with the controls and removed with them, so there
     is nothing to hide: outside edit mode the document holds none at all */
  assert.equal(doc.querySelectorAll('[data-snc-drag]').length, 0);
  gear(doc).click();
  assert.equal(dragHandles(doc).length, 6, 'one handle per sidebar entry');
  assert.equal(strip(doc).querySelectorAll('button[role="tab"] > .snc-ctl > [data-snc-drag]').length, 5, 'one per view tab');
  const css = cssOf(doc);
  const rule = css.slice(css.indexOf('.snc-drag {'), css.indexOf('}', css.indexOf('.snc-drag {')));
  assert.match(rule, /touch-action:\s*none/, 'a touch drag must not scroll the page instead');
  assert.match(rule, /cursor:\s*grab/);
  gear(doc).click();
  assert.equal(doc.querySelectorAll('[data-snc-drag]').length, 0, 'and they leave with the mode');
  dispose();
});

test('dragging a sidebar row past a neighbour reorders it in the DOM', () => {
  const { doc, dom, dispose } = start(both());
  gear(doc).click();
  const handles = dragHandles(doc);
  const entries = stubUnits(dom.window, [...doc.querySelectorAll('nav > button[class*="panelRow"]')]);
  stubHit(dom.window, entries);
  assert.deepEqual(orderOf(doc), ['插件', '自动化任务', '上下文洞察', '扩展管理', '任务看板', '记忆系统']);

  /* carry "插件" (index 0) down onto the second row's lower half. The order must
     NOT change while the pointer is down – that is the whole point of the
     rewrite, and the reason the old implementation oscillated – only the
     insertion bar moves. Row 1 spans y=40..76, its midpoint is 58. */
  const handle = handles[0];
  const ev = pointer(dom.window, 'pointerdown', handle, 10, 14);
  assert.equal(ev.defaultPrevented, true, 'the press must not reach the host selectPanel');
  pointer(dom.window, 'pointermove', dom.window.document.body, 10, 34);
  pointer(dom.window, 'pointermove', dom.window.document.body, 10, 70);
  assert.deepEqual(orderOf(doc), ['插件', '自动化任务', '上下文洞察', '扩展管理', '任务看板', '记忆系统'], 'nothing moves before the drop');
  assert.deepEqual(dropMarks(doc), ['自动化任务:after'], 'the bar marks the trailing edge of the hovered row');

  /* crossing the same row's upper half flips the bar, not the order */
  pointer(dom.window, 'pointermove', dom.window.document.body, 10, 44);
  assert.deepEqual(dropMarks(doc), ['自动化任务:before']);
  assert.deepEqual(orderOf(doc), ['插件', '自动化任务', '上下文洞察', '扩展管理', '任务看板', '记忆系统']);

  pointer(dom.window, 'pointermove', dom.window.document.body, 10, 70);
  pointer(dom.window, 'pointerup', dom.window.document.body, 10, 70);
  assert.deepEqual(dropMarks(doc), [], 'the bar is cleared on drop');
  assert.deepEqual(orderOf(doc), ['自动化任务', '插件', '上下文洞察', '扩展管理', '任务看板', '记忆系统']);
  dispose();
});

test('a drop suspends the CSS transitions that would otherwise delay the settle', () => {
  const { doc, dom, dispose } = start(both());
  /* jsdom has neither matchMedia nor Web Animations, so both are stubbed here;
     without them the FLIP branch is skipped and the suspension never applies */
  dom.window.matchMedia = () => ({ matches: false });
  const played = [];
  dom.window.Element.prototype.animate = function animate(frames, options) {
    played.push({ el: this, frames, options });
    return { addEventListener() {}, cancel() {} };
  };
  gear(doc).click();
  const entries = stubUnits(dom.window, [...doc.querySelectorAll('nav > button[class*="panelRow"]')]);
  stubHit(dom.window, entries);
  /* the FLIP is what animates the swap; a CSS `transition: transform` on the
     same unit would run on top of it and stretch the movement out, and the
     carried row's opacity transition would read as the row hesitating. Both
     have to be off for the frames the change lands in. */
  const css = doc.querySelector('style[data-plugin-css]').textContent;
  assert.match(css, /\[data-snc-flipping="true"\][\s\S]*?transition:\s*none !important/);
  assert.match(css, /\[data-snc-no-fade="true"\][\s\S]*?transition:\s*none !important/);

  const carried = doc.querySelector('nav > button[class*="panelRow"]');
  pointer(dom.window, 'pointerdown', dragHandles(doc)[0], 10, 14);
  pointer(dom.window, 'pointermove', dom.window.document.body, 10, 70);
  pointer(dom.window, 'pointerup', dom.window.document.body, 10, 70);

  const flipping = [...doc.querySelectorAll('[data-snc-flipping="true"]')];
  assert.ok(flipping.length >= 2, 'the moved units have their transition suspended');
  assert.ok(flipping.includes(carried), 'the carried row is one of them');
  assert.equal(carried.dataset.sncNoFade, 'true', 'its opacity snaps back rather than fades');
  assert.ok(played.length >= 2, 'the FLIP is what carries the motion');
  /* a 200ms FLIP was half the perceived lag; the swap should settle quickly */
  assert.equal(played[0].options.duration, 160);
  dispose();
});

test('a drop still reorders and saves on a host with no matchMedia and no animations', () => {
  const { doc, dom, dispose } = start(both());
  /* the guarded call `window.matchMedia?.(...)` returns undefined when the host
     has no matchMedia, so reading `.matches` off it threw and took the rest of
     the drop path (reorder commit, save, repaint) down with it. A host without
     Web Animations hits the same branch. */
  assert.equal(typeof dom.window.matchMedia, 'undefined', 'this host really lacks matchMedia');
  assert.equal(typeof dom.window.Element.prototype.animate, 'undefined', 'and Web Animations');
  gear(doc).click();
  const entries = stubUnits(dom.window, [...doc.querySelectorAll('nav > button[class*="panelRow"]')]);
  stubHit(dom.window, entries);

  const errors = [];
  dom.window.addEventListener('error', (e) => errors.push(e.message));

  pointer(dom.window, 'pointerdown', dragHandles(doc)[0], 10, 14);
  pointer(dom.window, 'pointermove', dom.window.document.body, 10, 70);
  pointer(dom.window, 'pointerup', dom.window.document.body, 10, 70);

  assert.deepEqual(errors, [], 'the drop path throws nothing');
  assert.deepEqual(orderOf(doc), ['自动化任务', '插件', '上下文洞察', '扩展管理', '任务看板', '记忆系统']);
  assert.deepEqual(stateOf(dom.window).order, ['自动化任务', '插件', '上下文洞察', '扩展管理', '任务看板', '记忆系统'],
    'and the order is on disk, not just on screen');
  dispose();
});

test('a drag does not select the panel it was started on', () => {
  const { doc, dom, dispose } = start(both());
  gear(doc).click();
  const first = rows(doc)[0];
  let selected = 0;
  first.addEventListener('click', () => { selected += 1; });
  stubUnits(dom.window, [...doc.querySelectorAll('nav > button[class*="panelRow"]')]);
  pointer(dom.window, 'pointerdown', dragHandles(doc)[0], 10, 14);
  assert.equal(selected, 0, 'pointerdown is swallowed before it becomes a click');
  dispose();
});

test('a drag is saved the moment it lands, without leaving edit mode', () => {
  const { doc, dom, dispose } = start(both());
  gear(doc).click();
  const unitsA = stubUnits(dom.window, [...doc.querySelectorAll('nav > button[class*="panelRow"]')]);
  stubHit(dom.window, unitsA);
  pointer(dom.window, 'pointerdown', dragHandles(doc)[0], 10, 14);
  /* rows are 40px tall at y = index*40. One move only ever shifts the row by
     one slot, because the slot is re-read from the pointer position after the
     DOM has already been reordered -- same as a real continuous drag. */
  pointer(dom.window, 'pointermove', dom.window.document.body, 10, 70);
  pointer(dom.window, 'pointerup', dom.window.document.body, 10, 70);
  const moved = ['自动化任务', '插件', '上下文洞察', '扩展管理', '任务看板', '记忆系统'];
  assert.deepEqual(orderOf(doc), moved);
  /* live writes: the store already holds the new order while still editing */
  assert.deepEqual(stateOf(dom.window).order, moved, 'the drop itself saved the order');
  assert.equal(shadow(doc).dataset.sncEditing, 'true', 'saving must not close the editor');

  const record = stateOf(dom.window);
  gear(doc).click();
  assert.equal(shadow(doc).dataset.sncEditing, 'false', 'the same button leaves edit mode');
  assert.deepEqual(stateOf(dom.window).order, moved, 'leaving changes nothing');
  dispose();

  /* a fresh boot on the SAME storage must come back in the saved order */
  const again = start(both(), record);
  assert.deepEqual(orderOf(again.doc), moved);
  again.dispose();
});

test('Escape leaves edit mode but cannot undo, because every change is already saved', () => {
  const saved = { v: 2, folded: false, hidden: [], views: [], order: ['记忆系统', '插件', '自动化任务', '上下文洞察', '扩展管理', '任务看板'], orderViews: [] };
  const { doc, dom, dispose } = start(both(), saved);
  /* the saved order is already in effect outside edit mode */
  assert.deepEqual(orderOf(doc).slice(0, 2), ['记忆系统', '插件']);

  gear(doc).click();
  const unitsB = stubUnits(dom.window, [...doc.querySelectorAll('nav > button[class*="panelRow"]')]);
  stubHit(dom.window, unitsB);
  pointer(dom.window, 'pointerdown', dragHandles(doc)[0], 10, 14);
  /* "记忆系统" sits at index 0; row 5 spans 200..236 (midpoint 218), so y=230 is
     its trailing half and the drop appends at the end */
  pointer(dom.window, 'pointermove', dom.window.document.body, 10, 230);
  pointer(dom.window, 'pointerup', dom.window.document.body, 10, 230);
  const moved = ['插件', '自动化任务', '上下文洞察', '扩展管理', '任务看板', '记忆系统'];
  assert.deepEqual(orderOf(doc), moved, 'the drag did move things');
  assert.deepEqual(stateOf(dom.window).order, moved, 'and it was written on drop');

  dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  /* there is no draft to discard any more: Escape only stops editing */
  assert.deepEqual(stateOf(dom.window).order, moved, 'Escape is not an undo');
  assert.deepEqual(orderOf(doc), moved, 'the DOM keeps the order the user built');
  assert.equal(shadow(doc).dataset.sncEditing, 'false', 'Escape still leaves edit mode');
  dispose();
});

test('a plugin installed after the layout was saved lands at the end', () => {
  /* the stored keys cover only the original six; a seventh host entry appears */
  const saved = { v: 2, folded: false, hidden: [], views: [], order: ['记忆系统', '插件'], orderViews: [] };
  const names = ['插件', '自动化任务', '任务看板', '记忆系统', '新插件'];
  const { doc, dispose } = start(navigation(names), saved);
  assert.deepEqual(orderOf(doc), ['记忆系统', '插件', '自动化任务', '任务看板', '新插件']);
  dispose();
});

test('view tabs reorder on the horizontal axis and persist', () => {
  const { doc, dom, dispose } = start(both());
  gear(doc).click();
  const items = [...strip(doc).querySelectorAll(':scope > button[role="tab"]')];
  /* tabs are a ROW: left/right is the axis, and each item is 90px wide in the
     synthetic layout, so indices sit at x = 0/90/180/... */
  /* tabs are a ROW: left/right is the axis. Each tab is 90px wide in this
     synthetic layout, so index i spans x = i*90 .. i*90+90. */
  const tabUnits = stubUnits(dom.window, items, 'x', 90);
  stubHit(dom.window, tabUnits, 'x');
  const labels = () => tabEls(doc).map((t) => t.textContent);
  assert.deepEqual(labels(), ['对话', '上下页', '画廊', '编队', '记忆系统']);

  /* carry "对话" rightwards. The synthetic row is 90px per tab, so tab 0 is
     x=0..90 and tab 1 is x=90..180 with its midpoint at 135: x=150 is tab 1's
     trailing half, x=250 falls into tab 2 (180..270) and is also past its
     midpoint, so the carried tab lands after "画廊". */
  const handle = items[0].querySelector('[data-snc-drag]');
  pointer(dom.window, 'pointerdown', handle, 5, 10);
  pointer(dom.window, 'pointermove', dom.window.document.body, 150, 10);
  assert.deepEqual(labels(), ['对话', '上下页', '画廊', '编队', '记忆系统'], 'nothing moves before the drop');
  assert.deepEqual(dropMarks(doc), ['上下页:after']);

  pointer(dom.window, 'pointermove', dom.window.document.body, 250, 10);
  assert.deepEqual(dropMarks(doc), ['画廊:after']);
  pointer(dom.window, 'pointerup', dom.window.document.body, 250, 10);
  assert.deepEqual(labels(), ['上下页', '画廊', '对话', '编队', '记忆系统']);

  gear(doc).click();
  assert.deepEqual(stateOf(dom.window).orderViews, ['上下页', '画廊', '对话', '编队', '记忆系统']);
  dispose();
});

test('replaying the saved order never mutates an already-ordered list', () => {
  /* the observer reacts to childList mutations, so a no-op replay must not
     produce any: otherwise sync and the observer ping-pong forever */
  const saved = { v: 2, folded: false, hidden: [], views: [], order: ['插件', '自动化任务', '上下文洞察', '扩展管理', '任务看板', '记忆系统'], orderViews: [] };
  const { doc, dom, dispose } = start(both(), saved);
  const nav = doc.querySelector('nav[class*="panelList"]');
  let moved = 0;
  const obs = new dom.window.MutationObserver((records) => { moved += records.length; });
  obs.observe(nav, { childList: true });
  /* force four extra sync passes through the plugin's own observer path */
  for (let i = 0; i < 4; i += 1) {
    nav.appendChild(doc.createElement('span'));
    nav.removeChild(nav.lastElementChild);
  }
  return new Promise((resolve) => {
    dom.window.setTimeout(() => {
      obs.disconnect();
      assert.deepEqual(orderOf(doc), saved.order, 'order survives the re-syncs');
      resolve();
      dispose();
    }, 10);
  });
});

test('editing has no pending state, so the gear never carries a dot', () => {
  const { doc, dom, dispose } = start(both());
  const css = cssOf(doc);
  /* The dot used to mean "you have unsaved layout changes". Now that a drag and
     a checkbox both write through, there is no such moment, so the rule and the
     attribute are gone together -- a leftover dot would promise a save step that
     does not exist. */
  assert.doesNotMatch(css, /snc-dirty/);
  gear(doc).click();
  assert.equal(gear(doc).hasAttribute('data-snc-dirty'), false, 'no dirty attribute is published');

  /* and it stays absent through both kinds of change */
  const box = doc.querySelector('[data-snc-check]');
  box.checked = false;
  box.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(gear(doc).hasAttribute('data-snc-dirty'), false);

  const units = stubUnits(dom.window, [...doc.querySelectorAll('nav > button[class*="panelRow"]')]);
  stubHit(dom.window, units);
  pointer(dom.window, 'pointerdown', dragHandles(doc)[0], 10, 14);
  pointer(dom.window, 'pointermove', dom.window.document.body, 10, 70);
  assert.equal(gear(doc).hasAttribute('data-snc-dirty'), false, 'a drag does not raise one either');
  pointer(dom.window, 'pointerup', dom.window.document.body, 10, 70);
  dispose();
});

test('a checkbox toggle is saved immediately, just like a drag', () => {
  const { doc, dom, dispose } = start(both());
  gear(doc).click();
  const box = doc.querySelector('[data-snc-check]');
  box.checked = false;
  box.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  /* the two kinds of change must behave identically: both are already on disk
     while the editor is still open */
  assert.deepEqual(stateOf(dom.window).hidden, ['插件'], 'hiding reached the store at once');
  const record = stateOf(dom.window);

  const again = start(both(), record);
  try {
    /* wrappers only exist while editing, so address the host button directly --
       the flag lives there, not on our wrapper */
    const restored = again.doc.querySelector('nav button[class*="panelRow"]');
    assert.ok(restored, 'the row is still in the DOM after a reboot');
    assert.equal(restored.dataset.sncHidden, 'true', 'the hidden row comes back hidden');
  } finally {
    again.dispose();
  }
  dispose();
});

test('the gear is the only button: no apply/cancel bar exists', () => {
  const { doc, dispose } = start(both());
  const css = cssOf(doc);
  /* the session is a two-state toggle on the gear, so a whole action row would
     duplicate it. Absence is asserted on both the stylesheet and the DOM: a
     leftover rule with no nodes would still be dead weight to maintain. */
  assert.doesNotMatch(css, /\.snc-actions/);
  assert.doesNotMatch(css, /\.snc-(apply|cancel)\b/);
  assert.equal(doc.querySelector('.snc-actions'), null);
  gear(doc).click();
  assert.equal(doc.querySelector('.snc-apply'), null, 'no apply button appears while editing');
  assert.equal(doc.querySelector('.snc-cancel'), null, 'no cancel button appears while editing');
  /* the gear flips to a check mark, which is what says "press me again to save" */
  assert.equal(gear(doc).hasAttribute('data-snc-dirty') ? gear(doc).dataset.sncDirty : 'false', 'false');
  dispose();
});

/* ------------------------ edit mode owns the whole row ------------------------
   The 16px box used to be the only toggle, and a press a few pixels off fell
   through to the host <button>: it selected the panel / switched the view (a
   full re-render of the centre area) while the box never moved. While editing,
   the whole row is the target -- a click toggles, a drag reorders -- and the two
   gestures must never swallow each other. */
test('while editing, a click anywhere on a row toggles it instead of selecting the panel', () => {
  const { doc, dom, dispose } = start();
  gear(doc).click();
  const row = rows(doc).find((r) => r.getAttribute('aria-label') === '任务看板');
  let selected = 0;
  row.addEventListener('click', () => { selected += 1; });
  const label = row.querySelector('[class*="panelTitle"]');
  /* the label, not the box: this is the near miss that used to reach the host */
  label.click();
  assert.equal(selected, 0, 'the host must not see the press, or it would select the panel');
  assert.equal(row.dataset.sncHidden, 'true', 'the press toggled the entry');
  assert.deepEqual(stateOf(dom.window).hidden, ['任务看板'], 'and it saved like every other toggle');
  label.click();
  assert.equal(row.hasAttribute('data-snc-hidden'), false, 'a second press brings it back');
  assert.deepEqual(stateOf(dom.window).hidden, []);
  dispose();
});

test('while editing, a click on a view tab toggles the view instead of switching it', () => {
  /* 上下页 is the view on screen, so the active-view guard is exercised */
  const { doc, dom, dispose } = start(both(undefined, 1));
  gear(doc).click();
  const gallery = tabByLabel(doc, '画廊');
  let switched = 0;
  gallery.addEventListener('click', () => { switched += 1; });
  gallery.click();
  assert.equal(switched, 0, 'the host tab must not see the press, or it would switch view');
  assert.equal(gallery.dataset.sncHidden, 'true');
  assert.deepEqual(stateOf(dom.window).views, ['画廊']);

  /* paint() puts both refused tabs back inside the same click, so asserting
     "still visible" would pass even with the guards deleted. Count the writes
     instead: a refusal must never reach storage. */
  const proto = dom.window.Storage.prototype;
  const realSet = proto.setItem;
  let writes = 0;
  proto.setItem = function (...args) { writes += 1; return realSet.apply(this, args); };
  try {
    tabByLabel(doc, '上下页').click();
    tabByLabel(doc, '对话').click();
  } finally {
    proto.setItem = realSet;
  }
  assert.equal(writes, 0, 'a refused hide writes nothing at all');
  assert.equal(tabByLabel(doc, '上下页').hasAttribute('data-snc-hidden'), false,
    'the view on screen cannot be hidden: the host would silently fall back to chat');
  assert.equal(tabByLabel(doc, '对话').hasAttribute('data-snc-hidden'), false, 'chat can never be hidden');
  dispose();
});

test('dragging a row by its body reorders it, and the click after the drop does not toggle it', () => {
  const { doc, dom, dispose } = start(both());
  gear(doc).click();
  const units = stubUnits(dom.window, [...doc.querySelectorAll('nav > button[class*="panelRow"]')]);
  stubHit(dom.window, units);
  const row = rows(doc)[0];
  /* a press on the label is a drag source while editing, not just the grip */
  pointer(dom.window, 'pointerdown', row.querySelector('[class*="panelTitle"]'), 10, 14);
  pointer(dom.window, 'pointermove', dom.window.document.body, 10, 70);
  pointer(dom.window, 'pointerup', dom.window.document.body, 10, 70);
  assert.deepEqual(orderOf(doc), ['自动化任务', '插件', '上下文洞察', '扩展管理', '任务看板', '记忆系统'],
    'the row moved');
  /* browsers emit a click after pointerup; without the suppression it would
     toggle the very row the user just dragged */
  row.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(row.hasAttribute('data-snc-hidden'), false, 'the drop is a reorder, not a toggle');
  assert.deepEqual(stateOf(dom.window).hidden, []);
  dispose();
});

test('a wobbling whole-row press still toggles the entry', () => {
  /* the whole row is a toggle first: a 5px hand wobble must not start a drag
     and then swallow the click, or the row would neither move nor toggle */
  const { doc, dom, dispose } = start(both());
  gear(doc).click();
  const row = rows(doc)[0];
  pointer(dom.window, 'pointerdown', row.querySelector('[class*="panelTitle"]'), 10, 20);
  pointer(dom.window, 'pointermove', dom.window.document.body, 10, 25);
  pointer(dom.window, 'pointerup', dom.window.document.body, 10, 25);
  assert.equal(row.hasAttribute('data-snc-dragging'), false, 'the press never became a drag');
  row.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(row.dataset.sncHidden, 'true', 'the wobble is still a toggle');
  dispose();
});

test('a touch press on a row keeps scrolling instead of starting a drag', () => {
  /* touch is the one input where a whole-row drag would fight the list scroll,
     so the grip stays its drag source and a tap still toggles */
  const { doc, dom, dispose } = start(both());
  gear(doc).click();
  const row = rows(doc)[0];
  const nav = doc.querySelector('nav[class*="panelList"]');
  pointer(dom.window, 'pointerdown', row.querySelector('[class*="panelTitle"]'), 10, 20, 'touch');
  pointer(dom.window, 'pointermove', dom.window.document.body, 10, 70, 'touch');
  assert.equal(row.hasAttribute('data-snc-dragging'), false, 'no drag, the page keeps its scroll');
  assert.equal(nav.hasAttribute('data-snc-sorting'), false);
  row.querySelector('[class*="panelTitle"]').dispatchEvent(
    new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(row.dataset.sncHidden, 'true', 'a tap toggles like any other press');
  dispose();
});

test('an unrelated panelList is left alone in edit mode too', () => {
  /* the host renders a second panelList for the local session list. It is not
     decorated (isPanelList), so neither the row toggle nor the reorder may touch
     it: writing its keys into savedOrder would orphan every key of ours. */
  const html = navigation() +
    `<nav class="_2H3hWW_panelList" aria-label="Local">${panel('Local 条目')}</nav>`;
  const { doc, dom, dispose } = start(html);
  gear(doc).click();
  const foreign = doc.querySelector('nav[aria-label="Local"]');
  const foreignRow = foreign.querySelector('button[class*="panelRow"]');
  let reached = 0;
  foreignRow.addEventListener('click', () => { reached += 1; });
  foreignRow.click();
  assert.equal(reached, 1, 'the host still sees the press');
  assert.deepEqual(stateOf(dom.window).hidden, [], 'and nothing is hidden in our record');
  assert.equal(foreignRow.hasAttribute('data-snc-hidden'), false);

  const units = stubUnits(dom.window, [foreignRow]);
  stubHit(dom.window, units);
  pointer(dom.window, 'pointerdown', foreignRow, 10, 14);
  pointer(dom.window, 'pointermove', dom.window.document.body, 10, 70);
  pointer(dom.window, 'pointerup', dom.window.document.body, 10, 70);
  assert.deepEqual(stateOf(dom.window).order, [], 'an unmanaged list never writes our order');
  dispose();
});

test('a cancelled gesture commits nothing and does not swallow the next click', () => {
  const { doc, dom, dispose } = start(both());
  gear(doc).click();
  const units = stubUnits(dom.window, [...doc.querySelectorAll('nav > button[class*="panelRow"]')]);
  stubHit(dom.window, units);
  const before = orderOf(doc);
  const row = rows(doc)[0];
  pointer(dom.window, 'pointerdown', row.querySelector('[class*="panelTitle"]'), 10, 14);
  pointer(dom.window, 'pointermove', dom.window.document.body, 10, 70);
  /* the OS takes the gesture away mid-drag: an abort, not a drop */
  pointer(dom.window, 'pointercancel', dom.window.document.body, 10, 70);
  assert.deepEqual(orderOf(doc), before, 'the list keeps the order it had');
  assert.deepEqual(stateOf(dom.window).order, [], 'and nothing was written');
  assert.equal(row.hasAttribute('data-snc-dragging'), false, 'the carried row is not left dimmed');
  row.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(row.dataset.sncHidden, 'true', 'the next click still toggles: a cancel is not a drop');
  dispose();
});

test('a row the host removes mid-drag is not put back by the drop', () => {
  const { doc, dom, dispose } = start(both());
  gear(doc).click();
  const units = stubUnits(dom.window, [...doc.querySelectorAll('nav > button[class*="panelRow"]')]);
  stubHit(dom.window, units);
  const row = rows(doc)[0];
  pointer(dom.window, 'pointerdown', row.querySelector('[class*="panelTitle"]'), 10, 14);
  pointer(dom.window, 'pointermove', dom.window.document.body, 10, 70);
  /* the host re-renders the list while the pointer is down */
  row.remove();
  pointer(dom.window, 'pointerup', dom.window.document.body, 10, 70);
  assert.equal(row.isConnected, false, 'the host removed it and keeps it removed');
  assert.deepEqual(stateOf(dom.window).order, [], 'the removed row is never persisted');
  dispose();
});

test('the host\'s anchor-wrapped row toggles from its whole row, controls and gap included', () => {
  const { doc, dom, dispose } = start(navigationWithMore());
  gear(doc).click();
  const anchor = doc.querySelector('[class*="moreAnchor"]');
  const ctl = anchor.querySelector(':scope > .snc-ctl');
  /* the slot is a child of the anchor, not of the inner button: this press used
     to be swallowed without toggling anything, while the same spot toggles on
     every other row */
  ctl.click();
  assert.equal(anchor.dataset.sncHidden, 'true', 'the slot toggles the row');
  assert.deepEqual(stateOf(dom.window).hidden, ['更多']);
  /* pressing the anchor itself (the gap around the button) toggles too */
  anchor.click();
  assert.equal(anchor.hasAttribute('data-snc-hidden'), false, 'and the anchor gap toggles it back');
  assert.deepEqual(stateOf(dom.window).hidden, []);
  dispose();
});

/* ---------------------- right sidebar guide cards ----------------------
   The hero and the entryCell/moreAnchor units are direct guide children. The
   button stays inside its host-owned unit; descriptions and shortcuts are not
   stable identities. */
const guideEntries = [
  ['files', '文件', '浏览项目文件', '⌘1'],
  ['terminal', '终端', '打开命令行', '⌘2'],
  ['git', 'Git', '查看版本变更', '⌘3'],
  ['browser', '浏览器', '打开网页', '⌘4'],
];
const rightGuide = () => `<div data-sidebar-right-guide class="geFEbW_guide">` +
  `<span class="geFEbW_hero" aria-hidden="true">compass</span>` +
  guideEntries.map(([kind, title, description, shortcut]) =>
    `<div class="geFEbW_entryCell">` + (kind === 'terminal'
      ? `<div data-sidebar-right-guide-entry="terminal" class="terminal_entry">` +
        `<button type="button" class="terminal_main" aria-label="${title} ${description}"></button>` +
        `<span class="terminal_title" aria-hidden="true">${title}</span>` +
        `<span class="terminal_menu"><button type="button" class="terminal_trigger" aria-label="选择 shell" aria-haspopup="menu">⌄</button></span>` +
        `<span class="terminal_description">${description}</span><span class="terminal_shortcut">${shortcut}</span></div>`
      : `<button type="button" data-sidebar-right-guide-entry="${kind}" class="geFEbW_entry">` +
        `<span class="geFEbW_entryTitle">${title}</span><span class="geFEbW_entryDescription">${description}</span>` +
        `<span class="geFEbW_entryShortcut">${shortcut}</span></button>`) + '</div>').join('') +
  `<span class="geFEbW_moreAnchor"><button type="button" class="geFEbW_entry" aria-label="更多工具" aria-haspopup="menu">` +
  `<span class="geFEbW_entryTitle">更多工具</span></button></span></div>`;
const rightUnits = (guide) => [...guide.children].filter((child) => child.querySelector(':scope > [data-sidebar-right-guide-entry], :scope > button[aria-haspopup="menu"]'));
const rightUnit = (guide, key) => rightUnits(guide).find((unit) => {
  const entry = unit.querySelector('[data-sidebar-right-guide-entry]');
  return entry ? `kind:${entry.getAttribute('data-sidebar-right-guide-entry')}` === key : key === 'action:more';
});
const rightOrder = (guide) => rightUnits(guide).map((unit) => {
  const entry = unit.querySelector('[data-sidebar-right-guide-entry]');
  return entry ? `kind:${entry.getAttribute('data-sidebar-right-guide-entry')}` : 'action:more';
});
const rightBox = (unit) => unit.querySelector(':scope > .snc-ctl > input[type="checkbox"]');
const defaultRightOrder = ['kind:files', 'kind:terminal', 'kind:git', 'kind:browser', 'action:more'];

test('the existing editor hides and restores guide cards, including files and more', () => {
  const { doc, dom, dispose } = start(both() + rightGuide());
  try {
    const guide = doc.querySelector('[data-sidebar-right-guide]');
    const hero = guide.firstElementChild;
    const units = rightUnits(guide);
    const buttons = units.map((unit) => unit.querySelector('[data-sidebar-right-guide-entry], button.geFEbW_entry'));
    assert.equal(units.length, 5);
    assert.equal(guide.querySelector('.snc-ctl'), null, 'no guide controls outside edit mode');

    gear(doc).click();
    assert.equal(gear(doc).getAttribute('aria-pressed'), 'true');
    assert.equal(doc.querySelector('[role="dialog"]'), null, 'the guide uses the existing inline editor');
    assert.deepEqual(rightUnits(guide), units, 'the host units are not wrapped or reparented');
    assert.equal(guide.firstElementChild, hero, 'the hero stays first');
    for (const [i, unit] of units.entries()) {
      const ctl = unit.querySelector(':scope > .snc-ctl');
      assert.ok(ctl, 'each direct guide unit gets controls');
      assert.equal(unit.firstElementChild, ctl, 'controls are prepended to the unit');
      assert.ok(ctl.querySelector('[data-snc-drag]'), 'each card can be reordered');
      assert.ok(rightBox(unit)?.checked, 'each card starts visible');
      assert.equal(buttons[i].parentElement, unit, 'the host button keeps its parent');
    }

    const files = rightUnit(guide, 'kind:files');
    const more = rightUnit(guide, 'action:more');
    rightBox(files).click();
    rightBox(more).click();
    assert.deepEqual(stateOf(dom.window).right, ['kind:files', 'action:more']);
    for (const unit of [files, more]) {
      assert.equal(unit.dataset.sncHidden, 'true');
      assert.equal(rightBox(unit).checked, false);
      assert.notEqual(dom.window.getComputedStyle(unit).display, 'none', 'hidden cards remain reachable while editing');
      assert.notEqual(dom.window.getComputedStyle(unit).visibility, 'hidden');
      assert.ok([unit, unit.querySelector('button')].some((el) => {
        const opacity = Number.parseFloat(dom.window.getComputedStyle(el).opacity);
        return opacity > 0 && opacity < 1;
      }), 'a hidden card is dimmed while editing');
    }

    gear(doc).click();
    for (const unit of [files, more]) {
      assert.equal(rightBox(unit), null, 'controls leave with edit mode');
      assert.equal(dom.window.getComputedStyle(unit).display, 'none', 'the hidden unit leaves the layout');
    }
    gear(doc).click();
    for (const unit of [files, more]) {
      assert.equal(rightBox(unit).checked, false, 'hidden cards can be restored');
      rightBox(unit).click();
    }
    assert.deepEqual(stateOf(dom.window).right, []);
    for (const key of ['kind:terminal', 'kind:git', 'kind:browser']) {
      const unit = rightUnit(guide, key);
      rightBox(unit).click();
      assert.equal(unit.dataset.sncHidden, 'true');
      assert.deepEqual(stateOf(dom.window).right, [key], 'each entry stores its stable kind');
      rightBox(unit).click();
    }
    assert.deepEqual(stateOf(dom.window).right, []);
    gear(doc).click();
    assert.notEqual(dom.window.getComputedStyle(files).display, 'none');
    assert.notEqual(dom.window.getComputedStyle(more).display, 'none');
  } finally {
    dispose();
  }
});

test('guide card and checkbox clicks toggle visibility without opening the host tool or menu', () => {
  const { doc, dom, dispose } = start(navigation() + rightGuide());
  try {
    const guide = doc.querySelector('[data-sidebar-right-guide]');
    const files = rightUnit(guide, 'kind:files');
    const more = rightUnit(guide, 'action:more');
    const reached = { button: 0, unit: 0 };
    for (const unit of [files, more]) {
      unit.addEventListener('click', () => { reached.unit += 1; });
      unit.querySelector('button').addEventListener('click', () => { reached.button += 1; });
    }
    gear(doc).click();
    for (const [unit, key] of [[files, 'kind:files'], [more, 'action:more']]) {
      const box = rightBox(unit);
      assert.ok(box, `checkbox for ${key}`);
      unit.querySelector('[class*="entryTitle"]').click();
      assert.equal(box.checked, false, 'clicking the card body hides it');
      assert.deepEqual(stateOf(dom.window).right, [key]);
      box.click();
      assert.equal(box.checked, true, 'the checkbox restores it');
      assert.deepEqual(stateOf(dom.window).right, []);
    }
    assert.deepEqual(reached, { button: 0, unit: 0 }, 'neither host handler sees editing clicks');
    gear(doc).click();
    files.querySelector('button[data-sidebar-right-guide-entry]').click();
    more.querySelector('button').click();
    assert.deepEqual(reached, { button: 2, unit: 2 }, 'host clicks work normally after editing');
  } finally {
    dispose();
  }
});

test('vertical guide drag saves immediately without changing left or view preferences', () => {
  const left = ['记忆系统', '插件', '自动化任务', '上下文洞察', '扩展管理', '任务看板'];
  const views = ['对话', '画廊', '上下页', '编队', '记忆系统'];
  const saved = rec({ hidden: ['任务看板'], views: ['编队'], actions: ['浏览更多插件'],
    order: left, orderViews: views, right: ['kind:browser'], orderRight: [] });
  const { doc, dom, dispose } = start(both() + rightGuide(), saved);
  try {
    const guide = doc.querySelector('[data-sidebar-right-guide]');
    const hero = guide.firstElementChild;
    gear(doc).click();
    const units = stubUnits(dom.window, rightUnits(guide));
    stubHit(dom.window, units);
    const files = rightUnit(guide, 'kind:files');
    assert.ok(files.querySelector('[data-snc-drag]'), 'guide card has a drag handle');
    let opened = 0;
    files.querySelector('button[data-sidebar-right-guide-entry]').addEventListener('click', () => { opened += 1; });
    pointer(dom.window, 'pointerdown', files.querySelector('[class*="entryTitle"]'), 10, 54);
    pointer(dom.window, 'pointermove', doc.body, 10, 110);
    assert.deepEqual(rightOrder(guide), defaultRightOrder, 'the preview does not reorder before drop');
    pointer(dom.window, 'pointerup', doc.body, 10, 110);
    const moved = ['kind:terminal', 'kind:files', 'kind:git', 'kind:browser', 'action:more'];
    assert.deepEqual(rightOrder(guide), moved);
    assert.equal(guide.firstElementChild, hero, 'the hero is not a draggable unit');
    const record = stateOf(dom.window);
    assert.deepEqual(record.orderRight, moved, 'drop writes the right order immediately');
    assert.deepEqual(record.right, ['kind:browser']);
    for (const key of ['hidden', 'views', 'actions', 'order', 'orderViews']) {
      assert.deepEqual(record[key], saved[key], `${key} is independent of the right guide`);
    }
    files.querySelector('button[data-sidebar-right-guide-entry]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    assert.equal(opened, 0, 'the post-drag click does not open the tool');
    assert.equal(files.hasAttribute('data-snc-hidden'), false, 'the post-drag click does not hide the card');
    assert.deepEqual(stateOf(dom.window).right, ['kind:browser']);

    const again = start(both() + rightGuide(), record);
    try {
      assert.deepEqual(rightOrder(again.doc.querySelector('[data-sidebar-right-guide]')), moved, 'the order survives reload');
    } finally {
      again.dispose();
    }
  } finally {
    dispose();
  }
});

test('an old v2 record without right fields still permits saving right preferences', () => {
  const old = rec({ hidden: ['任务看板'], views: ['编队'] });
  delete old.right;
  delete old.orderRight;
  const { doc, dom, dispose } = start(both() + rightGuide(), old);
  try {
    const guide = doc.querySelector('[data-sidebar-right-guide]');
    assert.deepEqual(rightOrder(guide), defaultRightOrder);
    assert.ok(rightUnits(guide).every((unit) => !unit.hasAttribute('data-snc-hidden')));
    gear(doc).click();
    const box = rightBox(rightUnit(guide, 'kind:files'));
    assert.ok(box, 'an old record still exposes the right editor');
    box.click();
    const record = stateOf(dom.window);
    assert.equal(record.v, 2, 'right preferences are additive to v2');
    assert.deepEqual(record.right, ['kind:files']);
    assert.deepEqual(record.hidden, old.hidden);
    assert.deepEqual(record.views, old.views);
  } finally {
    dispose();
  }
});

test('saved guide identities replay with changed descriptions and invalid fields default safely', () => {
  const order = ['action:more', 'kind:git', 'kind:files', 'kind:terminal', 'kind:browser'];
  const saved = rec({ right: ['kind:terminal', 'action:more'], orderRight: order });
  const changed = rightGuide().replace('打开命令行', '新的描述 🙂').replace('⌘2', 'Ctrl+Alt+T');
  const first = start(both() + changed, saved);
  try {
    const guide = first.doc.querySelector('[data-sidebar-right-guide]');
    assert.deepEqual(rightOrder(guide), order, 'stable keys restore the saved order');
    assert.equal(rightUnit(guide, 'kind:terminal').dataset.sncHidden, 'true');
    assert.equal(rightUnit(guide, 'action:more').dataset.sncHidden, 'true');
    assert.equal(rightUnit(guide, 'kind:files').hasAttribute('data-snc-hidden'), false);
    assert.equal(guide.firstElementChild.className, 'geFEbW_hero');
  } finally {
    first.dispose();
  }

  const cases = [
    { right: null, orderRight: [null, 'kind:browser', 42, 'kind:files'], hidden: [], order: ['kind:browser', 'kind:files'],
      rendered: ['kind:browser', 'kind:files', 'kind:terminal', 'kind:git', 'action:more'] },
    { right: ['kind:files', null, 7, 'action:more'], orderRight: false,
      hidden: ['kind:files', 'action:more'], order: [], rendered: defaultRightOrder },
    { right: { 0: 'kind:files' }, orderRight: 'kind:git', hidden: [], order: [], rendered: defaultRightOrder },
    { right: 0, orderRight: null, hidden: [], order: [], rendered: defaultRightOrder },
  ];
  for (const example of cases) {
    const app = start(both() + rightGuide(), rec({ right: example.right, orderRight: example.orderRight }));
    try {
      const guide = app.doc.querySelector('[data-sidebar-right-guide]');
      assert.deepEqual(rightOrder(guide), example.rendered);
      for (const key of defaultRightOrder) {
        assert.equal(rightUnit(guide, key).dataset.sncHidden === 'true', example.hidden.includes(key), key);
      }
      gear(app.doc).click();
      const box = rightBox(rightUnit(guide, 'kind:terminal'));
      assert.ok(box, 'malformed stored fields do not break editing');
      box.dispatchEvent(new app.dom.window.Event('change', { bubbles: true }));
      const record = stateOf(app.dom.window);
      assert.deepEqual(record.right, example.hidden, 'invalid hidden entries are discarded on save');
      assert.ok(record.orderRight === undefined || Array.isArray(record.orderRight));
      assert.deepEqual(record.orderRight || [], example.order, 'an invalid order safely defaults to empty');
      assert.equal(record.v, 2);
    } finally {
      app.dispose();
    }
  }
});

test('late and remounted guides share saved visibility and order across instances', async () => {
  const order = ['kind:browser', 'action:more', 'kind:files', 'kind:terminal', 'kind:git'];
  const { doc, dom, dispose } = start(both(), rec({ right: ['kind:files', 'action:more'], orderRight: order }));
  try {
    gear(doc).click();
    doc.body.insertAdjacentHTML('beforeend', rightGuide() + rightGuide());
    await flush();
    let guides = [...doc.querySelectorAll('[data-sidebar-right-guide]')];
    assert.equal(guides.length, 2);
    for (const guide of guides) {
      assert.deepEqual(rightOrder(guide), order, 'late guide receives the saved order');
      assert.equal(rightUnit(guide, 'action:more').dataset.sncHidden, 'true');
      const box = rightBox(rightUnit(guide, 'kind:files'));
      assert.ok(box, 'late guide receives edit controls');
      assert.equal(box.checked, false);
    }
    rightBox(rightUnit(guides[0], 'kind:files')).click();
    await flush();
    assert.deepEqual(stateOf(dom.window).right, ['action:more']);
    assert.equal(rightBox(rightUnit(guides[1], 'kind:files')).checked, true, 'the other guide reflects the change');

    guides[0].outerHTML = rightGuide();
    await flush();
    guides = [...doc.querySelectorAll('[data-sidebar-right-guide]')];
    for (const guide of guides) {
      assert.deepEqual(rightOrder(guide), order, 'a remount replays the order');
      assert.equal(rightUnit(guide, 'action:more').dataset.sncHidden, 'true');
      assert.equal(rightBox(rightUnit(guide, 'kind:files')).checked, true);
      assert.equal(guide.firstElementChild.className, 'geFEbW_hero');
    }
    gear(doc).click();
    assert.ok(guides.every((guide) => guide.querySelector('.snc-ctl') === null));
    assert.ok(guides.every((guide) => dom.window.getComputedStyle(rightUnit(guide, 'action:more')).display === 'none'));
  } finally {
    dispose();
  }
});

test('guide management leaves similar outside cards and the hero alone without observer churn', async () => {
  const foreign = `<div id="foreign" class="geFEbW_entryCell"><button class="geFEbW_entry" ` +
    `data-sidebar-right-guide-entry="files">外部文件</button></div>` +
    `<div data-sidebar-right-dock><button role="tab" aria-selected="true">文件</button></div>`;
  const order = ['kind:browser', 'kind:git', 'kind:terminal', 'kind:files', 'action:more'];
  const { doc, dom, dispose } = start(both() + rightGuide() + foreign,
    rec({ right: ['kind:files'], orderRight: order }));
  let observer;
  let stoppedStorm = false;
  try {
    const guide = doc.querySelector('[data-sidebar-right-guide]');
    const hero = guide.firstElementChild;
    const outside = doc.querySelector('#foreign');
    const dockTab = doc.querySelector('[data-sidebar-right-dock] button');
    assert.deepEqual(rightOrder(guide), order);
    assert.equal(rightUnit(guide, 'kind:files').dataset.sncHidden, 'true');
    gear(doc).click();
    await flush();
    assert.equal(guide.firstElementChild, hero);
    assert.equal(hero.querySelector('.snc-ctl'), null);
    assert.equal(hero.hasAttribute('data-snc-hidden'), false);
    assert.equal(outside.querySelector('.snc-ctl'), null);
    assert.equal(outside.hasAttribute('data-snc-hidden'), false);
    assert.equal(dockTab.querySelector('.snc-ctl'), null);
    let hostClicks = 0;
    for (const el of [hero, outside.querySelector('button'), dockTab]) el.addEventListener('click', () => { hostClicks += 1; });
    hero.click();
    outside.querySelector('button').click();
    dockTab.click();
    assert.equal(hostClicks, 3, 'unmanaged elements keep their host click behavior');
    assert.deepEqual(stateOf(dom.window).right, ['kind:files']);

    let changes = 0;
    observer = new dom.window.MutationObserver((records) => {
      changes += records.length;
      if (changes > 32) {
        stoppedStorm = true;
        observer.disconnect();
        dispose();
      }
    });
    observer.observe(guide, { childList: true, subtree: true });
    for (let i = 0; i < 4; i += 1) {
      const marker = doc.createElement('i');
      doc.body.append(marker);
      marker.remove();
      await flush();
    }
    await new Promise((resolve) => dom.window.setTimeout(resolve, 10));
    assert.equal(stoppedStorm, false, 'replay must settle rather than retrigger itself');
    assert.ok(changes <= 16, `resyncs must not repeatedly mutate guide children: ${changes}`);
    assert.deepEqual(rightOrder(guide), order);
  } finally {
    observer?.disconnect();
    if (!stoppedStorm) dispose();
  }
});

test('disabling the plugin removes guide controls and hidden or editing flags', async () => {
  const { doc, dom, dispose } = start(both() + rightGuide(),
    rec({ right: ['kind:files', 'action:more'], orderRight: ['action:more', 'kind:files'] }));
  let disposed = false;
  try {
    const guide = doc.querySelector('[data-sidebar-right-guide]');
    const files = rightUnit(guide, 'kind:files');
    gear(doc).click();
    assert.ok(rightBox(files), 'guide was managed before teardown');
    assert.equal(files.dataset.sncHidden, 'true');
    let opened = 0;
    files.querySelector('button[data-sidebar-right-guide-entry]').addEventListener('click', () => { opened += 1; });
    dispose();
    disposed = true;
    assert.equal(guide.querySelector('.snc-ctl'), null);
    assert.deepEqual(rightOrder(guide), defaultRightOrder, 'disabling restores the native guide order');
    assert.equal(guide.matches('[data-snc-editing], [data-snc-hidden]'), false);
    assert.equal(guide.querySelector('[data-snc-hidden], [data-snc-editing], [data-snc-sorting], [data-snc-dragging], [data-snc-drop]'), null);
    assert.equal(doc.documentElement.hasAttribute('data-snc-editing'), false);
    files.querySelector('button[data-sidebar-right-guide-entry]').click();
    assert.equal(opened, 1, 'the original host button works after teardown');
    doc.body.insertAdjacentHTML('beforeend', rightGuide());
    await flush();
    const late = [...doc.querySelectorAll('[data-sidebar-right-guide]')][1];
    assert.equal(late.querySelector('.snc-ctl, [data-snc-hidden], [data-snc-editing]'), null, 'the observer was removed');
  } finally {
    if (!disposed) dispose();
  }
});

test('guide move buttons reorder without dragging, toggling or opening the tool', () => {
  const { doc, dom, dispose } = start(navigation() + rightGuide());
  try {
    gear(doc).click();
    const guide = doc.querySelector('[data-sidebar-right-guide]');
    const files = rightUnit(guide, 'kind:files');
    const terminal = rightUnit(guide, 'kind:terminal');
    const up = (unit) => unit.querySelector('[data-snc-move="-1"]');
    const down = (unit) => unit.querySelector('[data-snc-move="1"]');
    let opened = 0;
    terminal.querySelector('.terminal_main').addEventListener('click', () => { opened += 1; });
    assert.equal(up(files).disabled, true, 'first card cannot move further up');
    assert.equal(down(rightUnit(guide, 'action:more')).disabled, true, 'last card cannot move further down');
    assert.equal(up(terminal).getAttribute('aria-label'), '上移终端');
    up(terminal).click();
    assert.deepEqual(rightOrder(guide), ['kind:terminal', 'kind:files', 'kind:git', 'kind:browser', 'action:more']);
    assert.deepEqual(stateOf(dom.window).orderRight, rightOrder(guide));
    assert.equal(up(terminal).disabled, true);
    down(terminal).click();
    assert.deepEqual(rightOrder(guide), defaultRightOrder);
    assert.deepEqual(stateOf(dom.window).right, [], 'moving never toggles visibility');
    assert.equal(opened, 0, 'moving never opens the host tool');
    assert.deepEqual(stateOf(dom.window).order, [], 'left order remains independent');
  } finally {
    dispose();
  }
});

test('guide move buttons preserve focus for repeated keyboard moves', () => {
  const { doc, dispose } = start(navigation() + rightGuide());
  try {
    gear(doc).click();
    const guide = doc.querySelector('[data-sidebar-right-guide]');
    const git = rightUnit(guide, 'kind:git');
    const up = git.querySelector('[data-snc-move="-1"]');
    const down = git.querySelector('[data-snc-move="1"]');
    up.focus();
    up.click();
    assert.equal(doc.activeElement, up, 'focus survives the DOM move');
    doc.activeElement.click();
    assert.equal(rightOrder(guide)[0], 'kind:git', 'the same control can move the card twice');
    assert.equal(doc.activeElement, down, 'at the edge focus moves to the available direction');
  } finally {
    dispose();
  }
});

test('the composite terminal launch button and shell menu stay inert while editing', () => {
  const { doc, dom, dispose } = start(navigation() + rightGuide());
  try {
    const terminal = rightUnit(doc.querySelector('[data-sidebar-right-guide]'), 'kind:terminal');
    const launch = terminal.querySelector('.terminal_main');
    const shellMenu = terminal.querySelector('.terminal_trigger');
    let opened = 0;
    launch.addEventListener('click', () => { opened += 1; });
    shellMenu.addEventListener('click', () => { opened += 1; });
    gear(doc).click();
    assert.equal(rightBox(terminal).getAttribute('aria-label'), '终端 显示');
    launch.click();
    assert.deepEqual(stateOf(dom.window).right, ['kind:terminal']);
    shellMenu.click();
    assert.deepEqual(stateOf(dom.window).right, []);
    assert.equal(opened, 0, 'editing clicks never launch a process or open the shell menu');
    gear(doc).click();
    launch.click();
    shellMenu.click();
    assert.equal(opened, 2, 'both native actions work after editing');
  } finally {
    dispose();
  }
});

test('a guide entry losing its marker cannot change more-tools preferences or keep stale controls', async () => {
  const { doc, dom, dispose } = start(navigation() + rightGuide(), rec({ right: ['kind:files'] }));
  try {
    gear(doc).click();
    const guide = doc.querySelector('[data-sidebar-right-guide]');
    const files = rightUnit(guide, 'kind:files');
    const staleBox = rightBox(files);
    files.querySelector('[data-sidebar-right-guide-entry]').removeAttribute('data-sidebar-right-guide-entry');
    staleBox.checked = false;
    staleBox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.deepEqual(stateOf(dom.window).right, ['kind:files'], 'a stale control never aliases action:more');
    await flush();
    assert.equal(files.querySelector('.snc-ctl'), null);
    assert.equal(files.hasAttribute('data-snc-hidden'), false);
    assert.ok(rightBox(rightUnit(guide, 'action:more')).checked, 'More tools remains visible');
  } finally {
    dispose();
  }
});
