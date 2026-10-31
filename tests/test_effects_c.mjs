/* 生成的 C：文本层面的断言（模式模型） */
import fs from 'node:fs';
const html = fs.readFileSync('led_layout_editor.html','utf8');
const CORE = new Function(html.match(/<script id="core">([\s\S]*?)<\/script>/)[1] + '\n; return CORE;')();
const { FW, emptyProject, projectFromPreset, PRESET_SP3122D, defaultEffects,
        newCustomEffect, exportEffectsC, ANIM_TOK, COLOR_TOK } = CORE;
let fails = 0;
const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fails++; };

/* ---- 固件里的真身（node 读不了 SDK 目录，用 python 抽好的 fixture） ---- */
const fwRows = fs.readFileSync('tests/fixtures/fw_g_presets.txt', 'utf8')
                 .split(String.fromCharCode(10)).map(l => l.trim()).filter(l => l.startsWith('{'));
const toks = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').match(/\{[^{}]*\}|[A-Z_]+|\d+/g) || [];
/* 表行 → 数字数组（kind, en, count, ...）；尾部 }, 的空项不能当成 0 */
const numsOf = row => row.replace(/\/\*.*$/, '').replace(/[{}]/g, ' ').replace(/,/g, ' ')
                          .trim().split(/\s+/).map(Number);

const st = projectFromPreset(PRESET_SP3122D);
const hdr = exportEffectsC(st, { form:'header', comment:'ascii', eol:'lf' });

console.log('--- 回归锚点：默认 9 个效果 vs 固件 g_presets[] ---');
const effBlk = hdr.slice(hdr.indexOf('static const led_gen_effect_t'),
                         hdr.indexOf('};', hdr.indexOf('static const led_gen_effect_t')));
