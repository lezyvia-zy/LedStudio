/* 图层原语的 JS 行为测试 */
import fs from 'node:fs';
const CORE = new Function(fs.readFileSync('led_layout_editor.html','utf8')
  .match(/<script id="core">([\s\S]*?)<\/script>/)[1] + '\n; return CORE;')();
const { FW, FALL, LAYER, WAVE, pulseGain, bouncePos,
        genSpot, genTwinkle, genFill, genGradient, genRender, chaseSingle, zoneScaled } = CORE;
let fails = 0;
const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fails++; };

const mk = len => new Uint8Array(len);
/* 图层不再产色（「本层取色」退休）：原语只写 mask，不碰 hue[]。
   lap = 往返的「第几圈」（0 = 正着走的那几圈 / 1 = 倒着走的那几圈），不勾往返时无效。 */
const SP = (m, len, pos, L, g, lap) => genSpot(m, len, pos,
  Object.assign({ kind:'spot', count:1, width:8, phase:0, falloff:FALL.COS, pulse_period:0,
                  pulse_amp:0, wave:0, direction:1, bounce:0, spans:0, rotate:0, flags:1, spacing:0 }, L),
  g || 255, lap || 0);

/* ---- 1) SPOT(count=1, 硬边, 无脉动) 仍必须逐字节等于 chaseSingle ----
 * 内建「单点追逐」= 一条平顶光带（带内一律 255，带外 0，无边缘衰减），
 * 等价于一个 count=1 / falloff='hard' 的光点层 —— 这条等式就是它的定义。 */
console.log('--- SPOT(count=1, 硬边) == chaseSingle（平顶光带）---');
let allEq = true, cases = 0;
for (const len of [8, 24, 40]) for (const w of [1, 3, 10, 16, 40]) {
  const sw = zoneScaled(w, len, 1);
  for (let pos = 0; pos < len * 256; pos += 37) {
    const a = mk(len), b = mk(len);
    chaseSingle(a, len, pos, sw);
    SP(b, len, pos, { width: w, falloff: FALL.HARD });
    cases++;
    for (let i = 0; i < len; i++) if (a[i] !== b[i]) allEq = false;
  }
}
ok(allEq, `全部 ${cases} 组 (len x width x pos) 与 chaseSingle 完全一致`);
ok(CORE.chaseCosBand !== undefined, '旧余弦窗另有一份 chaseCosBand（双点/摆动的预览还用它）');

/* ---- 1b) 平顶光带该有的样子：覆盖范围与旧余弦窗一样，带内一律满亮、没有中间值 ---- */
console.log('--- 平顶光带语义 ---');
{
  const len = 24, w = 10, sw = zoneScaled(w, len, 1);
  const m = mk(len), cos = mk(len);
  chaseSingle(m, len, 0, sw);
  CORE.chaseCosBand(cos, len, 0, sw);
  let lit = 0, allMax = true, sameSupport = true;
  for (let i = 0; i < len; i++) {
    if (m[i] !== 0) lit++;
    if (m[i] !== 0 && m[i] !== 255) allMax = false;      /* 不许出现中间亮度 */
    if ((m[i] > 0) !== (cos[i] > 0)) sameSupport = false; /* 亮的那几颗不许变 */
  }
  ok(lit > 0 && allMax, `光宽 ${w} / ${len} 颗：${lit} 颗全亮 255，没有中间亮度（旧余弦窗 0..254 都有）`);
  ok(sameSupport, '点亮的灯位与旧余弦窗完全一致（只提亮，不改变光带覆盖范围）');

  /* 每推进一颗灯，光带整体挪一格（亮的灯位集合整体 +1） */
  const s0 = [...m], s1 = mk(len);
  chaseSingle(s1, len, 256, sw);
  let okShift = true;
  for (let i = 0; i < len; i++) if ((s1[i] > 0) !== (s0[(i - 1 + len) % len] > 0)) okShift = false;
  const lastLit = a => { let r = -1; for (let i = 0; i < len; i++) if (a[i] > 0) r = i; return r; };
  ok(okShift, `pos 加 256 → 亮的灯位整体 +1（末亮灯 ${lastLit(s0)} → ${lastLit(s1)}）`);

  /* 回绕：光带跨过 0 号灯时不许断 */
  const wr = mk(len);
  chaseSingle(wr, len, 0, sw);
  let wrapLit = 0;
  for (let i = 0; i < len; i++) if (wr[i] > 0) wrapLit++;
  ok(wrapLit === lit, `跨 0 号灯时光带不断（恒 ${lit} 颗）`);

  /* 光带挪到别处时，环上其余灯位必须干干净净是 0 */
  const far = mk(len);
  chaseSingle(far, len, len * 128, sw);
  let cnt = 0;
  for (let i = 0; i < len; i++) if (far[i] > 0) cnt++;
  ok(cnt === lit, `光带在环上任意位置都只有这 ${lit} 颗（带外全是 0，没有残留）`);
}

/* ---- 2) 波形 ---- */
console.log('--- 脉动波形 ---');
ok(pulseGain(0, 0, 255, 0) === 255, 'period=0 恒 255');
ok(pulseGain(0, 40, 255, WAVE.TRI) === 255 && pulseGain(20, 40, 255, WAVE.TRI) === 0, '三角：起点满亮，半周期最暗');
ok(pulseGain(0, 40, 255, WAVE.SQUARE) === 255 && pulseGain(19, 40, 255, WAVE.SQUARE) === 255, '方波前半全亮');
ok(pulseGain(20, 40, 255, WAVE.SQUARE) === 0 && pulseGain(39, 40, 255, WAVE.SQUARE) === 0, '方波后半全灭（闪烁）');
ok(pulseGain(0, 40, 255, WAVE.SAW) === 255 && pulseGain(39, 40, 255, WAVE.SAW) < 20,
   `锯齿：从最亮渐暗到最暗再跳回 (${pulseGain(0,40,255,WAVE.SAW)} -> ${pulseGain(39,40,255,WAVE.SAW)})`);
ok(pulseGain(20, 40, 0, WAVE.SQUARE) === 255, 'amp=0 时任何波形都不脉动');

/* ---- 3) 往返 ---- */
console.log('--- 往返（乒乓）---');
{
  const span = 1000;
  ok(bouncePos(0, span) === 0, 'bounce(0) = 0');
  ok(bouncePos(500, span) === 500, 'bounce(500) = 500（前半直走）');
  ok(bouncePos(1000, span) === 1000, 'bounce(1000) = 1000（走到头）');
  ok(bouncePos(1500, span) === 500, `bounce(1500) = ${bouncePos(1500, span)}（回头）`);
  ok(bouncePos(2000, span) === 0, 'bounce(2000) = 0（回到起点）');
  ok(bouncePos(-250, span) === 250, `bounce(-250) = ${bouncePos(-250, span)}（负值也对）`);
}
{
  const len = 24, seen = [];
  for (let k = 0; k < len * 2; k++) {
    const m = mk(len);   /* 原语是逐点取最大，必须用干净缓冲 */
    /* pos 每拍 +1 颗；走过接缝（一整圈）就进「倒着走」的那一圈（lap 翻 0→1） */
    SP(m, len, (k % len) * 256, { width: 4, bounce: 1 }, 255, Math.floor(k / len) & 1);
    let bn = 0, bb = -1;
    for (let i = 0; i < len; i++) if (m[i] > bb) { bb = m[i]; bn = i; }
    seen.push(bn);
  }
  const mn = Math.min.apply(null, seen), mx = Math.max.apply(null, seen);
  ok(mn >= 0 && mx <= len - 1, `往返光点始终在环内 (${mn}..${mx})`);
  const up   = seen.some((v, i) => i && v > seen[i-1]);
  const down = seen.some((v, i) => i && v < seen[i-1]);
  ok(up && down, '光点确实来回（既有增也有减），不是单向绕圈');
}
/* ---- 3b) 往返 = 走到**最后一颗灯**（绕满一整圈）才掉头，一个来回 = 两圈
 * 2026-10-27 两轮修正：
 *   1. 以前拿 rd（整环）当 span 折已经绕回 [0,rd) 的 pos，bouncePos 恒等 → 勾了等于没勾；
 *   2. 后来改成拿半圈当 span，就成了「走到对面就掉头」（用户：「走到了一半就掉头了」）。
 * 环上没有「头」，走到了头只能是**绕满一圈**。可 pos 早被绕回 [0, rd)，光看它分不出走了
 * 几圈 —— 所以圈数由 instTick 数（跨接缝翻 lap），这里用 lap 分别验奇偶两圈。 */
console.log('--- 往返：走到最后一颗灯才掉头（一个来回 = 两圈）---');
{
  const len = 24, rd = len * 256;
  let fwdSame = true, backMirror = true, moved = false;
  for (let pos = 0; pos < rd; pos += 97) {
    const a = mk(len), b = mk(len), c = mk(len), d = mk(len);
    SP(a, len, pos,      { width: 4, bounce: 1 }, 255, 0);   /* 正着走的那一圈 */
    SP(b, len, pos,      { width: 4, bounce: 0 });           /* 绕圈 */
    SP(c, len, pos,      { width: 4, bounce: 1 }, 255, 1);   /* 倒着走的那一圈 */
    SP(d, len, rd - pos, { width: 4, bounce: 0 });           /* 绕圈在「整环 − pos」处 */
    for (let i = 0; i < len; i++) {
      if (a[i] !== b[i]) fwdSame = false;
      if (c[i] !== d[i]) backMirror = false;
      if (a[i] !== c[i]) moved = true;
    }
  }
  ok(fwdSame, '偶数圈（lap=0）与「绕圈」逐字节相同（前一圈就是正常绕一圈）');
  ok(backMirror, '奇数圈（lap=1）= 绕圈在「整环 − pos」处 = 照原路走回来');
  ok(moved, '正走与倒走确实不同（往返真的接上了）');
}
{
  const len = 24, seen = [];
  const L = { width: 4, bounce: 1, falloff: FALL.COS };
  for (let k = 0; k < len * 4; k++) {
    const m = mk(len);
    SP(m, len, (k % len) * 256, L, 255, Math.floor(k / len) & 1);
    let pk = 0, pv = -1;
    for (let i = 0; i < len; i++) if (m[i] > pv) { pv = m[i]; pk = i; }
    seen.push(pk);
  }
  ok(Math.max.apply(null, seen) === len - 1,
     `走到环的最后一颗灯（最远到第 ${Math.max.apply(null, seen) + 1} 颗 / 共 ${len} 颗）`);
  let mono = true;
  for (let k = 1; k < len; k++) if (seen[k] !== seen[k - 1] + 1) mono = false;
  ok(mono, '第 1 圈一路往前，中途不掉头（半圈折返会在这里就开始减）');
  let back = true;
  /* 第 len+1 拍是「跨过接缝」那一步（0 号灯 → 最后一颗），从 len+2 开始才是每拍 −1 */
  for (let k = len + 2; k < 2 * len; k++) if (seen[k] !== seen[k - 1] - 1) back = false;
  ok(back, '第 2 圈照原路倒着走回来（每拍 −1 颗）');
  ok(seen[len] === 0 && seen[2 * len] === 0, `掉头点落在接缝（第 ${len} / ${2 * len} 拍 = 0 号灯）`);
}
/* ---- 3c) 应用路径：往返靠 instTick 数圈数（跨接缝翻 inst.lap）----
 * 光点层只认 lap 这个入参，真正「走了几圈」得由推进逻辑给：这一段用真实实例跑
 * （24 颗、慢档 8 拍/颗 → 192 拍一圈），确认圈数会翻、并且真的摆到最后一颗灯。 */
console.log('--- 往返：整圈数由 instTick 数（应用路径）---');
{
  const { instNew, instTick, layerNums, renderZoneMaskTo } = CORE;
  const len = 24, inst = instNew();
  inst.anim.type = FW.ANIM_COUNT;         /* 自定义动效的分支（default → genRender） */
  inst.anim.layers = [layerNums({ kind:'spot', count:1, width:4, falloff:'cos',
                                  direction:1, bounce:1, spacing:0, en:1, phase:0 })];
  inst.anim.moves = true;                 /* 与 C 的 led_gen_effects[eff].moves 一致 */
  inst.speed_slow = 8; inst.speed_cur = 8;
  const mask = new Uint8Array(len), hue = new Uint8Array(len);
  const peaks = [];
  let flippedAt = -1, firstLap = 0;
  for (let t = 1; t <= 3 * 192; t++) {
    const before = inst.lap;
    instTick(inst);
    if (inst.lap !== before && flippedAt < 0) { flippedAt = t; firstLap = inst.anim.position.current; }
    /* 与 renderAllSim 同一套「位置 → 分区位置」换算 */
    let z = Math.trunc((inst.anim.position.current * len) / FW.RING_SIZE);
    if (z < 0) z += len * 256; else if (z >= len * 256) z -= len * 256;
    renderZoneMaskTo(inst, mask, hue, len, z);
    let pk = 0, pv = -1;
    for (let i = 0; i < len; i++) if (mask[i] > pv) { pv = mask[i]; pk = i; }
    peaks.push(pk);
  }
  ok(flippedAt > 150 && flippedAt < 240, `跨过接缝时翻圈（第 ${flippedAt} 拍，一圈 192 拍左右）`);
  ok(Math.abs(firstLap) <= 256, `翻圈那一刻正落在接缝附近（current = ${firstLap}）`);
  ok(Math.max.apply(null, peaks) === len - 1,
     `真的摆到最后一颗灯（最远第 ${Math.max.apply(null, peaks) + 1} 颗 / 共 ${len} 颗）`);
  /* 掉头之后（第 2 圈）必须往回走：同一条环上越走越小 */
  const pA = peaks[flippedAt + 20], pB = peaks[flippedAt + 170];
  ok(pB < pA, `第 2 圈往回走（第 ${pA + 1} 颗 → 第 ${pB + 1} 颗，越走越小）`);
}

/* ---- 4) 多点 / TAIL ---- */
console.log('--- 多点与拖尾 ---');
{
  const len = 24, m = mk(len);
  SP(m, len, 0, { count: 3, width: 2 });
  let peaks = 0;
  for (let i = 0; i < len; i++) if (m[i] > 200 && m[(i + 1) % len] <= 200) peaks++;
  ok(peaks === 3, `count=3 亮点峰数 = ${peaks}`);
}
{
  const len = 24, m = mk(len);
  SP(m, len, 0, { count: 1, width: 4, falloff: FALL.TAIL, direction: 1 });
  let peakAt = 0, peak = 0;
  for (let i = 0; i < len; i++) if (m[i] > peak) { peak = m[i]; peakAt = i; }
  /* 正方向 = 朝灯号增大的方向走 → 身后就是灯号更小的那一侧。
   * （2026-10-27 修：以前尾甩在前面，彗星看着像倒着飞。） */
  let behind = 0, ahead = 0;
  for (let i = 1; i < 10; i++) {
    behind += m[(peakAt - i + len) % len];
    ahead  += m[(peakAt + i) % len];
  }
  ok(peak === 255, '拖尾头部达 255');
  ok(behind > ahead, `单边拖尾：尾拖在身后（身后 ${behind} > 前方 ${ahead}）`);
}

/* ---- 4b) 方向：反向 = 从环的另一头出发（整条反着走）
 * 2026-10-27 修：以前只拿它翻拖尾的边，余弦 / 线性 / 硬边三种曲线下勾哪个都一模一样。 */
console.log('--- 方向（反向 = 位置镜像）---');
{
  const len = 24, rd = len * 256;
  let mirror = true, differs = false;
  for (let pos = 0; pos < rd; pos += 97) {
    const a = mk(len), b = mk(len), c = mk(len);
    SP(a, len, pos,      { width: 8, direction: 0 });
    SP(b, len, rd - pos, { width: 8, direction: 1 });
    SP(c, len, pos,      { width: 8, direction: 1 });
    for (let i = 0; i < len; i++) {
      if (a[i] !== b[i]) mirror = false;
      if (a[i] !== c[i]) differs = true;
    }
  }
  ok(mirror, '反向在 pos == 正方向在「整环 - pos」（照着环镜像，走的是反方向）');
  ok(differs, '反向与正方向画面确实不同（余弦窗下也看得出来）');
}

/* ---- 4b) 光点间距（spacing）：0 = 均布，> 0 = 固定中心距 ----
 * 「多点追逐」要几个点聚成一段一起跑时用 —— 均布只有「整环 ÷ 点数」一个值。 */
