/* 右侧栏分隔条：拖拽 / 边界夹紧 / 双击复位 / 键盘调节 / 宽度记忆，以及面板的弹性布局 */
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

/* ============ 右侧栏可调宽度 ============ */
const el = id => byId.get(id);
const basis = () => parseInt(String((el('right') || {}).style.flexBasis || '300').replace('px', ''), 10);
const fire = (id, type, ev) => (listeners[id + ':' + type] || []).forEach(f => f(ev));

/* ---- 1) 分隔条存在且位置正确 ---- */
ok(!!el('rightSplit'), '分隔条元素存在');
{
  const iCenter = html.indexOf('<div id="center">');
  const iSplit  = html.indexOf('id="rightSplit"');
  const iRight  = html.indexOf('<aside id="right">');
  ok(iCenter < iSplit && iSplit < iRight, '分隔条夹在画布与右侧栏之间');
}
ok(/cursor:col-resize/.test(html), '分隔条光标是 col-resize');
ok(/role="separator"/.test(html) && /tabindex="0"/.test(html), '分隔条可聚焦（键盘也能调）');

/* ---- 2) 拖拽改宽度 ---- */
const w0 = basis();
ok(w0 === 300, `初始宽度 ${w0}px（默认 300）`);
fire('rightSplit', 'pointerdown', { clientX: 1000, pointerId: 1, preventDefault() { } });
ok((el('rightSplit').classList.contains('dragging')), '按下时进入拖拽态');
fire('rightSplit', 'pointermove', { clientX: 900 });      /* 往左拖 100 → 右侧栏变宽 */
ok(basis() === 400, `往左拖 100px → ${basis()}px（期望 400）`);
fire('rightSplit', 'pointermove', { clientX: 1100 });     /* 往右拖 → 变窄 */
ok(basis() === Math.max(220, 300 - 100), `往右拖到 1100 → ${basis()}px（期望 200，但下限 220）`);
fire('rightSplit', 'pointerup', {});
ok(!el('rightSplit').classList.contains('dragging'), '松开后退出拖拽态');
ok(store.has('led_layout_editor.rightWidth'), '松手时把宽度存进本地存储');
ok(store.get('led_layout_editor.rightWidth') === String(basis()), `存的值与当前一致 (${store.get('led_layout_editor.rightWidth')})`);

/* ---- 3) 边界夹紧 ---- */
fire('rightSplit', 'pointerdown', { clientX: 1000, pointerId: 1, preventDefault() { } });
fire('rightSplit', 'pointermove', { clientX: -5000 });
ok(basis() === 820, `往左拖到极限 → ${basis()}px（上限 820）`);
fire('rightSplit', 'pointermove', { clientX: 9000 });
ok(basis() === 220, `往右拖到极限 → ${basis()}px（下限 220）`);
fire('rightSplit', 'pointerup', {});

/* ---- 4) 双击复位 ---- */
fire('rightSplit', 'dblclick', {});
ok(basis() === 300, `双击复位到 ${basis()}px`);

/* ---- 5) 键盘调节 ---- */
fire('rightSplit', 'keydown', { key: 'ArrowLeft', preventDefault() { } });
ok(basis() === 324, `← 加宽到 ${basis()}px`);
fire('rightSplit', 'keydown', { key: 'ArrowRight', preventDefault() { } });
ok(basis() === 300, `→ 收窄回 ${basis()}px`);

/* ---- 6) 关掉再打开：宽度要记住 ---- */
fire('rightSplit', 'pointerdown', { clientX: 1000, pointerId: 1, preventDefault() { } });
fire('rightSplit', 'pointermove', { clientX: 700 });     /* +300 → 600 */
fire('rightSplit', 'pointerup', {});
ok(basis() === 600, `设为 ${basis()}px`);
install(); boot(); await new Promise(r => setTimeout(r, 700));
ok(basis() === 600, `重新打开后仍是 ${basis()}px`);

/* ---- 7) 内容自适应：行与控件是弹性的 ---- */
{
  const paneCss = (html.match(/label\.row\{[^}]*\}/) || [''])[0];
  ok(/min-width:0/.test(paneCss), '行允许收缩（min-width:0）');
  const ctrlCss = (html.match(/label\.row>input, label\.row>select\{[^}]*\}/) || [''])[0];
  ok(/flex:1 1 auto/.test(ctrlCss), '控件列吃掉剩余宽度: ' + ctrlCss);
  const labelCss = (html.match(/label\.row>span:first-child\{[^}]*\}/) || [''])[0];
  ok(/text-overflow:ellipsis/.test(labelCss), '标签过长时省略号，不把控件挤出去');
  ok(/flex-wrap:wrap/.test((html.match(/\.card\{[^}]*\}/) || [''])[0]), '图层卡片会自动换行成多列');
  ok(/flex:1 1 148px/.test(html), '卡片里的参数行有弹性基准（宽了并排、窄了堆叠）');
  ok(!/style\.cssText = 'border:1px solid var\(--line\);border-radius:4px;padding:4px/.test(html),
     '卡片改用 class（不再写死行内样式）');
}

/* ---- 8) 拖拽时会重画画布 ---- */
{
  install(); boot(); await new Promise(r => setTimeout(r, 100));
  ctxDraw = 0;
  fire('rightSplit', 'pointerdown', { clientX: 1000, pointerId: 1, preventDefault() { } });
  fire('rightSplit', 'pointermove', { clientX: 950 });
  ok(ctxDraw > 0, `拖动时重绘了画布（ctx 调用 ${ctxDraw} 次）`);
  fire('rightSplit', 'pointerup', {});
}

console.log(fails ? `\n=== ${fails} 项未通过 ===` : '\n=== 全部通过 ===');
process.exit(fails ? 1 : 0);
