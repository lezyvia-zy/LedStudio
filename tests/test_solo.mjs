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

install(); boot(); await new Promise(r => realST(r, 70));

/* ============ 单独预览一个效果 ============ */
const click2 = id => byId.get(id).onclick();
/* 播放键上那行字收进了 .vh（只给读屏看），断言改读它 */
const stagePlayTxt = () => byId.get('fxPlayBtnTxt').textContent;
const projState = i => JSON.parse(store.get('led_layout_editor.v1')).projects[i].state;
const tabBtn = t => (byId.get('tabCache') || []).find(b => b.dataset.tab === t);
const anim = () => projState(0).anim;

/* ---- 1) 控件在 ---- */
ok(!!byId.get('aTarget'), '「预览对象」下拉存在');
ok(!!byId.get('aTargetHint'), '有说明这一行');
tabBtn('anim').onclick();
ok(byId.get('aTarget').value === 'mode', `默认预览对象 = ${byId.get('aTarget').value}`);
ok(/模式页配好的分配/.test(byId.get('aTargetHint').innerHTML), '按模式时的说明文案正确');

/* ---- 2) 切到「单独一个效果」---- */
byId.get('aTarget').value = 'effect';
byId.get('aTarget').onchange();
await new Promise(r => realST(r, 70));
ok(anim().previewTarget === 'effect', '预览对象已存进工程状态');
ok(/铺到<b>所有分区<\/b>/.test(byId.get('aTargetHint').innerHTML), '说明文案切成了「单独」那套');

/* 下拉里现在列的是效果（9 个），不是模式 */
{
  const opts = (byId.get('aPreset').children || []).map(o => o.value);
  const effIds = projState(0).effects.list.map(e => e.id);
  ok(opts.length === effIds.length && opts[0] === effIds[0],
     `下拉改列效果库（${opts.length} 项，首项 ${opts[0]}）`);
}

/* ---- 3) 核心：单独预览时，实例表只有一个、且铺满所有分区 ---- */
{
  const st = projState(0);
  st.anim.previewTarget = 'effect';
  st.anim.soloEffectId = st.effects.list[8].id;      /* 第 9 个：光宽 16，跟模式0（光宽 10）明显不同 */
  const CORE2 = CORE; const FW = CORE.FW;
  const sim = CORE2.simInit();
  CORE2.simApplySolo(sim, st, st.anim.soloEffectId);
  ok(sim.insts.length === 1, `只有一个实例（实际 ${sim.insts.length}）`);
  ok(sim.plan.length === 1 && sim.plan[0].zones.length === st.zones.length,
     `铺满了 ${sim.plan[0] ? sim.plan[0].zones.length : 0} 个分区`);
  ok(sim.insts[0].eff === 8, `实例跑的是第 ${sim.insts[0].eff} 个效果（期望 8）`);
  /* 跟「按模式」对比：模式只给一个分区跑别的效果时，两者结果必须不同 */
  const sim2 = CORE2.simInit();
  CORE2.simApplyMode(sim2, st);
  CORE2.simSetSpeed(sim, 'slow'); CORE2.simSetSpeed(sim2, 'slow');
  for (let t = 0; t < 20; t++) { CORE2.simTick(sim, st, false); CORE2.simTick(sim2, st, false); }
  let diff = 0;
  for (let i = 0; i < FW.LED_COUNT * 3; i++) if (sim.fb[i] !== sim2.fb[i]) diff++;
  /* 自定义效果也要能单独预览（图层必须挂上） */
  {
    const st2 = JSON.parse(JSON.stringify(st));
    st2.effects.list[4] = Object.assign(CORE.newCustomEffect(4, '自定义X'), {
      layers: [{ kind:'fill', level:255, pulse_period:0, pulse_amp:0, wave:0, direction:1, bounce:0,
                 cmode:1, hue_base:0, hue_spread:255, hue_speed:0, spans:0, rotate:0 }] });
    const simC = CORE.simInit();
    CORE.simApplySolo(simC, st2, st2.effects.list[4].id);
    ok(simC.insts[0].anim.layers.length === 1, '自定义效果单独预览时图层已挂到实例上');
    CORE.simSetSpeed(simC, 'slow');
    for (let t = 0; t < 3; t++) CORE.simTick(simC, st2, false);
    let lit = 0; for (let i = 0; i < FW.LED_COUNT; i++) if (simC.fb[i*3] + simC.fb[i*3+1] + simC.fb[i*3+2] > 0) lit++;
    ok(lit > 0, `自定义效果单独预览确实点亮了 ${lit} 个灯位`);
  }
  ok(diff > 0, `单独预览与按模式的画面不同（${diff} 个字节不一样），说明确实各走各的`);
}

