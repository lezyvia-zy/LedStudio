/* ============================================================================
 * 契约独立性 —— 「工具是唯一真源、平台只实现 HAL」这条边界能不能被机器判定
 *
 * 这份套件守住三件事：
 *   ① 生成的 led_gen_hal.h 是平台无关的（零平台符号 / 只 include 标准头 / ASCII / 行尾可控）
 *   ② 契约与文档双向一致（文档漂移立刻红）
 *   ③ 现有 led_effects_gen.h 与平台的耦合**不许悄悄变多**（附录 A 账本，② 阶段清零）
 * 真编译部分需要 AndeSight 自带的 cygwin gcc；没有就 SKIP（静态断言照跑）。
 * ==========================================================================*/
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const html = fs.readFileSync('led_layout_editor.html', 'utf8');
const CORE = new Function(html.match(/<script id="core">([\s\S]*?)<\/script>/)[1] + '\n; return CORE;')();
const { projectFromPreset, PRESET_SP3122D, exportHalC, exportEffectsC, LED_GEN_HAL } = CORE;
const doc = fs.readFileSync('docs/firmware-contract.md', 'utf8');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fails++; };
const word = s => new RegExp('\\b' + s.replace(/\./g, '\\.') + '\\b');

const st = projectFromPreset(PRESET_SP3122D);
const hal = exportHalC(st, { comment: 'ascii', eol: 'lf' });

/* 账本：现有 led_effects_gen.h 还欠着的平台耦合（docs/firmware-contract.md 附录 A 逐条对应）。
 * ②「引擎自洽化」完成后，把这里清空、文档那节改成 EMPTY_MARK，本套件会跟着收紧。 */
const LEDGER = [
  'led_ring.h', 'ring_t', 'anim_ctx_t', 'color_ctx_t', 'rgb_t', 'led_zone_t',
  'cos_window_tbl', 'spectrum_tbl',
  'LED_COUNT', 'RING_SIZE', 'ZONE_MAX', 'ZONE_MAX_LEN', 'RING_PRESET_COUNT', 'LED_EFFECTS_GEN_RENDER',
  'ANIM_CHASE_SINGLE', 'ANIM_CHASE_DUAL', 'ANIM_SWING', 'ANIM_FILL',
  'COLOR_SOLID', 'COLOR_GRADIENT', 'EASE_OUT_QUAD',
  'anim_set', 'anim_update', 'color_update', 'ring_set_position',
  /* 单点追逐的渲染不再借平台原语：生成代码自带 led_gen_anim_chase_single()（平顶光带）。
     账本因此从 29 条降到 28 条 —— 导出物里那 4 个 anim_render_* 只剩 3 个被调用。 */
  'anim_render_chase_dual', 'anim_render_swing', 'anim_render_fill',
];
const EMPTY_MARK = '无耦合（引擎自洽）';
const STD_T = ['uint8_t', 'uint16_t', 'uint32_t', 'int8_t', 'int16_t', 'int32_t', 'uint64_t', 'int64_t', 'size_t', 'bool'];
const scan = src => [...new Set((src.match(/\b(?:ANIM|COLOR|EASE|LED)_[A-Z0-9_]+|\b[a-z][a-z0-9_]*_t\b|\b[a-z][a-z0-9_]*_tbl\b|\bled_ring\.h\b/g) || []))]
  .filter(s => !/^(LED_GEN_|led_gen_)/.test(s) && !STD_T.includes(s));

/* ---------- 1) HAL 头：平台无关 ---------- */
console.log('--- 1) led_gen_hal.h：平台无关的契约面 ---');
ok(!/[^\x00-\x7F]/.test(hal), 'ASCII 模式下一个非 ASCII 字节都没有（GBK 工程也能塞）');
ok(!/\r/.test(hal) && exportHalC(st, { comment: 'ascii', eol: 'crlf' }).includes('\r\n'),
   '行尾可控：lf 版本无 CR、crlf 版本是 CRLF');
