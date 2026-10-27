/* 取色：色环（基础）+ 二维色图（高级设置）
 *
 *   A 段：四个取色点都换成了色块（调色板 / 渐变起始色 / 渐变顺序 / 分区颜色）
 *   B 段：色块 = 色环：环上一圈就是色相，出来是满饱和满亮度；灰 / 白 / 黑走高级设置
 *   C 段：面板本身 —— 默认收起二维色图、点开才有；拖动 / 色号框 / 换目标 / 收起
 *   D 段：改色真的写回数据（效果调色板、渐变色库、分区颜色）
 *
 * 色块对外还是 el.value / el.oninput（和原生 <input type=color> 一样），
 * 所以老测试不用改；这里只补「色环 + 高级设置」这层新行为。
 */
import fs from 'node:fs';
const html = fs.readFileSync('led_layout_editor.html', 'utf8');
const coreSrc = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
const uiSrc   = html.match(/<script id="ui">([\s\S]*?)<\/script>/)[1];
const CORE = new Function(coreSrc + '\n; return CORE;')();
const { FW } = CORE;

let fails = 0;
const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fails++; };

console.log('--- 准备：假 DOM ---');
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const listeners = {};
const byId = new Map();
const CTX = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (t[k] = () => {})), set: (t, k, v) => { t[k] = v; return true; } });
const store = new Map();
function mkEl(tag = 'div', id = '') {
  return {
    tagName: (tag || 'div').toUpperCase(), id, _ch: [], style: {}, dataset: {}, checked: false,
    get value() { return this._v === undefined ? '' : this._v; },
    set value(v) { this._v = String(v); },
    textContent: '', disabled: false, files: [], clientWidth: 1200, clientHeight: 900, width: 1200, height: 900,
    get innerHTML() { return this._html || ''; },
    set innerHTML(v) { this._html = v; if (v === '') this._ch = []; },
    get children() { return this._ch; }, set children(v) { this._ch = v; },
    get className() { return this._cn !== undefined ? this._cn : [...this.classList._s].join(' '); },
    set className(v) { this._cn = v; this.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); },
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
                 toggle(c, f) { f === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (f ? this._s.add(c) : this._s.delete(c)); },
                 contains(c) { return this._s.has(c); } },
    appendChild(c) { if (c && c.id) byId.set(c.id, c); this._ch.push(c); return c; },
    insertBefore(c) { if (c && c.id) byId.set(c.id, c); this._ch.unshift(c); return c; },
    get firstChild() { return this._ch[0] || null; },
    remove() {}, focus() {}, select() {}, click() { if (this.onclick) this.onclick(); },
    setPointerCapture() {}, getBoundingClientRect() { return { left: 0, top: 0, width: 1200, height: 900 }; },
    addEventListener(t, f) { (listeners[(this.id || 'anon') + ':' + t] ||= []).push(f); },
    getContext() { return CTX; }, toBlob(cb) { cb({}); },
  };
}
const dynIds = new Set([...html.matchAll(/\.id\s*=\s*'([^']+)'/g)].map(m => m[1]));
function install() {
  for (const k of Object.keys(listeners)) delete listeners[k];
  byId.clear();
  globalThis.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => { store.set(k, v); }, removeItem: k => store.delete(k) };
  globalThis.performance = { now: () => Date.now() };
  globalThis.requestAnimationFrame = () => 0; globalThis.devicePixelRatio = 1;
  globalThis.Image = class { set src(v) { this._s = v; } get src() { return this._s; } };
  globalThis.FileReader = class { readAsText() {} readAsDataURL() {} };
  globalThis.Blob = class {}; globalThis.URL = { createObjectURL: () => 'b', revokeObjectURL() {} };
  try { Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: () => Promise.resolve() } }, configurable: true }); } catch (e) {}
  globalThis.alert = () => {}; globalThis.confirm = () => true; globalThis.prompt = (m, d) => d || 'X';
  const q = sel => {
    if (sel.startsWith('#')) {
      const id = sel.slice(1);
      if (byId.has(id)) return byId.get(id);
      if (!ids.has(id) && !dynIds.has(id)) return null;
      byId.set(id, mkEl('div', id)); return byId.get(id);
    }
    if (!byId.has('body')) byId.set('body', mkEl('body', 'body')); return byId.get('body');
  };
  globalThis.document = {
    documentElement: { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] || null; } },
    querySelector: q,
    querySelectorAll(sel) {
      if (sel === '#left button[data-mode]') return byId.get('left')?.children || [];
      if (sel === '#tabs button') {
        if (!byId.has('tabCache')) byId.set('tabCache', [...html.matchAll(/data-tab="([a-z]+)"/g)].map(m => { const e = mkEl('button'); e.dataset = { tab: m[1] }; return e; }));
        return byId.get('tabCache');
      }
      return [];
    },
    createElement: t => mkEl(t, ''), body: { appendChild() {} }, addEventListener() {}, execCommand() { return true; },
  };
  globalThis.window = { addEventListener(t, f) { (listeners['window:' + t] ||= []).push(f); }, devicePixelRatio: 1 };
  globalThis.addEventListener = globalThis.window.addEventListener;
}
const boot = () => new Function(coreSrc + '\n' + uiSrc)();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const projState = i => JSON.parse(store.get('led_layout_editor.v1')).projects[i].state;
const fxListOf = i => projState(i).effects.list;
const tabBtn = t => (byId.get('tabCache') || []).find(b => b.dataset.tab === t);

