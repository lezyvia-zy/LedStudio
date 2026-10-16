/* 模拟「关掉工具再打开」：连跑两次界面层，共享同一份 localStorage */
import fs from 'node:fs';
const html = fs.readFileSync('led_layout_editor.html','utf8');
const coreSrc = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
const uiSrc   = html.match(/<script id="ui">([\s\S]*?)<\/script>/)[1];
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};

const listeners = {};
const byId = new Map();
let ctxDraw = 0;
const texts = [];                       /* 记下 fillText 的文字，用来断言编辑台的状态行 */
let ctxArcs = 0;                        /* arc() 次数 = 画出来的灯珠数（断言对比条真的按这个长度画） */
const CTX = new Proxy({}, { get:(t,k)=> (k in t ? t[k] : (t[k]=(...a)=>{ctxDraw++; if(k==='fillText') texts.push(String(a[0])); if(k==='arc') ctxArcs++;})), set:(t,k,v)=>{t[k]=v;return true;} });
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

/* ============ 效果编辑台（基础排布） ============ */
const click3 = id => byId.get(id).onclick();
const projState = i => JSON.parse(store.get('led_layout_editor.v1')).projects[i].state;
const tabBtn = t => (byId.get('tabCache') || []).find(b => b.dataset.tab === t);
/* 内存里的值（不必等存盘）*/
const stageRingInMemory = () => +byId.get('stRing').value;

/* ---- 1) 控件在效果页 ---- */
['stStrip','stRing','stCompare'].forEach(id => ok(!!byId.get(id), `编辑台控件 ${id} 存在`));
ok(!!projState(0).stage, '工程里带上了 stage 参数');
ok(projState(0).stage.ringN === 24 && projState(0).stage.stripN === 24,
   `默认基础排布：圆环 ${projState(0).stage.ringN} 颗 / 直线 ${projState(0).stage.stripN} 颗`);

/* ---- 2) 切到效果页 → 中央画布改画编辑台 ---- */
tabBtn('fx').onclick();
await new Promise(r => setTimeout(r, 50));
ctxDraw = 0;
byId.get('stCompare').checked = true; byId.get('stCompare').onchange({ target: byId.get('stCompare') });
ok(ctxDraw > 0, `切到效果页并开对比后重绘了画布（ctx ${ctxDraw} 次）`);
await new Promise(r => setTimeout(r, 700));   /* 等自动保存的防抖 */
ok(projState(0).stage.compare === true, '对比开关写进了工程');

/* ---- 2b) 编辑台第二行给出运行状态（暂停/位置/节奏），调 speed 参数时看得见 ---- */
texts.length = 0;
byId.get('stCompare').onchange({ target: byId.get('stCompare') });
{
  const line = texts.find(t => /拍走 1 格/.test(t)) || '';
  ok(/播放中|已暂停/.test(line), `状态行带播放状态: "${line}"`);
  ok(/位置 \d+\/24 颗/.test(line), '状态行带当前位置（按编辑台圆环颗数换算）');
  ok(/快档 \d+ \/ 慢档 \d+/.test(line), '状态行带快慢档拍数');
}

/* ---- 3) 颗数可以自定义 ---- */
byId.get('stRing').value = '60'; byId.get('stRing').oninput({ target: byId.get('stRing') });
byId.get('stStrip').value = '7';  byId.get('stStrip').oninput({ target: byId.get('stStrip') });
await new Promise(r => setTimeout(r, 700));
ok(projState(0).stage.ringN === 60 && projState(0).stage.stripN === 7,
   `自定义颗数生效：圆环 ${projState(0).stage.ringN} / 直线 ${projState(0).stage.stripN}`);
byId.get('stRing').value = '500'; byId.get('stRing').oninput({ target: byId.get('stRing') });
byId.get('stRing').onchange({ target: byId.get('stRing') });
ok(byId.get('stRing').value === '200', `输入 500 被夹到 200，且输入框回写显示 ${byId.get('stRing').value}`);
byId.get('stRing').value = '24'; byId.get('stRing').oninput({ target: byId.get('stRing') });
await new Promise(r => setTimeout(r, 700));

