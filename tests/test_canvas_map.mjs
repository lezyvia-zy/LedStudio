/* ============================================================================
 * 画布映射：屏幕上看到的灯点，点下去必须选中它自己。
 *
 * 为什么单开一个文件：别的测试用的假 DOM 里 `cv.clientWidth` 恒 1200、`cv.width` 也恒 1200、
 * `devicePixelRatio` 恒 1 —— 三者永远一致，于是「位图与 CSS 盒子/dpr 不同步」这类 bug
 * 在那些测试里**根本不可能被看见**（浏览器会把位图拉伸到 CSS 盒子上显示，命中测试却按
 * CSS px 算，两边一错开整块画布就按比例偏：点灯点到旁边那颗、形状手柄抓不住）。
 *
 * 这里把浏览器的显示模型照搬进来：
 *   · 位图 = cv.width/height（脚本自己设，跟真浏览器一样）
 *   · CSS 盒子 = clientWidth/clientHeight + getBoundingClientRect()
 *   · 显示位置 = rect 左上 + 位图坐标 x (rect 尺寸 / 位图尺寸)   ← 拉伸就发生在这里
 * 再用**记录型 2D 上下文**抓住 render() 真正用的变换与每一次 arc，
 * 于是「某个灯点被画在屏幕的哪一点」是算出来的、不是猜的 —— 点那儿，看选中谁。
 * ==========================================================================*/
import fs from 'node:fs';
const html = fs.readFileSync('led_layout_editor.html', 'utf8');
const coreSrc = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
const uiSrc = html.match(/<script id="ui">([\s\S]*?)<\/script>/)[1];
const CORE = new Function(coreSrc + '\n; return CORE;')();
const CELL = 40;

let fails = 0;
const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fails++; };

const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const dynIds = new Set([...uiSrc.matchAll(/\.id\s*=\s*'([^']+)'/g)].map(m => m[1]));

/* ---------- 画布模型（真浏览器里这三样各自独立） ---------- */
const cvBox = { w: 1200, h: 900, left: 24, top: 12 };   /* CSS 盒子（非 0 的 left/top 顺便验证减法没漏） */
const cvAttr = { w: 300, h: 150 };                      /* canvas 元素上的 width/height = 位图 */
let dpr = 1;
const roList = [];                                      /* ResizeObserver 实例（手动触发 = 浏览器的一次回调） */
const mmList = [];                                      /* matchMedia 查询（dpr 监听） */

/* ---------- 记录型 2D 上下文 ---------- */
function mkCtx() {
  const st = { m: [1, 0, 0, 1, 0, 0] }, stack = [];
  const api = {
    arcs: [], rects: [], texts: [], transforms: [],
    setTransform(a, b, c, d, e, f) {
      st.m = (a && a.length === 6) ? a.slice() : [a, b, c, d, e, f];
      this.transforms.push(st.m.slice());
    },
    save() { stack.push(st.m.slice()); },
    restore() { if (stack.length) st.m = stack.pop(); },
    translate(x, y) { const m = st.m; st.m = [m[0], m[1], m[2], m[3], m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; },
    scale(x, y) { st.m = [st.m[0] * x, st.m[1] * y, st.m[2] * x, st.m[3] * y, st.m[4], st.m[5]]; },
    arc(x, y, r) { this.arcs.push({ x, y, r, m: st.m.slice() }); },
    fillRect(x, y, w, h) { this.rects.push({ x, y, w, h, m: st.m.slice() }); },
    fillText(t, x, y) { this.texts.push({ t: String(t), x, y, m: st.m.slice() }); },
    measureText(t) { return { width: String(t).length * 6 }; },
    createLinearGradient() { return { addColorStop() { } }; },
    getImageData() { return { data: new Uint8ClampedArray(4), width: 1, height: 1 }; },
    _m() { return st.m; },
  };
  return new Proxy(api, {
    get: (t, k) => (k in t ? t[k] : (k === 'then' ? undefined : (t[k] = () => { }))),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}
const CTX = mkCtx();


/* ---------- 假 DOM ---------- */
const listeners = {};
const byId = new Map();
const boxCache = new Map();
const store = new Map();
function mkEl(tag = 'div', id = '') {
  const el = {
    tagName: (tag || 'div').toUpperCase(), id, style: {}, dataset: {}, checked: false,
    get value() { return this._v === undefined ? '' : this._v; },
    set value(v) { this._v = String(v); },
    textContent: '', placeholder: '', disabled: false, files: [], children: [],
    get innerHTML() { return this._html || ''; },
    set innerHTML(v) { this._html = v; },
    get className() { return this._cn !== undefined ? this._cn : [...this.classList._s].join(' '); },
    set className(v) { this._cn = v; this.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); },
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, f) { f === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (f ? this._s.add(c) : this._s.delete(c)); },
      contains(c) { return this._s.has(c); } },
    appendChild(c) { if (c && c.id) byId.set(c.id, c); this.children.push(c); return c; },
    insertBefore(c) { if (c && c.id) byId.set(c.id, c); this.children.unshift(c); return c; },
    get firstChild() { return this.children[0] || null; },
    remove() { }, focus() { }, select() { }, click() { if (this.onclick) this.onclick(); },
    setAttribute(k, v) { if (!this.attrs) this.attrs = {}; this.attrs[k] = v; },
    getAttribute(k) { return (this.attrs || {})[k] || null; },
    setPointerCapture() { }, releasePointerCapture() { },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1200, height: 900 }; },
    addEventListener(t, f) { (listeners[id + ':' + t] ||= []).push(f); },
    getContext() { return CTX; },
    toBlob(cb) { cb({}); },
    set src(v) { this._src = v; }, get src() { return this._src; },
    set width(v) { cvAttr.w = v; }, get width() { return cvAttr.w; },
    set height(v) { cvAttr.h = v; }, get height() { return cvAttr.h; },
  };
  if (id === 'cv') {
    Object.defineProperty(el, 'clientWidth', { get: () => cvBox.w });
    Object.defineProperty(el, 'clientHeight', { get: () => cvBox.h });
    el.getBoundingClientRect = () => ({ left: cvBox.left, top: cvBox.top, width: cvBox.w, height: cvBox.h });
  } else {
    Object.defineProperty(el, 'clientWidth', { get: () => 1200 });
    Object.defineProperty(el, 'clientHeight', { get: () => 900 });
  }
  return el;
}

globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, v); },
  removeItem: k => store.delete(k),
};
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => { };
globalThis.Image = class { set src(v) { this._s = v; if (this.onload) setTimeout(() => this.onload(), 0); } get src() { return this._s; } };
globalThis.FileReader = class { readAsText() { } readAsDataURL() { this.result = 'data:image/png;base64,x'; if (this.onload) this.onload(); } };
globalThis.Blob = class { }; globalThis.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() { } };
try { Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: () => Promise.resolve() } }, configurable: true }); } catch (e) { }
globalThis.alert = () => { };
globalThis.confirm = () => true;
globalThis.prompt = (m, d) => d || 'X';
globalThis.ResizeObserver = class {
  constructor(cb) { this.cb = cb; roList.push(this); }
  observe(el) { this.el = el; }
  disconnect() { }
};
globalThis.matchMedia = qq => {
  const o = { media: qq, matches: true, addEventListener(t, f) { this._f = f; }, addListener(f) { this._f = f; }, removeEventListener() { } };
  mmList.push(o);
  return o;
};

function q(sel) {
  if (sel.startsWith('#')) {
    const id = sel.slice(1);
    if (byId.has(id)) return byId.get(id);
    if (!ids.has(id) && !dynIds.has(id)) return null;
    byId.set(id, mkEl('div', id)); return byId.get(id);
  }
  if (sel === 'body') { if (!byId.has('body')) byId.set('body', mkEl('body', 'body')); return byId.get('body'); }
  return mkEl('div', '');
}
const staticBoxes = {
  '#tabs button': [...html.matchAll(/data-tab="([a-z]+)"/g)].map(m => m[1]),
  '#left button[data-mode]': [],
  '.pane': [...html.matchAll(/data-pane="([a-z]+)"/g)].map(m => m[1]),
  '#shGallery button': ['rect', 'rrect', 'circle', 'poly', 'line'],
};
globalThis.document = {
  documentElement: { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] || null; } },
  querySelector: q,
  querySelectorAll(sel) {
    if (sel === '#left button[data-mode]') return (byId.get('left')?.children || []);
    if (staticBoxes[sel]) {
      if (!boxCache.has(sel))
        boxCache.set(sel, staticBoxes[sel].map(v => { const e = mkEl('button');
          e.dataset = (sel === '#shGallery button') ? { kind: v } : { tab: v, pane: v, mode: v }; return e; }));
      return boxCache.get(sel);
    }
    return [];
  },
  createElement: t => mkEl(t, ''),
  body: { appendChild() { } },
  addEventListener() { },
  execCommand() { return true; },
};
globalThis.window = {
  addEventListener(t, f) { (listeners['window:' + t] ||= []).push(f); },
  get devicePixelRatio() { return dpr; },
  requestAnimationFrame: globalThis.requestAnimationFrame,
  innerWidth: 1400, innerHeight: 900,
};

/* ---------- 开跑界面层脚本（存档里放好一个 SP-3122D 预设项目） ---------- */
const P0 = CORE.projectFromPreset(CORE.PRESET_SP3122D);
store.set('led_layout_editor.v1', JSON.stringify({ version: 1, current: 'p0',
  projects: [{ id: 'p0', name: P0.meta.name, state: P0 }] }));
let bootErr = null;
try { new Function(coreSrc + '\n' + uiSrc)(); } catch (e) { bootErr = e; }
ok(!bootErr, bootErr ? ('界面层启动就报错了: ' + bootErr.message) : '界面层正常启动（104 颗 / 5 个形状的预设项目）');

const curSt  = () => JSON.parse(store.get('led_layout_editor.v1')).projects[0].state;
const shapes = () => curSt().shapes || [];
const led    = n => curSt().leds.find(l => l.n === n);
const modeOn = m => ((byId.get('left').children || []).find(b => b.dataset.mode === m) || {}).classList;
const selTxt = () => (byId.get('selInfo') || {}).textContent;
const statTxt = () => (byId.get('status') || {}).textContent;
const pd = e => (listeners['cv:pointerdown'] || [])[0](Object.assign({ pointerId: 1, button: 0 }, e));
const pm = (x, y) => (listeners['cv:pointermove'] || [])[0]({ clientX: x, clientY: y });
const pu = () => (listeners['cv:pointerup'] || [])[0]({});
const dbl = e => (listeners['cv:dblclick'] || [])[0](e);
const wheel = (x, y, dy) => (listeners['cv:wheel'] || [])[0]({ clientX: x, clientY: y, deltaY: dy, preventDefault() { } });
const esc = () => (listeners['window:keydown'] || [])[0]({ key: 'Escape', target: { tagName: 'DIV' }, preventDefault() { } });
const wait = (ms = 700) => new Promise(r => setTimeout(r, ms));
const fireRO = () => { for (const ro of roList) ro.cb([{ target: ro.el }], ro); };

/* 位图坐标 → 屏幕（客户端）坐标：浏览器就是把位图拉伸到 CSS 盒子上显示的 */
const toClient = (dx, dy) => [cvBox.left + dx * (cvBox.w / cvAttr.w), cvBox.top + dy * (cvBox.h / cvAttr.h)];

/* 某个灯点被画在位图的哪一点：找 render() 里画它那个 arc 用的变换 */
function drawnDot(n) {
  const l = led(n);
  if (!l) return null;
  const hit = CTX.arcs.filter(a => Math.abs(a.x - l.x) < 1e-6 && Math.abs(a.y - l.y) < 1e-6
                               && Math.abs(a.r - CELL * 0.35) < 0.5);
  if (!hit.length) return null;
  const m = hit[hit.length - 1].m;                       /* 最后一帧里它画在哪 */
  return { m, dev: [m[0] * l.x + m[2] * l.y + m[4], m[1] * l.x + m[3] * l.y + m[5]] };
}
/* render() 最后一帧用的世界变换：[a,b,c,d,e,f]（a=dpr*zoom，e/f=dpr*pan） */
const ctxM = () => CTX.transforms[CTX.transforms.length - 1] || [1, 0, 0, 1, 0, 0];
/* 世界坐标 → 客户端坐标（按最后一帧的变换） */
function worldToClient(x, y) {
  const m = ctxM();
  return toClient(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]);
}
const appZoom = () => ctxM()[0] / dpr;

