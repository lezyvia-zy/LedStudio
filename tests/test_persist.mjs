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

/* 1b) 分区名/别名/颜色/使能必须立刻存盘 —— 不能靠后面「新建项目」顺带保存 */
await new Promise(r=>setTimeout(r,700));
ok(decode().projects[0].state.zones[0].name === '改过的名字', '分区改名后立刻存盘（无需再做别的操作）');
const zLatin = byId.get('zLatin'), zColor2 = byId.get('zColor'), zEn2 = byId.get('zEn');
zLatin.value = 'TOP';      zLatin.oninput({ target: zLatin });
zColor2.value = '#123456'; zColor2.oninput({ target: zColor2 });
zEn2.checked = false;      zEn2.onchange({ target: zEn2 });
await new Promise(r=>setTimeout(r,700));
{
  const z0 = decode().projects[0].state.zones[0];
  ok(z0.latin === 'TOP', `分区别名已存盘: "${z0.latin}"`);
  ok(z0.color === '#123456', `分区色已存盘: ${z0.color}`);
  ok(z0.enabled === false, '分区使能已存盘: enabled=false');
}
/* 还原，别影响后面的断言 */
zColor2.value = '#ff9a3c'; zColor2.oninput({ target: zColor2 });
zEn2.checked = true;       zEn2.onchange({ target: zEn2 });
await new Promise(r=>setTimeout(r,700));

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

/* 3) 编辑手感（吸附 / 格边长）属于工程设置：改完立刻存盘，且画布读的是 state 不是 DOM 默认值 */
const chkSnap = byId.get('chkSnap'), cellSize = byId.get('cellSize');
ok(!!chkSnap && !!chkSnap.onchange && !!cellSize && !!cellSize.onchange, '吸附开关与格边长输入框已接线');
const ledCountB = () => decode().projects[1].state.leds.length;
const lastLed   = () => { const a = decode().projects[1].state.leds; return a[a.length - 1]; };
chkSnap.checked = false; chkSnap.onchange({ target: chkSnap });
cellSize.value = '32';   cellSize.onchange({ target: cellSize });
const c1 = ledCountB();
pd({ pointerId:1, button:0, clientX:700, clientY:700, shiftKey:false });
await new Promise(r=>setTimeout(r,800));
const s3 = decode();
ok(s3.projects[1].state.view.snap === false, '关掉吸附已存盘（view.snap=false）');
ok(s3.projects[1].state.view.grid === 32, `格边长已存盘（view.grid=${s3.projects[1].state.view.grid}）`);
ok(ledCountB() === c1 + 1, `关吸附时照样能放灯（${c1} → ${ledCountB()}）`);
const loose = lastLed();
ok(!(loose.x % 32 === 16 && loose.y % 32 === 16), `关吸附时落点不在格心: (${loose.x}, ${loose.y})`);
chkSnap.checked = true;  chkSnap.onchange({ target: chkSnap });
cellSize.value = '40';   cellSize.onchange({ target: cellSize });
pd({ pointerId:1, button:0, clientX:760, clientY:760, shiftKey:false });
await new Promise(r=>setTimeout(r,800));
const snapped = lastLed();
ok(snapped.x % 40 === 20 && snapped.y % 40 === 20, `开吸附时落点在格心: (${snapped.x}, ${snapped.y})`);
/* 收尾：把上面这两颗测试灯撤销掉，后面的断言仍按「1 颗灯」走 */
byId.get('btnUndo').onclick(); byId.get('btnUndo').onclick();
await new Promise(r=>setTimeout(r,800));
ok(ledCountB() === 1, `撤销两次后回到 1 颗灯（实际 ${ledCountB()}）`);