/* ---- 4) 效果页的「播放」是就地播，不跳页，而且不影响动画页 ---- */
tabBtn('fx').onclick();
await new Promise(r => setTimeout(r, 50));
byId.get('fxTbl').children[2].onclick();            /* 选第 3 个效果 */
await new Promise(r => setTimeout(r, 60));
const pick = projState(0).effects.list[2].id;
ok(projState(0).anim.playing === false, '开局动画页是停着的');

click2('fxTest');
await new Promise(r => setTimeout(r, 60));
ok(stagePlayTxt() === '暂停', `编辑台按钮变成「${stagePlayTxt()}」`);
{
  const onTab = (byId.get('tabCache') || []).filter(b => b.classList.contains('on')).map(b => b.dataset.tab);
  ok(onTab.join() === 'fx', `播放后仍在效果页（当前 ${onTab.join()}），没有跳走`);
}
/* ★ 关键：编辑台在播，动画页的灯板不该跟着跑 */
await new Promise(r => realST(r, 70));
ok(projState(0).anim.playing === false,
   '编辑台在播，但动画页的播放状态没被带起来（两处预览互不影响）');
ok(byId.get('aPlay').textContent === '播放', `动画页那边的按钮仍是「${byId.get('aPlay').textContent}」`);

click2('fxTest');                          /* 先把编辑台停掉 */
await new Promise(r => setTimeout(r, 60));
ok(stagePlayTxt() === '播放', '编辑台已停下');

/* 反过来：动画页在播，切回效果页时编辑台不该显示成在播 */
tabBtn('anim').onclick();
await new Promise(r => setTimeout(r, 50));
byId.get('aPlay').onclick();
await new Promise(r => realST(r, 70));
ok(projState(0).anim.playing === true, '动画页开始播');
tabBtn('fx').onclick();
await new Promise(r => setTimeout(r, 60));
ok(stagePlayTxt() === '播放',
   `切回效果页，编辑台按钮仍是「${stagePlayTxt()}」（没跟着灯板走）`);
tabBtn('anim').onclick();
await new Promise(r => setTimeout(r, 50));
byId.get('aPlay').onclick();                        /* 把灯板停掉 */
await new Promise(r => realST(r, 70));
tabBtn('fx').onclick();
await new Promise(r => setTimeout(r, 50));

/* ---- 4b) 「在灯板上看」暂挂起（界面上 .hide 不摆出来）但接线还在：
 *      按下仍会把当前效果铺满真实分区、切到动画页 —— 等「模式」模块完成后回来优化。 ---- */
ok(/id="fxShowReal" class="hide"/.test(html), '「在灯板上看」在界面上挂起（.hide）');
ok(/\$\('#fxShowReal'\)\.onclick\s*=/.test(html), '接线留着（挂起期间仍由这段守着）');
click2('fxShowReal');
await new Promise(r => realST(r, 70));
tabBtn('anim').onclick();
await new Promise(r => setTimeout(r, 50));
ok(anim().previewTarget === 'effect', '「在灯板上看」把预览对象切成「单独一个效果」');
ok(anim().soloEffectId === pick, `铺的是选中的那个效果（${anim().soloEffectId}）`);
ok(byId.get('aPreset').value === pick, '下拉也同步到了它');

/* ---- 5) 不影响工程里的模式分配 ---- */
{
  const st = projState(0);
  ok(st.modes.list.length === 9, `模式数没变（${st.modes.list.length}）`);
  ok(st.modes.list[0].binds.length === 1 && !st.modes.list[0].binds[0].zones.length,
     '模式 0 的绑定还是原样（全部分区一条）');
}

/* ---- 6) 切回「按模式」应恢复 ---- */
byId.get('aTarget').value = 'mode';
byId.get('aTarget').onchange();
await new Promise(r => realST(r, 70));
ok(anim().previewTarget === 'mode', '切回按模式');
ok(/模式页配好的分配/.test(byId.get('aTargetHint').innerHTML), '说明文案切回按模式');
{
  const opts = (byId.get('aPreset').children || []).map(o => o.value);
  const modeIds = projState(0).modes.list.map(m => m.id);
  ok(opts.length === modeIds.length && opts[0] === modeIds[0], `下拉改回列模式（${opts.length} 项）`);
}

/* ---- 7) 关掉再打开，预览对象记得住 ---- */
byId.get('aTarget').value = 'effect'; byId.get('aTarget').onchange();
await new Promise(r => realST(r, 70));
install(); boot(); await new Promise(r => realST(r, 70));
ok(projState(0).anim.previewTarget === 'effect', '重开后仍是「单独一个效果」');
byId.get('aTarget') && ok(byId.get('aTarget').value === 'effect', '控件也同步了');

console.log(fails ? `\n=== ${fails} 项未通过 ===` : '\n=== 全部通过 ===');
process.exit(fails ? 1 : 0);
