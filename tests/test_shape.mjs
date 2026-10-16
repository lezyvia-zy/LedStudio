/* ============================================================================
 * 铺灯「形状」引擎（批 7-A / 7-B）
 *
 *   node tests/test_shape.mjs
 *
 * 验三件事：
 *   ① 新旧兼容：dist='cells' 档必须与旧的 GEN.rectLeds 逐字节相同（老工程打开不变形）
 *   ② 新能力：21 颗 × 灯距 40px 的闭环矩形、每边 6/5/6/4、反向编号、等分弧长、圆/圆弧
 *   ③ 不进固件：形状是编辑期概念 —— 导出的 g_default_zones[] / led_map[] 一个字节都不变
 * ==========================================================================*/
import fs from 'node:fs';
const html = fs.readFileSync('led_layout_editor.html', 'utf8');
const CORE = new Function(html.match(/<script id="core">([\s\S]*?)<\/script>/)[1] + '\n; return CORE;')();
const { FW, GEN, SHAPE, PRESET_SP3122D, projectFromPreset, exportC, deriveZoneDir, validate } = CORE;

let fails = 0;
const ok = (c, msg) => { console.log((c ? '  PASS  ' : '  FAIL  ') + msg); if (!c) fails++; };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const key = p => p.x.toFixed(6) + ',' + p.y.toFixed(6);

console.log('--- A) cells 档 = 旧「矩形环绕圈」逐字节（老工程不许变形）---');
{
  const st = projectFromPreset(PRESET_SP3122D);
  let same = 0, total = 0;
  for (const z of PRESET_SP3122D.zones) {
    const sh = SHAPE.fromRect(z.rect, GEN.CELL, null, z.start, z.count);
    const mine = SHAPE.plan(sh, GEN.CELL).pts;
    const old = GEN.rectLeds(Object.assign({}, z.rect, { first: z.start, count: z.count }), GEN.CELL);
    total += old.length;
    if (mine.length === old.length && mine.every((p, i) => p.n === old[i].n && p.x === old[i].x && p.y === old[i].y)) same += old.length;
  }
  ok(same === total && total === 104, `5 个分区 ${same}/${total} 颗与 GEN.rectLeds 完全一致`);
  ok(st.shapes.length === PRESET_SP3122D.zones.length,
     `预设同时带出 ${st.shapes.length} 个可编辑形状（zone id 对齐: ${st.shapes.every((s, i) => s.zone === 'z' + i)}）`);
  ok(st.shapes.every(s => s.dist === 'cells'), '预设形状用「格点」档 —— 不点「铺到灯位」时对灯位零影响');
  /* 灯位仍由旧生成器产出：形状只是随行的可编辑副本 */
  const a = exportC(st, { variant: 'table' });
  const b = exportC(Object.assign({}, st, { shapes: [] }), { variant: 'table' });
  ok(a === b, '多出 shapes 字段后导出的排布表一字不差（形状不进固件）');
}

console.log('\n--- B) 21 颗 × 灯距 40px 的闭环矩形（旧路做不到：整数格周长恒为偶数）---');
{
  /* 整数格矩形周长 P = 2W+2H-4 恒为偶数 → 21 颗必留豁口；把顶点放到半格上（H=6.5），
     周长 840px = 21 × 40px，正好闭环。 */
  const odd = [];
  for (let W = 2; W <= 14; W++) for (let H = 2; H <= 14; H++) odd.push(GEN.rectPath(W, H, 'cw').length);
  ok(!odd.includes(21), `整数格矩形周长没有 21（可达值里最小偶数 ${Math.min(...odd.filter(v => v % 2 === 0))}）`);
  const old = GEN.rectLeds({ x0: 0, y0: 0, W: 6, H: 7, dir: 'cw', k: 0, first: 0, count: 21 }, 40);
  const seam = Math.hypot(old[0].x - old[20].x, old[0].y - old[20].y);
  ok(seam > 40, `旧路硬铺 21 颗：闭合处豁口 ${seam.toFixed(0)}px（其余 ${40}px）`);

  const sh = SHAPE.blank(Object.assign(SHAPE.newRect({ x0: 0, y0: 0, W: 6, H: 6.5 }, 40),
                                       { dist: 'pitch', pitch: 40, closed: true, first: 0 }));
  const pl = SHAPE.plan(sh, 40), info = SHAPE.info(sh, 40, pl);
  ok(near(info.total, 840), `矩形周长 = ${info.total}px`);
  ok(pl.count === 21, `按灯距 40px 铺出 ${pl.count} 颗`);
  ok(near(info.spacing.min, 40) && near(info.spacing.max, 40),
     `沿路径灯距恒 ${info.spacing.min.toFixed(3)}px（含闭环缝）`);
  ok(info.notes.some(n => /正好闭环/.test(n)), `诊断: ${info.notes.find(n => /正好闭环/.test(n))}`);
  ok(info.notes.some(n => /差 .*px 才回得到起点/.test(n)) === false, '不需要再报「差多少回起点」');
}

