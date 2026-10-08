/* 模拟「关掉工具再打开」：连跑两次界面层，共享同一份 localStorage */
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
      if (sel === '#tabs button') return [...html.matchAll(/data-tab="([a-z]+)"/g)].map(m=>{const e=mkEl('button');e.dataset={tab:m[1]};return e;});
      return [];
    },
    createElement:t=>mkEl(t,''), body:{appendChild(){}}, addEventListener(){}, execCommand(){return true;},
  };
  globalThis.window = { addEventListener(t,f){(listeners['window:'+t] ||= []).push(f);}, devicePixelRatio:1 };
  globalThis.addEventListener = globalThis.window.addEventListener;
}
const boot = () => new Function(coreSrc + '\n' + uiSrc)();

const decode = () => { const raw = store.get('led_layout_editor.v1'); return raw ? JSON.parse(raw) : null; };

/* ===== 第一次打开 ===== */
install(); boot(); await new Promise(r=>setTimeout(r,700));
ok(store.has('led_layout_editor.v1'), '第一次打开：已建初始存档');

/* 1) 改一下 SP-3122D 里 0 号分区的名字 */
const zName = byId.get('zName');
ok(!!zName && !!zName.oninput, '分区名输入框已接线');
zName.value = '改过的名字'; zName.oninput({ target: zName });

/* 2) 新建一个空白项目，在里面放一颗灯 */
byId.get('btnProjNew').onclick();
await new Promise(r=>setTimeout(r,700));
const placeBtn = (byId.get('left').children || []).find(b => b.dataset.mode === 'place');
ok(!!placeBtn, '左侧模式栏含「放置编号」按钮');
placeBtn.onclick();
const pd = (listeners['cv:pointerdown'] || [])[0];
ok(!!pd, '画布已注册 pointerdown 监听');
pd({ pointerId:1, button:0, clientX:300, clientY:400, shiftKey:false });
await new Promise(r=>setTimeout(r,800));

const s1 = decode();
ok(s1.projects.length === 2, `第一次打开：共 ${s1.projects.length} 个项目`);
const blank = s1.projects[1];
ok(blank.state.leds.length === 1, `空白项目里放了 ${blank.state.leds.length} 颗灯（期望 1）`);
const placed = blank.state.leds[0];
console.log(`   放的灯: n=${placed && placed.n} @ (${placed && placed.x}, ${placed && placed.y})`);
ok(s1.projects[0].state.zones[0].name === '改过的名字',
   `原项目分区名已改: "${s1.projects[0].state.zones[0].name}"`);

/* ===== 关掉工具，重新打开 ===== */
install(); boot(); await new Promise(r=>setTimeout(r,700));

const s2 = decode();
ok(s2.projects.length === 2, `重新打开后项目数 = ${s2.projects.length}`);
ok(s2.current === s1.current, '重新打开后停在同一个项目上');
const l2 = s2.projects[1].state.leds;
ok(l2.length === 1, `重新打开后灯数仍为 ${l2.length}（期望 1）`);
ok(l2[0] && l2[0].n === placed.n && l2[0].x === placed.x && l2[0].y === placed.y,
   `重新打开后灯的位置一致: n=${l2[0] && l2[0].n} @ (${l2[0] && l2[0].x}, ${l2[0] && l2[0].y})`);
ok(s2.projects[0].state.zones[0].name === '改过的名字',
   `重新打开后分区名仍是「${s2.projects[0].state.zones[0].name}」`);
ok(byId.get('headInfo').textContent.includes('1/104'),
   `重新打开后顶栏显示: "${byId.get('headInfo').textContent}"`);
ok(((byId.get('projList')||{}).children||[]).length === 2, '重新打开后左侧项目区有 2 项');
ok(((byId.get('projList')||{}).children||[])[1].classList.contains('on'), '重新打开后高亮仍在原来的项目上');

console.log(fails?`\n=== ${fails} 项未通过 ===`:'\n=== 全部通过 ===');
process.exit(fails?1:0);
