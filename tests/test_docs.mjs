/* 文档一致性：统计数字、"第 N 行"式坐标、HANDOFF 顶端的自动块。
 *
 * 为什么会有这个套件：这些数字以前靠手改，真翻过车 —— 2026-10-17 发现 CLAUDE.md 写
 * 1279 项、README.md 写 1153 项、实测 1288 项（三处互相矛盾）。刷新用
 * `node tools/docsync.mjs stats --write`，规矩见 CLAUDE.md「改完怎么验（省时版）」。
 *
 * 这里只查「不需要跑别的套件就能查的东西」（自洽 + 与磁盘一致）；「断言之和 = 实测」
 * 交给 `node tools/docsync.mjs check --with-tests`（那要跑全量，放套件里不合适）。
 */
import fs from 'node:fs';
let fails = 0;
const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fails++; };
const read = f => fs.readFileSync(f, 'utf8');

const DOCS = ['CLAUDE.md', 'HANDOFF.md', 'README.md'];
const text = Object.fromEntries(DOCS.map(f => [f, read(f)]));
const handoff = text['HANDOFF.md'];

/* 「N 套件 / M 项断言」的四种写法，与 tools/docsync.mjs 认的那几种保持一致 */
const NUM_RE = new RegExp([
  '(?<n1>\\d+)\\s*个套件、(?<m1>\\d+)\\s*项断言',
  '(?<n2>\\d+)\\s*套件、(?<m2>\\d+)\\s*项断言',
  '(?<n3>\\d+)\\s*套件 \\/ (?<m3>\\d+)\\s*项 \\/ (?<f3>\\d+) FAIL',
  '(?<n4>\\d+)\\s*套件 \\/ (?<f4>\\d+) FAIL',
  '(?<m5>\\d+)\\s*项断言全绿',
].join('|'), 'g');
const num = x => (x === undefined ? null : +x);

