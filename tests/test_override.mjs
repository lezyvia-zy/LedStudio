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
const CTX = new Proxy({}, { get:(t,k)=> (k in t ? t[k] : (t[k]=()=>{ctxDraw++;})), set:(t,k,v)=>{t[k]=v;return true;} });
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

/* ============ 绑定的全套参数覆盖 ============ */
const projState = i => JSON.parse(store.get('led_layout_editor.v1')).projects[i].state;
const tabBtn = t => (byId.get('tabCache') || []).find(b => b.dataset.tab === t);
const wait = ms => new Promise(r => setTimeout(r, ms));

/* ---- 1) 在模式页把一条绑定打开「覆盖参数」 ---- */
tabBtn('mode').onclick(); await wait(50);
byId.get('mdTbl').children[0].onclick();          /* 模式 0：一条覆盖全部分区的绑定 */
await wait(700);

const cardBox = byId.get('mdBinds');
ok(cardBox.children.length === 1, '模式 0 有一条绑定');
const card = cardBox.children[0];
/* 找到「覆盖参数」那个复选框 */
const cbs = [];
(function walk(n) { (n.children || []).forEach(c => { if (c.tagName === 'INPUT' && c.type === 'checkbox') cbs.push(c); walk(c); }); })(card);
ok(cbs.length >= 1, `卡片里找到 ${cbs.length} 个复选框`);
cbs[cbs.length - 1].checked = true;
cbs[cbs.length - 1].onchange();
await wait(700);

const st1 = projState(0);
const b0 = st1.modes.list[0].binds[0];
ok(!!b0.override, '打开了覆盖参数，绑定上多了一份副本');
ok(b0.override.id === st1.effects.list[0].id, '副本是从原效果复制的（id 相同）');
ok(String(b0.override.name).indexOf('覆盖') >= 0, `副本名字标了「覆盖」：${b0.override.name}`);
ok(st1.effects.list[0].name.indexOf('覆盖') < 0, '效果库里的原效果没被动');

/* ---- 2) 改覆盖不影响原效果 ---- */
b0.override.slow = 40;
b0.override.c1 = [0, 255, 0];
store.set('led_layout_editor.v1', JSON.stringify(
  Object.assign(JSON.parse(store.get('led_layout_editor.v1')), {})));
{
  const o = JSON.parse(store.get('led_layout_editor.v1'));
  o.projects[0].state = st1;
  store.set('led_layout_editor.v1', JSON.stringify(o));
  install(); boot(); await wait(700);
}
{
  const st = projState(0);
  ok(st.effects.list[0].slow !== 40, `原效果的 slow 还是 ${st.effects.list[0].slow}（没被改）`);
  ok(st.modes.list[0].binds[0].override.slow === 40, '覆盖的 slow = 40');
  ok(JSON.stringify(st.modes.list[0].binds[0].override.c1) === '[0,255,0]', '覆盖的颜色也存住了');
}

/* ---- 3) 预览用的是覆盖后的参数 ---- */
{
  const st = projState(0);
  const inst = CORE.instNew();
  CORE.simApplyEffect(inst, CORE.resolveEffect(st, st.modes.list[0].binds[0]),
                      CORE.effectIndex(st, st.modes.list[0].binds[0].effect));
  ok(inst.speed_slow === 40, `预览实例用的是覆盖后的慢速档 ${inst.speed_slow}`);
  {
    const st2 = JSON.parse(JSON.stringify(st));
    const bb = st2.modes.list[0].binds[0];
    bb.override.color = CORE.FW.COLOR.SOLID;      /* 单色才吃 c1 */
    const i2 = CORE.instNew();
    CORE.simApplyEffect(i2, CORE.resolveEffect(st2, bb), 0);
    ok(i2.color.current.r === 0 && i2.color.current.g === 255, '切成单色后，预览实例用的是覆盖后的颜色');
  }
}

