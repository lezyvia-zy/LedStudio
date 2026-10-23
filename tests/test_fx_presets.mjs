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
['单点追逐','拖尾彗星','摆动(往返)','呼吸','闪烁','跳变(渐暗后跳回)','绕环彩虹(旋转)','沿环渐变','双向填充','随机闪','七彩跳变']
  .forEach(n => ok(names.indexOf(n) >= 0, `预置里有「${n}」`));

/* ---- 3) 套用「绕环彩虹(旋转)」---- */
byId.get('fxTbl').children[0].onclick();          // 选中槽位 0
pp.value = '绕环彩虹(旋转)';
click('fxPresetApply');
await new Promise(r => setTimeout(r, 700));
const e0 = fxListOf(0)[0];
ok(e0.kind === 'custom', '套用后变成自定义动效');
ok(e0.layers.length === 1 && e0.layers[0].kind === 'fill', `图层: ${e0.layers.map(l => l.kind).join('+')}`);
ok(e0.layers[0].cmode === 1, '配色模式 = 空间色相');
ok(e0.layers[0].hue_spread === 255, `沿环色相跨度 = ${e0.layers[0].hue_spread}（整环铺满一轮）`);
ok(e0.layers[0].hue_speed > 0, `色相旋转 = ${e0.layers[0].hue_speed}（每 N 帧转一格）`);

/* ---- 4) 图层编辑器渲染出新控件 ---- */
const layerBox = byId.get('fLayers');
ok(layerBox.children.length === 1, '图层编辑器渲染了 1 行');
const ctrls = [];
(function walk(n) { (n.children || []).forEach(c => { if (c.tagName === 'SELECT') ctrls.push(c); walk(c); }); })(layerBox.children[0]);
const opts = ctrls.map(s => (s.children || []).map(o => o.value).join('/'));
ok(ctrls.some(s => (s.children || []).some(o => /空间色相/.test(o.textContent))), '有「配色」下拉且含空间色相选项');
ok(ctrls.some(s => (s.children || []).some(o => /方波/.test(o.textContent))), '有「波形」下拉且含方波');
ok(ctrls.some(s => (s.children || []).some(o => /往返|折返/.test(o.textContent))) ||
   e0.layers[0].kind === 'fill', '（填充层无往返/衰减控件，属预期）');

/* ---- 5) 套用「摆动(往返)」应带上 bounce ---- */
pp.value = '摆动(往返)'; click('fxPresetApply');
await new Promise(r => setTimeout(r, 700));
const e0b = fxListOf(0)[0];
ok(e0b.layers[0].kind === 'spot' && e0b.layers[0].bounce === 1, '摆动模板带上了往返标记');
ok(e0b.moves === true, '摆动模板会随位置前进');

/* ---- 6) 套用「闪烁」应是方波 ---- */
pp.value = '闪烁'; click('fxPresetApply');
await new Promise(r => setTimeout(r, 700));
const e0c = fxListOf(0)[0];
ok(e0c.layers[0].kind === 'fill' && e0c.layers[0].wave === 1, '闪烁模板用方波');

/* ---- 7) 导出应带上空间色相的 C ---- */
pp.value = '绕环彩虹(旋转)'; click('fxPresetApply');
await new Promise(r => setTimeout(r, 700));
byId.get('xForm').value = 'header'; byId.get('xCmt').value = 'ascii'; byId.get('xEol').value = 'lf';
click('xBuild');
const out = byId.get('xOut').value;
ok(out.includes('LED_GEN_CMODE_SPATIAL') || out.includes('led_gen_hue_of'), '导出的 C 带上了空间色相机制');
ok(out.includes('led_gen_hue[ZONE_MAX_LEN]'), '导出的 C 有每灯位色相数组');
ok(/0, 255, 2, 0, 1, 1 \}/.test(out),
   '图层行写出 hue_spread=255 / hue_speed=2 / cmode=1: ' + (out.match(/^    \{ 2,.*/m) || ['(没找到)'])[0]);

const eblk = out.slice(out.indexOf('static const led_gen_effect_t'));
const eblkRows = (eblk.match(/^    \{.*\},/gm) || []);
ok(eblkRows.length && /^    \{ 1, 0, 0, 0, 0, 255, 0, 0, 0, 0, 0, \d+, 8, 1, 0, 1, 0, 0, \d+, \d+, \d+, \d+, \d+, \d+, \d+, \d+, \d+, \d+, \d+ \},/.test(eblkRows[0]),
   '效果行 = kind=1, 1 个图层, moves=1, 末尾带渐亮/亮/变暗 + 渐变两列（grad_first / grad_step）: ' + (eblkRows[0] || '(无)'));


/* ---- 8) 起始位也能存 ---- */
const off = byId.get('fOffset');
off.value = '64'; off.oninput({ target: off });
await new Promise(r => setTimeout(r, 700));
ok(fxListOf(0)[0].offset === 64, `起始位存进了效果: ${fxListOf(0)[0].offset}`);

