import fs from 'node:fs';
const html = fs.readFileSync('led_layout_editor.html','utf8');
const m = html.match(/<script id="core">([\s\S]*?)<\/script>/);
if(!m) throw new Error('core script not found');
const CORE = new Function(m[1] + '\n; return CORE;')();
const {FW, GEN, projectFromPreset, PRESET_SP3122D, deriveZoneDir, validate, exportC, simInit, simApplyPreset, simTick, zoneReverse} = CORE;

let fails = 0;
const ok = (c,msg)=>{ console.log((c?'  PASS  ':'  FAIL  ')+msg); if(!c) fails++; };

const st = projectFromPreset(PRESET_SP3122D);
ok(st.leds.length===104, `灯数 = ${st.leds.length} (期望 104)`);
ok(new Set(st.leds.map(l=>l.n)).size===104, '编号 0..103 无重复无缺失');

// 渲染成网格，便于与 彩灯排布.png 逐格比对
const cell = GEN.CELL;
const grid = new Map();
for(const L of st.leds){
  const c = Math.round((L.x - cell/2)/cell), r = Math.round((L.y - cell/2)/cell);
  grid.set(r+','+c, L.n);
}
const rows=[...new Set([...grid.keys()].map(k=>+k.split(',')[0]))].sort((a,b)=>a-b);
const cols=[...new Set([...grid.keys()].map(k=>+k.split(',')[1]))].sort((a,b)=>a-b);
console.log('\n--- 生成出的排布网格 ---');
for(const r of rows){
  let line='';
  for(const c of cols){ const v=grid.get(r+','+c); line += (v===undefined?'   .':String(v).padStart(4)); }
  console.log(line);
}
const rowOf = r => cols.map(c=>grid.get(r+','+c)).filter(v=>v!==undefined).join(' ');

console.log('\n--- 与参考图逐格比对 ---');
ok(rowOf(0)==='0 1 8 9', `第0行 "0 1 8 9" -> "${rowOf(0)}"`);
ok(rowOf(1)==='7 2 15 10', `第1行 "7 2 15 10" -> "${rowOf(1)}"`);
ok(rowOf(3)==='5 4 13 12', `第3行 "5 4 13 12" -> "${rowOf(3)}"`);
ok(rowOf(6)==='31 32 33 34 35 36 37 38 39 40', `顶环上边 31..40 -> "${rowOf(6)}"`);
ok(rowOf(7)==='30 41', `顶环第2行 "30 41" -> "${rowOf(7)}"`);
ok(rowOf(17)==='20 19 18 17 16 55 54 53 52 51', `顶环下边 -> "${rowOf(17)}"`);
ok(rowOf(20)==='58 57 56 79 78 77', `环A上边 -> "${rowOf(20)}"`);
ok(rowOf(27)==='65 66 67 68 69 70', `环A下边 -> "${rowOf(27)}"`);
ok(rowOf(30)==='82 81 80 103 102 101', `环B上边 -> "${rowOf(30)}"`);

console.log('\n--- 方向推导 ---');
const dirs = st.zones.map(z=>({n:z.name,d:deriveZoneDir(st,z)}));
for(const d of dirs) console.log(`  ${d.n}: ${d.d}`);
ok(dirs[0].d==='cw'&&dirs[2].d==='cw', '旋钮与顶环 = cw');
ok(dirs[3].d==='ccw'&&dirs[4].d==='ccw', '环A/环B = ccw');

console.log('\n--- 校验 ---');
const iss = validate(st);
for(const i of iss) console.log(`  [${i.level}] ${i.code} ${i.msg}`);
ok(!iss.some(i=>i.level==='err'), '无错误');
ok(iss.filter(i=>i.code==='V11').length===0, 'V11 相邻性干净');
ok(iss.filter(i=>i.code==='V13').length===1, '恰好 1 条 V13 方向告警');

/* ---- H5) 最近邻距离用空间哈希算：结果必须与「两两比较」逐项一致 ---- */
{
  const { nearestDists } = CORE;
  const brute = leds => leds.map((L, i) => {
    let best = Infinity;
    leds.forEach((O, j) => { if (j !== i) best = Math.min(best, Math.hypot(O.x - L.x, O.y - L.y)); });
    return best;
  }).filter(d => isFinite(d)).sort((a, b) => a - b);
  const mine = nearestDists(st.leds, GEN.CELL).sort((a, b) => a - b);
  const ref = brute(st.leds);
  ok(mine.length === ref.length && mine.every((v, i) => Math.abs(v - ref[i]) < 1e-9),
     `104 颗灯逐项一致（最近邻中位数 ${mine[Math.floor(mine.length / 2)].toFixed(1)}px）`);

  /* 边界：单颗 / 完全重合 / 相距很远 / 稀疏大网格 */
  const cases = [
    [{ x: 0, y: 0, n: 0 }],
    [{ x: 0, y: 0, n: 0 }, { x: 0, y: 0, n: 1 }],
    [{ x: 0, y: 0, n: 0 }, { x: 9000, y: 9000, n: 1 }],
    Array.from({ length: 40 }, (_, i) => ({ x: (i % 8) * 300, y: Math.floor(i / 8) * 300, n: i })),
  ];
  let edgeOk = true;
  for (const cs of cases) {
    const a = nearestDists(cs, 40).sort((p, q) => p - q), b = brute(cs);
    if (a.length !== b.length || a.some((v, i) => Math.abs(v - b[i]) > 1e-9)) edgeOk = false;
  }
  ok(edgeOk, '单颗 / 完全重合 / 相距很远 / 300px 稀疏网格：新旧算法结果都一致');
}

/* 重名效果/模式：提示级点出（导出注释 / 模式摘要靠名字认人） */
const v35 = iss.filter(i=>i.code==='V35');
ok(v35.length>=1, `重名效果被点出（${v35.length} 组）`);
ok(v35.every(i=>i.level==='info'), '重名只算提示级，不挡导出');
v35.forEach(i=>console.log('  ' + i.msg));
{
  const st2 = JSON.parse(JSON.stringify(st));
  st2.modes = { list: [{ id:'m1', name:'夜间调试', binds:[] }, { id:'m2', name:'夜间调试', binds:[] }], current: 0 };
  const iss2 = validate(st2);
  ok(iss2.filter(i=>i.code==='V36').length===1, '模式重名被点出 1 组');
}

console.log('\n--- C 导出 ---');
const code = exportC(st,{variant:'table',comment:'ascii',nominal:'cw'});
console.log(code.split('\n').map(l=>'  '+l).join('\n'));
const flags = [...code.matchAll(/\{\s*\d+,\s*\d+,\s*(\d)\s*\}/g)].map(m=>m[1]).join(',');
ok(flags==='0,0,0,1,1', `reverse 标记 = ${flags} (期望 0,0,0,1,1)`);

/* 动效方向断言已由 test_anim.mjs 取代（旧版符号逻辑有误） */
console.log(fails? `\n=== ${fails} 项未通过 ===` : '\n=== 全部通过 ===');
process.exit(fails?1:0);
