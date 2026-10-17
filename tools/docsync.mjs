/* ============================================================================
 * 文档同步与校验（LedStudio）
 *
 *   node tools/docsync.mjs stats --write         跑一次全量测试，刷新文档里会漂的数字
 *   node tools/docsync.mjs stats                 只看会改什么，不落盘
 *   node tools/docsync.mjs check                 几秒内校验（不跑测试）
 *   node tools/docsync.mjs check --with-tests    连断言数一起校验（跑全量）
 *
 * 为什么要有它：这些数字以前靠手改，改漏了就会出现「CLAUDE.md 说 1279 项、README 说
 * 1153 项」这种自相矛盾（2026-10-17 就真抓到过一次）。规矩见 CLAUDE.md「测试怎么组织
 * 的」里那段「改完怎么验（省时版）」。
 *
 * 刷新的只有这三处（别的文档一个字都不动）：
 *   ① HANDOFF.md 顶端的自动块 <!-- auto:handoff-head --> … <!-- /auto -->
 *   ② CLAUDE.md / HANDOFF.md / README.md 里「N 个套件、M 项断言」等四种写法
 *   ③ HANDOFF.md「测试覆盖」表里每个套件名后面的 (N)
 * module-audit / CHANGELOG 里的「当时 20 套件 / 643 项」是**历史快照**，永远不碰。
 *
 * check 查四件事：②③ 是否与实测一致、套件数是否等于磁盘上的测试文件数、
 * 自动块里的提交号是否还是当前 HEAD、各文档里「`符号` 紧跟 N–M」的区间引用是否还落得上。
 * 区间只认「符号紧贴区间」这一种写法（中间不含数字 / 反引号 / 竖线），裸区间和表格里隔壁
 * 单元格的符号都不参与 —— 2026-10-17 收紧过一次，见 checkRanges 上的注释。
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(HERE, '..'));   // 必须在项目根跑（测试脚本按相对路径读 HTML）

const HANDOFF = 'HANDOFF.md';
const COUNT_DOCS = ['CLAUDE.md', HANDOFF, 'README.md'];                       // 会写数字的
const RANGE_DOCS = ['CLAUDE.md', HANDOFF, 'README.md', 'docs/module-audit.md']; // 查区间引用的
const HEAD_MARK = '<!-- auto:handoff-head -->';
const HEAD_END = '<!-- /auto -->';
const HEAD_RE = /<!-- auto:handoff-head -->[\s\S]*?<!-- \/auto -->/;
const WINDOW = 40;                        // 区间引用校验的容差（行）
const HTML_LINES = fs.readFileSync('led_layout_editor.html', 'utf8').split('\n');

const args = process.argv.slice(2);
const cmd = (args[0] || 'check').toLowerCase();
const isWrite = args.includes('--write');
const withTests = args.includes('--with-tests');
const verbose = args.includes('--verbose');

const read = f => fs.readFileSync(f, 'utf8');
const save = (f, s) => fs.writeFileSync(f, s, 'utf8');
const eolOf = s => (s.includes('\r\n') ? '\r\n' : '\n');

function git(a) {
  try { return execFileSync('git', a, { encoding: 'utf8' }).trim(); } catch { return ''; }
}
const suiteCount = () => fs.readdirSync('tests').filter(f => /^test_.*\.mjs$/.test(f)).length;

/* 跑全量，取「每个套件的通过数」与「合计 N 项通过」 */
function runAll() {
  let out = '';
  try { out = execFileSync(process.execPath, ['tests/run_all.mjs'], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { out = String((e.stdout || '') + (e.stderr || '')); }
  /* 注意：run_all 打印的套件名是**去掉 `test_` 前缀**的（`ui` / `docs` …），这里补回来，
     否则 HANDOFF 表里的 `test_ui`(282) 这种写法一条都匹配不上（2026-10-17 踩过）。 */
  const suites = [...out.matchAll(/^[✓✗] (\S+)\s+通过 (\d+)/gm)]
    .map(m => ({ name: m[1].startsWith('test_') ? m[1] : 'test_' + m[1], n: +m[2] }));
  const t = out.match(/合计 (\d+) 项通过 \/ (\d+) 项失败/);
  if (!t) { console.error('没解析到「合计 … 项通过」，原始输出末尾：\n' + out.slice(-600)); process.exit(2); }
  return { suites, pass: +t[1], fail: +t[2] };
}

/* —— ② 数字的四种写法（顺序不能乱：「套件 / N 项 / F FAIL」必须先于「套件 / F FAIL」） —— */
function fixCounts(txt, n, m, f) {
  return txt
    .replace(/(\d+)\s*个套件、(\d+)\s*项断言/g, `${n} 个套件、${m} 项断言`)
    .replace(/(\d+)\s*套件、(\d+)\s*项断言/g, `${n} 套件、${m} 项断言`)
    .replace(/(\d+)\s*套件 \/ (\d+)\s*项 \/ (\d+) FAIL/g, `${n} 套件 / ${m} 项 / ${f} FAIL`)
    .replace(/(\d+)\s*套件 \/ (\d+) FAIL/g, `${n} 套件 / ${f} FAIL`)
    .replace(/(\d+)\s*项断言全绿/g, `${m} 项断言全绿`);
}
const SPOT_RE = /\d+\s*个套件、\d+\s*项断言|\d+\s*套件、\d+\s*项断言|\d+\s*套件 \/ \d+\s*项 \/ \d+ FAIL|\d+\s*套件 \/ \d+ FAIL|\d+\s*项断言全绿/;

/* —— ③「测试覆盖」表里每个套件名后面的 (N) —— */
function fixSuiteCounts(txt, suites) {
  let hit = 0;
  for (const s of suites) {
    // 表里两种写法都有：`test_ui`(282) 与 `test_stage`(123，§10… 说明) —— 只换数字，不动括号里剩下的说明
    txt = txt.replace(new RegExp('(`' + s.name + '`)\\((\\d+)', 'g'),
      (all, name) => { hit++; return name + '(' + s.n; });
  }
  return { txt, hit };
}

/* —— ① HANDOFF 顶端的自动块 —— */
function headBlock({ hash, date, n, m, f }, eol) {
  return [
    HEAD_MARK,
    `> **最新交接（${date}）**：代码顶端 = \`${hash}\`（本行刷新时）；全量 \`node tests/run_all.mjs\` = **${n} 套件 / ${m} 项 / ${f} FAIL**。本行由 \`node tools/docsync.mjs stats --write\` 刷新，别手改。`,
    HEAD_END,
  ].join(eol);
}

/* —— 找「数字出现点」/ 读数字 —— */
function spotsOf(txt) {
  const out = [];
  txt.split('\n').forEach((line, i) => { if (SPOT_RE.test(line)) out.push({ line: i + 1, text: line }); });
  return out;
}
function numsIn(text) {
  const ns = [], ms = [], fs = [];
  for (const m of text.matchAll(/(\d+)\s*个?套件/g)) ns.push(+m[1]);
  for (const m of text.matchAll(/(\d+)\s*项断言/g)) ms.push(+m[1]);
  for (const m of text.matchAll(/(\d+)\s*项 \/ (\d+) FAIL/g)) { ms.push(+m[1]); fs.push(+m[2]); }
  for (const m of text.matchAll(/(\d+)\s*套件 \/ (\d+) FAIL/g)) fs.push(+m[2]);
  return { ns, ms, fs };
}

/* —— 区间引用：只认「`符号` 紧跟 N–M」这一种写法，然后问：这个符号现在真在 N..M 这一带吗
       （容差 ±WINDOW 行）。
       2026-10-17 收紧过一版：老写法取「区间前后 ±70 字的符号」，在 §1 模块地图这种一行里有 4 个
       单元格、好几个区间的地方，会把隔壁单元格的符号算到这条区间上 —— 233–236（HTML 标记）配
       `renderIssues`（JS）这种，凭空报出 60 多条假警报。 */
const REF_RE = /`([A-Za-z_#][\w.#$-]*\*?)`[^\d`|]{0,12}?(\d{2,6})\s*[–—~]\s*(\d{2,6})/g;

/* 符号「像定义」的那一行（1 起）；找不到 = -1 */
function lineOfSym(sym) {
  const esc = sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tries = [
    new RegExp('id="' + esc + '"'),                               // #paneZones → id="paneZones"
    new RegExp('\\b(?:function|const|let|var)\\s+' + esc + '\\b'), // function foo() / const FW = {
    new RegExp('\\b' + esc + '\\b'),                               // 兜底：任何出现处
  ];
  for (const re of tries) {
    const i = HTML_LINES.findIndex(l => re.test(l));
    if (i >= 0) return i + 1;
  }
  return -1;
}

function checkRanges() {
  const warn = [];
  let seen = 0;
  for (const f of RANGE_DOCS) {
    read(f).split('\n').forEach((line, i) => {
      for (const m of line.matchAll(REF_RE)) {
        if (/\*$/.test(m[1])) continue;          // `sim*` 这种前缀写法不是锚点
        const sym = m[1].replace(/^#/, '');
        const a = +m[2], b = +m[3];
        if (a < 60 || b > HTML_LINES.length || b < a) continue;
        const at = lineOfSym(sym);
        seen++;
        if (at < 0) {
          warn.push(`${f}:${i + 1}  \`${sym}\` 在 HTML 里找不到（改名 / 删了？）—— 区间 ${a}–${b} 请换成现在的符号名`);
        } else if (at < a - WINDOW || at > b + WINDOW) {
          warn.push(`${f}:${i + 1}  \`${sym}\` 实际在 ${at} 行，文档写 ${a}–${b}（偏 ${at > b ? at - b : a - at} 行）`);
        }
      }
    });
  }
  return { warn, seen };
}

