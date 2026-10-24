window.__ModuleLoader__.load({
  id: 'dsh-sidebar-manager',
  factory: () => {
    const module = { exports: {} };
    /* One versioned record holds every preference: folding, the hidden
       sidebar rows and the hidden view tabs.

       The storage namespace keeps its original "dsh-sidebar-nav-collapse"
       prefix on purpose. The package was renamed to dsh-sidebar-manager, but
       changing these keys would silently drop every preference a user already
       has, and there is nothing to gain: the prefix is internal and never
       shown anywhere. */
    const STORE_STATE = 'dsh-sidebar-nav-collapse:state';
    const STATE_VERSION = 2;
    /* read once, only to migrate away from the pre-version record */
    const STORE_HIDDEN = 'dsh-sidebar-nav-collapse:hidden';
    const STORE_FOLDED = 'dsh-sidebar-nav-collapse:folded';
    const STORE_VIEWS = 'dsh-sidebar-nav-collapse:views';
    const NAME = 'dsh-sidebar-manager';
    /* the label of our own group row; a host entry with this exact name gets
       the separator treatment */
    const GROUP_NAME = '扩展管理';

    /*
     * The host nav[class*="panelList"] is fully owned by React: it is a plain
     * column flex stack of rows with no heading row, and it has no
     * MutationObserver of its own. Most rows are bare button.panelRow children,
     * but not all: the host's trailing "more" entry is wrapped in an anchor
     * element (the popup is placed from that box), so anything that walks the
     * list works on "the direct child that owns a panelRow", never on the
     * button itself. Inserting our own buttons INTO it is
     * therefore unsafe (a re-render reconciles the children back), so the whole
     * nav is wrapped in a div of ours. The wrapper carries the group row and the
     * gear in normal flow; the nav keeps its own geometry untouched and the
     * wrapper copies its box so the surrounding column layout does not shift.
     *
     * The conversation view tabs live in a DIFFERENT subtree
     * (div[data-conversation-tabs] > button[role=tab]) and are not wrappable:
     * they sit inside the host header grid, so they are hidden through a data
     * attribute on the strip instead. Tabs are matched by their stable text
     * label, because the host renders no id attribute on them.
     *
     * Geometry mirrors the native sidebar tokens read from
     * dsh-client-ui-sidebar/SidebarRoot.module.css:
     *   panelRow  min-height 36px, padding 7px 8px, gap 8px,
     *             radius var(--dsw-radius-md) 12px, margin 0 2px, line-height 22px
     *   panelList column flex, gap 4px, margin-bottom 8px
     *   radius-sm 8px (28x28 icon buttons)
     * Colours come from the live custom properties so light/dark just works.
     */
    const css = `
.snc-shell { display: block; margin-bottom: 8px; }
.snc-shell > nav[class*="panelList"] { margin-bottom: 0; }

/* hidden entries stay in the DOM (checkbox restorable) but leave the flow.
   A row is not always a bare <button> child of the list: the host wraps its own
   "more" entry in an anchor element, because the popup it opens is positioned
   from that box. So the hidden flag lands on whatever direct child of the list
   either IS a row or OWNS one, and both shapes have to leave the flow. */
nav[class*="panelList"] > button[class*="panelRow"][data-snc-hidden="true"],
nav[class*="panelList"] > :has(> button[class*="panelRow"])[data-snc-hidden="true"] { display: none !important; }

/* ---- group row: same box model as a native panelRow ---- */
.snc-group {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 0;
  width: 100%;
  min-height: 36px;
  margin: 0 2px;
  /* A section label sits 5px left of where a row label sits: measured off a
     real sidebar screenshot, "工作区" starts at x=17 while this caption sat at
     x=22. The row's own indents are margin 2 + padding 8; keeping the 2px
     margin and taking those 5px off the leading padding lands the text on
     x=17 while leaving the box (and therefore the hover fill) exactly as wide
     as a row. */
  padding: 7px 8px 7px 3px;
  border: 0;
  border-radius: var(--dsw-radius-md, 12px);
  background: transparent;
  color: var(--dsw-alias-label-primary, inherit);
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  text-align: left;
  cursor: pointer;
  flex: 1 1 auto;
  /* a toggle is a control, not copy: dragging across it must not leave the
     label smeared in a selection highlight */
  -webkit-user-select: none;
  user-select: none;
}
.snc-group:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(38,49,72,.06)); }
.snc-group:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, currentColor); outline-offset: -2px; }
/* NOTE: the row must NOT be painted for being expanded or folded. Both the
   permanent tint and the 1px hairline were tried and both were noise: the tint
   reads as "this one is selected" (wrong for a header), and the hairline only
   restated what the chevron and the visible list already say. The row is
   structure; it lights up only while the pointer is physically on it. */

/* the fold target is the whole row, so nothing here needs its own hit area */
/* ---- the caption: names the group in the host's own voice ------------------
   Sized and weighted from the shipped theme tokens rather than hand-picked,
   so it matches the native sidebar section labels: --dsw-font-s-strong-14 is
   500 / 14px / 22px, the same step the panelRow text uses (14px via font:
   inherit plus a 22px line box). Colour is label-secondary, one step quieter
   than the entries below, which is what makes it read as a header.

   Earlier revisions used 11px upper-case tertiary type: that is a different
   register (a group caption in a dense IDE tree), and next to DSH's own 14px
   chrome it looked like a stray label from another app. */
.snc-caption {
  flex: 1 1 auto;
  min-width: 0;
  font-family: var(--dsw-font-family, inherit);
  font-size: var(--dsw-font-s-strong-14-font-size, 14px);
  font-weight: var(--dsw-font-s-strong-14-font-weight, 500);
  line-height: var(--dsw-font-s-strong-14-line-height, 22px);
  /* The caption is a section label, so it takes the section-label tier, not the
     row tier. Native "工作区" measures rgb(109,113,118) = label-tertiary, while
     label-secondary (#61666b) came out a step darker and made this row read as
     a ninth navigation entry instead of the header of the group below it. */
  color: var(--dsw-alias-label-tertiary, #81858c);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---- the two trailing actions: settings, then fold ------------------------
   Both are 20px boxes so the gap between them is a real dead zone: pressing
   the gear can never land on the chevron, and the chevron only reflects state
   (pressing the row itself is what folds). */
.snc-bud,
.snc-chev {
  flex: none;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-sm, 6px);
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #81858c);
  cursor: pointer;
  transition: color .12s ease, background .12s ease, transform .15s var(--ds-ease-in-out, ease),
              opacity .15s ease;
}
.snc-bud > svg,
.snc-chev > svg { display: block; width: 14px; height: 14px; overflow: visible; }
.snc-bud:hover,
.snc-chev:hover { color: var(--dsw-alias-label-secondary, #61666b); background: rgba(0,0,0,.04); }
.snc-bud:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, currentColor); outline-offset: -2px; }
.snc-bud[aria-pressed="true"] { color: var(--dsw-alias-brand-primary, #2b6cf6); }

/* ---- A2: the gear is not on the row until the row is approached -----------
   The header is structure first: at rest it is a caption and a chevron, so
   nothing competes with the six extension names below it. The gear fades in on
   hover, and it STAYS visible in the two states where hovering is impossible or
   pointless -- a folded list (the row is the only thing left, so a hidden gear
   could never be reached) and an open edit session (its state has to be
   readable). Focus-visible is included so it is reachable by keyboard. */
.snc-bud { opacity: 0; }
.snc-group:hover .snc-bud,
.snc-group:focus-within .snc-bud,
.snc-shell[data-snc-folded="true"] .snc-bud,
.snc-shell[data-snc-editing="true"] .snc-bud { opacity: 1; }
/* touch screens never hover: an invisible press target there is a trap */
@media (hover: none) {
  .snc-bud { opacity: 1; }
}
/* collapsed: the arrow turns to point the way the list will open */
.snc-chev { transform: rotate(0deg); }
.snc-group[aria-expanded="false"] .snc-chev { transform: rotate(-90deg); }

/* ---- folded: only the group row survives ---- */
.snc-shell[data-snc-folded="true"] > nav[class*="panelList"] { display: none; }

/* ---- edit mode: the controls live INSIDE the host row ----------------------
   Nothing the host owns is ever re-parented. An earlier build wrapped every row
   in a <div class="snc-entry"> so the box could sit in a gutter of its own;
   React still held a reference to the wrapped button, so the first re-render
   that had to remove or re-insert it threw NotFoundError and blanked the header
   and the sidebar together. The grip and the box are now appended to the row
   itself (for the host's "more" anchors: to the anchor, beside its button) and
   removed again on the way out -- a row React replaces simply takes our two
   nodes with it.
   The row is a <button>, so a press inside it would also select the panel:
   while editing the capture handler treats a press on the row as a toggle and
   stops it before the host sees it (see onControlClick). */
.snc-ctl {
  display: inline-flex; align-items: center; gap: 2px;
  flex: 0 0 auto; margin-right: 2px;
}
/* a hand-drawn box: the native control ignores theme tokens and looks foreign */
.snc-check {
  appearance: none; -webkit-appearance: none;
  flex: 0 0 auto; display: grid; place-content: center;
  width: 16px; height: 16px; margin: 0; padding: 0;
  border: 1.5px solid var(--dsw-alias-label-tertiary, rgba(107,118,134,.55));
  border-radius: 4px; background: transparent;
  color: var(--dsw-alias-brand-primary, #2b6cf6);
  cursor: pointer; transition: border-color .12s ease, background .12s ease;
}
.snc-check:hover { border-color: var(--dsw-alias-label-secondary, rgba(107,118,134,.85)); }
.snc-check:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #2b6cf6); outline-offset: 1px; }
.snc-check:checked {
  border-color: var(--dsw-alias-brand-primary, #2b6cf6);
  background: var(--dsw-alias-brand-primary, #2b6cf6);
  color: var(--dsw-alias-label-on-brand, #fff);
}
.snc-check::after {
  content: ''; width: 9px; height: 5px;
  border-left: 1.8px solid currentColor; border-bottom: 1.8px solid currentColor;
  transform: rotate(-45deg) translateY(-1px) scale(0);
  transition: transform .12s ease;
}
.snc-check:checked::after { transform: rotate(-45deg) translateY(-1px) scale(1); }
/* editing needs the list back even when it was folded; folding resumes on exit */
.snc-shell[data-snc-editing="true"] > nav[class*="panelList"] { display: flex !important; }
/* a flex column wraps when told to: whatever the viewport leaves is one row
   down instead of clipped off the bottom of the sidebar */
.snc-shell[data-snc-editing="true"] > nav[class*="panelList"] { flex-wrap: wrap !important; }
/* an unchecked row must stay reachable, otherwise it can never be restored: it
   keeps its box and only its look fades (the global rule above hides it) */
.snc-shell[data-snc-editing="true"] > nav[class*="panelList"] > [data-snc-hidden="true"] {
  display: flex !important;
  opacity: .45;
}
/* the host's "more" row is a column (icon over label); while editing it turns
   into a row so the box can sit beside it instead of above it */
.snc-shell[data-snc-editing="true"] > nav[class*="panelList"] > [class*="moreAnchor"] {
  flex-direction: row; align-items: center; gap: 8px;
}
/* The anchor carries no margin or padding of its own -- that inset lives on the
   button inside it (2px margin + 8px padding) -- so the controls would sit 10px
   left of the boxes on every other row. Give them that inset here and take the
   same 10px back off the button, which keeps its label where it was. */
.snc-shell[data-snc-editing="true"] > nav[class*="panelList"] > [class*="moreAnchor"] > .snc-ctl {
  margin-left: 10px;
}
.snc-shell[data-snc-editing="true"] > nav[class*="panelList"] > [class*="moreAnchor"] > button[class*="panelRow"] {
  flex: 1 1 auto; min-width: 0;
  margin-left: 0; padding-left: 0;
}

/* ---- view tabs: the OTHER group, managed from the same gear ----
   A tab is a <button> with a block label inside, so the strip cannot simply be
   given a box before each tab -- the box goes into the tab and the tab turns
   into a row for as long as editing lasts. Its own 9px bottom padding (the
   gutter the active underline is drawn in) is left alone. */
div[data-conversation-tabs][data-snc-editing="true"] { flex-wrap: wrap; gap: 12px 28px; }
div[data-conversation-tabs][data-snc-editing="true"] > button[role="tab"] {
  display: inline-flex; align-items: center; gap: 6px;
}
/* The whole row is a drag source while editing, so a press must
   never leave a text selection smeared behind the reorder. */
.snc-shell[data-snc-editing="true"] > nav[class*="panelList"] > *,
div[data-conversation-tabs][data-snc-editing="true"] > button[role="tab"] {
  -webkit-user-select: none;
  user-select: none;
}
/* a hidden tab stays in the strip while editing so it can be brought back; the
   label must survive and must look exactly like a hidden sidebar row: the same
   fade, nothing else */
div[data-conversation-tabs][data-snc-editing="true"] > button[role="tab"][data-snc-hidden="true"] {
  opacity: .45;
}
div[data-conversation-tabs][data-snc-editing="false"] > button[role="tab"][data-snc-hidden="true"] {
  display: none !important;
}
/* The view row's "..." launcher is not a tab and does not live in the tablist:
   the host renders it as a SIBLING of [data-conversation-tabs], which is why a
   walk of the strip alone never saw it. It is matched through the sibling
   combinator instead of as a child, and it has no underline to reserve room for,
   so it only has to grow a box beside its icon. */
div[data-conversation-tabs][data-snc-editing="true"] ~ [class*="viewsMoreAnchor"] {
  display: flex; flex-direction: row; align-items: center; gap: 6px;
}
div[data-conversation-tabs][data-snc-editing="false"] ~ [class*="viewsMoreAnchor"][data-snc-hidden="true"],
div[data-conversation-tabs][data-snc-editing="false"] ~ button[class*="viewsMore"][data-snc-hidden="true"] {
  display: none !important;
}
div[data-conversation-tabs][data-snc-editing="true"] ~ [class*="viewsMoreAnchor"][data-snc-hidden="true"],
div[data-conversation-tabs][data-snc-editing="true"] ~ button[class*="viewsMore"][data-snc-hidden="true"] {
  opacity: .45;
}

/* ---- reorder: handles appear only while editing ----
   The grip is a child of the row it moves (see .snc-ctl). Reordering itself is
   always a real DOM move, so it keeps working if the host renames its classes
   again. */
.snc-drag {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 20px;
  color: var(--dsw-alias-label-tertiary, #81858c);
  cursor: grab;
  /* the browser must not treat a press on the handle as a text selection or a
     native image drag; both would steal the pointer stream mid-drag */
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
}
.snc-drag:active { cursor: grabbing; }

/* the row being carried: dimmed, because the insertion bar – not the row
   itself – is what tells you where it will land */
[data-snc-dragging="true"] {
  opacity: .4;
  cursor: grabbing;
}
/* insertion bar. Driven by the drop side computed on the hovered row, so the
   layout never changes during the drag: nothing reflows, nothing can chatter
   across a midpoint, and the only thing that moves is the cursor.
   ::before, never ::after: the host draws the active tab's underline with
   ::after, and two rules on one pseudo element would fight. */
[data-snc-drop] { position: relative; }
[data-snc-drop]::before {
  content: "";
  position: absolute;
  border-radius: 2px;
  background: var(--dsw-alias-brand-primary, #2b6cf6);
  pointer-events: none;
}
/* sidebar is a column → horizontal bar above or below the hovered row */
nav[class*="panelList"] > [data-snc-drop]::before {
  left: 6px;
  right: 6px;
  height: 2px;
}
nav[class*="panelList"] > [data-snc-drop="before"]::before { top: -2px; }
nav[class*="panelList"] > [data-snc-drop="after"]::before { bottom: -2px; }
/* tab strip is a row → vertical bar left or right of the hovered tab */
div[data-conversation-tabs] > button[role="tab"][data-snc-drop]::before {
  top: 2px;
  bottom: 2px;
  width: 2px;
}
div[data-conversation-tabs] > button[role="tab"][data-snc-drop="before"]::before { left: -8px; }
div[data-conversation-tabs] > button[role="tab"][data-snc-drop="after"]::before { right: -8px; }
/* every unit animates its own transform, which is what makes the swap after a
   drop read as motion rather than as a jump */
.snc-shell > nav[class*="panelList"] > *,
div[data-conversation-tabs] > button[role="tab"] {
  transition: transform .16s var(--ds-ease-in-out, cubic-bezier(.4,0,.2,1)),
              opacity .16s ease;
}
/* A drop is one instant. Two transitions must not run through it:
   - transform, because the FLIP keyframes are the motion and a CSS transition
     on the same property would drag them out;
   - opacity, because the carried row was dimmed while it moved and fading it
     back would read as the row hesitating before it settles.
   Both are suspended for exactly the frame(s) the change lands in. */
[data-snc-flipping="true"],
[data-snc-no-fade="true"] {
  transition: none !important;
}
nav[class*="panelList"][data-snc-sorting="true"] > *,
div[data-conversation-tabs][data-snc-sorting="true"] > button[role="tab"] {
  will-change: transform;
}

.snc-bud { position: relative; }
`;

    /* ---- the group header ----------------------------------------------------
       One row, two press targets, one shared visual language:
         - pressing anywhere on the row folds / unfolds the panel list;
         - the gear just before the chevron opens the display settings.

       The row is deliberately plain: a small upper-cased caption that names the
       group, and two icons at the trailing edge. Earlier revisions drew a vine
       here; it was pretty but it competed with the six extension entries it is
       supposed to organise, and a decorative line is the wrong thing to be the
       first element the eye lands on in a sidebar. */
    const GROUP_CAPTION = '扩展';
    const CHEVRON = '<svg viewBox="0 0 14 14" fill="none" focusable="false" aria-hidden="true">' +
      '<path d="M5.4 3.2 8.9 7l-3.5 3.8" stroke="currentColor" stroke-width="1.4" ' +
      'stroke-linecap="round" stroke-linejoin="round"/></svg>';
    /* the settings gear: fingered hub plus eight teeth, legible at 14px */
    const COG = '<svg viewBox="0 0 14 14" fill="none" focusable="false" aria-hidden="true">' +
      '<circle cx="7" cy="7" r="2.3" stroke="currentColor" stroke-width="1.3"/>' +
      '<path d="M7 1.1v1.9M7 11v1.9M1.1 7h1.9M11 7h1.9M2.85 2.85 4.2 4.2M9.8 9.8l1.35 1.35' +
      'M11.15 2.85 9.8 4.2M4.2 9.8 2.85 11.15" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
    /* while a session is open the gear becomes a check: pressing it applies */
    const COG_DONE = '<svg viewBox="0 0 14 14" fill="none" focusable="false" aria-hidden="true">' +
      '<path d="M3 7.4 5.9 10.3 11 4.8" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round"/></svg>';
    /* two columns of three dots: the conventional drag affordance, at the size
       of the checkbox it sits next to */
    const GRIP = '<svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">' +
      '<circle cx="3" cy="3.5" r="1.15"/><circle cx="7" cy="3.5" r="1.15"/>' +
      '<circle cx="3" cy="8" r="1.15"/><circle cx="7" cy="8" r="1.15"/>' +
      '<circle cx="3" cy="12.5" r="1.15"/><circle cx="7" cy="12.5" r="1.15"/></svg>';

    const isPanelList = (node) =>
      node && node.nodeType === 1 && node.tagName === 'NAV' &&
      typeof node.className === 'string' &&
      node.className.includes('panelList') &&
      /^(全局面板|Global panels)$/.test(node.getAttribute('aria-label') || '');

    function apply(ctx) {
      ctx.effect(() => {
        const style = document.createElement('style');
        style.dataset.pluginCss = NAME;
        style.textContent = css;
        document.head.append(style);

        /* ---- state: one versioned record under one key ----
           Three separate keys meant a migration would have to touch three
           places and could leave a half-migrated pair behind. One record with
           a schema version lets a future build reshape the whole thing in one
           write, and it is the only thing read on boot.
           v2 adds the two order lists. They are stored as an array of entry
           KEYS (the host's own labels), never as indices: a plugin installed
           later then simply lands at the end and no existing position shifts. */
        const emptyState = () => ({ v: STATE_VERSION, folded: false, hidden: [], views: [], order: [], orderViews: [] });
        const asStrings = (list) => (Array.isArray(list) ? list.filter((v) => typeof v === 'string') : []);

        /* v1 records are read as-is; the two new lists just arrive empty */
        const readRecord = (parsed) => {
          if (!parsed || typeof parsed !== 'object') return null;
          if (parsed.v !== 1 && parsed.v !== STATE_VERSION) return null;
          return {
            v: STATE_VERSION,
            folded: parsed.folded === true,
            hidden: asStrings(parsed.hidden),
            views: asStrings(parsed.views),
            order: asStrings(parsed.order),
            orderViews: asStrings(parsed.orderViews),
          };
        };

        const loadState = () => {
          const state = emptyState();
          let raw = null;
          try { raw = window.localStorage.getItem(STORE_STATE); } catch {}
          if (raw !== null) {
            try {
              const parsed = readRecord(JSON.parse(raw));
              if (parsed) return parsed;
            } catch {}
          }
          /* first run after the merge: fold the legacy per-key records in.
             They are left in place (harmless, never read again) so a user who
             rolls the plugin back keeps their layout. */
          try {
            const legacyFolded = window.localStorage.getItem(STORE_FOLDED) === 'true';
            const legacyHidden = window.localStorage.getItem(STORE_HIDDEN);
            const legacyViews = window.localStorage.getItem(STORE_VIEWS);
            state.folded = legacyFolded;
            if (legacyHidden !== null) state.hidden = asStrings(JSON.parse(legacyHidden));
            if (legacyViews !== null) state.views = asStrings(JSON.parse(legacyViews));
          } catch {}
          return state;
        };

        let state = loadState();
        const saveState = () => {
          try { window.localStorage.setItem(STORE_STATE, JSON.stringify(state)); } catch {}
        };

        let hidden = new Set(state.hidden);
        let hiddenViews = new Set(state.views);
        /* One order, applied live. There is no draft and no apply step: a drag
           writes the order the moment it lands, and a checkbox writes the
           hidden set the moment it flips. The gear is a plain toggle into and
           out of edit mode, not a transaction -- a half-applied session where a
           drag was pending while a checkbox had already been saved was the one
           thing that made the two feel unrelated. */
        let savedOrder = state.order.slice();
        let savedOrderViews = state.orderViews.slice();
        let folded = state.folded;
        let editing = false;
        const shells = new Set();

        /* every write funnels through here so the sets and the record never
           drift apart, whatever path changed them */
        const commit = () => {
          state.hidden = [...hidden];
          state.views = [...hiddenViews];
          state.folded = folded;
          state.order = savedOrder.slice();
          state.orderViews = savedOrderViews.slice();
          saveState();
        };
        const writeSet = commit;
        const writeFolded = commit;
        /* write the record back once: on a first run this is what materialises
           the migrated layout, so a rollback lands on a real record, not on a
           re-merge of stale legacy keys */
        saveState();

        /* The row's aria-label is the host's own name for the entry and it does
           not contain the glyph slot text; textContent does, and that glyph is
           rendered by whichever plugin owns the entry (dsh-version-checker
           prefixes a star), so a text fallback skips the glyph entirely. */
        const ownText = (el) => {
          const clone = el.cloneNode(true);
          for (const slot of clone.querySelectorAll('[class*="panelGlyph"], [class*="Glyph"]')) slot.remove();
          return (clone.textContent || '').trim();
        };
        const keyOf = (row) => ((row.getAttribute('aria-label') || '').trim() || ownText(row));
        /* a tab carries no id (the host passes only a React key), and its label
           is the only stable thing it renders, so that is its identity */
        const keyOfTab = (tab) => ((tab.textContent || '').trim() || tab.getAttribute('aria-label') || '').trim();
        /* Rows are not always bare <button> children of the nav. DSH wraps its
           own "more" entry in an anchor element (the popup it opens is placed
           from that box). So the unit is "the direct child of the nav that owns
           a panelRow", found by climbing from the button: hiding and reordering
           both act on that unit, which keeps them independent of how deep the
           host nests the button -- and nothing the host owns is ever moved. */
        const rowsOf = (nav) => {
          const units = [];
          for (const row of nav.querySelectorAll('button[class*="panelRow"]')) {
            let unit = row;
            while (unit.parentElement && unit.parentElement !== nav) unit = unit.parentElement;
            if (unit.parentElement !== nav) continue;
            if (!units.includes(unit)) units.push(unit);
          }
          return units;
        };

        /* ---- the controls, in place -----------------------------------------
           A grip and a box per unit, appended to the unit itself and removed on
           the way out. Nothing is wrapped: React owns these rows, and a row it
           had to remove while it sat inside a wrapper of ours threw, taking the
           whole header down with it. */
        const ctlOf = (unit) => unit?.querySelector?.(':scope > .snc-ctl') || null;
        const decorate = (unit, { drag = false, kind = null } = {}) => {
          if (!unit) return;
          let ctl = ctlOf(unit);
          if (!ctl) {
            ctl = document.createElement('span');
            ctl.className = 'snc-ctl';
            /* first child: the row is a flex box, so the controls land ahead of
               the glyph without a layout of their own */
            unit.prepend(ctl);
          }
          if (drag && !ctl.querySelector('[data-snc-drag]')) {
            const handle = document.createElement('span');
            handle.className = 'snc-drag';
            handle.dataset.sncDrag = '';
            handle.setAttribute('aria-hidden', 'true');
            handle.innerHTML = GRIP;
            ctl.append(handle);
          }
          if (kind && !ctl.querySelector('input')) {
            const box = document.createElement('input');
            box.type = 'checkbox';
            box.className = 'snc-check';
            box.dataset[kind] = '';
            ctl.append(box);
          }
        };
        const undecorate = (unit) => { ctlOf(unit)?.remove(); };
        const undecorateAll = (nav) => {
          for (const ctl of [...nav.querySelectorAll('.snc-ctl')]) ctl.remove();
        };
        const decorateAll = (nav) => {
          for (const unit of rowsOf(nav)) decorate(unit, { drag: true, kind: 'sncCheck' });
        };

        /* ---- ordering: stored layout replayed onto the live DOM ----
           A saved order is an array of entry keys. Applying it is a sequence of
           real DOM moves (insertBefore), which is exactly what a drag does by
           hand: no host API, so a DSH refactor cannot invalidate it – only a
           rename of the aria-label/textContent the keys are built from can.
           Every replay is a no-op when the DOM is already in order, which is
           what keeps it from re-triggering the MutationObserver: a mutation the
           observer reacts to must never produce another mutation of the same
           kind, or the two ping-pong forever. */
        const applyOrder = (container, items, list) => {
          if (!container || !items || items.length === 0) return false;
          const rank = new Map();
          list.forEach((key, i) => rank.set(key, i));
          /* stable: unknown keys (a plugin installed after the layout was saved)
             keep their natural relative position and land at the end */
          const sorted = items
            .map((el, i) => ({ el, i, r: rank.has(keyOfEl(el)) ? rank.get(keyOfEl(el)) : Number.MAX_SAFE_INTEGER }))
            .sort((a, b) => (a.r - b.r) || (a.i - b.i));
          /* compare against the CURRENT children before touching anything: a
             move of an untouched list would be a pure mutation storm */
          const wanted = sorted.map((s) => s.el);
          const have = [...container.children].filter((c) => wanted.includes(c));
          if (wanted.length === have.length && wanted.every((el, i) => el === have[i])) return false;
          for (const el of wanted) container.append(el);
          return true;
        };
        const keyOfEl = (el) => {
          if (el.tagName === 'BUTTON') return el.getAttribute('role') === 'tab' ? keyOfTab(el) : keyOf(el);
          const inner = el.querySelector('button[class*="panelRow"], button[role="tab"]');
          if (!inner) return '';
          return inner.getAttribute('role') === 'tab' ? keyOfTab(inner) : keyOf(inner);
        };
        /* the units are the host's own children, in edit mode and out of it */
        const unitsOf = (container, kind) =>
          kind === 'tabs' ? tabsOf(container) : rowsOf(container);
        const replayOrder = (container, kind, list) => {
          if (!container || list.length === 0) return false;
          return applyOrder(container, unitsOf(container, kind), list);
        };

        /* ---- view tabs: matched by label, the host exposes no id on them ---- */
        const tabsOf = (strip) => [...strip.querySelectorAll(':scope > button[role="tab"]')];

        /* Chat is the host's fallback view (resolveActiveView falls back to it)
           and the only place the input lives, so hiding it can strand the user
           on a blank center. It is therefore not a toggle: no checkbox. */
        const isPinnedTab = (tab) => {
          const id = (tab.getAttribute('data-snc-view-id') || '').toLowerCase();
          if (id) return id === 'chat';
          return /^(对话|聊天|Chat)$/i.test(keyOfTab(tab));
        };

        /* the pinned view gets a grip like any other tab -- it can be moved, it
           just never carries a box */
        const decorateTabs = (strip) => {
          for (const tab of tabsOf(strip)) {
            decorate(tab, { drag: true, kind: isPinnedTab(tab) ? null : 'sncTabCheck' });
          }
        };
        const undecorateTabs = (strip) => {
          for (const tab of tabsOf(strip)) undecorate(tab);
        };

        /* The view row's "..." launcher is NOT a tab and is NOT in the tablist:
           the host renders it as a sibling of [data-conversation-tabs], placed
           from that box, so a walk of the strip alone never saw it. It also has
           no stable label -- the host swaps "更多会话视图" for
           "更多会话视图 · <view>" whenever the active view lives in the menu --
           so its key cannot be read from the DOM. */
        const VIEWS_MORE_KEY = '更多会话视图';
        const VIEWS_MORE_UNIT = '[class*="viewsMoreAnchor"], button[class*="viewsMore"]';
        /* the launcher is a sibling of the strip, not one of its children, so it
           is found from the row that holds both. Nothing is wrapped around it:
           the host owns that node and React may remove it at any moment. */
        const viewsMoreOf = (strip) => {
          const row = strip.parentElement;
          if (!row) return null;
          for (const child of row.children) {
            if (child.matches(VIEWS_MORE_UNIT)) return child;
          }
          return null;
        };
        /* no drag handle on purpose: the strip owns the tab order and this
           launcher is not part of it -- it only has to be hideable */
        const decorateViewsMore = (strip) => {
          const unit = viewsMoreOf(strip);
          if (!unit) return;
          decorate(unit, { kind: 'sncMoreCheck' });
          const box = ctlOf(unit)?.querySelector('input');
          if (box) box.setAttribute('aria-label', '显示' + VIEWS_MORE_KEY);
        };
        const undecorateViewsMore = (strip) => { undecorate(viewsMoreOf(strip)); };

        const paintTabs = () => {
          for (const strip of document.querySelectorAll('div[data-conversation-tabs]')) {
            /* the flag drives the strip's editing CSS, so it has to read
               "false" rather than be absent; the sidebar shell keeps the same
               pair on purpose and both are only dropped on teardown */
            strip.dataset.sncEditing = String(editing);
            if (editing) decorateTabs(strip); else undecorateTabs(strip);
            /* the launcher is painted from the same store as the tabs, so one
               gear hides both halves of the row */
            if (editing) decorateViewsMore(strip); else undecorateViewsMore(strip);
            const more = viewsMoreOf(strip);
            if (more) {
              const isMoreHidden = hiddenViews.has(VIEWS_MORE_KEY);
              if (isMoreHidden) more.dataset.sncHidden = 'true';
              else more.removeAttribute('data-snc-hidden');
              const moreBox = ctlOf(more)?.querySelector('input');
              if (moreBox) {
                moreBox.checked = !isMoreHidden;
                moreBox.title = isMoreHidden ? '已隐藏，勾选后显示' : '显示中，取消勾选则隐藏';
              }
            }
            for (const tab of tabsOf(strip)) {
              const key = keyOfTab(tab);
              /* the controls live inside the tab, so a re-render that drops them
                 leaves a bare tab: put them back here, not only from the
                 observer. */
              if (editing) decorate(tab, { drag: true, kind: isPinnedTab(tab) ? null : 'sncTabCheck' });
              const box = ctlOf(tab)?.querySelector('input');
              /* a pinned view must never carry the hidden attribute, even if an
                 older build stored it: reconcile the store once and move on */
              if (isPinnedTab(tab)) {
                if (box) box.remove();
                tab.removeAttribute('data-snc-hidden');
                if (hiddenViews.delete(key)) writeSet();
                continue;
              }
              const isHidden = hiddenViews.has(key);
              if (isHidden) tab.dataset.sncHidden = 'true';
              else tab.removeAttribute('data-snc-hidden');
              /* never let the active view be hidden: the host falls back to
                 chat silently and the click would look like nothing happened */
              if (isHidden && tab.getAttribute('aria-selected') === 'true') {
                tab.removeAttribute('data-snc-hidden');
                hiddenViews.delete(key);
                writeSet();
              }
              if (box) {
                box.checked = !hiddenViews.has(key);
                box.setAttribute('aria-label', key + ' 显示');
                box.title = hiddenViews.has(key) ? '已隐藏，勾选后显示' : '显示中，取消勾选则隐藏';
                /* a refusal only makes sense while the tab is the active one,
                   so it expires the moment that stops being true -- otherwise
                   the control stays announced as invalid for the rest of the
                   session even though it is perfectly usable again */
                if (tab.getAttribute('aria-selected') !== 'true' || hiddenViews.has(key)) {
                  box.removeAttribute('aria-invalid');
                }
              }
            }
            /* replay after wrapping, so the movable units exist. The pinned view
               is part of the stored list like any other key; it simply has no
               checkbox. */
            replayOrder(strip, 'tabs', savedOrderViews);
          }
        };

        const paintShell = (shell) => {
          const { nav, group, gear } = shell;
          shell.el.dataset.sncFolded = String(folded);
          shell.el.dataset.sncEditing = String(editing);
          group.setAttribute('aria-expanded', String(!folded));
          group.dataset.sncFolded = String(folded);
          /* the caption names the group, the aria-label says what pressing the
             row does; the caption is the only visible text so it stays inert.
             While editing the row stops folding, so it must not advertise a
             fold action either -- a button that does nothing is worse than one
             that is visibly unavailable. */
          const foldLabel = editing
            ? GROUP_NAME + '（编辑中，先退出编辑才能折叠）'
            : (folded ? '展开' : '收起') + GROUP_NAME;
          group.setAttribute('aria-label', foldLabel);
          group.title = editing ? foldLabel : foldLabel + '（点击切换）';
          group.setAttribute('aria-disabled', String(editing));
          gear.setAttribute('aria-pressed', String(editing));
          const gearLabel = editing ? '退出编辑' : '编辑扩展显示与顺序';
          gear.setAttribute('aria-label', gearLabel);
          gear.title = gearLabel;
          /* the glyph says which way the toggle goes: a gear means "enter",
             a check means "this is active, press to leave". There is no
             "pending" state to advertise any more, so no dot. */
          gear.innerHTML = editing ? COG_DONE : COG;

          if (editing) decorateAll(nav); else undecorateAll(nav);
          /* the order is replayed before the hidden state is painted: the two
             are independent, and the units are the host's own children either
             way, so a replay is safe whether or not we are editing */
          replayOrder(nav, 'panels', savedOrder);
          for (const row of rowsOf(nav)) {
            /* the unit can be the host's own wrapper, so the key is read off the
               button inside it; keyOfEl handles both shapes */
            const key = keyOfEl(row);
            const isHidden = hidden.has(key);
            if (isHidden) row.dataset.sncHidden = 'true';
            else row.removeAttribute('data-snc-hidden');
            const box = ctlOf(row)?.querySelector('input');
            if (box) {
              box.checked = !isHidden;
              box.setAttribute('aria-label', key + ' 显示');
              box.title = isHidden ? '已隐藏，勾选后显示' : '显示中，取消勾选则隐藏';
            }
          }
        };

        /* The strip is a single document-level element with no shell of its
           own, so it is painted once per pass rather than once per sidebar.
           paintShell used to call paintTabs itself, which made a repaint cost
           one full strip walk per mounted sidebar for no benefit. */
        const paint = () => {
          for (const shell of shells) paintShell(shell);
          paintTabs();
        };

        /* ---- edit mode is a plain toggle ----
           Pressing the gear enters edit mode; pressing it again leaves. Every
           change made in between is already saved, so there is nothing to
           apply and nothing to throw away. Escape therefore only has to leave
           the mode, not restore anything. */
        let foldedBeforeEdit = false;
        const enterEdit = () => {
          editing = true;
          paint();
        };

        const leaveEdit = () => {
          editing = false;
          if (foldedBeforeEdit) {
            foldedBeforeEdit = false;
            folded = true;
            writeFolded();
          }
          paint();
        };

        /* Escape leaves edit mode. It used to mean "discard the draft"; with
           live writes there is no draft left to discard. The
           listener is named and removed in the teardown, so plugin hot-reloads
           cannot stack one stale handler per reload. */
        const onEscapeKey = (event) => {
          if (event.key !== 'Escape' || !editing) return;
          event.preventDefault();
          leaveEdit();
        };
        window.addEventListener('keydown', onEscapeKey, true);

        /* ---- drag: pointer events, insertion preview, one commit at drop ----
           The order is NOT changed while the pointer is down. Reordering on
           every pointermove moves the very boxes being compared, so the row
           oscillates across the boundary it just crossed (measured: B,A,C →
           B,C,A → B,A,C on a still pointer). Instead the drag only paints an
           insertion bar on the row under the cursor, and the single reorder
           happens when the pointer is released. Pointer events, not HTML5 DnD:
           DnD would need draggable=true on the host's own button, which we do
           not own and must not mutate, and it is unusable on touch. */
        const drag = { active: null };
        /* Set when a real drag lands, consumed by the click that
           follows pointerup, cleared by the next pointerdown. */
        let suppressClick = false;

        const isTabStrip = (node) =>
          node && node.nodeType === 1 && node.hasAttribute('data-conversation-tabs');

        /* Only the containers we decorate may answer a press. isPanelList() is
           the single place that decides which list is ours, so the event paths
           have to agree with it: the host also renders a plain panelList for the
           local session list, and decorating it would let a press there write
           into OUR saved order (replacing the keys of the real list). */
        const managedNavOf = (node) => {
          const nav = node?.closest?.('nav[class*="panelList"]');
          if (!nav) return null;
          return [...shells].some((shell) => shell.nav === nav) ? nav : null;
        };
        /* the strip only becomes ours while the tab controls are in it */
        const managedStripOf = (node) => {
          const strip = node?.closest?.('div[data-conversation-tabs]');
          return strip?.dataset?.sncEditing === 'true' ? strip : null;
        };
        /* climb from whatever was pressed to the container's own child: a row
           may be a bare button, an anchor holding one, or a tab with our
           controls inside it */
        const unitIn = (node, container) => {
          let unit = node;
          while (unit && unit.parentElement !== container) unit = unit.parentElement;
          return unit || null;
        };
        /* Resolve the movable unit that owns a press: the whole row
           is a drag source while editing, not just the grip, so this starts from
           the pressed node and walks up to the host's own child of the list. */
        const dragUnitOf = (node) => {
          if (!node?.closest) return null;
          const strip = managedStripOf(node);
          if (strip) {
            const tab = node.closest('button[role="tab"]');
            const unit = tab && unitIn(tab, strip);
            if (!unit) return null;
            return { unit, container: strip, units: tabsOf(strip) };
          }
          const nav = managedNavOf(node);
          if (!nav) return null;
          const row = node.closest('button[class*="panelRow"], [class*="moreAnchor"]');
          const unit = row && unitIn(row, nav);
          if (!unit) return null;
          return { unit, container: nav, units: rowsOf(nav) };
        };

        const clearDropMarks = (container) => {
          if (!container) return;
          for (const el of container.querySelectorAll('[data-snc-drop]')) delete el.dataset.sncDrop;
        };

        /* Which side of the hovered row would the carried row land on?
           The leading half means "before", the trailing half "after" – on the
           column axis (sidebar) that is top/bottom, on the row axis (tabs) it
           is left/right. Reading only the hovered row keeps this stable. */
        const dropSide = (row, axis, x, y) => {
          const r = row.getBoundingClientRect();
          return axis === 'x'
            ? x < r.left + r.width / 2 ? 'before' : 'after'
            : y < r.top + r.height / 2 ? 'before' : 'after';
        };

        const beginDrag = (found, captureEl, event) => {
          if (!found) return;
          /* one gesture at a time: a second pointer arriving mid-drag (a
             second finger, a pen plus a mouse) must not overwrite the state the
             first one still owns -- the first pointerup would then never clean
             it, leaving the carried row dimmed and the container in sorting
             state for good */
          if (drag.active) return;
          const { unit, container, units } = found;
          /* measured, not assumed: the tab strip is a row, the sidebar list is a
             column, and a future layout change cannot mislead this */
          const axis = isTabStrip(container) ? 'x' : 'y';
          drag.active = {
            unit, container, units, axis, handle: captureEl,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            moving: false,
            /* did the pointer ever hover a DIFFERENT entry? a drag that never
               left its own row is a wobbling click, not a reorder */
            crossed: false,
            dropRow: null,
            dropSide: null,
          };
        };

        /* The order is read back from the container after the drop, which is
           also what makes a whole-row drag able to save: t.handle is the unit
           itself there, so the old grip-based lookup (closest('.snc-ctl')) would
           find nothing and the drop would silently never be written. */
        const rememberOrder = (t) => {
          const units = unitsOf(t.container, isTabStrip(t.container) ? 'tabs' : 'panels');
          const keys = (units || []).map(keyOfEl).filter(Boolean);
          if (keys.length === 0) return;
          if (isTabStrip(t.container)) savedOrderViews = keys;
          else savedOrder = keys;
          /* a drag is saved the instant it lands, exactly like a checkbox */
          commit();
        };

        const moveDrag = (event) => {
          const t = drag.active;
          if (!t || event.pointerId !== t.pointerId) return;
          const x = event.clientX;
          const y = event.clientY;
          if (!t.moving) {
            /* A whole-row press is a toggle first, so its slop is wider than the
               grip's: a hand wobble on the row must still read as a click, and
               anything below the threshold never starts a drag at all (a drag
               that starts and lands nowhere would swallow the toggle too). */
            const slop = t.handle === t.unit ? 8 : 4;
            if (Math.abs(x - t.startX) < slop && Math.abs(y - t.startY) < slop) return;
            t.moving = true;
            t.unit.dataset.sncDragging = 'true';
            t.container.dataset.sncSorting = 'true';
            document.body.style.setProperty('cursor', 'grabbing', 'important');
            try { t.handle.setPointerCapture(t.pointerId); } catch {}
          }
          event.preventDefault();

          /* hit-test against the boxes as they currently sit: nothing has been
             reordered, so the answer cannot change on its own */
          const hit = document.elementFromPoint?.(x, y);
          /* climb to the container's own child: a row may be a bare button, an
             anchor holding one, or a tab with our controls inside it */
          let row = hit?.closest?.('button[role="tab"], button[class*="panelRow"], [class*="moreAnchor"], button[class*="viewsMore"]');
          while (row && row.parentElement !== t.container) row = row.parentElement;
          if (!row || row.parentElement !== t.container) row = null;
          const inside = !!row && row !== t.unit;
          if (inside) t.crossed = true;
          if (!inside) {
            clearDropMarks(t.container);
            t.dropRow = null;
            t.dropSide = null;
            return;
          }
          const side = dropSide(row, t.axis, x, y);
          if (t.dropRow !== row || t.dropSide !== side) {
            clearDropMarks(t.container);
            row.dataset.sncDrop = side;
            t.dropRow = row;
            t.dropSide = side;
          }
        };

        /* FLIP: measure, reorder, then play every unit from its old position to
           its new one. Cheaper and far less error-prone than animating a
           transform that has to be reconciled with the real layout.

           The units carry `transition: transform` for the hover affordances, and
           a running CSS transition wins over a WAAPI animation on the same
           property: without muting it first the row would visibly lag behind the
           FLIP keyframes. `[data-snc-flipping]` suspends that transition for the
           duration, and the attribute is dropped once the animation settles. */
        const animateUnits = (container, before) => {
          /* optional-chained call, so the result may be undefined: read
             `matches` defensively or a host without matchMedia takes the whole
             drop path down with it (the reorder has already happened by then,
             so the list would sit in its new order until something else forced
             a repaint) */
          const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
          const moved = [];
          for (const [unit, rect] of before) {
            if (!unit.isConnected) continue;
            const now = unit.getBoundingClientRect();
            const dx = rect.left - now.left;
            const dy = rect.top - now.top;
            if (!dx && !dy) continue;
            if (reduce || typeof unit.animate !== 'function') continue;
            moved.push([unit, dx, dy]);
          }
          if (moved.length === 0) return;
          for (const [unit] of moved) unit.dataset.sncFlipping = 'true';
          /* one read of the new geometry after the flag lands, so the suspended
             transition cannot be applied to the keyframes' first frame */
          for (const [unit, dx, dy] of moved) {
            const anim = unit.animate(
              [{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'translate(0,0)' }],
              { duration: 160, easing: 'cubic-bezier(.2,0,0,1)' }
            );
            const done = () => delete unit.dataset.sncFlipping;
            anim.addEventListener('finish', done, { once: true });
            anim.addEventListener('cancel', done, { once: true });
            /* a backgrounded tab never finishes an animation; never leave the
               transition suspended on an element that stays on screen */
            window.setTimeout(done, 260);
          }
        };

        const endDrag = (event) => {
          const t = drag.active;
          if (!t || (event && event.pointerId !== t.pointerId)) return;
          drag.active = null;
          clearDropMarks(t.container);
          t.container.removeAttribute('data-snc-sorting');
          document.body.style.removeProperty('cursor');
          try { t.handle.releasePointerCapture(t.pointerId); } catch {}
          if (!t.moving) return;

          /* the carried row was dimmed to .4 while it moved; lifting that is a
             160ms opacity transition that would run alongside the reorder and
             read as the row hesitating. The drop is a single instant, so the
             row snaps back to full opacity instead of fading back. */
          t.unit.dataset.sncNoFade = 'true';
          delete t.unit.dataset.sncDragging;
          window.setTimeout(() => delete t.unit.dataset.sncNoFade, 0);

          /* a cancelled pointer (an OS gesture, the window losing focus, a
             native drag taking over) is not a drop: commit nothing, and do not
             arm the click suppressor either -- no click follows a cancel, so the
             flag would sit there and swallow the next keyboard activation. */
          if (event?.type === 'pointercancel') return;

          /* The whole row starts the drag, so the click the
             browser emits after a real drag must not toggle the row it moved.
             A drag that never hovered another entry is a click that wobbled --
             let its click through, or the row would neither move nor toggle. */
          if (t.dropRow || t.crossed) suppressClick = true;

          /* commit: place the carried row before/after the row it was dropped
             on, then let the units fly from their previous boxes. The host can
             remove the carried row while the pointer is down (a re-render, an
             unpin): re-inserting it would resurrect a row the host no longer
             has, and persist it in the saved order. */
          const target = t.dropRow;
          const side = t.dropSide;
          const canMove = t.unit.isConnected && t.unit.parentElement === t.container &&
            !!target && target.isConnected && target !== t.unit && target.parentElement === t.container;
          if (canMove) {
            const before = t.units
              .filter((u) => u.isConnected)
              .map((u) => [u, u.getBoundingClientRect()]);
            if (side === 'after') t.container.insertBefore(t.unit, target.nextSibling);
            else t.container.insertBefore(t.unit, target);
            animateUnits(t.container, before);
            /* only a real reorder is written: reading the live order after a
               no-op would persist whatever the host rendered under the drag */
            rememberOrder(t);
          }
          paint();
        };

        const onPointerDown = (event) => {
          suppressClick = false;
          if (event.button !== 0 && event.pointerType === 'mouse') return;
          const target = event.target;
          const handle = target?.closest?.('[data-snc-drag]');
          /* the grip is an explicit drag affordance: take the press before the
             host sees it */
          if (handle) {
            event.preventDefault();
            event.stopPropagation();
            beginDrag(dragUnitOf(handle), handle, event);
            return;
          }
          if (!editing) return;
          /* touch keeps its scroll gesture; the grip stays the touch handle */
          if (event.pointerType === 'touch') return;
          /* a real box press keeps its native toggle: never turn it into a drag */
          if (target?.closest?.('input, textarea, select')) return;
          /* The whole row/tab is a drag source while editing. Do
             not preventDefault here -- a press without movement must still
             reach the click handler and toggle the entry. */
          const found = dragUnitOf(target);
          if (!found) return;
          beginDrag(found, found.unit, event);
        };
        /* ---- edit mode owns the whole entry row ------------------------------
           The 16px box alone was too small a target inside a host <button> that
           selects a panel or a view: a press a few pixels off fell through to
           the host, switched the centre area (slow) and left the box untouched.
           While editing, a press anywhere on a tab, a panel row or the view
           launcher toggles that entry instead of navigating. The checkbox keeps
           the native change path; the drag handle keeps the drag path. */
        const togglePanelRow = (unit) => {
          const key = keyOfEl(unit);
          if (!key) return;
          if (hidden.has(key)) hidden.delete(key); else hidden.add(key);
          writeSet();
          paint();
        };
        const toggleViewTab = (tab) => {
          const key = keyOfTab(tab);
          if (!key || isPinnedTab(tab)) return;
          if (hiddenViews.has(key)) {
            hiddenViews.delete(key);
          } else {
            /* never hide the view being looked at: the host falls back to chat
               silently and the click would look like nothing happened */
            if (tab.getAttribute('aria-selected') === 'true') return;
            hiddenViews.add(key);
          }
          writeSet();
          paint();
        };
        const toggleViewsMore = () => {
          if (hiddenViews.has(VIEWS_MORE_KEY)) hiddenViews.delete(VIEWS_MORE_KEY);
          else hiddenViews.add(VIEWS_MORE_KEY);
          writeSet();
          paint();
        };
        /* the controls are children of a host <button> whose click selects the
           panel or the view, so the click is stopped before it can bubble.
           stopPropagation, not preventDefault: the checkbox still toggles (its
           activation behaviour runs after dispatch), it just never reaches the
           host's handler. */
        const onControlClick = (event) => {
          const target = event.target;
          if (!target?.closest) return;
          const inCtl = target.closest('.snc-ctl');
          /* a real box press: the native toggle and the change handler decide,
             but the click must never reach the host <button> */
          if (target.closest('input')) {
            suppressClick = false;
            if (inCtl) event.stopPropagation();
            return;
          }
          /* a press on the grip belongs to the drag path, not to a toggle */
          if (target.closest('[data-snc-drag]')) {
            /* The click the browser emits after a grip drag lands on the grip.
               Consume the flag HERE: leaving it armed would swallow the next
               click that never went through pointerdown (keyboard activation, a
               screen reader, el.click()) on whichever entry it hit. */
            suppressClick = false;
            event.stopPropagation();
            return;
          }
          if (!editing) {
            if (inCtl) { event.preventDefault(); event.stopPropagation(); }
            return;
          }
          /* Resolve the entry first and only swallow the event once it turns out
             to be one we decorate: the host's unrelated nav keeps its clicks,
             exactly like it keeps its own saved order. */
          let tab = null;
          const tabRaw = target.closest('button[role="tab"]');
          if (tabRaw) {
            const strip = managedStripOf(tabRaw);
            if (strip && tabRaw.parentElement === strip) tab = tabRaw;
          }
          const moreAnchor = tab ? null : target.closest('[class*="viewsMoreAnchor"], button[class*="viewsMore"]');
          let viewsMore = null;
          if (moreAnchor) {
            /* the launcher is an anchor (or a bare button) that is a SIBLING of
               the tablist, so look one level up for the strip */
            const owner = moreAnchor.parentElement;
            const strip = owner?.querySelector?.('[data-conversation-tabs]') ||
              owner?.parentElement?.querySelector?.('[data-conversation-tabs]');
            if (strip?.dataset?.sncEditing === 'true') viewsMore = moreAnchor;
          }
          /* Sidebar entries: a bare row, or the anchor the host wraps its own
             "more" entry in. The anchor's control slot is a child of the anchor,
             NOT of the inner button, and the gap between them belongs to the
             anchor too -- so resolve the unit from whatever the press landed in,
             exactly like dragUnitOf does, or that row would drag but not toggle. */
          let unit = null;
          if (!tab && !viewsMore) {
            const nav = managedNavOf(target);
            if (nav) {
              const el = target.closest('button[class*="panelRow"], [class*="moreAnchor"]');
              if (el) unit = unitIn(el, nav);
            }
          }
          if (!tab && !viewsMore && !unit) {
            if (inCtl) { event.preventDefault(); event.stopPropagation(); }
            return;
          }
          /* the click emitted after a whole-row drag must not toggle the entry
             it just moved; the grip path consumed its own copy above */
          if (suppressClick) {
            suppressClick = false;
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          if (tab) { toggleViewTab(tab); return; }
          if (viewsMore) { toggleViewsMore(); return; }
          togglePanelRow(unit);
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('pointermove', moveDrag, true);
        document.addEventListener('pointerup', endDrag, true);
        document.addEventListener('pointercancel', endDrag, true);
        document.addEventListener('click', onControlClick, true);

        const build = (nav) => {
          if (nav.parentElement?.classList?.contains('snc-shell')) return null;
          const el = document.createElement('div');
          el.className = 'snc-shell';

          const group = document.createElement('div');
          group.className = 'snc-group';
          group.setAttribute('role', 'button');
          group.setAttribute('aria-label', GROUP_NAME);
          group.tabIndex = 0;
          /* Plan A1, the canonical group header: a small uppercase label takes
             the free width, and the two 20px press targets sit together at the
             trailing edge -- settings first, then the fold chevron. It is the
             shape VS Code, Linear and Notion all use, so it needs no learning.

             The upper-cased label is the whole point: it names the group
             without shouting, and it stops the row from reading like a seventh
             extension entry the way a full-size title did. */
          group.innerHTML =
            '<span class="snc-caption">' + GROUP_CAPTION + '</span>' +
            '<button type="button" class="snc-bud" aria-hidden="true">' + COG + '</button>' +
            '<button type="button" class="snc-chev" tabindex="-1" aria-hidden="true">' + CHEVRON + '</button>';
          group.title = GROUP_NAME + '：点击折叠或展开';

          /* the chevron is decoration: the row already exposes itself as one
             button with aria-expanded, so the icon needs no state of its own */
          const bud = group.querySelector('.snc-bud');
          bud.tabIndex = -1;

          const shell = { el, nav, group, gear: bud };

          /* two column flex stacks share the sidebar root, so a plain 2px inset
             would not line the box up with the native panel rows; measure the
             real indent instead and hand it to the entry through a variable.
             Falls back to the 2px token when nothing else is laid out yet. */
          const measureInset = () => {
            let inset = 2;
            try {
              const neighbours = [...nav.parentElement.children].filter((n) => n !== el && n.getBoundingClientRect().width > 0);
              if (neighbours.length > 0) inset = Math.round(neighbours[0].getBoundingClientRect().left - nav.getBoundingClientRect().left);
            } catch {}
            el.style.setProperty('--snc-inset', inset + 'px');
          };

          /* the row is the fold target; the bud stops the bubble before it can
             reach this, so pressing settings never also folds the list */
          group.addEventListener('click', (event) => {
            if (event.target.closest?.('.snc-bud')) return;
            /* folding while editing would hide the very list the checkboxes
               live in, leaving a check mark on screen with nothing to click --
               so the fold gesture is inert until editing is left */
            if (editing) return;
            folded = !folded;
            writeFolded();
            paint();
          });
          group.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            group.click();
          });
          bud.addEventListener('click', (event) => {
            event.stopPropagation();
            if (editing) {
              leaveEdit();
              return;
            }
            /* editing a folded list hides the result; leave the list open so the
               change is visible, and put it back on the way out -- pressing a
               settings icon should not silently cost you a fold you set */
            if (folded) {
              folded = false;
              foldedBeforeEdit = true;
            }
            measureInset();
            enterEdit();
          });

          nav.parentNode.insertBefore(el, nav);
          el.append(group, nav);
          return shell;
        };

        const clear = (shell) => {
          undecorateAll(shell.nav);
          /* React may already have dropped the whole wrapper subtree */
          if (shell.el.parentNode && shell.nav.parentElement === shell.el) {
            shell.el.parentNode.insertBefore(shell.nav, shell.el);
          }
          shell.el.remove();
          shells.delete(shell);
        };

        /* the group row owns the gear: it is the last flex child of the row */
        const layoutGroup = (shell) => {
          if (shell.gear.parentElement !== shell.group) shell.group.append(shell.gear);
        };

        const sync = () => {
          /* the strip mounts later than the sidebar and has no shell of its own,
             so every sync pass repaints it instead of relying on build() */
          paintTabs();
          for (const shell of [...shells]) {
            if (!shell.el.isConnected || !shell.nav.isConnected) clear(shell);
          }
          for (const nav of document.querySelectorAll('nav[class*="panelList"]')) {
            if (!isPanelList(nav)) continue;
            const host = nav.parentElement;
            const existing = host?.classList?.contains('snc-shell')
              ? [...shells].find((s) => s.el === host)
              : undefined;
            if (existing) {
              layoutGroup(existing);
              continue;
            }
            const shell = build(nav);
            if (!shell) continue;
            shells.add(shell);
            layoutGroup(shell);
            /* sync already painted the strip at its head; painting it again
               here would be the second full walk inside one pass */
            paintShell(shell);
          }
          /* React reconciles the host children back into ITS order on any
             re-render; replay the saved layout afterwards, but never while a
             drag is in flight (that would fight the pointer). */
          if (!drag.active) {
            for (const shell of shells) replayOrder(shell.nav, 'panels', savedOrder);
            for (const strip of document.querySelectorAll('div[data-conversation-tabs]')) {
              replayOrder(strip, 'tabs', savedOrderViews);
            }
          }
        };

        /* one delegated handler survives rewrapping and React remounts */
        const onChange = (event) => {
          const panelBox = event.target?.closest?.('[data-snc-check]');
          if (panelBox) {
            /* the controls live inside the unit, so the ctl's parent is the row
               (a bare button, or the host's anchor around one) */
            const row = panelBox.closest('.snc-ctl')?.parentElement;
            if (!row) return;
            const key = keyOfEl(row);
            if (!key) return;
            if (panelBox.checked) hidden.delete(key); else hidden.add(key);
            writeSet();
            paint();
            return;
          }
          const moreBox = event.target?.closest?.('[data-snc-more-check]');
          if (moreBox) {
            /* the "..." launcher is a view like any other from the user's side,
               but it is not a tab: no active-view guard, nothing to select */
            if (moreBox.checked) hiddenViews.delete(VIEWS_MORE_KEY);
            else hiddenViews.add(VIEWS_MORE_KEY);
            writeSet();
            paint();
            return;
          }
          const tabBox = event.target?.closest?.('[data-snc-tab-check]');
          if (tabBox) {
            const tab = tabBox.closest('.snc-ctl')?.parentElement;
            if (!tab || !tab.matches('button[role="tab"]')) return;
            const key = keyOfTab(tab);
            /* hiding the view you are looking at would blank the center area */
            if (!tabBox.checked && tab.getAttribute('aria-selected') === 'true') {
              tabBox.checked = true;
              tabBox.title = '当前视图不能隐藏，请先切到别的标签';
              tabBox.setAttribute('aria-invalid', 'true');
              return;
            }
            if (tabBox.checked) hiddenViews.delete(key); else hiddenViews.add(key);
            writeSet();
            paint();
          }
        };
        document.addEventListener('change', onChange, true);

        sync();
        const observer = new window.MutationObserver(() => {
          sync();
          /* tabs mount later than the sidebar and re-render on selection */
          if (editing || hiddenViews.size > 0) paintTabs();
        });
        observer.observe(document.body, { childList: true, subtree: true, attributeFilter: ['aria-selected'] });
        return () => {
          observer.disconnect();
          window.removeEventListener('keydown', onEscapeKey, true);
          document.removeEventListener('change', onChange, true);
          document.removeEventListener('pointerdown', onPointerDown, true);
          document.removeEventListener('pointermove', moveDrag, true);
          document.removeEventListener('pointerup', endDrag, true);
          document.removeEventListener('pointercancel', endDrag, true);
          document.removeEventListener('click', onControlClick, true);
          if (drag.active) {
            /* a hot-reload or a disable can land mid-gesture: leave nothing of
               it behind (a dimmed row and an insertion bar survived a reload
               and could not be cleared from the UI) */
            clearDropMarks(drag.active.container);
            drag.active.container?.removeAttribute?.('data-snc-sorting');
            delete drag.active.unit?.dataset?.sncDragging;
            delete drag.active.unit?.dataset?.sncNoFade;
            drag.active = null;
          }
          suppressClick = false;
          document.body.style.removeProperty('cursor');
          for (const strip of document.querySelectorAll('div[data-conversation-tabs]')) {
            undecorateTabs(strip);
            undecorateViewsMore(strip);
            viewsMoreOf(strip)?.removeAttribute('data-snc-hidden');
            strip.removeAttribute('data-snc-editing');
            strip.removeAttribute('data-snc-sorting');
          }
          for (const shell of [...shells]) clear(shell);
          style.remove();
        };
      }, 'dsh-sidebar-manager: panel group + visibility');
    }
    module.exports.apply = apply;
    module.exports.name = 'dsh-sidebar-manager-client';
    return module.exports;
  }
});