function clickLed(n) {
  const d = drawnDot(n);
  if (!d) return false;
  const c = toClient(d.dev[0], d.dev[1]);
  pd({ clientX: c[0], clientY: c[1] }); pu();
  return true;
}
function dragLed(n, dxScreen, dyScreen) {
  const d = drawnDot(n);
  const a = toClient(d.dev[0], d.dev[1]);
  pd({ clientX: a[0], clientY: a[1] });
  pm(a[0] + dxScreen, a[1] + dyScreen);
  pu();
}
function dragClient(a, b) {
  pd({ clientX: a[0], clientY: a[1] });
  pm(b[0], b[1]);
  pu();
}

/* ---------- ① 基线：点屏幕上的灯点 = 选中那颗灯 ---------- */
console.log('\n--- ① 基线（CSS 盒子 1200x900 · dpr 1）---');
console.log(`  位图 ${cvAttr.w}x${cvAttr.h} · CSS 盒子 ${cvBox.w}x${cvBox.h} · dpr ${dpr} · zoom ${appZoom().toFixed(3)}`);
ok(roList.length === 1 && roList[0].el && roList[0].el.id === 'cv',
   `boot 时挂了 ResizeObserver 在画布上（${roList.length} 个实例）`);
ok(mmList.length >= 1, `boot 时按当前 dpr 登记了 matchMedia 监听（${mmList.map(o => o.media).join(', ')}）`);

const probeLeds = [0, 36, 103];
let baseOK = true;
for (const n of probeLeds) {
  pd({ clientX: 0, clientY: 0 });                       /* 先点一下空白，清掉上一次的选择 */
  const d = drawnDot(n), l = led(n);
  const c = d ? toClient(d.dev[0], d.dev[1]) : null;
  const clicked = clickLed(n);
  const got = selTxt();
  const hitOk = clicked && got === `已选 1 颗：${n}`;
  if (!hitOk) baseOK = false;
  console.log(`  · #${n} @ 世界 ${l.x},${l.y} → 画在客户端 ${c ? Math.round(c[0]) + ',' + Math.round(c[1]) : '?'}`
    + ` → 点下去选中「${got}」`);
}
ok(baseOK, '屏幕上每颗灯的圆点，点它自己就选中它自己（#0 / #36 / #103 各一次）');

/* ---------- ② 布局变了但没走 window.resize：ResizeObserver 一到就重算位图 ---------- */
console.log('\n--- ② CSS 盒子变了（右栏变宽 / 面板高低变化 / 滚动条）---');
cvBox.w = 960; cvBox.h = 700;
{
  /* 先证明「不重算」真的会偏：位图还是 1200x900 时，浏览器把它拉伸到 960x700 显示，
   * 屏幕上的那个点喂回命中测试就会落在别处 —— 这就是「点灯有偏差」。 */
  const l = led(36), d = drawnDot(36);
  const c = toClient(d.dev[0], d.dev[1]);
  const m = ctxM();
  const appW = ((c[0] - cvBox.left) - m[4]) / m[0];
  ok(Math.abs(appW - l.x) > 20,
     `位图没跟着重算时会偏 ${Math.round(Math.abs(appW - l.x))} 世界 px（命中测试按 CSS px 算，显示却被拉伸）`);
}
fireRO();
ok(cvAttr.w === 960 && cvAttr.h === 700,
   `ResizeObserver 回调一到，位图就重算成新的 CSS 盒子（${cvAttr.w}x${cvAttr.h}）`);
let ok33 = true;
for (const n of [0, 36, 103]) if (!clickLed(n) || selTxt() !== `已选 1 颗：${n}`) { ok33 = false; console.log(`  · #${n} 点下去是「${selTxt()}」`); }
ok(ok33, '缩过的画布上点灯仍然选中它自己（布局变了也不会偏）');

/* ---------- ③ 没装 ResizeObserver 的浏览器：任何一次重画都能自愈 ---------- */
console.log('\n--- ③ 只来一次 render（没有 ResizeObserver 兜底）---');
cvBox.w = 1100; cvBox.h = 800;
wheel(cvBox.left + 10, cvBox.top + 10, 0);        /* deltaY=0：缩放不变，但会走一次 render */
ok(cvAttr.w === 1100 && cvAttr.h === 800,
   `任何一次重画都会先对账、把位图补成 ${cvAttr.w}x${cvAttr.h}（render 里自愈）`);
ok(clickLed(36) && selTxt() === '已选 1 颗：36', `自愈之后点灯仍然准（「${selTxt()}」）`);

/* ---------- ④ dpr 变了（窗口挪到 150% 缩放的那块屏 / 浏览器缩放） ---------- */
console.log('\n--- ④ devicePixelRatio 1 → 1.5 ---');
dpr = 1.5;
const mq0 = mmList[mmList.length - 1];            /* 还是「(resolution: 1dppx)」那个查询 */
if (mq0 && mq0._f) mq0._f();                      /* 真浏览器：dpr 一变它就不再匹配 → change 事件 */
ok(cvAttr.w === Math.round(1100 * 1.5) && cvAttr.h === Math.round(800 * 1.5),
   `位图跟着 dpr 放大到 ${cvAttr.w}x${cvAttr.h}（CSS 盒子仍是 ${cvBox.w}x${cvBox.h}）`);
let okDpr = true;
for (const n of [0, 36, 103]) if (!clickLed(n) || selTxt() !== `已选 1 颗：${n}`) { okDpr = false; console.log(`  · #${n} 点下去是「${selTxt()}」`); }
ok(okDpr, 'dpr 变了以后点灯依旧选中它自己');
ok(mmList[mmList.length - 1].media === '(resolution: 1.5dppx)',
   `dpr 变了会按新值重新登记监听（现在是 ${mmList[mmList.length - 1].media}）`);
dpr = 1;
cvBox.w = 1200; cvBox.h = 900;                     /* 收尾：回到初始尺寸 */
fireRO();
ok(clickLed(103) && selTxt() === '已选 1 颗：103', `尺寸换回来以后点灯仍然准（「${selTxt()}」）`);

