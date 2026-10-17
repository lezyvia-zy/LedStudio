/* ============================================================================
 * 一键跑全部测试。
 *
 *   node tests/run_all.mjs            跑全部（默认最多 4 路并行，约 20s）
 *   node tests/run_all.mjs 效果 编译   只跑名字里含这些字样的（按文件名匹配）
 *   node tests/run_all.mjs --jobs=1   串行（怀疑套件之间有干扰时用）
 *
 * 必须在项目根目录跑（测试脚本按相对路径读 led_layout_editor.html）。
 * 依赖：node（无需 npm install）。test_effects_c_exec 还需要 AndeSight 自带的
 * cygwin gcc，见 README；没有的话它会自己跳过并说明。
 *
 * 并行是安全的：每个套件都是独立进程，写盘的两个（effects_c_exec → tests/.build、
 * gen_independence → tests/.build/hal）落在不同目录。输出仍按文件名顺序打印，
 * 所以「合计 N 项通过」的解析、以及屏幕上谁先谁后都不变。
 * ==========================================================================*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
process.chdir(ROOT);

const argv = process.argv.slice(2);
const jobsArg = argv.find(a => /^--jobs=\d+$/.test(a));
const filters = argv.filter(a => !a.startsWith('--'));
const jobs = Math.max(1, jobsArg ? +jobsArg.split('=')[1] : Math.min(4, os.cpus().length));

let files = fs.readdirSync(HERE)
  .filter(f => f.startsWith('test_') && f.endsWith('.mjs'))
  .sort();
if (filters.length) files = files.filter(f => filters.some(k => f.includes(k)));

if (!files.length) {
  console.error('没有匹配的测试文件。可用的：' +
    fs.readdirSync(HERE).filter(f => f.startsWith('test_')).map(f => f.replace(/^test_|\.mjs$/g, '')).join(', '));
  process.exit(1);
}

/* 一个套件 = 一个子进程；stdout/stderr 都收进同一条流（跟原来的 execFileSync 一致） */
function runOne(f) {
  return new Promise(resolve => {
    const cp = spawn(process.execPath, [path.join('tests', f)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    cp.stdout.setEncoding('utf8');
    cp.stderr.setEncoding('utf8');
    cp.stdout.on('data', d => { out += d; });
    cp.stderr.on('data', d => { out += d; });
    cp.on('error', () => resolve({ out, rc: 1 }));
    cp.on('close', code => resolve({ out, rc: code === null ? 1 : code }));
  });
}

let pass = 0, fail = 0, broke = [];
const t0 = Date.now();
console.log('跑 %d 个测试文件（项目根 %s%s）\n', files.length, ROOT, jobs > 1 ? ` · ${jobs} 路并行` : '');

/* 谁先跑完都行，结果按文件名顺序回填，打印顺序与串行时完全一致 */
const results = new Array(files.length);
let next = 0;
await Promise.all(Array.from({ length: Math.min(jobs, files.length) }, async () => {
  for (;;) {
    const i = next++;
    if (i >= files.length) return;
    results[i] = await runOne(files[i]);
  }
}));

for (let i = 0; i < files.length; i++) {
  const f = files[i];
  const { out, rc } = results[i];
  const p = (out.match(/  PASS  /g) || []).length;
  const fl = (out.match(/  FAIL  /g) || []).length;
  pass += p; fail += fl;
  const name = f.replace(/^test_|\.mjs$/g, '');
  if (fl || rc) {
    console.log(`✗ ${name.padEnd(22)} 通过 ${p}  失败 ${fl}`);
    out.split('\n').filter(l => /  FAIL  /.test(l) || /Error|error:/.test(l)).slice(0, 4)
       .forEach(l => console.log('    ' + l.trim()));
    broke.push(name);
  } else {
    console.log(`✓ ${name.padEnd(22)} 通过 ${p}`);
  }
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log('\n' + '-'.repeat(46));
console.log(`合计 ${pass} 项通过 / ${fail} 项失败，用时 ${secs}s`);
if (broke.length) console.log('没过的：' + broke.join(', '));
process.exit(fail || broke.length ? 1 : 0);