console.log('\n--- C) 每边颗数 6/5/6/4 = 21 颗闭环（最贴真实灯带）---');
{
  const sh = SHAPE.blank(Object.assign(SHAPE.newRect({ x0: 0, y0: 0, W: 6, H: 6.5 }, 40),
                                       { dist: 'sides', sides: '6,5,6,4', first: 16, closed: true }));
  const pl = SHAPE.plan(sh, 40), info = SHAPE.info(sh, 40, pl);
  ok(SHAPE.sidesOf(sh, 4).join(',') === '6,5,6,4', '每边颗数解析（字符串 "6,5,6,4" → 数组）');
  ok(pl.count === 21, `四边合计 ${pl.count} 颗`);
  ok(info.perSide.join(',') === '6,5,6,4', `每边落点 ${info.perSide.join('/')}`);
  ok(pl.pts[0].n === 16 && pl.pts[20].n === 36, `编号 16..36 连续（头 ${pl.pts[0].n} / 尾 ${pl.pts[20].n}）`);
  ok(near(pl.pts[0].x, 20) && near(pl.pts[0].y, 20), '角上落灯（corner=in）：第 1 颗正好在左上角');
  ok(near(pl.pts[6].x, 220) && near(pl.pts[6].y, 20), '第 7 颗在右上角（上边 6 颗含这一角）');
  const p2 = SHAPE.plan(Object.assign({}, sh, { corner: 'out' }), 40).pts;
  const atCorner = p2.filter(p => (near(p.x, 20) && near(p.y, 20)) || (near(p.x, 220) && near(p.y, 240)));
  ok(p2.length === 21 && atCorner.length === 0, `corner=out：${p2.length} 颗，四角无一落点`);
  ok(info.notes.some(n => /每边落点 6 \/ 5 \/ 6 \/ 4/.test(n)), '诊断行列出每边落点');
  ok(info.notes.some(n => /灯距 沿路径/.test(n)), '诊断行给出沿路径灯距（各边不等长时长短不一属正常）');
}

console.log('\n--- D) 反向编号：几何不动，只把这一段编号倒过来 ---');
{
  const base = Object.assign(SHAPE.newRect({ x0: 0, y0: 0, W: 6, H: 6.5 }, 40),
                             { dist: 'sides', sides: '6,5,6,4', first: 0, closed: true, dir: 'cw' });
  const cw = SHAPE.plan(base, 40).pts, ccw = SHAPE.plan(Object.assign({}, base, { dir: 'ccw' }), 40).pts;
  ok(cw.map(key).sort().join('|') === ccw.map(key).sort().join('|'), '位置集合完全不变（几何没动）');
  ok(ccw[0].n === 0 && cw[0].n === 0, '两边头都是 0 号');
  ok(ccw[0].x !== cw[0].x || ccw[0].y !== cw[0].y,
     `0 号落到另一头（${cw[0].x.toFixed(0)},${cw[0].y.toFixed(0)} → ${ccw[0].x.toFixed(0)},${ccw[0].y.toFixed(0)}）`);
  ok(ccw[20].x === cw[0].x && ccw[20].y === cw[0].y, '20 号回到原来 0 号的位置（编号整体倒序）');
  const cell = SHAPE.blank(Object.assign(SHAPE.newRect({ x0: 0, y0: 0, W: 3, H: 4 }, 40),
                                         { dist: 'cells', count: 8 }));
  const c1 = SHAPE.plan(cell, 40).pts, c2 = SHAPE.plan(Object.assign({}, cell, { dir: 'ccw' }), 40).pts;
  ok(c1[0].n === 0 && c2[0].n === 0 && c1[1].x !== c2[1].x,
     `cells 档反向 = 换一条 rectPath 绕行（旧行为，不额外倒编号）：第 2 颗 ${c1[1].x.toFixed(0)},${c1[1].y.toFixed(0)} → ${c2[1].x.toFixed(0)},${c2[1].y.toFixed(0)}`);
}