console.log('--- 光点间距（spacing）---');
{
  const len = 24;
  /* 均布：4 个点相隔 24/4 = 6 颗（genSpot 只做 max 叠亮、不清屏，每个 case 用新 mask） */
  const m = mk(len);
  SP(m, len, 0, { count: 4, width: 1, falloff: FALL.HARD, spacing: 0 });
  const at = [];
  for (let i = 0; i < len; i++) if (m[i] > 0) at.push(i);
  ok(at.join(',') === '0,6,12,18', `spacing=0（均布）：亮点在 ${at.join(',')}`);
  /* 固定间距 3 颗：4 个点挤在前 12 颗里 */
  const m3 = mk(len);
  SP(m3, len, 0, { count: 4, width: 1, falloff: FALL.HARD, spacing: 3 });
  const at3 = [];
  for (let i = 0; i < len; i++) if (m3[i] > 0) at3.push(i);
  ok(at3.join(',') === '0,3,6,9', `spacing=3：亮点在 ${at3.join(',')}（聚成一段）`);
  /* 间距大于均布值：点拉开到 8 颗 → 0/8/16 加上绕回来盖在 0 上的第 4 个 */
  const m8 = mk(len);
  SP(m8, len, 0, { count: 4, width: 1, falloff: FALL.HARD, spacing: 8 });
  const at8 = [];
  for (let i = 0; i < len; i++) if (m8[i] > 0) at8.push(i);
  ok(at8.join(',') === '0,8,16', `spacing=8：亮点在 ${at8.join(',')}（第 4 个绕回 0，取最大值）`);
  /* 按 24 灯标称等比缩放：同样 spacing=6 到 48 灯的分区 = 12 颗 */
  const m48 = mk(48);
  SP(m48, 48, 0, { count: 4, width: 1, falloff: FALL.HARD, spacing: 6 });
  const at48 = [];
  for (let i = 0; i < 48; i++) if (m48[i] > 0) at48.push(i);
  ok(at48.join(',') === '0,12,24,36', `48 灯分区：spacing=6 等比缩放成 12 颗 → ${at48.join(',')}`);
  /* 间距调成 0 / 不填 = 老存档行为（均布），逐字节不变 */
  const a0 = mk(len), aOld = mk(len);
  const baseL = { count: 3, width: 4, phase: 0, falloff: FALL.COS, pulse_period: 0, pulse_amp: 0,
                  wave: 0, direction: 1, bounce: 0 };
  genSpot(a0,   len, 100, Object.assign({ spacing: 0 }, baseL), 255);
  genSpot(aOld, len, 100, baseL, 255);              /* 老存档：压根没有 spacing 字段 */
  ok(a0.join(',') === aOld.join(','), 'spacing=0 与「没有 spacing 字段」（老存档）逐值相同');
}


/* ---- 5) FILL 呼吸 ---- */
console.log('--- 填充 / 呼吸 ---');
{
  const len = 24, L = { kind:'fill', level:200, pulse_period:40, pulse_amp:255, wave:WAVE.TRI };
  const m = mk(len);
  genFill(m, len, L, pulseGain(0, 40, 255, WAVE.TRI));
  ok(m.every(v => v === 200), 'tick=0 整环 = level');
  const m2 = mk(len);
  genFill(m2, len, L, pulseGain(20, 40, 255, WAVE.TRI));
  ok(m2.every(v => v === 0), '半周期整环 = 0（呼吸到最暗）');
}
{
  const len = 16, m = mk(len);
  genFill(m, len, { kind:'fill', level:200, pulse_period:0, pulse_amp:255 }, 255);
  ok(m.every(v => v === 200), 'period=0 不脉动');
}

/* ---- 6) 渐变层 ---- */
console.log('--- 亮度渐变 ---');
{
  const len = 32, m = mk(len);
  genGradient(m, len, { kind:'gradient', lo:0, hi:255, spans:1, phase:0, wave:WAVE.TRI, rotate:0 }, 0);
  ok(m[0] < 20 && m[len/2] > 240 && m[len-1] < 20,
     `三角渐变：两头暗中间亮 (${m[0]}, ${m[len/2]}, ${m[len-1]})`);
}
{
  const len = 32, m = mk(len);
  genGradient(m, len, { kind:'gradient', lo:0, hi:255, spans:1, phase:0, wave:WAVE.SAW, rotate:0 }, 0);
  ok(m[0] < 20 && m[len-1] > 230, `锯齿渐变：一路升到顶 (${m[0]} -> ${m[len-1]})`);
}
{
  const len = 32, a = mk(len), b = mk(len);
  const L = { kind:'gradient', lo:0, hi:255, spans:1, phase:0, wave:WAVE.SAW, rotate:4 };
  genGradient(a, len, L, 0);
  genGradient(b, len, L, 8);
  ok(a.some((v, i) => v !== b[i]), '旋转参数能改变图案');
  const c = mk(len);
  genGradient(c, len, { kind:'gradient', lo:0, hi:255, spans:1, phase:128, wave:WAVE.SAW, rotate:0 }, 0);
  ok(c.some((v, i) => v !== a[i]), '起始位能改变图案');
}
/* Q8 分数相位：1 拍只挪 1/3 级，只有一部分灯 +1 —— 旧写法（相位 floor 成整数）
 * 两帧完全相同（rot 还是 0），所以整条灯只能「3 拍一起跳一格」，看着一顿一顿。 */
{
  const len = 24, a = mk(len), b = mk(len);
  const L = { kind:'gradient', lo:20, hi:255, spans:2, phase:0, wave:WAVE.SAW, rotate:3 };
  genGradient(a, len, L, 0);
  genGradient(b, len, L, 1);
  const ch = [];
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) ch.push(i);
  ok(ch.length > 0 && ch.length < len,
     `Q8 分数相位：1 拍只挪 1/3 级，只有 ${ch.length}/${len} 颗灯 +1（不是整条一起跳）`);
}
/* 旋转方向（2026-10-30 用户：「把现在的旋转方向反过来，让最亮的在前，然后依次减弱亮度」）：
 * rot8 取负 → 图案按「灯号 +1」走：最亮那一端领跑，身后（灯号更小的那边）依次变暗。
 * 实测 len=24 / spans=1 / rotate=4：t0 最亮在 23，转 1 级后最亮在 0、整条低 1 级。 */
{
  const len = 24, a = mk(len), b = mk(len);
  const L = { kind:'gradient', lo:0, hi:255, spans:1, phase:0, wave:WAVE.SAW, rotate:4 };
  genGradient(a, len, L, 0);
  genGradient(b, len, L, 4);
  const iMax = m => { let p = 0; for (let i = 1; i < m.length; i++) if (m[i] > m[p]) p = i; return p; };
  ok(iMax(a) === 23 && iMax(b) === 0,
     `反向旋转：最亮端按「灯号 +1」走（t0 在 ${iMax(a)}、转 1 级后到 ${iMax(b)}）—— 亮头领跑、暗尾在后面`);
  ok(b[23] === 244 && b[0] === 255, `反向旋转：整条比上一拍低 1 级、亮头在 0（${b[0]}/${b[23]}）`);
}
/* 「两段渐变」（2026-10-30）：渐变层铺 2 段以上时，第 1、3…段用「第一段渐变」、
 * 第 2、4…段用「第二段渐变」—— 两段颜色完全独立；某段没选就跟效果「色彩配置」。 */
{
  const I = CORE.instNew();
  I.color.type = CORE.FW.COLOR.SPECTRUM;
  I.color.current = { r: 9, g: 9, b: 9 };
  I.color.phase = 10;
  I.grad1 = Array.from({ length: 256 }, (_, k) => ({ r: 0, g: k, b: 0 }));
  I.grad2 = Array.from({ length: 256 }, (_, k) => ({ r: k, g: 0, b: 0 }));
  I.g2Spans = 2;
  const hue = new Uint8Array(24).fill(0xFF);
  const a0 = CORE.effectColorAt(I, 0, 24, hue);     /* 第 1 段 → 第一段渐变第 10 级 */
  const b0 = CORE.effectColorAt(I, 12, 24, hue);    /* 第 2 段 → 第二段渐变第 10 级 */
  const a6 = CORE.effectColorAt(I, 6, 24, hue);     /* 第 1 段中段：与段首同色（每段整体一个颜色） */
  ok(a0.g === 10 && b0.r === 10 && a6.g === 10,
     `两段各用各的色环、每段整体一个颜色：第 1 段 ${a0.r},${a0.g},${a0.b}（段中也是 ${a6.g}）/ 第 2 段 ${b0.r},${b0.g},${b0.b}`);
  I.grad1 = null;                                   /* 第 1 段没选 → 跟效果配色 */
  ok(CORE.effectColorAt(I, 0, 24, hue).r === 9 && CORE.effectColorAt(I, 12, 24, hue).r === 10,
     '只设了第二段：第 1 段仍跟效果色彩配置');
  /* 颜色分界跟着「旋转」一起走：转满一整段后，同一颗灯的段号翻面（换用另一条色环） */
  I.grad1 = Array.from({ length: 256 }, (_, k) => ({ r: 0, g: k, b: 0 }));
  I.gRot = 4; I.flow_tick = 1024;                   /* k = 1024×256/4 = 65536 = 正好一段 */
  const post = CORE.effectColorAt(I, 0, 24, hue);
  ok(post.r === 10, `转满一段后第 1 颗灯改用第二段色环（rgb ${post.r},${post.g},${post.b}）—— 颜色跟着光带走`);
  I.gRot = 0; I.flow_tick = null;
}

/* ---- 随机闪：慢档「快亮慢灭」/ 快档老样式 ---- */
console.log('--- 随机闪（慢档火花 / 快档老样式）---');
{
  const len = 24;
  const L = { kind:'twinkle', density:48, rate:4, lo:0, hi:255, tw_max:3, tw_on:2, tw_fade:8 };
  let maxLit = 0, sawDecay = false, sameLevel = true, prev = new Uint8Array(len);
  for (let t = 0; t < 60; t++) {
    const m = mk(len); genTwinkle(m, len, L, t, 0);
    const lit = Array.from(m).filter(v => v > 0);
    maxLit = Math.max(maxLit, lit.length);
    if (lit.length >= 2 && lit.some(v => v !== lit[0])) sameLevel = false;
    for (let i = 0; i < len; i++) if (prev[i] > 0 && m[i] > 0 && m[i] < prev[i]) sawDecay = true;
    prev = m;
  }
  ok(maxLit <= L.tw_max, `慢档同时点亮 ${maxLit} 颗 ≤ 上限 ${L.tw_max}`);
  ok(sameLevel, '同一发烟花里的几颗亮度相同（一起亮、一起渐灭）');
  ok(sawDecay, '慢档有渐暗：同一颗灯后一拍比前一拍暗（快亮慢灭）');

  const f = mk(len); genTwinkle(f, len, L, 10, 1);
  ok(f.filter(v => v > 0).length > L.tw_max, `快档按密度铺更多灯（${f.filter(v => v > 0).length} 颗 > ${L.tw_max}）`);

  /* 慢档「独立」样式：每颗灯各自随机，同一帧里各灯亮度不同、也会有全灭帧 */
  const L2 = Object.assign({}, L, { tw_mode: 1 });
  let diff = false;
  const counts = new Set();
  for (let t = 0; t < 120; t++) {
    const m = mk(len); genTwinkle(m, len, L2, t, 0);
    const lit = Array.from(m).filter(v => v > 0);
    counts.add(lit.length);
    if (lit.length >= 2 && lit.some(v => v !== lit[0])) diff = true;
  }
  ok(diff, '独立样式：同一帧亮着的灯亮度各不相同（不是群闪）');
  ok(counts.size >= 3, `独立样式：亮灯数每帧都在变（${[...counts].join(',')}）`);
}

/* ---- 7) 图层不产色：渲染原语一律不碰 hue[]（「本层取色」已退休）---- */
console.log('--- 图层不产色（颜色全归效果级配色）---');
{
  const len = 24, m = mk(len); const h = new Uint8Array(len).fill(0xAB);
  const layers = [
    { kind:LAYER.FILL, level:100, pulse_period:0, pulse_amp:0, wave:0, direction:1, bounce:0, spans:0, rotate:0, flags:1 },
    { kind:LAYER.SPOT, count:1, width:6, phase:0, falloff:FALL.COS, pulse_period:0, pulse_amp:0,
      wave:0, direction:1, bounce:0, spans:0, rotate:0, flags:1 },
  ];
  genRender(m, len, 0, layers, 0, 0);
  ok(h.every(v => v === 0xAB), 'genRender 不再写 hue[]（哨兵由 renderZoneMaskTo 统一填）');
  ok(Math.max(...m) > 200, `亮度照常合成（最大 ${Math.max(...m)}）`);
  /* 老存档里残留的 cmode / hue_* 不再有任何影响：同一层带不带它们，亮度逐字节相同 */
  const m1 = mk(len), m2 = mk(len);
  genRender(m1, len, 0, [layers[1]], 0, 0);
  genRender(m2, len, 0, [Object.assign({}, layers[1], { cmode:1, hue_base:0, hue_spread:255, hue_speed:3 })], 0, 0);
  ok(JSON.stringify([...m1]) === JSON.stringify([...m2]), '老字段 cmode / hue_* 已被忽略（渲染逐字节相同）');
}

/* ---- 8) 起始位（offset）---- */
console.log('--- 起始位 ---');
{
  const len = 40, m = mk(len);
  const layers = [{ kind:LAYER.SPOT, count:1, width:4, phase:0, falloff:FALL.COS, pulse_period:0, pulse_amp:0,
                    wave:0, direction:1, bounce:0, spans:0, rotate:0, flags:1 }];
  const at = off => { genRender(m, len, 0, layers, 0, off); return m.indexOf(Math.max.apply(null, m)); };
  const a0 = at(0), a10 = at(10), a20 = at(20);
  ok(a0 !== a10 && a10 !== a20, `起始位把光点挪开了: ${a0} -> ${a10} -> ${a20}`);
  const back = at(255);
  ok(Math.abs(back - a0) <= 1, `offset=255 绕回起点附近 (${back} vs ${a0})`);
}

/* ---- 9) 边界与性质 ---- */
console.log('--- 边界与性质 ---');
{
  const m = mk(1);
  SP(m, 1, 0, { width: 1 });
  ok(m[0] === 254, `len=1 单灯 = ${m[0]}（254 是对的：cos_window_tbl[0] 本身是 254）`);
}
{
  const len = 24, m = mk(len);
  SP(m, len, 0, { count: 32, width: 1 });
  ok(m.every(v => v <= 255), 'count=32 不溢出');
  const m2 = mk(len);
  SP(m2, len, 0, { width: 255, phase: 255 });
  ok(m2.every(v => v <= 255), 'width=255 / phase=255 不溢出');
}
{
  let bad = 0, maxSeen = 0;
  const kindsSeen = new Set();
  for (let t = 0; t < 600; t++) {
    const len = [8, 16, 24, 40][t % 4];
    const layers = [];
    const n = 1 + (t % 3);
    for (let k = 0; k < n; k++) {
      const kind = (t + k) % 4;
      kindsSeen.add(kind);
      layers.push({
        kind, spans: 1 + ((t+k)%3), rotate: (t*5)%12,
        pulse_period: (t*3+k)%40, pulse_amp: (t*11+k)%256,
        wave: (t+k)%3, direction: (t+k)%2, bounce: (t+k)%2,
        lo: (t*5)%200, hi: 200 + ((t*3)%55), level: (t*31)%256,
        density: (t*17)%256, rate: 1+(t%8), count: (t*7+k)%32,
        width: (t*13+k)%64, phase: (t*29+k)%256, falloff: (t+k)%4 });
    }
    const pos = (t * 333) % (len * 256), tick = (t * 77) & 0xFFFF;
    const m1 = mk(len), m2 = mk(len);
    genRender(m1, len, pos, layers, tick, t % 256);
    genRender(m2, len, pos, layers, tick, t % 256);
    for (let i = 0; i < len; i++) {
      if (m1[i] > 255) bad++;
      if (m1[i] !== m2[i]) bad++;
      maxSeen = Math.max(maxSeen, m1[i]);
    }
  }
  ok(bad === 0, `600 组随机效果：无越界、结果确定（最大 ${maxSeen}）`);
  ok(kindsSeen.size === 4, `四种图层都被覆盖到 (${[...kindsSeen].sort().join(',')})`);
}
{
  const len = 24, m = mk(len);
  genRender(m, len, 0, [], 0, 0);
  ok(m.every(v => v === 0), '空图层表 → 全黑');
  genRender(m, len, 0, null, 0, 0);
  ok(m.every(v => v === 0), '图层为 null 不崩');
}