const effRows = (effBlk.match(/^    \{.*\},/gm) || []);
ok(fwRows.length === 9 && effRows.length === 9, `固件 ${fwRows.length} 行 / 导出 ${effRows.length} 行`);
let bad = [];
for (let i = 0; i < 9; i++) {
  const n = effRows[i].replace(/\/\*.*$/,'').replace(/[{}]/g,'').split(',').map(x => +x.trim());
  /* kind,anim,width,gap,ctype,c1r,c1g,c1b,c2r,c2g,c2b,speed,slow,fast,first,count,offset,moves */
  const [kind, anim, width, gap, ctype, c1r,c1g,c1b, c2r,c2g,c2b, speed, slow, fast] = n;
  const fw = toks(fwRows[i]).filter(t => !/^\{/.test(t));
  /* 固件行: {ANIM_x, COLOR_y, width, gap, slow, fast, speed, {r,g,b}, {r,g,b}} */
  const ft = fwRows[i].replace(/\/\*.*$/,'');
  const m = /^\{\s*(\w+)\s*,\s*(\w+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*\{(\d+),(\d+),(\d+)\}\s*,\s*\{(\d+),(\d+),(\d+)\}\s*\}/.exec(ft.trim());
  if (!m) { bad.push(`第 ${i} 行没解析出固件格式`); continue; }
  const g = m.slice(1).map(x => /^\d+$/.test(x) ? +x : x);
  const expect = ['ANIM_' + ANIM_TOK[anim], 'COLOR_' + COLOR_TOK[ctype], width, gap, slow, fast, speed, c1r, c1g, c1b, c2r, c2g, c2b];
  const got    = [g[0], g[1], g[2], g[3], g[4], g[5], g[6], g[7], g[8], g[9], g[10], g[11], g[12]];
  if (kind !== 0) bad.push(`第 ${i} 行 kind=${kind}（内建效果应为 0）`);
  if (JSON.stringify(expect) !== JSON.stringify(got)) bad.push(`第 ${i} 行不符:\n      固件 ${got.join(',')}\n      导出 ${expect.join(',')}`);
}
ok(bad.length === 0, bad.length ? '默认效果与固件不一致:\n    ' + bad.join('\n    ')
                                : '默认 9 个效果与固件 g_presets[] 完全一致（动画/配色/9 个数值）');

console.log('--- 模式表 / 绑定表 ---');
ok(hdr.includes('#define LED_GEN_MODE_COUNT    9'), '模式数 = 9');
ok(hdr.includes('#define LED_GEN_EFFECT_COUNT  9'), '效果数 = 9');
ok(hdr.includes('#define RING_PRESET_COUNT  LED_GEN_MODE_COUNT'), 'RING_PRESET_COUNT 跟随模式数');
const mdBlk = hdr.slice(hdr.indexOf('static const led_gen_mode_t'), hdr.indexOf('};', hdr.indexOf('static const led_gen_mode_t')));
ok((mdBlk.match(/^    \{/gm) || []).length === 9, 'led_gen_modes 有 9 行');
ok(/^    \{ 0, 1, 1 \},/m.test(mdBlk), '模式 0 = 绑定表第 0 条起、1 条、启用');
const bdBlk = hdr.slice(hdr.indexOf('static const led_gen_bind_t'), hdr.indexOf('};', hdr.indexOf('static const led_gen_bind_t')));
ok((bdBlk.match(/^    \{/gm) || []).length === 9, 'led_gen_binds 有 9 条（默认每个模式一条）');
ok(/0x1F/.test(bdBlk), '默认绑定覆盖 5 个分区（0x1F）');

console.log('--- 有自定义效果 / 多分区绑定时 ---');
const st2 = projectFromPreset(PRESET_SP3122D);
st2.effects.list[3] = Object.assign(newCustomEffect(3, '呼吸红'), {
  layers: [{ kind:'fill', level:255, pulse_period:30, pulse_amp:255, wave:0, cmode:1,
             hue_base:0, hue_spread:255, hue_speed:2, direction:1, bounce:0, spans:0, rotate:0 }] });
st2.modes = { version:1, list: [
  { id:'m0', name:'LED_MODE_1', latin:'MODE1', enabled:true, binds:[
      { effect: st2.effects.list[1].id, zones:[0,1] },
      { effect: st2.effects.list[3].id, zones:[2] },
      { effect: st2.effects.list[1].id, zones:[3,4] } ] } ] };
const h2 = exportEffectsC(st2, { form:'header', comment:'ascii', eol:'lf' });
ok(/#define LED_GEN_MODE_COUNT    1/.test(h2), '现在只有 1 个模式');
const bd2 = h2.slice(h2.indexOf('static const led_gen_bind_t'), h2.indexOf('};', h2.indexOf('static const led_gen_bind_t')));
const binds = (bd2.match(/^    \{ \d+, 0x[0-9A-F]+ \},/gm) || []);
ok(binds.length === 3, `绑定表 3 条: ${binds.map(s=>s.trim()).join(' ')}`);
ok(binds.map(x=>x.trim()).join(' ') === '{ 1, 0x3 }, { 3, 0x4 }, { 1, 0x18 },', '分区掩码正确（0/1→0x3, 2→0x4, 3/4→0x18）: ' + binds.map(x=>x.trim()).join(' '));
const e3 = h2.slice(h2.indexOf('static const led_gen_effect_t'));
const e3row = (e3.match(/^    \{.*\},/gm) || [])[3] || '';
ok(/^    \{ 1,/.test(e3row), '第 3 个效果被标成自定义（kind=1）: ' + e3row.trim().slice(0, 40));
const lay = h2.slice(h2.indexOf('static const led_gen_layer_t'), h2.indexOf('};', h2.indexOf('static const led_gen_layer_t')));
ok((lay.match(/^    \{/gm) || []).length === 1, '图层表 1 行');
ok(!/hue_spread|hue_speed|cmode|LED_GEN_CMODE/.test(lay) && !/LED_GEN_CMODE/.test(h2),
   '图层行里没有 hue_spread / hue_speed / cmode（取色归效果级配色）');
/* F5: 字段顺序 kind, en, count, ...（en 紧跟 kind），末尾是 wave, flags, spacing, flash_fast, flash_on, flash_low, hc_r, hc_g, hc_b */
const layRows = (lay.match(/^    \{.*\},/gm) || []).map(numsOf);
ok(layRows.length === 1 && layRows[0].length === 40 && layRows[0][0] === 2 && layRows[0][1] === 1,
   `图层行 ${layRows[0] ? layRows[0].length : 0} 个数值：kind=${layRows[0] && layRows[0][0]} en=${layRows[0] && layRows[0][1]}（期望 40 个 / 2 / 1）`);
ok(/uint8_t spacing;\s+\/\* SPOT: centre distance/.test(h2),
   '结构体末尾多了 spacing（光点间距，0 = 按 count 均布）');
ok(/uint16_t pulse_period;/.test(h2),
   '脉动周期是 uint16 帧（0..65535 拍 ≈ 21.8 分钟，够填「几分钟闪一次」）');
ok(/uint16_t flash_fast;/.test(h2) && /uint16_t flash_on;/.test(h2) && /uint8_t flash_low;/.test(h2) &&
   h2.indexOf('uint16_t flash_fast;') > h2.indexOf('uint8_t spacing;') &&
   h2.indexOf('uint8_t flash_low;') > h2.indexOf('uint16_t flash_on;'),
   '末尾再追加 flash_fast / flash_on / flash_low 三列（有音乐间隔 / 亮的时间 / 最低亮度），两列时间加宽成 uint16，前面的列一列没挪位');
ok(/uint8_t flash_low;\s+\/\* audio flash: brightness during the dark frames/.test(h2),
   'flash_low 的注释说清了它填的是「亮度本身」而不是衰减量');
ok(/uint8_t hc_r, hc_g, hc_b;/.test(h2) && /uint8_t hc_mode;/.test(h2) && /uint16_t hg_first;/.test(h2) && /uint8_t lit;/.test(h2) &&
   /uint8_t tw_max;/.test(h2) && /uint16_t tw_on;/.test(h2) && /uint16_t tw_fade;/.test(h2) && /uint8_t tw_mode;/.test(h2),
   '末尾再追加 hc_r / hc_g / hc_b + hc_mode + hg_first + lit + tw_max / tw_on / tw_fade / tw_mode');
ok(layRows[0][21] === 255 && layRows[0][22] === 255 && layRows[0][23] === 255 &&
   layRows[0][24] === 0 && layRows[0][25] === 0xFFFF && layRows[0][26] === 0 &&
   layRows[0][27] === 0 && layRows[0][28] === 0 && layRows[0][29] === 0 && layRows[0][30] === 0,
   `普通图层：头部白 / 跟配色 / 跟随效果渐变 / 初始常亮 0 / 随机闪慢档参数 0（含样式）`);
/* 每效果平滑 T：效果行**末尾**追加 smooth_ms；2026-10-29 第三十六轮再加第 31 列 step_fast（跳变的快拍） */
{
  const e0c = numsOf(effRows[0]);                 /* hdr：默认 9 条内建 → 0 */
  const e3c = numsOf(e3row);                      /* h2：第 3 条是 newCustomEffect → 60 */
  ok(e0c.length === 31 && e0c[29] === 0 && e3c.length === 31 && e3c[29] === 60,
     `效果行 ${e0c.length} 列，倒数第 2 列 smooth_ms = 内建 ${e0c[29]} / 新效果 ${e3c[29]}（老工程直通、新效果出厂 60）`);
  ok(e0c[30] === 0 && e3c[30] === 0,
     `末尾新列 step_fast（跳变快拍）= ${e0c[30]} / ${e3c[30]}（内建 / 新效果缺省 0 = 关）`);
  ok(layRows[0].slice(31, 39).every(v => v === 0xFFFF),
     `图层行末尾 8 列 hg_ring[8] 全 = 0xFFFF（每段同色）: ${layRows[0].slice(31, 39).join(',')}`);
ok(/uint16_t hg_ring\[8\];/.test(h2) && h2.indexOf('uint16_t hg_ring[8];') > h2.indexOf('uint8_t tw_mode;'),
     '结构体末尾追加 uint16_t hg_ring[8]（渐变层每段各用哪条色环）');
  ok(h2.indexOf('uint16_t smooth_ms;') > h2.indexOf('uint8_t grad_step;') &&
     /uint16_t smooth_ms;\s+\/\* per-effect smoothing time in ms/.test(h2),
     '结构体里 smooth_ms 排在 grad_step 之后，注释说明「只在慢档 / 0 = 关」');
  ok(h2.indexOf('uint8_t step_fast;') > h2.indexOf('uint16_t smooth_ms;') &&
     /uint8_t step_fast;\s+\/\* step fast beat/.test(h2),
     '结构体末尾追加 uint8_t step_fast（跳变快拍：快档取消渐灭、每 N 拍换色；0 = 关）');
  ok(/led_gen_smooth_step\(E->smooth_ms\)/.test(h2) &&
     /memcpy\(led_gen_shown\[z\], led_gen_zone_mask, len\)/.test(h2) &&
     /memset\(led_gen_shown, 0, sizeof\(led_gen_shown\)\)/.test(h2),
     '渲染器里有平滑步长 / 直通同步 / 换模式清零（fast 或 smooth = 0 时整体 memcpy）');
}
/* 阈值随导出走：刻度与阈值都是宏，判档在生成代码里（不再依赖固件那条 ring_set_audio_level()） */
ok(/#define LED_GEN_AUDIO_MAX\s+20u/.test(h2) && /#define LED_GEN_FFT_THRESHOLD\s+\d+u/.test(h2),
   '导出带音量刻度 / 阈值两个宏（LED_GEN_AUDIO_MAX / LED_GEN_FFT_THRESHOLD）: '
   + ((h2.match(/#define LED_GEN_(AUDIO_MAX|FFT_THRESHOLD).*/g) || []).join(' | ')));
ok(/#define LED_GEN_AUDIO_SAMPLE_MS\s+40u/.test(h2) && /#define LED_GEN_STAGE_HOLD_MS\s+460u/.test(h2),
   '采样周期 / 快档阻尼也导出成宏（40ms、450→460ms 向上取整）: '
   + ((h2.match(/#define LED_GEN_(AUDIO_SAMPLE_MS|STAGE_HOLD_MS).*/g) || []).join(' | ')));
ok(/static void led_gen_audio_step\(void\)/.test(h2) &&
   /led_gen_audio_lvl > \(uint8_t\)LED_GEN_FFT_THRESHOLD/.test(h2) &&
   /led_gen_stage != 0u/.test(h2) &&
   /uint8_t led_gen_hal_audio_level\(void\);/.test(h2),
   '生成的 tick 自己跑「每 40ms 采样 + 快档迟滞」再判档（平台只需要实现 led_gen_hal_audio_level）');
/* 刻度上限也随导出走（工具里可自定义，出厂 20）：阈值按最大值夹 */ 
{
  const stA = JSON.parse(JSON.stringify(st2));
  stA.anim = Object.assign({}, stA.anim || {}, { audioMax: 40, thr: 30 });
  const hA = exportEffectsC(stA, { form:'header', comment:'ascii', eol:'lf' });
  const stB = JSON.parse(JSON.stringify(st2));
  stB.anim = Object.assign({}, stB.anim || {}, { audioMax: 40, thr: 999 });
  const hB = exportEffectsC(stB, { form:'header', comment:'ascii', eol:'lf' });
  ok(/#define LED_GEN_AUDIO_MAX\s+40u/.test(hA) && /#define LED_GEN_FFT_THRESHOLD\s+30u/.test(hA) &&
     /#define LED_GEN_FFT_THRESHOLD\s+40u/.test(hB),
     '刻度上限也随导出走：音频上限 40 → LED_GEN_AUDIO_MAX 40；阈值 30 原样、999 夹到 40: '
     + ((hA.match(/#define LED_GEN_(AUDIO_MAX|FFT_THRESHOLD).*/g) || []).join(' | ')));
}
ok(!/ring->speed_cur\s*<=/.test(h2),
   '不再从 ring->speed_cur 读档位 —— 那条路要平台按同一个阈值改档，两处容易分家');
{
  const stT = JSON.parse(JSON.stringify(st2));
  stT.anim = Object.assign({}, stT.anim || {}, { thr: 9 });
  const hT = exportEffectsC(stT, { form:'header', comment:'ascii', eol:'lf' });
  ok(/#define LED_GEN_FFT_THRESHOLD\s+9u/.test(hT) && !/#define LED_GEN_FFT_THRESHOLD\s+4u/.test(hT),
     '工具里把阈值改成 9，导出的 LED_GEN_FFT_THRESHOLD 就变成 9（固件不用再手改宏）');
}

console.log('--- 内建「单点追逐」由生成代码自画（不再调平台原语，平顶光带）---');
ok(hdr.includes('static void led_gen_anim_chase_single(uint8_t *mask, uint8_t len, int16_t pos, uint8_t width)'),
   '生成头里自带 led_gen_anim_chase_single()');
ok(hdr.includes('led_gen_anim_chase_single(mask, len, zpos, led_gen_scaled(E->width, len, 1u)); break;'),
   'ANIM_CHASE_SINGLE 分支调的是它（宽度仍按分区长度等比缩放）');
ok(!/^\s*anim_render_chase_single\s*\(/m.test(hdr),
   '平台那个同名原语一次都没被调用（契约账本因此少 1 个符号）');
ok(/if \(ad < hw\) mask\[i\] = 255u;/.test(hdr),
   '平顶：带内一律 255，没有边缘衰减（这一句就够，不必查 cos_window_tbl）');
ok(hdr.includes('anim_render_chase_dual') && hdr.includes('anim_render_swing') && hdr.includes('anim_render_fill'),
   '双点 / 摆动 / 填充仍走平台原语（这批只改单点追逐）');

console.log('--- 头文件结构 ---');
ok(hdr.includes('#ifndef __LED_EFFECTS_GEN_H__'), '有 include guard');
ok(hdr.includes('@author  LED layout editor (Automatic generated)'), '照抄了 Automatic generated 的作者标记');
ok(hdr.includes('#ifdef LED_EFFECTS_GEN_RENDER'), '渲染实现住在宏开关里');
ok(hdr.includes('void led_gen_apply_mode(ring_t *ring, uint8_t mode_idx);'), '服务层要的三个原型都在');
ok(hdr.includes('led_gen_render_mode') && hdr.includes('led_gen_tick'), '渲染与推进函数都有');
ok(hdr.includes('static const led_gen_inst_t') === false && /led_gen_inst\[LED_GEN_MAX_INST\]/.test(hdr), '实例数组按 LED_GEN_MAX_INST 开');

console.log('--- 换行与编码 ---');
const crlf = exportEffectsC(st, { form:'header', comment:'ascii', eol:'crlf' });
ok(!/\n/.test(crlf.replace(/\r\n/g, '')), 'crlf 模式下没有裸 LF');
const NL = String.fromCharCode(10);
const nonAscii = crlf.split(NL).map((l, i) => [i + 1, l])
  .filter(r => { for (let k = 0; k < r[1].length; k++) if (r[1].charCodeAt(k) > 126) return true; return false; });
ok(nonAscii.length === 0, nonAscii.length
   ? 'ASCII 模式仍有 ' + nonAscii.length + ' 行含非 ASCII，首个: 第 ' + nonAscii[0][0] + ' 行 ' + JSON.stringify(nonAscii[0][1].slice(0, 70))
   : 'ASCII 模式全文件无非 ASCII 字节');
ok(!crlf.startsWith(String.fromCharCode(0xFEFF)), '不写 BOM');
ok(!crlf.includes('</script'), '不含 </script');
const zh = exportEffectsC(st, { form:'header', comment:'zh', eol:'crlf' });
ok(/[一-龥]/.test(zh), '中文注释模式确实输出了中文');

console.log('--- 补丁横幅 ---');
const b = hdr.slice(hdr.indexOf('ONE-TIME MANUAL PATCH'));
const body = b.slice(0, b.indexOf('*/'));
ok(b.length > 100, '横幅存在（ASCII 模式为英文）');
ok(!body.includes('*/'), '横幅内没有裸的 */');
['inc/led_ring.h', 'device/led_ring.c', 'services/spimled_service.c',
 'led_gen_render_mode', 'led_gen_tick', 'led_gen_apply_mode', 'gen_tick'].forEach(k => {
  ok(body.includes(k), `横幅提到 ${k}`);
});
ok(/RING_PRESET_COUNT 9/.test(body), '横幅提到要注释掉旧的 RING_PRESET_COUNT 9');

console.log('--- 粘贴块 ---');
const paste = exportEffectsC(st2, { form:'paste', comment:'ascii', eol:'lf' });
ok(paste.includes('【1】') || paste.includes('[1]'), '粘贴块含补丁指引');

console.log('--- F5) 图层「启用」：旁路的层照样写进表里，只是合成时跳过 ---');
{
  const st3 = projectFromPreset(PRESET_SP3122D);
  const mkFill = (level, en) => ({ kind:'fill', level, pulse_period:0, pulse_amp:0, wave:0,
    direction:1, bounce:0, spans:0, rotate:0, en });
  st3.effects.list[3] = Object.assign(newCustomEffect(3, '两段红'),
    { layers: [mkFill(255, 0), mkFill(80, 1)] });
  const h5 = exportEffectsC(st3, { form:'header', comment:'ascii', eol:'lf' });
  ok(/uint8_t en;\s+\/\* 1 = enabled/.test(h5), '结构体里有 en 字段（注释写明 1/0 的含义）');
  ok(h5.includes('if (!L->en) continue;'), 'C 的图层循环跳过被旁路的层');
  const l5 = h5.slice(h5.indexOf('static const led_gen_layer_t'),
                      h5.indexOf('};', h5.indexOf('static const led_gen_layer_t')));
  const r5 = (l5.match(/^    \{.*\},/gm) || []).map(numsOf);
  ok(r5.length === 2 && r5.every(r => r.length === 40) && r5[0][1] === 0 && r5[1][1] === 1,
     `两层的 en 标记 = ${r5.map(r => r[1]).join(',')}（期望 0,1；旁路的层没有被删掉，字段数仍是 40）`);
  ok(r5[0][0] === 2 && r5[1][0] === 2, '两层都还是填充图层（kind=2），表行数不因旁路而变');
  const zh5 = exportEffectsC(st3, { form:'header', comment:'zh', eol:'lf' });
  ok(/被旁路的层/.test(zh5), '中文注释模式下那条 continue 的说明是中文（ASCII 模式走英文，见上面整体检查）');
}

console.log(fails ? `\n=== ${fails} 项未通过 ===` : '\n=== 全部通过 ===');
process.exit(fails ? 1 : 0);