/* ---- 4) 导出：覆盖解析成独立的一行，绑定指过去 ---- */
{
  const st = projState(0);
  const plan = CORE.modesPlan(st);
  ok(plan.effRows.length === 10, `效果表变成 ${plan.effRows.length} 行（9 个原效果 + 1 份覆盖，没有重复行）`);
  ok(plan.mdRows.length === 9 && plan.bindRows.length === 9, `模式表 ${plan.mdRows.length} 行 / 绑定表 ${plan.bindRows.length} 行（默认 9 个模式）`);
  ok(plan.bindRows[0].effect === 9, `绑定指向第 ${plan.bindRows[0].effect} 行（那份覆盖）`);
  ok(plan.effRows[9].slow === 40, '那一行的 slow 是覆盖后的 40');
  ok(plan.effRows[0].slow !== 40, '原效果那一行没变');
  const hdr = CORE.exportEffectsC(st, { form: 'header', comment: 'ascii', eol: 'lf' });
  ok(/#define LED_GEN_EFFECT_COUNT  10/.test(hdr), '导出的效果数 = 10（不是 18）');
  ok(/#define LED_GEN_MODE_COUNT    9/.test(hdr), '导出的模式数 = 9');
}

/* ---- 5) 同样的覆盖 = 共用实例（仍然同步） ---- */
{
  const st = JSON.parse(JSON.stringify(projState(0)));
  const b = st.modes.list[0].binds[0];
  /* 拆成两个分区，共用同一份覆盖 */
  b.zones = [0];
  st.modes.list[0].binds.push({ effect: b.effect, zones: [1], override: JSON.parse(JSON.stringify(b.override)) });
  st.anim.modeId = st.modes.list[0].id;
  const sim = CORE.simInit();
  CORE.simApplyMode(sim, st);
  ok(sim.insts.length === 1, `两条绑定用同样的覆盖 → 只建 ${sim.insts.length} 个实例（同步）`);
  /* 参数不同则各建一个 */
  st.modes.list[0].binds[1].override.slow = 7;
  const sim2 = CORE.simInit();
  CORE.simApplyMode(sim2, st);
  ok(sim2.insts.length === 2, `参数不同 → 各建各的（${sim2.insts.length} 个实例）`);
}

/* ---- 6) 「微调参数」跳到效果页并带上横条 ---- */
tabBtn('mode').onclick(); await wait(50);
byId.get('mdTbl').children[0].onclick(); await wait(700);
{
  const c2 = byId.get('mdBinds').children[0];
  const btns = [];
  (function walk(n) { (n.children || []).forEach(c => { if (c.tagName === 'BUTTON') btns.push(c); walk(c); }); })(c2);
  const tune = btns.find(b => b.textContent === '微调参数');
  ok(!!tune, '有「微调参数」按钮');
  tune.onclick();
  await wait(60);
  ok(byId.get('fxTarget') && byId.get('fxTarget').style.display !== 'none', '效果页顶部出现了「正在微调」横条');
  ok(((byId.get('fxTarget').children || [])[0] || {}).innerHTML && /正在微调/.test(byId.get('fxTarget').children[0].innerHTML),
     '横条说明了当前在微调哪条绑定');
  /* 在效果页改参数，改的是覆盖而不是原效果 */
  const slowEl = byId.get('fSlow');
  ok(+slowEl.value === 40, `编辑器里显示的慢速档是覆盖后的 ${slowEl.value}`);
  slowEl.value = '33'; slowEl.oninput({ target: slowEl });
  await wait(700);
  const st = projState(0);
  ok(st.modes.list[0].binds[0].override.slow === 33, '改动写进了覆盖');
  ok(st.effects.list[0].slow !== 33, `原效果没被动（slow 仍是 ${st.effects.list[0].slow}）`);
}

/* ---- 7) 「返回效果库」 ---- */
{
  const back = (byId.get('fxTarget').children || []).find(b => b.tagName === 'BUTTON');
  ok(!!back, '横条上有返回按钮');
  back.onclick();
  await wait(60);
  ok(byId.get('fxTarget').style.display === 'none', '返回后横条消失');
  ok(+byId.get('fSlow').value === projState(0).effects.list[0].slow,
     '编辑器回到了效果库里那个原效果');
}

console.log(fails ? `\n=== ${fails} 项未通过 ===` : '\n=== 全部通过 ===');
process.exit(fails ? 1 : 0);
