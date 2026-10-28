/* 渐变色库（颜色环）：起始色 / 自定义顺序 / 多套保存 / 绑定选渐变 / 导出 C
 *
 *   A 段：core（不碰 DOM）—— 颜色环算法、起始色旋转、增删、实例渲染、导出表
 *   B 段：界面层 —— 色彩配置里的「渐变」行、新建 / 另存为、起始色与顺序、模式页绑定选择
 */
import fs from 'node:fs';
const html = fs.readFileSync('led_layout_editor.html', 'utf8');
const coreSrc = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
const uiSrc   = html.match(/<script id="ui">([\s\S]*?)<\/script>/)[1];
const CORE = new Function(coreSrc + '\n; return CORE;')();
const { FW, gradTable, gradRamp, gradShift, gradTableFor, gradLib, gradList, gradById,
        gradNew, gradDrop, gradDefault, defaultGradients, normalizeEffect, projectFromPreset,
        PRESET_SP3122D, exportEffectsC, modesPlan, simApplyEffect, instNew, colorUpdate,
        effGradStep, GRAD_STEP_MIN, GRAD_STEP_MAX, GRAD_SPEED_MAX, GRAD_SPEED_CUT,
        GRAD_MIN, GRAD_MAX, GRAD_DEFAULT_ANCHORS } = CORE;

let fails = 0;
const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fails++; };
const rgb = c => '[' + c.r + ',' + c.g + ',' + c.b + ']';
const near = (a, b, d) => Math.abs(a.r - b.r) <= d && Math.abs(a.g - b.g) <= d && Math.abs(a.b - b.b) <= d;

/* ============================ A 段：core ============================ */
console.log('--- A1) 默认渐变 = 现在的默认顺序（红→黄→绿→青→蓝→紫→红）---');
{
  const def = defaultGradients();
  ok(def.list.length === 1 && def.list[0].id === 'g1' && def.list[0].name === '渐变-1',
     '新工程自带一条「渐变-1」');
  const g = def.list[0];
  ok(g.anchors.length === 6 && JSON.stringify(g.anchors[0]) === '[255,0,0]',
     '6 个锚点，第 1 个是红');
  ok(gradShift(g) === 0, '起始色 = 红 → 不旋转（相位 0 还是红）');
  const t = gradTable(g);
  ok(t.length === 256, `色环 256 级（${t.length}）`);
  const want = [[0, [255, 0, 0]], [43, [255, 255, 0]], [86, [0, 255, 0]],
                [129, [0, 255, 255]], [172, [0, 0, 255]], [214, [255, 0, 255]]];
  ok(want.every(([i, c]) => t[i].r === c[0] && t[i].g === c[1] && t[i].b === c[2]),
     '六个锚点依次落在 0/43/86/129/172/214：' + want.map(([i]) => i + ':' + rgb(t[i])).join(' '));
  let maxd = 0;
  for (let i = 0; i < 256; i++)
    maxd = Math.max(maxd, Math.abs(t[i].r - FW.spectrum_tbl[i].r),
                    Math.abs(t[i].g - FW.spectrum_tbl[i].g), Math.abs(t[i].b - FW.spectrum_tbl[i].b));
  ok(maxd <= 12, `与固件彩虹表同序同走向（最大通道差 ${maxd}，只差分段边界的取整）`);
  ok(gradRamp(g).length === 256, 'gradRamp() 也是 256 级（起始色在这里旋转）');
  ok(gradTable(g) === gradTable({ id: 'x', start: [255, 0, 0], anchors: g.anchors }),
     '同样的参数只算一次（按内容缓存，返回同一个对象）');
}

console.log('--- A1b) 「新建」用的那条 = 默认顺序 + 起点红（与库里已有几条无关）---');
{
  const a = gradDefault(), b = gradDefault();
  ok(JSON.stringify(a.start) === '[255,0,0]' && a.anchors.length === 6 &&
     JSON.stringify(a.anchors) === JSON.stringify(GRAD_DEFAULT_ANCHORS),
     '默认：起点红 + 6 个锚点（红→黄→绿→青→蓝→紫）');
  ok(a !== b && a.start !== b.start && a.anchors !== b.anchors && a.anchors[0] !== b.anchors[0],
     '每次都是新的深拷贝（改一条不会串到别的）');
  ok(JSON.stringify(defaultGradients().list[0].anchors) === JSON.stringify(a.anchors) &&
     JSON.stringify(defaultGradients().list[0].start) === '[255,0,0]',
     '出厂的「渐变-1」也走它 —— 新建出来的与出厂那条一模一样');
}

console.log('--- A2) 起始色：把整条环转一下，顺序不变 ---');
{
  const g = defaultGradients().list[0];
  const blue = { id: 'b', start: [0, 0, 255], anchors: g.anchors };
  const tb = gradTable(blue);
  ok(rgb(tb[0]) === '[0,0,255]', `起始色 = 蓝 → 相位 0 = ${rgb(tb[0])}`);
  ok(gradShift(blue) === 172, `蓝在环上的位置 = 172（实际 ${gradShift(blue)}）`);
  const t0 = gradTable(g);
  ok(rgb(tb[1]) === rgb(t0[173]), '起始色只是旋转：后面一级接的就是原来 173 那一级');
  const white = { id: 'w', start: [255, 255, 255], anchors: g.anchors };
  ok(gradShift(white) >= 0 && gradShift(white) < 256, '起始色不在环上时落到最接近的一级（不报错）');
}

