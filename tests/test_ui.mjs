/* 假 DOM：把界面层脚本真正跑一遍，捕捉 boot 期的运行错误与失效的选择器 */
import fs from 'node:fs';
const html = fs.readFileSync('led_layout_editor.html','utf8');
const uiSrc = html.match(/<script id="ui">([\s\S]*?)<\/script>/)[1];
const coreSrc = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1];

let fails = 0;
const ok = (c,m)=>{ console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c) fails++; };

/* ---- 1) 选择器交叉检查：脚本里用到的每个 #id 必须在 HTML 里存在 ---- */
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const used = new Set([...uiSrc.matchAll(/\$\('#([A-Za-z0-9_]+)'\)/g)].map(m => m[1]));
const dynIds = new Set([...uiSrc.matchAll(/\.id\s*=\s*'([^']+)'/g)].map(m=>m[1]));
const missing = [...used].filter(id => !ids.has(id) && !dynIds.has(id));
ok(missing.length === 0, missing.length ? `脚本引用了不存在的元素 id: ${missing.join(', ')}` : `脚本引用的 ${used.size} 个 id 全部有对应元素（HTML 静态 ${ids.size} 个 + 脚本动态创建 ${dynIds.size} 个）`);
const unused = [...ids].filter(id => !used.has(id) && !/^(cv|left|center|right|tabs|issues|status|dirDiag)$/.test(id));
if (unused.length) console.log(`  note   HTML 中未被脚本引用的 id: ${unused.join(', ')}`);

/* ---- 2) 假 DOM ---- */
const listeners = {};
function mkEl(tag='div', id=''){
  const el = {
    tagName:(tag||'div').toUpperCase(), id, children:[], style:{}, dataset:{}, checked:false,
    get value(){ return this._v === undefined ? '' : this._v; },
    set value(v){ this._v = String(v); },
    textContent:'', placeholder:'', disabled:false, files:[], clientWidth:1200, clientHeight:900,
    get innerHTML(){ return this._html || ''; },
    set innerHTML(v){ this._html = v; if (v === '') this._ch = []; },
    width:1200, height:900,
    get className(){ return this._cn !== undefined ? this._cn : [...this.classList._s].join(' '); },
    set className(v){ this._cn = v; this.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); },
      classList:{ _s:new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);},
                toggle(c,f){ f===undefined ? (this._s.has(c)?this._s.delete(c):this._s.add(c)) : (f?this._s.add(c):this._s.delete(c)); },
                contains(c){ return this._s.has(c); } },
    appendChild(c){ if(c && c.id) byId.set(c.id, c); this.children.push(c); return c; },
    insertBefore(c,r){ if(c && c.id) byId.set(c.id, c); this.children.unshift(c); return c; },
    get firstChild(){ return this.children[0] || null; },
    get children(){ return this._ch ||= []; }, set children(v){ this._ch = v; },
    remove(){}, focus(){}, select(){}, click(){ if(this.onclick) this.onclick(); },
    setPointerCapture(){}, getBoundingClientRect(){ return {left:0, top:0, width:1200, height:900}; },
    addEventListener(t,f){ (listeners[id+':'+t] ||= []).push(f); },
    getContext(){ return CTX; },
    toBlob(cb){ cb({}); },
    set src(v){ this._src=v; }, get src(){ return this._src; },
  };
  return el;
}
const CTX = new Proxy({}, { get:(t,k)=> (k in t ? t[k] : (t[k] = ()=>{})) , set:(t,k,v)=>{ t[k]=v; return true; } });

