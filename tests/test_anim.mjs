import fs from 'node:fs';
const html = fs.readFileSync('led_layout_editor.html','utf8');
const CORE = new Function(html.match(/<script id="core">([\s\S]*?)<\/script>/)[1] + '\n; return CORE;')();
const {FW, GEN, projectFromPreset, PRESET_SP3122D, deriveZoneDir, validate, exportC,
       simInit, simSetupPreset, simTick} = CORE;
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};
const st = projectFromPreset(PRESET_SP3122D);

/* 亮灯追踪：返回每秒各分区最亮灯的物理编号序列 */
function trace(applyReverse){
  const sim = simInit();
  simSetupPreset(sim, st, FW.presets[0]);            // 0: CHASE_SINGLE + SPECTRUM
  simSetSpeedSafe();
  const series = [];
  for(let t=0;t<400;t++){
    simTick(sim, st, applyReverse);
    if(t%20===0){
      const rec={};
      for(const z of st.zones){
        let bn=z.start, bb=-1;
        for(let i=0;i<z.count;i++){ const v=sim.fb[(z.start+i)*3]; if(v>bb){bb=v;bn=z.start+i;} }
        rec[z.name]={n:bn, lit:bb};
      }
      series.push(rec);
    }
  }
  return series;
}
function simSetSpeedSafe(){}
const track = (series,name)=>{ /* 取第一次出现的、稳定的位移方向 */
  const z = st.zones.find(z=>z.name===name);
  for(let i=1;i<series.length;i++){
    const a=series[i-1][name].n, b=series[i][name].n;
    if(a!==b){ let d=((b-a+z.count)%z.count); if(d>z.count/2) d-=z.count; return {d, sign:Math.sign(d)}; }
  }
  return {d:0, sign:0};
};
const litAny = s => st.zones.some(z=>s[0][z.name].lit>0);

const off = trace(false), on_ = trace(true);
console.log('修正关闭 首帧各分区最亮灯:', JSON.stringify(Object.fromEntries(Object.entries(off[0]).map(([k,v])=>[k,v.n]))));
console.log('修正关闭 末帧各分区最亮灯:', JSON.stringify(Object.fromEntries(Object.entries(off.at(-1)).map(([k,v])=>[k,v.n]))));
ok(litAny(off), `有灯被点亮（亮度初值 = ${litAny(off)?'256':'0，全黑'}）`);

/* 旋转方向 = 物理编号位移符号 × 该分区绕行方向符号 */
const rotSign = (series,name)=>{
  const z = st.zones.find(z=>z.name===name);
  const dirSign = deriveZoneDir(st,z)==='cw' ? 1 : -1;   // cw 分区: 编号递增=顺时针
  const t = track(series,name);
  return t.sign * dirSign;
};
for(const name of ['顶环','环 A','环 B']){
  const t = track(off,name);
  ok(t.sign!==0, `${name} 的光点在移动（Δ编号 = ${t.d}）`);
}
console.log('\n--- 旋转方向（+1=顺时针, -1=逆时针）---');
const rOff = {}, rOn = {};
for(const name of st.zones.map(z=>z.name)){ rOff[name]=rotSign(off,name); rOn[name]=rotSign(on_,name); }
console.log('  修正关闭:', JSON.stringify(rOff));
console.log('  修正打开:', JSON.stringify(rOn));
ok(rOff['顶环']!==rOff['环 A'], '关闭修正：顶环与环A 旋转方向相反 ← 当前固件的实际表现');
ok(rOn['顶环']===rOn['环 A'] && rOn['环 A']===rOn['环 B'], '打开修正：顶环/环A/环B 同向旋转');
const allSame = a => new Set(Object.values(a)).size===1;
ok(!allSame(rOff), '关闭修正：并非所有分区同向（证实方向不一致真实存在）');
ok(allSame(rOn),  '打开修正：所有分区同向（reverse 补丁有效）');

console.log('\n--- C 导出 (ASCII) ---');
const code = exportC(st,{variant:'table',comment:'ascii',nominal:'cw'});
console.log(code.split('\n').map(l=>'  '+l).join('\n'));
const flags = [...code.matchAll(/\{\s*\d+,\s*\d+,\s*(\d)\s*\}/g)].map(m=>m[1]).join(',');
ok(flags==='0,0,0,1,1', `reverse 标记 = ${flags}`);
ok(!/\?/.test(code.split('/*').slice(1).join('')), 'ASCII 注释无问号占位');

console.log(fails?`\n=== ${fails} 项未通过 ===`:'\n=== 全部通过 ===');
process.exit(fails?1:0);