console.log('--- A3) 自定义顺序：只定几个颜色，中间由算法等长推出来 ---');
{
  const two = { id: 'rb', start: [255, 0, 0], anchors: [[255, 0, 0], [0, 0, 255]] };
  const t = gradTable(two);
  ok(rgb(t[0]) === '[255,0,0]' && rgb(t[128]) === '[0,0,255]' && near(t[64], { r: 128, g: 0, b: 128 }, 1),
     `红→蓝：0/64/128 = ${rgb(t[0])} / ${rgb(t[64])} / ${rgb(t[128])}`);
  ok(near(t[255], { r: 254, g: 0, b: 2 }, 3), `最后一级又回到红（${rgb(t[255])}）—— 首尾相接`);
  const three = { id: 'rgb3', start: [255, 0, 0], anchors: [[255, 0, 0], [0, 255, 0], [0, 0, 255]] };
  const t3 = gradTable(three);
  ok(rgb(t3[86]) === '[0,255,0]' && rgb(t3[171]) === '[0,0,255]',
     `3 个锚点等长（256 除不尽的 1 级给第一段）：86 / 171 处正好是绿 / 蓝 → ${rgb(t3[86])} / ${rgb(t3[171])}`);
  ok(t3[10].r === 225 && t3[10].g === 30 && t3[10].b === 0,
     `两色之间线性插值（红→绿 第 10 级 = ${rgb(t3[10])}）`);
}


console.log('--- A4) 多套保存：渐变-1 / 渐变-2 互不影响 ---');
{
  const st = projectFromPreset(PRESET_SP3122D);
  ok(st.gradients && st.gradients.list.length === 1, '工程里有渐变色库（默认一条）');
  const g2 = gradNew(st, st.gradients.list[0]);
  ok(g2.id !== 'g1' && g2.name === '渐变-2', `另存为「${g2.name}」`);
  ok(JSON.stringify(g2.anchors) === JSON.stringify(st.gradients.list[0].anchors),
     '新的一条是复制出来的，改它不影响原来那条');
  g2.anchors = [[255, 0, 0], [0, 255, 0]];
  ok(st.gradients.list[0].anchors.length === 6, '原来那条还是 6 个锚点');
  /* 用户报的那个坑：改了渐变-2 的起始色，切回渐变-1 也是绿的 —— 说明两条其实是一条。
     这里把「界面上的三种改法」都走一遍，确认另一条纹丝不动。 */
  const g1 = st.gradients.list[0];
  ok(g1 !== g2 && g1.start !== g2.start, '两条渐变是不同对象，start 也不是同一个数组');
  g2.start = [0, 255, 0];                       /* 起始色 */
  ok(JSON.stringify(g1.start) === '[255,0,0]', '改渐变-2 的起始色 → 渐变-1 的起始色没动');
  g2.anchors[0] = [0, 0, 255];                  /* 顺序里的第 1 个颜色（界面是原地写） */
  ok(JSON.stringify(g1.anchors[0]) === '[255,0,0]', '改渐变-2 顺序里的颜色 → 渐变-1 的顺序没动');
  ok(rgb(gradTable(g1)[0]) === '[255,0,0]' && rgb(gradTable(g1)[0]) !== rgb(gradTable(g2)[0]),
     `两条渐变算出来的色环不一样：渐变-1 起点 ${rgb(gradTable(g1)[0])}，渐变-2 起点 ${rgb(gradTable(g2)[0])}`);
  ok(gradTable(g1) !== gradTable(g2), '色环缓存按内容分开（不会共用同一张表）');
  ok(gradById(st, 'nope').id === 'g1', 'id 找不到时退回第一条（悬空引用不会炸）');
  ok(gradDrop(st, 'g1') === true && gradList(st).length === 1, '删掉一条');
  ok(gradDrop(st, 'g2') === false, '只剩一条时不给删');
  ok(gradLib({}).list.length === 1, '空 state 也能补出默认渐变');
  const old = { color: FW.COLOR.SPECTRUM };
  normalizeEffect(old);
  ok(old.grad === '', '老效果 normalize 后 grad 是空串（= 用第一条）');
}