/* ---------- ⑤ 手柄：只在「画形状」编辑态画，抓一下就直接改大小 ---------- */
console.log('\n--- ⑤ 成形的手柄：编辑态按下去就直接改大小 ---');
const shBoxOf = i => CORE.SHAPE.boxOf(curSt().shapes[i]);
/* 面板下拉挑形状要**派发 onchange**：应用里的 selShape 是跟着 change 事件走的，
 * 只改 .value 不会同步（那会变成「点的是 A、动的是 B」这种测试自己制造的怪事）。 */
const pickShape = i => { const s = byId.get('shList'); s.value = String(i); s.onchange({ target: s }); };
{
  pickShape(2);
  ok((modeOn('shape') || {}).contains('on') && byId.get('shList').value === '2',
     '面板「形状」下拉挑 2 号 = 选中它并进编辑态（手柄出来了）');

  const b0 = shBoxOf(2);
  const hE = worldToClient(b0.x1, (b0.y0 + b0.y1) / 2);    /* 右边中间那个手柄，屏幕上它在哪 */
  dragClient(hE, [hE[0] + 70, hE[1]]);                     /* 抓住往外拖 70 屏幕 px */
  await wait();
  const b1 = shBoxOf(2);
  ok(b1.x1 > b0.x1 + 20 && Math.abs(b1.x0 - b0.x0) < 1,
     `按住手柄拖一下就把形状改宽了（${Math.round(b0.x1 - b0.x0)} → ${Math.round(b1.x1 - b1.x0)} 世界 px；左边没动）`);
  esc();
  ok(!(modeOn('shape') || {}).contains('on'), 'Esc 释放编辑态（回到选择/编辑）');
}

/* ---------- ⑥ 瞄着手柄按下去、手差一点：仍然算「改大小」，不许整块挪走 ---------- */
console.log('\n--- ⑥ 手柄外那一圈（1.6 倍容差）---');
{
  pickShape(2);
  ok((modeOn('shape') || {}).contains('on'), '选形状后进编辑态（手柄出来）');
  const b0 = shBoxOf(2);
  const zoom = appZoom();
  const offW = 15 / zoom;                                  /* 15 屏幕 px 的偏移：在手柄外、但还在缓冲圈里 */
  const p = worldToClient(b0.x1 + offW, (b0.y0 + b0.y1) / 2);
  dragClient(p, [p[0] + 60, p[1]]);
  await wait();
  const b1 = shBoxOf(2);
  ok(Math.abs(b1.x0 - b0.x0) < 1 && Math.abs(b1.y0 - b0.y0) < 1 && b1.x1 > b0.x1 + 10,
     `按在手柄外一圈仍然是「改大小」（右边 ${Math.round(b0.x1)} → ${Math.round(b1.x1)}，左上角没跟着跑）`);
  esc();
}

/* ---------- ⑥b 只有「画出来的」手柄才允许抢按下：手柄只属于「画形状」编辑态 ---------- */
console.log('\n--- ⑥b 看不见的手柄不存在（编辑态之外一个都不画）---');
{
  const modeBtn = m => (byId.get('left').children || []).find(b => b.dataset.mode === m);
  const lastFrame = () => { CTX.rects.length = 0; fireRO(); return CTX.rects.slice(); };
  /* 手柄小方块 = fillRect(角点 - s, 2s, 2s)，s = 4 / zoom（世界 px）；找角上那 4 个就够 */
  const hasHandle = (b) => {
    const s = 4 / appZoom();
    return lastFrame().some(r => Math.abs(r.w - s * 2) < 1e-6 && Math.abs(r.h - s * 2) < 1e-6
      && [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]
           .some(([hx, hy]) => Math.abs(r.x - (hx - s)) < 1e-6 && Math.abs(r.y - (hy - s)) < 1e-6));
  };
  pickShape(2);
  const b = shBoxOf(2);
  ok(hasHandle(b), '编辑态：8 个手柄画着（看得见，所以抓得住）');
  esc();
  ok(modeOn('select').contains('on') && !hasHandle(b),
     'Esc 回选择/编辑：手柄不再画 —— 铺灯时不会再被那 8 个蓝方块抢走点击（用户第五轮实测）');

  /* 选择模式按住「原来那个手柄的位置」（形状边上）：那一下不再算改大小，而是整块挪动 ——
   * 没画出来的手柄不抢点击，这正是用户抱怨的「铺灯时很容易变成边形状」。 */
  const p = worldToClient(b.x1 - 1 / appZoom(), (b.y0 + b.y1) / 2);
  dragClient(p, [p[0] + 60, p[1]]);
  await wait();
  const b2 = shBoxOf(2);
  ok(modeOn('shape').contains('on'), '按住形状边 → 进编辑态（一次手势到位，不用先点中再抓）');
  ok(Math.abs((b2.x1 - b2.x0) - (b.x1 - b.x0)) < 1 && b2.x0 > b.x0 + 10,
     `那一下算「挪动整块形状」而不是改大小（宽 ${Math.round(b.x1 - b.x0)} → ${Math.round(b2.x1 - b2.x0)}）`);

  modeBtn('place').onclick();
  ok(modeOn('place').contains('on') && !hasHandle(shBoxOf(2)), '切到「放置编号」：手柄不画（画不出来就不许抢按下）');
  modeBtn('erase').onclick();
  ok(modeOn('erase').contains('on') && !hasHandle(shBoxOf(2)), '切到「擦除」同样不画手柄');
  modeBtn('select').onclick();
  ok(!hasHandle(shBoxOf(2)), '切回选择/编辑也不画（手柄只属于「画形状」编辑态）');
  byId.get('shEdit').onclick();
  ok(modeOn('shape').contains('on') && hasHandle(shBoxOf(2)),
     '点面板「编辑」进编辑态：手柄回来（一次手势就能改大小）');
  esc();
}

