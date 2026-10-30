/* 模拟「关掉工具再打开」：连跑两次界面层，共享同一份 localStorage */
import fs from 'node:fs';
const html = fs.readFileSync('led_layout_editor.html','utf8');
const coreSrc = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
const uiSrc   = html.match(/<script id="ui">([\s\S]*?)<\/script>/)[1];
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};

const listeners = {};
const byId = new Map();
const fills = [];                       /* 编辑台画过的 fillStyle（查「改了配色有没有真的重画」） */
const CTX = new Proxy({}, { get:(t,k)=> (k in t ? t[k] : (t[k]=()=>{})), set:(t,k,v)=>{ if (k === 'fillStyle') fills.push(v); t[k]=v; return true; } });
const store = new Map();

function mkEl(tag='div', id=''){ return {
  tagName:(tag||'div').toUpperCase(), id, _ch:[], style:{}, dataset:{}, checked:false,
    get value(){ return this._v === undefined ? '' : this._v; },
    set value(v){ this._v = String(v); },
  textContent:'', disabled:false, files:[], clientWidth:1200, clientHeight:900, width:1200, height:900,
    get innerHTML(){ return this._html || ''; },
    set innerHTML(v){ this._html = v; if (v === '') this._ch = []; },
  get children(){return this._ch;}, set children(v){this._ch=v;},
    get className(){ return this._cn !== undefined ? this._cn : [...this.classList._s].join(' '); },
    set className(v){ this._cn = v; this.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); },
    classList:{_s:new Set(),add(c){this._s.add(c);},remove(c){this._s.delete(c);},
             toggle(c,f){f===undefined?(this._s.has(c)?this._s.delete(c):this._s.add(c)):(f?this._s.add(c):this._s.delete(c));},
             contains(c){return this._s.has(c);}},
  appendChild(c){if(c&&c.id)byId.set(c.id,c);this._ch.push(c);return c;}, insertBefore(c){if(c&&c.id)byId.set(c.id,c);this._ch.unshift(c);return c;},
  get firstChild(){return this._ch[0]||null;},
  remove(){}, focus(){}, select(){}, click(){if(this.onclick)this.onclick();},
  setPointerCapture(){}, getBoundingClientRect(){return {left:0,top:0,width:1200,height:900};},
  addEventListener(t,f){(listeners[id+':'+t] ||= []).push(f);},
  getContext(){return CTX;}, toBlob(cb){cb({});},
}; }
const dynIds = new Set([...html.matchAll(/\.id\s*=\s*'([^']+)'/g)].map(m=>m[1]));
function install(){
  for (const k of Object.keys(listeners)) delete listeners[k];
  byId.clear();
  globalThis.localStorage = { getItem:k=>store.has(k)?store.get(k):null, setItem:(k,v)=>{store.set(k,v);}, removeItem:k=>store.delete(k) };
  globalThis.performance = { now:()=>Date.now() };
  globalThis.requestAnimationFrame = ()=>0; globalThis.devicePixelRatio = 1;
  globalThis.Image = class { set src(v){this._s=v;} get src(){return this._s;} };
  globalThis.FileReader = class { readAsText(){} readAsDataURL(){} };
  globalThis.Blob = class {}; globalThis.URL = { createObjectURL:()=>'b', revokeObjectURL(){} };
  try { Object.defineProperty(globalThis,'navigator',{value:{clipboard:{writeText:()=>Promise.resolve()}},configurable:true}); } catch(e){}
  globalThis.alert = ()=>{}; globalThis.confirm = ()=>true; globalThis.prompt = (m,d)=>d||'X';
  const q = sel => { if (sel.startsWith('#')) { const id=sel.slice(1);
      if (byId.has(id)) return byId.get(id);
      if(!ids.has(id) && !dynIds.has(id)) return null;
      byId.set(id, mkEl('div',id)); return byId.get(id); }
    if(!byId.has('body')) byId.set('body', mkEl('body','body')); return byId.get('body'); };
  globalThis.document = {
    documentElement:{attrs:{},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]||null;}},
    querySelector:q,
    querySelectorAll(sel){
      if (sel === '#left button[data-mode]') return byId.get('left')?.children || [];
      if (sel === '#tabs button') {
        if (!byId.has('tabCache')) byId.set('tabCache', [...html.matchAll(/data-tab="([a-z]+)"/g)].map(m=>{const e=mkEl('button');e.dataset={tab:m[1]};return e;}));
        return byId.get('tabCache');
      }
      return [];
    },
    createElement:t=>mkEl(t,''), body:{appendChild(){}}, addEventListener(){}, execCommand(){return true;},
  };
  globalThis.window = { addEventListener(t,f){(listeners['window:'+t] ||= []).push(f);}, devicePixelRatio:1 };
  globalThis.addEventListener = globalThis.window.addEventListener;
}
const boot = () => new Function(coreSrc + '\n' + uiSrc)();

const decode = () => { const raw = store.get('led_layout_editor.v1'); return raw ? JSON.parse(raw) : null; };


/* ---- 动效测试专用：拿到 core 的导出能力 + 固件真身 fixture ---- */
const coreSrcFx = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
const CORE = new Function(coreSrcFx + '\n; return CORE;')();
const exportEffectsC = CORE.exportEffectsC;
const fwRows = fs.readFileSync('tests/fixtures/fw_g_presets.txt', 'utf8')
                 .split(String.fromCharCode(10)).map(l => l.trim()).filter(l => l.startsWith('{'));

const bootErr = null;

install(); boot(); await new Promise(r => setTimeout(r, 700));

/* ============ 动效页：预置效果 / 新图层字段 ============ */
const click = id => byId.get(id).onclick();
const projState = i => JSON.parse(store.get('led_layout_editor.v1')).projects[i].state;
const fxListOf  = i => projState(i).effects.list;
const tabBtn = t => (byId.get('tabCache') || []).find(b => b.dataset.tab === t);

/* ---- 1) 打开动效页 ---- */
ok(!!tabBtn('fx'), '动效页签存在');
tabBtn('fx').onclick();
ok(((byId.get('fxTbl') || {}).children || []).length === 9, '动效列表渲染出 9 个效果');

/* ---- 2) 预置下拉有模板 ---- */
const pp = byId.get('fxPresetPick');
ok((pp.children || []).length >= 10, `预置模板有 ${(pp.children || []).length} 个`);
const names = (pp.children || []).map(o => o.value);
['单点追逐','拖尾彗星','摆动(往返)','多彩呼吸','闪烁','多彩跳变','绕环彩虹(旋转)','沿环渐变','双向填充','随机闪']
  .forEach(n => ok(names.indexOf(n) >= 0, `预置里有「${n}」`));
/* 2026-10-29 第三十五轮：「七彩跳变」「多色呼吸」并进同类模板（只差调色板 / 包络），不再单列 */
['七彩跳变','多色呼吸'].forEach(n => ok(names.indexOf(n) < 0, `预置里已经没有「${n}」（并入同类模板）`));

/* ---- 3) 套用「绕环彩虹(旋转)」---- */
byId.get('fxTbl').children[0].onclick();          // 选中槽位 0
pp.value = '绕环彩虹(旋转)';
click('fxPresetApply');
await new Promise(r => setTimeout(r, 700));
const e0 = fxListOf(0)[0];
ok(e0.kind === 'custom', '套用后变成自定义动效');
ok(e0.layers.length === 1 && e0.layers[0].kind === 'fill', `图层: ${e0.layers.map(l => l.kind).join('+')}`);
ok(e0.color === CORE.FW.COLOR.RAINBOW, `配色 = 效果级「彩虹」（${e0.color}）：图层不再自带空间色相`);
ok(e0.levels >= 6, `级数 = ${e0.levels}（走完一轮红→红要多少颗灯）`);
ok(e0.hue_speed > 0, `彩虹旋转 = ${e0.hue_speed}（每 N 帧转一格）`);
ok(!('cmode' in e0.layers[0]) && !('hue_spread' in e0.layers[0]),
   '图层里没有 cmode / hue_*（「本层取色」已退休）');

/* ---- 4) 图层编辑器渲染出新控件 ---- */
const layerBox = byId.get('fLayers');
ok(layerBox.children.length === 1, '图层编辑器渲染了 1 行');
const ctrls = [], layNums = [];
(function walk(n) { (n.children || []).forEach(c => {
  if (c.tagName === 'SELECT') ctrls.push(c);
  if (c.tagName === 'INPUT' && c.type === 'number') layNums.push(c);
  walk(c); }); })(layerBox.children[0]);
ok(!ctrls.some(s => (s.children || []).some(o => /空间色相/.test(o.textContent))),
   '图层卡上没有「本层取色」下拉（颜色只在色彩配置里选）');
ok(!ctrls.some(s => (s.children || []).some(o => /方波|锯齿/.test(o.textContent))),
   '图层卡上没有「波形」下拉');
ok(ctrls.length === 0, `填充层只剩数字框，没有任何下拉（${ctrls.length} 个）`);
/* 「有音乐间隔 / 亮的时间」只属于音控闪层（预置「闪烁」）：普通填充层只显示 3 格 */
ok(layNums.length === 3,
   `普通填充层 3 个数字框（亮度 / 脉动周期 / 脉动深度），实际 ${layNums.length}`);

/* ---- 5) 套用「摆动(往返)」应带上 bounce ---- */
pp.value = '摆动(往返)'; click('fxPresetApply');
await new Promise(r => setTimeout(r, 700));
const e0b = fxListOf(0)[0];
ok(e0b.layers[0].kind === 'spot' && e0b.layers[0].bounce === 1, '摆动模板带上了往返标记');
ok(e0b.moves === true, '摆动模板会随位置前进');