console.log('--- A4b) 编号不会撞：老存档里 nextId 落后 / 手改成两条同 id 都不出事 ---');
{
  const st = projectFromPreset(PRESET_SP3122D);
  const lib = gradLib(st);
  lib.nextId = 1;                                  /* 老存档：计数器落后于实际编号 */
  ok(gradLib(st).nextId === 2, `gradLib 把落后的 nextId 修到 ${gradLib(st).nextId}（最大编号 + 1）`);
  const a = gradNew(st, lib.list[0]);
  const b = gradNew(st, a);
  ok(a.id === 'g2' && b.id === 'g3', `另存为依次拿到 ${a.id} / ${b.id}（不会又发一个 g1）`);
  ok(lib.nextId === 4, `nextId 跟着走到 ${lib.nextId}`);
  const ids = gradList(st).map(g => g.id);
  ok(new Set(ids).size === ids.length, '库里的 id 互不相同：' + ids.join(','));

  /* 手改存档：两条渐变都叫 g1 */
  const st2 = projectFromPreset(PRESET_SP3122D);
  st2.gradients.list.push({ id: 'g1', name: '渐变-2', start: [0, 255, 0], anchors: [[255, 0, 0], [0, 0, 255]] });
  const L = gradLib(st2).list;
  ok(L.length === 2 && L[0].id === 'g1' && L[1].id !== 'g1',
     `撞 id 的老存档会被拆开（${L.map(g => g.id).join(',')}）`);
  L[1].start = [0, 255, 0];
  ok(JSON.stringify(L[0].start) === '[255,0,0]', '拆开之后改一条，另一条不受影响');
  ok(gradNew(st2, L[0]).id !== 'g1' && gradList(st2).length === 3, '撞过 id 之后再加一条也不会再撞');
}


{
  const st = projectFromPreset(PRESET_SP3122D);
  const g2 = gradNew(st, st.gradients.list[0]);
  g2.anchors = [[255, 0, 0], [0, 0, 255]];
  const eff = st.effects.list[0];                 /* 固件第 0 条 = 单点追逐 + 渐变 */
  ok((eff.color | 0) === FW.COLOR.SPECTRUM, '槽位 0 的配色就是渐变');
  eff.grad = g2.id;
  const inst = instNew();
  simApplyEffect(inst, eff, 0, st);
  ok(inst.color.spectrum === gradTable(gradById(st, g2.id)), '实例拿到的是这条效果的色环表');
  ok(rgb(inst.color.spectrum[128]) === '[0,0,255]', '相位 128 = 蓝（自定义顺序生效）');
  inst.anim.gen_tick = 0; inst.color.phase = 0; inst.color.tick_cnt = 0;
  for (let t = 0; t < 4; t++) colorUpdate(inst.color, t);
  ok(inst.color.phase === 2 && near(inst.color.current, { r: 251, g: 0, b: 4 }, 4),
     `每 N 拍相位 +1：2 拍后 phase=${inst.color.phase} / 颜色 ${rgb(inst.color.current)}`);
  ok(gradTableFor(st, eff) === inst.color.spectrum, 'gradTableFor() 就是实例里那张表');
}

