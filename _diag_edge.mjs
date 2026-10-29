import fs from 'node:fs';
const h = fs.readFileSync('led_layout_editor.html', 'utf8');
const CORE = new Function(h.match(/<script id="core">([\s\S]*?)<\/script>/)[1] + '\n; return CORE;')();
const { instNew, instApplyPreset, instTick, renderZoneMaskTo, LAYER, FW } = CORE;
function mk(wave, rotate, len) {
  const I = instNew();
  instApplyPreset(I, { anim: FW.ANIM_COUNT, width: 10, gap: 0, slow: 8, fast: 1,
                       speed: 0, c1: [255,255,255], c2: [0,0,0] });
  I.anim.layers = [{ kind: LAYER.SWEEP, en: 1, wave, rotate, lo: 120, hi: 255 }];
  return I;
}
const runs = (m, len) => {
  const on = []; for (let i = 0; i < len; i++) if (m[i] > 0) on.push(i);
  const out = []; let s = -1, p = -2;
  for (const i of on) { if (i !== p + 1) { if (s >= 0) out.push([s, p]); s = i; } p = i; }
  if (s >= 0) out.push([s, p]);
  return out;
};
for (const len of [24, 48, 104]) {
  for (const wave of [0, 1]) {
    const I = mk(wave, 5, len);
    let prev = new Uint8Array(len);
    const odd = [];
    for (let t = 0; t < 420; t++) {
      instTick(I, false);
      const m = new Uint8Array(len), hu = new Uint8Array(len);
      renderZoneMaskTo(I, m, hu, len, 0);
      const r = runs(m, len);
      const nBright = Array.from(m).filter(v => v >= 200).length;
      const nDim = Array.from(m).filter(v => v > 0 && v < 200).length;
      /* 异常：亮块段数 > 3（低端段 / 高端段 / 头）或 头部不在任何段里单点 */
      if (r.length > 3 || nBright > 1) odd.push({ t, phase: I.swPhase, low: I.swLow, high: I.swHigh, num: I.swNum,
                                                  runs: r, nBright, nDim, mask: Array.from(m).join(',') });
      prev = m;
    }
    console.log(`len=${len} wave=${wave}: anomalies=${odd.length}`);
    if (odd.length) console.log(odd.slice(0, 2));
  }
}
