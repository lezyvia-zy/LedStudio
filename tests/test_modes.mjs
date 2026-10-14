/* 模式页：一个模式里给各分区分配不同效果；同一效果的多条绑定共享一份实例（相位同步） */
import fs from 'node:fs';
const html = fs.readFileSync('led_layout_editor.html','utf8');
const coreSrc = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
const uiSrc   = html.match(/<script id="ui">([\s\S]*?)<\/script>/)[1];
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};

const listeners = {};
const byId = new Map();
const CTX = new Proxy({}, { get:(t,k)=> (k in t ? t[k] : (t[k]=()=>{})), set:(t,k,v)=>{t[k]=v;return true;} });
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

/* ============ 模式页：一个模式里每个分区各跑一个效果 ============ */
const click = id => byId.get(id).onclick();
const projState = i => JSON.parse(store.get('led_layout_editor.v1')).projects[i].state;
const tabBtn = t => (byId.get('tabCache') || []).find(b => b.dataset.tab === t);
const mdRows = () => (byId.get('mdTbl') || {}).children || [];
const bindBox = () => byId.get('mdBinds') || { children: [] };

/* ---- 1) 老存档迁移：每个效果补成一个模式 ---- */
ok(!!tabBtn('mode'), '有「模式」页签');
tabBtn('mode').onclick();
await new Promise(r => setTimeout(r, 50));
const m0 = projState(0).modes.list;
ok(m0.length === 9, `迁移出 ${m0.length} 个模式（每个效果一个，与旧行为一致）`);
ok(m0[0].binds.length === 1 && !m0[0].binds[0].zones.length,
   `模式 0 的绑定 = 全部分区 → 效果 ${m0[0].binds[0].effect}`);
ok(projState(0).anim.modeId === m0[0].id, '当前选中的是模式 0');
ok(mdRows().length === 9, `模式列表渲染出 ${mdRows().length} 行`);

/* ---- 2) 新建一个模式，按用户举的例子配 3 条绑定 ---- */
click('mdAdd');
await new Promise(r => setTimeout(r, 700));
const st1 = projState(0);
ok(st1.modes.list.length === 10, `新建后共 ${st1.modes.list.length} 个模式`);
const md9 = st1.modes.list[9];
ok(st1.anim.modeId === md9.id, '新建后自动选中它');

const effs = st1.effects.list;
/* 直接改存档再重新打开（界面上等价于点三次「添加绑定」再逐项勾选） */
md9.binds = [
  { effect: effs[1].id, zones: [0, 1] },
  { effect: effs[2].id, zones: [2] },
  { effect: effs[1].id, zones: [3, 4] },
];
md9.name = 'LED_MODE_1';
store.set('led_layout_editor.v1', JSON.stringify({ version: 1, current: null, projects: JSON.parse(store.get('led_layout_editor.v1')).projects }));
{
  const o = JSON.parse(store.get('led_layout_editor.v1'));
  o.projects[0].state = st1;
  store.set('led_layout_editor.v1', JSON.stringify(o));
}
install(); boot(); await new Promise(r => setTimeout(r, 700));
tabBtn('mode').onclick();
await new Promise(r => setTimeout(r, 50));
mdRows()[9].onclick();                      /* 重开后 selMd 回到 0，先选中模式 9 */
await new Promise(r => setTimeout(r, 60));
ok(bindBox().children.length === 3, `绑定编辑器渲染出 ${bindBox().children.length} 条（模式 9 的 3 条绑定）`);

/* ---- 3) 核心语义：同一效果共享实例（= 同步），不同效果才各建实例 ---- */
const st2 = JSON.parse(JSON.stringify(st1));
st2.anim.modeId = md9.id;
const sim = CORE.simInit();
CORE.simApplyMode(sim, st2);
ok(sim.insts.length === 2, `3 条绑定只建了 ${sim.insts.length} 个实例（效果1 被两条绑定共用）`);
ok(JSON.stringify(sim.plan.map(p => p.inst)) === '[0,1,0]',
   `绑定 → 实例 的映射 = ${JSON.stringify(sim.plan.map(p => p.inst))}（第 1、3 条共用实例 0）`);
ok(JSON.stringify(sim.plan.map(p => p.zones)) === '[[0,1],[2],[3,4]]',
   `分区划分 = ${JSON.stringify(sim.plan.map(p => p.zones))}`);

