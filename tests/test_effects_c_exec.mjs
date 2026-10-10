/* ============================================================================
 * 生成的 C 到底和预览的 JS 一不一样？—— 真编译、真运行、整个 fb 逐字节比对
 *
 * 用 AndeSight 自带的 cygwin gcc（把它的 bin 加进 PATH 就能在本机跑）。
 * 因为生成代码要调固件里的类型和几个函数，这里配一个最小桩 led_ring.h：
 * 只提供它真正引用的东西，且数值（cos_window_tbl / spectrum_tbl / 常量）
 * 从工具里取，保证两侧一致。
 * ==========================================================================*/
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const html = fs.readFileSync('led_layout_editor.html', 'utf8');
const CORE = new Function(html.match(/<script id="core">([\s\S]*?)<\/script>/)[1] + '\n; return CORE;')();
const { FW, projectFromPreset, PRESET_SP3122D, newCustomEffect, exportEffectsC,
        simInit, simApplyMode, simSetSpeed, simTick, genRender } = CORE;

let fails = 0;
const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fails++; };
const CYG = 'C:/Andestech/AndeSight_RDS_v323/cygwin/bin';
const GCC = CYG + '/gcc.exe';
const ENV = Object.assign({}, process.env, { PATH: CYG + ';' + process.env.PATH });

/* ---------- 1) 造工程：5 个分区，3 个模式，全是自定义效果 ---------- */
const st = projectFromPreset(PRESET_SP3122D);
const effs = [];
function mkFx(i, layerSets) {
  const e = newCustomEffect(i, 'FX' + i);
  e.latin = 'FX' + i;
  e.layers = layerSets;
  effs.push(e);
  return e;
}
const A = mkFx(0, [{ kind:'spot', count:1, width:10, phase:0, falloff:'cos', pulse_period:0, pulse_amp:0,
                     wave:0, direction:1, bounce:0, cmode:0, hue_base:0, hue_spread:0, hue_speed:0, spans:0, rotate:0 }]);
const B = mkFx(1, [{ kind:'fill', level:255, pulse_period:60, pulse_amp:255, wave:0, direction:1, bounce:0,
                     cmode:1, hue_base:0, hue_spread:255, hue_speed:2, spans:0, rotate:0 }]);
const C = mkFx(2, [{ kind:'twinkle', density:60, rate:3, lo:0, hi:255, cmode:1, hue_base:0, hue_spread:255,
                     hue_speed:6, pulse_period:0, pulse_amp:0, wave:0, direction:1, bounce:0, spans:0, rotate:0 },
                   { kind:'spot', count:2, width:8, phase:64, falloff:'tail', pulse_period:0, pulse_amp:0,
                     wave:0, direction:1, bounce:1, cmode:0, hue_base:0, hue_spread:0, hue_speed:0, spans:0, rotate:0 }]);
st.effects = { version: 1, list: effs };
st.modes = { version: 1, list: [
  { id:'mA', name:'全环追逐', latin:'ALL_CHASE', enabled:true,
    binds:[{ effect:A.id, zones:[] }] },
  { id:'mB', name:'分区各跑各的', latin:'PER_ZONE', enabled:true,
    binds:[{ effect:A.id, zones:[0,1] }, { effect:B.id, zones:[2] },
           { effect:C.id, zones:[3,4] }] },
  { id:'mC', name:'同步 + 叠加', latin:'SYNC_MIX', enabled:true,
    binds:[{ effect:C.id, zones:[0,1,2,3,4] }] },
] };

/* ---------- 2) 桩 led_ring.h ---------- */
const dir = path.join('tests', '.build');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'led_effects_gen.h'), exportEffectsC(st, { form:'header', comment:'ascii', eol:'lf' }));