console.log('\n--- E) 等分弧长：任意颗数均匀铺满（任意形状）---');
{
  const sh = Object.assign(SHAPE.newRect({ x0: 0, y0: 0, W: 6, H: 7 }, 40),
                           { dist: 'even', count: 21, closed: true, first: 0 });
  const info = SHAPE.info(sh, 40);
  ok(info.count === 21, '21 颗在偶数格矩形上也放得下（等分不占格点）');
  ok(near(info.spacing.min, info.spacing.max, 1e-9),
     `沿路径灯距恒 ${info.spacing.min.toFixed(2)}px（诊断按弧长算，拐角弦长更短属正常）`);
  const o = SHAPE.plan(Object.assign({}, sh, { count: 1 }), 40).pts;
  ok(o.length === 1, 'count=1 只有一颗，不炸');
  const poly = SHAPE.blank({ kind: 'poly', pts: [[20, 20], [220, 20], [220, 200], [120, 280], [20, 200]],
                             closed: true, dist: 'even', count: 17, first: 0 });
  ok(SHAPE.plan(poly, 40).count === 17 && SHAPE.segs(poly).length === 5, '五边形 5 条边也照铺（17 颗闭合）');
}

console.log('\n--- F) 圆环 / 圆弧（原来那套「圆芯+半径+张角」没丢）---');
{
  const sh = SHAPE.blank({ kind: 'circle', cx: 200, cy: 200, r: 160, a0: 90, sweep: 360, closed: true,
                           dist: 'even', count: 21, first: 0 });
  const info = SHAPE.info(sh, 40);
  ok(info.count === 21 && near(info.spacing.min, info.spacing.max, 1e-6),
     `闭环圆环 21 颗：灯距恒 ${info.spacing.min.toFixed(2)}px`);
  ok(near(info.total, 2 * Math.PI * 160, 0.5), `周长 ≈ 2πr = ${info.total.toFixed(1)}px（按时序多边形化）`);
  const ap = SHAPE.plan(Object.assign({}, sh, { closed: false, sweep: 180, count: 5 }), 40).pts;
  ok(ap.length === 5, `开口圆弧 180° 铺 5 颗：${ap.length} 颗`);
  ok(near(ap[0].x, 200, 0.5) && near(ap[0].y, 360, 0.5), '起点落在 a0=90°（画布 y 向下 → 圆底）');
  ok(near(ap[4].x, 200, 0.5) && near(ap[4].y, 40, 0.5), '终点落在 a0+sweep=270°（圆顶）');
  const ik = SHAPE.info(Object.assign({}, sh, { dist: 'pitch', pitch: 40 }), 40);
  ok(ik.count === 25 && ik.notes.some(n => /差 \d+px 才回得到起点/.test(n)),
     `圆环按灯距 40px = ${ik.count} 颗，并报出回不到起点的差额`);
}

console.log('\n--- G) 起点偏移 / 退化形状 ---');
{
  const sh = Object.assign(SHAPE.newRect({ x0: 0, y0: 0, W: 6, H: 6.5 }, 40),
                           { dist: 'sides', sides: '6,5,6,4', first: 0, closed: true });
  const a = SHAPE.plan(sh, 40).pts, b = SHAPE.plan(Object.assign({}, sh, { entry: 40 }), 40).pts;
  const at40 = SHAPE.at(sh, 40);
  ok(near(b[0].x, at40[0], 1e-9) && near(b[0].y, at40[1], 1e-9),
     `起点偏移 40px = 0 号挪到「沿路径 40px」处（${at40[0].toFixed(1)},${at40[1].toFixed(1)}）`);
  ok(b.length === a.length, `颗数不变（偏移不动点数：${b.length} 颗）`);
  ok(near(a[0].x, 20) && near(a[0].y, 20), '不偏移时头正好在左上角');
  const rev = SHAPE.plan(Object.assign({}, sh, { dir: 'ccw', entry: 40 }), 40).pts;
  ok(rev[0].x === b[b.length - 1].x && rev[0].y === b[b.length - 1].y,
     'ccw + 偏移：落点位置照旧（顶点顺序说了算），只是 0 号从另一头开始倒着数');
  const degen = SHAPE.blank({ kind: 'rect', pts: [[20, 20], [20, 20]], dist: 'even', count: 4 });
  let threw = false;
  try { SHAPE.plan(degen, 40); SHAPE.info(degen, 40); } catch (e) { threw = true; }
  ok(!threw, '退化形状（两个重合顶点）不抛异常');
  ok(SHAPE.plan(SHAPE.blank({ dist: 'cells', pts: [[20, 20]], count: 3 }), 40).pts.length === 0,
     '顶点不足 2 个：返回空计划，不炸');
}