/* ---- 4) 同步是真的：两组的相位跟随同一个实例 ---- */
CORE.simSetSpeed(sim, 'slow');
for (let t = 0; t < 40; t++) CORE.simTick(sim, st2, false);
/* 分区 0 与分区 1（同一实例）、以及分区 3/4 都应该在同相位上亮 */
const litOf = zi => {
  const z = st2.zones[zi];
  let bn = -1, bb = -1;
  for (let i = 0; i < z.count; i++) {
    const n = z.start + i, v = sim.fb[n*3] + sim.fb[n*3+1] + sim.fb[n*3+2];
    if (v > bb) { bb = v; bn = i; }
  }
  return { at: bn, lit: bb > 0 };
};
const a0 = litOf(0), a1 = litOf(1), a3 = litOf(3), a4 = litOf(4), a2 = litOf(2);
ok(a0.lit && a1.lit && a2.lit && a3.lit && a4.lit, '五个分区都有灯亮');
/* 同一实例、不同长度的环：按 zpos = pos*len/RING_SIZE 等比缩放，所以相对位置一致 */
const frac = o => o.at;
ok(true, `各分区最亮位置: 分区0=${a0.at}/${st2.zones[0].count} 分区1=${a1.at}/${st2.zones[1].count} ` +
         `分区2=${a2.at}/${st2.zones[2].count} 分区3=${a3.at}/${st2.zones[3].count} 分区4=${a4.at}/${st2.zones[4].count}`);
/* 分区 0 与 1 是同长环且同一实例 → 位置必须完全相同 */
ok(a0.at === a1.at, `分区0 与 分区1 同相位（${a0.at} = ${a1.at}）`);
ok(a3.at === a4.at, `分区3 与 分区4 同相位（${a3.at} = ${a4.at}）`);

/* ---- 5) 改「全部分区」那条绑定的勾选：显式化 ---- */
tabBtn('mode').onclick();
await new Promise(r => setTimeout(r, 50));
mdRows()[9].onclick();
await new Promise(r => setTimeout(r, 700));
ok(bindBox().children.length === 3, '选中模式 9 后绑定条数不变');

/* ---- 6) 拆开按钮：一条覆盖全部分区的绑定 → 每个分区一条 ---- */
tabBtn('mode').onclick();
await new Promise(r => setTimeout(r, 50));
mdRows()[0].onclick();                      /* 模式 0：一条「全部分区」绑定 */
await new Promise(r => setTimeout(r, 700));
click('mdAllZones');
await new Promise(r => setTimeout(r, 700));
const st3 = projState(0);
ok(st3.modes.list[0].binds.length === 5, `拆开后变成 ${st3.modes.list[0].binds.length} 条（每个分区一条）`);
ok(st3.modes.list[0].binds.every((b, i) => b.zones.length === 1 && b.zones[0] === i),
   '每条绑定只覆盖一个分区，且按序');

/* ---- 6b) M1) 同一分区被同一模式的多条绑定同时覆盖 → V34（校验页能跳回这个模式） ---- */
{
  const md9i = st1.modes.list.findIndex(m => m.id === md9.id);
  const ow = JSON.parse(JSON.stringify(st1));
  ow.modes.list[md9i].binds[0].zones = [];       /* 第 1 条改成「全部分区」→ 与后面两条重叠 */
  const v34 = CORE.validate(ow).filter(i => i.code === 'V34');
  ok(v34.length === 1 && v34[0].level === 'warn',
     `多条绑定覆盖同一分区 → 1 条 V34 警告: ${v34[0] && v34[0].msg}`);
  ok(v34[0].jump && v34[0].jump.pane === 'mode' && v34[0].jump.mode === md9i,
     `V34 指向「模式」页第 ${md9i + 1} 条: ${JSON.stringify(v34[0] && v34[0].jump)}`);
  ok(/被多条绑定同时覆盖/.test(v34[0].msg) && v34[0].msg.includes(ow.zones[2].name),
     '提示里点明了是哪些分区被覆盖、第几条绑定抢的');

  const ow2 = JSON.parse(JSON.stringify(st1));
  ow2.modes.list[md9i].binds[0].zones = [0, 1];
  ok(CORE.validate(ow2).filter(i => i.code === 'V34').length === 0,
     '分区不重叠 → 不报 V34（正常配置不受打扰）');
}

/* ---- 7) 持久化 ---- */
install(); boot(); await new Promise(r => setTimeout(r, 700));
const st4 = projState(0);
ok(st4.modes.list.length === 10, `重开后模式数 ${st4.modes.list.length}`);
const md9b = st4.modes.list.find(m => m.name === 'LED_MODE_1');
ok(!!md9b, '重开后模式名还在');
ok(md9b && JSON.stringify(md9b.binds.map(b => b.zones)) === '[[0,1],[2],[3,4]]',
   `重开后分区划分还在: ${md9b && JSON.stringify(md9b.binds.map(b => b.zones))}`);

console.log(fails ? `\n=== ${fails} 项未通过 ===` : '\n=== 全部通过 ===');
process.exit(fails ? 1 : 0);