const stub = [
  '#ifndef __LED_RING_H__',
  '#define __LED_RING_H__',
  '#include <stdint.h>',
  '#include <stdbool.h>',
  '#include <string.h>',
  'typedef struct { uint8_t r, g, b; } rgb_t;',
  'typedef struct { uint8_t start, count, reverse; } led_zone_t;',
  'typedef struct { int16_t current, from, target; uint16_t duration, elapsed; uint8_t ease_type; bool running; } anim_t;',
  'typedef struct { uint8_t light_width, gap; bool direction; } anim_params_t;',
  'typedef enum { ANIM_CHASE_SINGLE=0, ANIM_CHASE_DUAL, ANIM_SWING, ANIM_FILL, ANIM_STATIC, ANIM_TYPE_COUNT } anim_type_t;',
  'typedef enum { COLOR_SOLID=0, COLOR_SPECTRUM, COLOR_GRADIENT } color_type_t;',
  'typedef enum { EASE_LINEAR=0, EASE_OUT_QUAD, EASE_IN_OUT_QUAD } ease_type_t;',
  '#define RING_SIZE ' + FW.RING_SIZE,
  '#define LED_COUNT ' + FW.LED_COUNT,
  '#define ZONE_MAX_LEN ' + FW.ZONE_MAX_LEN,
  '#define ZONE_MAX ' + FW.ZONE_MAX,
  'typedef struct { uint8_t type; anim_t position; anim_params_t params; uint8_t mask[ZONE_MAX_LEN]; uint16_t gen_tick; } anim_ctx_t;',
  'typedef struct { uint8_t type; rgb_t current, secondary; anim_t phase; uint8_t tick_cnt, spectrum_speed; } color_ctx_t;',
  /* ring 级速度档：固件 led_ring.h 里本来就有这三个字段（led_ring.c ring_init: 8/1/8），
   * 由 ring_set_audio_level() 按音量改 speed_cur —— 生成代码要从这里读档位信号 */
  'typedef struct { anim_ctx_t anim; color_ctx_t color; uint8_t bri; uint8_t speed_slow, speed_fast, speed_cur; led_zone_t zones[ZONE_MAX]; uint8_t zone_count; bool zone_en[ZONE_MAX]; uint8_t fb[LED_COUNT][3]; } ring_t;',
  'static const uint8_t cos_window_tbl[256] = {',
  '    ' + Array.from(FW.cos_window_tbl).join(','),
  '};',
  'static const rgb_t spectrum_tbl[256] = {',
  '    ' + Array.from(FW.spectrum_tbl).map(c => '{' + c.r + ',' + c.g + ',' + c.b + '}').join(','),
  '};',
  /* 固件里这几个是 static，桩里给最小实现；本测试的效果全是自定义图层，
   * 走不到内建分支，所以这里只需要能编译 */
  'static void anim_set(anim_t *a, int16_t target, uint16_t dur, uint8_t ease)',
  '{ a->from = a->current; a->target = target; a->duration = dur; a->elapsed = 0;',
  '  a->ease_type = ease; a->running = (dur > 0u && a->from != a->target); }',
  'static const uint8_t ease_out_quad_tbl[256] = {',
  '    ' + Array.from(FW.ease_out_quad_tbl).join(','),
  '};',
  'static int16_t anim_update(anim_t *a)',
  '{ int16_t d; uint8_t t, et;',
  '  if (!a->running) return a->current;',
  '  if (a->duration == 0u) { a->current = a->target; a->running = false; return a->current; }',
  '  a->elapsed++;',
  '  if (a->elapsed >= a->duration) { a->current = a->target; a->running = false; return a->current; }',
  '  t = (uint8_t)(((uint16_t)a->elapsed * 255u) / a->duration);',
  '  switch (a->ease_type) {',
  '    case EASE_OUT_QUAD: et = ease_out_quad_tbl[t]; break;',
  '    case EASE_IN_OUT_QUAD:',
  '      if (t < 128u) et = (uint8_t)((255u - ease_out_quad_tbl[255u - t * 2u]) / 2u);',
  '      else          et = (uint8_t)(128u + ease_out_quad_tbl[(t - 128u) * 2u] / 2u);',
  '      break;',
  '    default: et = t; break;',
  '  }',
  '  d = (int16_t)(a->target - a->from);',
  '  a->current = (int16_t)(a->from + (int16_t)(((int32_t)d * et) >> 8));',
  '  return a->current; }',
  'static void color_update(color_ctx_t *c)',
  '{ if (c->type == COLOR_SOLID) return;',
  '  if (++c->tick_cnt >= c->spectrum_speed) { c->tick_cnt = 0; c->phase.current = (int16_t)((c->phase.current + 1) & 0xFF); }',
  '  c->current = spectrum_tbl[(uint8_t)c->phase.current];',
  '  if (c->type == COLOR_GRADIENT) c->secondary = spectrum_tbl[(uint8_t)(c->phase.current + 85)]; }',
  'static void ring_set_position(ring_t *r, uint16_t pos, uint16_t dur, uint8_t ease)',
  '{ r->anim.position.target = (int16_t)(pos % (uint16_t)(RING_SIZE * 256)); anim_set(&r->anim.position, r->anim.position.target, dur, ease); }',
  'static void anim_render_chase_single(uint8_t *m, uint8_t len, int16_t pos, uint8_t w) { (void)pos; (void)w; memset(m, 128, len); }',
  'static void anim_render_chase_dual(uint8_t *m, uint8_t len, int16_t pos, uint8_t w, uint8_t g) { (void)pos;(void)w;(void)g; memset(m, 128, len); }',
  'static void anim_render_swing(uint8_t *m, uint8_t len, int16_t pos, uint8_t w, bool d) { (void)pos;(void)w;(void)d; memset(m, 128, len); }',
  'static void anim_render_fill(uint8_t *m, uint8_t len, int16_t lvl, bool d) { (void)lvl;(void)d; memset(m, 128, len); }',
  '#endif',
].join('\n');
fs.writeFileSync(path.join(dir, 'led_ring.h'), stub);

