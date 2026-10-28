/* 模拟「关掉工具再打开」：连跑两次界面层，共享同一份 localStorage */
import fs from 'node:fs';
const html = fs.readFileSync('led_layout_editor.html','utf8');

/* 省时：界面脚本里「等一等」的定时器（400ms 自动保存防抖、700/900ms 闪烁清除）整轮测试
 * 要等上百次，纯睡掉两分钟。这里只改「多久之后」，压到 40ms；测试自己的 wait 用真定时器
 * 70ms（40 < 70，落地顺序不变）。3200/6000ms 的状态栏自动清除**不压** —— 有断言依赖它
 * 「这时还看得见」。被测代码一字不动。 */
const realST = globalThis.setTimeout;
const FAST_MS = { 400: 40, 700: 40, 900: 40 };
globalThis.setTimeout = (fn, ms = 0, ...a) => realST(fn, FAST_MS[ms] || ms, ...a);
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

install(); boot(); await new Promise(r => realST(r, 70));

/* ============ 效果编辑台（基础排布） ============ */
const click3 = id => byId.get(id).onclick();
const projState = i => JSON.parse(store.get('led_layout_editor.v1')).projects[i].state;
const tabBtn = t => (byId.get('tabCache') || []).find(b => b.dataset.tab === t);
/* 播放键上那行字收进了 .vh（只给读屏看），断言改读它 */
const playTxt = () => (byId.get('fxPlayBtnTxt') || {}).textContent;
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
await new Promise(r => realST(r, 70));   /* 等自动保存的防抖 */
ok(projState(0).stage.compare === true, '对比开关写进了工程');

/* ---- 2b) 编辑台第二行给出运行状态（暂停/位置/节奏），调 speed 参数时看得见 ---- */
texts.length = 0;
byId.get('stCompare').onchange({ target: byId.get('stCompare') });
{
  const line = texts.find(t => /拍走 1 格/.test(t)) || '';
  ok(/播放中|已暂停/.test(line), `状态行带播放状态: "${line}"`);
  ok(/位置 \d+\/24 颗/.test(line), '状态行带当前位置（按编辑台圆环颗数换算）');
  ok(/快档 \d+ \/ 慢档 \d+/.test(line), '状态行带快慢档拍数');
  ok(/平滑 \d+ms/.test(line), '状态行带平滑 T（50Hz 下改完立刻看得出这个数生效了）');
}

/* ---- 3) 颗数可以自定义 ---- */
byId.get('stRing').value = '60'; byId.get('stRing').oninput({ target: byId.get('stRing') });
byId.get('stStrip').value = '7';  byId.get('stStrip').oninput({ target: byId.get('stStrip') });
await new Promise(r => realST(r, 70));
ok(projState(0).stage.ringN === 60 && projState(0).stage.stripN === 7,
   `自定义颗数生效：圆环 ${projState(0).stage.ringN} / 直线 ${projState(0).stage.stripN}`);
byId.get('stRing').value = '500'; byId.get('stRing').oninput({ target: byId.get('stRing') });
byId.get('stRing').onchange({ target: byId.get('stRing') });
ok(byId.get('stRing').value === '200', `输入 500 被夹到 200，且输入框回写显示 ${byId.get('stRing').value}`);
byId.get('stRing').value = '24'; byId.get('stRing').oninput({ target: byId.get('stRing') });
await new Promise(r => realST(r, 70));

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
install(); boot(); await new Promise(r => realST(r, 70));
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
    install(); boot(); await new Promise(r => realST(r, 70));
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
  install(); boot(); await new Promise(r => realST(r, 70));
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