const store = new Map();
const byId = new Map();
globalThis.localStorage = {
  getItem:k => store.has(k) ? store.get(k) : null,
  setItem:(k,v) => { store.set(k,v); },
  removeItem:k => store.delete(k),
};
globalThis.performance = globalThis.performance || { now:()=>Date.now() };
globalThis.requestAnimationFrame = () => 0;
globalThis.devicePixelRatio = 1;
globalThis.Image = class { set src(v){ this._s=v; if(this.onload) setTimeout(()=>this.onload(),0); } get src(){return this._s;} };
globalThis.FileReader = class { readAsText(){} readAsDataURL(){} };
globalThis.Blob = class {}; globalThis.URL = { createObjectURL:()=>'blob:x', revokeObjectURL(){} };
try { Object.defineProperty(globalThis,'navigator',{value:{clipboard:{writeText:()=>Promise.resolve()}},configurable:true}); } catch(e){}
globalThis.alert = m => { console.log('   [alert] '+m); };
globalThis.confirm = () => true;
globalThis.prompt = (m,d) => d || 'X';

function q(sel){
  if (sel.startsWith('#')) { const id = sel.slice(1);
    if (byId.has(id)) return byId.get(id);                       /* 脚本动态创建的也算 */
    if (!ids.has(id) && !dynIds.has(id)) return null;
    byId.set(id, mkEl('div', id)); return byId.get(id); }
  if (sel === 'body') { if(!byId.has('body')) byId.set('body', mkEl('body','body')); return byId.get('body'); }
  return mkEl('div','');
}
const staticBoxes = { '#tabs button': [...html.matchAll(/data-tab="([a-z]+)"/g)].map(m=>m[1]),
                      '#left button[data-mode]': [], '.pane': [...html.matchAll(/data-pane="([a-z]+)"/g)].map(m=>m[1]) };
globalThis.document = {
  documentElement:{attrs:{},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]||null;}},
  querySelector:q,
  querySelectorAll(sel){
    if (sel === '#left button[data-mode]') return (byId.get('left')?.children || []);
    if (staticBoxes[sel]) return staticBoxes[sel].map(v => { const e = mkEl('button'); e.dataset = { tab:v, pane:v, mode:v }; return e; });
    return [];
  },
  createElement: t => mkEl(t,''),
  body: { appendChild(){}, },
  addEventListener(){},
  execCommand(){ return true; },
};
globalThis.window = { addEventListener(t,f){ (listeners['window:'+t] ||= []).push(f); },
                      devicePixelRatio:1, requestAnimationFrame:globalThis.requestAnimationFrame };
globalThis.addEventListener = globalThis.window.addEventListener;

/* ---- 3) 跑起来 ---- */
let bootErr = null;
try { new Function(coreSrc + '\n' + uiSrc)(); } catch (e) { bootErr = e; }
ok(!bootErr, bootErr ? `界面层启动抛错: ${bootErr.message}\n${(bootErr.stack||'').split('\n').slice(0,4).join('\n')}` : '界面层启动无异常（boot 走通）');

/* ---- 4) 启动后的可观测状态 ---- */
await new Promise(r => setTimeout(r, 700));      /* 等自动保存的 400ms 防抖落地 */

const head = byId.get('headInfo'), tbl = byId.get('zoneTbl');
ok(head && /SP-3122D/.test(head.textContent), `顶栏信息已填充: "${head && head.textContent}"`);
const tblText = ((tbl && tbl.innerHTML) || '') + ((tbl && tbl.children) || []).map(c => c.innerHTML).join('');
ok(/顶环/.test(tblText), '分区表已渲染（含「顶环」）');
ok((tbl && tbl.children.length) === 5, `分区表行数 = ${tbl && tbl.children.length}（期望 5）`);

ok(store.has('led_layout_editor.v1'), '已写入浏览器本地存储（自动保存生效）');
if (store.has('led_layout_editor.v1')) {
  const o = JSON.parse(store.get('led_layout_editor.v1'));
  ok(o.projects.length === 1 && o.projects[0].state.leds.length === 104,
     `存档内容: ${o.projects.length} 个项目, ${o.projects[0].state.leds.length} 颗灯`);
}