/* ---------- 3) 主程序：每个模式各跑 N 帧，打印整个 fb ---------- */
const TICKS = 37;
const HALF_TICK = Math.floor(TICKS / 2);   /* 音量档场景：前一半慢档、后一半快档 */
const main = [
  '#include <stdio.h>',
  '#include <stdint.h>',
  '#include <string.h>',
  '#define LED_EFFECTS_GEN_RENDER 1',
  '#include "led_effects_gen.h"',
  'static ring_t g_ring;',
  'static const led_zone_t Z[] = {{0,8,0},{8,8,0},{16,40,0},{56,24,1},{80,24,1}};',
  'int main(void) {',
  '    uint8_t m, i, t;',
  '    led_gen_inst_t *unused; (void)unused;',
  '    for (m = 0; m < LED_GEN_MODE_COUNT; m++) {',
  '        memset(&g_ring, 0, sizeof(g_ring));',
  '        memcpy(g_ring.zones, Z, sizeof(Z));',
  '        g_ring.zone_count = 5;',
  '        for (i = 0; i < ZONE_MAX; i++) g_ring.zone_en[i] = true;',
  '        g_ring.brightness.current = 256;',
  '        led_gen_apply_mode(&g_ring, m);',
  '        for (t = 0; t < ' + TICKS + '; t++) led_gen_tick(&g_ring);',
  '        led_gen_render_mode(&g_ring);',
  '        for (i = 0; i < LED_COUNT; i++)',
  '            printf("%u,%u,%u ", (unsigned)g_ring.fb[i][0], (unsigned)g_ring.fb[i][1], (unsigned)g_ring.fb[i][2]);',
  '        printf("|");',
  '    }',
  /* 音量档场景：同一模式，前一半拍慢档、后一半拍快档。
   * 对应固件 spimled_service.c 每 20ms 调 ring_set_audio_level() 改 ring->speed_cur —— 生成代码从 ring 级读档位。 */
  '    memset(&g_ring, 0, sizeof(g_ring));',
  '    memcpy(g_ring.zones, Z, sizeof(Z));',
  '    g_ring.zone_count = 5;',
  '    for (i = 0; i < ZONE_MAX; i++) g_ring.zone_en[i] = true;',
  '    g_ring.brightness.current = 256;',
  '    g_ring.speed_slow = 8;',
  '    g_ring.speed_fast = 1;',
  '    led_gen_apply_mode(&g_ring, 1);',
  '    for (t = 0; t < ' + TICKS + '; t++) {',
  '        g_ring.speed_cur = (t < ' + HALF_TICK + ') ? g_ring.speed_slow : g_ring.speed_fast;',
  '        led_gen_tick(&g_ring);',
  '    }',
  '    led_gen_render_mode(&g_ring);',
  '    for (i = 0; i < LED_COUNT; i++)',
  '        printf("%u,%u,%u ", (unsigned)g_ring.fb[i][0], (unsigned)g_ring.fb[i][1], (unsigned)g_ring.fb[i][2]);',
  '    printf("|");',
  /* 对照：同一模式、同样帧数，全程慢档 —— 用来证明「切到快档」帧序列真的变了 */
  '    memset(&g_ring, 0, sizeof(g_ring));',
  '    memcpy(g_ring.zones, Z, sizeof(Z));',
  '    g_ring.zone_count = 5;',
  '    for (i = 0; i < ZONE_MAX; i++) g_ring.zone_en[i] = true;',
  '    g_ring.brightness.current = 256;',
  '    g_ring.speed_slow = 8;',
  '    g_ring.speed_fast = 1;',
  '    g_ring.speed_cur = 8;',
  '    led_gen_apply_mode(&g_ring, 1);',
  '    for (t = 0; t < ' + TICKS + '; t++) led_gen_tick(&g_ring);',
  '    led_gen_render_mode(&g_ring);',
  '    for (i = 0; i < LED_COUNT; i++)',
  '        printf("%u,%u,%u ", (unsigned)g_ring.fb[i][0], (unsigned)g_ring.fb[i][1], (unsigned)g_ring.fb[i][2]);',
  '    printf("|");',

  '    printf("\\n");',
  '    return 0;',
  '}',
].join('\n');
/* 桩里的 ring_t 没有 brightness 成员，补一个同名字段 */
fs.writeFileSync(path.join(dir, 'main.c'), main);