/* ---- 9) 关掉再打开，预置套用的结果要还在 ---- */
install(); boot(); await new Promise(r => setTimeout(r, 700));
const e9 = fxListOf(0)[0];
ok(e9.kind === 'custom' && e9.layers[0].cmode === 1, '重开后空间色相图层还在');
ok(e9.offset === 64, '重开后起始位还在');

/* ---- 10) 新配色：彩虹 / 跳变 / 呼吸 / 覆盖 的界面与参数 ---- */
console.log('--- 新配色（效果级）---');
{
  const col = byId.get('fColor');
  const pick = byId.get('fxPresetPick');
  const show = id => (byId.get(id).style.display !== 'none');
  const palN = () => (byId.get('fPalette').children || []).filter(c => c.classList && c.classList.contains('cchip')).length;

  pick.value = '彩虹环'; click('fxPresetApply');
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
  ok(byId.get('fSpeedLab').textContent === '停留(拍)', `跳变的数值叫「停留(拍)」: ${byId.get('fSpeedLab').textContent}`);
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

  /* 渐亮 / 亮 / 变暗：改了立刻落盘，并且「停留(拍)」自动 = 三者之和（那一格只读，不用手填） */
  const rIn = byId.get('fRise'), hIn = byId.get('fHold'), fIn = byId.get('fFade'), spIn = byId.get('fSpeed');
  ok(spIn.readOnly === true, '跳变时「停留(拍)」是自动算的（只读）');
  hIn.value = '6'; hIn.oninput({ target: hIn });
  await new Promise(r => setTimeout(r, 700));
  ok(fxListOf(0)[0].hold === 6 && fxListOf(0)[0].speed === 6 && spIn.value === '6',
     `只改「亮」：停留跟着算成 6（speed=${fxListOf(0)[0].speed}，格子=${spIn.value}）`);
  rIn.value = '4'; rIn.oninput({ target: rIn });
  await new Promise(r => setTimeout(r, 700));
  ok(fxListOf(0)[0].rise === 4 && fxListOf(0)[0].speed === 10 && spIn.value === '10',
     `渐亮 4 + 亮 6 → 停留 10（speed=${fxListOf(0)[0].speed}，格子=${spIn.value}）`);
  fIn.value = '9'; fIn.oninput({ target: fIn });
  await new Promise(r => setTimeout(r, 700));
  ok(fxListOf(0)[0].rise === 4 && fxListOf(0)[0].hold === 6 && fxListOf(0)[0].fade === 9 &&
     fxListOf(0)[0].speed === 19 && spIn.value === '19',
     `渐亮 4 + 亮 6 + 暗 9 → 停留 19 自动填好（speed=${fxListOf(0)[0].speed}，格子=${spIn.value}）`);
  /* 停留是 8 位：三段加起来超 255 时封顶，状态栏说明（不会静默改数） */
  hIn.value = '250'; hIn.oninput({ target: hIn });
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
       byId.get('fSpeed').value === String(e5.speed) &&
       byId.get('fSpeed').readOnly === true,
       `切回跳变：停留还是 渐亮 + 亮 + 暗（${e5.rise} + ${e5.hold} + ${e5.fade} → ${e5.speed}，格子 ${byId.get('fSpeed').value}）`);
  }

  col.value = String(CORE.FW.COLOR.SPECTRUM);
  col.onchange({ target: col });
  await new Promise(r => setTimeout(r, 700));
  ok(!show('rowPal') && show('rowSpeed'), '渐变：不要调色板（走自己的色环），只留速度');
  ok(byId.get('fSpeed').readOnly === false, '渐变时「速度」又能手填了（只读只属于跳变）');

  pick.value = '多色呼吸'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  const eB = fxListOf(0)[0];
  ok(eB.color === CORE.FW.COLOR.BREATH && eB.period === 60 && eB.palette.length === 3,
     `呼吸预置：period=${eB.period} / ${eB.palette.length} 色`);
  ok(show('rowPeriod') && show('rowPal') && !show('rowSpeed'), '呼吸：周期 + 调色板');
  ok(palN() === 3 && show('fxPalAdd') && show('fxPalDel'),
     `呼吸：3 种颜色都画出来，加减还留着（${palN()} 色）`);
  /* 呼吸 = 对称的跳变：只有「渐亮=变暗」和「亮」两行，周期自动 = 渐亮×2 + 亮（只读） */
  ok(show('rowRise') && show('rowHold') && !show('rowFade'),
     '呼吸：渐亮 / 亮 两行都在，没有「变暗」那一行（渐亮 = 渐暗）');
  ok(byId.get('fRiseLab').textContent === '渐亮=变暗(拍)',
     `呼吸：渐亮那一格的标题换成「渐亮=变暗(拍)」（${byId.get('fRiseLab').textContent}）`);
  {
    const fr = byId.get('fRise').value, fh = byId.get('fHold').value, fp = byId.get('fPeriod');
    ok(fp.value === String(+fr * 2 + +fh) && fp.readOnly === true,
       `呼吸：周期只读、自动 = 渐亮 ${fr} × 2 + 亮 ${fh} = ${fp.value}`);
    byId.get('fRise').value = '10';
    byId.get('fRise').oninput({ target: byId.get('fRise') });
    ok(fp.value === String(+fh + 20),
       `呼吸：渐亮改成 10 拍 → 周期当场算成 ${fp.value}（= 10 × 2 + ${fh}）`);
    await new Promise(r => setTimeout(r, 700));    /* 存盘是防抖的，读存档前等一拍 */
    const eB2 = fxListOf(0)[0];       /* 存档是新解析出来的对象，断言得重新取一次 */
    ok(eB2.b_rise === 10 && eB2.period === (+fh + 20),
       `呼吸：两个数落盘（b_rise=${eB2.b_rise} / period=${eB2.period}）`);
    ok(eB2.b_hold === 0 && eB2.rise === eB.rise && eB2.hold === eB.hold,
       `呼吸的数存在 b_rise / b_hold 上（${eB2.b_rise} / ${eB2.b_hold}），跳变的 rise/hold 没动（${eB2.rise} / ${eB2.hold}）`);
  }
  pick.value = '多色呼吸'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  {
    const eB3 = fxListOf(0)[0];
    ok(eB3.period === 60 && eB3.b_rise === 30 && eB3.b_hold === 0 && byId.get('fRise').value === '30',
       `重新套呼吸预置：回到 period 60 / 渐亮 30 / 亮 0（${eB3.period} / ${eB3.b_rise} / ${eB3.b_hold}）—— 上一次改的 10 没赖着`);
  }
  col.value = String(CORE.FW.COLOR.STEP);
  col.onchange({ target: col });
  await new Promise(r => setTimeout(r, 700));
  ok(show('rowFade') && byId.get('fPeriod').readOnly === false,
     '切回跳变：「变暗」那一行回来、周期又能手填了');
  ok(byId.get('fRiseLab').textContent === '渐亮(拍)',
     `切回跳变：渐亮标题还原（${byId.get('fRiseLab').textContent}）`);

  pick.value = '颜色覆盖'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  const eW = fxListOf(0)[0];
  ok(eW.color === CORE.FW.COLOR.WIPE && eW.period === 80 && eW.palette.length === 2,
     `覆盖预置：period=${eW.period} / ${eW.palette.length} 色`);
  ok(palN() === 2, `覆盖只用前 2 个颜色，就只画 2 个色块：${palN()}`);
  ok(!show('fxPalAdd') && !show('fxPalDel'), '覆盖：2 个颜色齐了，+ / − 都收起');

  pick.value = '七彩跳变'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  const eS = fxListOf(0)[0];
  ok(eS.color === CORE.FW.COLOR.STEP && eS.speed === 20 && eS.rise === 4 &&
     eS.hold === 8 && eS.fade === 8,
     `七彩跳变预置：停留 ${eS.speed} / 渐亮 ${eS.rise} / 亮 ${eS.hold} / 暗 ${eS.fade}（开箱就有渐亮，换色处不抖）`);
  ok(show('rowSpeed') && show('rowHold') && show('rowFade') && show('rowRise') &&
     byId.get('fRise').value === '4' && byId.get('fHold').value === '8' && byId.get('fFade').value === '8',
     `七彩跳变：四个数都填进输入框（${byId.get('fSpeed').value}/${byId.get('fRise').value}/${byId.get('fHold').value}/${byId.get('fFade').value}）`);
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
  pick.value = '多色呼吸'; click('fxPresetApply');
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
  pick.value = '彩虹环'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  ok(new Set(pixels().map(p => p.join(','))).size >= 6,
     `彩虹环暂停时画出一整圈颜色（${new Set(pixels().map(p => p.join(','))).size} 种色相）`);

  /* 11d 跳变：tick 0 只有 255/渐亮（没拨到顶点就看不出颜色），暂停时必须拨到包络顶点 */
  fills.length = 0;
  pick.value = '七彩跳变'; click('fxPresetApply');
  await new Promise(r => setTimeout(r, 700));
  ok(has(p => p[0] + p[1] + p[2] > 150),
     `跳变暂停时停在包络顶点、颜色看得见（不是全黑）：${JSON.stringify(pixels().slice(-3))}`);

  /* 渐亮 > 0 且「亮」= 0：包络顶点在渐亮最后一拍（tick 0 反而是黑的）—— 暂停帧也跟着换 */
  {
    const rI = byId.get('fRise'), hI = byId.get('fHold');
    rI.value = '4'; rI.oninput({ target: rI });
    await new Promise(r => setTimeout(r, 700));
    fills.length = 0;
    hI.value = '0'; hI.oninput({ target: hI });
    await new Promise(r => setTimeout(r, 700));
    const e = fxListOf(0)[0];
    ok(e.rise === 4 && e.hold === 0 && e.speed === 12,
       `只有渐亮：停留 = 渐亮 + 亮 + 暗 = ${e.rise} + ${e.hold} + ${e.fade} = ${e.speed}`);
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

console.log(fails ? `\n=== ${fails} 项未通过 ===` : '\n=== 全部通过 ===');
process.exit(fails ? 1 : 0);
