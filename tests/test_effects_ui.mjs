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

/* ============ 动效页：编写 / 导出 / 持久化 / 老存档迁移 ============ */
const click = id => byId.get(id).onclick();
const projState = i => JSON.parse(store.get('led_layout_editor.v1')).projects[i].state;
const fxListOf  = i => projState(i).effects.list;

/* ---- 1) 打开动效页 ---- */
const tabBtn = t => (byId.get('tabCache') || []).find(b => b.dataset.tab === t);
ok(!!tabBtn('fx'), '动效页签存在');
tabBtn('fx').onclick();
ok(((byId.get('fxTbl') || {}).children || []).length === 9,
   `动效列表渲染出 ${((byId.get('fxTbl') || {}).children || []).length} 个效果（期望 9；表头走 innerHTML，不算子节点）`);

/* ---- 2) 把槽位 0 就地转成自定义 ---- */
byId.get('fxTbl').children[0].onclick();          // 表头是 innerHTML，children[0] 才是槽位 0
ok(byId.get('fKind').textContent.includes('内建'), `选中槽位 0 是内建类型: ${byId.get('fKind').textContent}`);
click('fxConv');
await new Promise(r => setTimeout(r, 700));
const e0 = fxListOf(0)[0];
ok(e0.kind === 'custom', '槽位 0 已转为自定义');
ok(e0.layers.length === 1 && e0.layers[0].kind === 'spot', `起始图层: ${e0.layers[0].kind}`);
ok(e0.name === '单点追逐/彩虹循环', `名字保留: ${e0.name}`);

/* ---- 3) 加图层 ---- */
click('fxAddTwinkle');
click('fxAddFill');
await new Promise(r => setTimeout(r, 700));
const e0b = fxListOf(0)[0];
ok(e0b.layers.length === 3, `加到 3 层: ${e0b.layers.map(l => l.kind).join('+')}`);
ok(JSON.stringify(e0b.layers.map(l => l.kind)) === '["spot","twinkle","fill"]', '图层顺序正确');
const layerBox = byId.get('fLayers');
ok(layerBox.children.length === 3, `图层编辑器渲染了 ${layerBox.children.length} 行`);

/* ---- 4) 改图层参数 ---- */
const firstLayerRow = layerBox.children[0];
const numInputs = [];
(function walk(node) { (node.children || []).forEach(c => { if (c.tagName === 'INPUT' && c.type === 'number') numInputs.push(c); walk(c); }); })(firstLayerRow);
ok(numInputs.length >= 5, `光点层有 ${numInputs.length} 个数值输入`);
numInputs[0].value = '5'; numInputs[0].oninput();      // 光点数
numInputs[1].value = '20'; numInputs[1].oninput();     // 光宽
await new Promise(r => setTimeout(r, 700));
const e0c = fxListOf(0)[0];
ok(e0c.layers[0].count === 5 && e0c.layers[0].width === 20,
   `参数已写入: count=${e0c.layers[0].count} width=${e0c.layers[0].width}`);