/* ---------- ⑥c 定头尾（用户第六轮实测）：只改选中分区的编号 · 编号先藏 · 可再点一次取消 ---------- */
console.log('\n--- ⑥c 在画布上定头尾：针对选中的分区、编号先藏后亮、点两次按钮能退出 ---');
{
  const zRows = () => (byId.get('zoneTbl') || {}).children || [];
  /* 分区表每渲染一次就往后追加一批行（假 DOM 的 appendChild 只往后推），只有最后一批指向当前 state */
  const zoneRow = i => { const r = zRows(), n = curSt().zones.length; return r[r.length - n + i]; };
  const zoneAt  = i => curSt().zones[i];
  const shOfZone = id => shapes().findIndex(s => s.zone === id);
  const zone2 = () => { const sh = shapes()[2]; return curSt().zones.find(k => k.id === sh.zone); };
  const zoneLeds = () => { const z = zone2(); return curSt().leds.filter(l => l.n >= z.start && l.n < z.start + z.count); };
  const chk = (id, cls) => { const el = byId.get(id); return !!(el && el.classList && el.classList.contains(cls || 'on')); };
  const btnTxt = id => (byId.get(id) || {}).textContent;
  const every = () => { CTX.texts.length = 0; fireRO(); return CTX.texts.slice(); };
  /* 「头 N」是几号 / 离点击点最近的那一颗灯（定头尾的「头」应该正好在它上面） */
  const headNumOf = sh => (CORE.SHAPE.plan(sh, CELL).pts[0] || {}).n;
  const ledNear = (x, y) => zoneLeds().map(l => ({ l, d: Math.hypot(l.x - x, l.y - y) }))
                                    .sort((a, b) => a.d - b.d)[0];
  /* 状态栏里那份「尾落在哪儿」的说法：第 2 下只定方向、不把「尾」定在点的那一颗上 ——
   * 用户第九轮的原话「我理解的是第二次点击的『尾』指的是最末尾的编号应该在的位置」，
   * 所以状态栏必须点名「尾」是第几颗；点的那一颗不是尾时还得说清「你点的那一颗是第几颗」。 */
  const tailSaid = (txt, tailN, clkN) =>
    (new RegExp('「尾」（第 ' + tailN + ' 颗）').test(txt) || /「尾」正好就是你点的那一颗/.test(txt)) &&
    (clkN === tailN || new RegExp('你点的那一颗是第 ' + clkN + ' 颗').test(txt));
  /* 画布上那行「① 点头 / ② 点方向」提示画在客户端的哪儿（世界坐标按最后一帧的变换换算） */
  const bannerPos = () => {
    const o = every().find(o => /^[①②] /.test(o.t));   /* 措辞会变，只认开头的圈码 */
    if (!o) return null;
    const m = o.m;
    return toClient(m[0] * o.x + m[2] * o.y + m[4], m[1] * o.x + m[3] * o.y + m[5]);
  };
  /* 编号文字 = render 里画在灯点上的那串纯数字（HUD 的「彩灯编号」是开着的） */
  const numLabels = () => every().filter(o => /^\d+$/.test(o.t)).length;
  /* 手柄小方块 = fillRect(角点 - s, 2s, 2s)，s = 4 / zoom */
  const anyHandle = () => {
    CTX.rects.length = 0; fireRO();
    const s = 4 / appZoom();
    return CTX.rects.some(r => Math.abs(r.w - s * 2) < 1e-6 && Math.abs(r.h - s * 2) < 1e-6);
  };

  const zi = curSt().zones.findIndex(z => z.id === (shapes()[2] || {}).zone);
  pickShape(2);                                   /* 面板下拉挑 2 号 → 进「画形状」编辑态 */
  zoneRow(zi).onclick();                          /* 分区表里点中它 = 定头尾针对的那个分区 */
  ok(modeOn('shape').contains('on') && shapes()[2].laid === true,
     `2 号形状归属「${zoneAt(zi).name}」而且已经铺过灯（下面看它「点一下头就当场重排」）`);
  const before = zoneLeds().map(l => [l.n, Math.round(l.x), Math.round(l.y)]);

  byId.get('shPick').onclick();
  ok(chk('shPick'), '点「在画布上定头尾」→ 按钮点亮（正在等第 1 下：点头）');
  ok(btnTxt('shPick') === '取消定头尾', '按钮当场改口叫「取消定头尾」（再点一次就能退出 —— 用户第六轮第 2 条）');
  ok(modeOn('select').contains('on') && !modeOn('shape').contains('on'),
     '左侧栏没有被切成「画形状」（定头尾只改编号，不是形状编辑 —— 第 2 条）');
  ok(!anyHandle(), '编辑态那 8 个方块也没跟出来（点着头尾不会抓到手柄）');
  ok(!chk('shApply', 'pri'), '「铺到灯位」的蓝灯已经灭了（这个形状早就铺下去了）');
  {
    const tx = every();
    const banner = new RegExp('点一下定「' + zoneAt(zi).name + '」的「头」');
    ok(tx.some(o => banner.test(o.t)), '画布上的提示写了这一步干嘛、改的是哪个分区');
    ok(tx.length && banner.test(tx[tx.length - 1].t),
       '提示框是**最后画**的（压在所有灯与手柄之上，不会被彩灯点 / 形状轮廓盖住 —— 第 1 条）');
    ok(numLabels() === 0, '这一步先把全板编号藏起来（满屏数字看不清该点哪儿 —— 第 3 条）');
  }
  /* 第 1 下点「头」：点路径上离现在起点够远的一个点（手柄这会儿一个都没画，点哪儿都算数） */
  const sh2 = shapes()[2];
  const arcOf = p => (CORE.SHAPE.arcNear(sh2, [p.x, p.y], 1e9) || { s: 0 }).s;
  const cand = CORE.SHAPE.plan(sh2, CELL).pts.find(p => arcOf(p) > CELL * 2);
  ok(!!cand, `在路径上找得到「离现起点 >2 格」的点（${cand ? Math.round(cand.x) + ',' + Math.round(cand.y) : '—'}）`);

  const c1 = worldToClient(cand.x, cand.y);
  pd({ clientX: c1[0], clientY: c1[1] }); pu();               /* 第 1 下：定「头」 */
  await wait();
  const sh3 = shapes()[2];
  ok(sh3.entry > CELL, `点「头」= 起点偏移挪到 ${Math.round(sh3.entry)}px（这一点就是这一段的第一号）`);
  {
    const tx = every();
    ok(tx.some(o => new RegExp('再点一下点「' + zoneAt(zi).name + '」的方向').test(o.t)),
       '画布上的提示跟着换到「② 点方向」—— 不再写「② 点尾」：那三个字让人以为「尾就定在这颗上」（用户第九轮）');
    ok(tx.some(o => /^头 \d+$/.test(o.t)), '第 1 下点完就把「头 N」亮出来了（第 3 条）');
    ok(numLabels() === 0, '但别的编号还藏着（第 2 下点完才全部回来）');
  }
  const after = zoneLeds().map(l => [l.n, Math.round(l.x), Math.round(l.y)]);
  const moved = after.filter((a, i) => before[i] && (a[1] !== before[i][1] || a[2] !== before[i][2])).length;
  ok(after.length === before.length && moved > 0,
     `第 1 下就按新起点重排了 ${moved} 颗（老写法只改 entry、灯上一动不动，要等第 2 下才变）`);
  ok(/重铺/.test(statTxt()), `状态栏照实说了发生了什么: "${statTxt()}"`);
  {
    const hl = ledNear(cand.x, cand.y);
    ok(hl.l.n === headNumOf(sh3),
       `「头 N」就标在第 1 下点的那一颗上（第 ${hl.l.n} 号，离点击点 ${hl.d.toFixed(1)}px）` +
       ' —— 老写法把弧长直接当 entry，逆时针形状整排编号会错开一颗（看着像「静默重排」）');
  }

  /* 第 2 下点「尾」：点离「头」大半圈的地方，方向应该翻成逆时针 */
  const L = CORE.SHAPE.pathLen(shapes()[2]);
  const e0 = +shapes()[2].entry || 0;
  const tp = CORE.SHAPE.plan(shapes()[2], CELL).pts.map(p => {
    const f = (((arcOf(p) - e0) % L) + L) % L;
    return { p, f };
  }).filter(o => o.f > L * 0.5 && o.f < L * 0.92).sort((a, b) => b.f - a.f).map(o => o.p)[0];
  ok(!!tp, `在路径上找得到「尾」的落点（弧长 ${tp ? Math.round((((arcOf(tp) - e0) % L) + L) % L) : '—'}/${Math.round(L)}）`);
  const c2 = worldToClient(tp.x, tp.y);
  const dir0 = shapes()[2].dir;
  pd({ clientX: c2[0], clientY: c2[1] }); pu();
  await wait();
  const sh4 = shapes()[2];
  ok(sh4.dir === 'ccw' && dir0 !== 'ccw', `点「尾」定方向：${dir0} → ${sh4.dir}（编号往短的那边走）`);
  ok(/已按新头尾重排/.test(statTxt()), `两点定完自动铺进编号: "${statTxt()}"`);
  {
    const tl = CORE.SHAPE.plan(sh4, CELL).pts.slice(-1)[0];
    const clk = ledNear(tp.x, tp.y);
    ok(tailSaid(statTxt(), tl.n, clk.l.n),
       `状态栏把「尾」落在哪儿说清楚了（尾 = 第 ${tl.n} 颗，点的那一颗 = 第 ${clk.l.n} 颗）—— ` +
       '第 2 下只定方向，用户第九轮就是以为「我点的这一颗就是尾」' + `: "${statTxt()}"`);
  }
  {
    const hl = ledNear(cand.x, cand.y);
    ok(hl.l.n === headNumOf(sh4),
       '第 2 下**只定方向**：头还停在第 1 下点的那一颗上 —— 老写法在这儿照着第 1 下的弧长重设一次 entry，' +
       '方向一翻（plan 把落点表倒过来）头就跳到旁边那颗，用户看到的「头尾正好反了」就是这么来的');
  }
  /* 再来一轮（走两遍）：第 2 下点在「头」**隔壁那一颗**上 —— 编号第 2 颗必须落在「点的那一侧」，
   * 头一步都不许动；点「顺着当前编号方向」那一颗时方向该保持，点另一侧那颗时该掉头。
   * 判定只用**用户看得见的东西**（计划落点 + 顶点顺序弧长），不镜像内部算法：
   * 这样它既能抓住「点反了」，也不管实现内部拿弧长还是格点序号比方向。 */
  const arcOfPt = (sh, p) => (CORE.SHAPE.arcNear(sh, [p.x, p.y], 1e9) || { s: 0 }).s;
  const sideOf = (sh, from, to) => {                 /* 「尾」在「头」的哪一侧（顶点顺序：0..L） */
    const L = CORE.SHAPE.pathLen(sh);
    const d = (((arcOfPt(sh, to) - arcOfPt(sh, from)) % L) + L) % L;
    return d < L / 2 ? '前' : '后';                   /* 两头一样近（≈半圈）时按「后」—— 这种点测试里不选 */
  };
  for (const wantKeep of [true, false]) {
    byId.get('shPick').onclick();                   /* 这一轮从头来：① 头 ② 隔壁那一颗 */
    const c3 = worldToClient(cand.x, cand.y);
    pd({ clientX: c3[0], clientY: c3[1] }); pu();
    await wait();
    const sh5 = shapes()[2], dir1 = sh5.dir, n5 = headNumOf(sh5), hl5 = ledNear(cand.x, cand.y);
    const pts5 = CORE.SHAPE.plan(sh5, CELL).pts;
    ok(hl5.l.n === n5 && Math.hypot(pts5[0].x - cand.x, pts5[0].y - cand.y) <= 1,
       `起点方向是「${dir1}」时，第 1 下点完头照样落在点的那一颗上（第 ${n5} 号 / 离点击点 ${hl5.d.toFixed(1)}px）`);
    const tgt = wantKeep ? pts5[1] : pts5[pts5.length - 1];   /* 顺着编号那颗 / 另一侧那颗（都贴着「头」） */
    const c4 = worldToClient(tgt.x, tgt.y);
    pd({ clientX: c4[0], clientY: c4[1] }); pu();
    await wait();
    const sh6 = shapes()[2], pts6 = CORE.SHAPE.plan(sh6, CELL).pts, hl6 = ledNear(cand.x, cand.y);
    ok(hl6.l.n === n5 && hl6.l.n === headNumOf(sh6) &&
       Math.hypot(pts6[0].x - cand.x, pts6[0].y - cand.y) <= 1,
       `头一动不动：还是第 ${n5} 号、还停在点的那一颗上（离点击点 ${hl6.d.toFixed(1)}px）`);
    ok(sideOf(sh6, pts6[0], pts6[1]) === sideOf(sh6, pts6[0], tgt),
       `编号第 2 颗落在点的「尾」同一侧（第 2 颗 @${Math.round(pts6[1].x)},${Math.round(pts6[1].y)}` +
       `，「尾」@${Math.round(tgt.x)},${Math.round(tgt.y)}）—— 用户眼里的「方向对了」`);
    ok(wantKeep ? sh6.dir === dir1 : sh6.dir !== dir1,
       `点${wantKeep ? '顺着编号方向' : '另一侧'}那颗 → 方向该${wantKeep ? '保持' : '掉头'}：${dir1} → ${sh6.dir}`);
    {
      const clk6 = ledNear(tgt.x, tgt.y), tl6 = pts6[pts6.length - 1];
      ok(tailSaid(statTxt(), tl6.n, clk6.l.n),
         `状态栏报出「尾」是第 ${tl6.n} 颗、你点的那一颗是第 ${clk6.l.n} 颗 —— ` +
         `第 2 下只定方向，谁点完都不用猜「尾怎么不在我点的那颗上」: "${statTxt()}"`);
    }
    esc();                                          /* 收尾，回干净状态 */
  }
  ok(!chk('shPick') && btnTxt('shPick') === '在画布上定头尾', '两步走完「定头尾」自己熄灭、按钮名字改回来');
  ok(numLabels() > 0, '第 2 下点完所有编号立刻回来（第 3 条）');

  /* 再点一次按钮 = 取消（第 2 条：以前点了就退不出来，只能去按 Esc） */
  const sLed = JSON.stringify(curSt().leds);
  byId.get('shPick').onclick();
  ok(chk('shPick') && btnTxt('shPick') === '取消定头尾', '再进一次定头尾（按钮亮着、写着「取消定头尾」）');
  ok(numLabels() === 0, '编号又先藏起来（每一步都一样）');
  byId.get('shPick').onclick();
  ok(!chk('shPick') && /已取消定头尾/.test(statTxt()), `再点一次这个按钮就退出了: "${statTxt()}"`);
  ok(JSON.stringify(curSt().leds) === sLed, '取消时灯位一点没动');
  ok(numLabels() > 0, '取消后编号立刻回来');

  /* 点歪了不退出（第五轮第 2 条的老承诺，这一版不能丢） */
  const bb = CORE.SHAPE.boxOf(shapes()[2]);
  byId.get('shPick').onclick();
  const far = worldToClient(bb.x0 - 400, bb.y0 - 400);
  pd({ clientX: far[0], clientY: far[1] }); pu();
  ok(chk('shPick') && /没点在「/.test(statTxt()), `点歪了只提醒一句、不退出: "${statTxt()}"`);
  esc();
  ok(!chk('shPick'), 'Esc 也能退出定头尾');

  /* 第 4 条：改的是分区表里**选中的那个分区**（换成第 1 个分区，目标就跟着换） */
  const z0 = zoneAt(0);
  /* 画布上那行提示**钉在画布窗口左上角**（不跟着形状跑）：缩一下，形状动了它也不许动。
   * 老写法把提示挂在形状上方 / 塞进形状里面，形状一挪一放大就得满屏找它。 */
  {
    byId.get('shPick').onclick();
    const b1 = bannerPos(), s1 = worldToClient(CORE.SHAPE.boxOf(shapes()[2]).x0, CORE.SHAPE.boxOf(shapes()[2]).y0);
    ok(!!b1 && Math.abs(b1[0] - (cvBox.left + 19)) <= 4 && Math.abs(b1[1] - (cvBox.top + 21)) <= 4,
       `提示框贴在画布窗口左上角（客户端 ${b1 ? Math.round(b1[0]) + ',' + Math.round(b1[1]) : '?'}，` +
       `画布左上角 ${cvBox.left},${cvBox.top}）`);
    wheel(cvBox.left + cvBox.w / 2, cvBox.top + cvBox.h / 2, -120);      /* 缩小一档：整张图的比例全变了 */
    const b2 = bannerPos(), s2 = worldToClient(CORE.SHAPE.boxOf(shapes()[2]).x0, CORE.SHAPE.boxOf(shapes()[2]).y0);
    ok(!!b2 && Math.hypot(b2[0] - b1[0], b2[1] - b1[1]) <= 1.5,
       `缩放前后提示框一动不动（差 ${Math.round(Math.hypot(b2[0] - b1[0], b2[1] - b1[1]) * 10) / 10}px）`);
    ok(Math.hypot(s2[0] - s1[0], s2[1] - s1[1]) > 5,
       `（对照）同一次缩放下形状的角落挪了 ${Math.round(Math.hypot(s2[0] - s1[0], s2[1] - s1[1]))}px —— 提示框没跟着它跑`);
    esc();
  }
  zoneRow(0).onclick();
  ok(byId.get('zName').value === z0.name, `分区表里切到第 1 个分区（${z0.name}）`);
  byId.get('shPick').onclick();
  ok(new RegExp('定「' + z0.name + '」的头尾').test(statTxt()), `状态栏说的是选中分区: "${statTxt()}"`);
  ok(byId.get('shList').value === String(shOfZone(z0.id)),
     `面板「形状」也跟着切到那个分区的形状（#shList=${byId.get('shList').value}）`);
  ok(new RegExp('点一下定「' + z0.name + '」的「头」').test(every().map(o => o.t).join(' | ')),
     '画布上的提示跟着换成分区表里选中的那个分区');
  esc();
  ok(!chk('shPick'), '（收尾）退出定头尾');
}