console.log('--- A6) 导出 C：每个效果指到自己那块 256 行色环 ---');
{
  const st = projectFromPreset(PRESET_SP3122D);
  const g2 = gradNew(st, st.gradients.list[0]);
  g2.start = [0, 0, 255];                         /* 跟默认那条不一样，才会单独存一份 */
  st.effects.list[0].grad = g2.id;
  const plan = modesPlan(st);
  ok(plan.gradRows.length === 512, `用到的色环 = 2 条 × 256 行（实际 ${plan.gradRows.length}）`);
  const hdr = exportEffectsC(st, { form: 'header', comment: 'ascii', eol: 'lf' });
  ok(/uint16_t grad_first;\s+\/\* gradient/.test(hdr), 'led_gen_effect_t 里多出 grad_first');
  const gt = hdr.slice(hdr.indexOf('static const rgb_t led_gen_grad[]'));
  const rows = (gt.slice(0, gt.indexOf('};')).match(/^    \{ \d+, \d+, \d+ \},/gm) || [])
                 .map(s => s.replace(/[{},\s]/g, ' ').trim().split(/\s+/).map(Number));
  ok(rows.length === 512, `led_gen_grad 里 512 行（实际 ${rows.length}）`);
  const t1 = gradTable(gradById(st, 'g1')), t2 = gradTable(gradById(st, g2.id));
  const effBlk = hdr.slice(hdr.indexOf('static const led_gen_effect_t'));
  const effRows = (effBlk.slice(0, effBlk.indexOf('};')).match(/^    \{.*\},/gm) || [])
                    .map(s => s.replace(/\/\*.*$/, '').replace(/[{},\s]/g, ' ').trim().split(/\s+/).map(Number));
  ok(effRows[0].length === 30, `效果行 30 列（末尾 grad_first + grad_step + smooth_ms）：${effRows[0].length}`);
  /* 槽位 0 用渐变-2（起始色蓝），先进表 → 它那块在第 0 段；其余渐变 / 旧双色渐变用渐变-1 → 第 256 段；
     纯色等不用表的配色一律 0 */
  const f0 = effRows[0][27];
  ok(f0 === 0 && effRows[1][27] === 0 && effRows[4][27] === 256,
     `grad_first：槽位 0（渐变-2）=${f0}，槽位 1（纯色）=${effRows[1][27]}，槽位 4（旧双色渐变）=${effRows[4][27]}`);
  ok(effRows.every(r => r[28] >= GRAD_STEP_MIN && r[28] <= GRAD_STEP_MAX),
     `每一行的 grad_step 都落在 ${GRAD_STEP_MIN}..${GRAD_STEP_MAX}（默认 ${effRows[0][28]}：老存档 / 出厂都是逐拍一级）`);
  let same = true;
  for (let i = 0; i < 256; i++) {
    if (rows[f0 + i][0] !== t2[i].r || rows[f0 + i][1] !== t2[i].g || rows[f0 + i][2] !== t2[i].b) same = false;
    const g1at = (f0 === 0) ? 256 : 0;
    if (rows[g1at + i][0] !== t1[i].r || rows[g1at + i][1] !== t1[i].g || rows[g1at + i][2] !== t1[i].b) same = false;
  }
  ok(same, '导出表与 JS 查表逐值一致（预览 = 固件）');
  const st2 = projectFromPreset(PRESET_SP3122D);
  st2.effects.list[0].grad = 'g1';
  ok(modesPlan(st2).gradRows.length === 256, '多条效果共用一条渐变时只存一份（512 → 256 行）');

console.log('--- A7) 「步进(级)」：比速度 = 1 还快（每动一次前进几级）---');
{
  ok(effGradStep({}) === 1 && effGradStep({ grad_step: 0 }) === 1 && effGradStep(null) === 1,
     '没有这个字段 / 0 / 空对象 → 1（老存档、手拼对象行为不变）');
  ok(effGradStep({ grad_step: 99 }) === GRAD_STEP_MAX && effGradStep({ grad_step: -3 }) === 1,
     `夹在 ${GRAD_STEP_MIN}..${GRAD_STEP_MAX}：99 → ${GRAD_STEP_MAX}，-3 → 1`);
  const st = projectFromPreset(PRESET_SP3122D);
  const eff = st.effects.list[0];
  ok((eff.color | 0) === FW.COLOR.SPECTRUM && effGradStep(eff) === 1,
     `出厂槽位 0 是渐变、步进 ${effGradStep(eff)}（出厂数据里没这个字段 → 1，与从前逐拍一级一致）`);
  ok(instNew().color.grad_step === 1, 'instNew() 的颜色上下文也带 grad_step = 1');
  const x = { color: FW.COLOR.SPECTRUM, grad_step: 40 };
  normalizeEffect(x);
  ok(x.grad_step === GRAD_STEP_MAX, `normalizeEffect 把越界值夹回来（40 → ${x.grad_step}）`);

  /* speed = 1、步进 8：每拍前进 8 级 —— 4 拍就是 32 级（老行为只会走 4 级） */
  eff.speed = 1;
  eff.grad_step = 8;
  const i2 = instNew();
  simApplyEffect(i2, eff, 0, st);
  ok(i2.color.grad_step === 8, '实例拿到效果的步进（effectPreset → instApplyPreset）');
  i2.color.phase = 0; i2.color.tick_cnt = 0;
  for (let t = 0; t < 4; t++) colorUpdate(i2.color, t);
  ok(i2.color.phase === 32, `速度 1 + 步进 8：4 拍后 phase=${i2.color.phase}（老行为是 4）`);
  ok(rgb(i2.color.current) === rgb(gradTable(gradById(st, eff.grad))[32]) &&
     rgb(i2.color.secondary) === rgb(gradTable(gradById(st, eff.grad))[(32 + 85) & 0xFF]),
     `颜色就是表上第 32 级（${rgb(i2.color.current)}），副色跟着 +85`);

  /* 与速度叠加：速度 4 + 步进 8 → 每 4 拍前进 8 级（一整圈 = 256 × 4 ÷ 8 = 128 拍） */
  eff.speed = 4;
  const i3 = instNew();
  simApplyEffect(i3, eff, 0, st);
  i3.color.phase = 0; i3.color.tick_cnt = 0;
  for (let t = 0; t < 4; t++) colorUpdate(i3.color, t);
  const p4 = i3.color.phase;
  for (let t = 0; t < 4; t++) colorUpdate(i3.color, t);
  ok(p4 === 8 && i3.color.phase === 16,
     `速度 4 + 步进 8：4 拍后 ${p4}、8 拍后 ${i3.color.phase} 级（一整圈 = 256×4÷8 = 128 拍）`);
  /* 一圈正好回到起点：128 拍 × 8 级 = 1024 = 4 × 256 */
  i3.color.phase = 0; i3.color.tick_cnt = 0;
  const fast = instNew();
  simApplyEffect(fast, Object.assign({}, eff, { speed: 4, grad_step: 8 }), 0, st);
  fast.color.phase = 0; fast.color.tick_cnt = 0;
  for (let t = 0; t < 128; t++) colorUpdate(fast.color, t);
  ok(fast.color.phase === 0, `128 拍（速度 4 × 步进 8）正好回到起点：phase=${fast.color.phase}`);

  /* 手拼的 color 上下文（没有 grad_step）：仍旧逐拍 +1 —— 老测试 / 老调用方不受影响 */
  const raw = { type: FW.COLOR.SPECTRUM, phase: 0, tick_cnt: 0, spectrum_speed: 1, spectrum: FW.spectrum_tbl };
  colorUpdate(raw, 0);
  ok(raw.phase === 1, `没有 grad_step 时逐拍 +1（phase=${raw.phase}）`);

  /* 导出：结构体多一列、行里带真实的步进、生成代码按 E->grad_step 前进 */
  const st3 = projectFromPreset(PRESET_SP3122D);
  st3.effects.list[0].grad_step = 8;
  const hdr3 = exportEffectsC(st3, { form: 'header', comment: 'ascii', eol: 'lf' });
  ok(/uint8_t grad_step;\s+\/\*/.test(hdr3), 'led_gen_effect_t 末尾多出 grad_step（结构体是生成物，重新覆盖即可）');
  const eb3 = hdr3.slice(hdr3.indexOf('static const led_gen_effect_t'));
  const r3 = (eb3.slice(0, eb3.indexOf('};')).match(/^    \{.*\},/gm) || [])
    .map(s => s.replace(/\/\*.*$/, '').replace(/[{},\s]/g, ' ').trim().split(/\s+/).map(Number));
  ok(r3[0][28] === 8 && r3[1][28] === 1,
     `导出行：槽位 0（渐变，步进 8）=${r3[0][28]}，槽位 1（纯色，存着不用）=${r3[1][28]}`);
  ok(r3[0][27] === 0, 'grad_step 排在 grad_first 之后（grad_first 仍在第 28 列）');
  ok(/uint8_t gs = \(E->grad_step != 0u\) \? E->grad_step : 1u;/.test(hdr3) &&
     /phase\.current \+ \(int16_t\)gs/.test(hdr3),
     '生成代码：gs = E->grad_step（0 兜底成 1），相位一次加 gs —— 不是写死 +1');
  ok(!/phase\.current \+ 1\) & 0xFF/.test(hdr3), '生成代码里已经没有「写死 +1」的老写法');
}