/* ---- 8b) F5) 旁路的层（en=0）不参与合成：效果与「压根没这层」逐字节相同 ---- */
console.log('--- 图层旁路（en=0）---');
{
  const { layerNums } = CORE;
  const base = { count:1, width:2, phase:0, falloff:FALL.COS, pulse_period:0, pulse_amp:0,
                 wave:0, direction:1, bounce:0, spans:0, rotate:0, flags:1 };
  const fill = layerNums(Object.assign({ kind:'fill', level:100 }, base));
  const spotOff = layerNums(Object.assign({ kind:'spot' }, base, { en:0 }));
  const spotOn  = layerNums(Object.assign({ kind:'spot' }, base));
  const len = 24;
  const run = lss => { const m = mk(len); genRender(m, len, 0, lss, 0, 0); return [m]; };

  const [mA] = run([fill, spotOff]);      /* 旁路的层：应等同于没有它 */
  const [mB] = run([fill]);
  ok(JSON.stringify([...mA]) === JSON.stringify([...mB]),
     'en=0 的层与「删掉这一层」的 mask 逐字节相同');
  ok(mA.every(v => v === 100), `只剩填充层时整环 = 100（说明光点层确实没叠上来）`);
  const [mC] = run([fill, spotOn]);
  ok(Math.max(...mC) > 200, `同一层不旁路时最大亮度 = ${Math.max(...mC)}（光点确实会叠上来）`);
  /* en 缺省 = 启用：老存档里没有这个字段（migration 之前的工程） */
  const old = layerNums(Object.assign({ kind:'spot' }, base));
  delete old.en;
  const [mD] = run([fill, old]);
  ok(Math.max(...mD) > 200, `缺少 en 字段的旧数据按「启用」渲染（最大 ${Math.max(...mD)}，不做迁移也安全）`);

  /* V37：整条效果的层都被旁路 → 校验页要提醒（渲染出来是全黑） */
  const L0 = { kind:'spot', en:1, count:1, width:4, phase:0, falloff:'cos', pulse_period:0, pulse_amp:0,
               density:48, rate:4, lo:0, hi:255, level:255, spans:0, rotate:0,
               hue_base:0, hue_spread:0, hue_speed:0, wave:0, cmode:0, flags:1 };
  const st2 = CORE.emptyProject();
  st2.effects.list.push({ id:'fx_bp', name:'旁路测试', kind:'custom', layers:[{ ...L0 }, { ...L0, en:0 }] });
  let iss = CORE.validate(st2);
  ok(!iss.some(i => i.code === 'V37'), '还有一层启用着 → 不报 V37');
  st2.effects.list[st2.effects.list.length - 1].layers[0].en = 0;
  iss = CORE.validate(st2);
  const v37 = iss.filter(i => i.code === 'V37');
  ok(v37.length === 1 && v37[0].level === 'warn' && /旁路/.test(v37[0].msg),
     `全层旁路 → V37 警告: ${v37[0] ? v37[0].msg : '(没报)'}`);
}

/* ---- 9) 速度档信号链：ring 级 → 实例（对应固件 ring_set_audio_level()）---- */
console.log('--- 速度档（ring 级 → 实例）---');
{
  const { simInit, instNew, ringIsFast, instSpeedFromRing, simSetSpeed, simSyncSpeed } = CORE;
  const sim = simInit();
  sim.insts = [Object.assign(instNew(), { speed_slow: 8, speed_fast: 1, speed_cur: 8 })];
  ok(ringIsFast(sim) === false, 'ring_init 的默认档位（8/1/8）算慢档');
  ok(instSpeedFromRing(sim.insts[0], sim) === 8, '慢档：实例用自己配的 slow');
  simSetSpeed(sim, 'fast');
  ok(sim.speed_cur === 1 && sim.insts[0].speed_cur === 1, '有声音（切快档）：ring 级与实例一起变成 1');
  ok(instSpeedFromRing(sim.insts[0], sim) === 1, '快档：实例用自己配的 fast');
  /* 各效果用各自的数值：再加一个 slow=40 / fast=5 的实例 */
  sim.insts.push(Object.assign(instNew(), { speed_slow: 40, speed_fast: 5, speed_cur: 40 }));
  simSyncSpeed(sim);
  ok(sim.insts[1].speed_cur === 5, '同一个档位下，各效果仍用自己配的 fast（slow40/fast5 → 5）');
  simSetSpeed(sim, 'slow');
  ok(sim.insts[1].speed_cur === 40, '回慢档：slow40/fast5 的实例用 40');
  /* 退化保护：fast 并不比 slow 快时一律慢档（与打补丁前行为一致） */
  sim.speed_slow = 8; sim.speed_fast = 8; sim.speed_cur = 8;
  simSyncSpeed(sim);
  ok(sim.insts[0].speed_cur === 8, '参数退化（fast == slow）时按慢档走，不切档');
}

/* ---- 9b) 音乐音量 → 速度档：FFTLevel > LED_FFT_THRESHOLD（固件那句判据）---- */
console.log('--- FFTLevel → 速度档（> 阈值才快）---');
{
  const { FW, simInit, instNew, ringSpeedFromAudio, simSetAudioLevel, simTick, fftThreshold } = CORE;
  ok(FW.LED_FFT_THRESHOLD === 4, `阈值就是固件的 LED_FFT_THRESHOLD = ${FW.LED_FFT_THRESHOLD}`);
  const sim = simInit();
  sim.insts = [Object.assign(instNew(), { speed_slow: 8, speed_fast: 1, speed_cur: 8 })];
  ok(sim.audio_level === 0, 'ring 级音频电平从 0 起步（安静）');
  ok(ringSpeedFromAudio(sim, 0) === 8 && ringSpeedFromAudio(sim, 4) === 8,
     '0 / 4（等于阈值）还是慢档 —— 判据是「大于」，不是「大于等于」');
  ok(ringSpeedFromAudio(sim, 5) === 1 && ringSpeedFromAudio(sim, 255) === 1,
     '5 / 255（大于阈值）切快档');
  /* 走一遍采样 + 迟滞（2026-10-28 用户：「采完以后直接读取参数当前值…快档 450ms 是更新参数值的时间」）：
   *   simSetAudioLevel() 只写音量，档位在 simAudioStep()（= 每 20ms 一拍）里按
   *   「每 40ms 采样一次 + 进快档立刻 + 回慢档要等够 460ms」决定。 */
  const { simAudioStep } = CORE;
  simSetAudioLevel(sim, 15);
  ok(sim.audio_level === 15 && sim.stage === 0 && sim.speed_cur === 8,
     '音量 15 只写进 ring；档位要等采样（40ms）才更新');
  simAudioStep(sim, null);                     /* 第 1 拍：累加到 20ms，采样周期没到 */
  ok(sim.stage === 0 && sim.speed_cur === 8, '采样周期没到（20 < 40ms）→ 仍是慢档');
  simAudioStep(sim, null);                     /* 第 2 拍：采到 → 立刻进快档 */
  ok(sim.stage === 1 && sim.speed_cur === 1 && sim.insts[0].speed_cur === 1,
     '采到 > 阈值 → 立刻进快档，并广播给实例');
  /* 安静下来也要等够「阻尼」（450 → 向上取整 460ms = 23 拍）才回慢档 */
  simSetAudioLevel(sim, 0);
  for (let i = 0; i < 20; i++) simAudioStep(sim, null);   /* 20 拍 = 400ms < 460ms */
  ok(sim.stage === 1 && sim.speed_cur === 1, '保持期内（400ms < 460ms）安静也还是快档 —— 阻尼');
  for (let i = 0; i < 6; i++) simAudioStep(sim, null);    /* 26 拍 = 520ms > 460ms */
  ok(sim.stage === 0 && sim.speed_cur === 8 && sim.insts[0].speed_cur < 8,
     `保持期到了再采样：已经安静 → 回慢档（ring 8；实例每格拍数 ${sim.insts[0].speed_cur} 还在往上爬 —— 滑移）`);
  for (let i = 0; i < 8; i++) simAudioStep(sim, null);    /* 再过 8 拍：滑移走完 */
  ok(sim.insts[0].speed_cur === 8, `滑移走完：实例每格拍数回到 8（${sim.insts[0].speed_cur}）`);
  /* 夹到 0..AUDIO_MAX(20)，别让界面传负数/超界把判据弄反 */
  ok(simSetAudioLevel(sim, -5) === 0 && simSetAudioLevel(sim, 999) === FW.AUDIO_MAX,
     `音量夹在 0..${FW.AUDIO_MAX}（-5 → 0、999 → ${FW.AUDIO_MAX}）`);
  /* 退化配置（fast 不小于 slow）时，即便（采到）大音量也走慢档 —— 与 C 的判据一致 */
  sim.insts[0].speed_fast = 8; sim.insts[0].speed_slow = 8;
  simSetAudioLevel(sim, 20);
  simAudioStep(sim, null); simAudioStep(sim, null);
  ok(sim.insts[0].speed_cur === 8, 'fast == slow 时音量再大也不切档（与 ringIsFast 同一条判据）');
  /* 换档不改 step_cnt：相位不跳（固件每拍只写 speed_cur） */
  sim.insts[0].speed_fast = 1; sim.insts[0].speed_slow = 8;
  sim.stage = 0; sim.stage_hold = 0; sim.audio_acc = 0; sim.lvl_sample = 0;
  sim.insts[0].step_cnt = 3;
  simSetAudioLevel(sim, 20);
  simAudioStep(sim, null); simAudioStep(sim, null);
  ok(sim.insts[0].step_cnt === 3, '切档不重置 step_cnt（正在走的这一格不会跳）');

  /* 阈值可调（2026-10-28 用户：「音乐信号的阈值要可调，现在固定到4了」）：
   * 第三个参数就是阈值；不传 = 固件那个 LED_FFT_THRESHOLD(=4)。 */
  sim.insts[0].speed_fast = 1; sim.insts[0].speed_slow = 8;
  ok(ringSpeedFromAudio(sim, 10, 15) === 8 && ringSpeedFromAudio(sim, 16, 15) === 1,
     '自定义阈值 15：音量 10 慢档、16 快档');
  ok(ringSpeedFromAudio(sim, 10, 0) === 1 && ringSpeedFromAudio(sim, 0, 0) === 8,
     '阈值 0：音量 > 0 就算有音乐（0 仍然算安静）');
  ok(fftThreshold(-3) === 0 && fftThreshold(999) === FW.AUDIO_MAX &&
     fftThreshold(null) === 4 && fftThreshold(undefined) === 4 && fftThreshold('') === 4,
     `阈值夹在 0..${FW.AUDIO_MAX}；不传（null / undefined / 空串）就是出厂那个 4`);
  /* simSetAudioLevel 的第三个参数 = 阈值：10 < 15 不进快档、16 > 15 进 */
  {
    sim.stage = 0; sim.stage_hold = 0; sim.audio_acc = 0; sim.lvl_sample = 0;
    simSetAudioLevel(sim, 10, 15);
    simAudioStep(sim, null); simAudioStep(sim, null);
    ok(sim.stage === 0 && sim.speed_cur === 8, 'simSetAudioLevel 的第三个参数就是阈值（10 < 15 → 慢档）');
    sim.stage = 0; sim.stage_hold = 0; sim.audio_acc = 0; sim.lvl_sample = 0;
    simSetAudioLevel(sim, 16, 15);
    simAudioStep(sim, null); simAudioStep(sim, null);
    ok(sim.stage === 1 && sim.speed_cur === 1 && sim.insts[0].speed_cur === 1,
       '音量 16 > 阈值 15 → 快档（采样两次后生效并广播到实例）');
  }
  /* 音量刻度上限可自定义（2026-10-28 用户：「音乐信号的最大值…应该可以做成自定义的参数，
   * 同阈值设定一样」）：阈值跟着「最大」夹，音量 / 随机音源 / 导出宏都走同一个上限。 */
  {
    const { audioMaxOf, AUDIO_MAX_MIN, AUDIO_MAX_LIMIT, fftMusicLevel, fftMusicReset } = CORE;
    ok(audioMaxOf({}) === 20 && audioMaxOf({ audioMax: 40 }) === 40 &&
       audioMaxOf({ audioMax: 1 }) === AUDIO_MAX_MIN && audioMaxOf({ audioMax: 999 }) === AUDIO_MAX_LIMIT,
       `刻度上限：缺省 20、可改（40）、夹在 ${AUDIO_MAX_MIN}..${AUDIO_MAX_LIMIT}`);
    ok(fftThreshold(30, 40) === 30 && fftThreshold(50, 40) === 40 && fftThreshold(999, 40) === 40 &&
       fftThreshold(null, 40) === 4,
       '阈值按「最大」夹：30/40 保持 30、50 和 999 都夹到 40（不传最大仍是出厂刻度 20）');
    /* 判档：刻度 40 / 阈值 30，音量 35 才进快档；同一个 35 在默认刻度里会被夹成 20 → 慢档 */
    sim.stage = 0; sim.stage_hold = 0; sim.audio_acc = 0; sim.lvl_sample = 0;
    simSetAudioLevel(sim, 35, 30, 40);
    simAudioStep(sim, null); simAudioStep(sim, null);
    ok(sim.audio_level === 35 && sim.stage === 1 && sim.speed_cur === 1,
       '刻度 40 / 阈值 30：音量 35 能进快档（不再被固定的 20 卡住）');
    sim.stage = 0; sim.stage_hold = 0; sim.audio_acc = 0; sim.lvl_sample = 0;
    sim.audio_max = 20; sim.audio_thr = null;
    simSetAudioLevel(sim, 35, 30);
    simAudioStep(sim, null); simAudioStep(sim, null);
    ok(sim.audio_level === 20 && sim.stage === 0,
       '默认刻度 20：音量 35 被夹成 20、阈值也夹成 20 —— 正好等于阈值仍算安静（慢档）');
    fftMusicReset(4242);
    const m40 = Array.from({ length: 400 }, () => fftMusicLevel(40));
    fftMusicReset(4242);
    const m20 = Array.from({ length: 400 }, () => fftMusicLevel(20));
    ok(m40.every(v => v <= 40) && m40.some(v => v > 20) && m20.every(v => v <= 20),
       `「音乐来了」跟着刻度走：上限 40 时出过 ${Math.max(...m40)}（>20），默认 20 时不超过 20`);
  }
  /* 采样周期 / 阻尼也可以调：面向前两项是 ms，落进拍向上取整 */
  {
    const st2 = { anim: { audioSampleMs: 60, stageHoldMs: 450 } };
    ok(CORE.audioSampleTicks(st2) === 3 && CORE.stageHoldTicks(st2) === 23,
       `采样 60ms → ${CORE.audioSampleTicks(st2)} 拍、阻尼 450ms → ${CORE.stageHoldTicks(st2)} 拍（向上取整）`);
    ok(CORE.audioSampleTicks({ anim: { audioSampleMs: 30 } }) === 2 &&
       CORE.msToTicksUp(21) === 2 && CORE.msToTicksUp(20) === 1 && CORE.msToTicksUp(0) === 0,
       '一律向上取整：30ms → 2 拍、21ms → 2 拍、20ms → 1 拍、0 → 0（0 保持「关」的语义）');
    ok(CORE.stageHoldTicks({ anim: { stageHoldMs: 0 } }) === 0,
       '阻尼 0 = 不保持（掉到阈值以下就能立刻回慢档）');
    /* 出快档的「速度滑移」：每拍往 slow 爬多少（ds = 8-1 = 7 拍） */
    ok(CORE.glideStep(1, 8, 350) === 1 && CORE.glideStep(1, 8, 70) === 2 &&
       CORE.glideStep(1, 8, 0) === 7,
       '滑移步长：350ms → 每拍 +1、70ms → +2、0 → 一次到位（= 直切）');
    ok(CORE.stageGlideMs({ anim: { glideMs: 500 } }) === 500 && CORE.stageGlideMs(null) === 350,
       '过渡时间可调（默认 350ms）');
  }
}

/* ---- 9c) 「音乐来了」的随机音源：底噪 + 随机鼓点 + 余音（固定种子）---- */
console.log('--- 「音乐来了」的随机音源 ---');
{
  const { fftMusicLevel, fftMusicReset } = CORE;
  fftMusicReset();
  const a = Array.from({ length: 200 }, () => fftMusicLevel());
  ok(a.every(v => v >= 0 && v <= FW.AUDIO_MAX), `随机音量都落在 0..${FW.AUDIO_MAX}`);
  ok(a.some(v => v <= 4) && a.some(v => v > 4),
     `安静（≤4）和有音乐（>4）都出现：${a.filter(v => v <= 4).length} / ${a.filter(v => v > 4).length}（200 拍）`);
  ok(a.some(v => v >= 8) && a.filter(v => v >= 8).length < a.length / 2,
     `有鼓点高峰、也不是一直响（≥8 的占 ${a.filter(v => v >= 8).length}/200）`);
  /* 余音：鼓点之后是连续 >4 的一段，不是一拍一个孤立尖峰 */
  let runs = 0;
  for (let i = 1; i < a.length; i++) if (a[i] > 4 && a[i - 1] > 4) runs++;
  ok(runs > 30, `鼓点带余音（相邻两拍都 >4 的有 ${runs} 处），不是孤立尖峰`);
  /* 固定种子：重置之后重放同一段「音乐」（比对帧 / 录屏 / 演示都靠这条） */
  fftMusicReset();
  const b = Array.from({ length: 200 }, () => fftMusicLevel());
  ok(a.join(',') === b.join(','), '固定种子：重置后重放一模一样');
  fftMusicReset(12345);
  const c = Array.from({ length: 100 }, () => fftMusicLevel());
  ok(c.join(',') !== a.slice(0, 100).join(','), '换种子 = 换一段「音乐」');
  /* 默认阈值 4 下，这段「音乐」能让两个档位都出现过（不是永远快、也不是永远慢） */
  const fastN = a.filter(v => v > 4).length;
  ok(fastN > 20 && fastN < a.length - 20,
     `默认阈值下快档 ${fastN} 拍 / 慢档 ${a.length - fastN} 拍（两边都看得到）`);
}