/* ---- 6) 套用「闪烁」= 音控闪（不是固定方波） ----
 * 2026-10-27 用户第二次描述：「无音乐/音乐信号小时每 5s 闪一次；有音乐时间隔变短，
 * 比如 500ms 闪一次；信号持续很大（超过阈值）就一直闪。间隔时间和闪烁亮的时间都可调。」
 * 并提醒固件照【CFG_FUNC_SPI_RGB_EN】的 PixelFlash()，不是【CFG_FUNC_LED_RING_EN】。
 * 第三次（同一天）：「填充亮度→最高亮度、闪完暗到→最低亮度，数值越大越亮（不能 255 = 最暗），
 * 三个时间按 ms 填，不要数拍子。」
 * 所以这条预置的填充层是 wave = 3（FLASH）+ 250 拍(5000ms) / 25 拍(500ms) / 亮 10 拍(200ms)
 * + 最低亮度 0（全灭）；图层卡上这五个框显示的是 ms 和亮度，不是拍和衰减量。 */
pp.value = '闪烁'; click('fxPresetApply');
await new Promise(r => setTimeout(r, 700));
const e0c = fxListOf(0)[0];
ok(e0c.layers[0].kind === 'fill' && e0c.layers[0].wave === 3,
   `闪烁模板用音控闪（wave = ${e0c.layers[0].wave}）`);
ok(e0c.layers[0].pulse_period === 250,
   `闪烁的没音乐间隔 = ${e0c.layers[0].pulse_period} 拍 = ${(e0c.layers[0].pulse_period * 20)} ms`);
ok(e0c.layers[0].flash_fast === 25 && e0c.layers[0].flash_on === 10,
   `有音乐间隔 ${e0c.layers[0].flash_fast} 拍 = ${(e0c.layers[0].flash_fast * 20)} ms、亮的时间 ${e0c.layers[0].flash_on} 拍 = ${(e0c.layers[0].flash_on * 20)} ms`);
ok(e0c.layers[0].flash_low === 0 && e0c.layers[0].level === 255,
   '闪烁：亮的时候满亮（最高亮度 255）、灭的时候全灭（最低亮度 0）');
/* 闪烁的图层卡：五个数字框，标签换成闪的说法，时间按 ms、亮度按亮度值显示 */
{
  const box = byId.get('fLayers').children[0];
  const nums = [], labels = [];
  (function walk(n) { (n.children || []).forEach(c => {
    if (c.tagName === 'INPUT' && c.type === 'number') nums.push(c);
    if (c.className === 'row' && c.children && c.children[0]) labels.push(c.children[0].textContent);
    walk(c); }); })(box);
  const txt = labels.join('/');
  ok(nums.length === 5,
     `音控闪的图层卡 5 个数字框（最高亮度 / 没音乐间隔 / 最低亮度 / 有音乐间隔 / 亮的时间），实际 ${nums.length}`);
  ok(txt.indexOf('最高亮度') >= 0 && txt.indexOf('最低亮度') >= 0 &&
     txt.indexOf('没音乐时闪的间隔(ms)') >= 0 && txt.indexOf('有音乐间隔(ms)') >= 0 &&
     txt.indexOf('亮的时间(ms)') >= 0 && txt.indexOf('闪完暗到') < 0 && txt.indexOf('脉动深度') < 0,
     `标签跟着换成闪的说法：${txt}`);
  ok(nums.map(n => n.value).join('/') === '255/5000/0/500/200',
     `五个框的初值 = ${nums.map(n => n.value).join('/')}（最高亮度 / 没音乐间隔 ms / 最低亮度 / 有音乐间隔 ms / 亮的时间 ms）`);
  /* 单位真的是 ms：那三格（间隔 / 有音乐间隔 / 亮的时间）的上限和步长都是 20 ms 的整拍，
     不是 0..255 的拍数；「最低亮度」那格还是 0..255 的亮度值。 */
  const msBoxes = [nums[1], nums[3], nums[4]];
  ok(msBoxes.every(n => String(n.max) === '1310700' && String(n.step) === '20') &&
     String(nums[2].max) === '255',
     `三个时间框的上限 ${msBoxes.map(n => n.max).join('/')}、步长 ${msBoxes.map(n => n.step).join('/')}（uint16 帧 × 20 ms = 最长 21.8 分钟，不再是 5100）；最低亮度上限 ${nums[2].max}`);
  /* 在框里填 3000 → 图层里存 150 拍（填的就是实际时间，不用自己数拍子） */
  msBoxes[0].value = '3000'; msBoxes[0].oninput();
  await new Promise(r => setTimeout(r, 700));
  ok(fxListOf(0)[0].layers[0].pulse_period === 150,
     `填「没音乐时闪的间隔」= 3000 ms → 图层 pulse_period = ${fxListOf(0)[0].layers[0].pulse_period} 拍`);
  /* 填不成整拍的毫秒数：离开输入框时显示回落到的实际值（与预览 / 固件一致） */
  msBoxes[0].value = '3010'; msBoxes[0].oninput();
  if (msBoxes[0].onchange) msBoxes[0].onchange();
  await new Promise(r => setTimeout(r, 700));
  ok(fxListOf(0)[0].layers[0].pulse_period === 151 && msBoxes[0].value === '3020',
     `填 3010 ms → 落到 ${fxListOf(0)[0].layers[0].pulse_period} 拍，框里回显 ${msBoxes[0].value} ms（20 ms 粒度）`);
  /* 超过旧上限（5100 ms）也要能填：10 分钟 = 600000 ms = 30000 拍。
   * 老写法（uint8 帧 / max 5100）在这里会被夹回 5100 ms。 */
  msBoxes[0].value = '600000'; msBoxes[0].oninput();
  if (msBoxes[0].onchange) msBoxes[0].onchange();
  await new Promise(r => setTimeout(r, 700));
  ok(fxListOf(0)[0].layers[0].pulse_period === 30000 && msBoxes[0].value === '600000',
     `填 600000 ms（10 分钟）→ 图层 pulse_period = ${fxListOf(0)[0].layers[0].pulse_period} 拍、框里回显 ${msBoxes[0].value}（上限不再是 5100）`);
}

/* ---- 7) 导出的 C：图层不带颜色，彩虹在效果行 ---- */
pp.value = '绕环彩虹(旋转)'; click('fxPresetApply');
await new Promise(r => setTimeout(r, 700));
byId.get('xForm').value = 'header'; byId.get('xCmt').value = 'ascii'; byId.get('xEol').value = 'lf';
click('xBuild');
const out = byId.get('xOut').value;
ok(!out.includes('LED_GEN_CMODE') && !out.includes('led_gen_hue_of') &&
   !/uint8_t hue_base;\s+\/\* spatial/.test(out), '导出的 C 里没有「本层取色」那套（cmode / hue_of）');
