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
const { FW, projectFromPreset, PRESET_SP3122D, newCustomEffect, defaultEffects, exportEffectsC,
        simInit, simApplyMode, simSetSpeed, simSetAudioLevel, fftThreshold, simTick, genRender } = CORE;

let fails = 0;
const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fails++; };
const CYG = 'C:/Andestech/AndeSight_RDS_v323/cygwin/bin';
const GCC = CYG + '/gcc.exe';
const ENV = Object.assign({}, process.env, { PATH: CYG + ';' + process.env.PATH });

/* ---------- 1) 造工程：5 个分区，4 个模式（3 个自定义 + 1 个内建） ---------- */
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
                     wave:0, direction:1, bounce:1, cmode:0, hue_base:0, hue_spread:0, hue_speed:0, spans:0, rotate:0 },
                   /* F5: 第 3 层是旁路的（en=0）—— 写进 C 表但合成时跳过。
                      若哪一侧忘了跳，下面「逐字节一致」立刻就会发现（它会把暗灯拉到 220）。 */
                   { kind:'fill', level:220, pulse_period:0, pulse_amp:0, wave:0, direction:1, bounce:0,
                     cmode:0, hue_base:0, hue_spread:0, hue_speed:0, spans:0, rotate:0, en:0 }]);
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

/* 第 4 个模式绑**内建**单点追逐：光带由生成代码自画（平顶），平台那个
 * anim_render_chase_single() 桩里被做成「一被调就 abort」——
 * 下面那份逐字节比对同时也把「不再调平台原语」钉死。 */
const builtin = JSON.parse(JSON.stringify(defaultEffects().list[0]));
builtin.id = 'eB';
effs.push(builtin);                       /* st.effects.list 就是 effs 本身 */
st.modes.list.push({ id:'mD', name:'内建单点追逐', latin:'BUILTIN_CHASE', enabled:true,
                     binds:[{ effect:builtin.id, zones:[] }] });

/* ---------- 3) 新配色模式：彩虹 / 跳变 / 呼吸 / 覆盖（JS ↔ C 逐字节） ---------- */
const LAYER_FILL = { kind:'fill', level:255, pulse_period:0, pulse_amp:0, wave:0,
                     direction:1, bounce:0, cmode:0, hue_base:0, hue_spread:0,
                     hue_speed:0, spans:0, rotate:0 };
const RAIN = mkFx(3, [Object.assign({}, LAYER_FILL)]);
RAIN.color = CORE.FW.COLOR.RAINBOW; RAIN.levels = 30; RAIN.hue_base = 0; RAIN.hue_speed = 3;
const STEP = mkFx(4, [Object.assign({}, LAYER_FILL)]);
STEP.color = CORE.FW.COLOR.STEP; STEP.speed = 5;
/* 亮 1 拍 / 暗 4 拍：37 拍落在第 2 拍（停留 5），包络应该已经降到 170 */
STEP.hold = 1; STEP.fade = 4;
STEP.palette = [[255,0,0],[0,255,0],[0,0,255],[255,255,0]];
STEP.c1 = STEP.palette[0].slice(); STEP.c2 = STEP.palette[1].slice();
const B2 = mkFx(5, [Object.assign({}, LAYER_FILL)]);
B2.color = CORE.FW.COLOR.BREATH; B2.period = 12;
B2.palette = [[255,0,0],[0,255,0],[0,0,255]];
B2.c1 = B2.palette[0].slice(); B2.c2 = B2.palette[1].slice();
const WIP = mkFx(6, [Object.assign({}, LAYER_FILL)]);
WIP.color = CORE.FW.COLOR.WIPE; WIP.period = 10;
WIP.palette = [[0,0,255],[255,120,0]];
WIP.c1 = WIP.palette[0].slice(); WIP.c2 = WIP.palette[1].slice();
/* 渐亮跳变：渐亮 3 / 亮 1 / 暗 2 = 停留 6 —— 37 拍落在第 1 拍，包络应该正爬到 170。
 * 这一条专门让生成代码里的「渐亮段」真跑一遍（老存档不存 rise 时永远走不到那一支）。 */
const RISE = mkFx(7, [Object.assign({}, LAYER_FILL)]);
RISE.color = CORE.FW.COLOR.STEP;
RISE.rise = 3; RISE.hold = 1; RISE.fade = 2; RISE.speed = 6;
RISE.palette = [[255,0,0],[0,255,0]];
RISE.c1 = RISE.palette[0].slice(); RISE.c2 = RISE.palette[1].slice();
st.modes.list.push({ id:'mE', name:'新配色', latin:'NEW_COLORS', enabled:true,
  binds:[ { effect:RAIN.id, zones:[0] }, { effect:STEP.id, zones:[1] },
          { effect:B2.id,   zones:[2] }, { effect:WIP.id,  zones:[3] },
          { effect:A.id,    zones:[4] } ] });
st.modes.list.push({ id:'mF', name:'渐亮跳变', latin:'STEP_RISE', enabled:true,
                     binds:[{ effect:RISE.id, zones:[] }] });
/* 渐变步进：速度 = 1（每拍动一次）、步进 = 8（一次走 8 级）。
 * 生成代码里那句「每拍 +grad_step」就是靠这一条真跑一遍 —— 老写法（写死 +1）在这里相位只有 37。 */
const GSTEP = mkFx(8, [Object.assign({}, LAYER_FILL)]);
GSTEP.color = CORE.FW.COLOR.SPECTRUM;
GSTEP.speed = 1; GSTEP.grad_step = 8;
st.modes.list.push({ id:'mG', name:'渐变步进', latin:'GRAD_STEP', enabled:true,
                     binds:[{ effect:GSTEP.id, zones:[] }] });
/* 渐变条目 + 覆盖灯数：上面那条 WIP 是「两个纯色条目、整条」，这条把「扫到渐变条目」和
 * 「只有前 12 颗参与」也真跑一遍 —— 逐字节比对同时守着 JS 与生成的 C 在
 * 「按条目取两端色 / 铺位置渐变」这条路径上完全一致。
 * 37 拍 → 第 4 趟 → 盖条目 (3+1) % 3 = 1（[橙 → 绿] 的渐变条目）。 */