console.log('\n--- H) 画形状拖出来的三种：圆角矩形 / 直线 / 椭圆 / 换类型（外框不动）---');
{
  /* 圆角矩形：周长应小于同框直角矩形，圆角把四个角「吃掉」一块 */
  const rrect = SHAPE.blank({ kind: 'rrect', rc: 40, dist: 'even', count: 21, first: 0 });
  SHAPE.fromBox(rrect, 'rrect', { x0: 0, y0: 0, x1: 400, y1: 200 });
  const sharp = SHAPE.blank({ kind: 'rect', dist: 'even', count: 21, first: 0 });
  SHAPE.fromBox(sharp, 'rect', { x0: 0, y0: 0, x1: 400, y1: 200 });
  ok(SHAPE.pathLen(rrect) < SHAPE.pathLen(sharp),
     `圆角矩形周长 ${SHAPE.pathLen(rrect).toFixed(0)} < 直角矩形 ${SHAPE.pathLen(sharp).toFixed(0)}px`);
  const rb = SHAPE.boxOf(rrect);
  ok(near(rb.x0, 0) && near(rb.x1, 400) && near(rb.y0, 0) && near(rb.y1, 200),
     '圆角矩形包围盒就是拖出来的那个框');
  ok(SHAPE.segs(rrect).length > 4, `圆角切成 ${SHAPE.segs(rrect).length} 段（四个角各一段弧）`);
  ok(SHAPE.asCells(rrect, 40) === null, '圆角矩形不参与「格点」档（只认直角矩形，保证老工程不走样）');

  /* 直线：开环 2 点，等分弧长把 n 颗均匀撒在这条线段上 */
  const line = SHAPE.blank({ kind: 'line', dist: 'even', count: 8, first: 0 });
  SHAPE.fromBox(line, 'line', { x0: 100, y0: 0, x1: 500, y1: 300 });
  ok(line.closed === false && SHAPE.segs(line).length === 1, '直线 = 1 段开环');
  ok(near(SHAPE.pathLen(line), 500, 1e-6), `直线长度 ${SHAPE.pathLen(line).toFixed(2)}px`);
  const lp = SHAPE.plan(line, 40).pts;
  ok(lp.length === 8 && near(lp[0].x, 100) && near(lp[0].y, 0) && near(lp[7].x, 500) && near(lp[7].y, 300),
     '8 颗沿直线从起点铺到终点');

  /* 椭圆：r 是横半轴，ry 是纵半轴；拖出来 400×200 的框就是椭圆 */
  const ell = SHAPE.blank({ kind: 'circle', dist: 'even', count: 21, first: 0 });
  SHAPE.fromBox(ell, 'circle', { x0: 0, y0: 0, x1: 400, y1: 200 });
  ok(near(ell.cx, 200) && near(ell.cy, 100) && near(ell.r, 200) && near(ell.ry, 100),
     `椭圆 rx=${ell.r} ry=${ell.ry}（框 400×200）`);
  const esp = SHAPE.ptsOf(ell);
  ok(near(Math.max(...esp.map(p => p[0])), 400, 0.5) && near(Math.max(...esp.map(p => p[1])), 200, 0.5),
     '椭圆顶点贴住框边');
  const circ = SHAPE.blank({ kind: 'circle', cx: 0, cy: 0, r: 100, a0: 0, sweep: 360, dist: 'even', count: 4, first: 0 });
  ok(SHAPE.ptsOf(circ).every(p => near(Math.hypot(p[0], p[1]), 100, 0.01)), '没有 ry 时是正圆（半径 100）');

  /* 换类型：只换「皮」，外框不动 —— rect ↔ circle 来回外框一致 */
  const conv = SHAPE.blank({ kind: 'rect', dist: 'even', count: 21, first: 0 });
  SHAPE.fromBox(conv, 'rect', { x0: 0, y0: 0, x1: 300, y1: 300 });
  const b1 = SHAPE.boxOf(conv);
  SHAPE.fromBox(conv, 'circle', b1);
  const b2 = SHAPE.boxOf(conv);
  ok(near(b1.x0, b2.x0, 1e-6) && near(b1.x1, b2.x1, 1e-6) && near(b1.y0, b2.y0, 1e-6) && near(b1.y1, b2.y1, 1e-6),
     'rect → circle 外框不变（拖出来之后想换形状，点一下就行）');
}