/* ---- 9d) 真声音 → 音量刻度（麦克风 / 电脑声音；只用于预览，导出物不变）---- */
console.log('--- 真声音 → 0..最大值（预览用）---');
{
  const { audioLevelFromRms, audioLevelFromTimeData, AUDIO_SRC, audioMaxOf } = CORE;
  ok(AUDIO_SRC.join(',') === 'random,mic,system,file', `音源枚举：${AUDIO_SRC.join(' / ')}`);
  ok(audioLevelFromRms(0, 20) === 0 && audioLevelFromRms(1, 20) === 20 &&
     audioLevelFromRms(0.5, 20) === 18 && audioLevelFromRms(2, 20) === 20,
     `RMS → 0..20：静音 0、满幅 20、半幅(-6dB) 18、超过 1 也夹到 20`);
  ok(audioLevelFromRms(0.5, audioMaxOf({ audioMax: 40 })) === 36,
     '同一个 RMS 换成 40 的刻度 → 36（跟着最大值走）');
  /* AnalyserNode 的时域数据：128 = 静音；0/255 交替 = 满幅方波 */
  const quiet = new Uint8Array(64).fill(128);
  const loud = new Uint8Array(64).map((_, i) => (i & 1 ? 255 : 0));
  ok(audioLevelFromTimeData(quiet, 20) === 0 && audioLevelFromTimeData(loud, 20) === 20 &&
     audioLevelFromTimeData(new Uint8Array(0), 20) === 0,
     '时域波形：全 128 = 0、满幅方波 = 20、空数组 = 0（不会 NaN）');
}


/* ---- 9e) 电脑侧「响应」：节拍（低频 + 谱通量）+ 自适应归一化（只影响预览） ---- */
console.log('--- 电脑侧响应：节拍 / 自适应 ---');
{
  const { audioBeatOnset, audioAdaptiveLevel, AUDIO_RESP } = CORE;
  const N = 512, SR = 48000, FF = 1024;
  const mk = () => new Uint8Array(N);
  const silent = mk();
  ok(AUDIO_RESP.join(',') === 'beat,rms', `响应枚举：${AUDIO_RESP.join(' / ')}`);
  ok(audioBeatOnset(silent, silent, SR, FF) === 0, '全静音 → 节拍强度 0');
  const kick = mk(); for (let i = 1; i <= 4; i++) kick[i] = 200;
  const mid = mk();  for (let i = 20; i <= 23; i++) mid[i] = 200;
  const sKick = audioBeatOnset(kick, silent, SR, FF), sMid = audioBeatOnset(mid, silent, SR, FF);
  ok(sKick > 0.4 && sKick > sMid * 3,
     `低频（底鼓）明显强于中频：${sKick.toFixed(2)} vs ${sMid.toFixed(2)}`);
  const wide = mk().fill(50);
  ok(audioBeatOnset(wide, silent, SR, FF) > 0.5, '整段频谱突变（谱通量）也计入强度');
  ok(audioBeatOnset(wide, wide, SR, FF) < 0.2, '同样的频谱（没有突变）不会一直算「节拍」');
  {
    const st = {};
    const hi = audioAdaptiveLevel(0.8, st, 20);
    const d1 = audioAdaptiveLevel(0, st, 20);
    const d2 = audioAdaptiveLevel(0, st, 20);
    ok(hi >= 18 && d1 < hi && d2 < d1, `包络快攻慢放：${hi} → ${d1} → ${d2}`);
    const q = {};
    const quiet = audioAdaptiveLevel(0.05, q, 20);
    ok(quiet === 0, `底噪（0.05）被噪声门挡掉：${quiet}/20（拍与拍之间不会一直高位）`);
    const mid2 = {};
    const moderate = audioAdaptiveLevel(0.2, mid2, 20);
    ok(moderate > 0 && moderate < 20, `中等信号不会放到满档（绝对下限）：${moderate}/20`);
    const half = {};
    ok(audioAdaptiveLevel(0.45, half, 20) === 20, '超过参考下限（0.35）就映射到满档');
  }
}


/* ---- 10) 效果名自动生成：「模板 / 配色」——name 不再由用户给 ---- */
console.log('--- 效果名：模板 / 配色 ---');
{
  const { fxEffectName, defaultEffects, newCustomEffect, FW } = CORE;

  /* 内建：模板那一半 = 固件动画名（FW.ANIM_NAME[anim]） */
  const nB = fxEffectName({ kind: 'builtin', anim: 0, color: 0 });
  ok(nB === FW.ANIM_NAME[0] + '/' + FW.COLOR_NAME[0], `内建：动画名 / 配色名 = ${nB}`);

  /* 默认 9 条一条不落（名字必须走同一条规则，不能另有来路） */
  const d = defaultEffects().list;
  ok(d.every(e => e.name === FW.ANIM_NAME[e.anim] + '/' + FW.COLOR_NAME[e.color]),
     `默认 9 条全按「动画名 / 配色名」命名（第 1 条：${d[0].name}）`);

  /* 自定义：模板那一半 = 最近套用的预置模板名（e.tpl） */
  const nC = fxEffectName({ kind: 'custom', tpl: '拖尾彗星', color: 1 });
  ok(nC === '拖尾彗星/' + FW.COLOR_NAME[1], `自定义：套过模板 → ${nC}`);

  /* 没套过模板（含旧存档缺 tpl 字段）→「自定义」 */
  const nO = fxEffectName({ kind: 'custom', color: FW.COLOR.SOLID });
  ok(nO === '自定义/' + FW.COLOR_NAME[FW.COLOR.SOLID], `自定义：没模板（旧存档缺 tpl）→ ${nO}`);

  /* 新建的自定义效果自带自动名，模板那半记着「自定义」 */
  const nc = newCustomEffect(7);
  ok(nc.tpl === '自定义' && nc.name === '自定义/' + FW.COLOR_NAME[nc.color],
     `新建：tpl=${nc.tpl} / name=${nc.name}`);

  /* 只换模板名 → 名字跟着换，图层一个字段都不动 */
  const nc2 = Object.assign({}, nc, { tpl: '多彩呼吸' });
  ok(fxEffectName(nc2) === '多彩呼吸/' + FW.COLOR_NAME[nc.color] && nc2.layers === nc.layers,
     `只换模板名 → ${fxEffectName(nc2)}（图层没被碰）`);

  /* 名字只进注释：ASCII 注释走 latin 别名（自动名是中文，不进 C 数据、也不落进 GBK 乱码区） */
  const st0 = CORE.projectFromPreset(CORE.PRESET_SP3122D);
  const asciiOut = CORE.exportEffectsC(st0, { form: 'header', comment: 'ascii', eol: 'lf' });
  ok(!/[^\x00-\x7F]/.test(asciiOut) && asciiOut.includes('EFFECT0'),
     'ASCII 注释的整份导出仍是纯 ASCII（自动名走 latin 别名）');
  const zhOut = CORE.exportEffectsC(st0, { form: 'header', comment: 'zh', eol: 'lf' });
  ok(zhOut.includes(d[0].name), `中文注释里写的就是自动名：${d[0].name}`);
}