/* —— stats —— */
function changedLines(a, b) {
  const A = a.split('\n'), B = b.split('\n');
  if (A.length !== B.length) return [`（行数变了 ${A.length} → ${B.length}）`];
  const out = [];
  A.forEach((l, i) => { if (l !== B[i]) out.push(`第 ${i + 1} 行`); });
  return out;
}
function buildStats() {
  const { suites, pass, fail } = runAll();
  const n = suiteCount();
  const hash = git(['rev-parse', '--short', 'HEAD']) || '???????';
  const date = git(['log', '-1', '--format=%ad', '--date=short']) || '0000-00-00';
  const out = {};
  for (const file of COUNT_DOCS) {
    const src = read(file);
    let t = fixCounts(src, n, pass, fail);
    if (file === HANDOFF) {
      if (!HEAD_RE.test(src)) {
        console.error(`${HANDOFF} 里找不到自动块标记（${HEAD_MARK} … ${HEAD_END}），先手工补上再跑`);
        process.exit(2);
      }
      t = t.replace(HEAD_RE, headBlock({ hash, date, n, m: pass, f: fail }, eolOf(src)));
      t = fixSuiteCounts(t, suites).txt;
    }
    out[file] = { src, t };
  }
  return { n, pass, fail, hash, date, out };
}
function cmdStats() {
  const s = buildStats();
  console.log(`\n  实测：${s.n} 套件 / ${s.pass} 项 / ${s.fail} FAIL（HEAD ${s.hash} · ${s.date}）\n`);
  for (const f of COUNT_DOCS) {
    const ch = changedLines(s.out[f].src, s.out[f].t);
    if (!ch.length) { console.log(`  = ${f} 无需改动`); continue; }
    console.log(`  ${isWrite ? '✓ 已刷新' : '… 待刷新'} ${f}（${ch.length} 行：${ch.slice(0, 6).join(' ')}）`);
    if (isWrite) save(f, s.out[f].t);
  }
  console.log(isWrite
    ? '\n  下一步：node tests/run_all.mjs 复核，再 node tools/docsync.mjs check'
    : '\n  （加 --write 才落盘）');
}