/* 修：桩的 ring_t 用 bri 占位，这里改成 brightness */
let stub2 = fs.readFileSync(path.join(dir, 'led_ring.h'), 'utf8');
stub2 = stub2.replace('uint8_t bri;', 'anim_t brightness;');
fs.writeFileSync(path.join(dir, 'led_ring.h'), stub2);

let compiled = true, msg = '';
try {
  execFileSync(GCC, ['-O0', '-w', '-o', path.join(dir, 'gen.exe'), path.join(dir, 'main.c'), '-I', dir], { env: ENV, stdio: 'pipe' });
} catch (e) { compiled = false; msg = String(e.stderr || e.message).split('\n').slice(0, 8).join('\n    '); }
ok(compiled, compiled ? '生成的 C 用 gcc 编译通过（真编译器）' : '编译失败:\n    ' + msg);
if (!compiled) { console.log('\n=== 中止 ==='); process.exit(1); }

const out = execFileSync(path.join(dir, 'gen.exe'), { env: ENV, encoding: 'latin1' });
const cModes = out.trim().split('|').filter(s => s.trim().length)
  .map(s => s.trim().split(/\s+/).map(trip => trip.split(',').map(Number)));
const cAll = cModes.length;            /* C 侧输出段数 = 模式数 + 2 段音量档场景 */
const cAux = cModes.slice(st.modes.list.length);   /* 第 4 段 = 音量档场景，第 5 段 = 全程慢档对照 */
cModes.length = st.modes.list.length;  /* 原地裁短成"模式段"，后面按模式逐个比对 */
ok(cAll === st.modes.list.length + 2, `C 侧输出 ${cAll} 段（${st.modes.list.length} 个模式 + 2 段音量档场景）`);