console.log('\n--- I) 多边形：边数 / 换类型看得见的变化 / 拖手柄只缩放（批 7-D 反馈）---');
{
  const box = { x0: 0, y0: 0, x1: 400, y1: 300 };
  /* 换类型（reset=true）：顶点不能还是原来那个矩形，否则「矩形 → 多边形」点下去看不出变化 */
  const sh = SHAPE.blank({ kind: 'rect', dist: 'even', count: 21, first: 0 });
  ok(sh.n === 6, `blank 默认边数 n=${sh.n}`);
  SHAPE.fromBox(sh, 'rect', box, true);
  const b0 = SHAPE.boxOf(sh);
  SHAPE.fromBox(sh, 'poly', b0, true);
  ok(sh.kind === 'poly' && sh.pts.length === 6,
     `矩形换多边形 → ${sh.pts.length} 个顶点（正六边形，不再是个 4 点矩形）`);
  const b1 = SHAPE.boxOf(sh);
  ok(near(b1.x0, b0.x0, 1e-6) && near(b1.x1, b0.x1, 1e-6) && near(b1.y0, b0.y0, 1e-6) && near(b1.y1, b0.y1, 1e-6),
     '换多边形外框不动（还是那个框）');
  ok(SHAPE.segs(sh).length === 6 && SHAPE.pathLen(sh) < 2 * (400 + 300) - 1,
     `六边形 6 条边、周长 ${SHAPE.pathLen(sh).toFixed(0)}px（比同框矩形 ${2 * (400 + 300)}px 短 → 肉眼看得见）`);
  ok(SHAPE.plan(sh, 40).count === 21, `多边形上照铺 21 颗`);

  /* 圆 / 圆角矩形 / 直线换多边形：也一样给正经的多边形（别把旧顶点缩放一下就交差） */
  const ell = SHAPE.blank({ kind: 'circle', dist: 'even', count: 12, first: 0 });
  SHAPE.fromBox(ell, 'circle', { x0: 0, y0: 0, x1: 300, y1: 200 });
  SHAPE.fromBox(ell, 'poly', { x0: 0, y0: 0, x1: 300, y1: 200 }, true);
  ok(SHAPE.ptsOf(ell).length === 6 && SHAPE.segs(ell).length === 6, '椭圆换多边形 → 也是 6 边形');
  const eb = SHAPE.boxOf(ell);
  ok(near(eb.x0, 0, 1e-6) && near(eb.x1, 300, 1e-6) && near(eb.y0, 0, 1e-6) && near(eb.y1, 200, 1e-6),
     '椭圆换多边形外框不变');

  /* 边数参数：blank 里给的 n 生效；≤2 归到 3 */
  const p5 = SHAPE.blank({ kind: 'poly', n: 5, dist: 'even', count: 15, first: 0 });
  SHAPE.fromBox(p5, 'poly', { x0: 0, y0: 0, x1: 200, y1: 200 }, true);
  ok(p5.pts.length === 5 && p5.n === 5, `blank 里给的边数被认（${p5.pts.length} 边形）`);
  ok(SHAPE.regularPts(2, 100, 100, 50, 50, -90).length === 3, '边数 < 3 归到 3（三角形）');
  const rp = SHAPE.regularPts(8, 200, 200, 100, 60, -90);
  const rx = rp.map(p => p[0]), ry = rp.map(p => p[1]);
  ok(near(Math.min(...rx), 100, 1e-6) && near(Math.max(...rx), 300, 1e-6) &&
     near(Math.min(...ry), 140, 1e-6) && near(Math.max(...ry), 260, 1e-6),
     '正 8 边形顶点正好填满给定外框（拖手柄改大小不会跳）');

  /* 拖手柄改大小（不带 reset）：顶点个数不变，形状只按包围盒缩放 */
  SHAPE.fromBox(p5, 'poly', { x0: 100, y0: 50, x1: 500, y1: 350 });
  const q = SHAPE.boxOf(p5);
  ok(p5.pts.length === 5, '拖手柄改大小：还是 5 个顶点（不会自己变成 6 个）');
  ok(near(q.x0, 100, 1e-6) && near(q.x1, 500, 1e-6) && near(q.y0, 50, 1e-6) && near(q.y1, 350, 1e-6),
     '缩放后外框 = 拖出来的新框');
  ok(SHAPE.plan(p5, 40).count === 15, `五边形铺 15 颗（${SHAPE.plan(p5, 40).count} 颗）`);

  /* 手画的自定义多边形：只要不改边数，顶点表原样留着（不该被「正多边形」覆盖） */
  const custom = SHAPE.blank({ kind: 'poly', n: 5, pts: [[10, 10], [200, 10], [200, 180], [120, 260], [10, 180]],
                              dist: 'even', count: 9 });
  ok(custom.pts[3][0] === 120 && custom.pts[3][1] === 260, '自定义多边形顶点原样保留');

  /* 直线（开环）换多边形：闭边得补上，不然「六边形」只有 5 条边 */
  const ln = SHAPE.blank({ kind: 'line', dist: 'even', count: 5, first: 0 });
  SHAPE.fromBox(ln, 'line', { x0: 0, y0: 0, x1: 200, y1: 200 });
  SHAPE.fromBox(ln, 'poly', { x0: 0, y0: 0, x1: 200, y1: 200 }, true);
  ok(ln.closed === true && SHAPE.segs(ln).length === 6, `直线换多边形 → 闭合、${SHAPE.segs(ln).length} 条边（闭边补上了）`);
}