const WGR = mkFx(9, [Object.assign({}, LAYER_FILL)]);
WGR.color = CORE.FW.COLOR.WIPE; WGR.period = 10;
WGR.cover_span = 12;
WGR.palette = [[0,0,255],[255,120,0, 0,255,0],[255,0,255]];
WGR.c1 = WGR.palette[0].slice(); WGR.c2 = WGR.palette[1].slice(0, 3);
st.modes.list.push({ id:'mH', name:'渐变覆盖', latin:'WIPE_GRAD', enabled:true,
                     binds:[{ effect:WGR.id, zones:[] }] });
/* 覆盖方向 = 单向 + 渐变条目：37 拍 = 第 4 趟 → 盖的也是条目 1（渐变）。
 * 单向所以这一趟从第 1 颗开始扫 —— 第 1 颗正好是本轮渐变的起点（橙）；
 * 往返的话第 1 颗会停在上一趟的条目上。生成代码里 oneway 那一支靠它跑。 */
const WONE = mkFx(10, [Object.assign({}, LAYER_FILL)]);
WONE.color = CORE.FW.COLOR.WIPE; WONE.period = 10;
WONE.cover_dir = 1;
WONE.palette = [[0,0,255],[255,120,0, 0,255,0],[255,0,255]];
WONE.c1 = WONE.palette[0].slice(); WONE.c2 = WONE.palette[1].slice(0, 3);
st.modes.list.push({ id:'mI', name:'单向渐变覆盖', latin:'WIPE_ONE', enabled:true,
                     binds:[{ effect:WONE.id, zones:[] }] });
/* 多色覆盖：调色板 4 个纯色条目 —— 第 r 趟盖条目 (r+1) % 4。
 * 37 拍 → 第 3 趟（0 起 3）→ 盖条目 0；生成代码里「按趟取条目」那一支靠它跑。 */
const W4 = mkFx(11, [Object.assign({}, LAYER_FILL)]);
W4.color = CORE.FW.COLOR.WIPE; W4.period = 10;
W4.palette = [[0,0,255],[255,120,0],[0,255,0],[255,0,255]];
W4.c1 = W4.palette[0].slice(); W4.c2 = W4.palette[1].slice();
st.modes.list.push({ id:'mJ', name:'多色覆盖', latin:'WIPE_MULTI', enabled:true,
                     binds:[{ effect:W4.id, zones:[] }] });
/* 光点间距：3 个点、固定中心距 4 颗（均布的话 24 灯是 8 颗，两者渲染差别很大）。
 * 各分区长度不同（8 / 24 / 104），顺手把「按 RING_SIZE 等比缩放」那一支也跑一遍，
 * 生成代码与预览必须逐字节一致。 */
const ASPACE = mkFx(12, [{ kind:'spot', count:3, width:2, phase:0, falloff:'cos', spacing:4,
                           pulse_period:0, pulse_amp:0, wave:0, direction:1, bounce:0, spans:0, rotate:0 }]);
st.modes.list.push({ id:'mK', name:'光点间距', latin:'SPOT_SPACING', enabled:true,
                     binds:[{ effect:ASPACE.id, zones:[] }] });
/* 往返长跑：一个余弦光点、勾了「走到头折返」。专门用来跨过环的接缝 ——
 * 24 颗环、慢档 8 拍/颗 = 192 拍一圈，下面 C 侧跑 240 拍，正好走完一圈再倒着走 5 颗。
 * 生成代码里「整圈数取奇偶」（I->lap）就靠这一段真跑一遍：不翻的话两侧会差出半圈。 */
const BOUNCE = mkFx(13, [{ kind:'spot', count:1, width:4, phase:0, falloff:'cos', spacing:0,
                           pulse_period:0, pulse_amp:0, wave:0, direction:1, bounce:1, spans:0, rotate:0 }]);
st.modes.list.push({ id:'mL', name:'往返长跑', latin:'BOUNCE_LONG', enabled:true,
                     binds:[{ effect:BOUNCE.id, zones:[] }] });
/* 音控闪（预置「闪烁」）：填充层 wave = 3（FLASH）、没音乐 250 拍 = 5000 ms、有音乐 25 拍 = 500 ms、
 * 每次亮 10 拍 = 200 ms；最高亮度 200 / 最低亮度 50 —— 亮的时候 200、灭的时候 50（不是 0），
 * 这样「最低亮度填的是亮度本身、内部按 level 反算增益」那一步在 C 侧也真跑一遍。
 * 生成代码里那几个字节的实例状态（flash_age / loud_prev / flash_gain）只有这一段才真跑。 */
const BLINK = mkFx(14, [{ kind:'fill', level:200, pulse_period:250, wave:3,
                          flash_fast:25, flash_on:10, flash_low:50,
                          direction:1, bounce:0, spans:0, rotate:0 }]);
st.modes.list.push({ id:'mM', name:'音控闪', latin:'AUDIO_FLASH', enabled:true,
                     binds:[{ effect:BLINK.id, zones:[] }] });
/* 长间隔闪：没音乐 400 拍 = 8 秒一次（**超过 255** → 这一列在 C 结构体里必须是 uint16）。
 * 下面 C 侧同一条「全程安静」的跑法跑 405 拍：第 400 拍该再闪一次，405 拍正落在那次闪的
 * 第 5 拍上 = 亮。老 uint8 写法会把 400 截成 144（两次闪落在 144 / 288），405 拍早暗了 ——
 * 逐字节比对与亮度断言两边都会立刻报错。 */
const BLINK_LONG = mkFx(15, [{ kind:'fill', level:200, pulse_period:400, wave:3,
                               flash_fast:0, flash_on:10, flash_low:50,
                               direction:1, bounce:0, spans:0, rotate:0 }]);
st.modes.list.push({ id:'mN', name:'长间隔闪', latin:'AUDIO_FLASH_LONG', enabled:true,
                     binds:[{ effect:BLINK_LONG.id, zones:[] }] });