/* ---- 11) 新配色：纯色 / 跳变 / 渐变 / 彩虹 / 呼吸 / 覆盖 ---- */
console.log('--- 配色：彩虹 / 跳变 / 呼吸 / 覆盖 ---');
{
  const { instNew, instApplyPreset, renderZoneMaskTo, effectColorAt,
          breathEnv, breathPlan, effBreathRise, effBreathHold,
          stepEnv, stepClamp, stepSpeedOf, effStepRise, effStepHold, effStepFade, effStepFast,
          colorUpdate, effPalette, effLevels, effPeriod, effectPreset } = CORE;
  const base = { anim: FW.ANIM.STATIC, width: 10, gap: 0, slow: 8, fast: 1, speed: 1,
                 c1: [255, 0, 0], c2: [0, 0, 0] };
  const mkInst = p => { const I = instNew(); instApplyPreset(I, Object.assign({}, base, p)); return I; };
  const render = (I, len, tick) => {
    I.anim.gen_tick = tick;
    const m = new Uint8Array(len), h = new Uint8Array(len);
    renderZoneMaskTo(I, m, h, len, 0);
    return { m, h };
  };
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

  /* 彩虹：沿灯位铺开，levels = 走完一轮要多少颗灯（最小 6） */
  const R = mkInst({ color: FW.COLOR.RAINBOW, levels: 30, hue_base: 0, hue_speed: 0 });
  const r30 = render(R, 30, 0);
  ok(r30.m.every(v => v === 255), '彩虹：整条点亮');
  ok(r30.h[0] === 0 && r30.h[1] === 8 && r30.h[15] === 128 && r30.h[29] === 247,
     `彩虹 levels=30 → 0/8/128/247（实际 ${r30.h[0]}/${r30.h[1]}/${r30.h[15]}/${r30.h[29]}）`);
  ok(same(r30.h, Uint8Array.from({ length: 30 }, (_, i) => Math.floor(i * 256 / 30) & 0xFF)),
     '彩虹逐位 = floor(i × 256 / levels)（q/r 递推与除法逐值相同）');
  const r8 = render(R, 8, 0);
  ok(r8.h[7] === 59, `8 颗灯 + levels=30 只取一小段（第 8 颗 = ${r8.h[7]}）`);
  R.color.hue_speed = 2;
  const rRot = render(R, 30, 10);
  ok(rRot.h[3] === ((Math.floor(3 * 256 / 30) + 5) & 0xFF),
     `彩虹旋转：每 N 拍整体挪一格（tick=10 / speed=2 → +5）`);

  /* 跳变：每 speed 拍换下一个颜色，颜色数 = 调色板大小 */
  const S = mkInst({ color: FW.COLOR.STEP, speed: 3,
                     palette: [[255,0,0],[0,255,0],[0,0,255]] });
  for (let t = 1; t <= 3; t++) colorUpdate(S.color, t);
  ok(S.color.current.g === 255 && S.color.current.r === 0, '跳变：3 拍后换到第 2 色');
  for (let t = 4; t <= 6; t++) colorUpdate(S.color, t);
  ok(S.color.current.b === 255, '跳变：6 拍后换到第 3 色');
  for (let t = 7; t <= 9; t++) colorUpdate(S.color, t);
  ok(S.color.current.r === 255, '跳变：9 拍后绕回第 1 色');

  /* 跳变包络：渐亮 r 拍 → 满亮 h 拍 → 渐暗 f 拍（最后一拍 ≈255/(f+1)，不落 0）→ 在最暗那拍换色 */
  {
    const d = 8, h = 2, f = 6;
    const ramp = Array.from({ length: d }, (_, t) => stepEnv(t, d, 0, h, f));
    ok(JSON.stringify(ramp) === JSON.stringify([255, 255, 219, 183, 146, 110, 73, 37]),
       `跳变包络 8 拍（渐亮 0 / 亮 2 / 暗 6）：${ramp.join(',')}`);
    ok(stepEnv(0, 8, 0, 2, 6) === 255 && stepEnv(7, 8, 0, 2, 6) === 37,
       '渐亮 0 = 硬启亮：亮段满亮，变暗最后一拍停在 37/255 —— 不全黑（留个全黑帧就是一次闪）');
  }
  /* 渐亮：从 255/r 匀速爬到满亮，最后一拍正好 255；0 拍 = 老存档的硬启亮（逐拍与上一版相同）。
   * 变暗段从 255 一路暗到 ≈255/(f+1)：不重复满亮拍、也不落到 0 —— 换色处没有黑帧。 */
  {
    const up = Array.from({ length: 4 }, (_, t) => stepEnv(t, 4, 4, 0, 0));
    ok(JSON.stringify(up) === JSON.stringify([63, 127, 191, 255]),
       `渐亮 4 拍（正好铺满停留）：${up.join(',')} —— 从 255/4 均匀爬到满亮`);
    const mix = Array.from({ length: 7 }, (_, t) => stepEnv(t, 7, 2, 2, 3));
    ok(JSON.stringify(mix) === JSON.stringify([127, 255, 255, 255, 192, 128, 64]),
       `渐亮 2 / 亮 2 / 暗 3 = 7 拍：${mix.join(',')}`);
    ok(stepEnv(0, 7, 1, 2, 3) === 255 && stepEnv(0, 7, 0, 2, 3) === 255,
       '渐亮 1 拍与 0 拍等价（一拍照跳到满亮）');
    /* 换色边界：上一色最后一拍 ≈255/(f+1)（不是 0），新一色从 255/r 起爬 —— 中间没有全黑帧。
     * 全黑一帧在 50Hz 下就是一次 20ms 的闪，用户看到的就是换色时「抖一下」。 */
    const lastFade = stepEnv(19, 20, 4, 6, 10);   /* 渐亮 4 / 亮 6 / 暗 10：第 19 拍是变暗最后一拍 */
    const firstRise = stepEnv(0, 20, 4, 6, 10);
    ok(lastFade === 24 && firstRise === 63 && lastFade > 0,
       `换色处没有黑帧：上一色最后一拍 ${lastFade}/255 → 新一色第 0 拍 ${firstRise}/255`);
  }
  {
    /* 黑着等换色：渐亮 0 + 亮 2 + 暗 3 = 5，剩下 5 拍保持黑（老存档 / 手改 JSON 才会这样） */
    const d = 10;
    const ramp = Array.from({ length: d }, (_, t) => stepEnv(t, d, 0, 2, 3));
    ok(JSON.stringify(ramp) === JSON.stringify([255, 255, 192, 128, 64, 0, 0, 0, 0, 0]),
       `亮 + 暗 用不完停留时，多出来的拍保持黑 —— ${ramp.join(',')}`);
    ok(stepEnv(9, d, 0, 2, 3) === 0, '黑着等换色：停留最后一拍仍然是黑的');
    /* 夹紧：r + h + f 超过停留 → 按顺序压回停留（不会出现「还没暗完就换色」） */
    const c = stepClamp(8, 0, 20, 30);
    ok(c[0] === 0 && c[1] === 8 && c[2] === 0, `亮 + 暗 超过停留：夹到 [渐亮 ${c[0]}, 亮 ${c[1]}, 暗 ${c[2]}]`);
    const c2 = stepClamp(8, 0, 4, 9);
    ok(c2[0] === 0 && c2[1] === 4 && c2[2] === 4, `暗段超过剩余拍数：夹到 [渐亮 ${c2[0]}, 亮 ${c2[1]}, 暗 ${c2[2]}]`);
    const c3 = stepClamp(4, 9, 3, 3);
    ok(c3[0] === 4 && c3[1] === 0 && c3[2] === 0, `渐亮比停留还长：夹到 [${c3.join(',')}]（只剩渐亮）`);
    ok(stepEnv(0, 8, 0, 4, 9) === 255 && stepEnv(7, 8, 0, 4, 9) === 51,
       '夹紧之后仍然是「满亮起、暗到 ≈255/(f+1)」（51/255，不是 0）');
  }
  {
    const d = 8;
    ok(stepEnv(0, 1, 0, 1, 0) === 255,
       '停留只有 1 拍：没有渐灭的余地，直接满亮（= 闪烁）');
    ok(stepEnv(0, 8, 0, 0, 0) === 0, '亮 0 / 暗 0 = 整条黑（用户自己关掉了这一种颜色）');
    /* 缺省：老存档 / 新效果 → 渐亮 0（硬启亮）、亮一半暗一半 */
    ok(effStepRise({}) === 0 && effStepRise({ rise: 4 }) === 4 && effStepRise({ rise: 999 }) === 255,
       `渐亮缺省 = 0（老存档 / 老预置 = 硬启亮）；显式值照走并封顶 255（${effStepRise({ rise: 999 })}）`);
    ok(effStepHold({ speed: d }) === 4 && effStepFade({ speed: d }) === 4,
       `跳变缺省 = 亮一半暗一半（${effStepHold({ speed: d })}/${effStepFade({ speed: d })}）`);
    ok(effStepHold({ speed: 1 }) === 1 && effStepFade({ speed: 1 }) === 0,
       '停留 1 拍的老效果：亮 1 / 暗 0（跟打补丁前一样是闪烁）');
    ok(effStepHold({ speed: 12, hold: 3 }) === 3 && effStepFade({ speed: 12, hold: 3 }) === 9,
       '存了 hold 就照 hold 走，fade 缺省补足剩下的停留');
    ok(effStepFade({ speed: 12, rise: 2, hold: 3 }) === 7,
       '存了 rise + hold、没有 fade：fade 缺省 = 停留 - 渐亮 - 亮（老周期不变）');
  }
  /* 停留 = 渐亮 + 亮 + 变暗（界面填这三行时自动算，不存在黑尾巴） */
  {
    ok(stepSpeedOf({ hold: 10, fade: 10 }) === 20, `停留 = 亮 + 暗：10 + 10 = ${stepSpeedOf({ hold: 10, fade: 10 })}`);
    ok(stepSpeedOf({ rise: 4, hold: 6, fade: 4 }) === 14,
       `停留 = 渐亮 + 亮 + 暗：4 + 6 + 4 = ${stepSpeedOf({ rise: 4, hold: 6, fade: 4 })}`);
    ok(stepSpeedOf({ speed: 12, hold: 3 }) === 12, '缺省 fade 补足 → 停留还是 12（老存档原样）');
    ok(stepSpeedOf({ hold: 200, fade: 100 }) === 255, '亮 + 暗 超过 255 拍：停留封顶 255');
    ok(stepSpeedOf({ rise: 100, hold: 200, fade: 100 }) === 255, '三段加起来超过 255：停留封顶 255');
    ok(stepSpeedOf({ hold: 0, fade: 0 }) === 1, '全 0 也留 1 拍（8 位字段不能是 0，否则换色停住）');
    /* 铺进实例时也按「渐亮 + 亮 + 暗」定周期：老 speed 20 与两段之和 10 不一致 → 以三段为准 */
    const I6 = mkInst({ color: FW.COLOR.STEP, speed: 20, hold: 6, fade: 4,
                        palette: [[255,0,0],[0,255,0]] });
    ok(I6.color.spectrum_speed === 10 && I6.color.step_rise === 0 &&
       I6.color.step_hold === 6 && I6.color.step_fade === 4,
       `实例周期 = 渐亮 + 亮 + 暗（speed=${I6.color.spectrum_speed} / rise=${I6.color.step_rise} / hold=${I6.color.step_hold} / fade=${I6.color.step_fade}）`);
    ok(stepEnv(9, I6.color.spectrum_speed, I6.color.step_rise, I6.color.step_hold, I6.color.step_fade) === 51 &&
       stepEnv(8, 10, 0, 6, 4) === 102,
       '两段正好铺满 10 拍：第 8 拍 102、第 9 拍最暗 51（不落 0，第 10 拍立刻换色 —— 没有黑帧）');
  }
  /* 包络乘在 mask 上：亮段满亮、渐灭段暗下去、灭完之后全黑（颜色始终不变） */
  const S8 = mkInst({ color: FW.COLOR.STEP, speed: 8, hold: 2, fade: 6,
                      palette: [[255, 0, 0], [0, 255, 0]] });
  S8.color.tick_cnt = 0;
  const sOn0 = render(S8, 10, 0);
  S8.color.tick_cnt = 1;
  const sOn1 = render(S8, 10, 0);
  S8.color.tick_cnt = 4;
  const sMid = render(S8, 10, 0);
  S8.color.tick_cnt = 7;
  const sOff = render(S8, 10, 0);
  ok(sOn0.m.every(v => v === 255) && sOn1.m.every(v => v === 255),
     `跳变：亮段（第 0/1 拍）整条满亮（${sOn0.m[0]} / ${sOn1.m[0]}）`);
  ok(sMid.m[0] > 0 && sMid.m[0] < 255,
     `跳变：第 4 拍已经暗下去（${sMid.m[0]}/255）`);
  ok(sOff.m[0] > 0 && sOff.m[0] < 60,
     `跳变：变暗最后一拍暗到 ${sOff.m[0]}/255（不全黑 —— 换色处没有黑帧，所以不闪）`);
  /* 渐亮段乘在 mask 上：第 0 拍就是 255/4，之后逐拍爬亮到满（包络读的是实例里的 step_rise） */
  const S9 = mkInst({ color: FW.COLOR.STEP, rise: 4, hold: 0, fade: 0,
                      palette: [[255, 0, 0], [0, 255, 0]] });
  ok(S9.color.spectrum_speed === 4 && S9.color.step_rise === 4,
     `实例带上渐亮（speed=${S9.color.spectrum_speed} / rise=${S9.color.step_rise}）`);
  S9.color.tick_cnt = 0;
  const rOn0 = render(S9, 10, 0);
  S9.color.tick_cnt = 1;
  const rOn1 = render(S9, 10, 0);
  S9.color.tick_cnt = 3;
  const rOn3 = render(S9, 10, 0);
  ok(rOn0.m[0] > 0 && rOn0.m[0] < rOn1.m[0] && rOn1.m[0] < 255 && rOn3.m.every(v => v === 255),
     `跳变：渐亮第 0/1/3 拍 = ${rOn0.m[0]}/${rOn1.m[0]}/${rOn3.m[0]}（连续爬亮，第 0 拍不再白黑一下）`);

  /* 快拍（2026-10-29 第三十六轮，用户「音乐信号大于阈值时取消渐灭，在几种色彩之前快速切换，
   * 切换速度要可调」）：快档 + step_fast > 0 → 换色周期改用 step_fast、包络整个取消（满亮硬切）。 */
  {
    ok(effStepFast({}) === 0 && effStepFast({ step_fast: 4 }) === 4 && effStepFast({ step_fast: 999 }) === 255,
       `快拍缺省 = 0（老存档 / 新效果快档照旧走包络）；显式值照走并封顶 255（${effStepFast({ step_fast: 999 })}）`);
    const Sc = mkInst({ color: FW.COLOR.STEP, speed: 30, rise: 0, hold: 0, fade: 30, step_fast: 2,
                        palette: [[255, 0, 0], [0, 255, 0], [0, 0, 255]] });
    ok(Sc.color.spectrum_speed === 30 && Sc.color.step_fast === 2,
       `快拍进实例：停留 ${Sc.color.spectrum_speed} 拍 / 快拍 ${Sc.color.step_fast} 拍`);
    /* 慢档：30 拍才换色（快拍不生效） */
    Sc.color.tick_cnt = 0; Sc.color.phase = 0;
    for (let t = 1; t <= 3; t++) colorUpdate(Sc.color, t, null, 0);
    ok(Sc.color.phase === 0, `慢档 3 拍还在第 1 色（要等满 30 拍）：phase=${Sc.color.phase}`);
    Sc.color.tick_cnt = 29;
    colorUpdate(Sc.color, 30, null, 0);
    ok(Sc.color.phase === 1, `慢档第 30 拍才换到第 2 色（phase=${Sc.color.phase}）`);
    /* 快档：每 step_fast = 2 拍换一次 */
    Sc.color.tick_cnt = 0; Sc.color.phase = 0;
    for (let t = 1; t <= 2; t++) colorUpdate(Sc.color, t, null, 1);
    ok(Sc.color.phase === 1, `快档 2 拍就换色（快拍周期生效，phase=${Sc.color.phase}）`);
    /* 包络：慢档照旧渐灭；快档整条满亮（渐灭被取消） */
    Sc.color.tick_cnt = 29; Sc.fastNow = 0;
    const slowM = render(Sc, 12, 0).m;
    Sc.color.tick_cnt = 1;  Sc.fastNow = 1;
    const fastM = render(Sc, 12, 0).m;
    ok(slowM[0] > 0 && slowM[0] < 40, `慢档第 29 拍已经暗下去（${slowM[0]}/255，包络还在）`);
    ok(fastM.every(v => v === 255), `快档取消渐灭：整条满亮硬切（${fastM[0]}/255）`);
    Sc.fastNow = 0;
    /* step_fast = 0 → 快档也照旧走「停留 + 包络」（老工程观感不变） */
    const S0 = mkInst({ color: FW.COLOR.STEP, speed: 30, rise: 0, hold: 0, fade: 30, step_fast: 0,
                        palette: [[255, 0, 0], [0, 255, 0]] });
    S0.color.tick_cnt = 0; S0.fastNow = 1;
    for (let t = 1; t <= 3; t++) colorUpdate(S0.color, t, null, 1);
    ok(S0.color.phase === 0, `step_fast = 0：快档也等满 30 拍才换色（phase=${S0.color.phase}）`);
    S0.color.tick_cnt = 29;
    const m0 = render(S0, 12, 0).m;
    ok(m0[0] > 0 && m0[0] < 40, `step_fast = 0：快档仍乘包络（${m0[0]}/255）`);
  }

  /* 呼吸包络当脉动形状（2026-10-30「呼吸彩虹」= 呼吸包络 + 彩虹配色）：
   * 对称、平滑、最暗那一拍 ≥1（不落全黑，所以熄灭处不会「闪一下」）。 */
  {
    const g = t => pulseGain(t, 90, 255, WAVE.BREATH);
    let mn = 255, mx = 0;
    for (let t = 0; t < 90; t++) { if (g(t) < mn) mn = g(t); if (g(t) > mx) mx = g(t); }
    ok(mn >= 1 && mn <= 8 && mx === 255, `呼吸脉动：最暗 ${mn} / 最亮 ${mx}（不落全黑）`);
    ok(Math.abs(g(1) - g(0)) <= 3 && g(45) === 255,
       `呼吸脉动：起手平滑（${g(0)} → ${g(1)}），半个周期处满亮（${g(45)}）`);
    let up = true, down = true;
    for (let k = 1; k <= 44; k++) if (g(k) < g(k - 1)) up = false;
    for (let k = 46; k < 90; k++) if (g(k) > g(k - 1)) down = false;
    ok(up && down, `呼吸脉动：先单调升到顶点（45 拍满亮）、再单调降下来 —— 对称的「呼吸」形状`);
  }

  /* 老存档里的「呼吸彩虹」自动迁移成呼吸包络（三角 → 呼吸），只动这一种形态且幂等 */
  {
    const old = { kind:'custom', tpl:'呼吸彩虹', color: 4,
                  layers:[{ kind:'fill', en:1, level:255, pulse_period:60, pulse_amp:250, wave:0 }] };
    CORE.normalizeEffect(old);
    ok(old.layers[0].wave === 4 && old.layers[0].pulse_period === 90 && old.layers[0].pulse_amp === 255,
       `老「呼吸彩虹」迁成呼吸包络（wave ${old.layers[0].wave} / ${old.layers[0].pulse_period} 拍 / amp ${old.layers[0].pulse_amp}）`);
    const again = JSON.parse(JSON.stringify(old));
    CORE.normalizeEffect(again);
    ok(JSON.stringify(again.layers) === JSON.stringify(old.layers), '迁移幂等（再跑一次一个字段都不变）');
    const other = { kind:'custom', tpl:'拖尾彗星', color: 0,
                    layers:[{ kind:'fill', en:1, level:255, pulse_period:20, pulse_amp:255, wave:0 }] };
    CORE.normalizeEffect(other);
    ok(other.layers[0].wave === 0 && other.layers[0].pulse_period === 20,
       '别的模板的三角脉动一个字段都不碰');
  }
  /* 呼吸包络的「不落全黑」对老存档的 周期/2 也要成立（45 拍渐亮时 smoothstep 会取整成 0，
   * 靠下限 255/(r+1) 兜住）—— 这是「接近熄灭时闪一下」的根子 */
  {
    let mn = 255;
    for (let t = 0; t < 90; t++) mn = Math.min(mn, CORE.breathEnv(t, 90, 45));
    ok(mn >= 1, `呼吸（老存档 渐亮=周期/2=45）：最暗 ${mn}/255 —— 不落全黑`);
  }

  /* 呼吸：对称包络（渐亮 = 渐暗）+ 平滑曲线，一个周期一种颜色；首尾都**不落全黑** */
  const bp12 = breathPlan({ color: FW.COLOR.BREATH, period: 12 });
  ok(bp12.rise === 6 && bp12.hold === 0 && bp12.fade === 6 && bp12.period === 12,
     `呼吸计划（老存档 only period=12）：渐亮=渐暗 ${bp12.rise} / 亮 ${bp12.hold} / 周期 ${bp12.period}`);
  ok(bp12.fade === bp12.rise, '呼吸的渐暗恒等于渐亮（对称包络 —— 这就是它和跳变的唯一区别）');
  const bg = t => breathEnv(t, 12, 6);
  ok(bg(0) === 51 && bg(5) === 255 && bg(6) === 255 && bg(11) === 51,
     `呼吸包络 0/5/6/11 拍 = ${bg(0)}/${bg(5)}/${bg(6)}/${bg(11)}（第 5 拍爬满，第 6 拍起逐拍镜像回去）`);
  ok(bg(0) > 0 && bg(11) > 0,
     `呼吸首尾都不落到全黑（${bg(0)} / ${bg(11)}）—— 全黑一帧在 50Hz 下就是一次闪，换色处会「抖一下」`);
  ok(bg(11) === bg(0),
     `周期接缝连续（末拍 ${bg(11)} = 首拍 ${bg(0)}，换色处亮度不跳）`);
  /* 出厂手感（渐亮 40 / 亮 10 = 1.8 秒一个来回）：曲线要「两端慢、中段快」——
   * 线性斜坡的每拍步长恒为 255/40 ≈ 6，暗部每一步都是「亮度翻倍」，看着才一格一格跳。 */
  {
    const bd = t => breathEnv(t, 90, 40);
    const up = [];
    for (let t = 0; t < 40; t++) up.push(bd(t));
    let mono = true, maxStep = 0;
    for (let i = 1; i < up.length; i++) {
      if (up[i] < up[i - 1]) mono = false;
      if (up[i] - up[i - 1] > maxStep) maxStep = up[i] - up[i - 1];
    }
    ok(mono && up[0] > 0 && up[0] <= 8,
       `呼吸：渐亮段只升不降、首拍 ${up[0]}/255（不黑 —— 换色就在这一拍）`);
    ok((up[1] - up[0]) <= 3 && maxStep >= 7,
       `呼吸：平滑曲线 —— 起步 ${up[0]}→${up[1]}（几乎不动），中段一拍 ${maxStep} 级（台阶挪到人眼最不敏感的亮度 128 附近）`);
    ok(bd(39) === 255 && bd(40) === 255 && bd(89) === up[0],
       `呼吸：顶点 ${bd(39)}/${bd(40)} 满亮，末拍 ${bd(89)} = 首拍 ${up[0]}（接缝连续）`);
    let mirror = true;
    for (let k = 0; k < 40; k++) if (bd(89 - k) !== bd(k)) mirror = false;
    ok(mirror, '呼吸：渐暗段是渐亮段逐拍镜像（渐亮 = 渐暗，只填一格）');
    ok(breathEnv(0, 2, 1) === 255 && breathEnv(1, 2, 1) === 128,
       '呼吸极限：渐亮 1 拍 + 周期 2 拍 → 一拍满亮、一拍半亮（曲线在这里没有暗段，不能看着像常亮）');
    ok(breathEnv(0, 60, 0) === 255 && breathEnv(30, 60, 0) === 255,
       '呼吸：渐亮 0 拍 = 一直满亮（老存档 r = 0 的行为不变）');
  }
  const bpP = breathPlan({ color: FW.COLOR.BREATH, period: 60, b_rise: 10, b_hold: 8 });
  ok(bpP.period === 28 && bpP.rise === 10 && bpP.hold === 8,
     `呼吸周期 = 渐亮×2 + 亮（10×2 + 8 = ${bpP.period}）`);
  ok(breathEnv(8, 28, 10) < 255 && breathEnv(9, 28, 10) === 255 && breathEnv(17, 28, 10) === 255 &&
     breathEnv(18, 28, 10) === 255 && breathEnv(19, 28, 10) < 255,
     '呼吸：渐亮第 9 拍起满亮，「亮(拍)」里保持，之后开始暗下去');
  /* 效果对象 → effectPreset → instApplyPreset：用户填的 10 / 8 必须原样到实例
   * （effectPreset 只带 period 的话，breathPlan 会按老存档摊成 14 / 0 —— 亮(拍) 就白填了） */
  {
    const eBx = { color: FW.COLOR.BREATH, period: 60, b_rise: 10, b_hold: 8,
                  palette: [[255,0,0],[0,255,0]], c1: [255,0,0], c2: [0,255,0],
                  level: 0, levels: 30, hue_base: 0, hue_speed: 0, slow: 8, fast: 1, speed: 0 };
    const IBx = instNew();
    instApplyPreset(IBx, effectPreset(eBx, 0, {}));
    ok(IBx.color.period === 28 && IBx.color.step_rise === 10 && IBx.color.step_hold === 8 &&
       IBx.color.step_fade === 10,
       `呼吸装实例：周期 ${IBx.color.period} / 渐亮 ${IBx.color.step_rise} / 亮 ${IBx.color.step_hold} / 暗 ${IBx.color.step_fade}（10 / 8 没丢）`);
  }
  const B = mkInst({ color: FW.COLOR.BREATH, period: 12,
                     palette: [[255,0,0],[0,255,0],[0,0,255]] });
  colorUpdate(B.color, 0);
  ok(B.color.current.r === 255, '呼吸：第 1 个周期用第 1 色');
  colorUpdate(B.color, 12);
  ok(B.color.current.g === 255, '呼吸：第 2 个周期换第 2 色');
  colorUpdate(B.color, 24);
  ok(B.color.current.b === 255, '呼吸：第 3 个周期换第 3 色');
  const breathShot = render(B, 10, 5);
  ok(breathShot.m.every(v => v === 255), '呼吸：满亮那一拍整条 255');
  const breathDark = render(B, 10, 11);
  ok(breathDark.m.every(v => v > 0 && v < 60),
     `呼吸：周期末拍整条暗但没灭（${breathDark.m[0]}）—— 换色发生在这一拍`);

  /* 覆盖 = 连环扫：一趟 period 拍扫完 S 颗（0 = 整条），方向左右交替。
   * hue[] 存的是**调色板条目索引**：第 r 趟盖的是条目 (r+1) % n，第 0 趟之前 = 条目 0；
   * 条目是纯色就整块硬边、是 [A→B] 就铺位置渐变 —— 铺法看条目，没有独立参数。
   * 传 hue[i] 给 wipeEntryAt 才变成颜色（下面几组先用「两个纯色条目」起步）。 */
  const W = mkInst({ color: FW.COLOR.WIPE, period: 10,
                     palette: [[0,0,255],[255,120,0]] });
  const w0 = render(W, 10, 0);
  ok(w0.h[0] === 1 && w0.h.slice(1).every(v => v === 0),
     '覆盖：第 0 拍第 1 颗已经换成条目 1（连环扫从这里起步）');
  const w5 = render(W, 10, 5);
  ok(w5.h.slice(0, 6).every(v => v === 1) && w5.h.slice(6).every(v => v === 0),
     '覆盖：半程时前 6 颗是条目 1，后面还是条目 0');
  colorUpdate(W.color, 5);
  const wc = effectColorAt(W, 0, 10, w5.h);
  ok(wc.r === 255 && wc.g === 120 && wc.b === 0, `覆盖：被盖住那段用第 0 趟的盖色（${wc.r},${wc.g},${wc.b}）`);
  const w9 = render(W, 10, 9);
  ok(w9.h.every(v => v === 1), '覆盖：一趟扫满时整条都是条目 1（不再差最后一颗）');
  const w10 = render(W, 10, 10);
  ok(w10.h[9] === 0 && w10.h.slice(0, 9).every(v => v === 1),
     '覆盖：第 2 趟从另一头起步（末颗先换成条目 0，其余还是条目 1 —— 方向交替，不是整条跳回）');
  const w15 = render(W, 10, 15);
  ok(w15.h.slice(0, 4).every(v => v === 1) && w15.h.slice(4).every(v => v === 0),
     '覆盖：第 2 趟半程 —— 右半已换成条目 0，左半还是上一趟的条目 1');
  const w19 = render(W, 10, 19);
  ok(w19.h.every(v => v === 0), '覆盖：第 2 趟扫满 = 整条换成条目 0（一个完整来回）');
  /* 第 2 趟的「本趟底色」= 条目 1（phase = ⌊tick / period⌋ % n；盖上去的是条目 0） */
  colorUpdate(W.color, 19);
  ok(W.color.phase === 1 && W.color.current.r === 255 && W.color.current.g === 120,
     '覆盖：第 2 趟 phase = 1（本趟底色 = 条目 1，盖的是条目 0）');

  /* 覆盖灯数（等级）：40 颗的分区只让前 4 颗参与，其余一直是条目 0 */
  const WS = mkInst({ color: FW.COLOR.WIPE, period: 10, cover_span: 4,
                      palette: [[0,0,255],[255,120,0]] });
  const ws9 = render(WS, 10, 9);
  ok(ws9.h.slice(0, 4).every(v => v === 1) && ws9.h.slice(4).every(v => v === 0),
     '覆盖灯数 4：一趟扫满只盖前 4 颗，第 5 颗起一直是条目 0');

  /* 渐变条目：条目 1 是 [橙 → 绿] —— 覆盖扫到它时铺位置渐变；条目 0 仍是纯蓝（整块）。
   * 「一趟渐变、一趟纯色」同屏出现，正是「铺法由条目决定」的意思。 */
  const WG = mkInst({ color: FW.COLOR.WIPE, period: 10,
                      palette: [[0,0,255],[255,120,0, 0,255,0]] });
  const wg9 = render(WG, 10, 9);
  ok(wg9.h.every(v => v === 1), '渐变条目：一趟扫满整条都是条目 1');
  colorUpdate(WG.color, 9);
  const gFirst = effectColorAt(WG, 0, 10, wg9.h);
  const gLast  = effectColorAt(WG, 9, 10, wg9.h);
  const gMid   = effectColorAt(WG, 4, 10, wg9.h);
  ok(gFirst.r === 255 && gFirst.g === 120 && gFirst.b === 0 && gLast.r === 0 && gLast.g === 255,
     `渐变条目：首尾正好是两端色（${gFirst.r},${gFirst.g},${gFirst.b} → ${gLast.r},${gLast.g},${gLast.b}）`);
  ok(gMid.r > 120 && gMid.r < 170 && gMid.g > 160 && gMid.g < 200,
     `渐变条目：中间那颗是两色插值（${gMid.r},${gMid.g},${gMid.b}）`);
  const wg19 = render(WG, 10, 19);
  colorUpdate(WG.color, 19);
  const gBlue = effectColorAt(WG, 0, 10, wg19);
  const gBlueMid = effectColorAt(WG, 4, 10, wg19);
  ok(wg19.h.every(v => v === 0) && gBlue.b === 255 && gBlueMid.b === 255,
     '渐变条目：第 2 趟盖纯色条目 0 —— 整条硬边蓝（同一调色板里两种铺法轮流出现）');
  /* 只有 1 颗参与时渐变条目退化成末端色（S = 1 没有位置可插值） */
  {
    const W1 = mkInst({ color: FW.COLOR.WIPE, period: 10, cover_span: 1,
                        palette: [[0,0,255],[255,120,0, 0,255,0]] });
    const m1 = new Uint8Array(4), h1 = new Uint8Array(4);
    W1.anim.gen_tick = 9;
    renderZoneMaskTo(W1, m1, h1, 4, 0);
    colorUpdate(W1.color, 9);
    const one = effectColorAt(W1, 0, 4, h1);
    ok(h1[0] === 1 && h1[3] === 0 && one.r === 0 && one.g === 255,
       `覆盖灯数 1 + 渐变条目：唯一那颗 = 末端色（${one.r},${one.g},${one.b}）`);
  }

  /* 覆盖方向 = 单向：每趟都从同一头开始（条目仍一趟一换）—— 第 2 趟不再从另一头起步 */
  const WO = mkInst({ color: FW.COLOR.WIPE, period: 10, cover_dir: 1,
                      palette: [[0,0,255],[255,120,0]] });
  const wo0 = render(WO, 10, 0);
  ok(wo0.h[0] === 1 && wo0.h.slice(1).every(v => v === 0),
     '单向覆盖：第 1 趟照旧从第 1 颗起步');
  const wo10 = render(WO, 10, 10);
  ok(wo10.h[0] === 0 && wo10.h.slice(1).every(v => v === 1),
     '单向覆盖：第 2 趟还是从第 1 颗起步（每趟都从同一头推过去，不是来回）');
  const wo19 = render(WO, 10, 19);
  ok(wo19.h.every(v => v === 0), '单向覆盖：第 2 趟扫满 = 整条换成条目 0（一个单向循环）');

  /* 覆盖内核：hue[] = 条目索引（未参与 / 第 0 趟之前 = 0），索引按 n 回绕 */
  {
    const h1 = new Uint8Array(6);
    CORE.coverEntry(h1, 6, 0, 10, 0, 0, 3);
    ok(h1[0] === 1 && h1.slice(1).every(v => v === 0),
       `coverEntry：gen_tick 0 只扫到第 1 颗 → 条目 ${h1[0]}（其余 0 = 初始底色）`);
    const h2 = new Uint8Array(6);
    CORE.coverEntry(h2, 6, 10, 10, 0, 0, 3);          /* 第 1 趟从另一头起步 */
    ok(h2[5] === 2 && h2.slice(0, 5).every(v => v === 1),
       `coverEntry：第 1 趟末颗先换成条目 2（${[...h2].join(',')}）—— 索引按 n 回绕`);
    const h3 = new Uint8Array(4);
    CORE.coverEntry(h3, 4, 5, 10, 2, 0, 2);
    ok(h3[0] === 1 && h3[1] === 1 && h3[2] === 0 && h3[3] === 0,
       'coverEntry：覆盖灯数 2 —— 第 3 颗起一直是条目 0（不参与）');
  }

  /* 多色覆盖：调色板放 4 个纯色条目 → 第 r 趟盖条目 (r+1) % 4。
   * 这就是「调色板要多种颜色」的全部含义：放几个轮几个，最多 16 个。 */
  const WP = mkInst({ color: FW.COLOR.WIPE, period: 10,
                      palette: [[0,0,255],[255,120,0],[0,255,0],[255,0,255]] });
  const colAt = (tick, i, len) => {
    WP.anim.gen_tick = tick;
    colorUpdate(WP.color, tick);
    const m = new Uint8Array(len), h = new Uint8Array(len);
    renderZoneMaskTo(WP, m, h, len, 0);
    return { c: effectColorAt(WP, i, len, h), h };
  };
  const P0 = colAt(9, 0, 10), P1 = colAt(19, 0, 10), P2 = colAt(29, 0, 10), P3 = colAt(39, 0, 10);
  ok(P0.c.r === 255 && P0.c.g === 120 && P0.c.b === 0 &&
     P1.c.r === 0 && P1.c.g === 255 && P1.c.b === 0 &&
     P2.c.r === 255 && P2.c.g === 0 && P2.c.b === 255 &&
     P3.c.r === 0 && P3.c.g === 0 && P3.c.b === 255,
     `多色覆盖：4 个颜色逐趟轮换（第 1~4 趟分别盖 ${[P0, P1, P2, P3].map(x => `${x.c.r},${x.c.g},${x.c.b}`).join(' | ')}）`);
  /* 换趟那一帧：「这一趟刚盖的」是本趟盖色，「上一趟盖的」正好是本趟底色 —— 接缝不跳色 */
  const N2 = colAt(21, 0, 10), N2back = colAt(21, 5, 10);
  ok(N2.c.r === 255 && N2.c.g === 0 && N2.c.b === 255 && N2back.c.g === 255 && N2back.c.r === 0,
     '多色覆盖：换趟帧里上一趟那片就是本趟底色（颜色连续，不是硬跳）');
  /* 两色覆盖 = 老行为：条目 0 当底、条目 1 盖上去 */
  colorUpdate(W.color, 0);
  ok(W.color.phase === 0 && W.color.current.b === 255,
     '两色覆盖：第 1 趟 phase = 0（底色 = 条目 0、盖的是条目 1，与老版逐帧一致）');

  /* 覆盖参数的兜底：老存档没有 → 整条 + 往返；铺法看条目（没有独立参数） */
  ok(CORE.effCoverSpan({}) === 0 && CORE.effCoverSpan({ cover_span: 999 }) === 64 &&
     CORE.effCoverSpan({ cover_span: -3 }) === 0, '覆盖灯数夹在 0..64，缺省 0 = 整条');
  ok(CORE.effCoverDir({}) === 0 && CORE.effCoverDir({ cover_dir: 1 }) === 1 &&
     CORE.effCoverDir({ cover_dir: -5 }) === 0, '覆盖方向只有 0 往返 / 1 单向，缺省往返');
  ok(CORE.effCoverMode === undefined && CORE.effCoverGroup === undefined,
     '覆盖方式 / 每组趟数已退休（铺法看条目本身，不再有这两个辅助函数）');

  /* 条目形态：3 个数 = 纯色、6 个数 = 两端渐变；老存档 3 个 → 零迁移 */
  ok(CORE.palIsGrad([1,2,3]) === false && CORE.palIsGrad([1,2,3,4,5,6]) === true,
     'palIsGrad：3 个数纯色 / 6 个数渐变');
  const palRaw = CORE.effPaletteRaw({ palette: [[1,2,3], [4,5,6,7,8,9]] });
  ok(palRaw.length === 2 && palRaw[0].length === 3 && palRaw[1].length === 6 && palRaw[1][5] === 9 &&
     effPalette({ palette: [[4,5,6,7,8,9]] })[0].join(',') === '4,5,6',
     'effPaletteRaw 保留两端；effPalette 只取首端（其他配色照旧）');

  /* 老存档迁移：cover_mode 1（整条渐变）→ 条目 i 变 [pal[i] → pal[i+1]]；迁完置 0、幂等 */
  {
    const e1 = CORE.normalizeEffect({ color: FW.COLOR.WIPE, cover_mode: 1,
                                      palette: [[0,0,255],[255,120,0]] });
    ok(e1.cover_mode === 0 && e1.palette.length === 2 &&
       e1.palette[0].join(',') === '0,0,255,255,120,0' &&
       e1.palette[1].join(',') === '255,120,0,0,0,255',
       `cover_mode=1 迁移成渐变链（${e1.palette.map(c => c.join(',')).join(' | ')}）`);
    const before = JSON.stringify(e1.palette);
    CORE.normalizeEffect(e1);
    ok(JSON.stringify(e1.palette) === before, '迁移幂等：再 normalize 一次不会继续转');

    const e2 = CORE.normalizeEffect({ color: FW.COLOR.WIPE, cover_mode: 2, cover_group: 2,
                                      palette: [[1,1,1],[2,2,2],[3,3,3],[4,4,4]] });
    ok(e2.palette[0].length === 3 && e2.palette[1].length === 3 &&
       e2.palette[2].length === 6 && e2.palette[3].length === 6 && e2.cover_mode === 0,
       'cover_mode=2（混合）迁移：第 0 组纯色、第 1 组起渐变');

    const e3 = CORE.normalizeEffect({ color: FW.COLOR.WIPE, palette: [[1,2,3],[4,5,6]] });
    ok(e3.palette[0].length === 3 && e3.palette[1].length === 3,
       'cover_mode 缺省（纯色）：条目原样，不迁移');
  }

  /* 字段兜底：老效果没有 palette → 用 c1 / c2 兜底，但**纯黑的 c2 不算一种颜色**
   * （固件老表里 c2 = 0,0,0 = 「没有第二色」的占位符；照抄进调色板的话，
   * 呼吸 / 跳变会多出一个纯黑条目 —— 用户 2026-10-27：「呼吸第二个默认是黑色」） */
  ok(effPalette({ c1: [1,2,3] }).length === 1, '老效果没有 palette、也没有 c2 → 只有 c1（不补纯黑）');
  ok(effPalette({ c1: [1,2,3], c2: [0,0,0] }).length === 1, 'c2 是纯黑（固件表的占位符）→ 不算一种颜色');
  ok(effPalette({ c1: [1,2,3], c2: [4,5,6] }).length === 2, 'c2 真是另一种颜色 → 照收（旧双色渐变的蓝还在）');
  /* 呼吸：纯黑的占位条目在切过来时清掉（一个周期全灭 = 看着像停了）；其它配色不动 */
  {
    const bK = CORE.normalizeEffect({ color: FW.COLOR.BREATH, palette: [[255,0,0],[0,0,0]] });
    ok(bK.palette.length === 1 && bK.palette[0].join(',') === '255,0,0',
       `呼吸：纯黑的第 2 条目清掉（${JSON.stringify(bK.palette)}）`);
    CORE.normalizeEffect(bK);
    ok(bK.palette.length === 1, '呼吸的清黑是幂等的（再 normalize 一次不会继续动）');
    const b3 = CORE.normalizeEffect({ color: FW.COLOR.BREATH,
                                      palette: [[255,0,0],[0,255,0],[0,0,0]] });
    ok(b3.palette.length === 3, '呼吸：3 个以上条目时不动（用户自己放的颜色留着）');
    const sK = CORE.normalizeEffect({ color: FW.COLOR.STEP, palette: [[255,0,0],[0,0,0]] });
    ok(sK.palette.length === 2, '跳变：黑条目照留（那是「灭」的那一步，不是占位符）');
  }
  /* 色板上限 16 个（第 17 个起截掉）—— 导出的 pal_count 是 8 位数，工具侧收口 */
  const manyPal = Array.from({ length: 20 }, (_, i) => [i, i, i]);
  ok(effPalette({ palette: manyPal }).length === 16,
     `色板最多 16 个颜色：给 20 个只留 ${effPalette({ palette: manyPal }).length} 个`);
  const normMany = CORE.normalizeEffect({ palette: manyPal.map(c => c.slice()) });
  ok(normMany.palette.length === 16,
     `normalizeEffect 也截到 ${normMany.palette.length} 个（存档 / 导出同一个上限）`);
  ok(effLevels({ levels: 0 }) === 30 && effLevels({ levels: 2 }) === 6 && effLevels({ levels: 999 }) === 255,
     '彩虹级数夹在 6..255，缺省 30');
  ok(effPeriod({}) === 60 && effPeriod({ period: 1 }) === 2, '周期夹在 2..600，缺省 60');
  const pR = CORE.effectPreset({ kind:'custom', color: FW.COLOR.RAINBOW, levels: 24,
                                 hue_base: 1, hue_speed: 2, palette: [[1,2,3]] }, 0);
  ok(pR.palette.length === 1 && pR.levels === 24 && pR.hue_base === 1 && pR.hue_speed === 2,
     'effectPreset 把色板 / 级数 / 起点 / 旋转带给实例');
}

