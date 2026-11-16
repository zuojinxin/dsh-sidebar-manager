/* Ad-hoc robustness probe for the record reader: every shape a stored record
   can arrive in, including ones no version of this plugin ever wrote. Not part
   of `node --test` (it asserts nothing); run it when the schema changes.
   node test/fuzz-state.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const { JSDOM } = require_(process.env.SNC_JSDOM || 'jsdom');
const path = fileURLToPath(new URL('../lib/client.js', import.meta.url));
const KEY = 'dsh-sidebar-nav-collapse:state';
const code = fs.readFileSync(path, 'utf8');

const HTML = '<!doctype html><html><body>' +
  '<nav class="p panelList" aria-label="全局面板">' +
  '<button class="p panelRow" aria-label="插件">x</button>' +
  '<button class="p panelRow" aria-label="任务看板">y</button>' +
  '</nav></body></html>';

const cases = [
  ['v3 完整', { v: 3, folded: false, hidden: ['插件'], views: [], actions: [], order: [], orderViews: [], pins: ['任务看板'] }],
  ['v3 缺 pins', { v: 3, folded: false, hidden: [], views: [], actions: [], order: [], orderViews: [] }],
  ['v2 旧记录', { v: 2, folded: true, hidden: [], views: [], actions: [], order: [], orderViews: [] }],
  ['v1 更旧', { v: 1, folded: false, hidden: ['插件'], views: [] }],
  ['pins 含脏值', { v: 3, folded: false, hidden: [], views: [], actions: [], order: [], orderViews: [], pins: [1, null, '任务看板', {}] }],
  ['pins 非数组', { v: 3, folded: false, hidden: [], views: [], actions: [], order: [], orderViews: [], pins: 'oops' }],
  ['pins 为 null', { v: 3, folded: false, hidden: [], views: [], actions: [], order: [], orderViews: [], pins: null }],
  ['pins 指向不存在的行', { v: 3, folded: false, hidden: [], views: [], actions: [], order: [], orderViews: [], pins: ['早已卸载'] }],
  ['未来版本 v99', { v: 99, folded: true, hidden: ['插件'], views: [], pins: ['任务看板'] }],
  ['全是垃圾', { folded: 'yes', hidden: 'no', pins: 42 }],
  ['空对象', {}],
  ['null', null],
];

let bad = 0;
for (const [name, record] of cases) {
  const dom = new JSDOM(HTML, { url: 'http://localhost/' });
  const doc = dom.window.document;
  if (record !== null) dom.window.localStorage.setItem(KEY, JSON.stringify(record));
  let bundle;
  try {
    vm.runInNewContext(code, {
      window: Object.assign(dom.window, { __ModuleLoader__: { load: (v) => { bundle = v; } } }),
      document: doc,
      MutationObserver: dom.window.MutationObserver,
    });
    const client = bundle.factory(() => { throw Error('unexpected dependency'); });
    const disposers = [];
    client.apply({ effect: (fn) => { disposers.push(fn()); } });
    const out = JSON.parse(dom.window.localStorage.getItem(KEY));
    /* every surviving record is the current schema with every list an array */
    const ok = out.v === 3
      && Array.isArray(out.pins) && Array.isArray(out.hidden)
      && Array.isArray(out.views) && Array.isArray(out.actions)
      && Array.isArray(out.order) && Array.isArray(out.orderViews)
      && out.pins.every((v) => typeof v === 'string');
    const row = doc.querySelector('.snc-group');
    console.log(`${ok && row ? 'OK  ' : 'FAIL'} ${name.padEnd(20)} v=${out.v} pins=${JSON.stringify(out.pins)} row=${row ? 'yes' : 'no'}`);
    if (!ok || !row) bad += 1;
    disposers.reverse().forEach((fn) => fn());
  } catch (error) {
    bad += 1;
    console.log(`THROW ${name.padEnd(20)} ${error.message}`);
  }
}
console.log(bad === 0 ? '\nall shapes survived' : `\n${bad} shape(s) failed`);
process.exitCode = bad === 0 ? 0 : 1;