/* ---- 4) 核心语义：等比缩放（同一个效果在不同长度上张角相同） ---- */
{
  const CORE2 = CORE, FW = CORE.FW;
  const inst = CORE.instNew();
  /* 单点、光宽 10（RING_SIZE=24 基准）、无脉动 */
  CORE.instApplyPreset(inst, { anim: 0, color: 0, width: 10, gap: 0, slow: 8, fast: 1, speed: 0,
                               c1: [255,0,0], c2: [0,0,0] });
  const litRun = N => {
    const m = new Uint8Array(N), hue = new Uint8Array(N);
    /* 用同一个逻辑位置（环的 1/4 处） */
    const pos = Math.trunc((FW.RING_SIZE * 256 / 4) * N / FW.RING_SIZE);
    CORE.renderZoneMaskTo(inst, m, hue, N, pos);
    let lit = 0; for (let i = 0; i < N; i++) if (m[i] > 8) lit++;
    return lit;
  };
  const a8 = litRun(8), a24 = litRun(24), a40 = litRun(40), a104 = litRun(104);
  console.log(`     DEBUG 光宽10 各长度下点亮颗数: 8→${a8}  24→${a24}  40→${a40}  104→${a104}`);
  ok(a8 < a24 && a24 < a40 && a40 < a104, '长度越长点亮的灯越多（张角相同、颗数成比例）');
  /* 比例大致对得上：24 颗时约 10 颗，40 颗时应约 16 颗 */
  ok(Math.abs(a24 - 10) <= 2, `24 颗基准下点亮 ${a24} 颗（期望 ≈10）`);
  ok(Math.abs(a40 - 16) <= 3, `40 颗长段点亮 ${a40} 颗（期望 ≈16，不是 10）`);
  ok(a8 <= 4, `8 颗短段只点亮 ${a8} 颗（旋钮光晕窄，这就是要在模式里微调宽度的原因）`);
}

/* ---- 5) 换效果时编辑台跟着换 ---- */
{
  const before = byId.get('fKind').textContent;
  byId.get('fxTbl').children[3].onclick();          /* 选第 4 个效果 */
  await new Promise(r => setTimeout(r, 60));
  ctxDraw = 0;
  byId.get('stCompare').onchange({ target: byId.get('stCompare') });
  ok(ctxDraw > 0, '换效果后编辑台重绘了');
  ok(byId.get('fKind').textContent.length > 0, `当前编辑的是 ${byId.get('fKind').textContent}`);
}

/* ---- 6) 改参数时编辑台跟着刷新 ---- */
{
  tabBtn('fx').onclick();
  await new Promise(r => setTimeout(r, 50));
  ctxDraw = 0;
  const n0 = byId.get('fSlow');
  n0.value = '12'; n0.oninput({ target: n0 });
  ok(ctxDraw > 0, `改参数后编辑台立即重绘（ctx ${ctxDraw} 次）`);
}

/* ---- 7) 切到别的页恢复成真实灯板 ---- */
{
  tabBtn('zones').onclick();
  await new Promise(r => setTimeout(r, 50));
  ctxDraw = 0;
  byId.get('chkSnap').onchange && byId.get('chkSnap').onchange({ target: byId.get('chkSnap') });
  /* 用一次「选中分区高亮」来触发重绘 */
  const rows = (byId.get('zoneTbl') || {}).children || [];
  if (rows.length) rows[0].onclick();
  ok(ctxDraw > 0, '切到分区页后画的是真实灯板（有重绘）');
}

/* ---- 8) 重开后编辑台设置还在 ---- */
install(); boot(); await new Promise(r => setTimeout(r, 700));
ok(projState(0).stage.ringN === 24 && projState(0).stage.stripN === 7,
   `重开后编辑台设置还在（圆环 ${projState(0).stage.ringN} / 直线 ${projState(0).stage.stripN}）`);
ok(projState(0).stage.compare === true, '对比开关也记得住');

