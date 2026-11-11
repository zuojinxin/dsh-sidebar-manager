// node test/ego-check.mjs — the real plugin in the anonymous host fixture, via ego-browser.
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { closeSync, openSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// A single check owns this named task space, including recovery after a failure.
const lockPath = join(tmpdir(), 'dsh-sidebar-manager-ego-check.lock');
try {
  const fd = openSync(lockPath, 'wx');
  try { writeFileSync(fd, String(process.pid)); } finally { closeSync(fd); }
} catch (error) {
  if (error.code === 'EEXIST') throw new Error('A sidebar browser check is active or interrupted. Inspect ' + lockPath + ' and its process before retrying.');
  throw error;
}
process.once('exit', () => { try { unlinkSync(lockPath); } catch {} });

const repo = new URL('../', import.meta.url);
const files = new Map([
  ['/docs/preview.html', ['docs/preview.html', 'text/html; charset=utf-8']],
  ['/lib/client.js', ['lib/client.js', 'text/javascript; charset=utf-8']],
]);
const server = createServer(async (req, res) => {
  const file = files.get(req.url);
  if (!file) { res.writeHead(404).end(); return; }
  try {
    const body = await readFile(new URL(file[0], repo));
    res.writeHead(200, { 'content-type': file[1] }).end(body);
  } catch {
    res.writeHead(500).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const editingShot = fileURLToPath(new URL('docs/screenshots/04-right-editing.png', repo));
const customizedShot = fileURLToPath(new URL('docs/screenshots/05-right-customized.png', repo));

const script = `
const assert = (await import('node:assert/strict')).default;
const task = await taskSpace('dsh-sidebar-manager-right-panel');
console.log({ spaceId: task.spaceId });
const page = task.page('p1');
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await page.goto(${JSON.stringify(origin + '/docs/preview.html')});
await page.waitForFunction(() => window.__ready === true);
assert.match(await page.snapshot(), /文件/);
// The existing fold target sets aria-disabled while editing, but its child
// gear stays enabled. Exercise that live button with a measured pointer click.
const pressGear = async (options) => {
  const point = await page.evaluate(() => {
    const rect = document.querySelector('.snc-bud').getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.mouse.click(point.x, point.y, options);
};
const guide = '[data-sidebar-right-guide]';
const unit = (kind) => guide + ' > :has(> [data-sidebar-right-guide-entry="' + kind + '"])';
const read = () => page.evaluate(() => {
  const guide = document.querySelector('[data-sidebar-right-guide]');
  return {
    editing: guide.dataset.sncEditing,
    order: [...guide.children].filter(el => el.querySelector('button')).map(el => {
      const kind = el.querySelector('[data-sidebar-right-guide-entry]')?.dataset.sidebarRightGuideEntry;
      return kind ? 'kind:' + kind : 'action:more';
    }),
    visible: [...guide.querySelectorAll('[data-sidebar-right-guide-entry]')]
      .filter(el => getComputedStyle(el.parentElement).display !== 'none').map(el => el.dataset.sidebarRightGuideEntry),
    boxes: guide.querySelectorAll('[data-snc-right-check]').length,
    stored: JSON.parse(localStorage.getItem('dsh-sidebar-nav-collapse:state')),
  };
});
assert.equal((await read()).boxes, 0);
assert.deepEqual((await read()).visible, ['files', 'terminal', 'git', 'browser']);
await pressGear({ label: 'edit extension display order' });
assert.equal((await read()).boxes, 5);
await page.evaluate(() => {
  window.__terminalClicks = 0;
  for (const button of document.querySelectorAll('.terminal_main, .terminal_trigger')) {
    button.addEventListener('click', () => { window.__terminalClicks += 1; });
  }
});
await page.click('.terminal_main', { label: 'hide composite terminal entry' });
assert.deepEqual((await read()).stored.right, ['kind:terminal']);
await page.click('.terminal_trigger', { label: 'restore composite terminal entry' });
assert.deepEqual((await read()).stored.right, []);
assert.equal(await page.evaluate(() => window.__terminalClicks), 0);
await page.click(unit('browser') + ' input', { label: 'hide browser entry' });
await page.click(guide + ' > [class*="moreAnchor"] > button[aria-haspopup="menu"]', { label: 'hide more tools entry' });
assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-sidebar-right-guide-entry="browser"]').parentElement).opacity), '0.45');
await page.click(unit('git') + ' [data-snc-move="-1"]', { label: 'move Git entry up' });
await page.click(unit('git') + ' [data-snc-move="-1"]', { label: 'move Git entry first' });
await page.waitForFunction(() => document.querySelectorAll('[data-snc-flipping="true"]').length === 0);

const drag = await page.evaluate(() => {
  const row = (kind) => document.querySelector('[data-sidebar-right-guide-entry="' + kind + '"]').parentElement;
  const from = row('terminal').querySelector('.snc-drag').getBoundingClientRect();
  const to = row('files').getBoundingClientRect();
  return { x: from.left + from.width / 2, y: from.top + from.height / 2, toX: to.left + to.width / 2, toY: to.top + 3 };
});
await page.mouse.move(drag.x, drag.y, { label: 'grab terminal entry handle' });
await page.mouse.down();
await page.mouse.move(drag.x, drag.y - 10, { label: 'lift terminal entry' });
await page.mouse.move(drag.toX, drag.toY, { label: 'place terminal before files' });
await page.mouse.up();
await page.waitForFunction(() => document.querySelectorAll('[data-snc-flipping="true"]').length === 0);
const order = ['kind:git', 'kind:terminal', 'kind:files', 'kind:browser', 'action:more'];
assert.deepEqual((await read()).order, order);
assert.deepEqual((await read()).stored.orderRight, order);
assert.deepEqual((await read()).stored.right, ['kind:browser', 'action:more']);
assert.deepEqual((await read()).stored.hidden, []);
assert.deepEqual((await read()).stored.views, []);
assert.equal(await page.evaluate(() => {
  const rows = [...document.querySelector('[data-sidebar-right-guide]').children]
    .filter(el => el.querySelector('button')).map(el => el.getBoundingClientRect());
  return rows.every((rect, index) => index === 0 || rect.top >= rows[index - 1].bottom);
}), true, 'settled editing cards do not overlap');
await page.mouse.move(900, 670, { label: 'inspect settled editing layout' });
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path:${JSON.stringify(editingShot)} });
await pressGear({ label: 'finish editing extension entries' });
assert.deepEqual((await read()).visible, ['git', 'terminal', 'files']);
assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-sidebar-right-guide] > [class*="moreAnchor"]')).display), 'none');
await page.mouse.move(900, 670, { label: 'inspect customized entry layout' });
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path:${JSON.stringify(customizedShot)} });
await page.reload();
await page.waitForFunction(() => window.__ready === true);
assert.deepEqual((await read()).order, order);
assert.deepEqual((await read()).visible, ['git', 'terminal', 'files']);

await pressGear({ label: 'restore hidden tool entries' });
await page.focus(unit('browser') + ' input');
await page.press(unit('browser') + ' input', 'Space');
await page.click(guide + ' > [class*="moreAnchor"] > button[aria-haspopup="menu"]', { label: 'restore more tools entry' });
assert.deepEqual((await read()).stored.right, []);
await page.focus(unit('git') + ' [data-snc-move="1"]');
await page.press(unit('git') + ' [data-snc-move="1"]', 'Enter');
assert.equal((await read()).order[1], 'kind:git');
assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-snc-move')), '1');
await page.keyboard.press('Enter');
assert.equal((await read()).order[2], 'kind:git', 'keyboard can move again without refocusing');
await page.evaluate(() => {
  document.querySelector('.right').style.width = '260px';
  document.documentElement.style.setProperty('--dsw-alias-bg-base', '#15161a');
  document.documentElement.style.setProperty('--dsw-alias-label-primary', '#f5f6f8');
  document.documentElement.style.setProperty('--dsw-alias-label-secondary', '#b7bbc4');
  document.documentElement.style.setProperty('--dsw-alias-label-tertiary', '#a2a7af');
  document.documentElement.style.setProperty('--dsw-alias-border-l1', '#ffffff2a');
  document.querySelector('.right').style.background = '#15161a';
});
await page.cdp('Emulation.setEmulatedMedia', { features: [
  { name: 'prefers-reduced-motion', value: 'reduce' },
  { name: 'prefers-contrast', value: 'more' },
  { name: 'prefers-reduced-transparency', value: 'reduce' },
] });
assert.equal(await page.evaluate(() => [...document.querySelector('[data-sidebar-right-guide]').children]
  .filter(el => el.querySelector('button')).every(el => el.scrollWidth <= el.clientWidth)), true, 'narrow editing rows fit');
await page.evaluate(() => { for (const dispose of context.disposers.splice(0).reverse()) dispose(); });
assert.equal(await page.evaluate(() => document.querySelector('[data-sidebar-right-guide]').querySelectorAll('.snc-ctl, [data-snc-hidden]').length), 0);
console.log('PASS: default/edit/drag/buttons/reload/keyboard/narrow/dark/teardown');
console.log(${JSON.stringify(editingShot)});
console.log(${JSON.stringify(customizedShot)});
await task.finish({ keep: [] });
`;

try {
  const output = await new Promise((resolve, reject) => {
    const child = execFile('ego-browser', ['nodejs'], { timeout: 90_000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) { error.message += '\n' + stdout + stderr; reject(error); }
      else resolve(stdout + stderr);
    });
    child.stdin.end(script);
  });
  process.stdout.write(output);
} finally {
  server.close();
}