/* ---- 4b) 分区配色：色块一点就改色，并立刻存盘 ---- */
{
  const zc = () => JSON.parse(store.get('led_layout_editor.v1')).projects[0].state.zones[0].color;
  const btns = () => ((byId.get('zPalette') || {}).children || []);
  ok(btns().length >= 9, `预设配色有 ${btns().length} 个按钮（8 色 + 按序取色）`);
  ok(new Set(btns().slice(0, 8).map(b => b.style.cssText)).size === 8, '8 个预设色互不相同');
  const before = zc();
  btns()[2].onclick();
  await new Promise(r => setTimeout(r, 700));
  ok(zc() !== before, `点色块改色并存盘: ${before} → ${zc()}`);
  ok(byId.get('zColor').value === zc(), `取色器显示同步: ${byId.get('zColor').value}`);
}

/* ---- 5) 交互：切换方向修正，诊断行必须变化 ---- */
const fix = byId.get('aFix');
const diag = () => byId.get('fixDiag') || {};   /* 惰性创建 */
fix.checked = false; fix.onchange();
const offTxt = diag().innerHTML || '';
fix.checked = true; fix.onchange();
const onTxt  = diag().innerHTML || '';
ok(/修正/.test(onTxt), '方向修正诊断行已输出');
ok(offTxt !== onTxt, '切换「方向修正」后诊断行内容发生变化');
console.log('   修正关: ' + offTxt.replace(/<[^>]+>/g,''));
console.log('   修正开: ' + onTxt.replace(/<[^>]+>/g,''));

/* ---- 6) 交互：新建项目必须与旧项目互相独立 ---- */
const projRows = () => (byId.get('projList') || {}).children || [];
ok(projRows().length === 1, `左侧项目区初始有 ${projRows().length} 项`);
byId.get('btnProjNew').onclick();
await new Promise(r => setTimeout(r, 700));
const after = JSON.parse(store.get('led_layout_editor.v1'));
ok(after.projects.length === 2, `新建后项目数 = ${after.projects.length}`);
ok(after.projects[1].state.leds.length === 0, `新项目是空白画布（${after.projects[1].state.leds.length} 颗灯）`);
ok(after.projects[0].state.leds.length === 104, '原项目排布未被改动（项目相互独立）');
ok(projRows().length === 2, `左侧项目区并列显示 ${projRows().length} 项（非下拉菜单）`);
ok(projRows()[1].classList.contains('on'), '左侧列表中当前项目已高亮');

/* ---- 7) 交互：点左侧列表切回原项目应恢复 104 颗灯 ---- */
projRows()[0].onclick();
await new Promise(r => setTimeout(r, 50));
ok(byId.get('headInfo').textContent.includes('104/104'), `点列表切回后顶栏: "${byId.get('headInfo').textContent}"`);
ok(projRows()[0].classList.contains('on'), '高亮跟着切换');

/* ---- 8) 交互：新增分区 ---- */
/* 先在 SP-3122D 上验证保护：5 个分区已占满 0..103，必须拒绝 */
byId.get('btnZoneAdd').onclick();
await new Promise(r => setTimeout(r, 700));
ok(JSON.parse(store.get('led_layout_editor.v1')).projects[0].state.zones.length === 5,
   '编号已排满时，新增分区被正确拒绝');
/* 切到空白项目再新增，应当成功 */
projRows()[1].onclick();
byId.get('btnZoneAdd').onclick();
await new Promise(r => setTimeout(r, 700));
const st2 = JSON.parse(store.get('led_layout_editor.v1')).projects[1].state;
ok(st2.zones.length === 1, `空白项目新增分区后分区数 = ${st2.zones.length}（期望 1）`);

/* ---- 9) 主题切换 ---- */
const root = document.documentElement;
ok(root.getAttribute('data-theme') === 'dark', '默认深色主题');
byId.get('btnTheme').onclick();
ok(root.getAttribute('data-theme') === 'light', `点一次切到浅色（${root.getAttribute('data-theme')}）`);
ok(store.get('led_layout_editor.theme') === 'light', '主题选择已记住');
ok(/深色/.test(byId.get('btnTheme').textContent), `按钮文案已更新: "${byId.get('btnTheme').textContent}"`);
byId.get('btnTheme').onclick();
ok(root.getAttribute('data-theme') === 'dark', '再点一次切回深色');