console.log('--- B 准备：假 DOM ---');
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
    addEventListener(t, f) { (listeners[id + ':' + t] ||= []).push(f); },
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
const shown = id => { const el = byId.get(id); return !!el && el.style.display !== 'none'; };
const walk = (n, out) => { (n.children || []).forEach(c => { out.push(c); walk(c, out); }); return out; };


console.log('--- B1) 色彩配置：渐变行 + 起始色 + 顺序 + 预览条 ---');
install(); boot(); await sleep(700);
tabBtn('fx').onclick();
byId.get('fxTbl').children[0].onclick();
const colSel = byId.get('fColor');
colSel.value = String(FW.COLOR.SPECTRUM);
colSel.onchange({ target: colSel });
await sleep(700);
ok(shown('rowGrad') && shown('rowGradStart') && shown('rowGradOrder'), '渐变配色 → 三行都出来');
ok(!shown('rowPal') && shown('rowSpeed'), '渐变仍然不要调色板（只留速度）');
const gsel = byId.get('fGrad');
ok((gsel.children || []).length === 1 && gsel.value === 'g1',
   `渐变下拉里 1 条（${(gsel.children || []).map(o => o.textContent).join('/')}）`);
const startBox = byId.get('fxGradStart');
ok((startBox.children || []).length === 1 &&
   startBox.children[0].classList.contains('cchip') &&
   /^#[0-9a-f]{6}$/.test(startBox.children[0].value),
   '起始色是一个取色块（色环取色，值仍是 #rrggbb）');
const ordBox = byId.get('fxGradOrder');
const sw = () => (ordBox.children || []).filter(c => c.className === 'gord');
ok(sw().length === 6, `顺序渲染出 6 个锚点（实际 ${sw().length}）`);
ok(sw()[0].children[0].disabled === true && sw()[5].children[2].disabled === true,
   '第一个不能往前挪、最后一个不能往后挪');