ok(!/uint8_t hue_spread;/.test(out), '图层结构体不再有 hue_spread / hue_speed 列');
ok(out.includes('led_gen_hue[ZONE_MAX_LEN]'), '导出的 C 仍有每灯位色相数组（彩虹 / 覆盖用）');
ok(/^    \{ 2, 1, 1, 8, 0, 0, 0, 0, 48, 4, 0, 255, 255, 0, 0, 0 \},/m.test(out) ||
   /^    \{ 2,.*\},/m.test(out),
   '图层行 = 17 列（没有 hue/cmode）: ' + (out.match(/^    \{ 2,.*/m) || ['(没找到)'])[0]);

const eblk = out.slice(out.indexOf('static const led_gen_effect_t'));
const eblkRows = (eblk.match(/^    \{.*\},/gm) || []);
/* 2026-10-29 第三十六轮：效果行末尾又多了 step_fast → 31 列。这里按数值逐列断，别再数正则。 */
{
  const nums = String(eblkRows[0] || '').replace(/\/\*.*$/, '').replace(/[{},\s]/g, ' ')
                 .trim().split(/\s+/).map(Number);
  ok(nums.length === 31 && nums[0] === 1 && nums[4] === 4 && nums[12] === 8 && nums[13] === 1 &&
     nums[15] === 1 && nums[30] === 0,
     `效果行 = kind=1 / ctype=4（彩虹）/ 慢速 8 / 快速 1 / 1 个图层 / 31 列（末尾 渐亮·亮·变暗 + 渐变两列 + 平滑 + 快拍）: ${(eblkRows[0] || '(无)').slice(0, 70)}…`);
}



/* ---- 8) 起始位也能存 ---- */
const off = byId.get('fOffset');
off.value = '64'; off.oninput({ target: off });
await new Promise(r => setTimeout(r, 700));
ok(fxListOf(0)[0].offset === 64, `起始位存进了效果: ${fxListOf(0)[0].offset}`);

/* ---- 9) 关掉再打开，预置套用的结果要还在 ---- */
install(); boot(); await new Promise(r => setTimeout(r, 700));
const e9 = fxListOf(0)[0];
ok(e9.kind === 'custom' && e9.color === CORE.FW.COLOR.RAINBOW, '重开后效果级彩虹配色还在');
ok(e9.offset === 64, '重开后起始位还在');

/* ---- 10) 新配色：彩虹 / 跳变 / 呼吸 / 覆盖 的界面与参数 ---- */
console.log('--- 新配色（效果级）---');
{
  const col = byId.get('fColor');
  const pick = byId.get('fxPresetPick');
  const show = id => (byId.get(id).style.display !== 'none');
  const palCells = () => (byId.get('fPalette').children || []).filter(c => c.classList && c.classList.contains('palcell'));
  const palN = () => palCells().length;

  pick.value = '绕环彩虹(旋转)'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  const eR = fxListOf(0)[0];
  ok(eR.color === CORE.FW.COLOR.RAINBOW && eR.levels === 30,
     `彩虹预置：color=${eR.color} levels=${eR.levels}`);
  ok(show('rowLevels') && show('rowHueBase') && show('rowHueSpeed'), '彩虹模式：级数 / 起点 / 旋转三行都出来');
  ok(!show('rowPal') && !show('rowSpeed'), '彩虹模式：调色板与速度行收起');

  const lv = byId.get('fLevels');
  lv.value = '40'; lv.oninput({ target: lv });
  await new Promise(r => setTimeout(r, 700));
  ok(fxListOf(0)[0].levels === 40, `级数改成 40 已存盘: ${fxListOf(0)[0].levels}`);

  col.value = String(CORE.FW.COLOR.STEP);
  col.onchange({ target: col });
  await new Promise(r => setTimeout(r, 700));
  ok(show('rowPal') && show('rowSpeed'), '跳变：调色板与「停留」都出来');
  ok(show('rowHold') && show('rowFade') && show('rowRise'), '跳变：渐亮(拍) / 亮(拍) / 变暗(拍) 三行都出来');
  ok(byId.get('fSpeedLab').textContent === '停留(ms)', `跳变的数值叫「停留(ms)」: ${byId.get('fSpeedLab').textContent}`);
  const n0 = palN();
  click('fxPalAdd');
  await new Promise(r => setTimeout(r, 700));
  ok(fxListOf(0)[0].palette.length === n0 + 1 && palN() === n0 + 1,
     `加一个颜色：${n0} → ${fxListOf(0)[0].palette.length}`);
  click('fxPalDel');
  await new Promise(r => setTimeout(r, 700));
  ok(fxListOf(0)[0].palette.length === n0, `删一个颜色：回到 ${n0}`);
  /* 上限 16 个：一路点 + 到 16 个（PAL_MAX），第 17 次只提示、不再涨 */
  for (let i = 0; i < 15; i++) click('fxPalAdd');
  const stMsg = byId.get('status').textContent;
  await new Promise(r => setTimeout(r, 900));
  ok(fxListOf(0)[0].palette.length === 16 && /16/.test(stMsg),
     `色板最多 16 个（存盘后 ${fxListOf(0)[0].palette.length} 个｜${stMsg}）`);

  /* 渐亮 / 亮 / 变暗：改了立刻落盘，并且「停留」自动 = 三者之和（那一格只读，不用手填）。
   * 三个框都是 **ms**（内部存拍、向上取整）：80ms = 4 拍、120ms = 6 拍、180ms = 9 拍。 */
  const rIn = byId.get('fRise'), hIn = byId.get('fHold'), fIn = byId.get('fFade'), spIn = byId.get('fSpeed');
  ok(spIn.readOnly === true, '跳变时「停留」是自动算的（只读）');
  hIn.value = '120'; hIn.oninput({ target: hIn });
  await new Promise(r => setTimeout(r, 700));
  ok(fxListOf(0)[0].hold === 6 && fxListOf(0)[0].speed === 6 && spIn.value === '120',
     `只改「亮」：填 120ms（6 拍）→ 停留 ${fxListOf(0)[0].speed} 拍 = ${spIn.value}ms`);
  rIn.value = '80'; rIn.oninput({ target: rIn });
  await new Promise(r => setTimeout(r, 700));
  ok(fxListOf(0)[0].rise === 4 && fxListOf(0)[0].speed === 10 && spIn.value === '200',
     `渐亮 80ms(4 拍) + 亮 120ms(6 拍) → 停留 ${fxListOf(0)[0].speed} 拍 = ${spIn.value}ms`);
  fIn.value = '180'; fIn.oninput({ target: fIn });
  await new Promise(r => setTimeout(r, 700));
  ok(fxListOf(0)[0].rise === 4 && fxListOf(0)[0].hold === 6 && fxListOf(0)[0].fade === 9 &&
     fxListOf(0)[0].speed === 19 && spIn.value === '380',
     `渐亮 4 + 亮 6 + 暗 9 → 停留 19 拍自动填好（${spIn.value}ms）`);
  /* 停留是 8 位：三段加起来超 255 时封顶，状态栏说明（不会静默改数） */
  hIn.value = '5000'; hIn.oninput({ target: hIn });
  await new Promise(r => setTimeout(r, 700));
  ok(fxListOf(0)[0].speed === 255 && /255/.test(byId.get('status').textContent),
     `三段加起来超过 255 拍：停留封顶 255（speed=${fxListOf(0)[0].speed}｜${byId.get('status').textContent}）`);

  /* 纯色：调色板只留 1 个可选色；多出来的「收起」而不是删掉 */
  const nPal = fxListOf(0)[0].palette.length;
  col.value = String(CORE.FW.COLOR.SOLID);
  col.onchange({ target: col });
  await new Promise(r => setTimeout(r, 700));
  ok(palN() === 1, `纯色只画 1 个色块（原本 ${nPal} 个）：${palN()}`);
  ok(byId.get('fPalLab').textContent === '颜色',
     `纯色那一行的标题改成「颜色」：${byId.get('fPalLab').textContent}`);
  ok(!show('fxPalAdd') && !show('fxPalDel'), '纯色：加 / 减颜色按钮都收起');
  ok(fxListOf(0)[0].palette.length === nPal, '收起不是删掉：存档里的颜色个数没变');
  {
    const tag = (byId.get('fPalette').children || []).find(c => c.className === 'palN');
    ok(!!tag && /收起/.test(tag.textContent), `色数标签说明「收起了几个」：${tag && tag.textContent}`);
  }
  col.value = String(CORE.FW.COLOR.STEP);
  col.onchange({ target: col });
  await new Promise(r => setTimeout(r, 700));
  ok(palN() === nPal && show('fxPalAdd') && show('fxPalDel'),
     `切回跳变：收起的颜色与加减按钮都回来（${palN()} 色）`);
  {
    const e5 = fxListOf(0)[0];
    ok(e5.speed === Math.min(255, e5.rise + e5.hold + e5.fade) &&
       +byId.get('fSpeed').value === e5.speed * 20 &&
       byId.get('fSpeed').readOnly === true,
       `切回跳变：停留还是 渐亮 + 亮 + 暗（${e5.rise} + ${e5.hold} + ${e5.fade} → ${e5.speed} 拍，格子 ${byId.get('fSpeed').value}ms）`);
  }

  col.value = String(CORE.FW.COLOR.SPECTRUM);
  col.onchange({ target: col });
  await new Promise(r => setTimeout(r, 700));
  ok(!show('rowPal') && show('rowSpeed'), '渐变：不要调色板（走自己的色环），只留速度');
  ok(byId.get('fSpeed').readOnly === false, '渐变时「速度」又能手填了（只读只属于跳变）');

  pick.value = '多彩呼吸'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  const eB = fxListOf(0)[0];
  ok(eB.color === CORE.FW.COLOR.BREATH && eB.period === 90 && eB.palette.length === 3,
     `呼吸预置：period=${eB.period} / ${eB.palette.length} 色（出厂手感 渐亮 40 + 亮 10，3 色轮换）`);
  ok(show('rowPeriod') && show('rowPal') && !show('rowSpeed'), '呼吸：周期 + 调色板');
  ok(palN() === 3 && show('fxPalAdd') && show('fxPalDel'),
     `呼吸：3 种颜色都画出来，加减还留着（${palN()} 色）`);
  /* 呼吸 = 对称的跳变：只有「渐亮=变暗」和「亮」两行，周期自动 = 渐亮×2 + 亮（只读） */
  ok(show('rowRise') && show('rowHold') && !show('rowFade'),
     '呼吸：渐亮 / 亮 两行都在，没有「变暗」那一行（渐亮 = 渐暗）');
  ok(byId.get('fRiseLab').textContent === '渐亮=变暗(ms)',
     `呼吸：渐亮那一格的标题换成「渐亮=变暗(ms)」（${byId.get('fRiseLab').textContent}）`);
  {
    const fr = byId.get('fRise').value, fh = byId.get('fHold').value, fp = byId.get('fPeriod');
    ok(+fp.value === (+fr) * 2 + (+fh) && fp.readOnly === true,
       `呼吸：周期只读、自动 = 渐亮 ${fr} × 2 + 亮 ${fh} = ${fp.value} ms`);
    byId.get('fRise').value = '20';          /* 20ms → 1 拍 */
    byId.get('fRise').oninput({ target: byId.get('fRise') });
    ok(+fp.value === 2 * 20 + (+fh),
       `呼吸：渐亮改成 20ms（1 拍）→ 周期当场算成 ${fp.value} ms`);
    await new Promise(r => setTimeout(r, 700));    /* 存盘是防抖的，读存档前等一拍 */
    const eB2 = fxListOf(0)[0];       /* 存档是新解析出来的对象，断言得重新取一次 */
    ok(eB2.b_rise === 1 && eB2.period === (2 + (+fh) / 20),
       `呼吸：两个数落盘（b_rise=${eB2.b_rise} / period=${eB2.period} 拍）`);
    ok(eB2.b_hold === 10 && eB2.rise === eB.rise && eB2.hold === eB.hold,
       `呼吸的数存在 b_rise / b_hold 上（${eB2.b_rise} / ${eB2.b_hold}），跳变的 rise/hold 没动（${eB2.rise} / ${eB2.hold}）`);
  }
  pick.value = '多彩呼吸'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  {
    const eB3 = fxListOf(0)[0];
    ok(eB3.period === 90 && eB3.b_rise === 40 && eB3.b_hold === 10 && byId.get('fRise').value === '800',
       `重新套呼吸预置：回到 period 90 / 渐亮 40 / 亮 10（${eB3.period} / ${eB3.b_rise} / ${eB3.b_hold}）—— 上一次改的 10 没赖着`);
  }
  /* 第一次切到呼吸（这一条从没设过 b_rise）：落出厂手感 40 / 10，而不是空着的 period/2 = 30。
   * 老存档不在此列 —— 它们加载时 b_rise 已经被 normalizeEffect 落成具体值了。 */
  {
    const e0 = fxListOf(0)[0];
    e0.b_rise = undefined; e0.b_hold = undefined;
    col.value = String(CORE.FW.COLOR.SOLID);
    col.onchange({ target: col });
    col.value = String(CORE.FW.COLOR.BREATH);
    col.onchange({ target: col });
    await new Promise(r => setTimeout(r, 700));
    const eN = fxListOf(0)[0];
    ok(eN.b_rise === 40 && eN.b_hold === 10 && eN.period === 90 && byId.get('fRise').value === '800',
       `第一次切到呼吸：落出厂手感 渐亮 40 / 亮 10 / 周期 ${eN.period} 拍（不是空着的 period/2）`);
  }
  /* ---- 「动画里的呼吸」和「色彩配置里的呼吸」是同一套（2026-10-27 用户提问） ----
   * 预置「呼吸」现在就是「静态 + 配色呼吸」，套完下面的配色下拉自己会变成「呼吸」；
   * 图层那边不再有一套平行的三角脉动（那两条路会让人以为有两个呼吸旋钮）。 */
  pick.value = '多彩呼吸'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  {
    const eP = fxListOf(0)[0];
    ok(eP.color === CORE.FW.COLOR.BREATH,
       `预置「呼吸」= 配色「呼吸」（color=${eP.color}），不是另一套填充层脉动`);
    ok(byId.get('fColor').value === String(CORE.FW.COLOR.BREATH),
       `套完之后「配色」下拉也停在「呼吸」（${byId.get('fColor').value}）`);
    ok(eP.period === 90 && eP.b_rise === 40 && eP.b_hold === 10,
       `预置「呼吸」带出厂手感：周期 ${eP.period} / 渐亮(=变暗) ${eP.b_rise} / 亮 ${eP.b_hold}`);
    ok(eP.layers.length === 1 && eP.layers[0].kind === 'fill' && !(eP.layers[0].pulse_amp | 0),
       '预置「呼吸」的图层只是满亮填充层（亮度起伏归色彩配置，不脉动）');
    ok(eP.palette.length === 3 && eP.palette.every(c => (c[0] | c[1] | c[2])),
       `预置「呼吸」的调色板是 3 个真颜色（红/绿/蓝）、没有纯黑：${JSON.stringify(eP.palette)}`);
    ok(palN() === 3 && !show('rowSpeed') && show('rowPeriod'),
       `界面上：3 个色块 / 周期行在 / 速度行收起（${palN()} 个色块）`);
  }
  /* 套用「单点追逐」这种只写了 c1 的预置：调色板不再凭空补一个纯黑第二色 */
  pick.value = '单点追逐'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  ok(fxListOf(0)[0].palette.length === 1,
     `预置只给 c1 时调色板也只有 1 个颜色（不补纯黑）：${JSON.stringify(fxListOf(0)[0].palette)}`);
  /* 纯黑条目在「呼吸」里 = 一个周期整条全灭（看着完全像动画停了）→ 切到呼吸时清掉。
   * 走真实路径：先切到跳变（两个色块都露出来）→ 把第 2 个调成纯黑 → 再切到呼吸。 */
  {
    col.value = String(CORE.FW.COLOR.STEP);
    col.onchange({ target: col });
    await new Promise(r => setTimeout(r, 700));
    click('fxPalAdd');
    await new Promise(r => setTimeout(r, 900));
    ok(fxListOf(0)[0].palette.length === 2 && palN() === 2,
       `跳变：加出一个第 2 颜色（${fxListOf(0)[0].palette.length} 个 / ${palN()} 个色块）`);
    palCells()[1].children[0].__cp.sv(1, 0);          /* 亮度 0 = 纯黑 */
    await new Promise(r => setTimeout(r, 900));
    ok(JSON.stringify(fxListOf(0)[0].palette[1]) === '[0,0,0]',
       `第 2 个颜色调成纯黑（${JSON.stringify(fxListOf(0)[0].palette[1])}）`);
    col.value = String(CORE.FW.COLOR.BREATH);
    col.onchange({ target: col });
    await new Promise(r => setTimeout(r, 900));
    const eK = fxListOf(0)[0];
    ok(eK.palette.length === 1 && palN() === 1,
       `切到呼吸：纯黑那条被去掉（剩 ${eK.palette.length} 个 / ${palN()} 个色块）—— 一个周期全灭太像「停了」`);
  }
  col.value = String(CORE.FW.COLOR.STEP);
  col.onchange({ target: col });
  await new Promise(r => setTimeout(r, 700));
  ok(show('rowFade') && byId.get('fPeriod').readOnly === false,
     '切回跳变：「变暗」那一行回来、周期又能手填了');
  ok(!show('rowCoverDir') && !show('rowCoverSpan') && !byId.has('rowCoverMode') && !byId.has('rowCoverGroup'),
     '切回跳变：覆盖那几行收起（覆盖方式 / 每组趟数已从界面移除）');
  ok(byId.get('fRiseLab').textContent === '渐亮(ms)',
     `切回跳变：渐亮标题还原（${byId.get('fRiseLab').textContent}）`);

  pick.value = '颜色覆盖'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  const eW = fxListOf(0)[0];
  ok(eW.color === CORE.FW.COLOR.WIPE && eW.period === 80 && eW.palette.length === 2,
     `覆盖预置：period=${eW.period} / ${eW.palette.length} 色`);
  ok(palN() === 2, `覆盖预置自带 2 个颜色，先画 2 个色块：${palN()}`);
  ok(show('fxPalAdd') && show('fxPalDel'),
     '覆盖：和跳变 / 呼吸一样能加能删（颜色按趟轮换，最多 16 个）');
  /* 加到第 3 个颜色 → 写进效果（第 3 趟就会用它盖上去） */
  click('fxPalAdd');
  await new Promise(r => setTimeout(r, 900));
  ok(fxListOf(0)[0].palette.length === 3 && palN() === 3,
     `覆盖加第 3 个颜色：${fxListOf(0)[0].palette.length} 个 / ${palN()} 个色块`);
  /* 删到只剩 2 个就守住（一个当底色、一个盖上去） */
  click('fxPalDel');
  await new Promise(r => setTimeout(r, 900));
  ok(fxListOf(0)[0].palette.length === 2, `覆盖删回 2 个：${fxListOf(0)[0].palette.length} 个`);
  click('fxPalDel');
  await new Promise(r => setTimeout(r, 900));
  const stWipeMin = byId.get('status').textContent;
  ok(fxListOf(0)[0].palette.length === 2 && /至少/.test(stWipeMin),
     `覆盖只剩 2 个就删不动（${stWipeMin}）`);
  /* 覆盖的两行参数：覆盖灯数（等级）+ 方向；「覆盖方式」「每组趟数」已退休（元素都不存在） */
  ok(show('rowCoverDir') && show('rowCoverSpan') &&
     !byId.has('rowCoverMode') && !byId.has('rowCoverGroup'),
     '覆盖：只剩「覆盖方向」「覆盖灯数」两行（覆盖方式 / 每组趟数已移除）');
  ok(byId.get('fPeriodLab').textContent === '速度(ms/趟)',
     `覆盖：周期那一行改叫「速度(ms/趟)」（${byId.get('fPeriodLab').textContent}）`);
  const elSpan = byId.get('fCoverSpan');
  elSpan.value = '16'; elSpan.oninput({ target: elSpan });
  await new Promise(r => setTimeout(r, 700));
  ok(fxListOf(0)[0].cover_span === 16, `覆盖灯数写进效果（${fxListOf(0)[0].cover_span}）`);
  const elDir = byId.get('fCoverDir');
  elDir.value = '1'; elDir.onchange({ target: elDir });
  await new Promise(r => setTimeout(r, 700));
  ok(fxListOf(0)[0].cover_dir === 1, `覆盖方向写进效果（${fxListOf(0)[0].cover_dir} = 单向）`);

  /* 「+渐变」：加一个两端渐变条目 —— 6 个数、画成胶囊、左右两半各一个色块 */
  ok(show('fxPalAddGrad'), '覆盖：显示「+渐变」按钮（渐变条目是覆盖独有的铺法）');
  const nGrad = fxListOf(0)[0].palette.length;
  click('fxPalAddGrad');
  await new Promise(r => setTimeout(r, 900));
  const eG = fxListOf(0)[0];
  ok(eG.palette.length === nGrad + 1 && eG.palette[nGrad].length === 6,
     `+渐变：调色板多一个 6 数的条目（${JSON.stringify(eG.palette[nGrad])}）`);
  const gcell = palCells()[nGrad];
  ok(gcell && gcell.classList.contains('grad') &&
     /linear-gradient/.test(String(gcell.style.background)),
     `渐变条目画成胶囊（${gcell && gcell.style.background}）`);
  ok((gcell.children || []).length === 2 &&
     gcell.children[0].classList.contains('palA') && gcell.children[1].classList.contains('palB'),
     '胶囊左右两半各是一个色块（分别可点）');

  /* 左右两半分别改色：只动那一端，条目仍是 6 个数 */
  const chipA = gcell.children[0];
  chipA.value = '#00ff00'; chipA.oninput({ target: chipA });
  await new Promise(r => setTimeout(r, 800));
  const entA = fxListOf(0)[0].palette[nGrad];
  ok(entA.length === 6 && entA[0] === 0 && entA[1] === 255 && entA[2] === 0 &&
     entA[3] === eG.palette[nGrad][3],
     `左半改成绿：只动首端（${entA.join(',')}）`);
  const chipB = palCells()[nGrad].children[1];
  chipB.value = '#0000ff'; chipB.oninput({ target: chipB });
  await new Promise(r => setTimeout(r, 800));
  const entB = fxListOf(0)[0].palette[nGrad];
  ok(entB.length === 6 && entB[3] === 0 && entB[4] === 0 && entB[5] === 255,
     `右半改成蓝：只动末端（${entB.join(',')}）`);

  /* 取色面板底部的「纯色 ↔ 渐变」按钮：渐变 → 纯色 → 再变回渐变 */
  palCells()[nGrad].children[0].__cp.open();
  const exBtn = byId.get('cpExtra');
  ok(exBtn && exBtn.style.display !== 'none' && /纯色/.test(exBtn.textContent),
     `面板底部给出「改回纯色」（${exBtn && exBtn.textContent}）`);
  exBtn.onclick();
  await new Promise(r => setTimeout(r, 900));
  ok(fxListOf(0)[0].palette[nGrad].length === 3 && !palCells()[nGrad].classList.contains('grad'),
     `改回纯色：条目缩回 3 个数、胶囊变普通色块（${fxListOf(0)[0].palette[nGrad].length} 个数）`);
  palCells()[nGrad].children[0].__cp.open();
  const exBtn2 = byId.get('cpExtra');
  ok(/渐变/.test(exBtn2.textContent), `纯色条目给出「改成两端渐变」（${exBtn2.textContent}）`);
  exBtn2.onclick();
  await new Promise(r => setTimeout(r, 900));
  ok(fxListOf(0)[0].palette[nGrad].length === 6 && palCells()[nGrad].classList.contains('grad'),
     '再变回渐变：又是 6 个数 + 胶囊');

  /* 渐变条目只属于覆盖：切到跳变 → 「+渐变」收起、条目按首端纯色显示、面板里也没有切换按钮 */
  col.value = String(CORE.FW.COLOR.STEP);
  col.onchange({ target: col });
  await new Promise(r => setTimeout(r, 800));
  ok(!show('fxPalAddGrad'),
     '跳变：不显示「+渐变」（跳变只有纯色条目）');
  const stepCell = palCells()[nGrad];
  ok(stepCell && !stepCell.classList.contains('grad') && stepCell.children.length === 1 &&
     /00ff00|rgb\(0, 255, 0\)/i.test(String(stepCell.style.background)),
     `跳变：原来的渐变条目按首端色显示成普通色块（${stepCell && stepCell.style.background}）`);
  ok(!/含渐变/.test(byId.get('fPalette').textContent),
     `跳变：色块后面不再写「含渐变」（${byId.get('fPalette').textContent}）`);
  stepCell.children[0].__cp.open();
  const exStep = byId.get('cpExtra');
  ok(!stepCell.children[0].__cpExtra && (!exStep || exStep.style.display === 'none'),
     '跳变：取色面板底部没有「改成两端渐变」这一行');
  ok(fxListOf(0)[0].palette[nGrad].length === 6,
     '跳变：数据里那个 6 数条目还在（只是不显示，切回覆盖不丢）');

  /* 呼吸同样没有渐变入口 */
  col.value = String(CORE.FW.COLOR.BREATH);
  col.onchange({ target: col });
  await new Promise(r => setTimeout(r, 800));
  ok(!show('fxPalAddGrad') && palCells().every(c => !c.classList.contains('grad')),
     '呼吸：不显示「+渐变」，条目也都是普通色块');

  /* 切回覆盖：胶囊和入口都回来 */
  col.value = String(CORE.FW.COLOR.WIPE);
  col.onchange({ target: col });
  await new Promise(r => setTimeout(r, 800));
  ok(show('fxPalAddGrad') && palCells()[nGrad].classList.contains('grad') &&
     palCells()[nGrad].children.length === 2,
     '切回覆盖：胶囊与「+渐变」都回来（跳变里没被压成纯色）');

  /* 2026-10-29 第三十五轮：「七彩跳变」不再单列（= 跳变 + 6 色 + 更柔和的包络），
   * 它的「开箱就有渐亮」改成下面手动把 渐亮/亮/变暗 调成 4/8/8 来验证 —— 覆盖不变、模板少一条。 */


  /* 「多彩跳变」= **配色「跳变」**（2026-10-27 用户：「色彩配置里面我们已经添加了跳变这个配置，
   * 这两者应该是一回事。选择动画跳变，即颜色也默认切换为跳变，同时调参接口也都是用同一套」）。
   * 老写法 = 填充层锯齿脉动（wave 2 / pulse 30）+ 配色「渐变」：套完配色下拉停在「渐变」，
   * 包络也不在「渐亮 / 亮 / 变暗」那三行里 —— 同一件事两个旋钮（同 F18 的「呼吸」）。
   * 2026-10-29 第三十六轮：改名「多彩跳变」并加「快拍」step_fast = 4 拍（80 ms）。 */
  pick.value = '多彩跳变'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  const eJ = fxListOf(0)[0];
  ok(eJ.color === CORE.FW.COLOR.STEP && eJ.palette.length === 6 &&
     eJ.rise === 0 && eJ.hold === 0 && eJ.fade === 30 && eJ.speed === 30 && eJ.step_fast === 4,
     `「多彩跳变」套完 = 配色跳变（color ${eJ.color} / 6 色 / 渐亮 ${eJ.rise} 亮 ${eJ.hold} 暗 ${eJ.fade} → 停留 ${eJ.speed}；快拍 ${eJ.step_fast} 拍）`);
  ok(!(eJ.layers[0].pulse_period | 0) && !(eJ.layers[0].pulse_amp | 0),
     `图层不再靠填充层锯齿脉动（pulse_period ${eJ.layers[0].pulse_period} / pulse_amp ${eJ.layers[0].pulse_amp} / wave ${eJ.layers[0].wave}）`);
  ok(col.value === String(CORE.FW.COLOR.STEP) && show('rowHold') && show('rowFade') && show('rowRise') &&
     byId.get('fSpeedLab').textContent === '停留(ms)' &&
     byId.get('fFade').value === '600' && byId.get('fSpeed').value === '600',
     `色彩配置自己切到「跳变」、旋钮也在同一排（${byId.get('fRise').value}/${byId.get('fHold').value}/${byId.get('fFade').value} → 停留 ${byId.get('fSpeed').value}）`);
  ok(palN() === 6, `调色板 = 预置给的 6 色（${palN()} 个色块，想单色就删到 1 个）`);
  /* 快拍（第三十六轮）：只在跳变时出现，格子写 ms、内部存拍；填 40ms → 2 拍 */
  ok(show('rowStepFast') && byId.get('fStepFast').value === '80',
     `跳变多一格「快拍(ms)」：出厂 ${byId.get('fStepFast').value} ms（= ${eJ.step_fast} 拍）`);
  byId.get('fStepFast').value = '40';
  byId.get('fStepFast').oninput({ target: byId.get('fStepFast') });
  await new Promise(r => setTimeout(r, 700));
  ok(fxListOf(0)[0].step_fast === 2,
     `快拍填 40ms → ${fxListOf(0)[0].step_fast} 拍（向上取整到整拍）`);
  byId.get('fStepFast').onchange();
  ok(byId.get('fStepFast').value === '40', `离开格子回显实际生效值 ${byId.get('fStepFast').value}ms`);
  byId.get('fStepFast').value = '80';
  byId.get('fStepFast').oninput({ target: byId.get('fStepFast') });
  await new Promise(r => setTimeout(r, 700));

  /* 原先「七彩跳变」的柔和包络：现在就在这条模板上把 渐亮 / 亮 / 变暗 调成 4 / 8 / 8，
   * 四格都跟着变（停留 = 20 拍 = 400 ms），验完复原成预置的 0 / 0 / 30。 */
  {
    const rI = byId.get('fRise'), hI = byId.get('fHold'), fI = byId.get('fFade');
    rI.value = '80'; rI.oninput({ target: rI });
    hI.value = '160'; hI.oninput({ target: hI });
    fI.value = '160'; fI.oninput({ target: fI });
    await new Promise(r => setTimeout(r, 700));
    const eS = fxListOf(0)[0];
    ok(eS.rise === 4 && eS.hold === 8 && eS.fade === 8 && eS.speed === 20,
       `柔和包络（原「七彩跳变」那套）= 渐亮 4 / 亮 8 / 暗 8 → 停留 ${eS.speed} 拍`);
    ok(byId.get('fSpeed').value === '400' && byId.get('fRise').value === '80' &&
       byId.get('fHold').value === '160' && byId.get('fFade').value === '160',
       `四个数都填进输入框（${byId.get('fSpeed').value}/${byId.get('fRise').value}/${byId.get('fHold').value}/${byId.get('fFade').value} ms）`);
    rI.value = '0'; rI.oninput({ target: rI });
    hI.value = '0'; hI.oninput({ target: hI });
    fI.value = '600'; fI.oninput({ target: fI });
    await new Promise(r => setTimeout(r, 700));
    ok(fxListOf(0)[0].speed === 30, `复原成预置的 0 / 0 / 30（停留 ${fxListOf(0)[0].speed} 拍）`);
  }

  /* ---- 时间类格子按 ms 显示（2026-10-28 第二轮）：填 ms、内部存拍、**一律向上取整** ---- */
  console.log('--- 时间类格子：显示 ms / 内部存拍 ---');
  {
    const slow = byId.get('fSlow');
    ok(+slow.value === 160 && slow.step === '20' && +slow.max === 5100,
       `「慢速」按 ms 显示：8 拍 → ${slow.value}ms（步长 ${slow.step} / 上限 ${slow.max}）`);
    slow.value = '30'; slow.oninput({ target: slow });
    await new Promise(r => setTimeout(r, 700));
    ok(fxListOf(0)[0].slow === 2, `填 30ms → 向上取整 ${fxListOf(0)[0].slow} 拍（30/20 = 1.5 → 2）`);
    slow.onchange();
    ok(slow.value === '40', `离开格子回显实际生效值 ${slow.value}ms`);
    slow.value = '160'; slow.oninput({ target: slow });      /* 复原成 8 拍 */
    await new Promise(r => setTimeout(r, 700));
  }
  /* 平滑 T（2026-10-28 第十三轮）：存的就是 ms（不折拍）；套预置缺省 60，「随机闪」显式 0 */
  console.log('--- 平滑 T：每效果一份，只在慢档 ---');
  {
    const sm = byId.get('fSmooth');
    ok(!!sm && +sm.value === 60,
       `「平滑(ms)」跟着套的预置走：缺省 ${sm && sm.value}ms（新效果 / 套预置 = 60）`);
    sm.value = '120'; sm.oninput({ target: sm });
    await new Promise(r => setTimeout(r, 700));
    const v120 = fxListOf(0)[0].smooth;
    sm.value = '5000'; sm.oninput({ target: sm });
    await new Promise(r => setTimeout(r, 700));
    const vMax = fxListOf(0)[0].smooth;
    sm.onchange();
    ok(v120 === 120 && vMax === 1000 && sm.value === '1000',
       `填 120ms 直接存 ${v120}ms（不折拍）；填 5000 夹到 ${vMax}ms 并回显 ${sm.value}`);
    pick.value = '随机闪'; click('fxPresetApply');
    await new Promise(r => setTimeout(r, 700));
    ok(fxListOf(0)[0].smooth === 0 && +byId.get('fSmooth').value === 0,
       '「随机闪」套完平滑 = 0（闪的那一格是硬跳，抹平了就看不出闪）');
  }
  /* 图层卡上的「脉动周期 / 刷新间隔 / 旋转」也是 ms（内部存拍） */
  pick.value = '呼吸彩虹'; click('fxPresetApply');

  await new Promise(r => setTimeout(r, 700));
  {
    const box = byId.get('fLayers').children[0];
    const nums = [];
    (function walk(n) { (n.children || []).forEach(c => {
      if (c.tagName === 'INPUT' && c.type === 'number') nums.push(c);
      walk(c); }); })(box);
    ok(nums.length === 3 && nums[1].value === '1800' && String(nums[1].step) === '20',
       `图层「脉动周期」90 拍（呼吸的出厂周期）→ ${nums[1].value}ms（${nums.map(n => n.value).join('/')}）`);
    nums[1].value = '30'; nums[1].oninput();
    await new Promise(r => setTimeout(r, 700));
    nums[1].onchange();
    ok(fxListOf(0)[0].layers[0].pulse_period === 2 &&
       nums[1].value === '40',
       `图层填 30ms → 2 拍，框里回显 ${nums[1].value}ms`);
    /* 2026-10-30（第三十九轮）：呼吸彩虹改用**呼吸包络**（wave = 4）：对称平滑曲线、
     * 最暗那一拍 ≈255/(周期/2+1) 不落全黑 —— 与配色「呼吸」用的是同一条曲线。 */
    const lay = fxListOf(0)[0].layers[0];
    let mn = 255, mx = 0;
    for (let t = 0; t < 90; t++) {
      const g = CORE.pulseGain(t, 90, lay.pulse_amp | 0, 4);
      if (g < mn) mn = g;
      if (g > mx) mx = g;
    }
    ok(lay.wave === 4 && lay.pulse_amp === 255 && mn > 0 && mn <= 8 && mx === 255,
       `呼吸彩虹：wave=呼吸 / 最暗 ${mn} / 最亮 ${mx}（不落全黑，熄灭处不闪）`);
    ok(CORE.pulseGain(0, 90, 255, 4) <= 8 &&
       CORE.pulseGain(1, 90, 255, 4) - CORE.pulseGain(0, 90, 255, 4) <= 3,
       `呼吸彩虹：起步 ${CORE.pulseGain(0, 90, 255, 4)} → ${CORE.pulseGain(1, 90, 255, 4)}（平滑，不是一格一格跳）`);
    /* 整条效果级（没有光点层）：慢速 / 快速 / 平滑 / 起始位 四行收起 */
    ok(['rowSlow', 'rowFast', 'rowSmooth', 'rowOffset']
         .every(id => byId.get(id).style.display === 'none'),
       '呼吸彩虹（整条效果级）：慢速 / 快速 / 平滑 / 起始位 四行收起');
  }
}

/* ---- 11) 暂停时也要「看得出改了配色」 ---- */
console.log('--- 暂停样本帧（改了配色立刻看得见）---');
{
  /* 这一段是重开工具之后跑的，得先回到动效页（画布要切到「效果编辑台」才会画灯） */
  tabBtn('fx').onclick();
  byId.get('fxTbl').children[0].onclick();
  const pick = byId.get('fxPresetPick');
  const pixels = () => [...new Set(fills.filter(f => /^rgb\(/.test(f)))]
    .map(f => f.match(/\d+/g).map(Number));
  const has = pred => pixels().some(pred);

  /* 11a 呼吸：tick 0 的包络是 0（整条全黑），暂停时必须拨到顶点 */
  fills.length = 0;
  pick.value = '多彩呼吸'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  ok(has(p => p[0] > 200 && p[1] < 40 && p[2] < 40),
     `呼吸暂停时画出第 1 色（不是全黑）：${JSON.stringify(pixels().slice(-3))}`);

  /* 11b 覆盖：tick 0 还没开始盖（整条底色，跟纯色一模一样），暂停时拨到半程 */
  fills.length = 0;
  pick.value = '颜色覆盖'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  ok(has(p => p[2] > 200 && p[0] < 40), '覆盖暂停时看得到底色（蓝）');
  ok(has(p => p[0] > 200 && p[1] > 80 && p[2] < 40), '覆盖暂停时看得到盖色（橙）—— 两种颜色同屏');

  /* 11c 套预置（结构变了）也要重画：上一段已经证明「颜色换了」；
         这里再确认套完预置后暂停帧里不再是旧配色的颜色 */
  fills.length = 0;
  pick.value = '绕环彩虹(旋转)'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  ok(new Set(pixels().map(p => p.join(','))).size >= 6,
     `绕环彩虹暂停时画出一整圈颜色（${new Set(pixels().map(p => p.join(','))).size} 种色相）`);

  /* 11d 跳变：tick 0 只有 255/渐亮（没拨到顶点就看不出颜色），暂停时必须拨到包络顶点 */
  fills.length = 0;
  pick.value = '多彩跳变'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  ok(has(p => p[0] + p[1] + p[2] > 150),
     `跳变暂停时停在包络顶点、颜色看得见（不是全黑）：${JSON.stringify(pixels().slice(-3))}`);

  /* 渐亮 > 0 且「亮」= 0：包络顶点在渐亮最后一拍（tick 0 反而是黑的）—— 暂停帧也跟着换 */
  {
    const rI = byId.get('fRise'), hI = byId.get('fHold');
    rI.value = '80'; rI.oninput({ target: rI });      /* 80ms = 4 拍 */
    await new Promise(r => setTimeout(r, 700));
    fills.length = 0;
    hI.value = '0'; hI.oninput({ target: hI });
    await new Promise(r => setTimeout(r, 700));
    const e = fxListOf(0)[0];
    ok(e.rise === 4 && e.hold === 0 && e.speed === 34,
       `只有渐亮：停留 = 渐亮 + 亮 + 暗 = ${e.rise} + ${e.hold} + ${e.fade} = ${e.speed}（这条模板的暗 = 30 拍）`);
    ok(has(p => p[0] + p[1] + p[2] > 150),
       `渐亮 4 / 亮 0 的暂停帧停在爬满那一拍（不是 tick 0 的全黑）：${JSON.stringify(pixels().slice(-3))}`);
  }
}

/* ---- 12) 「全点亮(测配色)」：给配色当底片（整条满亮、完全静止） ---- */
console.log('--- 全点亮(测配色) ---');
{
  tabBtn('fx').onclick();
  byId.get('fxTbl').children[0].onclick();
  const pick = byId.get('fxPresetPick');
  ok((pick.children || []).some(o => o.value === '全点亮(测配色)'), '预置下拉里有「全点亮(测配色)」');

  pick.value = '全点亮(测配色)'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  const e = fxListOf(0)[0];
  ok(e.color === CORE.FW.COLOR.SOLID && e.moves === false,
     `套上就是纯色、不走位置：color=${e.color} moves=${e.moves}`);
  ok(e.layers.length === 1 && e.layers[0].kind === 'fill' && e.layers[0].level === 255,
     `一个满亮填充层：${e.layers.map(l => l.kind + '/' + l.level).join('+')}`);
  ok(!e.layers[0].pulse_period && !e.layers[0].pulse_amp && !e.layers[0].hue_speed && !e.layers[0].cmode,
     '不脉动、不转色、不铺空间色相（pulse / hue_speed / cmode 都是 0）');
  ok(e.palette.length === 6, `色板预置 6 色（切跳变 / 呼吸立刻六色轮转）：${e.palette.length}`);

  /* 核心渲染：任意长度、任意拍子都整条 255 —— 这就是「能当配色底片」的定义 */
  const inst = CORE.instNew();
  const renderE = (eff, len, tick) => {
    CORE.simApplyEffect(inst, eff, 0);
    inst.anim.gen_tick = tick;
    const m = new Uint8Array(len), h = new Uint8Array(len);
    CORE.renderZoneMaskTo(inst, m, h, len, 0);
    return { m, h };
  };
  const full8 = renderE(e, 8, 0).m, full24 = renderE(e, 24, 0).m, full104 = renderE(e, 104, 0).m;
  const all255 = m => m.every(v => v === 255);
  ok(all255(full8) && all255(full24) && all255(full104),
     `8 / 24 / 104 颗都是整条满亮（${full8.length} / ${full24.length} / ${full104.length} 颗全 255）`);
  const s104 = renderE(e, 104, 37).m;
  ok(s104.every((v, i) => v === full104[i]), '推 37 拍还是原样 —— 静止的，不是呼吸');

  /* 换配色 = 换颜色算法，底片不动：彩虹 → 每颗灯色相不同、亮度仍全 255 */
  const col = byId.get('fColor');
  col.value = String(CORE.FW.COLOR.RAINBOW);
  col.onchange({ target: col });
  await new Promise(r => setTimeout(r, 700));
  const eR = fxListOf(0)[0];
  ok(eR.color === CORE.FW.COLOR.RAINBOW && eR.layers.length === 1 && eR.layers[0].level === 255,
     '换成彩虹：底片还是那个满亮填充层');
  const r24 = renderE(eR, 24, 0);
  ok(all255(r24.m) && new Set(r24.h).size >= 6,
     `彩虹：24 颗全亮、${new Set(r24.h).size} 种色相（每颗灯不一样）`);
}
/* ---- 13) 预置套用：可撤销 / 下拉跟随当前效果 / 模板自己真会动 ---- */
console.log('--- 预置套用：撤销 / 下拉跟随 / 模板能看见 ---');
{
  tabBtn('fx').onclick();
  const pick = byId.get('fxPresetPick');
  const rowAt = i => byId.get('fxTbl').children[i].onclick();
  const list0 = () => fxListOf(0);
  const bi = list0().findIndex(e => e.kind !== 'custom');
  ok(bi >= 0, `工程里还有内建效果可当参照（第 ${bi + 1} 条：${list0()[bi] && list0()[bi].name}）`);

  /* 13a 占位项 + 内建效果：下拉落空，不会带着上一条的模板名 */
  rowAt(bi);
  ok((pick.children || [])[0].value === '', '下拉第一项是占位（值空）');
  ok(pick.value === '', `内建效果的下拉落回占位（当前「${pick.value}」）`);

  /* 13b 套用后下拉跟着显示模板名 */
  pick.value = '拖尾彗星'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  ok(list0()[bi].tpl === '拖尾彗星', `套用后效果记住模板名（tpl=${list0()[bi].tpl}）`);
  ok(byId.get('rowMoves').style.display !== 'none',
     '含光点层的效果显示「随位置前进」');
  ok(byId.get('rowSlow').style.display !== 'none' &&
     byId.get('rowFast').style.display !== 'none' &&
     byId.get('rowSmooth').style.display !== 'none' &&
     byId.get('rowOffset').style.display !== 'none',
     '含光点层的效果：慢速 / 快速 / 平滑 / 起始位 都还在');
  /* 13b-2 纯「随机闪」用不上这四格 → 整行收起 */
  pick.value = '随机闪'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  ok(['rowSlow', 'rowFast', 'rowSmooth', 'rowOffset']
       .every(id => byId.get(id).style.display === 'none'),
     '纯随机闪效果：慢速 / 快速 / 平滑 / 起始位 四行收起');
  /* 13b-3 配色「跳变 / 呼吸」（多彩跳变 / 多彩呼吸）同样是整条效果级、时序都在配色那一排 → 也收起 */
  pick.value = '多彩跳变'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  ok(['rowSlow', 'rowFast', 'rowSmooth', 'rowOffset']
       .every(id => byId.get(id).style.display === 'none'),
     '多彩跳变（配色「跳变」+ 满亮填充）：四行收起');
  pick.value = '多彩呼吸'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  ok(['rowSlow', 'rowFast', 'rowSmooth', 'rowOffset']
       .every(id => byId.get(id).style.display === 'none'),
     '多彩呼吸（配色「呼吸」+ 满亮填充）：四行收起');
  /* 但「光点层 + 跳变配色」仍然用得上位置 / 速度 → 留着（别一刀切按配色隐藏） */
  pick.value = '拖尾彗星'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  byId.get('fColor').value = String(CORE.FW.COLOR.STEP);
  byId.get('fColor').onchange({ target: byId.get('fColor') });
  await new Promise(r => setTimeout(r, 700));
  ok(list0()[bi].color === CORE.FW.COLOR.STEP &&
     ['rowSlow', 'rowFast', 'rowSmooth', 'rowOffset']
       .every(id => byId.get(id).style.display !== 'none'),
     '带光点层 + 跳变配色：四行仍然显示（位置 / 速度还起作用）');
  pick.value = '拖尾彗星'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  ok(byId.get('rowSlow').style.display !== 'none', '换回带光点的模板后四行恢复');
  ok(pick.value === '拖尾彗星', `下拉显示当前效果的模板名（「${pick.value}」）`);
  rowAt(0);
  ok(pick.value === (list0()[0].kind === 'custom' && list0()[0].tpl || ''),
     `换一条效果，下拉跟着它走（「${pick.value}」）`);
  rowAt(bi);

  /* 13c 套用 = 可撤销的一笔（效果页以前一条快照都没有） */
  const layersBefore = JSON.stringify(list0()[bi].layers);
  pick.value = '绕环彩虹(旋转)'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  ok(list0()[bi].layers[0].kind === 'fill' && list0()[bi].color === CORE.FW.COLOR.RAINBOW,
     '套用「绕环彩虹(旋转)」：图层与配色都换掉了');
  (listeners['window:keydown'] || []).forEach(f =>
    f({ key: 'z', ctrlKey: true, target: { tagName: 'CANVAS' }, preventDefault() {} }));
  await new Promise(r => setTimeout(r, 700));
  ok(JSON.stringify(list0()[bi].layers) === layersBefore,
     'Ctrl+Z 撤回套用之前的图层（效果页也有撤销快照了）');
  ok(pick.value === '拖尾彗星', `撤销后下拉也跟着回到「${pick.value}」`);

  /* 13d 「双向填充」：改成移植固件 PixelFill_TwoWay 的「扫描填充」层
     （旧写法是两层 fill/gradient，只是两波明暗在转，不是填充） */
  pick.value = '双向填充'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  const eD = list0()[bi];
  ok(eD.moves === false, `不标「随位置前进」（moves=${eD.moves}，填充由层自己走）`);
  ok(byId.get('rowMoves').style.display === 'none',
     '扫描填充层用不上「随位置前进」→ 整行收起');
  ok(eD.layers.map(l => l.kind).join('+') === 'sweep',
     `一条扫描填充层：${eD.layers.map(l => l.kind).join('+')}`);
  ok(eD.layers[0].wave === 1 && eD.layers[0].rotate === 5,
     `双向 + 每步 5 拍（wave=${eD.layers[0].wave} / rotate=${eD.layers[0].rotate}）`);
  {
    const inst = CORE.instNew();
    CORE.simApplyEffect(inst, eD, 0);
    const L = inst.anim.layers[0];
    const st = CORE.sweepStateNew(24);
    const step = n => {
      for (let t = 0; t < n; t++) {
        CORE.instTick(inst, false);
        const ft = CORE.flowTickOf(inst);
        const need = Math.max(1, L.rotate | 0);
        if (((ft - st.t) & 0xFFFF) >= need) { st.t = ft; CORE.sweepStep(st, L, 24); }
      }
    };
    const shot = () => {
      const m = new Uint8Array(24), h = new Uint8Array(24);
      CORE.renderZoneMaskTo(inst, m, h, 24, 0, st);
      return { m, h };
    };
    const f0 = shot();
    ok(f0.m.filter(v => v > 0).length === 1 && f0.m[23] === 255,
       `起始只有远端一个头部（${f0.m.join(',') }）`);
    step(115);   /* 23 步 = 低端长一颗（每步 5 拍） */
    const f1 = shot();
    ok(f1.m[0] === 120 && st.low === 1,
       `115 拍后低端填了 1 颗（${f1.m[0]}，low=${st.low}）`);
    step(110);   /* 再 22 步 = 高端长一颗 */
    const f2 = shot();
    ok(f2.m[0] === 120 && f2.m[23] === 120 && st.high === 1,
       `两端各填 1 颗（${f2.m[0]} / ${f2.m[23]}，high=${st.high}）`);
    ok(new Set(f0.h).size >= 2, `配色仍是彩虹（${new Set(f0.h).size} 种空间色相）`);
  }
  /* 13d-2 「头部取色」：默认跟配色（彩虹 / 渐变按位置）；切到固定颜色才出现色块 */
  {
    const walk = (n, out, tag) => {
      if (!n) return out;
      if (tag === 'SELECT' ? n.tagName === 'SELECT' : (n.classList && n.classList.contains(tag))) out.push(n);
      (n.children || []).forEach(c => walk(c, out, tag));
      return out;
    };
    const fbox = byId.get('fLayers');
    const sels0 = walk(fbox, [], 'SELECT');
    ok(sels0.length === 2, `扫描填充层上有两个下拉（方向 / 头部取色），实际 ${sels0.length}`);
    ok(sels0[1] && sels0[1].children[0] && sels0[1].children[0].selected === true,
       '头部取色默认「跟配色」（第 1 个选项被选中）');
    ok(walk(fbox, [], 'cchip').length === 0, '跟配色时没有色块');
    {
      const inst0 = CORE.instNew();
      CORE.simApplyEffect(inst0, list0()[bi], 0);
      ok(CORE.sweepHeadColor(inst0, 0, 24) === null, '跟配色时头部不覆盖');
    }
    if (sels0[1]) { sels0[1].value = '3'; sels0[1].onchange(); }
    await new Promise(r => setTimeout(r, 700));
    {
      const s3 = walk(byId.get('fLayers'), [], 'SELECT');
      ok(s3.length === 3, `选「渐变」后多一个「头部渐变」下拉（${s3.length} 个下拉）`);
      const gsel = s3[2];
      const n0 = gsel ? gsel.children.length : 0;
      ok(n0 >= 2, `下拉里有「跟效果那张」+ 色库条目（${n0} 项）`);
      const add = byId.get('fxGradNew');
      if (add && add.onclick) add.onclick();
      await new Promise(r => setTimeout(r, 700));
      const s4 = walk(byId.get('fLayers'), [], 'SELECT');
      ok(s4[2] && s4[2].children.length === n0 + 1,
         `新建一条渐变后，头部渐变下拉自动多一项（${s4[2] && s4[2].children.length}）`);
    }
    if (sels0[1]) { sels0[1].value = '1'; sels0[1].onchange(); }
    await new Promise(r => setTimeout(r, 700));
    const chips = walk(byId.get('fLayers'), [], 'cchip');
    ok(chips.length === 1, `切到固定颜色后出现色块（${chips.length} 个）`);
    const chip = chips[0];
    ok(chip && String(chip.value).toLowerCase() === '#ffffff', `固定颜色默认白（${chip && chip.value}）`);
    if (chip) chip.value = '#00ff00';
    if (chip && chip.oninput) chip.oninput({ target: chip });
    await new Promise(r => setTimeout(r, 700));          /* saveStore 有 400ms 防抖 */
    ok(JSON.stringify(list0()[bi].layers[0].hc) === '[0,255,0]',
       `改色后图层记下 ${JSON.stringify(list0()[bi].layers[0].hc)}`);
    const instC = CORE.instNew(); CORE.simApplyEffect(instC, list0()[bi], 0);
    const hcC = CORE.sweepHeadColor(instC, 0, 24);
    ok(hcC && hcC.r === 0 && hcC.g === 255, '实例拿到新的固定头部颜色');
  }

  /* 13d-2 渐变层：「第二段渐变」下拉 + 预置「渐变旋转」（方向反转 / 快档 16 倍） */
  {
    pick.value = '渐变旋转'; click('fxPresetApply');
    await new Promise(r => setTimeout(r, 700));
    const eG = list0()[bi];
    ok(eG.layers[0].kind === 'gradient' && eG.slow === 16 && eG.fast === 1,
       `渐变旋转：慢速 ${eG.slow} / 快速 ${eG.fast}（快档 ${eG.slow / eG.fast} 倍），铺 ${eG.layers[0].spans} 段`);
    const walkSel = (n, out) => { (n.children || []).forEach(c => {
      if (c.tagName === 'SELECT') out.push(c); walkSel(c, out); }); return out; };
    const gsel = walkSel(byId.get('fLayers'), [])[0];
    ok(!!gsel && gsel.children.length >= 2,
       `渐变层有「第二段渐变」下拉（${gsel && gsel.children.length} 项：留空 + 色库条目）`);
    ok(gsel && gsel.children[0] && String(gsel.children[0].value) === '',
       '默认留空 = 两段同色（都用下方色彩配置）');
    if (gsel && gsel.children[1]) { gsel.value = gsel.children[1].value; gsel.onchange(); }
    await new Promise(r => setTimeout(r, 700));
    ok(!!list0()[bi].layers[0].hg2,
       `选了一条色库渐变 → 图层记下 hg2=${list0()[bi].layers[0].hg2}`);
    const instG = CORE.instNew(); CORE.simApplyEffect(instG, list0()[bi], 0);
    ok(!!instG.grad2 && instG.g2Spans === 2,
       '实例拿到第二段色环 + 段数（预览与导出 C 同源）');
  }

  /* 13e 下拉停在占位时点「套用」：什么都不动（说明里报一句） */
  const beforeEmpty = JSON.stringify(list0()[bi].layers);
  pick.value = ''; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  ok(JSON.stringify(list0()[bi].layers) === beforeEmpty,
     '没选模板就点「套用」不会覆盖当前效果');
}

/* ---- 14) 单点追逐：图层卡只剩形状参数，颜色全看「色彩配置」---- */
console.log('--- 单点追逐（第一个逐个优化的模板）---');
{
  const pick = byId.get('fxPresetPick');
  const rowAt = i => byId.get('fxTbl').children[i].onclick();
  const list0 = () => fxListOf(0);
  const bi = list0().findIndex(e => e.kind !== 'custom');
  rowAt(bi);
  pick.value = '单点追逐'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  const e = list0()[bi];
  ok(e.layers.length === 1 && e.layers[0].kind === 'spot',
     `一个光点层（${e.layers.map(l => l.kind).join('+')}）`);
  ok(!('cmode' in e.layers[0]) && !('hue_speed' in e.layers[0]) && !('hue_spread' in e.layers[0]),
     '图层里没有 cmode / hue_*（取色归效果配色）');

  /* 图层卡：3 个下拉（衰减 / 方向 / 往返）+ 3 个数字框（点数 / 宽 / 间距）
   * 「相位 / 脉动周期 / 脉动深度」2026-10-27 从光点层收起：相位与「起始位」等价，
   * 脉动只对填充层有意义（呼吸 / 闪烁 / 跳变靠它）。 */
  const box = byId.get('fLayers').children[0];
  const sel = [], num = [];
  (function walk(n) { (n.children || []).forEach(c => {
    if (c.tagName === 'SELECT') sel.push(c);
    if (c.tagName === 'INPUT' && c.type === 'number') num.push(c);
    walk(c); }); })(box);
  ok(sel.length === 3, `光点层只剩 3 个下拉（衰减 / 方向 / 往返），实际 ${sel.length}`);
  ok(num.length === 3, `数字框 3 个（光点数 / 光宽 / 间距），实际 ${num.length}`);
  /* 加层按钮收起后「删空就加不回来」：只剩一层时 × 必须禁用（delLayer 也有兜底） */
  {
    const head = (box.children || []).find(c => c.className === 'cardHead');
    const xBtn = ((head && head.children) || []).filter(c => c.tagName === 'BUTTON')
      .find(b => b.textContent === '×');
    ok(!!xBtn && xBtn.disabled === true, '只剩一层时「×」禁用（「+ 加图层」已收起，删空就加不回来）');
  }

  /* 颜色只由效果配色决定：整环 hue 全是 0xFF 哨兵 */
  const inst = CORE.instNew();
  CORE.simApplyEffect(inst, e, 0);
  const m = new Uint8Array(24), h = new Uint8Array(24);
  CORE.renderZoneMaskTo(inst, m, h, 24, 0);
  ok(h.every(v => v === 0xFF), '每个灯位都用效果配色（hue 全 0xFF）');
  const lit = m.filter(v => v >= 200).length;
  ok(lit >= 3 && Math.max(...m) >= 250, `光带 ${lit} 颗点亮（峰值 ${Math.max(...m)}）`);

  /* 240 拍：位置在推进、而且推进后仍有灯亮 */
  for (let t = 0; t < 240; t++) CORE.instTick(inst);
  const m2 = new Uint8Array(24), h2 = new Uint8Array(24);
  CORE.renderZoneMaskTo(inst, m2, h2, 24, inst.anim.position.current | 0);
  ok(inst.anim.position.current !== 0, `240 拍后位置推进到 ${inst.anim.position.current}`);
  ok(m2.some(v => v > 0), '推进后仍有灯亮（不会推丢）');

  /* 换配色只动那一个下拉：同一份图层，红 / 绿渲染出来的颜色跟着变 */
  const brightColor = c1 => {
    const x = JSON.parse(JSON.stringify(e));
    x.color = CORE.FW.COLOR.SOLID; x.palette = [c1]; x.c1 = c1;
    const ins2 = CORE.instNew();
    CORE.simApplyEffect(ins2, x, 0);
    const mm = new Uint8Array(24), hh = new Uint8Array(24);
    CORE.renderZoneMaskTo(ins2, mm, hh, 24, 0);
    let k = 0;
    for (let i = 0; i < 24; i++) if (mm[i] > mm[k]) k = i;
    const c = CORE.effectColorAt(ins2, k, 24, hh);
    return [c.r, c.g, c.b].join(',');
  };
  const cr = brightColor([255, 0, 0]), cg = brightColor([0, 255, 0]);
  ok(cr === '255,0,0' && cg === '0,255,0',
     `同一份图层换配色：红 ${cr} / 绿 ${cg}（颜色不再分散在图层里）`);
}

/* ---- §15) 多点追逐：图层「间距」从预设一路进到渲染 ----
 * 用户 2026-10-26：「你提到的间距这个想法很好，可以加上」—— 0 = 均布（老行为），
 * 调小 = 几个点聚成一段一起跑，调大 = 拉开。 */
console.log('--- 多点追逐：间距 ---');
{
  const list0b = () => fxListOf(0);
  const rowAtb = i => byId.get('fxTbl').children[i].onclick();
  const bi2 = list0b().findIndex(e => e.kind !== 'custom');
  rowAtb(bi2);
  const pick2 = byId.get('fxPresetPick');
  pick2.value = '多点追逐(4)';
  const apply2 = byId.get('fxPresetApply');
  if (apply2 && apply2.onclick) apply2.onclick();
  await new Promise(r => setTimeout(r, 400));
  const e2 = list0b()[bi2];
  ok(e2.layers.length === 1 && e2.layers[0].count === 4, `4 个光点（${e2.layers[0].count} 个）`);
  ok(e2.layers[0].spacing === 6, `预置带上间距 = ${e2.layers[0].spacing}（24 灯均布值）`);

  /* 图层卡上的「间距」数字框真的接在这个字段上（顺序：点数 / 光宽 / 间距） */
  const box2 = byId.get('fLayers').children[0];
  const nums2 = [];
  (function walk(n) { (n.children || []).forEach(c => {
    if (c.tagName === 'INPUT' && c.type === 'number') nums2.push(c);
    walk(c); }); })(box2);
  const spacingInput = nums2.find(el => String(el.value) === '6');   /* 初始只有「间距」是 6 */
  if (spacingInput && spacingInput.oninput) {
    spacingInput.value = '3'; spacingInput.oninput();
  }
  await new Promise(r => setTimeout(r, 400));       /* fxListOf 读的是存档快照，等防抖落盘 */
  ok(list0b()[bi2].layers[0].spacing === 3,
     `改「间距」格 → 图层 spacing = ${list0b()[bi2].layers[0].spacing}（数字框 ${nums2.map(el => el.value).join('/')}）`);

  const dots = sp => {
    const x = JSON.parse(JSON.stringify(list0b()[bi2]));
    x.layers[0].spacing = sp;
    const ins = CORE.instNew();
    CORE.simApplyEffect(ins, x, 0);
    const m = new Uint8Array(24), h = new Uint8Array(24);
    CORE.renderZoneMaskTo(ins, m, h, 24, 0);
    const at = []; for (let i = 0; i < 24; i++) if (m[i] > 200) at.push(i);
    return at.join(',');
  };
  const d0 = dots(0), d3 = dots(3);
  ok(d0 !== d3, `间距 3 与均布画出来不一样：均布 ${d0} / 间距 3 ${d3}`);
}



console.log(fails ? `\n=== ${fails} 项未通过 ===` : '\n=== 全部通过 ===');
process.exit(fails ? 1 : 0);
