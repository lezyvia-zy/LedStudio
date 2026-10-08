/* 追逐动画跨过位置回绕时不能倒退扫环（「每转一圈闪一下」的根因） */
import fs from 'node:fs';
const CORE = new Function(fs.readFileSync('led_layout_editor.html','utf8')
  .match(/<script id="core">([\s\S]*?)<\/script>/)[1] + '\n; return CORE;')();
const {FW, projectFromPreset, PRESET_SP3122D, simInit, simSetupPreset, simSetSpeed, simTick} = CORE;
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};
const st = projectFromPreset(PRESET_SP3122D);

/* 对每个分区、每个预设、两档速度都跑几圈，记录最亮灯号的变化 */
let worstBack = 0, worstWhere = '', steps = 0, wraps = 0;
for (let pi = 0; pi < FW.presets.length; pi++) {
  for (const spd of ['slow', 'fast']) {
    const sim = simInit();
    simSetupPreset(sim, st, FW.presets[pi]);
    simSetSpeed(sim, spd);
    sim.power_on = true;
    const prev = {};
    const prevTarget = {};
    for (let t = 0; t < 3000; t++) {
      simTick(sim, st, false);
      const posT = sim.insts[0].anim.position.target;
      if (prevTarget[0] !== undefined && posT < prevTarget[0]) wraps++;   /* 发生了回绕 */
      prevTarget[0] = posT;
      for (const z of st.zones) {
        let bn = -1, bb = -1;
        for (let i = 0; i < z.count; i++) {
          const n = z.start + i, v = sim.fb[n*3] + sim.fb[n*3+1] + sim.fb[n*3+2];
          if (v > bb) { bb = v; bn = i; }
        }
        if (bb <= 0) { delete prev[z.name]; continue; }
        if (prev[z.name] !== undefined) {
          let d = bn - prev[z.name];
          if (d >  z.count/2) d -= z.count;
          if (d < -z.count/2) d += z.count;
          steps++;
          if (d < worstBack) { worstBack = d; worstWhere = `预设${pi}/${spd}/${z.name} tick${t}`; }
        }
        prev[z.name] = bn;
      }
    }
  }
}
console.log(`  采样 ${steps} 次、经历 ${wraps} 次位置回绕；最差的一次变化 = ${worstBack} 步 (${worstWhere})`);
ok(wraps > 20, `确实经历了 ${wraps} 次回绕（测试有效）`);
ok(worstBack >= -2, `跨回绕时没有倒退扫环（允许 -2 步的量化抖动，实测下限 ${worstBack}）`);

/* 直接对比：修复前后的判据 —— 回绕那一刻的插值方向 */
{
  const sim = simInit(); simSetupPreset(sim, st, FW.presets[0]); simSetSpeed(sim, 'slow'); sim.power_on = true;
  let before = null, found = null;
  for (let t = 0; t < 400; t++) {
    const pt = sim.insts[0].anim.position.target;
    simTick(sim, st, false);
    if (before !== null && sim.insts[0].anim.position.target < before) { found = { t, from: sim.insts[0].anim.position.current, target: sim.insts[0].anim.position.target }; break; }
    before = pt;
  }
  const fromBefore = sim.insts[0].anim.position.elapsed === 1 ? sim.insts[0].anim.position.from : null;
  ok(!!found, `捕捉到回绕那一帧: ${JSON.stringify(found)}`);
  if (found) ok(Math.abs(found.from) <= FW.RING_SIZE * 256, `回绕后位置仍落在 ±一个环周期内 (${found.from})`);
}
console.log(fails?`\n=== ${fails} 项未通过 ===`:'\n=== 全部通过 ===');
process.exit(fails?1:0);