/* ---------- 4) JS 侧算同样的东西 ---------- */
let bad = 0, firstBad = null;
st.modes.list.forEach((mode, mi) => {
  const s2 = JSON.parse(JSON.stringify(st));
  s2.anim.modeId = mode.id;
  const sim = simInit();
  simApplyMode(sim, s2);
  simSetSpeed(sim, 'slow');
  for (let t = 0; t < TICKS; t++) simTick(sim, s2, false);
  const cf = cModes[mi] || [];
  for (let i = 0; i < FW.LED_COUNT; i++) {
    const j = sim.fb[i * 3], k = sim.fb[i * 3 + 1], l = sim.fb[i * 3 + 2];
    if (!cf[i] || cf[i][0] !== j || cf[i][1] !== k || cf[i][2] !== l) {
      bad++;
      if (!firstBad) firstBad = { mode: mi, led: i, c: cf[i], js: [j, k, l] };
      break;
    }
  }
});
ok(bad === 0, bad === 0
   ? `${st.modes.list.length} 个模式 × ${TICKS} 帧，整个 104 灯 fb 与 JS 预览逐字节一致`
   : `${bad}/${st.modes.list.length} 个模式不一致，首例: ${JSON.stringify(firstBad)}`);

/* ---------- 5) 音量档：C 侧每拍从 ring 级同步档位，与 JS 预览逐字节一致 ----------
 * 固件链路：spimled_service.c 每 20ms 调 ring_set_audio_level() → 改 ring->speed_cur；
 * 生成代码在 led_gen_tick() 里把 ring 级档位同步进每个实例（各效果仍用自己的 fast/slow）。 */
{
  const sA = JSON.parse(JSON.stringify(st));
  sA.anim.modeId = st.modes.list[1].id;
  const simA = simInit();
  simApplyMode(simA, sA);
  for (let t = 0; t < TICKS; t++) {
    simSetSpeed(simA, t < HALF_TICK ? 'slow' : 'fast');   /* 与 C 侧同一驱动时序 */
    simTick(simA, sA, false);
  }
  const fa = cAux[0] || [];
  let badA = 0, firstA = null;
  for (let i = 0; i < FW.LED_COUNT; i++) {
    const j = simA.fb[i * 3], k = simA.fb[i * 3 + 1], l = simA.fb[i * 3 + 2];
    if (!fa[i] || fa[i][0] !== j || fa[i][1] !== k || fa[i][2] !== l) {
      badA++;
      if (!firstA) firstA = { led: i, c: fa[i], js: [j, k, l] };
      break;
    }
  }
  ok(badA === 0, badA === 0
     ? `音量档：前 ${HALF_TICK} 拍慢档 + 后 ${TICKS - HALF_TICK} 拍快档，C 侧与 JS 逐字节一致`
     : `音量档不一致，首例: ${JSON.stringify(firstA)}`);

  const moved = JSON.stringify(cAux[0]) !== JSON.stringify(cAux[1]);
  ok(moved, moved
     ? '切到快档后帧序列确实变了（有声音时会变快，不是永远停在慢档）'
     : '切档没生效：快档段的 fb 与全程慢档一模一样');
}

/* 覆盖度自检 */
let lit = 0, hueUsed = 0;
cModes.forEach(f => f.forEach(px => { if (px[0] + px[1] + px[2] > 0) lit++; }));
ok(lit > 0, `C 侧确实点亮了 ${lit} 个灯位（不是一片黑）`);
const kinds = new Set();
st.effects.list.forEach(e => e.layers.forEach(l => kinds.add(l.kind)));
ok(kinds.size >= 3, `覆盖了 ${kinds.size} 种图层 (${[...kinds].join(',')})`);

console.log(fails ? `\n=== ${fails} 项未通过 ===` : '\n=== 全部通过 ===');
process.exit(fails ? 1 : 0);
