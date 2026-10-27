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
/* F5: 字段顺序 kind, en, count, ...（en 紧跟 kind），末尾是 wave, flags, spacing, flash_fast, flash_on, flash_low */
const layRows = (lay.match(/^    \{[^}]*\},/gm) || []).map(numsOf);
ok(layRows.length === 1 && layRows[0].length === 21 && layRows[0][0] === 2 && layRows[0][1] === 1,
   `图层行 ${layRows[0] ? layRows[0].length : 0} 个数值：kind=${layRows[0] && layRows[0][0]} en=${layRows[0] && layRows[0][1]}（期望 21 个 / 2 / 1）`);
ok(/uint8_t spacing;\s+\/\* SPOT: centre distance/.test(h2),
   '结构体末尾多了 spacing（光点间距，0 = 按 count 均布）');
ok(/uint8_t flash_fast;/.test(h2) && /uint8_t flash_on;/.test(h2) && /uint8_t flash_low;/.test(h2) &&
   h2.indexOf('uint8_t flash_fast;') > h2.indexOf('uint8_t spacing;') &&
   h2.indexOf('uint8_t flash_low;') > h2.indexOf('uint8_t flash_on;'),
   '末尾再追加 flash_fast / flash_on / flash_low 三列（有音乐间隔 / 亮的时间 / 最低亮度），前面的列一列没挪位');
ok(/uint8_t flash_low;\s+\/\* audio flash: brightness during the dark frames/.test(h2),
   'flash_low 的注释说清了它填的是「亮度本身」而不是衰减量');

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
  const r5 = (l5.match(/^    \{[^}]*\},/gm) || []).map(numsOf);
  ok(r5.length === 2 && r5.every(r => r.length === 21) && r5[0][1] === 0 && r5[1][1] === 1,
     `两层的 en 标记 = ${r5.map(r => r[1]).join(',')}（期望 0,1；旁路的层没有被删掉，字段数仍是 21）`);
  ok(r5[0][0] === 2 && r5[1][0] === 2, '两层都还是填充图层（kind=2），表行数不因旁路而变');
  const zh5 = exportEffectsC(st3, { form:'header', comment:'zh', eol:'lf' });
  ok(/被旁路的层/.test(zh5), '中文注释模式下那条 continue 的说明是中文（ASCII 模式走英文，见上面整体检查）');
}

console.log(fails ? `\n=== ${fails} 项未通过 ===` : '\n=== 全部通过 ===');
process.exit(fails ? 1 : 0);