/* 3b) 形状（批 7-A/B）：预设自带 5 个形状；改过的形状参数要跟着项目一起存 */
{
  const projRows = () => (byId.get('projList') || {}).children || [];
  projRows()[0].onclick();
  await new Promise(r=>setTimeout(r,700));
  const s = decode();
  ok((s.projects[0].state.shapes || []).length === 5,
     `SP-3122D 预设带出 ${(s.projects[0].state.shapes || []).length} 个可编辑形状（老工程迁移的起点）`);
  const zrows = (byId.get('zoneTbl') || {}).children || [];
  zrows[1].onclick();                                     /* 点分区 → 自动选上它关联的形状 */
  const dist = byId.get('shDist');
  ok(!!dist && !!dist.oninput && byId.get('shList').value === '1',
     `点分区自动选上关联形状（#shList 停在 ${byId.get('shList').value}）`);
  dist.value = 'even'; dist.oninput({ target: dist });
  await new Promise(r=>setTimeout(r,700));
  const sh1 = decode().projects[0].state.shapes[1];
  ok(sh1.dist === 'even' && sh1.zone === 'z1', `改形状分布已存盘（shapes[1].dist=${sh1.dist} / zone=${sh1.zone}）`);
  /* 切成圆环 / 再切回来：新露出来的几何格是空的，不能因此把形状挪到 0,0 */
  const kind = byId.get('shKind');
  kind.value = 'circle'; kind.oninput({ target: kind });
  await new Promise(r=>setTimeout(r,700));
  {
    const s2 = decode().projects[0].state.shapes[1];
    ok(s2.kind === 'circle' && s2.r > 0 && (s2.cx !== 0 || s2.cy !== 0),
       `切形状类型不会把几何清零（kind=${s2.kind} 圆芯 ${s2.cx},${s2.cy} r=${s2.r}）`);
    ok(s2.pts.length === 4, '切类型时原来的顶点留着（切回来不丢）');
  }
  kind.value = 'rect'; kind.oninput({ target: kind });
  await new Promise(r=>setTimeout(r,700));
  ok(decode().projects[0].state.shapes[1].pts.length === 4, '切回矩形：顶点还在（4 个）');
  /* 收尾：切回刚才那个空白项目，后面的断言仍按「当前 = 项目 1」走 */
  projRows()[1].onclick();
  await new Promise(r=>setTimeout(r,700));
}

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
ok((s2.projects[0].state.shapes || []).length === 5, `重新打开后 5 个形状都还在`);
ok(s2.projects[0].state.shapes[1].dist === 'even', '重新打开后形状参数仍是改过的值（shapes[1].dist=even）');

/* 4) 底图参数也要存盘：临时往存档里塞一个底图，再拖滑块 */
{
  const raw = JSON.parse(store.get('led_layout_editor.v1'));
  const ix = raw.projects.findIndex(p => p.id === raw.current);
  raw.projects[ix].state.canvas.background = { href: 'data:,x', x: 0, y: 0, scale: 1, opacity: 0.45 };
  store.set('led_layout_editor.v1', JSON.stringify(raw));
  install(); boot(); await new Promise(r=>setTimeout(r,700));

  const s = byId.get('bgScale'), o = byId.get('bgOp'), bx = byId.get('bgX');
  ok(!!s && !!s.oninput && !!o && !!o.oninput, '底图参数控件已接线');
  s.value = '2';      s.oninput({ target: s });
  o.value = '80';     o.oninput({ target: o });
  bx.value = '60';    bx.oninput({ target: bx });
  await new Promise(r=>setTimeout(r,700));
  const bg = decode().projects[ix].state.canvas.background;
  ok(bg && bg.scale === 2, `底图缩放已存盘（scale=${bg && bg.scale}）`);
  ok(bg && Math.abs(bg.opacity - 0.8) < 1e-6, `底图透明度已存盘（opacity=${bg && bg.opacity}）`);
  ok(bg && bg.x === 60, `底图 X 偏移已存盘（x=${bg && bg.x}）`);
  byId.get('bgClear').onclick();
  await new Promise(r=>setTimeout(r,700));
  ok(decode().projects[ix].state.canvas.background === null, '移除底图也一并存盘了');
}

/* 5) 老存档（批 7 之前存的）没有 shapes 字段：打开时要自动补空数组，不能炸 */
{
  const raw = JSON.parse(store.get('led_layout_editor.v1'));
  raw.projects.forEach(p => { delete p.state.shapes; });
  store.set('led_layout_editor.v1', JSON.stringify(raw));
  install(); boot(); await new Promise(r=>setTimeout(r,700));
  const s = decode();
  const cur = s.projects.find(p => p.id === s.current);
  ok(Array.isArray(cur.state.shapes) && cur.state.shapes.length === 0,
     `老存档（没有 shapes 字段）打开后当前项目自动补成空数组（其他项目等切过去再补）`);
  ok(!byId.get('shList') || byId.get('shList').value === '',
     '没有形状时面板不乱选：#shList 空着，等用户点「新增矩形」或「由分区反推」');
}

console.log(fails?`\n=== ${fails} 项未通过 ===`:'\n=== 全部通过 ===');
process.exit(fails?1:0);