/* —— check —— */
function cmdCheck() {
  const n = suiteCount();
  let bad = 0;
  const fail = m => { bad++; console.log('  ✗ ' + m); };
  const good = m => console.log('  ✓ ' + m);

  const ns = [], ms = [], fs = [], wn = [], wm = [];
  for (const f of COUNT_DOCS) {
    for (const sp of spotsOf(read(f))) {
      const v = numsIn(sp.text);
      v.ns.forEach(x => { ns.push(x); wn.push(`${f}:${sp.line}`); });
      v.ms.forEach(x => { ms.push(x); wm.push(`${f}:${sp.line}`); });
      v.fs.forEach(x => { fs.push(x); });
    }
  }
  const uniq = a => [...new Set(a)];
  if (!ns.length) fail('三份文档里一处「N 套件」都没找到');
  else if (uniq(ns).length > 1) fail('套件数不一致：' + ns.map((v, i) => `${wn[i]}=${v}`).join(' / '));
  else if (ns[0] !== n) fail(`套件数写的是 ${ns[0]}，磁盘上 tests/test_*.mjs 有 ${n} 个`);
  else good(`套件数 ${n}（${ns.length} 处一致，磁盘 ${n} 个测试文件）`);

  if (!ms.length) fail('一处「N 项断言」都没找到');
  else if (uniq(ms).length > 1) fail('断言数不一致（就这一处翻过车）：' + ms.map((v, i) => `${wm[i]}=${v}`).join(' / '));
  else if (withTests) {
    const r = runAll();
    if (ms[0] !== r.pass) fail(`断言数写的是 ${ms[0]}，实测 ${r.pass}`);
    else if (fs.length && (uniq(fs).length > 1 || fs[0] !== r.fail)) fail(`FAIL 数写的是 ${fs.join(' / ')}，实测 ${r.fail}`);
    else good(`断言数 ${r.pass} / FAIL ${r.fail}（与实测一致）`);
  } else good(`断言数 ${ms[0]}（${ms.length} 处一致；加 --with-tests 才能跟实测比）`);

  if (!withTests) {
    if (fs.some(v => v !== 0)) fail('FAIL 数不是 0：' + fs.join(' / '));
    else good(`FAIL 数都是 0（${fs.length} 处）`);
  }

  const hf = read(HANDOFF);
  if (!HEAD_RE.test(hf)) fail(`${HANDOFF} 里没有自动块（${HEAD_MARK} … ${HEAD_END}）`);
  else {
    const h = (hf.match(HEAD_RE)[0].match(/代码顶端 = `([0-9a-f]+)`/) || [])[1];
    const head = git(['rev-parse', '--short', 'HEAD']);
    if (!h) fail('自动块里没有「代码顶端 = `…`」');
    else if (h === head) good(`自动块：代码顶端 ${h} = 当前 HEAD`);
    else console.log(`  · 自动块：记的是 ${h}，当前 HEAD 是 ${head}（差一个提交很正常，改完跑一次 stats --write 对齐）`);
  }

  const { warn: rw, seen } = checkRanges();
  if (!rw.length) good(`区间引用：${seen} 处「\`符号\` 紧跟 N–M」都还落得上`);
  else if (verbose) {
    console.log(`  ! 区间引用漂了（${rw.length} / ${seen} 处；只提示不算错）：`);
    rw.forEach(x => console.log('      ' + x));
  } else {
    const byLine = new Map();
    rw.forEach(x => { const k = x.split('  ')[0]; byLine.set(k, (byLine.get(k) || 0) + 1); });
    console.log(`  ! 区间引用漂了（${rw.length} / ${seen} 处，落在 ${byLine.size} 行；只提示不算错，加 --verbose 看逐条）：`);
    [...byLine].slice(0, 8).forEach(([k, c]) => console.log(`      ${k}  ${c} 条区间落不上`));
    if (byLine.size > 8) console.log(`      …还有 ${byLine.size - 8} 行`);
  }

  console.log(bad ? `\n  ${bad} 项不一致 —— 跑 node tools/docsync.mjs stats --write 修掉。` : '\n  文档与实测一致。');
  process.exit(bad ? 1 : 0);
}

if (cmd === 'stats') cmdStats();
else if (cmd === 'check') cmdCheck();
else { console.error('用法：node tools/docsync.mjs stats [--write] | check [--with-tests]'); process.exit(2); }