/* ============================================================================
 * 音控闪（预置「闪烁」）：没音乐 5 秒一闪 / 有音乐 500 ms 一闪 / 亮的时间可调
 *
 * 2026-10-27 用户第二次描述：「此效果在无音乐或者音乐信号小的时候，要做间隔 5s
 * 闪烁一次，有音乐时，这个间隔会变短，比如要 500ms 闪一次。如果信号持续很大，
 * 超过阈值就一直闪烁。这其中的间隔时间和闪烁亮的时间都是可调的。」
 * 并提醒固件要照【CFG_FUNC_SPI_RGB_EN】那份（spim_led.c 的 PixelFlash()：亮 100 ms、
 * 静音 4 秒一次、FFTLevel 过阈值就立刻重触发 → 于是持续闪），不是后来的
 * 【CFG_FUNC_LED_RING_EN】。
 * 2026-10-27 第三次：五个旋钮的名称 / 数值要跟直觉对上 ——「填充亮度 → 最高亮度」、
 * 「闪完暗到 → 最低亮度」（填**亮度本身**：0 = 全灭、255 = 最亮，不是「255 最暗」的
 * 衰减量），三个时间在界面上按 **ms** 填（图层里仍存 20 ms 一拍）。
 * 这里守五件事：① 增益只有两档（亮 = 满亮 / 灭 = 按最低亮度反算的 flashDarkGain）；
 * ② 安静时按 pulse_period 数拍子；③ 快档时按 flash_fast 数拍子，一直大声就一直闪；
 * ④ 亮的时长 = flash_on 拍；⑤ 灭的时候渲染出来的亮度就是「最低亮度」那个数。
 * ==========================================================================*/