/* ---------- 2) 桩 led_ring.h ---------- */
const dir = path.join('tests', '.build', 'exec');
fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
fs.mkdirSync(dir, { recursive: true });
/* 阈值是**工程里的设置**，随导出写进 C —— 这里刻意不用出厂 4，改成 12，
 * 后面那段「音量 10（>4 但 <12）」就能证明 C 用的是导出的阈值，不是写死的 4。 */
st.anim = Object.assign({}, st.anim || {}, { thr: 12 });
fs.writeFileSync(path.join(dir, 'led_effects_gen.h'), exportEffectsC(st, { form:'header', comment:'ascii', eol:'lf' }));

const stub = [
  '#ifndef __LED_RING_H__',
  '#define __LED_RING_H__',
  '#include <stdint.h>',
  '#include <stdbool.h>',
  '#include <string.h>',
  '#include <stdio.h>',
  '#include <stdlib.h>',        /* abort()：桩里的平台原语被调用时立刻炸出来 */
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
  'static void anim_render_chase_single(uint8_t *m, uint8_t len, int16_t pos, uint8_t w)',
  '{ (void)m; (void)len; (void)pos; (void)w;',
  '  fprintf(stderr, "PLATFORM anim_render_chase_single() CALLED\\n"); abort(); }',
  'static void anim_render_chase_dual(uint8_t *m, uint8_t len, int16_t pos, uint8_t w, uint8_t g) { (void)pos;(void)w;(void)g; memset(m, 128, len); }',
  'static void anim_render_swing(uint8_t *m, uint8_t len, int16_t pos, uint8_t w, bool d) { (void)pos;(void)w;(void)d; memset(m, 128, len); }',
  'static void anim_render_fill(uint8_t *m, uint8_t len, int16_t lvl, bool d) { (void)lvl;(void)d; memset(m, 128, len); }',
  '#endif',
].join('\n');
fs.writeFileSync(path.join(dir, 'led_ring.h'), stub);

/* ---------- 3) 主程序：每个模式各跑 N 帧，打印整个 fb ---------- */
const TICKS = 37;
const HALF_TICK = Math.floor(TICKS / 2);   /* 音量档场景：前一半慢档、后一半快档 */
/* 往返长跑：24 颗、慢档 8 拍/颗 → 192 拍一圈；240 拍 = 走完一圈再倒着走 5 颗 */
const TICKS_LONG = 240;
const LONG_MODE = st.modes.list.findIndex(m => m.id === 'mL');
/* 音控闪：整段 47 拍，第 20 拍起「有音乐」（慢档 → 快档）。收尾落在**第二次**闪的第 0 拍
 * （t = 20 闪一次 + 25 拍后再闪一次 = 45 拍绕回、46 拍亮）—— 这一段同时看出
 * 「越过阈值会闪」「一直大声就一直闪」「安静时闪完就灭」。 */
const FLASH_TICKS = 47;
const FLASH_LOUD_FROM = 20;
const FLASH_MODE = st.modes.list.findIndex(m => m.id === 'mM');
/* 长间隔闪：没音乐 400 拍一次 → 跑 405 拍，收尾在第 400 拍那次闪的第 5 拍（亮） */
const FLASH_LONG_TICKS = 405;
const FLASH_LONG_MODE = st.modes.list.findIndex(m => m.id === 'mN');
/* 阈值是工具里调的、随导出写进 C（上面 st.anim.thr = 12）；「有音乐」取阈值 +5 = 17，
 * 「比老阈值响、但还不够」取阈值 -2 = 10（>4 但 <12）—— 后者用来证明 C 用的是导出的阈值。 */