const rampEl = byId.get('fxGradRamp');
ok(/^linear-gradient\(90deg,rgb\(255,0,0\)/.test(rampEl.style.background || ''),
   '预览条从红开始：' + String(rampEl.style.background).slice(0, 46));

console.log('--- B1b) 「步进(级)」：渐变才有；抬上去就把一整圈变短 ---');
{
  ok(shown('rowGradStep') && shown('fxGradStepHint'), '渐变配色 → 「步进(级)」那行 + 下面的读数都在');
  /* 这条出厂效果的「速度」是 2 拍/次 —— 先拨回 1，读数才是 256 拍，算得清 */
  const spEl = byId.get('fSpeed');
  spEl.value = '1';
  spEl.oninput({ target: spEl });
  await sleep(30);
  const gsEl = byId.get('fGradStep');
  ok(String(gsEl.value) === '1', `默认 1（实际 ${gsEl.value}）`);
  const y1 = String(byId.get('fxGradStepHint').textContent);
  ok(/= 256 拍/.test(y1) && /5\.12 秒/.test(y1), '读数：速度 1 × 步进 1 = 256 拍 ≈ 5.12 秒 —— ' + y1);
  gsEl.value = '8';
  gsEl.oninput({ target: gsEl });
  await sleep(700);
  ok(fxListOf(0)[0].grad_step === 8, `改成 8 就写进这条效果（${fxListOf(0)[0].grad_step}）`);
  const y2 = String(byId.get('fxGradStepHint').textContent);
  ok(/= 32 拍/.test(y2) && /640 毫秒/.test(y2), '读数跟着变成 32 拍 ≈ 640 毫秒 —— ' + y2);
  /* 速度也一起算：速度 4 拍 × 步进 8 → 128 拍（框里填 ms：4 拍 = 80ms） */
  spEl.value = '80';
  spEl.oninput({ target: spEl });
  await sleep(30);
  ok(/= 128 拍/.test(String(byId.get('fxGradStepHint').textContent)),
     '速度和步进一起算：4 拍/次（= 80ms）× 8 级 = 128 拍一圈');
  /* 切到纯色：步进行收起；切回渐变值还在（存在效果上，不是每次重来） */
  colSel.value = String(FW.COLOR.SOLID);
  colSel.onchange({ target: colSel });
  await sleep(30);
  ok(!shown('rowGradStep') && !shown('fxGradStepHint'), '切到纯色 → 步进行与读数都收起来');
  colSel.value = String(FW.COLOR.SPECTRUM);
  colSel.onchange({ target: colSel });
  await sleep(30);
  ok(String(byId.get('fGradStep').value) === '8' && byId.get('fSpeed').value === '80',
     '切回渐变：步进 8 / 速度 4 拍（80ms）都还在（存在效果上）');
  /* 越界夹紧：填 99 → 16，填 0 → 1（界面上有 min/max，手改 JSON / 粘数字也兜得住） */
  const gs2 = byId.get('fGradStep');
  gs2.value = '99'; gs2.oninput({ target: gs2 });
  await sleep(700);
  ok(fxListOf(0)[0].grad_step === GRAD_STEP_MAX, `填 99 夹到 ${fxListOf(0)[0].grad_step}`);
  const gs3 = byId.get('fGradStep');
  gs3.value = '0'; gs3.oninput({ target: gs3 });
  await sleep(700);
  ok(fxListOf(0)[0].grad_step === GRAD_STEP_MIN, `填 0 兜底成 ${fxListOf(0)[0].grad_step}`);
  /* 后面的用例按老样子跑：复原成 1 拍/次（20ms）+ 1 级 */
  spEl.value = '20'; spEl.oninput({ target: spEl });
  const gs4 = byId.get('fGradStep');
  gs4.value = '1'; gs4.oninput({ target: gs4 });
  await sleep(700);
  ok(fxListOf(0)[0].grad_step === 1 && (fxListOf(0)[0].speed | 0) === 1, '复原成速度 1 / 步进 1');
}

console.log('--- B1c) 「速度」在渐变下只认 1..16（一圈几十分钟 = 看着像没生效）---');
{
  /* 用户实测报的现象：「选了渐变，编辑台 / 灯板的颜色一直不变」。
   * 根因不在渐变本身（色环算法 / 渲染都正常），而是「速度」这一格多义：跳变下它是算出来的
   * 「停留(拍)」（30~60），切到渐变后被当成「每 N 拍走 1 级」→ 一圈 5 分钟。 */
  ok(String(byId.get('fSpeed').max) === String(GRAD_SPEED_MAX * 20),
     `渐变下「速度」的上限 = ${byId.get('fSpeed').max}（= 16 拍；其余配色仍 5100）`);
  const sp2 = byId.get('fSpeed');
  sp2.value = '1200'; sp2.oninput({ target: sp2 });   /* 1200ms = 60 拍 → 夹到 16 拍 */
  await sleep(700);
  ok((fxListOf(0)[0].speed | 0) === GRAD_SPEED_MAX,
     `渐变下填 1200ms 夹到 ${fxListOf(0)[0].speed} 拍（一圈 82 秒；60 拍会是一圈 307 秒）`);
  const sp3 = byId.get('fSpeed');
  sp3.value = '0'; sp3.oninput({ target: sp3 });
  await sleep(700);
  ok((fxListOf(0)[0].speed | 0) === 1, `渐变下填 0 兜底成 ${fxListOf(0)[0].speed}（不能「每 0 拍动一次」）`);
  /* 模拟真实的切换路径：先在覆盖下写一个大数（覆盖用「周期」，这一格是自由的），再切到渐变 */
  colSel.value = String(FW.COLOR.WIPE);
  colSel.onchange({ target: colSel });
  await sleep(30);
  ok(String(byId.get('fSpeed').max) === '5100', '覆盖下「速度」上限放回 5100ms（覆盖扫多快看「周期(ms/趟)」）');
  const sp4 = byId.get('fSpeed');
  sp4.value = '1200'; sp4.oninput({ target: sp4 });   /* 1200ms = 60 拍 */
  await sleep(700);
  ok((fxListOf(0)[0].speed | 0) === 60, `覆盖下 1200ms 原样存成 60 拍（${fxListOf(0)[0].speed}）`);
  colSel.value = String(FW.COLOR.SPECTRUM);
  colSel.onchange({ target: colSel });
  await sleep(700);
  ok((fxListOf(0)[0].speed | 0) === GRAD_SPEED_CUT,
     `切到渐变那一刻 60 被收进 ${fxListOf(0)[0].speed}（一圈 20 秒，一眼看得出在动；60 拍是 307 秒）`);
  ok(/渐变的速度/.test(String((byId.get('status') || {}).textContent || '')),
     '状态栏说清了为什么改：' + String((byId.get('status') || {}).textContent || '').slice(0, 40));
  /* 复原成 1 拍/次 + 1 级，后面的用例按老样子跑 */
  const sp5 = byId.get('fSpeed');
  sp5.value = '1'; sp5.oninput({ target: sp5 });
  const gs5 = byId.get('fGradStep');
  gs5.value = '1'; gs5.oninput({ target: gs5 });
  await sleep(700);
  ok((fxListOf(0)[0].speed | 0) === 1 && fxListOf(0)[0].grad_step === 1, '复原成速度 1 / 步进 1');
}

console.log('--- B2) 另存为渐变-2 + 起始色 + 自定义顺序 ---');
byId.get('fxGradSave').onclick();
await sleep(700);
const gl = projState(0).gradients;
ok(gl.list.length === 2 && gl.list[1].name === '渐变-2', `渐变库里 2 条：${gl.list.map(g => g.name).join(' / ')}`);
ok(fxListOf(0)[0].grad === gl.list[1].id, '这条效果切到了新的那条');
ok((byId.get('fGrad').children || []).length === 2 && byId.get('fGrad').value === gl.list[1].id,
   '下拉跟着选中「渐变-2」');
const si = byId.get('fxGradStart').children[0];
si.value = '#0000ff'; si.oninput({ target: si });
await sleep(700);
ok(JSON.stringify(projState(0).gradients.list[1].start) === '[0,0,255]', '起始色改成蓝（存进工程）');
ok(JSON.stringify(projState(0).gradients.list[0].start) === '[255,0,0]', '「渐变-1」的起始色没被改');
ok(/^linear-gradient\(90deg,rgb\(0,0,255\)/.test(byId.get('fxGradRamp').style.background || ''),
   '预览条跟着从蓝开始');
/* 下拉里挂上起始色：两条只差起始色时也能一眼分出谁是谁 */
{
  const txt = (byId.get('fGrad').children || []).map(o => o.textContent);
  ok(txt.some(s => s.indexOf('#0000ff') >= 0),
     '渐变下拉的选项带起始色：' + txt.join(' / '));
  ok(txt.some(s => s.indexOf('#ff0000') >= 0), '渐变-1 那边还是红的');
  ok(String(byId.get('fxGradHint').textContent).indexOf('正在编辑「渐变-2」') === 0,
     '提示行点名当前这条：' + String(byId.get('fxGradHint').textContent).slice(0, 28));
}
/* 顺序里的颜色（界面上是原地写 anchors[i]）：只动这一条 —— 放到「换顺序」之后，免得打乱它的预期 */
{
  const first = byId.get('fxGradOrder').children.filter(c => c.className === 'gord')[0];
  first.children[2].onclick();               /* 第 1 个往后挪一位 */
  await sleep(500);
  const A = projState(0).gradients.list[1].anchors;
  ok(JSON.stringify(A[0]) === '[255,255,0]' && JSON.stringify(A[1]) === '[255,0,0]',
     `换顺序：${A.map(c => '[' + c + ']').join(' ')}`);
}
{
  const g = byId.get('fxGradOrder').children.filter(c => c.className === 'gord')[1];
  const ci = g.children[1];
  ci.value = '#00ff00'; ci.oninput({ target: ci });
  await sleep(700);
  ok(JSON.stringify(projState(0).gradients.list[1].anchors[1]) === '[0,255,0]',
     '改渐变-2 顺序里的第 2 个颜色 → ' + JSON.stringify(projState(0).gradients.list[1].anchors[1]));
  ok(JSON.stringify(projState(0).gradients.list[0].anchors[1]) === '[255,255,0]',
     '渐变-1 的顺序没被带着改（还是黄）');
  ok(JSON.stringify(projState(0).gradients.list[0].start) === '[255,0,0]', '渐变-1 的起始色也没动');
}
byId.get('fxGradAdd').onclick(); await sleep(400);
ok(projState(0).gradients.list[1].anchors.length === 7, '「+」加到 7 个锚点');
byId.get('fxGradSub').onclick(); await sleep(400);
ok(projState(0).gradients.list[1].anchors.length === 6, '「−」回到 6 个');
ok(GRAD_MIN === 2 && GRAD_MAX === 8, `锚点数夹在 ${GRAD_MIN}..${GRAD_MAX} 之间`);

console.log('--- B2b) 新建：一条全新的渐变（默认顺序 + 起点红），库里已有的都不动 ---');
{
  const before = JSON.parse(JSON.stringify(projState(0).gradients.list));
  byId.get('fxGradNew').onclick();
  await sleep(500);
  const L = projState(0).gradients.list;
  ok(L.length === 3 && L[2].id === 'g3' && L[2].name === '渐变-3',
     `新建了「${L[2] && L[2].name}」（库里 ${L.length} 条）`);
  ok(JSON.stringify(L[0]) === JSON.stringify(before[0]) &&
     JSON.stringify(L[1]) === JSON.stringify(before[1]),
     '已有的两条一点没动（起始色 / 顺序都还是原样）');
  ok(JSON.stringify(L[2].start) === '[255,0,0]' && L[2].anchors.length === 6 &&
     JSON.stringify(L[2].anchors[0]) === '[255,0,0]',
     `新的那条是默认顺序 + 起点红（起点 ${JSON.stringify(L[2].start)}，${L[2].anchors.length} 个锚点）`);
  ok(fxListOf(0)[0].grad === 'g3', '这条效果已经切到新建的那条');
  const sel = byId.get('fGrad');
  ok((sel.children || []).length === 3 && sel.value === 'g3',
     '下拉里三条都在，选中的是新建的那条');
  ok(String(sel.children[2].textContent).indexOf('渐变-3（#ff0000）') === 0,
     '选项文字：' + String(sel.children[2].textContent));
  ok(String(byId.get('fxGradHint').textContent).indexOf('正在编辑「渐变-3」') === 0,
     '提示行跟着点名：' + String(byId.get('fxGradHint').textContent).slice(0, 26));
  /* 用户的实际用法：新建完把这一条改成蓝色开始 —— 只动新建的这条（渐变-2 已经是蓝起点，用绿区分） */
  const st = byId.get('fxGradStart').children[0];
  st.value = '#00ff00'; st.oninput({ target: st });
  await sleep(700);
  ok(JSON.stringify(projState(0).gradients.list[2].start) === '[0,255,0]',
     '新建那条的起始色改成绿：' + JSON.stringify(projState(0).gradients.list[2].start));
  ok(JSON.stringify(projState(0).gradients.list[1].start) === '[0,0,255]',
     '「渐变-2」还是蓝起点（没被带着改 —— 这就是「新建」和「先改再另存」的区别）');
  ok(JSON.stringify(projState(0).gradients.list[0].start) === '[255,0,0]', '「渐变-1」也还是红起点');
  /* 收尾：删掉新建的、切回渐变-2，后面的用例照旧按两条算 */
  byId.get('fxGradDrop').onclick();
  await sleep(500);
  ok(projState(0).gradients.list.length === 2, '删掉新建的那条 → 又只剩两条');
  const sel2 = byId.get('fGrad');
  sel2.value = 'g2'; sel2.onchange({ target: sel2 });
  await sleep(700);
  ok(fxListOf(0)[0].grad === 'g2', '把这条效果切回「渐变-2」（后面的用例接着用）');
}

console.log('--- B3) 模式页：绑定可以选渐变-1 / 渐变-2 ---');
tabBtn('mode').onclick();
await sleep(700);
{
  const sel = walk(byId.get('mdBinds'), [])
    .filter(n => n.tagName === 'SELECT' && (n.children || []).some(o => o.value === 'g2'));
  ok(sel.length === 1, `绑定卡上有「渐变」下拉（找到 ${sel.length} 个）`);
  const gs = sel[0];
  ok((gs.children || []).length === 2, '下拉里两条渐变都在');
  gs.value = 'g1'; gs.onchange({ target: gs });
  await sleep(700);
  const b = projState(0).modes.list[0].binds[0];
  ok(!!b.override, '换渐变会自动打开「覆盖参数」（复制一份，不动效果库）');
  ok(b.override && b.override.grad === 'g1', '绑定自己的副本记住了渐变-1');
  ok(fxListOf(0)[0].grad === 'g2', '效果库里的原效果没被改（还是渐变-2）');
}

console.log('--- B4) 关掉再打开：渐变库与绑定选择都还在 ---');
install(); boot(); await sleep(700);
{
  const st = projState(0);
  ok(st.gradients && st.gradients.list.length === 2, `重开后渐变库还是 ${st.gradients.list.length} 条`);
  ok(st.gradients.list[1].name === '渐变-2', '名字还在');
  const b = st.modes.list[0].binds[0];
  ok(b.override && b.override.grad === 'g1', '绑定的渐变选择（渐变-1）也还在');
  const hdr = exportEffectsC(st, { form: 'header', comment: 'ascii', eol: 'lf' });
  const gt = hdr.slice(hdr.indexOf('static const rgb_t led_gen_grad[]'));
  const rows = (gt.slice(0, gt.indexOf('};')).match(/^    \{ \d+, \d+, \d+ \},/gm) || []);
  ok(rows.length === 512, `导出 2 块色环 = 512 行（实际 ${rows.length}）`);
  const eb = hdr.slice(hdr.indexOf('static const led_gen_effect_t'));
  /* 行末三列是 grad_first / grad_step / smooth_ms（2026-10-23 起，第十三轮末尾又加了平滑），
     这里取倒数第 3 列 = grad_first */
  const effRows = (eb.slice(0, eb.indexOf('};')).match(/^    \{.*\},/gm) || [])
    .map(s => { const a = s.replace(/\/\*.*$/, '').replace(/[{},\s]/g, ' ').trim().split(/\s+/);
                return +a[a.length - 3]; });
  ok(effRows.some(v => v === 0) && effRows.some(v => v === 256),
     `效果行分别指向 0 / 256 两块表（${[...new Set(effRows)].join(',')}）`);
}

console.log(fails ? `\n=== ${fails} 项未通过 ===` : '\n=== 全部通过 ===');
process.exit(fails ? 1 : 0);

}