ok(exportHalC(st, { comment: 'ascii', eol: 'lf' }) === hal, '同样输入导出两次逐字节一致');
{
  const stCn = projectFromPreset(PRESET_SP3122D);
  stCn.meta.name = '中文项目名';
  ok(!/[^\x00-\x7F]/.test(exportHalC(stCn, { comment: 'ascii', eol: 'lf' })),
     '工程名带中文时 ASCII 模式仍然干净（板名降级成 ?）');
  ok(/中文项目名/.test(exportHalC(stCn, { comment: 'zh', eol: 'lf' })),
     '中文注释模式下则原样保留工程名');
}
ok(hal.includes('__LED_GEN_HAL_H__'), '有 include guard');
ok((hal.match(/#include\s+</g) || []).length === 1 && hal.includes('#include <stdint.h>'),
   '只 include 标准头 <stdint.h>');
{
  const hit = scan(hal).concat(LEDGER.filter(s => word(s).test(hal)));
  ok(hit.length === 0, hit.length ? 'HAL 头里不该出现平台符号: ' + hit.join(' ')
                                  : `HAL 头里没有任何平台符号（含账本里那 ${LEDGER.length} 个）`);
}
ok(new RegExp('#define LED_GEN_HAL_VERSION\\s+' + LED_GEN_HAL.version).test(hal),
   '带契约版本宏 LED_GEN_HAL_VERSION = ' + LED_GEN_HAL.version);
ok(hal.includes('"' + LED_GEN_HAL.tag + '"'), '带契约标识串 ' + LED_GEN_HAL.tag);
ok(hal.includes('LED_GEN_HAL_IMPLEMENTS') && /#error/.test(hal),
   '带编译期版本校验：平台断言 LED_GEN_HAL_IMPLEMENTS，不一致就 #error');
ok(new RegExp('#define LED_GEN_TICK_MS\\s+' + LED_GEN_HAL.tick_ms).test(hal),
   '带调用周期 LED_GEN_TICK_MS = ' + LED_GEN_HAL.tick_ms);

/* ---------- 2) 契约：平台要实现的函数一个不少 ---------- */
console.log('--- 2) 契约清单（平台实现 + 平台调用） ---');
for (const f of LED_GEN_HAL.proto) ok(new RegExp('\\b' + f + '\\s*\\(').test(hal), '声明了平台要实现/实现的 ' + f);
for (const f of LED_GEN_HAL.entry) ok(new RegExp('\\b' + f + '\\s*\\(').test(hal), '声明了平台要调用的 ' + f);
ok(/led_gen_hal_present\(const uint8_t \*fb, uint16_t led_count\)/.test(hal),
   '帧缓冲约定写在签名里（fb 3 字节/灯 + 灯数）');

/* ---------- 3) 契约 ↔ 文档 双向一致 ---------- */
console.log('--- 3) 文档漂移守卫：契约与 docs/firmware-contract.md 对得上 ---');
ok(doc.includes(LED_GEN_HAL.tag), '文档里有契约标识串 ' + LED_GEN_HAL.tag);
ok(doc.includes('LED_GEN_HAL_VERSION') && doc.includes('LED_GEN_HAL_IMPLEMENTS'),
   '文档里写了版本宏与平台侧断言的用法');
LED_GEN_HAL.proto.forEach(f => ok(doc.includes(f), '文档「平台实现」表里有 ' + f));
LED_GEN_HAL.entry.forEach(f => ok(doc.includes(f), '文档里写了引擎入口 ' + f));
ok(doc.includes('led_gen_hal.h'), '文档里点名了产物文件名 led_gen_hal.h');

/* ---------- 4) 现状账本：耦合不许悄悄变多（② 完成后清零） ---------- */
console.log('--- 4) 附录 A 账本：现有导出物的平台耦合 ---');
const gen = exportEffectsC(st, { form: 'header', comment: 'ascii', eol: 'lf' });
if (LEDGER.length) {
  const gone = LEDGER.filter(s => !word(s).test(gen));
  ok(gone.length === 0, gone.length ? '账本虚记（导出物里已经没有这些了，请同步账本与文档）: ' + gone.join(' ')
                                    : `账本 ${LEDGER.length} 条逐条仍在导出物里（还没到自洽化那一步）`);
} else {
  ok(true, '账本为空：导出物已与平台解耦（引擎自洽）');
}
{
  const extras = scan(gen).filter(s => !LEDGER.includes(s));
  ok(extras.length === 0, extras.length
     ? '导出物里冒出账本之外的平台符号（要么同步账本 + 文档，要么这一步就是新增耦合）: ' + extras.join(' ')
     : '扫描没有再发现账本之外的平台符号');
}
if (LEDGER.length) {
  LEDGER.forEach(s => ok(doc.includes(s), '附录 A 账本逐条出现在文档里: ' + s));
} else {
  ok(doc.includes(EMPTY_MARK), '账本为空时文档用「' + EMPTY_MARK + '」标注');
}


/* ---------- 5) 真编译：平台照契约实现就能编过；版本不符必须编不过 ---------- */
console.log('--- 5) 真编译：HAL 头可被平台实现 + 版本守卫生效 ---');
const CYG = 'C:/Andestech/AndeSight_RDS_v323/cygwin/bin';
const GCC = CYG + '/gcc.exe';
const ENV = Object.assign({}, process.env, { PATH: CYG + ';' + process.env.PATH });
const dir = path.join('tests', '.build', 'hal');
if (!fs.existsSync(GCC)) {
  console.log('  · SKIP 真编译（没找到 ' + GCC + '）—— 上面那些静态断言已经覆盖契约本身');
} else {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'led_gen_hal.h'), hal);
  /* 平台侧参考实现：只实现 HAL，引擎由工具生成（这里用桩代替） */
  fs.writeFileSync(path.join(dir, 'port.c'), [
    '#define LED_GEN_HAL_IMPLEMENTS ' + LED_GEN_HAL.version + '   /* 平台声明自己实现的契约版本 */',
    '#include "led_gen_hal.h"',
    '#include <string.h>',
    'static uint8_t g_fb[16 * 3];',
    'static uint8_t g_frames;',
    'uint8_t led_gen_hal_frames(void);',
    'void led_gen_hal_present(const uint8_t *fb, uint16_t led_count)',
    '{ g_frames++; if (led_count <= 16u) memcpy(g_fb, fb, (size_t)led_count * 3u); }',
    'uint8_t led_gen_hal_audio_level(void) { return 0u; }',
    'uint16_t led_gen_hal_brightness(void) { return 256u; }',
    'uint8_t led_gen_hal_zone_enable(uint8_t zone_idx) { (void)zone_idx; return 1u; }',
    'uint32_t led_gen_hal_millis(void) { return 0u; }',
    'uint8_t led_gen_hal_frames(void) { return g_frames; }',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'engine_stub.c'), [
    '/* 引擎侧桩：契约里平台只需要调这两个入口（真引擎由工具导出） */',
    '#include "led_gen_hal.h"',
    'void led_gen_apply_mode(uint8_t mode_idx) { (void)mode_idx; }',
    'void led_gen_tick(void) { static uint8_t f[16 * 3]; f[0]++; led_gen_hal_present(f, 16u); }',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'main.c'), [
    '#include <stdio.h>',
    '#include "led_gen_hal.h"',
    'uint8_t led_gen_hal_frames(void);',
    'int main(void) {',
    '    uint8_t i;',
    '    led_gen_apply_mode(0u);',
    '    for (i = 0u; i < 3u; i++) led_gen_tick();',
    '    printf("HAL_OK frames=%u audio=%u bri=%u zone=%u ms=%u\\n",',
    '           (unsigned)led_gen_hal_frames(), (unsigned)led_gen_hal_audio_level(),',
    '           (unsigned)led_gen_hal_brightness(), (unsigned)led_gen_hal_zone_enable(0u),',
    '           (unsigned)led_gen_hal_millis());',
    '    return 0;',
    '}',
  ].join('\n'));

  let built = true, msg = '';
  try {
    execFileSync(GCC, ['-O0', '-w', '-o', path.join(dir, 'hal.exe'),
                       path.join(dir, 'main.c'), path.join(dir, 'port.c'),
                       path.join(dir, 'engine_stub.c'), '-I', dir], { env: ENV, stdio: 'pipe' });
  } catch (e) { built = false; msg = String(e.stderr || e.message).split('\n').slice(0, 6).join('\n    '); }
  ok(built, built ? '平台照契约实现那 5 个函数后编译通过（真编译器）' : '编译失败:\n    ' + msg);
  if (built) {
    const out = execFileSync(path.join(dir, 'hal.exe'), { env: ENV, encoding: 'utf8' });
    ok(/HAL_OK frames=3/.test(out), '真跑起来：tick 推进 → HAL 收到 3 帧（' + out.trim() + '）');
  }

  /* 反向：平台声明的版本与工具契约不符 → 必须编不过（编译期守卫不是摆设） */
  fs.writeFileSync(path.join(dir, 'port_bad.c'), [
    '#define LED_GEN_HAL_IMPLEMENTS ' + (LED_GEN_HAL.version + 1),
    '#include "led_gen_hal.h"',
    'uint8_t led_gen_hal_audio_level(void) { return 0u; }',
  ].join('\n'));
  let badBuilt = false, badMsg = '';
  try {
    execFileSync(GCC, ['-O0', '-w', '-c', '-o', path.join(dir, 'port_bad.o'),
                       path.join(dir, 'port_bad.c'), '-I', dir], { env: ENV, stdio: 'pipe' });
    badBuilt = true;
  } catch (e) { badMsg = String(e.stderr || e.message); }
  ok(!badBuilt && /led_gen: platform HAL version/.test(badMsg),
     !badBuilt ? '平台声明的版本与工具不符时编译期就报错（#error 生效）'
               : '版本不符竟然编过了 —— 守卫失效');
}

console.log(fails ? `\n=== ${fails} 项未通过 ===` : '\n=== 全部通过 ===');
process.exit(fails ? 1 : 0);