/* ---- 9) F1) 「多长度对比」画的是你板子上真实的几条长度（去重后最多 3 条），标签写实际分区名 ---- */
{
  const labels = () => texts.filter(t => /^\d+ 颗（/.test(t));
  const baseZones = JSON.parse(store.get('led_layout_editor.v1')).projects[0].state.zones.slice();
  /* 换一套分区长度 + 定好对比开关，再连跑一次界面层（等效于重开一次工具），最后强制重画一次对比条 */
  const prep = async (counts, names) => {
    const db = JSON.parse(store.get('led_layout_editor.v1'));
    const st = db.projects[0].state;
    st.zones = counts.map((c, i) => Object.assign({}, baseZones[i % baseZones.length],
      { name: (names || [])[i] || baseZones[i % baseZones.length].name, count: c }));
    st.stage = Object.assign({ ringN: 24, stripN: 24 }, st.stage, { compare: true });
    store.set('led_layout_editor.v1', JSON.stringify(db));
    install(); boot(); await new Promise(r => setTimeout(r, 700));
    tabBtn('fx').onclick();
    await new Promise(r => setTimeout(r, 50));
    texts.length = 0; ctxArcs = 0;
    byId.get('stCompare').checked = true;
    byId.get('stCompare').onchange({ target: byId.get('stCompare') });
  };

  /* 9.1 四条分区、长度 6 / 12 / 12 / 20：去重成 3 条，同长度的分区名并在一行 */
  await prep([6, 12, 12, 20], ['旋钮A', '中环', '中环B', '顶环']);
  let L = labels();
  ok(L.join(' | ') === '6 颗（旋钮A） | 12 颗（中环、中环B） | 20 颗（顶环）',
     `对比条按板子真实长度画 3 条: ${L.join(' | ')}`);
  ok(ctxArcs === 6 + 12 + 20, `画出的灯珠数 = 真实长度之和 ${6 + 12 + 20}（同长度的两条只画一次 12）: ${ctxArcs}`);
  ok(!/40 颗/.test(texts.join()), '不再无条件冒出「40 颗」那类与实物无关的固定长度');

  /* 9.2 5 个不同长度：只取最短 / 中位 / 最长 */
  await prep([4, 8, 12, 20, 40]);
  L = labels();
  ok(L.length === 3 && /^4 颗（/.test(L[0]) && /^12 颗（/.test(L[1]) && /^40 颗（/.test(L[2]),
     `5 种长度只画 3 条（最短 / 中位 / 最长）: ${L.join(' | ')}`);
  ok(ctxArcs === 4 + 12 + 40, `画的就是这 3 条（灯珠 ${ctxArcs} = 4+12+40，不是全画 ${4 + 8 + 12 + 20 + 40}）`);

  /* 9.3 只有两种长度 → 只画两条（有几条真实长度画几条，不补无关的固定长度） */
  await prep([8, 24]);
  L = labels();
  ok(L.length === 2 && /^8 颗（/.test(L[0]) && /^24 颗（/.test(L[1]),
     `板子上只有两种长度就只画两条: ${L.join(' | ')}`);
  ok(ctxArcs === 8 + 24, `两条的灯珠数是 ${ctxArcs}（8 + 24）`);

  /* 9.4 只有一种长度 → 只画一条 */
  await prep([40]);
  L = labels();
  ok(L.length === 1 && /^40 颗（/.test(L[0]), `板子上只有一种长度就只画一条: ${L.join(' | ')}`);
  ok(ctxArcs === 40, `一条的灯珠数是 ${ctxArcs}`);

  /* 9.5 板上一段分区都没有 → 才回落到 8 / 24 / 40 老样子 */
  await prep([]);
  L = labels();
  ok(L.join(' | ') === '8 颗（短段，比如旋钮） | 24 颗（中等环） | 40 颗（长段，比如顶环）',
     `空板上回落到 8 / 24 / 40: ${L.join(' | ')}`);
  ok(ctxArcs === 8 + 24 + 40, `回落那三条的灯珠数是 ${ctxArcs}`);

  /* 9.6 默认工程 SP-3122D（8/8/40/24/24）去重后正好 8 / 24 / 40，与老观感一致 */
  store.delete('led_layout_editor.v1');
  install(); boot(); await new Promise(r => setTimeout(r, 700));
  tabBtn('fx').onclick();
  await new Promise(r => setTimeout(r, 50));
  texts.length = 0; ctxArcs = 0;
  byId.get('stCompare').checked = true;
  byId.get('stCompare').onchange({ target: byId.get('stCompare') });
  L = labels();
  ok(L.length === 3 && /^8 颗（/.test(L[0]) && /^24 颗（/.test(L[1]) && /^40 颗（/.test(L[2]),
     `默认工程去重后正好 8 / 24 / 40: ${L.join(' | ')}`);
  ok(!/短段|中等环|长段/.test(L.join()), '这三条是按真实分区名写的标签，不是回落的那套固定文案');
  ok(ctxArcs === 8 + 24 + 40, `默认工程三条的灯珠数是 ${ctxArcs}`);

  /* 9.7 说明与帮助页同步改口（别再写死 8 / 24 / 40） */
  const tipCmp = (html.match(/<input type="checkbox" id="stCompare" data-tip="([^"]*)"/) || [])[1] || '';
  ok(/真实的分区长度/.test(tipCmp), `对比开关的说明写明了「取真实分区长度」: "${tipCmp.slice(0, 42)}…"`);
  const hs = html.slice(html.indexOf('id="hs-stage"'), html.indexOf('id="hs-bind"'));
  ok(/真实的分区长度/.test(hs) && !/同时画 8 \/ 24 \/ 40/.test(hs),
     '帮助页「效果编辑台」那节同步改口（不再写死 8 / 24 / 40）');
}

console.log(fails ? `\n=== ${fails} 项未通过 ===` : '\n=== 全部通过 ===');
process.exit(fails ? 1 : 0);