const THR  = fftThreshold(st.anim && st.anim.thr);
const LOUD = Math.min(FW.AUDIO_MAX, THR + 5);
const NEAR = Math.max(0, THR - 2);
/* 迟滞追踪的拍数：够看到「进快档 → 保持 → 掉回慢档」 */
const STAGE_TRACE_TICKS = 60;
const main = [
  '#include <stdio.h>',
  '#include <stdint.h>',
  '#include <string.h>',
  '#define LED_EFFECTS_GEN_RENDER 1',
  '#include "led_effects_gen.h"',
  'static ring_t g_ring;',
  /* 平台 HAL：音量 0..LED_GEN_AUDIO_MAX（生成代码自己拿它跟 LED_GEN_FFT_THRESHOLD 比） */
  'static uint8_t g_audio = 0u;',
  'uint8_t led_gen_hal_audio_level(void) { return g_audio; }',
  'static const led_zone_t Z[] = {{0,8,0},{8,8,0},{16,40,0},{56,24,1},{80,24,1}};',
  'int main(void) {',
  '    uint8_t m, i;',
  '    uint16_t t;',
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
  /* 音量档场景：同一模式，前一半拍安静（音量 0）、后一半拍有音乐（音量 > 阈值）。
   * 对应固件：平台 HAL 每 20ms 给一个音量，生成代码自己拿它跟 LED_GEN_FFT_THRESHOLD 比。 */
  '    memset(&g_ring, 0, sizeof(g_ring));',
  '    memcpy(g_ring.zones, Z, sizeof(Z));',
  '    g_ring.zone_count = 5;',
  '    for (i = 0; i < ZONE_MAX; i++) g_ring.zone_en[i] = true;',
  '    g_ring.brightness.current = 256;',
  '    g_ring.speed_slow = 8;',
  '    g_ring.speed_fast = 1;',
  '    led_gen_apply_mode(&g_ring, 1);',
  '    for (t = 0; t < ' + TICKS + '; t++) {',
  '        g_audio = (t < ' + HALF_TICK + ') ? 0u : (uint8_t)' + LOUD + ';',
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
  '    g_audio = 0u;',
  '    led_gen_apply_mode(&g_ring, 1);',
  '    for (t = 0; t < ' + TICKS + '; t++) led_gen_tick(&g_ring);',
  '    led_gen_render_mode(&g_ring);',
  '    for (i = 0; i < LED_COUNT; i++)',
  '        printf("%u,%u,%u ", (unsigned)g_ring.fb[i][0], (unsigned)g_ring.fb[i][1], (unsigned)g_ring.fb[i][2]);',
  '    printf("|");',
  /* 往返长跑：24 颗环、慢档 8 拍/颗 → 192 拍一圈，240 拍正好走完一圈再倒着走 5 颗。
     生成代码里 I->lap（整圈数奇偶）就靠这一段真跑一遍：不翻的话这里会差出大半圈。 */
  '    memset(&g_ring, 0, sizeof(g_ring));',
  '    memcpy(g_ring.zones, Z, sizeof(Z));',
  '    g_ring.zone_count = 5;',
  '    for (i = 0; i < ZONE_MAX; i++) g_ring.zone_en[i] = true;',
  '    g_ring.brightness.current = 256;',
  '    g_ring.speed_slow = 8;',
  '    g_ring.speed_fast = 1;',
  '    g_audio = 0u;',
  '    led_gen_apply_mode(&g_ring, ' + LONG_MODE + ');',
  '    for (t = 0; t < ' + TICKS_LONG + '; t++) led_gen_tick(&g_ring);',
  '    led_gen_render_mode(&g_ring);',
  '    for (i = 0; i < LED_COUNT; i++)',
  '        printf("%u,%u,%u ", (unsigned)g_ring.fb[i][0], (unsigned)g_ring.fb[i][1], (unsigned)g_ring.fb[i][2]);',
  '    printf("|");',
  /* 音控闪：前 20 拍慢档（安静）、第 20 拍起快档（= 越过阈值）。23 拍收在闪的第 3 拍上。 */
  '    memset(&g_ring, 0, sizeof(g_ring));',
  '    memcpy(g_ring.zones, Z, sizeof(Z));',
  '    g_ring.zone_count = 5;',
  '    for (i = 0; i < ZONE_MAX; i++) g_ring.zone_en[i] = true;',
  '    g_ring.brightness.current = 256;',
  '    g_ring.speed_slow = 8;',
  '    g_ring.speed_fast = 1;',
  '    led_gen_apply_mode(&g_ring, ' + FLASH_MODE + ');',
  '    for (t = 0; t < ' + FLASH_TICKS + '; t++) {',
  '        g_audio = (t < ' + FLASH_LOUD_FROM + ') ? 0u : (uint8_t)' + LOUD + ';',
  '        led_gen_tick(&g_ring);',
  '    }',
  '    led_gen_render_mode(&g_ring);',
  '    for (i = 0; i < LED_COUNT; i++)',
  '        printf("%u,%u,%u ", (unsigned)g_ring.fb[i][0], (unsigned)g_ring.fb[i][1], (unsigned)g_ring.fb[i][2]);',
  '    printf("|");',
  /* 对照：同样 47 拍，全程安静 —— 只在最开头闪一下，收尾时停在最低亮度上（不是全黑） */
  '    memset(&g_ring, 0, sizeof(g_ring));',
  '    memcpy(g_ring.zones, Z, sizeof(Z));',
  '    g_ring.zone_count = 5;',
  '    for (i = 0; i < ZONE_MAX; i++) g_ring.zone_en[i] = true;',
  '    g_ring.brightness.current = 256;',
  '    g_ring.speed_slow = 8;',
  '    g_ring.speed_fast = 1;',
  '    g_audio = 0u;',
  '    led_gen_apply_mode(&g_ring, ' + FLASH_MODE + ');',
  '    for (t = 0; t < ' + FLASH_TICKS + '; t++) led_gen_tick(&g_ring);',
  '    led_gen_render_mode(&g_ring);',
  '    for (i = 0; i < LED_COUNT; i++)',
  '        printf("%u,%u,%u ", (unsigned)g_ring.fb[i][0], (unsigned)g_ring.fb[i][1], (unsigned)g_ring.fb[i][2]);',
  '    printf("|");',
  /* 长间隔闪：全程安静跑 405 拍 —— 400 拍 > 255，这一列在 C 侧必须真是 uint16
     （截成 uint8 的话闪点会挪到 144 / 288，收尾那拍就落在暗段）。 */
  '    memset(&g_ring, 0, sizeof(g_ring));',
  '    memcpy(g_ring.zones, Z, sizeof(Z));',
  '    g_ring.zone_count = 5;',
  '    for (i = 0; i < ZONE_MAX; i++) g_ring.zone_en[i] = true;',
  '    g_ring.brightness.current = 256;',
  '    g_ring.speed_slow = 8;',
  '    g_ring.speed_fast = 1;',
  '    g_audio = 0u;',
  '    led_gen_apply_mode(&g_ring, ' + FLASH_LONG_MODE + ');',
  '    for (t = 0; t < ' + FLASH_LONG_TICKS + '; t++) led_gen_tick(&g_ring);',
  '    led_gen_render_mode(&g_ring);',
  '    for (i = 0; i < LED_COUNT; i++)',
  '        printf("%u,%u,%u ", (unsigned)g_ring.fb[i][0], (unsigned)g_ring.fb[i][1], (unsigned)g_ring.fb[i][2]);',
  '    printf("|");',

  /* 阈值确实是导出的那个：音量 10（> 老阈值 4，但 < 工具里设的 12）—— 必须仍算「安静」。
     固件里若还写死 4，这一段会变亮、和「全程安静」那条对不上。 */
  '    memset(&g_ring, 0, sizeof(g_ring));',
  '    memcpy(g_ring.zones, Z, sizeof(Z));',
  '    g_ring.zone_count = 5;',
  '    for (i = 0; i < ZONE_MAX; i++) g_ring.zone_en[i] = true;',
  '    g_ring.brightness.current = 256;',
  '    g_ring.speed_slow = 8;',
  '    g_ring.speed_fast = 1;',
  '    g_ring.speed_cur = 8;',
  '    g_audio = (uint8_t)' + NEAR + ';',
  '    led_gen_apply_mode(&g_ring, ' + FLASH_MODE + ');',
  '    for (t = 0; t < ' + FLASH_TICKS + '; t++) led_gen_tick(&g_ring);',
  '    led_gen_render_mode(&g_ring);',
  '    for (i = 0; i < LED_COUNT; i++)',
  '        printf("%u,%u,%u ", (unsigned)g_ring.fb[i][0], (unsigned)g_ring.fb[i][1], (unsigned)g_ring.fb[i][2]);',
  '    printf("|");',

  /* 迟滞语义（C 侧直接读引擎内部状态）：只在第 10..14 拍给「有音乐」，20 拍之后安静 ——
     档位应当很快进快档，然后拖够阻尼（460ms = 23 拍）才掉回慢档。 */
  '    memset(&g_ring, 0, sizeof(g_ring));',
  '    memcpy(g_ring.zones, Z, sizeof(Z));',
  '    g_ring.zone_count = 5;',
  '    for (i = 0; i < ZONE_MAX; i++) g_ring.zone_en[i] = true;',
  '    g_ring.brightness.current = 256;',
  '    g_ring.speed_slow = 8;',
  '    g_ring.speed_fast = 1;',
  '    led_gen_apply_mode(&g_ring, ' + FLASH_MODE + ');',
  '    for (t = 0; t < ' + STAGE_TRACE_TICKS + '; t++) {',
  '        g_audio = ((t >= 10u) && (t < 15u)) ? (uint8_t)' + LOUD + 'u : 0u;',
  '        led_gen_tick(&g_ring);',
  '        printf("%u:%u,", (unsigned)t, (unsigned)led_gen_stage);',
  '    }',
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

let out = '';
try {
  out = execFileSync(path.join(dir, 'gen.exe'), { env: ENV, encoding: 'latin1' });
} catch (e) {
  ok(false, '生成的 C 跑崩了 —— 说明它调到了桩里那个「被调即 abort」的平台原语: '
            + String(e.message).split('\n')[0]);
  console.log('\n=== 中止 ===');
  process.exit(1);
}
const cModes = out.trim().split('|').filter(s => s.trim().length)
  .map(s => s.trim().split(/\s+/).map(trip => trip.split(',').map(Number)));
const cAll = cModes.length;            /* C 侧输出段数 = 模式数 + 5 段附加场景 */
const cAux = cModes.slice(st.modes.list.length);   /* 1 音量档 / 2 全程慢档对照 / 3 往返长跑 / 4 音控闪 / 5 音控闪对照 / 6 长间隔闪 / 7 阈值下沿 / 8 迟滞追踪 */
cModes.length = st.modes.list.length;  /* 原地裁短成"模式段"，后面按模式逐个比对 */
ok(cAll === st.modes.list.length + 8, `C 侧输出 ${cAll} 段（${st.modes.list.length} 个模式 + 8 段附加场景）`);

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

/* ---------- 4b) 新配色：彩虹 / 跳变 / 呼吸 / 覆盖 真跑出来是什么样 ---------- */
console.log('--- 新配色模式（C 侧真跑 37 拍）---');
{
  const row = cModes[4] || [];
  const rgb = c => c.split(',').map(Number);
  const uniq = new Set();
  for (let i = 0; i < 8; i++) uniq.add(row[i] && row[i].join(','));
  ok(uniq.size >= 4, `彩虹分区（8 颗，levels=30）出现 ${uniq.size} 种颜色`);
  ok(row.slice(0, 8).every(px => px[0] + px[1] + px[2] > 0), '彩虹分区整条点亮');
  const stepCol = row[8] && row[8].join(',');
  ok(!!stepCol && row[15] && row[15].join(',') === stepCol, '跳变分区整条同色');
  /* 跳变包络：37 拍 = 第 2/5 拍（停留 5，亮 1 / 暗 4）—— 亮段已过，正在渐灭。
   * 跑旧行为（硬切、恒满亮）时这里会正好是 255。 */
  ok(row[8] && row[8][0] > 0 && row[8][0] < 220,
     `跳变在停留中途已经渐灭（第 2/5 拍 → ${row[8] && row[8][0]}/255，包络在真编译的 C 里也生效）`);
  const brCol = row[16] && row[16].join(',');
  ok(!!brCol && row[55] && row[55].join(',') === brCol, '呼吸分区整条同色');
  /* 呼吸包络（渐亮 6 / 亮 0 / 暗 6，由 period=12 摊出来）走的是平滑曲线：
   * 37 拍 = 第 1/12 拍，刚起步只爬到约 90/255（线性三角波在这一拍已经是 254 = 满亮）。 */
  ok(row[16] && row[16][0] > 0 && row[16][0] < 120,
     `呼吸在渐亮段（第 1/12 拍 → ${row[16] && row[16][0]}/255，对称包络在真编译的 C 里生效）`);
  const wipe = new Set();
  for (let i = 56; i < 80; i++) wipe.add(row[i] && row[i].join(','));
  ok(wipe.size === 2, `覆盖分区正好 2 种颜色（${[...wipe].join(' | ')}）`);
  ok([...wipe].some(c => { const p = rgb(c); return p[0] > 200 && p[1] > 80 && p[2] < 10; }),
     '覆盖的第二种颜色来自调色板第 2 个（橙色）');
  /* 渐变条目 + 覆盖灯数：37 拍 → 第 4 趟 → 盖条目 1（[橙 → 绿]）。
   * 参与的那 12 颗里，已扫到的铺成「橙 → 绿」位置渐变，更早的灯停在条目 0（蓝）。 */
  const gradRow = cModes[7] || [];
  const part = new Set(), rest = new Set();
  for (let i = 16; i < 28; i++) part.add(gradRow[i] && gradRow[i].join(','));
  for (let i = 28; i < 56; i++) rest.add(gradRow[i] && gradRow[i].join(','));
  ok(part.size >= 6, `渐变条目：前 12 颗出现 ${part.size} 种颜色（位置渐变真在 C 里铺开）`);
  ok(rest.size === 1, `覆盖灯数 12：第 13 颗起只有 ${rest.size} 种颜色（一直是条目 0）`);
  ok(part.size > 1 && [...part].some(c => c !== [...rest][0]),
     '参与的那 12 颗铺出了与底色不同的颜色（位置渐变真在 C 里铺开，不是整段底色）');
  /* 多色覆盖：37 拍 = 第 3 趟 → 本趟颜色对 pal[3]（品红）底 / pal[0]（蓝）盖。
   * 第 1 个分区 8 颗、往返、这一趟从右往左：末颗已被本趟扫到（蓝），首颗还是上一趟盖的（品红）。 */
  const mRow = cModes[st.modes.list.findIndex(m => m.id === 'mJ')] || [];
  const mc = i => (mRow[i] || []);
  ok(mc(7)[0] === 0 && mc(7)[1] === 0 && mc(7)[2] > 200,
     `多色覆盖：第 3 趟盖第 1 个颜色（第 8 颗 ${mc(7).join(',')}）`);
  ok(mc(0)[0] > 200 && mc(0)[1] < 60 && mc(0)[2] > 200,
     `多色覆盖：上一趟那片是第 4 个颜色（第 1 颗 ${mc(0).join(',')}）`);
  /* 单向 + 渐变条目：37 拍 = 第 4 趟 → 盖条目 1（渐变）。单向 → 这一趟从第 1 颗开始扫，
   * 所以第 1 颗是本轮渐变起点（橙）；往返的话第 4 趟从另一头开始，第 1 颗是上一趟的条目。 */
  const mixRow = cModes[8] || [];
  const mixFirst = mixRow[0] || [0, 0, 0];
  ok(mixFirst[0] > 200 && mixFirst[1] > 80 && mixFirst[2] < 10,
     `单向覆盖：第 4 趟从第 1 颗起步（第 1 颗 = 渐变起点 ${mixFirst.join(',')} = 橙）`);
  const mixCols = new Set();
  for (let i = 0; i < 40; i++) mixCols.add(mixRow[i] && mixRow[i].join(','));
  ok(mixCols.size >= 8,
     `单向覆盖第 4 趟（渐变条目）铺开 ${mixCols.size} 种颜色（位置渐变在 C 里铺开）`);
}
/* 渐亮跳变：C 里跑 37 拍 = 第 1/6 拍（渐亮 3），包络爬到 170，乘进满档 mask（254）后是 169 ——
 * 渐亮分支真的执行了（rise = 0 时这里会是满亮 254） */
{
  const row = cModes[5] || [];
  const uniq = new Set(row.map(px => px.join(',')));
  ok(row.length === FW.LED_COUNT && uniq.size === 1 && row[0][0] === 169,
     `渐亮跳变：整条同色、第 1/6 拍亮度 ${row[0] && row[0][0]}/254（渐亮段在真编译的 C 里生效）`);
}

/* 渐变步进：C 侧跑 37 拍 = 相位 (37 × 8) & 0xFF = 40 级（写死 +1 的老写法只会到 37）。
 * 整条同色（满亮填充层），并且与 JS 预览逐字节一致；把步进改回 1 就对不上 —— 证明这条断言有区分度。 */
{
  const row = cModes[6] || [];
  const uniq = new Set(row.map(px => px.join(',')));
  ok(row.length === FW.LED_COUNT && uniq.size === 1,
     `渐变步进：整条同色（${uniq.size} 种像素值）`);
  const gi = st.effects.list.findIndex(e => e.id === GSTEP.id);
  ok(gi > 0, `渐变步进那条效果在导出表第 ${gi} 行`);
  const runJs = step => {
    const s = JSON.parse(JSON.stringify(st));
    s.effects.list[gi].grad_step = step;
    s.anim.modeId = s.modes.list[6].id;
    const sim = simInit(); simApplyMode(sim, s); simSetSpeed(sim, 'slow');
    for (let t = 0; t < TICKS; t++) simTick(sim, s, false);
    return Array.from({ length: FW.LED_COUNT },
      (_, i) => sim.fb[i * 3] + ',' + sim.fb[i * 3 + 1] + ',' + sim.fb[i * 3 + 2]).join('|');
  };
  const cRow = row.map(px => px.join(',')).join('|');
  ok(cRow === runJs(8), '渐变步进：C 侧（真编译）与 JS 预览逐字节一致');
  ok(cRow !== runJs(1),
     '步进 8 与步进 1 跑同样 37 拍，帧确实不一样（上面那条不是空断言）');
}


console.log('--- 内建单点追逐：生成代码自画（平顶、不调平台原语） ---');
{
  const genH = fs.readFileSync(path.join(dir, 'led_effects_gen.h'), 'utf8');
  ok(!/^\s*anim_render_chase_single\s*\(/m.test(genH),
     '生成代码里一处都没调平台 anim_render_chase_single()（桩里那个一被调就 abort，跑通即证明）');
  /* 内建这条效果是单色实例（配色走 color_ctx 给一个全局色），所以 mask 平顶 ⇒
   * 带内的灯像素值**完全一样**、带外全 0 —— 只有一种亮度值。跑的是旧余弦窗时，
   * 这里会数出 5~9 种渐变值。 */
  const bi = cModes[3] || [];
  const uniq = new Set();
  let litN = 0;
  bi.forEach(px => { if (px[0] + px[1] + px[2] > 0) { litN++; uniq.add(px.join(',')); } });
  ok(uniq.size === 1 && litN > 0,
     `内建单点追逐跑 ${TICKS} 拍后：${litN} 颗灯亮、只有 ${uniq.size} 种像素值（平顶光带：带内一律满档，无边缘衰减）`);
}

/* ---------- 4b) F5) 旁路的图层（en=0）在真编译的 C 里也被跳过 ---------- */
console.log('--- F5) 图层旁路（en=0）与 C 一致 ---');
{
  const fx2 = st.effects.list[2];
  ok(fx2.layers.length === 3 && fx2.layers[2].en === 0,
     `FX2 第 3 层是旁路的填充（level=${fx2.layers[2].level}, en=${fx2.layers[2].en}）`);
  ok(fs.readFileSync(path.join(dir, 'led_effects_gen.h'), 'utf8').includes('if (!L->en) continue;'),
     '生成头里的图层循环带跳过分支（上面那份逐字节比对跑的正是它）');
  /* 反向确认：把这一层打开，帧序列必须变 —— 否则上面「一致」就是没区分度的空断言 */
  const runJs = stt => {
    const s = JSON.parse(JSON.stringify(stt));
    s.anim.modeId = s.modes.list[2].id;
    const sim = simInit(); simApplyMode(sim, s); simSetSpeed(sim, 'slow');
    for (let t = 0; t < TICKS; t++) simTick(sim, s, false);
    return [...sim.fb.slice(0, FW.LED_COUNT * 3)];
  };
  const opened = JSON.parse(JSON.stringify(st));
  opened.effects.list[2].layers[2].en = 1;
  ok(JSON.stringify(runJs(st)) !== JSON.stringify(runJs(opened)),
     '把该层打开后 JS 帧序列确实变了（这条断言有区分度）');
}

/* ---------- 5) 音量档：C 侧按 HAL 音量 + 导出的阈值自己判档，与 JS 预览逐字节一致 ----------
 * 固件链路（新）：平台 HAL 每 20ms 给一个 0..AUDIO_MAX 的音量，生成代码在 led_gen_tick()
 * 里拿它跟 LED_GEN_FFT_THRESHOLD 比 → 每个实例按自己配的 fast/slow 走。 */
{
  const sA = JSON.parse(JSON.stringify(st));
  sA.anim.modeId = st.modes.list[1].id;
  const simA = simInit();
  simApplyMode(simA, sA);
  for (let t = 0; t < TICKS; t++) {
    simSetAudioLevel(simA, t < HALF_TICK ? 0 : LOUD, THR);   /* 与 C 侧同一驱动时序 */
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

/* ---------- 4d) 往返长跑：跨过环的接缝之后，C 与 JS 还一致吗 ----------
 * 一圈 192 拍（24 颗、慢档 8 拍/颗），这里跑 240 拍 = 走完一圈再倒着走 5 颗。
 * 「整圈数取奇偶」这件事以前根本不存在（勾了往返等于没勾），所以这一段是生成代码里
 * led_gen_bounce + I->lap + lap_pos 三件事唯一被真编译跑过的机会。 */
{
  const mode = st.modes.list.find(m => m.id === 'mL');
  const s2 = JSON.parse(JSON.stringify(st));
  s2.anim.modeId = mode.id;
  const sim = simInit();
  simApplyMode(sim, s2);
  simSetSpeed(sim, 'slow');
  for (let t = 0; t < TICKS_LONG; t++) simTick(sim, s2, false);
  const fb2 = cAux[2] || [];
  let badB = 0, firstB = null;
  for (let i = 0; i < FW.LED_COUNT; i++) {
    const j = sim.fb[i * 3], k = sim.fb[i * 3 + 1], l = sim.fb[i * 3 + 2];
    if (!fb2[i] || fb2[i][0] !== j || fb2[i][1] !== k || fb2[i][2] !== l) {
      badB++;
      if (!firstB) firstB = { led: i, c: fb2[i], js: [j, k, l] };
      break;
    }
  }
  ok(badB === 0, badB === 0
     ? `往返长跑 ${TICKS_LONG} 拍（跨过接缝、倒着走那圈）C 侧与 JS 仍逐字节一致`
     : `往返长跑不一致，首例: ${JSON.stringify(firstB)}`);

  /* 语义：这会儿应该已经掉头（光点在分区后半段），而不是还在往后半段跑。
   * 第 5 个分区是 24 颗的长段（物理 80..103），不勾往返的话此刻停在第 5 颗附近。 */
  const fb = new Uint8Array(FW.LED_COUNT * 3);
  fb2.forEach((px, i) => { if (px) { fb[i * 3] = px[0]; fb[i * 3 + 1] = px[1]; fb[i * 3 + 2] = px[2]; } });
  const ctr = CORE.litBandCenter(fb, { start: 80, count: 24 });
  ok(ctr !== null && (ctr - 80) >= 12,
     `往返长跑：光点已经掉头走到后半段（物理 ${ctr} = 该分区第 ${ctr === null ? '-' : ctr - 79} 颗，`
     + '不勾往返这会儿还在第 5 颗附近）');
}

/* ---------- 4e) 音控闪（预置「闪烁」）：安静 / 越过阈值两条路，C 与 JS 一致吗 ----------
 * 这段是生成代码里 flash_age / loud_prev / flash_gain 三个字段唯一的真跑机会。
 * 驱动时序与 C 侧完全相同：前 20 拍慢档（安静），第 20 拍起快档（越过阈值）——
 * 之后每 flash_fast(25) 拍再闪一次，收尾正落在第二次闪的第 0 拍上。 */
{
  const mode = st.modes.list.find(m => m.id === 'mM');
  const run = loudFrom => {
    const s2 = JSON.parse(JSON.stringify(st));
    s2.anim.modeId = mode.id;
    const sim = simInit();
    simApplyMode(sim, s2);
    for (let t = 0; t < FLASH_TICKS; t++) {
      simSetAudioLevel(sim, t < loudFrom ? 0 : LOUD, THR);
      simTick(sim, s2, false);
    }
    return Array.from({ length: FW.LED_COUNT },
      (_, i) => sim.fb[i * 3] + ',' + sim.fb[i * 3 + 1] + ',' + sim.fb[i * 3 + 2]).join('|');
  };
  const jsLoud = run(FLASH_LOUD_FROM), jsQuiet = run(FLASH_TICKS);
  ok((cAux[3] || []).map(px => px.join(',')).join('|') === jsLoud,
     '音控闪：安静 20 拍后越过阈值再跑 3 拍，C 侧与 JS 逐字节一致');
  ok((cAux[4] || []).map(px => px.join(',')).join('|') === jsQuiet,
     '音控闪对照：全程安静跑同样拍数，C 侧与 JS 逐字节一致');
  /* 逐字节比完之后看语义：越过阈值那一刻必须「亮起来」（不是残余的暗光）；
     全程安静那段收尾时应该停在「最低亮度」那一档，不是全黑 —— 最高 200 / 最低 50。
     像素值是 (颜色 × 亮度 × ring 亮度) >> 16，255/256 的取整会少 1 级，所以按同一个式子算期望。 */
  const pxOf = v => Math.floor((255 * v * 256) / 65536);
  const loudRow = cAux[3] || [];
  const quietRow = cAux[4] || [];
  const litLoud = loudRow.filter(px => px[0] + px[1] + px[2] > 0).length;
  const litQuiet = quietRow.filter(px => px[0] + px[1] + px[2] > 0).length;
  ok(litLoud === FW.LED_COUNT && (loudRow[0] || [0])[0] === pxOf(200),
     `越过阈值后整条亮起（${litLoud} 颗，亮度 ${(loudRow[0] || [0])[0]}/255 = 最高亮度 200 的渲染值）`);
  ok(litQuiet === FW.LED_COUNT && (quietRow[0] || [0])[0] === pxOf(50),
     `全程安静跑 ${FLASH_TICKS} 拍后暗在最低亮度上（${litQuiet} 颗，亮度 ${(quietRow[0] || [0])[0]} = 最低亮度 50 的渲染值）`);

  /* 阈值 = 工程里设的 12（导出成 LED_GEN_FFT_THRESHOLD）：音量 10 是「>4 但 <12」，
   * 必须仍算安静 —— 和上面那条「全程安静」逐字节相同；写死 4 的话这里会亮起来。 */
  const runNear = () => {
    const s4 = JSON.parse(JSON.stringify(st));
    s4.anim.modeId = mode.id;
    const sim4 = simInit();
    simApplyMode(sim4, s4);
    for (let t = 0; t < FLASH_TICKS; t++) { simSetAudioLevel(sim4, NEAR, THR); simTick(sim4, s4, false); }
    return Array.from({ length: FW.LED_COUNT },
      (_, i) => sim4.fb[i * 3] + ',' + sim4.fb[i * 3 + 1] + ',' + sim4.fb[i * 3 + 2]).join('|');
  };
  const jsNear = runNear();
  ok((cAux[6] || []).map(px => px.join(',')).join('|') === jsNear,
     `阈值下沿（音量 ${NEAR} < 阈值 ${THR}）：C 侧与 JS 逐字节一致`);
  ok(jsNear === jsQuiet,
     `音量 ${NEAR} 低于阈值 ${THR} 时按「安静」走（与全程静音那一版相同）—— 阈值确实是导出的那个`);

  /* 长间隔闪：没音乐 400 拍 = 8 秒一次，全程安静跑 405 拍 —— 收尾正落在第 400 拍那次闪的
   * 第 5 拍上（亮）。这一条是「三列时间真的是 uint16」的 C 侧证据：400 被截成 uint8 的话
   * 闪点会落在 144 / 288，405 拍早就暗回最低亮度了。 */
  const modeL = st.modes.list.find(m => m.id === 'mN');
  const s3 = JSON.parse(JSON.stringify(st));
  s3.anim.modeId = modeL.id;
  const simL = simInit();
  simApplyMode(simL, s3);
  simSetSpeed(simL, 'slow');
  for (let t = 0; t < FLASH_LONG_TICKS; t++) simTick(simL, s3, false);
  const jsLong = Array.from({ length: FW.LED_COUNT },
    (_, i) => simL.fb[i * 3] + ',' + simL.fb[i * 3 + 1] + ',' + simL.fb[i * 3 + 2]).join('|');
  const longRow = cAux[5] || [];
  ok(longRow.map(px => px.join(',')).join('|') === jsLong,
     `长间隔闪：全程安静 ${FLASH_LONG_TICKS} 拍（间隔 400 拍），C 侧与 JS 逐字节一致`);
  ok(longRow.length === FW.LED_COUNT && (longRow[0] || [0])[0] === pxOf(200),
     `长间隔闪跑到第 ${FLASH_LONG_TICKS} 拍仍在第 400 拍那次闪的亮段上（${(longRow[0] || [0])[0]} = 最高亮度 200 的渲染值；uint8 会截成 144 拍，这里早就暗了）`);
}

/* ---------- 4f) 快档迟滞（阻尼）：C 侧内部状态与 JS 逐拍一致吗 ----------
 * 只在第 10..14 拍给「有音乐」，之后一直安静。期望：很快进快档，然后拖够阻尼
 * （450ms → 向上取整 460ms = 23 拍）才掉回慢档 —— 这就是「慢→快迅速、快→慢有阻尼」。 */
{
  const mode = st.modes.list.find(m => m.id === 'mM');
  const s5 = JSON.parse(JSON.stringify(st));
  s5.anim.modeId = mode.id;
  const sim5 = simInit();
  simApplyMode(sim5, s5);
  let jsTrace = '';
  for (let t = 0; t < STAGE_TRACE_TICKS; t++) {
    simSetAudioLevel(sim5, (t >= 10 && t < 15) ? LOUD : 0, THR);
    simTick(sim5, s5, false);
    jsTrace += `${t}:${sim5.stage},`;
  }
  const rawSegs = out.trim().split('|');
  const cTrace = (rawSegs[st.modes.list.length + 7] || '').trim();
  ok(cTrace === jsTrace, `快档迟滞的逐拍状态 C ↔ JS 完全一致（${cTrace.slice(0, 40)}…）`);
  /* 语义：进快档在音量出现后的第一个采样点（40ms 一次 → 最多晚 1 拍），
     回慢档要等阻尼到期（23 拍）之后的采样点。 */
  const enter = +((jsTrace.match(/(\d+):1,/) || [])[1] || -1);
  const back  = +((jsTrace.match(/1,(?:(\d+:\d+,)*?)(\d+):0,/) || [])[2] || -1);
  ok(enter >= 10 && enter <= 11, `进快档很快：第 ${enter} 拍（音量从第 10 拍开始）`);
  ok(back - enter >= 22 && back - enter <= 24,
     `回慢档被阻尼拖住：第 ${enter} 拍进、第 ${back} 拍才回（差 ${back - enter} 拍 ≈ 460ms）`);
}

/* 覆盖度自检 */
let lit = 0, hueUsed = 0;
cModes.forEach(f => f.forEach(px => { if (px[0] + px[1] + px[2] > 0) lit++; }));
ok(lit > 0, `C 侧确实点亮了 ${lit} 个灯位（不是一片黑）`);
const kinds = new Set();
st.effects.list.forEach(e => (e.layers || []).forEach(l => kinds.add(l.kind)));
ok(kinds.size >= 3, `覆盖了 ${kinds.size} 种图层 (${[...kinds].join(',')})`);

console.log(fails ? `\n=== ${fails} 项未通过 ===` : '\n=== 全部通过 ===');
process.exit(fails ? 1 : 0);