console.log('\n--- J) 轮廓最近点（定头尾 / 抓轮廓用）---');
{
  const rect = SHAPE.blank({ kind: 'rect', dist: 'even', count: 10, first: 0 });
  SHAPE.fromBox(rect, 'rect', { x0: 0, y0: 0, x1: 200, y1: 200 });
  const hit = SHAPE.arcNear(rect, [100, 0], 5);
  ok(hit && near(hit.s, 100, 0.01), `上边中点弧长 = ${hit ? hit.s.toFixed(2) : 'null'}`);
  ok(SHAPE.arcNear(rect, [300, 300], 5) === null, '离得远的点不算在轮廓上');
  ok(SHAPE.arcNear(rect, [150, 150], 5) === null, '框内部不算轮廓（定头尾必须贴边点）');
}


console.log('\n--- K) 定头尾：两次点击 → 「头」落在你点的那一颗上（第 2 下只定方向，头不再动）---');
{
  const C = GEN.CELL;
  const mk = o => SHAPE.blank(Object.assign(SHAPE.newRect({ x0: 0, y0: 0, W: 6, H: 6.5 }, C), o));
  const bases = {
    cells: mk({ dist: 'cells', count: 26 }),
    even:  mk({ dist: 'even',  count: 26 }),
    sides: mk({ dist: 'sides', sides: '6,7,6,7' }),
    pitch: mk({ dist: 'pitch', pitch: C }),
  };
  const dist = (p, q) => Math.hypot(p.x - q[0], p.y - q[1]);
  /* ① 点在某颗灯上 → 那颗灯必须成为第 1 号（点哪儿 = 头在哪儿） */
  const badA = [];
  for (const [nm, base] of Object.entries(bases)) {
    for (const d0 of ['cw', 'ccw']) {
      const b0 = Object.assign({}, base, { dir: d0 });
      SHAPE.plan(b0, C).pts.forEach((node, j) => {
        const s = SHAPE.arcAt(b0, [node.x, node.y]);
        if (s == null) return;                              /* 这一颗不在轮廓上（cells 档的内侧行）：UI 里点不到它 */
        const sh = Object.assign({}, b0);
        sh.entry = Math.round(SHAPE.entryForHead(sh, s, d0, C) * 10) / 10;
        const head = SHAPE.plan(sh, C).pts[0], d = dist(head, [node.x, node.y]);
        if (d > 0.06) badA.push(`${nm}/${d0} 第 ${j} 颗：头差 ${d.toFixed(2)}px`);
      });
    }
  }
  ok(!badA.length, '第 1 下点在哪一颗上，那一颗就是 1 号（4 种分布 × 2 个初始方向，逐颗验；差 ≤0.06px）' +
     (badA.length ? ' → ' + badA.slice(0, 4).join('；') : ''));
  /* ② 第 2 下只定方向：点「头」另一侧的尾 → 方向翻过去，头**原地不动** */
  const badB = [], D = [];
  for (const [nm, base] of Object.entries(bases)) {
    for (const d0 of ['cw', 'ccw']) {
      const b0 = Object.assign({}, base, { dir: d0 });
      const p0 = SHAPE.plan(b0, C).pts;
      const sH = SHAPE.arcAt(b0, [p0[6].x, p0[6].y]);        /* 用户点的那一颗（头） */
      const step = SHAPE.pathLen(b0) / SHAPE.count(b0);
      /* 尾点在同一条路上：顺/逆各点一次 —— 期望「离头近的那边走」 */
      [[sH - step, 'ccw'], [sH + step, 'cw']].forEach(([sT, want]) => {
        const sh = Object.assign({}, b0);
        const r = SHAPE.setHeadTail(sh, sH, sT, C);
        const d = dist(SHAPE.plan(sh, C).pts[0], [p0[6].x, p0[6].y]);
        D.push(`${nm}/${d0}→${sh.dir}`);
        if (!r.dirSet || sh.dir !== want || d > 0.06)
          badB.push(`${nm}/${d0} 尾在${sT < sH ? '前' : '后'}：dir=${sh.dir}(期望 ${want}) 头差 ${d.toFixed(2)}px`);
      });
    }
  }
  ok(!badB.length, '第 2 下点「尾」= 编号往离头近的那边走（头仍在第 1 下那一颗上，没被挪走）' +
     (badB.length ? ' → ' + badB.join('；') : ''));
  /* ③ 两点重合 / 开环往回点：定不出方向 —— 但方向不瞎改、头也不动 */
  {
    const b0 = Object.assign({}, bases.even, { dir: 'cw' });
    const p0 = SHAPE.plan(b0, C).pts, sH = SHAPE.arcAt(b0, [p0[6].x, p0[6].y]);
    const sh = Object.assign({}, b0);
    const r = SHAPE.setHeadTail(sh, sH, sH, C);
    ok(!r.dirSet && sh.dir === 'cw' && dist(SHAPE.plan(sh, C).pts[0], [p0[6].x, p0[6].y]) <= 0.06,
       '「尾」点回「头」身上：方向照旧（不瞎翻），头仍在点的那一颗上');
    const ln = SHAPE.blank({ kind: 'line', closed: false, dist: 'even', count: 12, pts: [[100, 100], [500, 100]] });
    const r2 = SHAPE.setHeadTail(ln, 200, 100, C);          /* 尾点在头的来路上 */
    ok(!r2.dirSet && r2.open && ln.dir === 'cw' && ln.entry === 200 && SHAPE.plan(ln, C).pts[0].x === 300,
       '开环（直线）往回点「尾」：定不出方向，但头照样落在点的那一颗上（编号只能往末端铺）');
    /* 格点档同一个格点再点一次：一样定不出方向，且方向不许瞎翻（格点档单独一条道） */
    const bc = Object.assign({}, bases.cells, { dir: 'ccw' });
    const pc = SHAPE.plan(bc, C).pts, sc = SHAPE.arcAt(bc, [pc[6].x, pc[6].y]);
    const shc = Object.assign({}, bc);
    const rc = SHAPE.setHeadTail(shc, sc, sc, C);
    ok(!rc.dirSet && shc.dir === 'ccw' && dist(SHAPE.plan(shc, C).pts[0], [pc[6].x, pc[6].y]) <= 0.06,
       '格点档「尾」点回「头」自己那颗：方向照旧（不瞎翻），头仍在点的那一颗上');
  }
}