console.log('--- A) 四个取色点都换成了色块 ---');
install(); boot(); await sleep(700);
tabBtn('fx').onclick();
byId.get('fxTbl').children[0].onclick();
const colSel = byId.get('fColor');
const setColorMode = async v => { colSel.value = String(v); colSel.onchange({ target: colSel }); await sleep(700); };
await setColorMode(FW.COLOR.STEP);            /* 跳变：颜色数由用户定 */

const chipsOf = id => (byId.get(id).children || []).filter(c => c.classList && c.classList.contains('cchip'));
/* 调色板条目可能是纯色（一个色块）或两端渐变（胶囊里左右两个色块）—— 摊平成一列色块 */
const pal = () => (byId.get('fPalette').children || [])
  .reduce((a, c) => a.concat(c.classList && c.classList.contains('palcell') ? c.children : [c]), [])
  .filter(c => c.classList && c.classList.contains('cchip'));
ok(pal().length >= 1, `调色板默认出 ${pal().length} 个色块（纯黑占位不再算一条颜色）`);
/* 跳变 / 呼吸要多色就用「+」加 —— 加完变 2 个（后面「换目标」那几条要用第 2 个色块） */
if (pal().length < 2) { byId.get('fxPalAdd').onclick(); await sleep(700); }
ok(pal().length >= 2, `点「+」加一个颜色：调色板 ${pal().length} 个色块`);
ok(pal().every(c => /^#[0-9a-f]{6}$/.test(c.value)), '每个色块都带着 #rrggbb（和原生 input 一样的值）');
const zChip = byId.get('zColor');
ok(zChip.classList.contains('cchip') && /^#[0-9a-f]{6}$/.test(zChip.value),
   `分区颜色也是同一号色块（${zChip.value}）`);

console.log('--- B) 色块 = 色环：环上一圈就是色相，出来满饱和满亮度 ---');
/* 画出来的环和点下去取到的是不是同一个 0°：conic-gradient 的 from 0deg 才是 12 点方向，
 * 写成 from -90deg 会把红挪到 9 点，整圈视觉比取值少 90°（用户报的「环上颜色和实际颜色对不上」就是这个）。 */
const ringCss = (/#cpRing\{[\s\S]*?\}/.exec(html) || [''])[0];
ok(/conic-gradient\(from 0deg/.test(ringCss), '色环从 12 点开始画：conic-gradient(from 0deg)');
ok(!/from\s*-90deg/.test(ringCss), '没写成 from -90deg（那样红在左边，整圈差 90°）');
const stops = [['#f00', 0], ['#ff0', 60], ['#0f0', 120], ['#0ff', 180], ['#00f', 240], ['#f0f', 300]];
ok(stops.every(([c, d]) => new RegExp(c + '\\s+' + d + 'deg').test(ringCss)),
   '六个色标都在该在的角度（红 0 / 黄 60 / 绿 120 / 青 180 / 蓝 240 / 洋红 300）');
ok(/Math\.atan2\(dx, -dy\)/.test(uiSrc), '取值基准：atan2(dx, -dy) —— 0° = 正上方，和渐变同基准');
const angOf = (dx, dy) => ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
ok(angOf(0, -1) === 0 && angOf(1, 0) === 90 && angOf(0, 1) === 180 && angOf(-1, 0) === 270,
   `上 / 右 / 下 / 左 = 0 / 90 / 180 / 270°（${angOf(0, -1)} ${angOf(1, 0)} ${angOf(0, 1)} ${angOf(-1, 0)}）`);

const ch = pal()[0];
ok(ch.__cp && typeof ch.__cp.hue === 'function', '色块带 __cp 门（测试 / 脚本能不用鼠标改色）');
ch.__cp.hue(120);
ok(ch.value === '#00ff00', `色相 120° → 纯绿 ${ch.value}`);
ok(ch.style.background === '#00ff00', '色块当场变色（不用再渲染一遍）');
ch.__cp.hue(240);
ok(ch.value === '#0000ff', `色相 240° → 纯蓝 ${ch.value}`);
ok(ch.style.background === '#0000ff', '色块当场变色（不用再渲染一遍）');
await sleep(500);                             /* 自动存盘是防抖的（400ms）：等它落盘再看数据 */
ok(JSON.stringify(fxListOf(0)[0].palette[0]) === '[0,0,255]', '改色 → 效果的调色板第 1 色跟着变');
ok(JSON.stringify(fxListOf(0)[0].c1) === '[0,0,255]', '老字段 c1 同步（别的模式还靠它兜底）');

ch.__cp.setHex('#808080');
ok(ch.value === '#808080', '灰 #808080 读得进来（老存档里的灰不是禁区）');
ok(Math.abs(ch.__cp.hsv.v - 128 / 255) < 0.01 && ch.__cp.hsv.s === 0,
   `灰 = 饱和 0、亮度 ${(ch.__cp.hsv.v * 100).toFixed(0)}%`);
ok(ch.__cp.hsv.h === 240, `灰没有色相：色环位置保持上一次（${ch.__cp.hsv.h}°），不会被拽回红`);
ch.__cp.sv(1, 1);
ok(ch.value === '#0000ff', `从灰把饱和 / 亮度拉满 → 回到刚才那个色相 ${ch.value}`);

ch.__cp.sv(0, 1);
ok(ch.value === '#ffffff', 'S=0 V=100% → 白（高级设置里最左上）');
ch.__cp.sv(1, 0);
ok(ch.value === '#000000', 'V=0 → 黑（高级设置里最下边）');
ch.__cp.setHex('#0f0');
ok(ch.value === '#00ff00', '三位简写 #0f0 也认');
ch.value = '不是颜色';
ok(ch.value === '#00ff00', '认不出的值当没写（和原生 input 一样，不会突然变黑）');


console.log('--- C) 面板：色环是主体，二维色图收在「高级设置」里 ---');
ch.__cp.open();
const pop = byId.get('cpPop');
ok(!!pop && pop.style.display === 'block', '打开色块 → 面板出来');
ok(byId.get('cpHex').value === ch.value, `色号框 = 当前色（${byId.get('cpHex').value}）`);
ok(byId.get('cpAdvBody').style.display === 'none', '高级设置默认收起：二维色图不占位、不抢注意力');
ok(/^色相 /.test(byId.get('cpKH').textContent), '有读数：' + byId.get('cpKH').textContent);
byId.get('cpAdv').onclick();
ok(byId.get('cpAdvBody').style.display === '', '点「高级设置」→ 二维色图展开');
ok(byId.get('cpAdv').textContent.charAt(0) === '▾', '按钮变成 ▾ 高级设置');
ok(/^#[0-9a-f]{6}$/.test(byId.get('cpSvBase').style.background),
   '二维图底色 = 当前色相：' + byId.get('cpSvBase').style.background);
ok(byId.get('cpSvDot').style.left !== '' && byId.get('cpSvDot').style.top !== '', '二维图上有个光点');
byId.get('cpAdv').onclick();
ok(byId.get('cpAdvBody').style.display === 'none' && byId.get('cpAdv').textContent.charAt(0) === '▸',
   '再点收起（回到只有色环的样子）');

/* 色环：上 = 0°（红）、右 = 90°（黄绿）、下 = 180°（青）、左 = 270°（紫）——
 * 假 DOM 的 rect 是 1200×900，圆心 (600,450)，所以坐标直接按这个算 */
const ringDown = (listeners['cpRing:pointerdown'] || [])[0];
ok(typeof ringDown === 'function', '色环挂了 pointerdown（和画布拖动同一套写法）');
const ringAt = (x, y) => ringDown({ clientX: x, clientY: y, pointerId: 1, preventDefault() {} });
ch.__cp.sv(1, 1);
ringAt(600, 350); ok(ch.value === '#ff0000', `环顶 = 红 ${ch.value}`);
ringAt(700, 450); ok(ch.value === '#80ff00', `环右 = 90° 黄绿 ${ch.value}`);
ringAt(600, 550); ok(ch.value === '#00ffff', `环底 = 180° 青 ${ch.value}`);
ringAt(500, 450); ok(ch.value === '#8000ff', `环左 = 270° 紫 ${ch.value}`);
ringAt(600, 450); /* 正中间那个洞（当前色块）点了不动 */
ok(ch.value === '#8000ff', '点环中间的洞不跳色（那儿是当前色块）');

/* 二维图：横轴最左 = 灰，纵轴最下 = 黑 —— 灰和暗只有在这儿够得着 */
const svDown = (listeners['cpSvWrap:pointerdown'] || [])[0];
ok(typeof svDown === 'function', '二维色图也挂了拖动');
const svAt = (x, y) => svDown({ clientX: x, clientY: y, pointerId: 2, preventDefault() {} });
ch.__cp.hue(0); ch.__cp.sv(1, 1);
svAt(6, 450);
ok(ch.value === '#808080', `最左 + 半高 = 中灰 ${ch.value}`);
svAt(6, 6);
ok(ch.value === '#ffffff', `最左上 = 白 ${ch.value}`);
svAt(6, 894);
ok(ch.value === '#000000', `最左下 = 黑 ${ch.value}`);

/* 黑 / 灰上点色环也得能出颜色：色环 = 满饱和满亮度，v / s 是 0 时先提满。
 * 不这么做的话，黑色格子上怎么拖色环都还是黑的（用户 2026-10-27：
 * 「第二个默认是黑色，这是不对的，修改也修改不了」）。 */
ringAt(600, 350);
ok(ch.value === '#ff0000', `黑色格子上点色环 → 直接出纯红（不再是黑的）${ch.value}`);
ch.__cp.setHex('#808080');               /* 灰：饱和 0，换色相看不出变化 */
ringAt(600, 550);
ok(ch.value === '#00ffff', `灰格子上点色环 → 出纯青（灰不再卡住）${ch.value}`);
ch.__cp.setHex('#400000');               /* 暗红：亮度只有 25% */
ringAt(600, 550);
ok(ch.value === '#004040', `暗色上点色环只换色相、亮度保留（暗红 → 暗青）${ch.value}`);

/* 色号框：黑白灰、别人给的色号，直接敲最快 */
const hexIn = byId.get('cpHex');
hexIn.value = '#336699'; hexIn.oninput();
ok(ch.value === '#336699', `色号框敲 #336699 → 色块跟着变（${ch.value}）`);
hexIn.value = '#zz'; hexIn.oninput();
ok(ch.value === '#336699', '敲一半（#zz）不生效，不会闪成黑');

/* 换目标 / 收起 */
const ch2 = pal()[1];
ch2.click();
ok(byId.get('cpPop').style.display === 'block' && byId.get('cpHex').value === ch2.value,
   '点另一个色块 → 面板直接换目标（不用先关）');
ok(ch2.__cp.isOpen && !ch.__cp.isOpen, '正在编辑谁（isOpen）跟着换');
byId.get('cpX').onclick();
ok(byId.get('cpPop').style.display === 'none' && !ch2.__cp.isOpen, '点 × 收起');

/* 再点同一个色块 = 收起；点另一个 = 直接换目标（面板不闪） */
ch2.click();
ok(ch2.__cp.isOpen, '再点开一次');
ch2.click();
ok(!ch2.__cp.isOpen, '再点同一个色块 → 收起（和帮助页写的一致）');
ch2.onkeydown({ key: 'Enter', preventDefault() {} });
ok(ch2.__cp.isOpen, '键盘回车也能开（色块是个 span，得补这条）');
console.log('--- C2) 点色块不会被行里的 + 按钮抢走 ---');
/* 调色板 / 渐变顺序这两行里还有 + − 按钮。行要是 <label>，浏览器会把点色块的 click
 * 转给行里第一个「可标记」控件（就是 +）→ 点颜色变成「加一个颜色」，
 * 而且只在「还没加满」时发作（加满后 + 被藏起来，反而正常）—— 就是这个坑。 */
ok(!/<label[^>]*id="rowPal"/.test(html), '调色板那行不是 <label>（否则点色的 click 会被转给 + 按钮）');
ok(/<div class="row" id="rowPal"/.test(html), '调色板那行换成了 div.row');
ok(!/<label[^>]*id="rowGradOrder"/.test(html), '渐变顺序那行也不是 <label>（同一个坑）');
ok(/<div class="row" id="rowGradOrder"/.test(html), '渐变顺序那行换成了 div.row');
ok(/div\.row\{display:flex/.test(html), 'div.row 补了同样的排版（不然这一行会塌）');

/* 色块自己也拦冒泡：以后谁又把它塞进 <label>，也不会被转走 */
let stopped = 0;
ch.onclick({ stopPropagation() { stopped++; } });
ok(stopped === 1, '点色块时拦下冒泡（不交给外层 label）');
byId.get('cpX').onclick();                    /* 上面顺带开了面板，收起 */

/* 点色块 = 开面板，调色板一个颜色都不多 */
const nBefore = pal().length;
ch.click();
ok(pal().length === nBefore && ch.__cp.isOpen,
   `点第 1 个颜色只是开面板，没变成「加一个颜色」（${nBefore} 个色块不变）`);
byId.get('cpX').onclick();


console.log('--- D) 渐变 / 分区：改的还是同一份数据 ---');
await setColorMode(FW.COLOR.SPECTRUM);
const stChip = chipsOf('fxGradStart')[0];
ok(!!stChip && stChip.classList.contains('cchip'), '渐变「起始色」也是色块');
stChip.__cp.hue(240);
ok(stChip.value === '#0000ff', `起始色改成纯蓝 ${stChip.value}`);
await sleep(500);
ok(JSON.stringify(projState(0).gradients.list[0].start) === '[0,0,255]',
   '渐变色库那条的 start 跟着变（不是只改了屏幕上的色块）');

const ords = (byId.get('fxGradOrder').children || []).filter(c => c.className === 'gord');
ok(ords.length === 6, `顺序仍是 6 个锚点（${ords.length}）`);
const ordChip = ords[1].children[1];
ok(!!ordChip && ordChip.classList.contains('cchip'), '顺序里每个锚点也是色块（两侧 ‹ › 还在）');
ok(ords[1].children[0].textContent === '‹' && ords[1].children[2].textContent === '›', '换位按钮没被色块挤掉');
ordChip.__cp.hue(120);
await sleep(500);
ok(JSON.stringify(projState(0).gradients.list[0].anchors[1]) === '[0,255,0]', '顺序第 2 个 → 纯绿');
ok(ords[0].children[0].disabled === true && ords[5].children[2].disabled === true,
   '头尾不能越界的老规矩还在');

/* 分区颜色：没选中 / 禁用时点不开（syncZoneEdit 会把 .disabled 置上） */
zChip.disabled = true;
ok(zChip.classList.contains('cchip-off'), '分区颜色禁用 → 色块灰掉');
zChip.click();
ok(!zChip.__cp.isOpen, '灰掉时点它不开面板');
zChip.disabled = false;
ok(!zChip.classList.contains('cchip-off'), '恢复可选');
/* 面板开着的时候点分区表换一段：色环跟着换到新分区的颜色（不然还停在上一段的色相上） */
tabBtn('zones').onclick();
zChip.click();
const firstHex = byId.get('cpHex').value;
const rows = (byId.get('zoneTbl').children || []).filter(c => c.tagName === 'TR' && c.onclick);
ok(rows.length >= 2, `分区表有 ${rows.length} 行可点`);
rows[1].onclick();
ok(byId.get('cpHex').value === zChip.value && byId.get('cpHex').value !== firstHex,
   `换分区 → 面板跟着换色（${firstHex} → ${byId.get('cpHex').value}）`);
rows[0].onclick();                         /* 选回第 1 段 */ zChip.click();   /* 收起，别影响后面对存档的断言 */
const zBefore = projState(0).zones[0].color;
zChip.__cp.sv(1, 1);            /* 分区默认色是 #ff9a3c（饱和 76%）；先拉满才谈得上「纯色相」 */
zChip.__cp.hue(300);
ok(zChip.value === '#ff00ff', `分区颜色改成品红 ${zChip.value}`);
await sleep(500);
ok(projState(0).zones[0].color === '#ff00ff' && projState(0).zones[0].color !== zBefore,
   `分区 1 的颜色写进存档（${zBefore} → ${projState(0).zones[0].color}）`);

console.log(fails ? `\n=== ${fails} 项未通过 ===` : '\n=== 全部通过 ===');
if (fails) process.exit(1);