/* ---- 5) 导出应包含自定义效果 ---- */
byId.get('xForm').value = 'header';
byId.get('xCmt').value = 'ascii';
byId.get('xEol').value = 'lf';
click('xBuild');
const out = byId.get('xOut').value;
const eb = out.slice(out.indexOf('static const led_gen_effect_t'));
ok(/^    \{ 1, /m.test((eb.match(/^    \{.*\},/gm) || [])[0] || ''), '效果表第 0 行被标成自定义（kind=1）');
ok(/0 CUSTOM0_CUSTOM|0 .*CUSTOM/.test(out) || out.includes('custom'), 'g_presets 行的注释标了自定义');
ok(/^    \{ 1, 0, 0, 0, 1, 255, 0, 0, 0, 0, 0, \d+, 8, 1, 0, 3, 0, 1 \},/m.test(eb),
   '效果行记录了 layers_count=3: ' + ((eb.match(/^    \{ 1,.*/m) || ['(没找到)'])[0]));

ok(/^    \{ 0, 1, 5, 20, /m.test(out), `图层表第一行 = kind=0(光点), en=1, count=5, width=20: ${(out.match(/^    \{ 0, 1, 5, 20,.*/m) || ['(没找到)'])[0]}`);
ok(byId.get('xWarn').innerHTML.includes('一次性补丁'), '导出时提示要打固件补丁');

/* ---- 6) 关掉工具再打开：自定义动效要还在 ---- */
install(); boot(); await new Promise(r => setTimeout(r, 700));
const e0d = fxListOf(0)[0];
ok(e0d.kind === 'custom', '重开后槽位 0 仍是自定义');
ok(e0d.layers.length === 3, `重开后图层数 ${e0d.layers.length}`);
ok(e0d.layers[0].count === 5 && e0d.layers[0].width === 20, '重开后图层参数一致');
ok(projState(0).anim.effectId === e0d.id, '重开后选中的还是同一个效果');

/* ---- 6b) F5) 图层卡：旁路勾选 + 复制层 ---- */
{
  tabBtn('fx').onclick();
  const box = byId.get('fLayers');
  ok(box.children.length === 3, `图层卡 ${box.children.length} 行`);
  const headOf = row => (row.children || []).find(c => c.className === 'cardHead');
  const head0 = headOf(box.children[0]);
  const cbs = (head0.children || []).filter(c => c.tagName === 'INPUT' && c.type === 'checkbox');
  ok(cbs.length === 1 && cbs[0].checked === true, '第 1 层有「启用」勾选框，默认勾上');

  const off = cbs[0];
  off.checked = false; off.onchange();
  await new Promise(r => setTimeout(r, 700));
  const e1 = fxListOf(0)[0];
  ok(e1.layers[0].en === 0, `取消勾选 → en=${e1.layers[0].en}`);
  ok(e1.layers.length === 3, '图层数不变（旁路 ≠ 删除）');
  const row0 = byId.get('fLayers').children[0];
  ok(row0.className === 'card off', `旁路的层卡片带 off 标记（class="${row0.className}"）`);
  ok(/旁路/.test(headOf(row0).children[0].textContent), `卡片标题标出旁路: "${headOf(row0).children[0].textContent}"`);

  { /* 复制第 2 层 */
    const head1 = headOf(byId.get('fLayers').children[1]);
    const cp = (head1.children || []).find(b => b.tagName === 'BUTTON' && b.textContent === '复制');
    ok(!!cp, '第 2 层有「复制」按钮');
    cp.onclick();
    await new Promise(r => setTimeout(r, 700));
    const e2 = fxListOf(0)[0];
    ok(e2.layers.length === 4, `复制后 ${e2.layers.length} 层: ${e2.layers.map(l => l.kind).join('+')}`);
    ok(JSON.stringify(e2.layers[1]) === JSON.stringify(e2.layers[2]), '副本与原层内容完全一致');
    ok(/已复制第 2 层/.test(byId.get('status').textContent),
       `状态栏给了反馈: "${byId.get('status').textContent.slice(0, 30)}"`);

    /* 改副本，原层不能跟着变 */
    const nums = [];
    (function walk(n) { (n.children || []).forEach(c => {
      if (c.tagName === 'INPUT' && c.type === 'number') nums.push(c); walk(c); }); })(byId.get('fLayers').children[2]);
    nums[0].value = '9'; nums[0].oninput();
    await new Promise(r => setTimeout(r, 700));
    const e3 = fxListOf(0)[0];
    ok(e3.layers[2].density === 9, `副本第 1 个数值改成 9（${e3.layers[2].density}）`);
    ok(JSON.stringify(e3.layers[1]) === JSON.stringify(e2.layers[1]), '原层没被副本带着改');
  }

  /* 满 8 层时「复制」按钮禁用 */
  for (let k = 0; k < 4; k++) click('fxAddFill');
  await new Promise(r => setTimeout(r, 700));
  const n8 = fxListOf(0)[0].layers.length;
  ok(n8 === 8, `已填到 ${n8} 层`);
  const head8 = headOf(byId.get('fLayers').children[0]);
  const cp8 = (head8.children || []).find(b => b.tagName === 'BUTTON' && b.textContent === '复制');
  ok(cp8 && cp8.disabled === true, '满 8 层时「复制」按钮禁用');
}

/* ---- 7) 老存档迁移：只有 anim.preset、没有 effects ---- */
const oldProj = {
  format: 'ledboard', version: 1,
  meta: { name: '老工程', ledCount: 104, ringSize: 24, zoneMax: 8, zoneMaxLen: 40 },
  canvas: { width: 640, height: 1600, background: null },
  anim: { preset: 3, speed: 'slow', rate: 1, fix: true, playing: false,
          showNum: true, showRing: true, showArrow: true, showFrame: true },
  zones: [], leds: [],
};
store.set('led_layout_editor.v1', JSON.stringify({ version: 1, current: 'old1',
  projects: [{ id: 'old1', name: '老工程', state: oldProj }] }));
install(); boot(); await new Promise(r => setTimeout(r, 700));

const migrated = projState(0);
ok(!!migrated.effects && migrated.effects.list.length === 9, `迁移后补出 ${migrated.effects ? migrated.effects.list.length : 0} 个默认效果`);
ok(migrated.anim.effectId === 'e3', `anim.preset=3 迁移成 effectId=${migrated.anim.effectId}`);
const hdr2 = exportEffectsC(migrated, { form: 'header', comment: 'ascii', eol: 'lf' });
const gp2 = hdr2.slice(hdr2.indexOf('static const ring_preset_t g_presets'),
                       hdr2.indexOf('};', hdr2.indexOf('static const ring_preset_t g_presets')));
const modeN = (hdr2.match(/LED_GEN_MODE_COUNT\s+(\d+)/) || [])[1];
const effN  = (hdr2.match(/LED_GEN_EFFECT_COUNT\s+(\d+)/) || [])[1];
ok(modeN === '9' && effN === '9', `迁移后仍是 9 个模式 / 9 个效果（实际 ${modeN}/${effN}）`);
const eb2 = hdr2.slice(hdr2.indexOf('static const led_gen_effect_t'));
ok((eb2.slice(0, eb2.indexOf('};')).match(/^    \{/gm) || []).length === 9, '效果表 9 行');

console.log(fails ? `\n=== ${fails} 项未通过 ===` : '\n=== 全部通过 ===');
process.exit(fails ? 1 : 0);