console.log('\n--- ⑦ 源码规矩 ---');
ok(/function canvasStale\(\)/.test(uiSrc) && /if \(canvasStale\(\)\) resizeCanvas\(\);/.test(uiSrc),
   'render() 开头会先对账：位图与 CSS 盒子/dpr 不一致就先 resizeCanvas()（自愈）');
ok(/ResizeObserver[\s\S]{0,200}?ro\.observe\(cv\)/.test(uiSrc),
   'boot 时给画布挂了 ResizeObserver（布局一变就重算位图）');
ok(/matchMedia\('\(resolution: ' \+ dpr \+ 'dppx\)'\)/.test(uiSrc),
   '按当前 dpr 登记 matchMedia，dpr 变了会重算并重新登记');
ok(/function hitTol\(\)[\s\S]{0,220}?9 \/ Math\.max\(0\.05, view\.zoom\)/.test(uiSrc),
   '命中灯的半径有「至少 9 屏幕 px」的下限（缩小时不用亚像素精度去点）');
ok(/id="shEdit"/.test(html) && /\$\('#shEdit'\)\.onclick/.test(uiSrc),
   '面板「形状」旁边有「编辑」按钮，点它直接进编辑态（铺过灯的形状点不中时的明确入口）');
ok(/if \(hit\(wx, wy\)\) return;/.test(uiSrc),
   '双击落在灯点上不进形状编辑态（连点两颗灯不该偷偷换工具）');
