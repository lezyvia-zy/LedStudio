/* 图层原语的 JS 行为测试 */
import fs from 'node:fs';
const CORE = new Function(fs.readFileSync('led_layout_editor.html','utf8')
  .match(/<script id="core">([\s\S]*?)<\/script>/)[1] + '\n; return CORE;')();
const { FW, FALL, LAYER, WAVE, CMODE, pulseGain, bouncePos, layerHue,
        genSpot, genTwinkle, genFill, genGradient, genRender, chaseSingle, zoneScaled } = CORE;
let fails = 0;
const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fails++; };

const mk = len => new Uint8Array(len);
const hz = len => new Uint8Array(len).fill(0xFF);
const SP = (m, h, len, pos, L, g, t) => genSpot(m, h, len, pos,
  Object.assign({ kind:'spot', count:1, width:8, phase:0, falloff:FALL.COS, pulse_period:0,
                  pulse_amp:0, wave:0, direction:1, bounce:0, cmode:0,
                  hue_base:0, hue_spread:0, hue_speed:0, spans:0, rotate:0, flags:1 }, L), g || 255, t || 0);

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
    SP(b, hz(len), len, pos, { width: w, falloff: FALL.HARD });
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
  for (let pos = 0; pos <= len * 256 * 2; pos += 137) {
    const m = mk(len);   /* 原语是逐点取最大，必须用干净缓冲 */
    SP(m, hz(len), len, pos, { width: 4, bounce: 1 });
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

/* ---- 4) 多点 / TAIL ---- */
console.log('--- 多点与拖尾 ---');
{
  const len = 24, m = mk(len);
  SP(m, hz(len), len, 0, { count: 3, width: 2 });
  let peaks = 0;
  for (let i = 0; i < len; i++) if (m[i] > 200 && m[(i + 1) % len] <= 200) peaks++;
  ok(peaks === 3, `count=3 亮点峰数 = ${peaks}`);
}
{
  const len = 24, m = mk(len);
  SP(m, hz(len), len, 0, { count: 1, width: 4, falloff: FALL.TAIL, direction: 1 });
  let peakAt = 0, peak = 0;
  for (let i = 0; i < len; i++) if (m[i] > peak) { peak = m[i]; peakAt = i; }
  let back = 0, front = 0;
  for (let i = 1; i < 10; i++) { back += m[(peakAt + i) % len]; front += m[(peakAt - i + len) % len]; }
  ok(peak === 255, '拖尾头部达 255');
  ok(back > front, `单边拖尾：头后方 ${back} > 前方 ${front}`);
}

/* ---- 5) FILL 呼吸 ---- */
console.log('--- 填充 / 呼吸 ---');
{
  const len = 24, L = { kind:'fill', level:200, pulse_period:40, pulse_amp:255, wave:WAVE.TRI, direction:1 };
  const m = mk(len);
  genFill(m, hz(len), len, L, pulseGain(0, 40, 255, WAVE.TRI), 0);
  ok(m.every(v => v === 200), 'tick=0 整环 = level');
  const m2 = mk(len);
  genFill(m2, hz(len), len, L, pulseGain(20, 40, 255, WAVE.TRI), 0);
  ok(m2.every(v => v === 0), '半周期整环 = 0（呼吸到最暗）');
}
{
  const len = 16, m = mk(len);
  genFill(m, hz(len), len, { kind:'fill', level:200, pulse_period:0, pulse_amp:255, direction:1 }, 255, 0);
  ok(m.every(v => v === 200), 'period=0 不脉动');
}

/* ---- 6) 渐变层 ---- */
console.log('--- 亮度渐变 ---');
{
  const len = 32, m = mk(len);
  genGradient(m, hz(len), len, { kind:'gradient', lo:0, hi:255, spans:1, phase:0, wave:WAVE.TRI, rotate:0 }, 0);
  ok(m[0] < 20 && m[len/2] > 240 && m[len-1] < 20,
     `三角渐变：两头暗中间亮 (${m[0]}, ${m[len/2]}, ${m[len-1]})`);
}
{
  const len = 32, m = mk(len);
  genGradient(m, hz(len), len, { kind:'gradient', lo:0, hi:255, spans:1, phase:0, wave:WAVE.SAW, rotate:0 }, 0);
  ok(m[0] < 20 && m[len-1] > 230, `锯齿渐变：一路升到顶 (${m[0]} -> ${m[len-1]})`);
}
{
  const len = 32, a = mk(len), b = mk(len);
  const L = { kind:'gradient', lo:0, hi:255, spans:1, phase:0, wave:WAVE.SAW, rotate:4 };
  genGradient(a, hz(len), len, L, 0);
  genGradient(b, hz(len), len, L, 8);
  ok(a.some((v, i) => v !== b[i]), '旋转参数能改变图案');
  const c = mk(len);
  genGradient(c, hz(len), len, { kind:'gradient', lo:0, hi:255, spans:1, phase:128, wave:WAVE.SAW, rotate:0 }, 0);
  ok(c.some((v, i) => v !== a[i]), '起始位能改变图案');
}

/* ---- 7) 空间色相 ---- */
console.log('--- 空间色相 ---');
{
  const L = { cmode:CMODE.SPATIAL, hue_base:0, hue_spread:255, hue_speed:0 };
  const h0 = layerHue(L, 0, 40, 0), h20 = layerHue(L, 20, 40, 0), h39 = layerHue(L, 39, 40, 0);
  ok(h0 === 0 && h20 === 127 && h39 === 248, `沿环铺满一轮: ${h0} -> ${h20} -> ${h39}`);
  ok(layerHue(L, 5, 40, 0) === layerHue(L, 5, 40, 99), 'hue_speed=0 时不随时间变');
}
{
  const L = { cmode:CMODE.SPATIAL, hue_base:10, hue_spread:0, hue_speed:4 };
  ok(layerHue(L, 3, 24, 0) === 10, 'hue_speed 起点');
  ok(layerHue(L, 3, 24, 8) === 12, `每 4 帧 +1 (tick=8 -> ${layerHue(L, 3, 24, 8)})`);
  ok(layerHue(L, 3, 24, 4096) === ((10 + 1024) & 0xFF), '长时间后仍按 8 位回绕');
}
{
  ok(layerHue({ cmode:CMODE.GLOBAL, hue_base:99, hue_spread:255 }, 7, 24, 0) === 0xFF,
     'GLOBAL 模式返回 0xFF（交给全局配色）');
}
{
  const len = 24, m = mk(len), h = hz(len);
  const fillL = { kind:LAYER.FILL, level:100, pulse_period:0, pulse_amp:0, wave:0, direction:1, bounce:0,
                  cmode:CMODE.GLOBAL, hue_base:0, hue_spread:0, hue_speed:0, spans:0, rotate:0, flags:1 };
  const spotL = { kind:LAYER.SPOT, count:1, width:6, phase:0, falloff:FALL.COS, pulse_period:0, pulse_amp:0,
                  wave:0, direction:1, bounce:0, cmode:CMODE.SPATIAL, hue_base:0, hue_spread:255,
                  hue_speed:0, spans:0, rotate:0, flags:1 };
  genRender(m, h, len, 0, [fillL, spotL], 0, 0);
  let hueCount = 0, globalCount = 0;
  for (let i = 0; i < len; i++) { if (h[i] === 0xFF) globalCount++; else hueCount++; }
  ok(hueCount > 0 && globalCount > 0, `光点处用空间色相(${hueCount} 灯位)、其余用全局配色(${globalCount} 灯位)`);
  let peakAt = 0, peak = -1;
  for (let i = 0; i < len; i++) if (m[i] > peak) { peak = m[i]; peakAt = i; }
  ok(h[peakAt] !== 0xFF, '最亮的灯位上写的是空间色相');
  const hues = [...h].filter(v => v !== 0xFF);
  ok(new Set(hues).size > 1, `被光点覆盖的灯位色相各不相同（${new Set(hues).size} 种色相，是彩虹不是单色）`);
}

/* ---- 8) 起始位（offset）---- */
console.log('--- 起始位 ---');
{
  const len = 40, m = mk(len), h = hz(len);
  const layers = [{ kind:LAYER.SPOT, count:1, width:4, phase:0, falloff:FALL.COS, pulse_period:0, pulse_amp:0,
                    wave:0, direction:1, bounce:0, cmode:0, hue_base:0, hue_spread:0, hue_speed:0,
                    spans:0, rotate:0, flags:1 }];
  const at = off => { genRender(m, h, len, 0, layers, 0, off); return m.indexOf(Math.max.apply(null, m)); };
  const a0 = at(0), a10 = at(10), a20 = at(20);
  ok(a0 !== a10 && a10 !== a20, `起始位把光点挪开了: ${a0} -> ${a10} -> ${a20}`);
  const back = at(255);
  ok(Math.abs(back - a0) <= 1, `offset=255 绕回起点附近 (${back} vs ${a0})`);
}

/* ---- 9) 边界与性质 ---- */
console.log('--- 边界与性质 ---');
{
  const m = mk(1);
  SP(m, hz(1), 1, 0, { width: 1 });
  ok(m[0] === 254, `len=1 单灯 = ${m[0]}（254 是对的：cos_window_tbl[0] 本身是 254）`);
}
{
  const len = 24, m = mk(len);
  SP(m, hz(len), len, 0, { count: 32, width: 1 });
  ok(m.every(v => v <= 255), 'count=32 不溢出');
  const m2 = mk(len);
  SP(m2, hz(len), len, 0, { width: 255, phase: 255 });
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
        kind, cmode: (t + k) % 2, hue_base: (t*7)%256, hue_spread: (t*11)%256,
        hue_speed: (t*3)%20, spans: 1 + ((t+k)%3), rotate: (t*5)%12,
        pulse_period: (t*3+k)%40, pulse_amp: (t*11+k)%256,
        wave: (t+k)%3, direction: (t+k)%2, bounce: (t+k)%2,
        lo: (t*5)%200, hi: 200 + ((t*3)%55), level: (t*31)%256,
        density: (t*17)%256, rate: 1+(t%8), count: (t*7+k)%32,
        width: (t*13+k)%64, phase: (t*29+k)%256, falloff: (t+k)%4 });
    }
    const pos = (t * 333) % (len * 256), tick = (t * 77) & 0xFFFF;
    const m1 = mk(len), m2 = mk(len), h1 = hz(len), h2 = hz(len);
    genRender(m1, h1, len, pos, layers, tick, t % 256);
    genRender(m2, h2, len, pos, layers, tick, t % 256);
    for (let i = 0; i < len; i++) {
      if (m1[i] > 255) bad++;
      if (m1[i] !== m2[i] || h1[i] !== h2[i]) bad++;
      maxSeen = Math.max(maxSeen, m1[i]);
    }
  }
  ok(bad === 0, `600 组随机效果：无越界、结果确定（最大 ${maxSeen}）`);
  ok(kindsSeen.size === 4, `四种图层都被覆盖到 (${[...kindsSeen].sort().join(',')})`);
}
{
  const len = 24, m = mk(len), h = hz(len);
  genRender(m, h, len, 0, [], 0, 0);
  ok(m.every(v => v === 0) && h.every(v => v === 0xFF), '空图层表 → 全黑 + 全用全局配色');
  genRender(m, h, len, 0, null, 0, 0);
  ok(m.every(v => v === 0), '图层为 null 不崩');
}

