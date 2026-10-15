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

/* ---------- ⑤ 手柄：选择模式也要「一次按住就能改大小」 ---------- */
console.log('\n--- ⑤ 成形的手柄：选择模式按下去就直接改大小 ---');
const shBoxOf = i => CORE.SHAPE.boxOf(curSt().shapes[i]);
/* 面板下拉挑形状要**派发 onchange**：应用里的 selShape 是跟着 change 事件走的，
 * 只改 .value 不会同步（那会变成「点的是 A、动的是 B」这种测试自己制造的怪事）。 */
const pickShape = i => { const s = byId.get('shList'); s.value = String(i); s.onchange({ target: s }); };
{
  pickShape(2);
  ok((modeOn('shape') || {}).contains('on') && byId.get('shList').value === '2',
     '面板「形状」下拉挑 2 号 = 选中它并进编辑态');
  esc();
  ok(!(modeOn('shape') || {}).contains('on'), 'Esc 释放编辑态（回到选择/编辑）');

  const b0 = shBoxOf(2);
  const hE = worldToClient(b0.x1, (b0.y0 + b0.y1) / 2);    /* 右边中间那个手柄，屏幕上它在哪 */
  dragClient(hE, [hE[0] + 70, hE[1]]);                     /* 抓住往外拖 70 屏幕 px */
  await wait();
  const b1 = shBoxOf(2);
  ok(b1.x1 > b0.x1 + 20 && Math.abs(b1.x0 - b0.x0) < 1,
     `按住手柄拖一下就把形状改宽了（${Math.round(b0.x1 - b0.x0)} → ${Math.round(b1.x1 - b1.x0)} 世界 px；左边没动）`);
  esc();
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

/* ---------- ⑥b 只有「画出来的」手柄才允许抢按下：放置 / 擦除模式不画手柄 ---------- */
console.log('\n--- ⑥b 看不见的手柄不存在（放置 / 擦除模式不画手柄）---');
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
  pickShape(2); esc();                              /* 选过 2 号 → Esc 回选择模式 */
  ok(modeOn('select').contains('on'), 'Esc 之后回到选择/编辑模式');
  const b = shBoxOf(2);
  ok(hasHandle(b), '选择模式下「你选过的那一个」手柄一直画着（看得见，所以抓得住）');
  modeBtn('place').onclick();
  ok(modeOn('place').contains('on') && !hasHandle(b), '切到「放置编号」：手柄不再画（画不出来就不许抢按下）');
  modeBtn('erase').onclick();
  ok(modeOn('erase').contains('on') && !hasHandle(b), '切到「擦除」同样不画手柄');
  modeBtn('select').onclick();
  ok(hasHandle(b), '切回选择模式：手柄回来了（一次手势就能改大小）');
  esc();
}

/* ---------- ⑦ 源码里的硬规矩（改了就会被这里拦住） ---------- */
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
ok(/shapePicked && mode === 'select' \? curShape\(\) : null/.test(uiSrc),
   '手柄只在「编辑态 / 选择模式 + 选过形状」时画（放置、擦除模式不画）');
ok(/function setMode\(m\)[\s\S]{0,1200}?render\(\);/.test(uiSrc),
   '切模式当场重画（不会留一屏过期的手柄）');
ok(/shapePicked = false;\s*\/\* 选中的形状没了/.test(uiSrc),
   '删掉形状后不再替下一个形状画手柄（用户没选过它）');


console.log(fails ? `\n=== ${fails} 项未通过 ===` : '\n=== 全部通过 ===');
process.exit(fails ? 1 : 0);