ok(/const handleSh = shapeCur;/.test(uiSrc),
   '手柄只在「画形状」编辑态画（没有别的分支可能把手柄留在画布上）');
ok(!/shapePicked/.test(uiSrc),
   '不再有「选过形状就一直画手柄」那套标记（手柄的去留只由编辑态决定）');
ok(/if \(mode === 'shape'\) \{\s*const hh = handleAnyAt\(wx, wy\);/.test(uiSrc),
   '按下时只认「当前形状」的手柄，而且只在「画形状」编辑态认（别的模式一个手柄都没画）');
ok(/function setMode\(m\)[\s\S]{0,1200}?render\(\);/.test(uiSrc),
   '切模式当场重画（不会留一屏过期的手柄）');
ok(/\$\('#shApply'\)[\s\S]{0,200}?classList\.toggle\('pri',/.test(uiSrc),
   '「铺到灯位」的蓝色高亮是按状态算的（有归属分区 + 还没铺过才亮），不是写死的');
ok(/\$\('#shFlip'\)[\s\S]{0,1500}?!sh\.laid && !confirmOverwrite/.test(uiSrc),
   '「反向编号」对已铺过的形状不再弹确认框（几何没动，Ctrl+Z 就够）');
ok(/function shPickStep1\(sh, s\)[\s\S]{0,400}?sh\.laid && z[\s\S]{0,200}?layShape\(sh, z\)/.test(uiSrc),
   '定头尾第 1 下（点「头」）就会按新起点重铺已铺过的形状 —— 不用等第 2 下才看出变化');

/* 定头尾（第六轮）：独立小状态 · 改选中分区的编号 · 提示最后画 · 编号先藏 · 可取消 */
ok(/function pickShape\(\)/.test(uiSrc) && /function shapeIndexOfZone\(z\)/.test(uiSrc),
   '「定头尾」有自己的一套状态与目标（pickShape / shapeIndexOfZone），不再借用「画形状」编辑态');
ok(/const pickSh   = pickShape\(\);/.test(uiSrc) && /const showLabel = showNum && view\.zoom > 0\.45 && !picking;/.test(uiSrc),
   '定头尾那两步把全板编号藏起来（render 里 showLabel 挂上 !picking）');
ok(/if \(shPickStep\) \{ shPickClick\(wx, wy\); return; \}/.test(uiSrc),
   'pointerdown 里定头尾最先接走（不会被选灯 / 拖形状抢），点歪了也不退出（shPickClick）');
ok(/\$\('#shPick'\)\.onclick[\s\S]{0,400}?if \(shPickStep\) \{/.test(uiSrc)
   && /\$\('#shPick'\)\.onclick[\s\S]{0,1400}?shapeIndexOfZone\(z\)/.test(uiSrc),
   '再点一次按钮 = 取消；开之前先在分区表里点中要重排的那个分区（第 2、4 条）');
ok(!/\$\('#shPick'\)\.onclick[\s\S]{0,1600}?setMode\('shape'\)/.test(uiSrc),
   '点「在画布上定头尾」**不**进「画形状」编辑态（定头尾只改编号，不碰几何 —— 第 2 条）');
{
  const iLed = uiSrc.indexOf('for (const L of state.leds)');
  const iHnd = uiSrc.indexOf('const handleSh = shapeCur;');
  const iBanner = uiSrc.indexOf('if (pickSh) {');
  ok(iLed > 0 && iHnd > iLed && iBanner > iHnd,
     `定头尾的提示框画在所有灯与手柄之后（灯 @${iLed} → 手柄 @${iHnd} → 提示 @${iBanner}）` +
     '：最后画 = 压在最上面，不会被彩灯点 / 形状轮廓盖住（第 1 条）');
}
ok(/const bx = wx0 \+ 10 \/ view\.zoom, by = wy0 \+ 10 \/ view\.zoom;/.test(uiSrc)
   && !/const above = b\.y0 - h - 8 \/ view\.zoom/.test(uiSrc),
   '提示框的位置写死在画布窗口左上角（s2w(0,0)）—— 不再挂在形状上方，也不会被塞进形状里面（用户第八轮）');
/* 措辞（用户第九轮）：第 2 下只定方向 —— 不许再写成「② 点尾」（那三个字让人以为「最末尾的编号
 * 就在我点的这一颗上」，实测就是这么误会的）；点完必须把「尾落在第几颗」报到状态栏。 */
ok(/② 再点一下点\$\{pickZ \? '「' \+ pickZ\.name \+ '」的' : ''\}方向/.test(uiSrc)
   && !/② 再点一下定/.test(uiSrc),
   '画布横幅写「② 点方向」而不是「② 点尾」（定头尾的提示就在画布左上角，措辞最显眼）');
ok((html.match(/不是「把尾定在你点的那一颗上」/g) || []).length >= 2,
   '「第 2 下不是把尾定在点的那一颗上」在面板 data-tip 与帮助页都写明了（免得下一个人又按字面理解）');
ok(/function tailLanding\(sh, s\)[\s\S]{0,700}?SHAPE\.plan\(sh, GEN\.CELL\)/.test(uiSrc)
   && /tailLandingTxt\(ti\)/.test(uiSrc),
   '第 2 下点完把「尾落在第几颗 / 离点的那颗差几颗」算出来写进状态栏（tailLanding / tailLandingTxt）');


console.log(fails ? `\n=== ${fails} 项未通过 ===` : '\n=== 全部通过 ===');
process.exit(fails ? 1 : 0);