/* ---- 10) 右键平移：不能误放灯 ---- */
ok((listeners['cv:contextmenu'] || []).length > 0, '画布已屏蔽浏览器右键菜单');
projRows()[1].onclick();                       /* 空白项目，便于数灯 */
await new Promise(r => setTimeout(r, 50));
const placeBtn2 = (byId.get('left').children || []).find(b => b.dataset.mode === 'place');
placeBtn2.onclick();
const pd2 = (listeners['cv:pointerdown'] || [])[0];
const cnt = () => JSON.parse(store.get('led_layout_editor.v1')).projects[1].state.leds.length;
const before = cnt();
pd2({ pointerId:1, button:2, clientX:300, clientY:300, shiftKey:false, preventDefault(){} });
ok(cnt() === before, `右键按下不放置灯（${before} → ${cnt()}）`);
pd2({ pointerId:1, button:0, clientX:300, clientY:300, shiftKey:false, preventDefault(){} });
await new Promise(r => setTimeout(r, 700));
ok(cnt() === before + 1, `左键按下正常放置灯（${before} → ${cnt()}）`);

/* ---- 11) 状态栏分级：提示带级别，err 留在栏里不被统计串盖掉 ---- */
{
  const statusEl = byId.get('status');
  const st = () => JSON.parse(store.get('led_layout_editor.v1'));

  /* a) 空白项目：删掉唯一分区 → 点「铺灯」走 warn 分支（先提醒、不打断） */
  byId.get('btnZoneDel').onclick();
  await new Promise(r => setTimeout(r, 700));
  ok(st().projects[1].state.zones.length === 0,
     `空白项目已删掉唯一分区（剩 ${st().projects[1].state.zones.length} 个）`);
  byId.get('gApply').onclick();
  ok(/lv-warn/.test(statusEl.className), `缺前置条件的提示带 warn 级别（class="${statusEl.className}"）`);
  ok(/选中一个分区/.test(statusEl.textContent), `提示文案: "${statusEl.textContent}"`);

  /* b) SP-3122D：编号已排满时新增分区 → err 分支，且不自动清除 */
  projRows()[0].onclick();
  await new Promise(r => setTimeout(r, 100));
  byId.get('btnZoneAdd').onclick();
  ok(/lv-err/.test(statusEl.className), `失败提示带 err 级别（class="${statusEl.className}"）`);
  ok(/没有空余区间/.test(statusEl.textContent), `失败文案: "${statusEl.textContent}"`);
  await new Promise(r => setTimeout(r, 400));
  ok(/没有空余区间/.test(statusEl.textContent), 'err 级提示不会被自动清除（不再打断式 alert）');
  statusEl.textContent = ''; statusEl.className = '';
}

/* ---- 12) 缩小灯总数后可以一键裁掉多出来的编号（板级参数在「生成」页） ---- */
{
  const leds = () => JSON.parse(store.get('led_layout_editor.v1')).projects[0].state.leds.length;
  const lc = byId.get('mLedCount');
  ok(leds() === 104, `裁剪前灯数 = ${leds()}`);
  lc.value = '100'; lc.oninput({ target: lc });
  await new Promise(r => setTimeout(r, 700));
  ok(/裁剪超出灯总数的编号/.test(byId.get('status').textContent),
     `改小灯总数后给出收尾提示: "${byId.get('status').textContent}"`);
  byId.get('mLedTrim').onclick();
  await new Promise(r => setTimeout(r, 700));
  ok(leds() === 100, `裁剪后灯数 = ${leds()}（期望 100）`);
}

console.log(fails?`\n=== ${fails} 项未通过 ===`:'\n=== 全部通过 ===');
process.exit(fails?1:0);
