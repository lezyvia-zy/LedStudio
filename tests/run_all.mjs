/* ============================================================================
 * 一键跑全部测试。
 *
 *   node tests/run_all.mjs            跑全部
 *   node tests/run_all.mjs 效果 编译   只跑名字里含这些字样的（按文件名匹配）
 *
 * 必须在项目根目录跑（测试脚本按相对路径读 led_layout_editor.html）。
 * 依赖：node（无需 npm install）。test_effects_c_exec 还需要 AndeSight 自带的
 * cygwin gcc，见 README；没有的话它会自己跳过并说明。
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
process.chdir(ROOT);

const filters = process.argv.slice(2);
let files = fs.readdirSync(HERE)
  .filter(f => f.startsWith('test_') && f.endsWith('.mjs'))
  .sort();
if (filters.length) files = files.filter(f => filters.some(k => f.includes(k)));

if (!files.length) {
  console.error('没有匹配的测试文件。可用的：' +
    fs.readdirSync(HERE).filter(f => f.startsWith('test_')).map(f => f.replace(/^test_|\.mjs$/g, '')).join(', '));
  process.exit(1);
}

let pass = 0, fail = 0, broke = [];
const t0 = Date.now();
console.log('跑 %d 个测试文件（项目根 %s）\n', files.length, ROOT);

for (const f of files) {
  let out = '', rc = 0;
  try {
    out = execFileSync(process.execPath, [path.join('tests', f)], { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    out = String((e.stdout || '') + (e.stderr || ''));
    rc = e.status === undefined ? 1 : e.status;
  }
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