/* ---- 8b) F5) 旁路的层（en=0）不参与合成：效果与「压根没这层」逐字节相同 ---- */
console.log('--- 图层旁路（en=0）---');
{
  const { layerNums } = CORE;
  const base = { count:1, width:2, phase:0, falloff:FALL.COS, pulse_period:0, pulse_amp:0,
                 wave:0, direction:1, bounce:0, cmode:0, hue_base:0, hue_spread:0,
                 hue_speed:0, spans:0, rotate:0, flags:1 };
  const fill = layerNums(Object.assign({ kind:'fill', level:100 }, base));
  const spotOff = layerNums(Object.assign({ kind:'spot' }, base, { en:0 }));
  const spotOn  = layerNums(Object.assign({ kind:'spot' }, base));
  const len = 24;
  const run = lss => { const m = mk(len), h = hz(len); genRender(m, h, len, 0, lss, 0, 0); return [m, h]; };

  const [mA, hA] = run([fill, spotOff]);      /* 旁路的层：应等同于没有它 */
  const [mB, hB] = run([fill]);
  ok(JSON.stringify([...mA]) === JSON.stringify([...mB]) &&
     JSON.stringify([...hA]) === JSON.stringify([...hB]),
     'en=0 的层与「删掉这一层」的 mask/hue 逐字节相同');
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
  const nc2 = Object.assign({}, nc, { tpl: '呼吸' });
  ok(fxEffectName(nc2) === '呼吸/' + FW.COLOR_NAME[nc.color] && nc2.layers === nc.layers,
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
          breathGain, colorUpdate, effPalette, effLevels, effPeriod } = CORE;
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

  /* 呼吸：灭→亮→灭；一个周期一种颜色 */
  ok(breathGain(0, 12) === 0 && breathGain(6, 12) === 254 && breathGain(11, 12) === 42,
     `呼吸包络 0/6/11 拍 = ${breathGain(0,12)}/${breathGain(6,12)}/${breathGain(11,12)}`);
  const B = mkInst({ color: FW.COLOR.BREATH, period: 12,
                     palette: [[255,0,0],[0,255,0],[0,0,255]] });
  colorUpdate(B.color, 0);
  ok(B.color.current.r === 255, '呼吸：第 1 个周期用第 1 色');
  colorUpdate(B.color, 12);
  ok(B.color.current.g === 255, '呼吸：第 2 个周期换第 2 色');
  colorUpdate(B.color, 24);
  ok(B.color.current.b === 255, '呼吸：第 3 个周期换第 3 色');
  const breathShot = render(B, 10, 6);
  ok(breathShot.m.every(v => v === 254), '呼吸：半周期时整条最亮（254）');

  /* 覆盖：第二种颜色从 0 号灯开始逐级盖过去（0xFE = 用副色） */
  const W = mkInst({ color: FW.COLOR.WIPE, period: 10,
                     palette: [[0,0,255],[255,120,0]] });
  const w0 = render(W, 10, 0);
  ok(w0.m.every(v => v === 255) && w0.h.every(v => v === 0xFF), '覆盖：0 拍时还是底色');
  const w5 = render(W, 10, 5);
  ok(w5.h.slice(0, 5).every(v => v === 0xFE) && w5.h.slice(5).every(v => v === 0xFF),
     '覆盖：半程时前 5 颗换成第二种颜色');
  const wc = effectColorAt(W, 0, 10, w5.h);
  ok(wc.r === 255 && wc.g === 120 && wc.b === 0, `覆盖：被盖住那段用副色（${wc.r},${wc.g},${wc.b}）`);

  /* 字段兜底 */
  ok(effPalette({ c1: [1,2,3] }).length === 2, '老效果没有 palette → 用 c1/c2 兜底');
  ok(effLevels({ levels: 0 }) === 30 && effLevels({ levels: 2 }) === 6 && effLevels({ levels: 999 }) === 255,
     '彩虹级数夹在 6..255，缺省 30');
  ok(effPeriod({}) === 60 && effPeriod({ period: 1 }) === 2, '周期夹在 2..600，缺省 60');
  const pR = CORE.effectPreset({ kind:'custom', color: FW.COLOR.RAINBOW, levels: 24,
                                 hue_base: 1, hue_speed: 2, palette: [[1,2,3]] }, 0);
  ok(pR.palette.length === 1 && pR.levels === 24 && pR.hue_base === 1 && pR.hue_speed === 2,
     'effectPreset 把色板 / 级数 / 起点 / 旋转带给实例');
}

console.log(fails ? `\n=== ${fails} 项未通过 ===` : '\n=== 全部通过 ===');
process.exit(fails ? 1 : 0);