console.log('--- 音控闪（预置「闪烁」）---');
{
  const { flashGain, flashDarkGain, flashPlanOf, instNew, layerNums, instTick, renderZoneMaskTo,
          FLASH_ON_DEF, WAVE: WV } = CORE;
  ok(flashGain(0, 10, 0) === 255 && flashGain(9, 10, 0) === 255 && flashGain(10, 10, 0) === 0,
     '「亮的时间」= 10 拍：第 0..9 拍满亮，第 10 拍起灭');
  ok(flashGain(10, 10, 51) === 51,
     `灭的那几拍用的是「最低亮度」反算出来的增益（51），不是 255-深度`);
  ok(flashGain(0, null, 0) === 255 && flashGain(FLASH_ON_DEF - 1, null, 0) === 255 &&
     flashGain(FLASH_ON_DEF, null, 0) === 0,
     `没有「亮的时间」时按缺省 ${FLASH_ON_DEF} 拍算`);
  /* 最低亮度（亮度本身）→ 灭时的增益：最高亮度 255 时一一对应，别的最高亮度按比例反算 */
  ok(flashDarkGain(0, 255) === 0 && flashDarkGain(128, 255) === 128 && flashDarkGain(255, 255) === 255,
     '最高亮度 = 255 时「最低亮度」就是增益本身（0 / 128 / 255 一个数都不差）');
  ok(flashDarkGain(50, 200) === 64 && Math.floor(200 * 64 / 255) === 50,
     `最高亮度 200 / 最低亮度 50 → 增益 ${flashDarkGain(50, 200)}，渲染回来还是 50（genFill 是 level×gain÷255）`);
  ok(flashDarkGain(0, 0) === 0 && flashDarkGain(255, 0) === 0,
     '最高亮度 0 = 本来全黑，增益给 0（不会除零）');

  const mkFlash = (per, opt) => {
    const o = opt || {};
    const inst = instNew();
    inst.anim.type = FW.ANIM_COUNT;        /* 自定义：渲染走 genRender 那一支 */
    inst.anim.layers = [layerNums({ kind:'fill', en:1, level:o.level == null ? 255 : o.level,
                                    pulse_period:per, wave: WV.FLASH,
                                    flash_fast: o.fast | 0, flash_on: o.on | 0,
                                    flash_low: o.low | 0 })];
    inst.speed_slow = 8; inst.speed_fast = 1; inst.speed_cur = 8;
    return inst;
  };
  const m = new Uint8Array(24), hue = new Uint8Array(24);
  const gainOf = inst => { renderZoneMaskTo(inst, m, hue, 24, 0); return m[0]; };
  /* 跑一段，返回「每一次闪的起始拍」 */
  const flashes = (inst, n, loudFn) => {
    const out = []; let prev = 0;
    for (let t = 0; t < n; t++) {
      instTick(inst, loudFn ? loudFn(t) : false);
      const g = gainOf(inst);
      if (g > 0 && prev === 0) out.push(t);
      prev = g;
    }
    return out;
  };

  ok(flashPlanOf([layerNums({ kind:'fill', wave: WV.FLASH, pulse_period: 250 })]).on === true,
     '带音控闪层的效果才会走这套状态机');
  {
    const p = flashPlanOf([layerNums({ kind:'fill', wave: WV.FLASH, pulse_period: 250,
                                       flash_fast: 25, flash_on: 10, flash_low: 60, level: 255 })]);
    ok(p.quiet === 250 && p.fast === 25 && p.bright === 10 && p.low === 60 && p.level === 255,
       `plan 取到五个旋钮：没音乐 ${p.quiet} 拍 / 有音乐 ${p.fast} 拍 / 亮 ${p.bright} 拍 / 最低亮度 ${p.low}（最高 ${p.level}）`);
  }
  ok(flashPlanOf([layerNums({ kind:'fill', wave: WV.TRI, pulse_period: 250 })]).on === false,
     '普通脉动层（三角 / 方波 / 锯齿）不受影响 —— 老存档行为一个字没变');
  ok(flashPlanOf([layerNums({ kind:'fill', wave: WV.FLASH, pulse_period: 0 })]).on === false,
     '脉动周期 0 = 不闪（与「脉动周期 0 = 不脉动」同一条规矩）');

  /* 安静：脉动周期 250 拍（5 秒）→ 600 拍里应该闪 3 次（第 0 / 250 / 500 拍） */
  const q = mkFlash(250, { fast: 25, on: 10 });
  const fq = flashes(q, 600);
  ok(fq.length === 3, `安静 600 拍闪了 ${fq.length} 次（5 秒一次）: ${fq.join(', ')}`);
  ok(fq.length >= 2 && (fq[1] - fq[0]) >= 249 && (fq[1] - fq[0]) <= 250,
     `安静时两次闪的间隔 ${fq[1] - fq[0]} 拍（250 拍 = 5 秒）`);

  /* 亮的时长 = flash_on：闪完那 10 拍之后就灭着等下一闪 */
  {
    const b = mkFlash(250, { fast: 25, on: 3 });
    const gs = [];
    for (let t = 0; t < 8; t++) { instTick(b, false); gs.push(gainOf(b)); }
    ok(gs[0] === 255 && gs[1] === 255 && gs[2] === 255 && gs[3] === 0 && gs[7] === 0,
       `「亮的时间」= 3 拍：${gs.join('/')}（之后一直灭）`);
    const c = mkFlash(25, { fast: 25, on: 40 });   /* 亮的比间隔还长 → 夹到间隔 = 常亮 */
    const cs = [];
    for (let t = 0; t < 60; t++) { instTick(c, false); cs.push(gainOf(c)); }
    ok(cs.every(g => g === 255), '亮的时间超过间隔时夹到间隔（等于常亮，不出黑帧）');
  }

  /* 最低亮度：闪完之后渲染出来的亮度就是填的那个数（不是「255 - 衰减量」）。
   * 最高亮度 200 + 最低亮度 50 → 亮的时候 200、灭的时候 50，两个都能在 mask 上读到。 */
  {
    const d = mkFlash(50, { fast: 25, on: 2, low: 50, level: 200 });
    const gs = [];
    for (let t = 0; t < 4; t++) { instTick(d, false); gs.push(gainOf(d)); }
    ok(gs[0] === 200 && gs[1] === 200 && gs[2] === 50 && gs[3] === 50,
       `最高亮度 200 / 最低亮度 50：亮 ${gs[0]}/${gs[1]}、灭 ${gs[2]}/${gs[3]}（暗下来正好是 50）`);
  }

  /* 有音乐：安静 100 拍（闪早已结束）→ 第 100 拍越过阈值 → 立刻闪一次，
     之后只要还在阈值以上，就按「有音乐间隔」25 拍一直闪（不是只闪一下）。 */
  const l = mkFlash(250, { fast: 25, on: 10 });
  const fl = flashes(l, 300, t => t >= 100);
  const gaps = fl.slice(2).map((v, i) => v - fl[i + 1]);   /* 只量「越过阈值之后」那几拍 */
  ok(fl[1] === 100,
     `越过阈值那一拍立刻闪（闪在 ${fl.slice(0, 4).join(', ')} … 拍）`);
  ok(gaps.length >= 6 && gaps.every(g => g === 25),
     `持续大声就一直闪：间隔 ${gaps.slice(0, 4).join(',')} 拍（flash_fast = 25 = 500 ms）`);
  ok(fl.length === 9, `300 拍里闪了 ${fl.length} 次（0 拍一次 + 100 拍起每 25 拍一次）`);
  ok(gainOf(l) === 0, '每次只亮 10 拍，最后一拍正落在两次闪之间 = 全灭');

  /* 长间隔：三列时间是 uint16 帧，20 秒 = 1000 拍也要真的数得下去。
   * 老写法（uint8）在 256 拍就绕回，这里会闪成 8 次以上。 */
  {
    const lg = mkFlash(1000, { fast: 25, on: 10 });
    const flg = flashes(lg, 2100);
    ok(flg.length === 3 && flg[1] === 1000 && flg[2] === 2000,
       `间隔 1000 拍（20 秒）在 2100 拍里闪了 ${flg.length} 次: ${flg.slice(0, 3).join(', ')}（uint8 会在 256 拍就绕回）`);
    ok(flashPlanOf([layerNums({ kind:'fill', wave: WV.FLASH, pulse_period: 1000 })]).quiet === 1000,
       'plan 原样带出 > 255 的间隔（没有被夹成 8 位）');
    /* 存档里的怪值也别让 C 装不下：手改 JSON 写成 999999 时夹到 65535 拍 */
    ok(layerNums({ kind:'fill', wave: WV.FLASH, pulse_period: 999999,
                   flash_fast: -5, flash_on: 70000 }).pulse_period === 65535 &&
       layerNums({ kind:'fill', wave: WV.FLASH, flash_fast: -5 }).flash_fast === 0 &&
       layerNums({ kind:'fill', wave: WV.FLASH, flash_on: 70000 }).flash_on === 65535,
       '三列时间都按 uint16 夹住（999999 → 65535、负数 → 0），与 C 结构体装得下的一致');
  }

  /* 音乐停了 → 重新按 5 秒自己闪（不是从 0 重来，接着上次的账往下数） */
  const r = mkFlash(250, { fast: 25, on: 10 });
  const fr = flashes(r, 400, t => t >= 100 && t < 120);
  ok(fr.length === 3 && fr[1] === 100 && fr[2] > 200,
     `音乐停了之后又回到「自己闪」(${fr.join(', ')} 拍)`);
}
/* ============================================================================
 * 旋转 / 流动跟快慢档（flow 时钟）
 * ==========================================================================*/
console.log('--- 旋转 / 流动跟快慢档（flow 时钟）---');
{
  const { instNew, instApplyPreset, instFlowStep, flowTickOf, renderZoneMaskTo,
          genRender, colorUpdate, LAYER } = CORE;
  const base = { anim: FW.ANIM.STATIC, width: 10, gap: 0, slow: 8, fast: 1, speed: 1,
                 c1: [255, 0, 0], c2: [0, 0, 0] };
  const mk = p => { const I = instNew(); instApplyPreset(I, Object.assign({}, base, p)); return I; };
  const run = (I, n) => {
    for (let i = 0; i < n; i++) {
      I.anim.gen_tick = (I.anim.gen_tick + 1) & 0xFFFF;
      instFlowStep(I);
    }
  };

  const slow = mk({}); slow.speed_cur = 8; run(slow, 8);
  ok(flowTickOf(slow) === 8 && flowTickOf(slow) === slow.anim.gen_tick,
     '慢档：流动时钟 = gen_tick（1:1，老效果逐拍不变）');
  const fast = mk({}); fast.speed_cur = 1; run(fast, 2);
  ok(flowTickOf(fast) === 16 && fast.anim.gen_tick === 2,
     `快档：2 拍流动时钟 = ${flowTickOf(fast)}（8 倍）`);

  /* 彩虹旋转用流动时钟：同样 2 拍，快档转 8 格、按 gen_tick 只有 1 格 */
  const R = mk({ color: FW.COLOR.RAINBOW, levels: 30, hue_speed: 2 });
  R.speed_cur = 1; run(R, 2);
  const m1 = new Uint8Array(30), h1 = new Uint8Array(30);
  renderZoneMaskTo(R, m1, h1, 30, 0);
  const b3 = Math.floor(3 * 256 / 30);
  ok(h1[3] === ((b3 + 8) & 0xFF) && h1[3] !== ((b3 + 1) & 0xFF),
     `彩虹旋转跟流动时钟：2 拍（快档）转 ${Math.floor(flowTickOf(R) / 2)} 格（按 gen_tick 只有 1 格）`);

  /* 渐变层的旋转：同一个 tick、不同 flowTick → 结果不同 */
  const L = [{ kind: LAYER.GRADIENT, en: 1, lo: 0, hi: 255, spans: 1, phase: 0, wave: 0, rotate: 2 }];
  const g1 = new Uint8Array(8), g2 = new Uint8Array(8);
  genRender(g1, 8, 0, L, 2, 0, 0, 255, 2);
  genRender(g2, 8, 0, L, 2, 0, 0, 255, 16);
  ok(!g1.every((v, i) => v === g2[i]), '渐变层的旋转用 flowTick（快档转得更多）');

  /* 渐变配色的色环流动：只跟自己的速度 / 真实拍数，不跟快慢档 */
  const c = { type: FW.COLOR.SPECTRUM, phase: 0, tick_cnt: 0, spectrum_speed: 1, spectrum: FW.spectrum_tbl };
  colorUpdate(c, 2, 16);                    /* tick = 2、flowTick = 16（快档）→ 相位仍只走 2 */
  ok(c.phase === 2 && c.tick_cnt === 0,
     `渐变配色只按真实拍数走（2 拍 → 相位 ${c.phase}，快档的 flowTick 不影响）`);

  /* 覆盖的趟号：同一 gen_tick、flow 快 → 扫得更远 */
  const w1 = mk({ color: FW.COLOR.WIPE, period: 10, palette: [[0, 0, 255], [255, 120, 0]] });
  const w2 = mk({ color: FW.COLOR.WIPE, period: 10, palette: [[0, 0, 255], [255, 120, 0]] });
  w1.anim.gen_tick = 6; w1.flow_tick = 6;
  w2.anim.gen_tick = 6; w2.flow_tick = 16;
  const a1 = new Uint8Array(8), e1 = new Uint8Array(8), a2 = new Uint8Array(8), e2 = new Uint8Array(8);
  renderZoneMaskTo(w1, a1, e1, 8, 0);
  renderZoneMaskTo(w2, a2, e2, 8, 0);
  ok(!e1.every((v, i) => v === e2[i]), '覆盖的趟号用 flowTick（快档扫得更快）');
}
/* ============================================================================
 * 扫描填充（预置「单向填充 / 双向填充」，移植固件 PixelFill_OneWay / TwoWay）
 * ==========================================================================*/
