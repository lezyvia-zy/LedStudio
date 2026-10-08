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

/* ---- 1) SPOT(count=1, COS, 无脉动) 仍必须逐字节等于 chaseSingle ---- */
console.log('--- SPOT 是 chaseSingle 的超集 ---');
let allEq = true, cases = 0;
for (const len of [8, 24, 40]) for (const w of [1, 3, 10, 16, 40]) {
  const sw = zoneScaled(w, len, 1);
  for (let pos = 0; pos < len * 256; pos += 37) {
    const a = mk(len), b = mk(len);
    chaseSingle(a, len, pos, sw);
    SP(b, hz(len), len, pos, { width: w });
    cases++;
    for (let i = 0; i < len; i++) if (a[i] !== b[i]) allEq = false;
  }
}
ok(allEq, `全部 ${cases} 组 (len x width x pos) 与 chaseSingle 完全一致`);

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

console.log(fails ? `\n=== ${fails} 项未通过 ===` : '\n=== 全部通过 ===');
process.exit(fails ? 1 : 0);