const spots = [];
for (const f of DOCS) {
  for (const mm of text[f].matchAll(NUM_RE)) {
    const g = mm.groups;
    spots.push({ f, n: num(g.n1 ?? g.n2 ?? g.n3 ?? g.n4), m: num(g.m1 ?? g.m2 ?? g.m3 ?? g.m5), fail: num(g.f3 ?? g.f4) });
  }
}
const uniq = (a, k) => [...new Set(a.map(s => s[k]).filter(v => v !== null))];
const ns = uniq(spots, 'n'), ms = uniq(spots, 'm');
const suitesOnDisk = fs.readdirSync('tests').filter(f => f.startsWith('test_') && f.endsWith('.mjs')).length;
const listed = [...new Set([...handoff.matchAll(/`(test_\w+)`\((\d+)/g)].map(m => m[1]))];
const tablesuites = listed.length;

ok(spots.length >= 4, `${DOCS.length} 份文档里找到 ${spots.length} 处「套件 / 断言」写法（应 ≥ 4）`);
ok(ns.length === 1, ns.length === 1 ? `套件数一致：${ns[0]}`
  : `套件数不一致：${spots.map(s => `${s.f}=${s.n}`).join(' ')}`);
ok(ns[0] === suitesOnDisk, `套件数 ${ns[0]} = tests/ 里 ${suitesOnDisk} 个 test_*.mjs`);
ok(ms.length === 1, ms.length === 1 ? `断言数一致：${ms[0]}（${spots.length} 处）`
  : `断言数不一致（就这处翻过车）：${spots.filter(s => s.m !== null).map(s => `${s.f}=${s.m}`).join(' ')}`);
/* FAIL 数：只查几处是否**互相一致**，不查「必须为 0」 —— 这个数由 stats --write 从实测
   写回，而本节套件自己的失败数也会被算进去（写成「必须为 0」会自指死锁：红一次 → 文档写
   1 FAIL → 又红一次）。「绿的时候必须是 0」由 `node tools/docsync.mjs check --with-tests` 守。 */
const fss = [...new Set(spots.map(s => s.fail).filter(v => v !== null))];
ok(fss.length <= 1, fss.length <= 1 ? `FAIL 数一致：${fss.length ? fss[0] : '（无此写法）'}`
  : `FAIL 数不一致：${spots.filter(s => s.fail !== null).map(s => `${s.f}:${s.fail}`).join(' / ')}`);

/* HANDOFF「测试覆盖」表里列出的套件，应当与磁盘上的 test_*.mjs 一一对应 */
const phantom = listed.filter(n => !fs.existsSync(`tests/${n}.mjs`));
const unlisted = fs.readdirSync('tests').filter(f => f.startsWith('test_') && f.endsWith('.mjs'))
  .map(f => f.replace(/\.mjs$/, '')).filter(n => !listed.includes(n));
ok(tablesuites === suitesOnDisk && !phantom.length && !unlisted.length,
  `HANDOFF 表里的套件与 tests/ 一一对应（表 ${tablesuites} / 盘 ${suitesOnDisk}）`
  + (phantom.length ? ` —— 表里多出：${phantom.join(' ')}` : '')
  + (unlisted.length ? ` —— 表里漏了：${unlisted.join(' ')}` : ''));

/* HANDOFF 顶端的自动块（docsync stats --write 的地盘） */
const auto = handoff.match(/<!-- auto:handoff-head -->([\s\S]*?)<!-- \/auto -->/);
ok(!!auto, 'HANDOFF 顶端有自动块（<!-- auto:handoff-head --> … <!-- /auto -->）');
ok(!!auto && /代码顶端 = `[0-9a-f]{7,}`/.test(auto[1]), '自动块里记着代码顶端的提交号');

/* 旧式坐标：定位一律用 #id / 函数名 / 小节名，别再写「第 N 行」 */
const AUDIT = fs.existsSync('docs/audit')
  ? fs.readdirSync('docs/audit').filter(f => f.endsWith('.md')).sort().map(f => 'docs/audit/' + f) : [];
const stale = [];
for (const f of [...DOCS, 'docs/module-audit.md', ...AUDIT]) {
  read(f).split('\n').forEach((l, i) => {
    if (/第\s*\d{3,}\s*行/.test(l) || /约\s*\d{3,}\s*行起/.test(l) || /（约\s*\d+\s*行 \/ \d+\s*KB）/.test(l)) stale.push(`${f}:${i + 1}`);
  });
}
ok(!stale.length, stale.length ? `还留着「第 N 行」式坐标：${stale.join(', ')}`
  : '除 CHANGELOG 外，文档不写「第 N 行 / 约 N 行起」式坐标');

/* 体检报告拆分后：每个 docs/audit/*.md 都必须从索引 link 得上（孤儿文件 = 没人会读） */
const auditIndex = read('docs/module-audit.md');
const orphan = AUDIT.filter(f => !auditIndex.includes('audit/' + f.split('/').pop()));
ok(!orphan.length, `体检报告索引链到全部 ${AUDIT.length} 份正文`
  + (orphan.length ? ` —— 漏了：${orphan.join(' ')}` : '（docs/audit/）'));


/* 刷新器与规矩本身在位 */
ok(fs.existsSync('tools/docsync.mjs'), 'tools/docsync.mjs 在位（统计刷新器）');
ok(/node tools\/docsync\.mjs stats --write/.test(text['CLAUDE.md']), 'CLAUDE.md 教了刷新命令（stats --write）');
const dsync = fs.readFileSync('tools/docsync.mjs', 'utf8');
ok(dsync.includes('function cmdWhere(') && dsync.includes('function cmdSections('),
  'tools/docsync.mjs 有 where / sections（定位：改代码前先问它在哪）');
ok(text['CLAUDE.md'].includes('docsync.mjs where'), 'CLAUDE.md 教了定位命令（where，改之前先跑）');
ok(/新条目/.test(read('docs/CHANGELOG.md').split('\n').slice(0, 8).join('\n')), 'CHANGELOG 头部写着新条目规矩（≤15 行）');

console.log(`\n  查了 ${DOCS.length} 份文档 + 体检报告 ${AUDIT.length + 1} 份（索引 + docs/audit/）+ CHANGELOG · 套件 ${ns[0]} / 断言 ${ms[0]}`);
process.exit(fails ? 1 : 0);