console.log('--- 扫描填充（单向 / 双向）---');
{
  const { instNew, instApplyPreset, instTick, flowTickOf, sweepStateNew, sweepStep,
          renderZoneMaskTo, effectColorAt, sweepHeadColor, LAYER } = CORE;
  const mk = (wave, rotate) => {
    const I = instNew();
    instApplyPreset(I, { anim: FW.ANIM_COUNT, width: 10, gap: 0, slow: 8, fast: 1,
                         speed: 0, c1: [255, 255, 255], c2: [0, 0, 0] });
    I.anim.layers = [{ kind: LAYER.SWEEP, en: 1, wave, rotate, lo: 120, hi: 255 }];
    return I;
  };
  /* 一拍 = instTick + 该分区自己那份状态按 rotate 走一步（与 simTick / C 的 tick 同规则） */
  const tick1 = (I, st, N) => {
    instTick(I, false);
    const L = I.anim.layers[0];
    const ft = flowTickOf(I);
    const need = Math.max(1, L.rotate | 0);
    if (((ft - st.t) & 0xFFFF) >= need) { st.t = ft; sweepStep(st, L, N); }
  };
  const shot = (I, st, len) => {
    const m = new Uint8Array(len), h = new Uint8Array(len);
    renderZoneMaskTo(I, m, h, len, 0, st);
    return m;
  };
  const run = (I, st, n, N) => { for (let i = 0; i < n; i++) tick1(I, st, N); };

  /* 单向：头部从远端（N-1）往回走，走到已填边界时已填区域长一颗 */
  const A = mk(0, 1), sA = sweepStateNew(24);
  tick1(A, sA, 24);
  let mA = shot(A, sA, 24);
  ok(sA.num === 22 && sA.low === 0 && mA[22] === 255 && mA[0] === 0,
     `单向第 1 步：头部到 ${sA.num}，还没填（${mA[22]}）`);
  run(A, sA, 22, 24);                    /* 一共 23 步：头部走到 0 → 已填 +1 */
  mA = shot(A, sA, 24);
  ok(sA.low === 1 && sA.num === 23 && mA[0] === 120 && mA[23] === 255,
     `单向 23 步：已填 1 颗（${mA[0]}）、头部回到远端 ${sA.num}`);

  /* 双向：两端交替长，头部在两端之间来回弹 */
  const B = mk(1, 1), sB = sweepStateNew(24);
  run(B, sB, 23, 24);
  let mB = shot(B, sB, 24);
  ok(sB.low === 1 && sB.high === 0 && sB.dir === 1 && mB[0] === 120,
     `双向 23 步：低端先长 1 颗（low=${sB.low} / high=${sB.high} / dir=${sB.dir}）`);
  run(B, sB, 22, 24);                    /* 头部走到高端 → 高端 +1 */
  mB = shot(B, sB, 24);
  ok(sB.low === 1 && sB.high === 1 && sB.dir === 0 &&
     mB[0] === 120 && mB[23] === 120,
     `双向 45 步：两端各 1 颗（${mB[0]} / ${mB[23]}）`);

  /* 按**分区自己的灯数**一颗一颗走：40 颗的分区每步只长 1 颗（旧版按 1/24 环会一次长 2 颗） */
  {
    const E40 = mk(0, 1), s40 = sweepStateNew(40);
    run(E40, s40, 1, 40);
    const m1 = shot(E40, s40, 40);
    ok(s40.num === 38 && m1.filter(v => v > 0).length === 1,
       `40 颗：第 1 步只亮头部 1 颗（${m1.filter(v => v > 0).length} 颗亮）`);
    run(E40, s40, 38, 40);               /* 走到 0 → 已填 1 */
    const m2 = shot(E40, s40, 40);
    ok(s40.low === 1 && m2[0] === 120 && m2[1] === 0,
       '40 颗：已填只长 1 颗（第 2 颗还是灭的）');
    /* 8 颗同理：一步一颗，不会一次亮 3 颗 */
    const E8 = mk(0, 1), s8 = sweepStateNew(8);
    run(E8, s8, 1, 8);
    const m8 = shot(E8, s8, 8);
    ok(m8.filter(v => v > 0).length === 1, `8 颗：第 1 步也只有头部 1 颗（${m8.join(',')}）`);
  }

  /* 初始常亮：每一轮回到起点时保留的灯数 */
  {
    const L3 = mk(0, 1); L3.anim.layers[0].lit = 3;
    const s3 = sweepStateNew(24, 3);
    ok(s3.low === 3 && s3.num === 23, `初始常亮 3：起点就亮 3 颗（low=${s3.low}）`);
    const m0 = shot(L3, s3, 24);
    ok(m0[0] === 120 && m0[2] === 120 && m0[3] === 0 && m0[23] === 255,
       '起点：前 3 颗常亮 + 头部在远端');
    let g = 0;
    while (s3.phase === 0 && g++ < 5000) tick1(L3, s3, 24);       /* 填满 */
    ok(s3.phase === 1, '填满后进入清空');
    g = 0;
    while (s3.phase === 1 && g++ < 5000) tick1(L3, s3, 24);       /* 清到「初始常亮」为止 */
    const m1 = shot(L3, s3, 24);
    ok(s3.phase === 0 && s3.low === 3 && s3.num === 23 &&
       m1[0] === 120 && m1[2] === 120 && m1[3] === 0,
       `一圈跑完回到起点：仍保留 3 颗常亮（low=${s3.low}）`);
  }

  /* 头部颜色：只有头部那一颗用图层「头部颜色」，已填段仍走效果级配色 */
  {
    const eff = { kind:'custom', color: FW.COLOR.SOLID, c1: [1, 2, 3], slow: 8, fast: 1, speed: 0, moves: false,
                  layers: [{ kind: 'sweep', en: 1, wave: 0, rotate: 1, lo: 120, hi: 255, hc: [10, 20, 30] }] };
    const I2 = CORE.instNew();
    CORE.simApplyEffect(I2, eff, 0);
    const s2 = sweepStateNew(24);
    tick1(I2, s2, 24);
    const m2 = new Uint8Array(24), h2 = new Uint8Array(24);
    CORE.renderZoneMaskTo(I2, m2, h2, 24, 0, s2);
    const ch = effectColorAt(I2, s2.num, 24, h2, s2);
    ok(ch.r === 10 && ch.g === 20 && ch.b === 30, `头部用图层的头部颜色（${ch.r},${ch.g},${ch.b}）`);
    ok(m2[s2.num] === 255, '头部亮度仍是「头部亮度」那一格');
    ok(effectColorAt(I2, 5, 24, h2, s2).r === 1 && effectColorAt(I2, 5, 24, h2, s2).g === 2,
       '其它灯位仍走效果级配色（纯色 c1 = 1,2,3）');
    /* 没配固定色 → 头部跟配色（预设「单向/双向填充」就是这个状态） */
    const eff3 = { kind:'custom', color: FW.COLOR.SOLID, c1: [1, 2, 3], slow: 8, fast: 1, speed: 0, moves: false,
                   layers: [{ kind: 'sweep', en: 1, wave: 0, rotate: 1, lo: 120, hi: 255 }] };
    const I3 = CORE.instNew();
    CORE.simApplyEffect(I3, eff3, 0);
    const s3 = sweepStateNew(24);
    tick1(I3, s3, 24);
    const m3 = new Uint8Array(24), h3 = new Uint8Array(24);
    CORE.renderZoneMaskTo(I3, m3, h3, 24, 0, s3);
    ok(sweepHeadColor(I3, s3.num, 24, s3) === null, '「跟配色」时头部不覆盖（sweepHeadColor = null）');
    const c3 = effectColorAt(I3, s3.num, 24, h3, s3);
    ok(c3.r === 1 && c3.g === 2 && c3.b === 3, `跟配色时头部用效果色（${c3.r},${c3.g},${c3.b}）`);

    /* 头部「彩虹」：按头部在环上的位置取彩虹色（与效果级同一 levels / 起色 / 旋转） */
    {
      const effR = { kind:'custom', color: FW.COLOR.SOLID, c1: [0, 0, 0], slow: 8, fast: 1, speed: 0, moves: false,
                     levels: 30, hue_base: 0, hue_speed: 0,
                     layers: [{ kind: 'sweep', en: 1, hm: 2, wave: 0, rotate: 1, lo: 120, hi: 255 }] };
      const IR = CORE.instNew();
      CORE.simApplyEffect(IR, effR, 0);
      const sR = sweepStateNew(24);
      tick1(IR, sR, 24);
      const mR = new Uint8Array(24), hR = new Uint8Array(24);
      CORE.renderZoneMaskTo(IR, mR, hR, 24, 0, sR);
      const hue = Math.floor((sR.num * 256) / 30) & 0xFF;
      const cR = effectColorAt(IR, sR.num, 24, hR, sR);
      ok(cR === FW.spectrum_tbl[hue], `头部彩虹：按位置取第 ${hue} 级`);
      ok(effectColorAt(IR, 5, 24, hR, sR).r === 0, '头部彩虹不影响常亮段（仍是效果色）');
    }
    /* 头部「渐变」：取效果那张渐变环当前相位（与 colorUpdate 同一公式） */
    {
      const effG = { kind:'custom', color: FW.COLOR.SPECTRUM, c1: [0, 0, 0], slow: 8, fast: 1, speed: 1,
                     grad_step: 1, moves: false,
                     layers: [{ kind: 'sweep', en: 1, hm: 3, wave: 0, rotate: 1, lo: 120, hi: 255 }] };
      const IG = CORE.instNew();
      CORE.simApplyEffect(IG, effG, 0);
      const sG = sweepStateNew(24);
      tick1(IG, sG, 24);
      const mG = new Uint8Array(24), hG = new Uint8Array(24);
      CORE.renderZoneMaskTo(IG, mG, hG, 24, 0, sG);
      const cG = effectColorAt(IG, sG.num, 24, hG, sG);
      ok(cG === IG.color.spectrum[IG.color.phase] && IG.color.phase === 1,
         `头部渐变：取当前相位 ${IG.color.phase} 的颜色`);
    }
    /* 头部渐变也可以从色库里挑一条（不跟效果那张） */
    {
      const st2 = CORE.projectFromPreset(CORE.PRESET_SP3122D);
      const gid = CORE.gradList(st2)[0].id;
      const effH = { kind:'custom', color: FW.COLOR.SPECTRUM, c1: [0, 0, 0], slow: 8, fast: 1, speed: 1,
                     grad_step: 1, moves: false,
                     layers: [{ kind: 'sweep', en: 1, hm: 3, hg: gid, wave: 0, rotate: 1, lo: 120, hi: 255 }] };
      const IH = CORE.instNew();
      CORE.simApplyEffect(IH, effH, 0, st2);
      const sH = sweepStateNew(24);
      tick1(IH, sH, 24);
      const mH = new Uint8Array(24), hH = new Uint8Array(24);
      CORE.renderZoneMaskTo(IH, mH, hH, 24, 0, sH);
      const tbl = CORE.gradTable(CORE.gradById(st2, gid));
      ok(IH.swGrad === tbl, '头部渐变：实例拿到色库里选的那张表');
      ok(effectColorAt(IH, sH.num, 24, hH, sH) === tbl[IH.color.phase],
         '头部渐变：取的是那张表的当前相位色');
    }
  }

  /* 填满 → 清空阶段（固件 CFG_FUNC_RGB_FILL_CLEAR_EN=1），清完再从头开始 */
  const C1 = mk(0, 1), sC = sweepStateNew(24);
  let guard = 0;
  while (sC.phase === 0 && guard++ < 2000) tick1(C1, sC, 24);
  ok(sC.phase === 1 && sC.clear === 23, `单向填满后进入清空阶段（clear=${sC.clear}）`);
  const mC = shot(C1, sC, 24);
  ok(mC[23] === 255 && mC[0] === 120, '清空阶段：头部在最远端，前面仍然亮着');
  run(C1, sC, 24, 24);                   /* 清到底 → 复位 */
  ok(sC.phase === 0 && sC.low === 0 && sC.num === 23, '清完复位：从头开始填');
}


/* ============================================================================
 * 每效果「平滑 T」（2026-10-28 第十三轮，用户定）
 *
 * 作用在**亮度（mask）**上、每个效果独立、**只在慢档生效**（快档直通省算力）；
 * 参数只有一个「全幅时间 T」(ms)：0 = 关（老工程 / 内建行），新效果 / 套预置缺省 60。
 * 每拍最多变 ceil(255 × 20 / T) 级（夹 1..255），剩下不足一步就吸附到目标。
 * 这里守五件事：① 慢档逐拍爬上去；② 目标变暗时也逐拍爬下来；③ T = 0 直通；
 * ④ 快档直通（不进斜坡）；⑤ 切档不残留（直通那一拍把缓冲同步好，回慢档不会从旧值续爬）。
 * ==========================================================================*/
console.log('--- 每效果平滑 T（只在慢档）---');
{
  const { smoothStepOf, effSmooth, newCustomEffect, projectFromPreset: proj,
          simInit, simApplyMode, simSetSpeed, simTick, SMOOTH_MS_DEF } = CORE;
  /* 一条满亮填充（纯白），只绑分区 0；T 由参数给。 */
  const mkState = smooth => {
    const s = proj(CORE.PRESET_SP3122D);
    const e = Object.assign(newCustomEffect(0, '平滑'), {
      color: FW.COLOR.SOLID, c1: [255, 255, 255], smooth, moves: false,
      layers: [{ kind:'fill', level:255, en:1, pulse_period:0, pulse_amp:0, wave:0,
                 direction:1, bounce:0, spans:0, rotate:0 }],
    });
    s.effects = { version: 1, list: [e] };
    s.modes = { version: 1, list: [{ id:'m0', name:'平滑', latin:'SMOOTH', enabled: true,
                                      binds: [{ effect: e.id, zones: [0] }] }] };
    return s;
  };
  const run = (smooth, ticks, speed) => {
    const s = mkState(smooth);
    const sim = simInit();
    simApplyMode(sim, s);
    simSetSpeed(sim, speed);
    const vals = [], shown = [];
    for (let t = 0; t < ticks; t++) {
      simTick(sim, s, false);
      shown.push(sim.shown[0][0]);
      vals.push(sim.fb[0]);            /* 纯白 × mask × 256 >> 16（mask 255 时是 254） */
    }
    return { sim, s, vals, shown };
  };

  /* ① 慢档：0 → 255 分三拍爬（T = 60ms → 每拍 ceil(255×20/60) = 85 级） */
  const up = run(60, 3, 'slow');
  ok(JSON.stringify(up.shown) === '[85,170,255]' && up.vals[2] === 254 &&
     smoothStepOf(60) === 85 && effSmooth(newCustomEffect(0)) === SMOOTH_MS_DEF,
     `慢档逐拍爬坡：${up.shown.join(' → ')}（T = 60ms = 每拍 85 级），第 3 拍画面 ${up.vals[2]}/254；`
     + `新效果默认 ${SMOOTH_MS_DEF}ms`);

  /* ② 降：满亮之后把目标改成 0 —— 同样是每拍 85 级地爬下去，不是一帧全灭 */
  const down = run(60, 3, 'slow');
  down.sim.insts[0].anim.layers[0].level = 0;
  const dn = [];
  for (let t = 0; t < 3; t++) { simTick(down.sim, down.s, false); dn.push(down.sim.shown[0][0]); }
  ok(JSON.stringify(dn) === '[170,85,0]',
     `目标变暗时也逐拍爬下去：${dn.join(' → ')}（剩下不足一步就吸附到 0）`);

  /* ③ T = 0 = 关（老工程 / 内建行）：一拍照满，没有爬坡 */
  const flat = run(0, 2, 'slow');
  ok(flat.shown[0] === 255 && flat.shown[1] === 255 && flat.vals[1] === 254 && effSmooth({}) === 0,
     'T = 0（老工程 / 内建行）= 直通：第一拍照满 255，画面与上一版逐字节相同');

  /* ④ 快档直通：T 虽然 60ms，快档第一拍就已经是 255（快档不做平滑，省算力） */
  const fast = run(60, 2, 'fast');
  ok(fast.shown[0] === 255 && fast.shown[1] === 255 && fast.vals[0] === 254,
     '快档直通：T = 60ms 时第 1 拍就已经是 255（快档不跑斜坡）');

  /* ⑤ 切档不残留：慢档爬到 170 → 进快档直通（缓冲同步成 255）→ 回慢档仍是 255，
   *    不会从快档之前的旧值接着爬（否则切一次档会莫名暗一下再爬回来）。 */
  const sw = run(60, 2, 'slow');
  simSetSpeed(sw.sim, 'fast'); simTick(sw.sim, sw.s, false);
  const midShown = sw.sim.shown[0][0];
  simSetSpeed(sw.sim, 'slow'); simTick(sw.sim, sw.s, false);
  ok(sw.shown[1] === 170 && midShown === 255 && sw.sim.shown[0][0] === 255,
     `切档不残留：慢档爬到 ${sw.shown[1]} → 快档直通到 ${midShown} → 回慢档仍是 `
     + `${sw.sim.shown[0][0]}（没有从旧的低值续爬）`);
}

console.log(fails ? `\n=== ${fails} 项未通过 ===` : '\n=== 全部通过 ===');
process.exit(fails ? 1 : 0);
