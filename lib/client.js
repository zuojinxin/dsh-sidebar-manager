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
     * dsh-client-ui-sidebar/SidebarRoot.module.css (0.2.2-rc.2):
     *   panelRow  min-height 32px, padding 5px calc(row-padding - paint-inset),
     *             border-inline 3px solid transparent, gap 6px,
     *             radius var(--dsw-radius-md) 12px, margin 0, line-height 22px
     *   panelList column flex, gap 2px, margin-bottom 8px
     *   radius-sm 6px (20x20 icon buttons)
     * Colours come from the live custom properties so light/dark just works.
     */
    const css = `
/* ---- where our row sits: INSIDE the host list -------------------------------
   NOTHING THE HOST OWNS IS EVER RE-PARENTED. Earlier builds wrapped the host
   nav[class*="panelList"] in a div of our own and moved the nav into it, so the
   list stopped being a child of where React put it; the first re-render that had
   to insert a node with the nav as its anchor then threw NotFoundError and blanked
   the whole sidebar (issue #3, reproduced on 0.2.1-rc.5 where the host renders a
   tooltip bubble as the nav's preceding sibling).

   The group row is instead the FIRST CHILD of the nav itself. That is the general
   answer, not a version-specific one:
   - no host node changes parent, so no React anchor can ever go stale;
   - it needs no knowledge of how the host lays the list out. The nav is a plain
     flex column in every build so far (0.2.1-rc.5, 0.2.2-rc.2/rc.3), and that
     comes from the nav's OWN rule -- a flex item's display does not depend on its
     parent. A host that later puts the list in a grid, a block or anything else
     therefore cannot move this row, and the row never has to mirror a grid cell
     the way a wrapper had to (v0.11.0's 4px-gutter bug);
   - it inherits the list's own rhythm for free: the rail's 12px gap, the collapsed
     margin, the fold animation. A wrapper had to restate all of that by hand.

   The one thing to keep is flex: 0 0 auto on the row: as a flex ITEM of the nav
   column it must hold its own height instead of growing to fill the list. */

/* hidden entries stay in the DOM (checkbox restorable) but leave the flow.
   A row is not always a bare <button> child of the list: the host wraps its own
   "more" entry in an anchor element, because the popup it opens is positioned
   from that box. So the hidden flag lands on whatever direct child of the list
   either IS a row or OWNS one, and both shapes have to leave the flow.

   EDIT MODE IS EXCLUDED HERE, at the hiding rule, rather than re-shown by a later
   rule. Both forms need !important to beat the host, so a "show again" rule would
   have had to out-specify this one -- and it did not once the wrapper went away
   (0,3,1 against this rule's 0,3,2): the rows stayed hidden while editing, which
   is the one state where they must not be. Excluding the state up front has no
   specificity to lose. */
nav[class*="panelList"]:not([data-snc-editing="true"]) > [data-snc-unit="true"][data-snc-hidden="true"] { display: none !important; }

/* ---- group row: same box model as a native panelRow (rc.2 geometry) ----
   BOTH alignments here are measured against the host, because the host does not
   align its section header the way it aligns its rows: it starts the heading one
   pixel left of a row's glyph, and it lets the header's trailing icons hang
   outside the content column. "Same as a row" gets both wrong.

   LEFT -- a .panelRow starts its glyph at 12px (3px transparent border-inline
   plus 9px padding), but the "工作区" heading starts at 11px: .sectionHeader
   takes the whole 12px row padding as plain padding-left with no painted border
   (WorkspaceBrowser.module.css:66-79) and .sectionLabel then adds left:-1px
   (:93-95). Keeping the row's 3px border and giving back exactly one pixel of
   leading padding lands this caption on that same 11px, so the two headings read
   as one column instead of stepping 1-2px apart.

   RIGHT -- the header's action cluster is allowed to bleed, so a row that stops
   at the content column is always short of it: the host hands .sectionHeader
   margin-right:-4px and padding-right:1px (:88-91), which puts its last icon box
   3px past the column edge. The box itself stays a row wide (the hover fill must
   not grow), so the bleed is taken by the trailing press target instead -- see
   .snc-chev below. */
.snc-group {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  /* the host's own headerActions run gap 4px between 28px icon boxes */
  gap: 4px;
  width: 100%;
  min-height: 32px;
  margin: 0;
  padding: 5px calc(var(--dsh-sidebar-row-padding, 12px) - var(--dsh-sidebar-paint-inset, 3px));
  padding-left: calc(var(--dsh-sidebar-row-padding, 12px) - var(--dsh-sidebar-paint-inset, 3px) - 1px);
  padding-right: 0;
  border-block: 0;
  border-inline: var(--dsh-sidebar-paint-inset, 3px) solid transparent;
  border-radius: var(--dsw-radius-md, 12px);
  background: transparent;
  background-clip: padding-box;
  color: var(--dsw-alias-label-primary, inherit);
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  text-align: left;
  cursor: pointer;
  /* This row is a flex ITEM of the host's column list, so it must neither grow
     nor shrink: the old value 1 1 auto (what the block wrapper allowed) would let
     it
     stretch down the whole sidebar. Its height is its content, period. */
  flex: 0 0 auto;
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
   Both pockets are the host's own 28x28 and both glyphs stay centred in them,
   exactly like "视图选项" / "添加工作区" below. Matching the boxes was never the
   hard part -- matching the ink is, because the boxes are not the ink.

   The host's 16px action glyphs keep ~1px of slack inside their own viewBox --
   project-add-outline's ink ends at 15.05 of 16 -- so host ink sits 6.95px inside
   a 28px box (6 + 0.95). Centred, our 14px chevron path ends at 9.6 of 14 and so
   sits 11.4px inside (7 + 4.4): same box, ink 4.45px short. Padding the glyph out
   to the box edge trades that for an off-centre arrow, so the fix lives in the
   glyph instead: CHEVRON spans 1.5..12.5 of its 14px viewBox rather than
   5.4..8.9, its ink ending at 13.2 of 14 and therefore 7.4px inside the box
   (7 + 0.8) -- within half a pixel of the host's 6.95px, with the arrow still
   centred in its pill.

   The rail: the host's trailing cluster overhangs the content column by 3px
   (.sectionHeader margin-right:-4px plus padding-right:1px,
   WorkspaceBrowser.module.css:88-91), putting its last box right edge 1px inside
   the column. A panel row may not overhang, so 2px of margin-right pays for the
   row's own 3px transparent border less that 1px, and the chevron's box right
   edge lands on the last host button box.

   With both pockets 28px and the host's 4px gap between them, the gear's box
   follows 32px in from the chevron's and lands on "视图选项"'s box with no
   correction of its own; its ink is near enough centred (13.55 of 14) to need
   none either.

   The negative block margin keeps the boxes from growing the row: their outer
   height stays the 22px line box of a native panelRow, so the group row is still
   32px tall and the list below it does not move. */
.snc-bud,
.snc-chev {
  flex: none;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-block: -3px;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-sm, 6px);
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #81858c);
  cursor: pointer;
  transition: color .12s ease, background .12s ease, transform .15s var(--ds-ease-in-out, ease),
              opacity .15s ease;
}
/* the same 28px pocket as the gear; it pays for the row's own transparent border
   with a negative margin so its right edge lands where the host's last action box
   lands -- see the block comment above for the arithmetic */
.snc-chev {
  width: 28px;
  height: 28px;
  margin-right: calc(1px - var(--dsh-sidebar-paint-inset, 3px));
}
/* the gear needs no correction: 28px box + 4px gap, straight from the chevron */
.snc-bud { margin-right: 0; }
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
nav[class*="panelList"][data-snc-folded="true"] .snc-bud,
nav[class*="panelList"][data-snc-editing="true"] .snc-bud { opacity: 1; }
/* touch screens never hover: an invisible press target there is a trap */
@media (hover: none) {
  .snc-bud { opacity: 1; }
}

/* ---- rail: the host collapsed its own sidebar to icons ---------------------
   The host's sidebar root carries a "collapsed" class once its 150ms slide has
   settled. The column we live in is then 36px wide (56px rail minus 10px padding
   each side, its own 36x36 control boxes, 12px rhythm), and this row used to
   keep asking for its wide shape: caption plus two 28px pockets is 56px of
   fixed ink with a caption that can shrink to zero, so both buttons spilled
   over each other in the middle of the rail.

   A rail is one control per row, so the row keeps exactly one:
   - the caption goes: there is no width for it, and every other rail row is
     icon-only too;
   - the gear goes with it -- its job is checkboxes and drag handles on the
     list rows, and in a 36px column that list is icons with nothing to drag
     into. (While EDITING it is the opposite: the gear is the only way out of
     the mode, so it stays and the chevron -- which cannot fold while editing
     anyway -- is the one that goes.)
   Sizes are the host's own rail geometry, so the single remaining box lands
   on the same 36x36 rail the "新建会话" and panel icons ride.

   Geometry is now inherited, not restated. The row is a child of the host's own
   rail list, so it rides the same 12px gap, collapsed margin and fold animation
   as the panel rows around it -- the old wrapper had to copy all of that by hand
   because it sat in the list's slot instead of in the list. */
nav[class*="panelList"][data-snc-rail="true"] .snc-caption { display: none; }
nav[class*="panelList"][data-snc-rail="true"] .snc-group {
  justify-content: center;
  min-height: 36px;
  width: 100%;
  margin: 0;
  padding: 0;
  border-inline: 0;
  border-radius: var(--dsw-radius-md, 12px);
}
nav[class*="panelList"][data-snc-rail="true"] .snc-chev,
nav[class*="panelList"][data-snc-rail="true"] .snc-bud {
  width: 36px;
  height: 36px;
  margin: 0;
}
/* one control, never two: gear at rest, chevron while it can still fold */
nav[class*="panelList"][data-snc-rail="true"]:not([data-snc-editing="true"]) .snc-bud { display: none; }
nav[class*="panelList"][data-snc-rail="true"][data-snc-editing="true"] .snc-chev { display: none; }

/* ---- the rail while editing: a 36px square holding the box AND the glyph ----
   "Editing, then collapse" is a real state: the gear stays so the mode can be
   left, but the sidebar is now 36px wide and a row cannot hold what the wide
   layout holds. Everything at once does not fit -- the grip (14px) plus the box
   (16px) plus a gap plus the host's glyph is 40px into a 36px column -- which is
   what produced the sliced-off icons and the sideways scroll.

   The rail keeps the two things that still mean something at 36px:
     the BOX,  because the mode is on and hiding rows is what it does, and
     the GLYPH, because five identical squares say nothing about which row is
     which -- the label has no room, the icon is the identity.
   That pair measures 16 + 2 + 14 = 32px, so it fits with room to spare. The grip
   is what goes: a one-column rail has nowhere to drag a row to, so it would cost
   14px and buy nothing. The label goes too -- there is no width for text.

   The row box is pinned rather than inherited: the host's rail rule sets 36px on
   its own button, and any "fill the row" rule of ours has to be out of the way
   here (see the :not([data-snc-rail="true"]) guards above).

   SCOPED TO ROWS, never to "every direct child". A host may render other things
   as children of the list -- 0.2.1-rc.5 puts the hover TOOLTIP BUBBLE there, and
   that bubble is position:fixed precisely so it costs no layout. A bare "> *"
   rule outranks the bubble's own class and turns it into a 36px in-flow box: the
   list grew by a whole row, every row below it jumped down, and because the shift
   moved the pointer off the row the tooltip then vanished, the layout sprang
   back, and the pointer was over the row again -- an endless flicker. It only
   ever showed on hosts that keep the bubble as a list child, which is why one
   version had it and another did not.

   So the selector is the mark build() puts on a row unit. It matches a bare-button
   row, an entry wrapper and the more anchor, and matches nothing else the host may
   put in the list -- without needing a lookahead selector, so the rule cannot be
   dropped wholesale by a parser that does not know one. */
nav[class*="panelList"][data-snc-rail="true"][data-snc-editing="true"]
  > [data-snc-unit="true"] {
  position: relative;
  flex: 0 0 36px;
  width: 36px;
  min-width: 0;
  height: 36px;
  margin: 0;
  padding: 0;
  border-inline-width: 0;
}
/* the inner button of a wrapper, and the "more" button, both land on the same
   36px square as a bare row's button */
nav[class*="panelList"][data-snc-rail="true"][data-snc-editing="true"] > [data-snc-unit="true"] > button[class*="panelRow"],
nav[class*="panelList"][data-snc-rail="true"][data-snc-editing="true"] > button[class*="panelRow"] {
  box-sizing: border-box;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  margin: 0;
  /* the pair is centred as one unit: the host's 8px label gap would push it over
     the edge, 2px is what is left over between a 16px box, a 14px glyph and 36 */
  padding: 0 2px;
  gap: 2px;
  border-inline-width: 0;
  justify-content: center;
  background: 0 0;
}
/* the strip sits IN the flow here, beside the glyph, instead of being stretched
   across the row as the wide layout does */
nav[class*="panelList"][data-snc-rail="true"][data-snc-editing="true"] .snc-ctl {
  position: static;
  inset: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  margin: 0;
  flex: 0 0 auto;
}
/* …and the row's glyph stays visible next to it. The label does not: it is text,
   and a 36px column has no width for a word. Two shape selectors, because the row
   is one level deep on a bare-button host (nav > button) and two on a wrapper
   host (nav > entry > button). */
nav[class*="panelList"][data-snc-rail="true"][data-snc-editing="true"]
  > [data-snc-unit="true"] > button[class*="panelRow"] > :not(.snc-ctl, [class*="panelGlyph"]),
nav[class*="panelList"][data-snc-rail="true"][data-snc-editing="true"]
  > button[class*="panelRow"] > :not(.snc-ctl, [class*="panelGlyph"]) {
  display: none;
}

/* collapsed: the arrow turns to point the way the list will open.
   The turn happens on the svg, not on the button. Rotating the button would
   swing its own padding-right round to become a vertical offset and drop the
   arrow below the caption's centre line; rotating the glyph about its own centre
   leaves the box, the ink nudge and the vertical centring all as they are. The
   side effect is honest and tiny: a turned arrow is 1.9px wider than the same
   arrow pointing down, so in the collapsed state its ink sits 1.9px past the
   rail instead of on it. */
.snc-chev > svg { transform: rotate(0deg); transition: transform .15s var(--ds-ease-in-out, ease); }
.snc-group[aria-expanded="false"] .snc-chev > svg { transform: rotate(-90deg); }

/* ---- folded: only the group row survives ----
   The row now lives INSIDE the list, so folding cannot hide the list itself --
   that would take the row with it. It hides the host's own entries instead,
   addressed as "every direct child that is not our row". That is also what keeps
   this working if the host adds a new kind of entry: it is hidden by the same
   rule without us naming it.

   The not([data-snc-editing]) condition is what lets edit mode win WITHOUT a
   override: the list the checkboxes live in has to come back while editing, and
   the fold resumes on the way out. Expressing it as a condition on the hiding
   rule (instead of re-showing things afterwards) means nothing is ever painted
   twice in one state, so there is no rule order to get wrong. */
nav[class*="panelList"][data-snc-folded="true"]:not([data-snc-editing="true"]) > :not(.snc-group) { display: none; }

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
/* editing needs the list back even when it was folded; folding resumes on exit.
   The folded rule above already excludes editing, so this only has to make the
   list a wrapping flex row. display: flex is still stated because the host may
   have hidden the whole list (Windows titlebar rail), and edit mode is the one
   state where the rows must be reachable. */
nav[class*="panelList"][data-snc-editing="true"] { display: flex !important; }
/* a flex column wraps when told to: whatever the viewport leaves is one row
   down instead of clipped off the bottom of the sidebar */
nav[class*="panelList"][data-snc-editing="true"] { flex-wrap: wrap !important; }
/* an unchecked row must stay reachable, otherwise it can never be restored: it
   keeps its box and only its look fades (the global rule above hides it) */
nav[class*="panelList"][data-snc-editing="true"] > [data-snc-hidden="true"] {
  display: flex !important;
  opacity: .45;
}
/* The host's "more" row is a column (icon over label); while editing it turns
   into a row so the box can sit beside it instead of above it. This part is
   layout-independent, so it holds in the rail too -- but only the DIRECTION may
   change freely; the rail block below pins the box it lives in. */
nav[class*="panelList"][data-snc-editing="true"] > [class*="moreAnchor"] {
  flex-direction: row; align-items: center; gap: 0;
}
/* ---- where the last row sits: COPIED from a real row, never assumed --------
   The anchor has to start on the same edge as the host's own rows, and hosts put
   that edge in different places: 0.2.2-rc.2+ wraps each row in div.panelEntry and
   gives the WRAPPER a 3px transparent inset (zeroing the button's border under
   it), while 0.2.1-rc.5 has no wrapper at all and gives the bare BUTTON
   "margin: 0 2px". Hard-coding either answer breaks the other -- that is exactly
   how the rc.2+ fix put rc.5's last row 5px out of line.

   So nothing here is hard-coded: syncRowMetrics() reads a live host row and
   publishes what its box actually carries as custom properties on the nav. Our
   anchor mirrors the row UNIT (the wrapper, or the button itself when there is
   none) and our button mirrors the host's button. Any future shape -- a wrapper
   with no inset, an inset on both, a different margin -- lands on the same edge
   without touching this file, because the values are measured, not guessed. */
nav[class*="panelList"][data-snc-editing="true"] > [class*="moreAnchor"] {
  margin-inline: 0;
}
nav[class*="panelList"][data-snc-editing="true"]:not([data-snc-rail="true"]) > [class*="moreAnchor"] {
  margin-inline: var(--snc-more-margin, 0px);
  border-inline: var(--snc-more-border, 0px) solid transparent;
  /* the anchor paints its fill up to the padding box, i.e. INSIDE that inset, so
     the hover pill reads as one shape from the checkbox to the label instead of
     starting to the right of it */
  background-clip: padding-box;
  border-radius: var(--dsw-radius-md, 12px);
}
nav[class*="panelList"][data-snc-editing="true"] > [class*="moreAnchor"] > .snc-ctl {
  margin-left: 0;
}
/* The anchor's button must FILL the row: with a wrapper the host gets that from
   ".panelEntryWide > *:first-child { flex: 1 }", which reaches our button only by
   luck of nesting; without one the button would shrink to its content and its own
   padding would then start beside the controls instead of across the row.
   RAIL EXCLUDED: growing a button in a 36px column is what turned this one row
   into a 56px block while every other row stayed 36px. */
nav[class*="panelList"][data-snc-editing="true"]:not([data-snc-rail="true"]) > [class*="moreAnchor"] > button[class*="panelRow"] {
  flex: 1 1 auto; min-width: 0;
  /* whatever inset the host's own button carries -- zero under a wrapper, none on
     a bare row -- so the two rows' boxes stay identical */
  border-inline-width: var(--snc-btn-border, 0px);
  background-clip: padding-box;
}
/* rc.2 keeps its entry wrappers in a flex row and grows the row with
   ".panelEntryWide > *:first-child { flex: 1; min-width: 0 }". Our controls are
   the first child there, so in the wide (expanded) sidebar that rule would hand
   THEM the free width -- flex-basis 0 -- and leave the panel button beside a
   zero-width control slot: the grip and the box then paint on top of the row's
   own glyph. Scoped to edit mode, because that is the only time the slot exists;
   outside it the host's own sizing is left exactly as it was. */
/* RAIL EXCLUDED: the host's own rail rule pins this button to 36px, and a
   "width: auto; flex: 1 1 auto" here would override it -- which stretched every
   row to the panel's full width (102px in a 56px column) the moment the sidebar
   was collapsed while still editing. */
nav[class*="panelList"][data-snc-editing="true"]:not([data-snc-rail="true"]) > [class*="panelEntry"] > .snc-ctl {
  flex: 0 0 auto;
}
nav[class*="panelList"][data-snc-editing="true"]:not([data-snc-rail="true"]) > [class*="panelEntry"] > button[class*="panelRow"] {
  flex: 1 1 auto; min-width: 0; width: auto;
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
   never leave a text selection smeared behind the reorder.
   Scoped to rows (see the rail block): a bare "> *" would also hit whatever else
   the host keeps in the list -- 0.2.1-rc.5 renders the hover tooltip there. */
nav[class*="panelList"][data-snc-editing="true"] > [data-snc-unit="true"],
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
   so it only has to grow a box beside its icon.

   ALIGNMENT -- three separate lines have to agree, and only the first two did:
     1. the CHECKBOXES: a tab's 16px box and ours must share a centre;
     2. the LABEL BAND: a tab is min-height 35px / padding 10px 9px, so its text
        band is 16px tall and starts 18px from the tab's top;
     3. the "⋯" GLYPH ITSELF.
   (1) and (2) are met by aligning the row to the top and giving the ctl strip the
   same 18px slot. (3) is not: the host's own button is a 22px block with
   margin-top -3px, so its ink centre lands 2px ABOVE the label's, which reads as
   "the ... is floating up" even when every box below it lines up. Centring the
   row instead lets the taller button decide the line, which pulls the strip down
   and breaks (1). So the button is pinned to the same centre as the label band
   and the strip keeps its own top alignment. */
div[data-conversation-tabs][data-snc-editing="true"] ~ [class*="viewsMoreAnchor"] {
  display: flex; flex-direction: row; align-items: flex-start; gap: 6px;
}
div[data-conversation-tabs][data-snc-editing="true"] ~ [class*="viewsMoreAnchor"] > .snc-ctl {
  /* 16px box centred in the tab's 18px content offset: (18 - 16/2) = 10px */
  height: 20px;
  margin-top: 0;
  align-self: flex-start;
}
/* Put the glyph's ink centre on the label band's centre. Measured, not guessed:
   with the host's own margin-top -3px the 22px button's centre sits 2px ABOVE
   the 16px label band's, so the correction is the difference of the two centres
   *against that existing margin* -- which works out to -1px, not to a positive
   nudge. (A positive value overshoots by exactly the amount the host already
   applied.) */
div[data-conversation-tabs][data-snc-editing="true"] ~ [class*="viewsMoreAnchor"] > button {
  margin-top: -1px;
}
div[data-conversation-tabs][data-snc-editing="false"] ~ [class*="viewsMoreAnchor"][data-snc-hidden="true"],
div[data-conversation-tabs][data-snc-editing="false"] ~ button[class*="viewsMore"][data-snc-hidden="true"] {
  display: none !important;
}
div[data-conversation-tabs][data-snc-editing="true"] ~ [class*="viewsMoreAnchor"][data-snc-hidden="true"],
div[data-conversation-tabs][data-snc-editing="true"] ~ button[class*="viewsMore"][data-snc-hidden="true"] {
  opacity: .45;
}
/* ---- the "..." menu: where the folded views actually live ----
   The host keeps only max(1, floor((rowWidth - 48) / 120)) tabs in the strip
   -- two on a phone -- and folds every other view into this menu. A box that
   only ever lives inside a tab can therefore never reach a folded view, which
   is why the menu rows get one too.
   The menu is PORTALLED out of the header, so the strip's editing flag cannot
   reach it: the same flag is mirrored onto <html> for these two rules. The box
   is appended, not prepended: the row's leading edge is the host's label
   anchor and a trailing box never shifts it. */
[class*="viewsMoreMenu"] button[role="menuitem"] > .snc-ctl {
  margin-left: auto; margin-right: 0;
}
/* a menu row on a phone is a tap target, not a cursor: the box gets a little
   more room here than it needs in the strip */
[class*="viewsMoreMenu"] button[role="menuitem"] .snc-check {
  width: 20px; height: 20px;
}
/* a hidden view stays listed while editing so it can be brought back */
[class*="viewsMoreMenu"] button[role="menuitem"][data-snc-hidden="true"] {
  opacity: .45;
}
html[data-snc-editing="false"] [class*="viewsMoreMenu"] button[role="menuitem"][data-snc-hidden="true"] {
  display: none !important;
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
/* a one-column rail has nowhere to drag a row to, and the grip would take 14 of
   the 36 available pixels, so it steps out of the way while the sidebar is in
   that state. Stated here rather than with the rail block above so the base rule
   stays the first thing that defines a handle. */
nav[class*="panelList"][data-snc-rail="true"][data-snc-editing="true"] .snc-ctl > .snc-drag {
  display: none;
}

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
   drop read as motion rather than as a jump. Scoped to rows, so a host overlay
   living in the list keeps its own transform behaviour untouched. */
nav[class*="panelList"] > [data-snc-unit="true"],
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
/* Scoped to rows: will-change creates a containing block for fixed-position
   descendants, so hinting the wrong element would re-anchor a host tooltip bubble
   that happens to live under it. */
nav[class*="panelList"][data-snc-sorting="true"] > [data-snc-unit="true"],
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
    /* the fold arrow, drawn wide enough to spend the same 1px of slack inside its
       14px viewBox that the host's 16px icons leave inside theirs -- so a centred
       arrow in a 28px pocket lands its ink on the host rail. A narrow 5.4..8.9
       path, centred the same way, would fall 3px short of the host's right edge. */
    const CHEVRON = '<svg viewBox="0 0 14 14" fill="none" focusable="false" aria-hidden="true">' +
      '<path d="M1.5 4.5 7 10 12.5 4.5" stroke="currentColor" stroke-width="1.4" ' +
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
        /* One sheet per plugin, however many times this runs. A second activation
           without a matching dispose (a reload that does not tear the old one down
           first) would otherwise stack a duplicate sheet, and the stale copy is the
           one that keeps winning the cascade. */
        document.querySelectorAll(`style[data-plugin-css="${NAME}"]`).forEach((old) => old.remove());
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
        const emptyState = () => ({ v: STATE_VERSION, folded: false, hidden: [], views: [], actions: [], order: [], orderViews: [] });
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
            actions: asStrings(parsed.actions),
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
        /* the host's own rows at the foot of the "..." menu ("浏览更多插件" /
           "创建你的插件") are not plugin entries and have no panel of their own,
           so they are a third list: same idea, different owner */
        let hiddenActions = new Set(state.actions);
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
          state.actions = [...hiddenActions];
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
        /* Publish the answer on the DOM itself, so the stylesheet does not have to
           re-derive "is this child a row" with a selector of its own. Hosts keep
           other things in the list (0.2.1-rc.5 renders the hover tooltip there),
           and a rule written as "every direct child" turns those into rows: the
           bubble lost its position:fixed and cost the list a whole extra row.
           Stale marks are cleared in the same pass, so a row the host re-rendered
           or removed cannot keep the attribute on some other element. */
        const markUnits = (nav) => {
          const units = new Set(rowsOf(nav));
          for (const el of nav.children) {
            if (units.has(el)) {
              if (el.getAttribute('data-snc-unit') !== 'true') el.setAttribute('data-snc-unit', 'true');
            } else if (el.hasAttribute('data-snc-unit')) {
              el.removeAttribute('data-snc-unit');
            }
          }
        };

        /* ---- what a host row's box actually carries, measured ---------------
           The "more" anchor has to start on the same edge as the host's own rows,
           and hosts put that edge in different places. Rather than test for a
           shape we know (and break on the next one), read a live host row and
           republish what it carries:

             --snc-more-margin / --snc-more-border : the ROW UNIT's inline margin
                 and border, which our anchor mirrors (the unit is the panelEntry
                 wrapper, or the button itself when the host has no wrapper);
             --snc-btn-border : the inset on the host's own row BUTTON, which ours
                 must match so the two boxes stay identical.

           Anything the host does -- inset on the wrapper, margin on the button,
           both, neither -- reproduces here without a code change. Values are
           re-read on every paint because the host switches them by state (the
           rail zeroes the inset, for one), and a missing host row simply leaves
           the previous numbers in place. */
        const syncRowMetrics = (nav) => {
          /* taken from the node's own view, never off the bare global: this code
             also runs under a document without a window-scoped getComputedStyle,
             and a measurement must never be able to break painting */
          const view = nav.ownerDocument?.defaultView;
          const compute = view?.getComputedStyle;
          if (typeof compute !== 'function') return;
          const unitOfRow = (unit) => {
            if (unit.matches?.('button[class*="panelRow"]')) return unit;
            return unit.querySelector(':scope > button[class*="panelRow"]') || null;
          };
          try {
            for (const unit of rowsOf(nav)) {
              if (unit.closest?.('[class*="moreAnchor"]')) continue;  // ours, not the host's
              const button = unitOfRow(unit);
              if (!button) continue;
              const unitStyle = compute.call(view, unit);
              const buttonStyle = compute.call(view, button);
              const px = (value) => (Math.round((parseFloat(value) || 0) * 100) / 100) + 'px';
              /* a bare host row IS the button, so its margin/border are already on
                 the element our button reuses -- only a wrapper has a box of its
                 own for the anchor to mirror */
              const wrapped = unit !== button;
              nav.style.setProperty('--snc-more-margin', wrapped ? px(unitStyle.marginInlineStart) : '0px');
              nav.style.setProperty('--snc-more-border', wrapped ? px(unitStyle.borderInlineStartWidth) : '0px');
              nav.style.setProperty('--snc-btn-border', px(buttonStyle.borderInlineStartWidth));
              return;
            }
          } catch { /* a host that refuses to be measured keeps the last numbers */ }
        };

        /* ---- the controls, in place -----------------------------------------
           A grip and a box per unit, appended to the unit itself and removed on
           the way out. Nothing is wrapped: React owns these rows, and a row it
           had to remove while it sat inside a wrapper of ours threw, taking the
           whole header down with it. */
        /* Controls are always INSIDE the row button (see ctlHostOf): on a bare row
           that is the unit itself, on a host wrapper the button is one level down,
           and around the "more" entry the anchor wraps that button. Looking one
           step further down covers all three without the caller caring which
           shape it holds -- a plain ":scope > .snc-ctl" probe finds nothing on the
           wrapper shapes and the checkbox then never gets its state painted. */
        const ctlOf = (unit) => unit?.querySelector?.(':scope > .snc-ctl')
          || unit?.querySelector?.(':scope > button[class*="panelRow"] > .snc-ctl')
          || null;
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
        /* The host's "more" entry keeps its button inside an anchor (the popup is
           positioned from that box). Our controls belong in the BUTTON, exactly
           where they go on every other row: putting them on the anchor makes the
           anchor a flex row of [controls][button], so the button starts after the
           32px control strip and its own 8px/2px inset then lands the glyph 6px
           left of every other row's. Same DOM shape for every row is what keeps
           them aligned on all hosts, wrapped or not. */
        const ctlHostOf = (unit) => unit.querySelector(':scope > button[class*="panelRow"]') || unit;
        const decorateAll = (nav) => {
          for (const unit of rowsOf(nav)) {
            /* a unit that is an anchor around the row gets its controls inside the
               button; everything else takes them directly */
            const host = ctlHostOf(unit);
            if (host !== unit) {
              const stray = unit.querySelector(':scope > .snc-ctl');
              if (stray) stray.remove();
            }
            decorate(host, { drag: true, kind: 'sncCheck' });
          }
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
          /* Reorder IN PLACE. The units keep the slots they already occupy, refilled
             in the new order, so every other child of the container stays exactly
             where the host put it.

             An append loop plus "lift the group row out and put it back" used to
             do this job, and it swept everything else to the front: our own header
             survived because it was handled by name, but anything else the host
             keeps in the list did not -- 0.2.1-rc.5 renders the hover tooltip
             there, and a saved order replayed at boot moved that bubble from last
             child to first. Nothing here may depend on knowing what else lives in
             the list. */
          const wantedSet = new Set(wanted);
          let next = 0;
          const target = [...container.children].map((el) => (wantedSet.has(el) ? wanted[next++] : el));
          for (let i = 0; i < target.length; i++) {
            const at = container.children[i] || null;
            if (at === target[i]) continue;
            container.insertBefore(target[i], at);
          }
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
        const isPinnedLabel = (key) => /^(对话|聊天|Chat)$/i.test(key);
        const isPinnedTab = (tab) => {
          const id = (tab.getAttribute('data-snc-view-id') || '').toLowerCase();
          if (id) return id === 'chat';
          return isPinnedLabel(keyOfTab(tab));
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

        /* ---- the "..." menu: the folded views, then the host's own rows ------
           The host keeps only max(1, floor((rowWidth - 48) / 120)) tabs in the
           strip -- two on a phone -- and folds every other view into this menu,
           so the menu is the only place those views can be shown or hidden at
           all. A box that only ever lives inside a tab can never reach them.
           The rows are not the host's: entry-customization renders them through
           the conversation.session.header.views.actions slot, one
           role="menuitem" <button> per view, followed by two rows it adds
           itself -- "浏览更多插件" and "创建你的插件". Both kinds get a box: the
           menu is the only place either kind is reachable on a phone. A view row
           is the one that wraps its label in an entry-name span; the action rows
           carry an icon and plain text, and they are kept in their own hidden
           list because they belong to the host, not to a plugin entry. */
        const VIEWS_MENU_LIST = '[class*="viewsMoreMenu"]';
        const VIEWS_MENU_ROW = 'button[role="menuitem"]';
        const VIEWS_MENU_NAME = '[class*="entryName"]';
        const menuRows = () => {
          const found = [];
          for (const list of document.querySelectorAll(VIEWS_MENU_LIST)) {
            for (const row of list.querySelectorAll(VIEWS_MENU_ROW)) {
              if (!found.includes(row)) found.push(row);
            }
          }
          return found;
        };
        const isViewRow = (row) => row.querySelector(VIEWS_MENU_NAME) !== null;
        const hiddenOf = (row) => (isViewRow(row) ? hiddenViews : hiddenActions);
        /* the label is the whole identity, exactly as it is for a tab: the menu
           row and the tab it was folded out of are the same view, and they have
           to share one key or the two boxes would fight over one setting */
        const menuKeyOf = (row) => ((row.querySelector(VIEWS_MENU_NAME) || row).textContent || '').trim();
        const isMenuActive = (row) => row.querySelector('[class*="activeMark"]') !== null;
        const decorateMenuRow = (row) => {
          const existing = ctlOf(row);
          if (existing) return existing;
          const ctl = document.createElement('span');
          ctl.className = 'snc-ctl';
          const box = document.createElement('input');
          box.type = 'checkbox';
          box.className = 'snc-check';
          box.dataset.sncMenuCheck = '';
          ctl.append(box);
          /* appended, not prepended: the row's leading edge is the host's label
             anchor and a trailing box never shifts it */
          row.append(ctl);
          return ctl;
        };
        const undecorateMenu = () => {
          for (const row of menuRows()) {
            undecorate(row);
            row.removeAttribute('data-snc-hidden');
          }
        };
        /* the menu exists only while it is open, and a document-wide class
           substring scan on every mutation is not free: paint once a menu has
           been seen, or once a stored hidden row would need one */
        let menuSeen = false;
        const paintViewsMenu = () => {
          if (!editing && !menuSeen && hiddenViews.size === 0 && hiddenActions.size === 0) return;
          const rows = menuRows();
          menuSeen = rows.length > 0;
          for (const row of rows) {
            const key = menuKeyOf(row);
            if (!key) continue;
            const isView = isViewRow(row);
            const set = isView ? hiddenViews : hiddenActions;
            /* the pinned view is not a toggle anywhere else either */
            if (isView && isPinnedLabel(key)) {
              undecorate(row);
              row.removeAttribute('data-snc-hidden');
              if (hiddenViews.delete(key)) writeSet();
              continue;
            }
            if (editing) decorateMenuRow(row); else undecorate(row);
            const isHidden = set.has(key);
            if (isHidden) row.dataset.sncHidden = 'true';
            else row.removeAttribute('data-snc-hidden');
            const box = ctlOf(row)?.querySelector('input');
            if (!box) continue;
            box.checked = !isHidden;
            box.setAttribute('aria-label', key + ' 显示');
            box.title = isHidden ? '已隐藏，勾选后显示' : '显示中，取消勾选则隐藏';
            /* the same refusal the tab boxes make, for the same reason: hiding
               the view you are looking at leaves the center with no handle */
            if (!isView || !isMenuActive(row) || isHidden) box.removeAttribute('aria-invalid');
          }
        };

        const paintTabs = () => {
          /* the menu is portalled out of the strip, so the editing flag has to
             be reachable from <html> for its two rules to see it */
          const root = document.documentElement;
          const flag = String(editing);
          if (root.dataset.sncEditing !== flag) root.dataset.sncEditing = flag;
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
          /* once per pass, not once per strip: the menu is a single portal */
          paintViewsMenu();
        };

        /* ---- rail: has the host collapsed its own sidebar to icons? -------
           The host's sidebar root carries `collapsed` ONLY once the collapse has
           settled: for the 150ms slide it keeps the wide class so the content
           can fade out at full width, and only then swaps to the rail layout.
           Keying off the frame's `data-sidebar-collapsed` attribute instead would
           flip this row to its 36px icon shape while the column is still 280px
           wide and visibly sliding -- so the settled class is the signal, and it
           is also the one the host's own rail geometry is written against.

           The class is read as a fragment, exactly like `panelList` / `panelRow`
           above: the hash prefix is per build and must never be hard-coded.

           What must NOT be used is a width measurement. "Narrow sidebar, so
           rail" is the obvious test and it is wrong here: every injector that
           adds DOM to the sidebar (this plugin included) can widen the box being
           measured, so a width test reports "wide" exactly when the rail has been
           polluted -- docs/agents/troubleshooting.md records the same trap. */
        const isRail = (shell) => shell.nav.closest('[class*="collapsed"]') !== null;

        /* split out of paintShell because the two are driven by different
           events: the fold/edit state changes on our own presses, the rail
           state changes when the HOST collapses its sidebar. Publishing both
           from one function would mean repainting the whole list -- order
           replay included -- every time the host slides its column.

           The flag lives on the NAV now, not on a wrapper of our own: the CSS
           that reads it (.snc-caption, .snc-group, .snc-chev/.snc-bud) all hang
           off "the list, when it is a rail". Same place as data-snc-folded and
           data-snc-editing, so one element carries the whole state. */
        const paintRail = (shell) => {
          if (isRail(shell)) shell.nav.dataset.sncRail = 'true';
          else shell.nav.removeAttribute('data-snc-rail');
        };

        const paintShell = (shell) => {
          const { nav, group, gear } = shell;
          nav.dataset.sncFolded = String(folded);
          nav.dataset.sncEditing = String(editing);
          paintRail(shell);
          /* the rail/wide switch changes what the host puts on a row, so the
             numbers the anchor copies are re-read here, on every paint */
          syncRowMetrics(nav);
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
          /* One authoritative answer to "which children are rows", published on
             the DOM so CSS and JS cannot drift apart. Everything below -- and
             every rule in the stylesheet -- reads this instead of assuming that a
             list child is a row: hosts keep other things in the list (0.2.1-rc.5
             renders the hover tooltip right there), and styling or reordering one
             of those is how the collapsed sidebar ended up shifting. */
          markUnits(nav);
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
        /* A press only counts as "on an entry" if the container's own child it
           resolves to actually holds a panel row. That child is either the row
           itself (a bare button, the host's "more" anchor, a tab) or a wrapper
           around it -- since 0.2.2-rc.2 every panel entry sits in a
           div.panelEntry that owns the box while the button inside it is just
           the label. Both shapes have to answer, so the unit itself is tested
           before its descendants. */
        const ROW_SEL = 'button[class*="panelRow"], [class*="moreAnchor"]';
        const unitOfPanelPress = (node, nav) => {
          if (!node || node === nav || !nav.contains(node)) return null;
          const unit = unitIn(node, nav);
          if (!unit || unit.parentElement !== nav) return null;
          return unit.matches(ROW_SEL) || unit.querySelector(ROW_SEL) ? unit : null;
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
          const unit = unitOfPanelPress(node, nav);
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
          /* climb from whatever the pointer is over to the container's own
             child. A row is not reliably a button: since 0.2.2-rc.2 every entry
             sits in a div.panelEntry that owns the paint box (the button inside
             it is only the label), so matching a row by its own marker missed
             the whole row area and the drop target was never found. The wrapper
             is the unit either way, which is exactly what unitIn() returns. */
          const climbed = hit && hit !== t.container && t.container.contains(hit)
            ? unitIn(hit, t.container) : null;
          /* Our group row is a child of the list but NOT a movable entry: it is
             a header that must stay first. Without this guard a pointer dragged
             up to the top of the list lands on it, and the carried row is then
             inserted before it -- putting an entry above the header, where the
             saved order can never describe it and the next replay would fight
             the layout. Treat it as "not a drop target", exactly like empty space. */
          const isHeader = climbed?.classList?.contains('snc-group');
          const row = !isHeader && climbed && climbed.parentElement === t.container ? climbed : null;
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
          /* Sidebar entries: a bare row, a div.panelEntry holding one, or the
             anchor the host wraps its own "more" entry in. The anchor's control
             slot is a child of the anchor, NOT of the inner button, and the gap
             between them belongs to the anchor too -- so resolve the unit from
             whatever the press landed in, exactly like dragUnitOf does, or that
             row would drag but not toggle. */
          let unit = null;
          if (!tab && !viewsMore) {
            const nav = managedNavOf(target);
            if (nav) unit = unitOfPanelPress(target, nav);
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
          /* the row IS the marker: if the list already holds one, this nav is
             built. Nothing on the host side is tagged or wrapped, so there is no
             second place that could disagree with this check.
             Asked of EVERY direct child, not just the first: the host may insert
             something ahead of our row (0.2.1-rc.5 puts the hover tooltip in the
             list), and a first-child test would then decide the nav was unbuilt
             and mount a SECOND row. */
          if (nav.querySelector(':scope > .snc-group')) return null;

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

          const shell = { el: group, nav, group, gear: bud };

          /* No placement to copy any more. The row is a child of the nav, so it
             inherits whatever cell/column the nav occupies -- the grid-cell dance
             the old wrapper needed (and got wrong once, in v0.11.0) is gone with
             it. */

          /* the row's own box is measured against the host's rows for the same
             reason the block wrapper needed it: a plain inset token does not line
             the box up with the native panel rows. The neighbours are now the
             list's OWN children, so the reference is still a real host row. */
          const measureInset = () => {
            let inset = 2;
            try {
              /* measured against a ROW, never against "the first child": a host may
                 keep other things in the list (0.2.1-rc.5 renders the hover tooltip
                 there) and one of those would both answer the wrong question and,
                 being position:fixed, answer it with a screen coordinate. */
              const neighbour = [...nav.children].find((n) => n !== group
                && n.hasAttribute('data-snc-unit')
                && n.getBoundingClientRect().width > 0);
              if (neighbour) inset = Math.round(neighbour.getBoundingClientRect().left - group.getBoundingClientRect().left);
            } catch {}
            group.style.setProperty('--snc-inset', inset + 'px');
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

          /* FIRST CHILD of the host list. This is the whole fix: the nav keeps
             the parent React gave it, so no host node is ever re-parented and no
             React anchor can go stale (issue #3). prepend, not insertBefore --
             there is no "before" sibling to name. */
          nav.prepend(group);
          return shell;
        };

        const clear = (shell) => {
          undecorateAll(shell.nav);
          /* The nav is the state carrier now, so leaving our attributes on it
             would keep the host list painted with our fold/edit rules after the
             plugin is gone -- and `data-snc-editing` would keep our own hidden-row
             rules disabled on a list we no longer manage. Every flag we set is
             removed here; the nav itself is never moved or touched otherwise. */
          for (const name of ['data-snc-folded', 'data-snc-editing', 'data-snc-rail']) {
            shell.nav.removeAttribute(name);
          }
          for (const name of ['--snc-more-margin', '--snc-more-border', '--snc-btn-border']) {
            shell.nav.style.removeProperty(name);
          }
          if (shell.nav.getAttribute('style') === '') shell.nav.removeAttribute('style');
          /* the row marks are ours too: leaving them on host rows would be a
             mutation the host never asked for and could never undo */
          for (const el of shell.nav.querySelectorAll('[data-snc-unit]')) el.removeAttribute('data-snc-unit');
          shell.group.remove();
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
            /* the row or the whole list can go at any time: React drops the nav
               when the panel list empties, and a nav re-mount takes the row with
               it. Either way the state is dropped, never repaired by moving the
               host's nodes -- that repair WAS the bug. */
            if (!shell.group.isConnected || !shell.nav.isConnected) clear(shell);
          }
          for (const nav of document.querySelectorAll('nav[class*="panelList"]')) {
            if (!isPanelList(nav)) continue;
            /* the row travels with the nav, so "already built" is a question
               about the nav's own children -- there is no wrapper to look for */
            const existing = [...shells].find((s) => s.nav === nav);
            if (existing) {
              layoutGroup(existing);
              paintRail(existing);
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
          const menuBox = event.target?.closest?.('[data-snc-menu-check]');
          if (menuBox) {
            const row = menuBox.closest('.snc-ctl')?.parentElement;
            if (!row || !row.matches(VIEWS_MENU_ROW)) return;
            const key = menuKeyOf(row);
            if (!key) return;
            const isView = isViewRow(row);
            /* the active view must stay listed: once the strip has folded it
               away, this row is the only handle on it */
            if (isView && !menuBox.checked && isMenuActive(row)) {
              menuBox.checked = true;
              menuBox.title = '当前视图不能隐藏，请先切到别的标签';
              menuBox.setAttribute('aria-invalid', 'true');
              return;
            }
            const set = isView ? hiddenViews : hiddenActions;
            if (menuBox.checked) set.delete(key); else set.add(key);
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
          /* tabs mount later than the sidebar and re-render on selection; the
             menu is mounted on open, so it needs the same repaint */
          if (editing || hiddenViews.size > 0 || hiddenActions.size > 0) paintTabs();
        });
        observer.observe(document.body, { childList: true, subtree: true, attributeFilter: ['aria-selected'] });

        /* ---- the host's collapse signal needs its own observer ------------
           A collapse is settled by swapping the sidebar root's class, and that
           swap carries NO childList mutation and no aria-selected change -- so
           the observer above never sees it and the rail flag would stay stale
           until something else re-rendered the sidebar.

           It is a separate observer, not one more option on the one above, for a
           cost reason: `class` changes are extremely common on a live page, and
           the shared callback runs a full sync() (every list walked, the saved
           order replayed) on each batch. This one only republishes the flag. */
        const railObserver = new window.MutationObserver((records) => {
          for (const record of records) {
            for (const shell of shells) {
              if (record.target.contains(shell.nav)) paintRail(shell);
            }
          }
        });
        railObserver.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
        return () => {
          observer.disconnect();
          railObserver.disconnect();
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
          /* the menu is a portal of its own: it outlives the strip teardown */
          undecorateMenu();
          document.documentElement.removeAttribute('data-snc-editing');
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