/* ---- 10) 「播放」独立成一条常驻播放条：播放 / 暂停、步进、倍率、上一条 / 下一条效果 ---- */
{
  /* 10.1 结构与位置：贴在这一页的「下方」（最后一组控件之后），CSS 用 sticky 钉住不动 */
  const paneFx = html.slice(html.indexOf('data-pane="fx"'), html.indexOf('data-pane="exp"'));
  const barAt = paneFx.indexOf('id="fxPlayBar"');
  ok(barAt > 0, '效果页里有独立的播放条 #fxPlayBar');
  ['fxPrev','fxNext','fxPlayName','fxPlayPos','fxTest','fxStepPrev','fxStepNext','fxZero','fxShowReal','fxRate']
    .forEach(id => ok(paneFx.includes('id="' + id + '"'), `播放条里的控件 ${id} 在效果页`));
  ok(!/<legend>播放（常驻）<\/legend>/.test(paneFx), '播放条左上角那个「播放（常驻）」标题删掉了');
  ok(!/id="fxEdit"|id="fxBuiltin"|id="fxCustom"/.test(paneFx.slice(barAt)),
     '播放条排在最后一组控件之后（＝固定在效果模块的下方）');
  const listRow = paneFx.slice(paneFx.indexOf('id="fxAdd"'), paneFx.indexOf('id="fxUp"'));
  ok(!/id="fxTest"/.test(listRow), '「播放」不再挤在列表按钮那行里（独立出来了）');
  const barCss = (html.match(/\.fxbar\{[^}]*\}/) || [''])[0].replace(/\s+/g, ' ');
  ok(/position:\s*sticky/.test(barCss) && /bottom:\s*0/.test(barCss) && /margin-bottom:\s*0/.test(barCss),
     `.fxbar 用 sticky 钉住这一页底部（bottom:0 + 自己下外边距 0）: ${barCss}`);
  ok(/#paneFx\{padding-bottom:0\}/.test(html),
     '效果页那格（#paneFx）里下内边距留 0 —— 两者一起才让播放条滚动时纹丝不动（上一版 bottom:-8px 滚到底会往上跳一小截）');
  const rateAt = html.indexOf('id="fxRate"');
  const rateHtml = html.slice(rateAt, html.indexOf('</select>', rateAt));
  ok((rateHtml.match(/<option/g) || []).length === 6, '倍率 6 档（0.25× ~ 8×，与动画页同一套）');
  ok(/value="1" selected/.test(rateHtml), '倍率默认 1× 固件节拍(20ms)');

  /* 10.1b 图形化：按钮上只有图标（照音乐播放器），文字解释全在悬浮说明里 —— 而且说明要短 */
  const barHtml = paneFx.slice(barAt, paneFx.indexOf('</fieldset>', barAt) + 12);
  const segOf = id => { const at = barHtml.indexOf('id="' + id + '"'); return barHtml.slice(at, barHtml.indexOf('</button>', at)); };
  const svgN = (barHtml.match(/<svg /g) || []).length;
  ok(svgN >= 7, `播放条改用图标键（${svgN} 个 svg：归零 / 上一条 / 播放 / 暂停 / 下一条 / 前一帧 / 后一帧）`);
  const iconTip = {};
  ['fxPrev','fxTest','fxNext','fxStepPrev','fxStepNext','fxZero'].forEach(id => {
    const seg = segOf(id);
    iconTip[id] = (seg.match(/data-tip="([^"]*)"/) || [])[1] || '';
    ok(/<svg /.test(seg) && iconTip[id] !== '' && /class="vh"/.test(seg),
       `${id} = 图形 + 悬浮说明（那行字收进 .vh，只给读屏看）`);
  });
  const tipMax = Object.keys(iconTip).sort((a, b) => iconTip[b].length - iconTip[a].length)[0];
  ok(iconTip[tipMax].length <= 30,
     `图标键的悬浮说明都缩成一行了（最长 ${iconTip[tipMax].length} 字：“${iconTip[tipMax]}”）`);
  const icoCss = (html.match(/\.fxplay button\{[^}]*\}/) || [''])[0].replace(/\s+/g, ' ');
  ok(/width:40px/.test(icoCss) && /height:36px/.test(icoCss) && /display:\s*inline-flex/.test(icoCss),
     `图标键大小固定、居中，比上一版（34×30）又大了一圈：${icoCss}`);
  const playCss = (html.match(/\.fxplay button\.play\{[^}]*\}/) || [''])[0].replace(/\s+/g, ' ');
  ok(/width:56px/.test(playCss) && /height:40px/.test(playCss), `播放键比别的键再大一圈: ${playCss}`);
  const svgCss = (html.match(/\.fxplay button svg\{[^}]*\}/) || [''])[0].replace(/\s+/g, ' ');
  ok(/width:20px/.test(svgCss) && /height:20px/.test(svgCss),
     `图标本身也从 16px 放大到 20px: ${svgCss}`);
  ok(/\.fxplay path\.rnd\{[^}]*stroke-linejoin:round/.test(html),
     '实心三角的角磨圆了（照截图那种圆角三角；只挂 path，免得把旁边的竖条也加粗）');

  /* 上一条 / 下一条 = 实心双三角（照音乐播放器的上一曲 / 下一曲）；归零 = 单独的实心方块 */
  const prevSeg = segOf('fxPrev'), nextSeg = segOf('fxNext'), zeroSeg = segOf('fxZero');
  ok((prevSeg.match(/<path /g) || []).length === 2 && !/fill="none"|class="st"/.test(prevSeg),
     '「上一条」= 两个实心三角（上一版那种细描边箭头换掉了）');
  ok((nextSeg.match(/<path /g) || []).length === 2 && !/fill="none"|class="st"/.test(nextSeg),
     '「下一条」= 两个实心三角（朝右）');
  ok(/<rect [^>]*width="10"[^>]*height="10"/.test(zeroSeg) && (zeroSeg.match(/<path /g) || []).length === 0,
     '「归零」改用实心方块（常见的「停止」记号）');
  ok(!/\.fxplay button\.st svg/.test(html), '上一版那套「细描边图标」的样式删掉了（不留死代码）');
  ok(barHtml.indexOf('id="fxZero"') < barHtml.indexOf('id="fxPrev"'),
     '归零单独摆在整个播放条的最左边');
  const div1 = barHtml.indexOf('class="div"');
  ok(div1 > barHtml.indexOf('id="fxZero"') && div1 < barHtml.indexOf('id="fxPrev"') &&
     barHtml.indexOf('class="div"', div1 + 1) > barHtml.indexOf('id="fxNext"'),
     '归零 / 巡览 / 步进三组之间各有一条分线');

  ok(/\.fxplay\{[^}]*display:\s*flex/.test(html), '图标键排成整齐一行（.fxplay 用 flex）');
  ok(/\.vh\{[^}]*clip:/.test(html), '图标键里那行字用 .vh 藏起来（读屏 / 测试仍能读到）');
  ok(/#fxTest \.iPause\{display:none\}/.test(html) && /#fxTest\.on \.iPause\{display:block\}/.test(html),
     '播放中换成暂停图标（靠 .on 切图标，不再改按钮文字）');

  ok(/const t = \$\('#fxPlayBtnTxt'\)/.test(html) && /t\.textContent = stagePlaying \? '暂停' : '播放'/.test(html),
     'syncStagePlayBtn 同时切图标与那行字');

  /* 10.1c 「在灯板上看」暂挂起：按钮与接线都留着，界面上先不出现 */
  const srAt = barHtml.indexOf('id="fxShowReal"');
  ok(/class="hide"/.test(barHtml.slice(srAt, barHtml.indexOf('</button>', srAt))),
     '「在灯板上看」挂起（.hide 先不摆出来，等「模式」模块完成后再优化）');
  ok(/\$\('#fxShowReal'\)\.onclick\s*=/.test(html), '挂起期间接线留着（回来做时不用重接）');

  tabBtn('fx').onclick();
  await new Promise(r => setTimeout(r, 50));
  ok(byId.get('fxRate').value === '1', `进效果页时倍率显示的是 ${byId.get('fxRate').value}×`);
  ok(/fxPlayBar/.test(html) && /sticky/.test(barCss), '播放条钉在这一页底部（翻页面时也贴着底下、不动）');

  /* 10.2 调速：写在 stage.rate 上，只改编辑台的节奏，不动「动画」页那个倍率 */
  byId.get('fxRate').value = '4'; byId.get('fxRate').onchange({ target: byId.get('fxRate') });
  await new Promise(r => realST(r, 70));
  ok(projState(0).stage.rate === 4, `播放条的倍率写进了工程 stage.rate = ${projState(0).stage.rate}`);
  ok(projState(0).anim.rate === 1, `没有顺手改掉「动画」页的倍率（仍是 ${projState(0).anim.rate}×）`);
  ok(/const tickMs = 20 \/ stageRate\(\)/.test(html), '编辑台按自己的 stageRate() 走（与灯板的累加器分开）');
  ok(/function stageRate\(\)/.test(html) && /rate: 1 \}/.test(html),
     'stageRate() 读 stage.rate，老工程没有这个字段时兜底 1×');

  /* 10.3 步进（后一帧）：暂停着一格一格往前走 —— 位置真的动，而且不会把播放打开 */
  byId.get('fxRate').value = '1'; byId.get('fxRate').onchange({ target: byId.get('fxRate') });
  const posLine = () => (texts.filter(t => /位置 \d+\/\d+ 颗/.test(t)).pop() || '');
  const zIdx = () => Number((posLine().match(/位置 (\d+)\//) || [])[1]);
  const ringN = () => Number((posLine().match(/位置 \d+\/(\d+) 颗/) || [])[1]);
  texts.length = 0; byId.get('stCompare').onchange({ target: byId.get('stCompare') });
  const p0 = posLine();
  const i0 = zIdx();
  for (let i = 0; i < 3; i++) byId.get('fxStepNext').onclick();
  const p1 = posLine();
  ok(playTxt() === '播放', '步进之后仍是暂停状态（步进就是停下来看）');
  ok(p0 !== '' && p1 !== '' && p0 !== p1, `步进让编辑台真的往前走了: "${p0}" → "${p1}"`);
  ok(zIdx() === (i0 + 3) % ringN(), `三次「后一帧」正好走三个灯位（不是走一半插值）: ${p0} → ${p1}`);
  ok(/步进/.test(byId.get('status').textContent),
     `状态栏报了这一步走了几个固件节拍: "${byId.get('status').textContent}"`);

  /* 10.3b 前一帧 / 后一帧：一次按键正好一个灯位，两个方向对称 */
  {
    const i1 = zIdx();
    texts.length = 0; byId.get('fxStepNext').onclick();
    const i2 = zIdx();
    ok(i2 === (i1 + 1) % ringN(), `「后一帧」往前走一个灯位: ${i1} → ${i2}（共 ${ringN()} 颗）`);
    texts.length = 0; byId.get('fxStepPrev').onclick();
    ok(zIdx() === i1, `「前一帧」把相位原地退回来: ${i2} → ${zIdx()}`);
    texts.length = 0; byId.get('fxStepPrev').onclick();
    ok(zIdx() === (i1 + ringN() - 1) % ringN(),
       `「前一帧」再退一格（到头绕回最后一颗）: ${i1} → ${zIdx()}`);
    ok(playTxt() === '播放', '前后翻帧都保持暂停（步进就是停下来看）');
    ok(/回退一个灯位/.test(byId.get('status').textContent),
       `状态栏分得清前后: "${byId.get('status').textContent}"`);
  }
  /* 走不走位置得先问一句：呼吸 / 闪烁这类相位本来就不动，步进别假装它动了 */
  ok(/const moves = instAdvances\(inst\)/.test(html) && /不随位置前进/.test(html),
     '步进先问 instAdvances()（与 instTick 那条判断同一份），不走位置时相位不动、状态栏说明原因');


  /* 10.4 归零：回到起始相位（两条效果从同一起点比） */
  texts.length = 0;
  byId.get('fxZero').onclick();
  const pz = posLine();
  ok(/位置 0\//.test(pz), `归零回到起始相位: "${pz}"`);
  ok(/归零/.test(byId.get('status').textContent), `状态栏说了归零: "${byId.get('status').textContent}"`);
}

/* ---- 11) 播放条：上一条 / 下一条巡览（只换「现在看哪一条」）+ 播放中切换不打断 ---- */
{
  const ids = () => projState(0).effects.list.map(e => e.id);
  const all = () => projState(0).effects.list;
  const beforeIds = ids();
  const N = beforeIds.length;
  const pos = () => byId.get('fxPlayPos').textContent;
  tabBtn('fx').onclick();
  await new Promise(r => setTimeout(r, 50));

  byId.get('fxTbl').children[0].onclick();            /* 从第 1 条开始巡 */
  await new Promise(r => setTimeout(r, 60));
  ok(pos() === `第 1 / ${N} 条`, `播放条报出「现在看第几条 / 共几条」: ${pos()}`);
  ok(byId.get('fxPlayName').textContent === all()[0].name,
     `显示的名字就是这一条: ${byId.get('fxPlayName').textContent}`);

  const title = () => (texts.filter(t => /^效果编辑台 · /.test(t)).pop() || '');
  texts.length = 0; byId.get('stCompare').onchange({ target: byId.get('stCompare') });
  const t0 = title();
  byId.get('fxNext').onclick();
  await new Promise(r => setTimeout(r, 60));
  ok(pos() === `第 2 / ${N} 条`, `「下一条」往后走: ${pos()}`);
  ok(byId.get('fxPlayName').textContent === all()[1].name, '播放条上的名字跟着换');
  ok(byId.get('fName').textContent === byId.get('fxPlayName').textContent,
     '右栏「名称」与播放条说的是同一条效果');
  const t1 = title();
  ok(t0 && t1 && t0 !== t1, `编辑台换到了新效果: "${t0}" → "${t1}"`);

  for (let i = 0; i < N; i++) byId.get('fxNext').onclick();     /* 连点一圈 */
  ok(pos() === `第 2 / ${N} 条`, `到头绕回第一条（点满一圈回到原处: ${pos()}）`);
  byId.get('fxPrev').onclick();
  ok(pos() === `第 1 / ${N} 条`, `「上一条」往回走: ${pos()}`);
  byId.get('fxPrev').onclick();
  ok(pos() === `第 ${N} / ${N} 条`, `在第 1 条按「上一条」绕回最后一条: ${pos()}`);
  await new Promise(r => realST(r, 70));
  ok(ids().join() === beforeIds.join(), '巡览只换选中项：效果库的顺序一条没动');
  ok(projState(0).anim.effectId === beforeIds[N - 1], '选中的那条记进了工程（重开还看这条）');

  /* 播放中换下一条：不打断播放；步进会先暂停 */
  byId.get('fxTest').onclick();
  await new Promise(r => setTimeout(r, 60));
  ok(playTxt() === '暂停', '播放条上按播放 → 变成「暂停」');
  byId.get('fxNext').onclick();
  ok(playTxt() === '暂停', '播放中换下一条不打断播放');
  ok(/正在播/.test(byId.get('status').textContent),
     `状态栏也说了正在播: "${byId.get('status').textContent}"`);
  ok(projState(0).anim.playing === false, '播放条的播放只作用在编辑台，动画页的灯板仍是停的');
  byId.get('fxStepNext').onclick();
  ok(playTxt() === '播放', '步进会先把播放停掉（停下来一格一格看）');
  ok(/id="fxPrev"[^>]*data-tip="[^"]*巡览/.test(html) && /id="fxNext"[^>]*data-tip="[^"]*巡览/.test(html),
     '「上一条 / 下一条」的悬浮说明写明了这是巡览用（不动库里的顺序）');
  byId.get('fxRate').value = '1'; byId.get('fxRate').onchange({ target: byId.get('fxRate') });
}

/* ---- 12) 效果页瘦身与排布：灰字只留几句短的、按钮行排齐（照「分区」页的做法） ---- */
{
  const i = html.indexOf('data-pane="fx"');
  const paneFx = html.slice(i, html.indexOf('data-pane="exp"', i));
  const prose = [...paneFx.matchAll(/<div class="hint"(?![^>]*id=)[^>]*>([\s\S]*?)<\/div>/g)]
    .map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  ok(prose.length <= 5, `效果页静态灰底说明只剩 ${prose.length} 条（≤ 5）`);
  const longest = prose.reduce((a, b) => (b.length > a.length ? b : a), '');
  ok(longest.length <= 100, `最长的一条 ${longest.length} 字（≤ 100）：“${longest.slice(0, 24)}…”`);
  ok(!/id="fxPlayHint"/.test(paneFx), '播放条那大段灰字说明撤掉了（文字改挂悬浮提示）');
  ok(!/「间隔」只在双点追逐时用得上/.test(paneFx) && !/「起始位」只对自定义动效有效/.test(paneFx),
     '被悬浮提示覆盖的重复灰字说明已删（间隔 / 起始位）');
  /* 按钮行统一成 .btnrow（flex + 固定间距），不再各排各的 */
  const inlineRows = [...paneFx.matchAll(/<div style="margin:4px 0">/g)].length;
  ok(inlineRows === 0, `效果页的按钮行都换成了 .btnrow（残留 ${inlineRows} 行 inline 排布）`);
  const rows = [...paneFx.matchAll(/<div class="btnrow/g)].length;
  /* 2026-10-27：「+ 加图层」那一组收起了，剩列表 / 上移下移 / 播放条状态行三组 */
  ok(rows >= 3, `${rows} 组按钮行共用一套排布（列表 / 上移下移 / 播放条状态行）`);
  ok(/<span>模板<\/span><select id="fxPresetPick"[\s\S]{0,700}?<\/select><button id="fxPresetApply"/.test(paneFx),
     '「模板」与「套用」并成一行（跟在标签列后面，不再单独占一行）');
  ok(/\.btnrow\{[^}]*display:\s*flex/.test(html) && /\.btnrow>\s*\.lb\{[^}]*min-width:56px/.test(html),
     '行内标签与其它行的标签列同宽（56px），整页左边缘对齐');

  /* 12b) 排布：图层紧跟「预置效果」，色彩配置沉到页面最下面（2026-10-23 用户要求） */
  const at = name => paneFx.indexOf('<legend>' + name + '</legend>');
  const order = ['预置效果（一键套用到选中效果）', '图层（自定义动效）', '选中效果', '内建参数', '色彩配置'];
  const pos = order.map(at);
  ok(pos.every(v => v > 0) && pos.every((v, n) => n === 0 || v > pos[n - 1]),
     `效果页五块从上到下：${order.join(' → ')}（位置 ${pos.join(' , ')}）`);
  const blockOf = name => paneFx.slice(at(name), paneFx.indexOf('</fieldset>', at(name)));
  const cfg = blockOf('色彩配置');
  ok(['fColor', 'fPalette', 'fPalHint', 'fSpeed', 'fRise', 'fHold', 'fFade',
      'fLevels', 'fHueBase', 'fHueSpeed', 'fPeriod'].every(id => cfg.includes('id="' + id + '"')),
     '「色彩配置」里收着配色 / 调色板 / 停留与渐亮亮暗 / 级数 / 色相（跳变·彩虹·呼吸的节奏都在这一块）');
  const sel = blockOf('选中效果');
  ok(!/id="fColor"|id="fPalette"/.test(sel) &&
     ['fName', 'fLatin', 'fMode', 'fKind', 'fEn', 'fSlow', 'fFast', 'fOffset'].every(id => sel.includes('id="' + id + '"')),
     '「选中效果」只剩身份与档位（名称 / 别名 / 序号 / 类型 / 使能 / 慢速 / 快速 / 起始位）');
  const lay = blockOf('图层（自定义动效）');
  ok(['fLayers', 'fMoves'].every(id => lay.includes('id="' + id + '"')) &&
     !/id="fxAdd(Spot|Twinkle|Fill|Grad)"/.test(lay),
     '「图层（自定义动效）」只剩「改这一层的参数」：四个加层按钮 2026-10-27 已收起');
}

console.log(fails ? `\n=== ${fails} 项未通过 ===` : '\n=== 全部通过 ===');
process.exit(fails ? 1 : 0);
