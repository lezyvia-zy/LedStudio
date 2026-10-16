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

/* ---- 1b) 批 5-A：「生成」页已并入「分区」页（页签 8 → 7） ---- */
{
  const paneStart = html.indexOf('<div class="pane on" data-pane="zones">');
  const paneEnd = html.indexOf('<div class="pane" data-pane="check">', paneStart);
  const zonesPane = html.slice(paneStart, paneEnd);
  const tabs = [...html.matchAll(/data-tab="([a-z]+)"/g)].map(m => m[1]);
  const panes = [...html.matchAll(/data-pane="([a-z]+)"/g)].map(m => m[1]);
  ok(!tabs.includes('gen') && !panes.includes('gen'),
     `「生成」页签与面板已删除（页签 ${tabs.length} 个: ${tabs.join(',')}）`);
  ok(!/id="gZone"/.test(html), '「生成」页里的分区下拉 #gZone 已删除（分区表就在同一页）');
  /* 板级参数只留项目名 / 灯总数 —— RING_SIZE / ZONE_MAX / ZONE_MAX_LEN 是固件 led_ring.h 的常量，不给改 */
  const boardInputs = ['mRingSize', 'mZoneMax', 'mZoneMaxLen'].filter(id => html.includes('id="' + id + '"'));
  ok(boardInputs.length === 0, boardInputs.length ? `板上限输入框还在（应删）: ${boardInputs.join(', ')}`
                                                 : '板级参数只留项目名 / 灯总数（RING_SIZE / ZONE_MAX / ZONE_MAX_LEN 输入框已删）');
  ok(zonesPane.includes('id="mBoardInfo"'), '固定上限改成一行只读说明 #mBoardInfo（校验 V7/V8 的解释还留着）');
  const moved = ['mName','mLedCount','mLedTrim','shList','shAdd','shDel','shFromZone','shZone','shKind',
                 'shX0','shW','shDist','shSides','shPitch','shCorner','shFirst','shCount','shDir','shClosed',
                 'shEntry','shApply','shFlip','shKeep','bgFile','bgAlign','bgClear'];
  const miss = moved.filter(id => !zonesPane.includes('id="' + id + '"'));
  ok(miss.length === 0, miss.length ? `这些控件没搬进「分区」页: ${miss.join(', ')}`
                                    : `板级参数 / 铺灯形状 / 底图的 ${moved.length} 个控件都在「分区」页里`);
  /* 批 7-A/B：铺灯改成「形状」引擎 —— 旧的矩形/圆环/四边形三套控件与它们的一次性生成器都撤了 */
  const gone = ['gX0','gW','gDir','gK','gApply','cX','cR','cApply','qDir','qApply'];
  ok(gone.every(id => !html.includes('id="' + id + '"')),
     `旧铺灯控件（${gone.length} 个）已移除，改成形状面板`);
  ok(zonesPane.includes('id="shInfo"') && /SHAPE\.plan/.test(coreSrc),
     '形状面板带诊断行 #shInfo，且由 core 的 SHAPE 引擎算落点');
}

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
/* 记录型 2D 上下文：记下每一次 setTransform（render 真正用的变换）与每一次 arc。
 * 测试里的「世界坐标 → 客户端坐标」直接拿这个变换算 —— 精确，不用再从「拖个框反推 zoom」
 * （反推出来带半格误差，点灯那几条断言就会飘）。 */
function mkCtx(){
  const st = { m:[1,0,0,1,0,0] }, stack = [];
  const api = {
    arcs:[], transforms:[],
    setTransform(a,b,c,d,e,f){ st.m = (a && a.length === 6) ? a.slice() : [a,b,c,d,e,f]; this.transforms.push(st.m.slice()); },
    save(){ stack.push(st.m.slice()); }, restore(){ if (stack.length) st.m = stack.pop(); },
    translate(x,y){ const m = st.m; st.m = [m[0],m[1],m[2],m[3], m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]]; },
    scale(x,y){ st.m = [st.m[0]*x, st.m[1]*y, st.m[2]*x, st.m[3]*y, st.m[4], st.m[5]]; },
    arc(x,y,r){ this.arcs.push({ x, y, r, m: st.m.slice() }); },
    measureText(t){ return { width: String(t).length * 6 }; },
    createLinearGradient(){ return { addColorStop(){} }; },
  };
  return new Proxy(api, { get:(t,k)=> (k in t ? t[k] : (k==='then' ? undefined : (t[k] = ()=>{ }))),
                          set:(t,k,v)=>{ t[k]=v; return true; } });
}
const CTX = mkCtx();
/* render() 最后一帧用的世界变换：[a,b,c,d,e,f]（a=zoom，e/f=pan） */
const ctxM = () => CTX.transforms[CTX.transforms.length - 1] || [1,0,0,1,0,0];

const store = new Map();
const byId = new Map();
const boxCache = new Map();      /* querySelectorAll 的静态节点缓存（见下） */
globalThis.localStorage = {
  getItem:k => store.has(k) ? store.get(k) : null,
  setItem:(k,v) => { store.set(k,v); },
  removeItem:k => store.delete(k),
};
globalThis.performance = globalThis.performance || { now:()=>Date.now() };
globalThis.requestAnimationFrame = () => 0;
globalThis.devicePixelRatio = 1;
globalThis.Image = class { set src(v){ this._s=v; if(this.onload) setTimeout(()=>this.onload(),0); } get src(){return this._s;} };
globalThis.FileReader = class { readAsText(){} readAsDataURL(){ this.result = 'data:image/png;base64,x'; if (this.onload) this.onload(); } };
globalThis.Blob = class {}; globalThis.URL = { createObjectURL:()=>'blob:x', revokeObjectURL(){} };
try { Object.defineProperty(globalThis,'navigator',{value:{clipboard:{writeText:()=>Promise.resolve()}},configurable:true}); } catch(e){}
globalThis.alert = m => { console.log('   [alert] '+m); };
const confirmCalls = [];                         /* 记下确认框问了什么（G1 / F4 断言用） */
globalThis.confirm = m => { confirmCalls.push(m); return true; };
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
                      '#left button[data-mode]': [], '.pane': [...html.matchAll(/data-pane="([a-z]+)"/g)].map(m=>m[1]),
                      '#shGallery button': ['rect', 'rrect', 'circle', 'poly', 'line'] };
globalThis.document = {
  documentElement:{attrs:{},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]||null;}},
  querySelector:q,
  querySelectorAll(sel){
    if (sel === '#left button[data-mode]') return (byId.get('left')?.children || []);
    /* 同一批静态节点要缓存 —— 真实 DOM 每次返回的就是同一批元素，boot 时绑的 onclick 才留得住 */
    if (staticBoxes[sel]) {
      if (!boxCache.has(sel))
        boxCache.set(sel, staticBoxes[sel].map(v => { const e = mkEl('button');
          e.dataset = (sel === '#shGallery button') ? { kind: v } : { tab:v, pane:v, mode:v }; return e; }));
      return boxCache.get(sel);
    }
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

/* ---- 4c) G2) 底图：「对齐到格」把 X/Y 收到半格栅格上，并进自动保存 ---- */
{
  const bgOf = () => JSON.parse(store.get('led_layout_editor.v1')).projects[0].state.canvas.background;
  /* 还没底图时点一下：给提示，不能静默 */
  byId.get('bgAlign').onclick();
  ok(/还没有底图/.test(byId.get('status').textContent),
     `没有底图时「对齐到格」给出提示: "${byId.get('status').textContent}"`);

  const f = byId.get('bgFile');
  f.files = [{ name: 'photo.png' }];
  f.onchange({ target: f });
  await new Promise(r => setTimeout(r, 700));
  ok(!!bgOf() && bgOf().href === 'data:image/png;base64,x', '选图后底图已建立并存盘');

  /* 手动挪到「不在格上」的位置 */
  const bx = byId.get('bgX'), by = byId.get('bgY');
  bx.value = '13'; bx.oninput({ target: bx });
  by.value = '-27'; by.oninput({ target: by });
  await new Promise(r => setTimeout(r, 700));
  ok(bgOf().x === 13 && bgOf().y === -27, `底图已挪到 X ${bgOf().x} / Y ${bgOf().y}（不在格上）`);

  const half = (+byId.get('cellSize').value || 40) / 2;
  byId.get('bgAlign').onclick();
  await new Promise(r => setTimeout(r, 700));
  const g = bgOf();
  ok(g.x % half === 0 && g.y % half === 0,
     `「对齐到格」后 X ${g.x} / Y ${g.y} 都是 ${half}px 的整数倍（对齐前 13 / -27）`);
  ok(byId.get('bgX').value === String(g.x) && byId.get('bgY').value === String(g.y),
     `输入框同步到对齐后坐标: ${byId.get('bgX').value} / ${byId.get('bgY').value}`);
  ok(/底图已对到格|本来就/.test(byId.get('status').textContent),
     `对齐状态栏反馈: "${byId.get('status').textContent}"`);
  ok(!!bgOf(), '对齐后底图参数仍在自动保存里（没有把底图弄丢）');
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
(listeners['cv:pointerup'] || [])[0]({});      /* 收尾：清掉右键平移的 drag=pan，别污染后面的形状交互 */
pd2({ pointerId:1, button:0, clientX:300, clientY:300, shiftKey:false, preventDefault(){} });
await new Promise(r => setTimeout(r, 700));
ok(cnt() === before + 1, `左键按下正常放置灯（${before} → ${cnt()}）`);

/* ---- 11) 状态栏分级：提示带级别，err 留在栏里不被统计串盖掉 ---- */
{
  const statusEl = byId.get('status');
  const st = () => JSON.parse(store.get('led_layout_editor.v1'));

  /* a) 空白项目：删掉唯一分区、也没有形状 → 点「铺到灯位」走 warn 分支（先提醒、不打断） */
  byId.get('btnZoneDel').onclick();
  await new Promise(r => setTimeout(r, 700));
  ok(st().projects[1].state.zones.length === 0,
     `空白项目已删掉唯一分区（剩 ${st().projects[1].state.zones.length} 个）`);
  byId.get('shApply').onclick();
  ok(/lv-warn/.test(statusEl.className), `缺前置条件的提示带 warn 级别（class="${statusEl.className}"）`);
  ok(/还没有形状/.test(statusEl.textContent), `提示文案: "${statusEl.textContent}"`);

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

/* ---- 12) 缩小灯总数后可以一键裁掉多出来的编号（板级参数在「分区」页） ---- */
{
  const boards = byId.get('mBoardInfo');
  ok(/RING_SIZE <b>24<\/b>/.test(boards.innerHTML),
     `板上限只读说明按固件常量填好: "${boards.innerHTML.replace(/<[^>]+>/g, '').slice(0, 60)}"`);
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

/* ---- 13) H5) 校验页没露面就不白算 validate；切过去才重算 ---- */
{
  const tabs = document.querySelectorAll('#tabs button');
  const go = n => tabs.find(b => b.dataset.tab === n).onclick();
  const issOf = () => byId.get('issues') || {};
  const iss = () => (issOf().innerHTML || '') + ((issOf().children) || []).map(c => c.textContent).join('|');

  ok(!byId.has('issues'), '还没进过校验页：问题清单一次都没算（H5 惰性）');

  go('check');
  const s1 = iss();
  ok(s1.length > 0, `切到校验页后才渲染清单: "${s1.replace(/<[^>]+>/g, ' ').slice(0, 70)}"`);
  ok(/\[V\d|全部检查通过/.test(s1), '清单里有条目（或全部通过）');

  /* 切走 → 改板级参数（灯总数变化会引出 V2/V3）→ 清单保持旧内容，不重算 */
  go('zones');
  const lc = byId.get('mLedCount');
  lc.value = '120'; lc.oninput({ target: lc });
  await new Promise(r => setTimeout(r, 700));
  const s2 = iss();
  ok(s2 === s1, '校验页不可见时改数据，清单原样不动（没白算 validate）');

  go('check');
  const s3 = iss();
  ok(s3 !== s2 && /\[V3\]/.test(s3),
     `切回校验页才重算，并出现新问题: "${s3.replace(/<[^>]+>/g, ' ').slice(0, 90)}"`);
}

/* ---- 14) C1) 校验页点条目 → 跳到该动的地方（并把那一条选中） ---- */
{
  const tabs = document.querySelectorAll('#tabs button');
  const go = n => tabs.find(b => b.dataset.tab === n).onclick();
  const rows = () => (byId.get('zoneTbl') || {}).children || [];
  const issueRows = () => (byId.get('issues') || {}).children || [];
  const findIssue = code => issueRows().find(d => (d.textContent || '').indexOf('[' + code + ']') >= 0);

  /* 把第 1 个分区的起点挪到远超灯总数处 → V9（分区类问题，带跳转信息） */
  go('zones');
  rows()[0].onclick();
  const zs = byId.get('zStart');
  zs.value = '115'; zs.oninput({ target: zs });
  await new Promise(r => setTimeout(r, 700));
  rows()[3].onclick();                       /* 先选中别的分区，验证点问题会把选中挪回来 */
  ok(byId.get('zStart').value !== '115',
     `已切到第 4 个分区（起点输入框 = ${byId.get('zStart').value}）`);

  go('check');
  const v9 = findIssue('V9');
  ok(!!v9, '校验页出现 V9（分区超界）');
  v9.onclick();
  ok(tabs.find(b => b.dataset.tab === 'zones').classList.contains('on'), '点 V9 → 自动切到「分区」页');
  ok(byId.get('zStart').value === '115',
     `并把出问题的分区选中了（起点输入框 = ${byId.get('zStart').value}）`);
  ok(/已跳到分区/.test(byId.get('status').textContent),
     `状态栏说明了跳到哪: "${byId.get('status').textContent}"`);

  /* 只涉及编号的问题不跳页（点一下只闪灯） */
  go('check');
  const v2 = findIssue('V2') || findIssue('V3');
  if (v2) {
    v2.onclick();
    ok(tabs.find(b => b.dataset.tab === 'check').classList.contains('on'),
       '没有跳转信息的条目点一下不换页（只在图里闪涉及的灯）');
  }
}

/* ---- 15) G1) 铺灯会覆盖号段上已有的编号时先问一句（可取消 / 号段空着就不打扰） ---- */
{
  const leds = () => JSON.parse(store.get('led_layout_editor.v1')).projects[0].state.leds.length;
  const tabs = document.querySelectorAll('#tabs button');
  const go = n => tabs.find(b => b.dataset.tab === n).onclick();
  const rows = () => (byId.get('zoneTbl') || {}).children || [];

  go('zones');
  rows()[3].onclick();                       /* 环 A：号段上还有原排布留下的灯 */
  const before = leds();
  byId.get('shAdd').onclick();               /* 按这个分区的现有灯位起一个形状 */
  await new Promise(r => setTimeout(r, 700));

  confirmCalls.length = 0;
  globalThis.confirm = m => { confirmCalls.push(m); return false; };
  byId.get('shApply').onclick();
  await new Promise(r => setTimeout(r, 700));
  ok(confirmCalls.length === 1 && /已经有 \d+ 颗灯/.test(confirmCalls[0]),
     `铺灯前先把「要覆盖多少颗」问清楚: "${String(confirmCalls[0]).split('\n')[0]}"`);
  ok(/重铺/.test(confirmCalls[0]) && /撤销/.test(confirmCalls[0]),
     '确认框说明了会发生什么、能不能撤销');
  ok(leds() === before, `点「取消」一颗灯都不动（仍 ${leds()} 颗）`);
  ok(/已取消/.test(byId.get('status').textContent),
     `状态栏说明已取消: "${byId.get('status').textContent}"`);

  globalThis.confirm = m => { confirmCalls.push(m); return true; };
  byId.get('shApply').onclick();
  await new Promise(r => setTimeout(r, 700));
  ok(confirmCalls.length === 2, '再点一次仍然先问（每次都问，不设「别再问了」）');
  ok(/已按形状铺/.test(byId.get('status').textContent),
     `确认之后才真铺: "${byId.get('status').textContent}"`);

  /* 号段上没有灯 → 直接铺，不打扰；顺带看「铺到灯位」的蓝灯只在「还有东西要铺」时亮
   * （用户第 1 条实测：老写法把 class="pri" 写死在 HTML 上，它永远蓝着，反而看不出哪一步该点） */
  ok(!/id="shApply"[^>]*class="pri"/.test(html), 'HTML 里没把「铺到灯位」写死成蓝色的（高亮按状态算）');
  confirmCalls.length = 0;
  rows()[0].onclick();                       /* 第 1 个分区已挪到 115.. 上，没有灯 */
  byId.get('shAdd').onclick();               /* 该号段空着 → 起一个「等分弧长」的矩形形状 */
  await new Promise(r => setTimeout(r, 700));
  ok(byId.get('shApply').classList.contains('pri'),
     '还没铺过的形状：「铺到灯位」亮着（亮着 = 照现在的形状铺下去就是这一步该做的）');
  byId.get('shApply').onclick();
  await new Promise(r => setTimeout(r, 700));
  ok(confirmCalls.length === 0, '号段上本来没有灯 → 不弹确认框，直接铺');
  ok(/已按形状铺/.test(byId.get('status').textContent),
     `直接铺成功: "${byId.get('status').textContent}"`);
  ok(!byId.get('shApply').classList.contains('pri'),
     '铺完蓝灯就灭（一眼看出「这个形状已经铺下去了」，不用再点）');

  /* ---- 15b) 反向编号：已铺过的形状不再弹确认框（用户第 4 条实测） ---- */
  {
    const st0 = () => JSON.parse(store.get('led_layout_editor.v1')).projects[0].state;
    const sh0 = () => { const ss = st0().shapes || []; return ss[ss.length - 1]; };
    const z = st0().zones[0];
    const pos = () => st0().leds.filter(l => l.n >= z.start && l.n < z.start + z.count)
                                 .map(l => [l.n, Math.round(l.x), Math.round(l.y)]);
    const beforeP = pos(), dir0 = sh0().dir;
    confirmCalls.length = 0;
    byId.get('shFlip').onclick();
    await new Promise(r => setTimeout(r, 700));
    ok(confirmCalls.length === 0,
       '点「反向编号」不再弹确认框 —— 已铺过的形状：几何一点没动，点错了 Ctrl+Z 就够（用户第 4 条）');
    ok(/已反向编号/.test(byId.get('status').textContent),
       `状态栏照实说做了什么: "${byId.get('status').textContent}"`);
    const afterP = pos();
    ok(sh0().dir !== dir0 && afterP.length === beforeP.length &&
       afterP.some((a, i) => a[1] !== beforeP[i][1] || a[2] !== beforeP[i][2]),
       `编号顺序真倒过来了（${dir0} → ${sh0().dir}，灯位跟着换号 ${afterP.filter((a, i) => a[1] !== beforeP[i][1] || a[2] !== beforeP[i][2]).length} 颗）`);
  }
  globalThis.confirm = () => true;
}

/* ---- 16) 画形状：形状选择框 → 画布拖拽 → 点形状进编辑 → 定头尾（批 7-C） ---- */
{
  const st = () => JSON.parse(store.get('led_layout_editor.v1')).projects[1].state;
  const shapes = () => st().shapes || [];
  const gal = () => document.querySelectorAll('#shGallery button');
  const pd = (listeners['cv:pointerdown'] || [])[0];
  const pm = (listeners['cv:pointermove'] || [])[0];
  const pu = (listeners['cv:pointerup'] || [])[0];
  const move = (x, y) => pm({ clientX: x, clientY: y });

  ok(gal().length === 5, `形状选择框有 ${gal().length} 个形状（矩形/圆角矩形/圆环/多边形/直线）`);
  ok(['rect', 'rrect', 'circle', 'poly', 'line'].every(k => gal().some(b => b.dataset.kind === k)),
     '五种形状 data-kind 齐全（与「形状类型」下拉同一套）');

  /* 空白项目：加一个分区，再点「直线」进画形状模式（添加态） */
  projRows()[1].onclick();
  await new Promise(r => setTimeout(r, 50));
  byId.get('btnZoneAdd').onclick();
  await new Promise(r => setTimeout(r, 700));
  gal().find(b => b.dataset.kind === 'line').onclick();
  const shapeBtn = (byId.get('left').children || []).find(b => b.dataset.mode === 'shape');
  const selectBtn = (byId.get('left').children || []).find(b => b.dataset.mode === 'select');
  ok(!!shapeBtn && shapeBtn.classList.contains('on'), '点形状选择框后「画形状」模式被点亮');

  /* 在画布上拖一条线：100,100 → 300,220 */
  pd({ pointerId: 1, button: 0, clientX: 100, clientY: 100 });
  move(300, 220);
  pu({});
  await new Promise(r => setTimeout(r, 700));
  {
    const s0 = shapes()[0];
    ok(!!s0 && s0.kind === 'line' && s0.closed === false && s0.pts.length === 2,
       `拖出直线（kind=${s0 && s0.kind}，closed=${s0 && s0.closed}，顶点 ${s0 && s0.pts.length}）`);
    ok(s0 && s0.dist === 'even' && s0.zone === st().zones[0].id && s0.count === st().zones[0].count,
       `默认「等分弧长」，颗数 = 分区总颗数（${s0 && s0.count}），归属分区`);
    ok(s0 && s0.pts[1][0] > s0.pts[0][0] && s0.pts[1][1] > s0.pts[0][1], '直线朝右下铺');
    ok(s0 && s0.laid !== true, '刚拖出来还没铺（不带编号，只预览）');
    ok(selectBtn.classList.contains('on') && !shapeBtn.classList.contains('on'),
       '画完形状自动释放鼠标（回到「选择/编辑」模式）');
  }

  /* 点形状 = 选中并进编辑；点空白 = 释放 */
  pd({ pointerId: 1, button: 0, clientX: 200, clientY: 160 });
  ok(shapeBtn.classList.contains('on'), '点形状后进入「画形状」编辑态');
  {
    /* 面板只留 分区 / 类型 / 起始编号 / 颗数 / 方向，几何与闭环都藏起来 */
    ok(byId.get('shCircleRow').classList.contains('hide'), '面板不显示「圆芯 / 半径」');
    ok(byId.get('shPtsRow').classList.contains('hide'), '面板不显示「顶点 px」');
    ok(byId.get('shClosedRow').classList.contains('hide'), '面板不显示「闭环」');
    ok(/<span>起始编号<\/span>/.test(html), '「头(起始编号)」已改名「起始编号」');
  }
  pd({ pointerId: 1, button: 0, clientX: 500, clientY: 400 });
  ok(selectBtn.classList.contains('on') && !shapeBtn.classList.contains('on'),
     '编辑态点空白释放（回到「选择/编辑」模式）');

  /* 再点形状进编辑 → 点「在画布上定头尾」→ 点两下（头/尾）自动铺 */
  pd({ pointerId: 1, button: 0, clientX: 200, clientY: 160 });
  byId.get('shPick').onclick();
  pd({ pointerId: 1, button: 0, clientX: 200, clientY: 160 });   /* 头：线段中点 */
  await new Promise(r => setTimeout(r, 50));
  pd({ pointerId: 1, button: 0, clientX: 250, clientY: 190 });   /* 尾：下游 */
  await new Promise(r => setTimeout(r, 700));
  {
    const s1 = shapes()[0];
    const z = st().zones[0];
    const onZone = st().leds.filter(l => l.n >= z.start && l.n < z.start + z.count);
    ok(s1.entry > 0, `定「头」后起点偏移 entry=${s1.entry}（不再从起点开始）`);
    ok(s1.laid === true, '定完「尾」自动铺进编号（laid=true）');
    ok(onZone.length === z.count, `号段铺满 ${onZone.length} 颗（分区 ${z.count} 颗）`);
  }

  /* 定头尾**不是**形状编辑（用户第六轮第 2 条）：两步走完回到「选择/编辑」，手柄也不留在画布上。
   * 下面还要抓手柄 / 换类型，先按面板「编辑」重新进编辑态（跟用户的手一模一样）。 */
  ok(selectBtn.classList.contains('on') && !shapeBtn.classList.contains('on'),
     '定完头尾回到「选择/编辑」模式（定头尾只改编号，不进形状编辑）');
  ok(byId.get('shPick').textContent === '在画布上定头尾', '「在画布上定头尾」按钮两步走完自己改回名字');
  byId.get('shEdit').onclick();
  ok(shapeBtn.classList.contains('on'), '面板「编辑」重新进编辑态（下面的手柄 / 换类型照旧）');

  /* 改分区灯数 → 已铺形状自动增删灯（自适应颗数，不再留一个灰的多余灯） */
  {
    const zc = byId.get('zCount');
    zc.value = '5'; zc.oninput({ target: zc });
    await new Promise(r => setTimeout(r, 700));
    {
      const z = st().zones[0], s = shapes()[0];
      const onZone = st().leds.filter(l => l.n >= z.start && l.n < z.start + z.count);
      ok(z.count === 5 && s.count === 5, `分区灯数改成 5 → 形状颗数跟着变（${s.count}）`);
      ok(onZone.length === 5, `号段自动删到 ${onZone.length} 颗（原来 8 颗，多出来的自动去掉）`);
    }
    zc.value = '8'; zc.oninput({ target: zc });            /* 改回来，后面换类型不受影响 */
    await new Promise(r => setTimeout(r, 700));
  }

  /* 面板「形状类型」换成圆环（外框不动）；再拖右下角手柄改大小 */
  {
    const before = (() => {
      const s = shapes()[0]; const xs = s.pts.map(p => p[0]), ys = s.pts.map(p => p[1]);
      return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    })();
    const kindEl = byId.get('shKind');
    kindEl.value = 'circle'; kindEl.oninput({ target: kindEl });
    await new Promise(r => setTimeout(r, 700));
    const c = shapes()[0];
    ok(c.kind === 'circle' && c.r > 0 && c.ry > 0, `换成圆环（r=${c.r} ry=${c.ry}）`);
    ok(Math.abs((c.cx - c.r) - before.x0) < 1e-6 && Math.abs((c.cy - c.ry) - before.y0) < 1e-6 &&
       Math.abs((c.cx + c.r) - before.x1) < 1e-6 && Math.abs((c.cy + c.ry) - before.y1) < 1e-6,
       '换类型外框不动');

    const r0 = c.r, ry0 = c.ry;
    pd({ pointerId: 1, button: 0, clientX: 300, clientY: 220 });
    move(360, 280);
    pu({});
    await new Promise(r => setTimeout(r, 700));
    const c2 = shapes()[0];
    ok(c2.r > r0 && c2.ry > ry0, `拖右下角手柄后椭圆变大（r ${r0.toFixed(1)}→${c2.r.toFixed(1)}）`);
  }

  /* 随时改形状：编辑态点形状选择框 = 换类型；退出编辑后点形状选择框 = 画新的；Esc = 释放 */
  {
    /* 编辑态点形状选择框，立即把当前形状换成那种（外框不动），灯也立即跟着重铺 */
    ok(shapes()[0].kind === 'circle', '前置：当前选中形状是圆环');
    {
      const z = st().zones[0];
      const before = st().leds.find(l => l.n === z.start);
      gal().find(b => b.dataset.kind === 'line').onclick();
      await new Promise(r => setTimeout(r, 700));
      const after = st().leds.find(l => l.n === z.start);
      ok(shapes()[0].kind === 'line', '编辑态点「直线」立即把圆环换成直线（换类型）');
      ok(before && after && (before.x !== after.x || before.y !== after.y),
         '换类型后已铺的灯立即跟着重铺（不用再拖动一下）');
    }
    gal().find(b => b.dataset.kind === 'circle').onclick();
    await new Promise(r => setTimeout(r, 700));
    ok(shapes()[0].kind === 'circle', '再点「圆环」换回来（高亮与形状同步）');
    ok(gal().find(b => b.dataset.kind === 'circle').classList.contains('on'),
       '形状选择框高亮切到圆环');

    /* 退出编辑（点空白释放），再点「直线」进添加态，画第 2 个形状 */
    pd({ pointerId: 1, button: 0, clientX: 500, clientY: 400 });   /* 点空白释放 */
    ok(selectBtn.classList.contains('on'), '点空白释放回选择模式');
    gal().find(b => b.dataset.kind === 'line').onclick();
    pd({ pointerId: 1, button: 0, clientX: 500, clientY: 100 });
    move(600, 180);
    pu({});
    await new Promise(r => setTimeout(r, 700));
    ok(shapes().length === 2, `又画了 1 个形状（共 ${shapes().length} 个）`);

    /* 点第 1 个形状（圆环）进编辑，再点第 2 个（直线）切换选中 */
    pd({ pointerId: 1, button: 0, clientX: 230, clientY: 190 });   /* 圆环内部（中心） */
    ok(byId.get('shList').value === '0', '点第 1 个形状后选中圆环（#shList=0）');
    pd({ pointerId: 1, button: 0, clientX: 550, clientY: 140 });   /* 直线中点，在其包围盒内 */
    ok(byId.get('shList').value === '1', '编辑态点其它形状能切换选中（随时改形状，#shList=1）');

    /* Esc = 释放（回到选择/编辑模式） */
    (listeners['window:keydown'] || [])[0]({ key: 'Escape', target: { tagName: 'DIV' }, preventDefault() {} });
    ok(selectBtn.classList.contains('on') && !shapeBtn.classList.contains('on'),
       'Esc 键释放形状编辑（回到「选择/编辑」模式）');

    /* 选择模式点已铺形状的内部（不是轮廓）也能选中 —— 之前只有轮廓能点，里面没反应 */
    pd({ pointerId: 1, button: 0, clientX: 230, clientY: 190 });   /* 圆环内部（中心，有灯的形状） */
    ok(byId.get('shList').value === '0', '点已铺形状的内部也能选中（#shList=0）');
  }
}

/* ---- 16) 批 2 · 分区页：编辑即时体检（Z2）/ 复制分区（Z3）/ 编号压缩与补缺（Z4） ---- */
{
  const CORE2 = new Function(coreSrc + '\n; return CORE;')();   /* 纯逻辑：用真 validate 复核 */
  globalThis.confirm = m => { confirmCalls.push(m); return true; };  /* F4 的测试把它改成了「取消」 */
  const tabs = document.querySelectorAll('#tabs button');
  const go = n => tabs.find(b => b.dataset.tab === n).onclick();
  const rows = () => (byId.get('zoneTbl') || {}).children || [];
  const prj = i => JSON.parse(store.get('led_layout_editor.v1')).projects[i].state;
  const nums = st => st.leds.map(l => l.n).sort((a, b) => a - b);
  const codes = st => CORE2.validate(st).map(x => x.code);
  const chk = () => byId.get('zChk');

  /* --- Z2：编辑时就地体检（在空白项目上做：它没有形状，改 count 不会顺手重铺灯） --- */
  projRows()[1].onclick();
  await new Promise(r => setTimeout(r, 100));
  go('zones');
  byId.get('btnZoneAdd').onclick();                     /* 分区A [0,8)，加完自动选中 */
  await new Promise(r => setTimeout(r, 700));

  const zsEl = byId.get('zStart'), zcEl = byId.get('zCount');
  zsEl.value = '100'; zsEl.oninput({ target: zsEl });   /* [100,108) 越过 ledCount 104 */
  await new Promise(r => setTimeout(r, 700));
  ok(/\[V9\]/.test(chk().innerHTML),
     `Z2：start 越界时字段旁立即出现 V9（"${chk().innerHTML.replace(/<[^>]+>/g, '')}"）`);
  ok(zsEl.classList.contains('bad'), 'Z2：越界的 start 输入框被描红');
  ok(/err/.test(chk().className), `Z2：提示行按错误级着色（class="${chk().className}"）`);

  zsEl.value = '8'; zsEl.oninput({ target: zsEl });     /* 回到 [8,16)，挨着 分区1 但不重叠 */
  zcEl.value = '60'; zcEl.oninput({ target: zcEl });    /* [8,68)：长度超 ZONE_MAX_LEN 40 */
  await new Promise(r => setTimeout(r, 700));
  ok(/\[V8\]/.test(chk().innerHTML), 'Z2：count 超 ZONE_MAX_LEN 时出 V8');
  ok(zcEl.classList.contains('bad') && !zsEl.classList.contains('bad'), 'Z2：只把超长的 count 描红');

  zcEl.value = '200'; zcEl.oninput({ target: zcEl });   /* 200 > 127：pos 是 int16 会溢出 */
  await new Promise(r => setTimeout(r, 700));
  ok(/\[V26\]/.test(chk().innerHTML) && /\[V9\]/.test(chk().innerHTML),
     'Z2：count 填到 200 时同时报 V9（越界）与 V26（pos 溢出）');

  zcEl.value = '8'; zcEl.oninput({ target: zcEl });
  byId.get('btnZoneAdd').onclick();                     /* 分区3 [16,24)，与前面两个都相邻不重叠 */
  await new Promise(r => setTimeout(r, 700));
  zsEl.value = '4'; zsEl.oninput({ target: zsEl });     /* 分区3 → [4,12)，同时压住 分区1 与 分区2 */
  await new Promise(r => setTimeout(r, 700));
  ok(/\[V5\]/.test(chk().innerHTML) && /重叠/.test(chk().innerHTML),
     'Z2：与相邻分区重叠时出 V5（并说明跟谁重叠）');

  zsEl.value = '16'; zsEl.oninput({ target: zsEl });
  await new Promise(r => setTimeout(r, 700));
  ok(!/\[V\d/.test(chk().innerHTML) && !zsEl.classList.contains('bad') &&
     !zcEl.classList.contains('bad') && !/err/.test(chk().className),
     `Z2：改回不冲突的区间后提示与描红一起消失（"${chk().innerHTML}"）`);

  /* --- Z3：复制分区（当前选中的是刚加的 分区3；副本插在它后面一位） --- */
  const zsBefore = prj(1).zones.length, codesBefore = new Set(codes(prj(1)));
  byId.get('btnZoneDup').onclick();
  await new Promise(r => setTimeout(r, 700));
  const z3 = prj(1).zones, cp = z3[z3.length - 1] || {}, src = z3[z3.length - 2] || {};
  ok(z3.length === zsBefore + 1, `Z3：复制后分区数 ${zsBefore} → ${z3.length}`);
  ok(cp.name === src.name + ' 副本' && cp.latin === src.latin + '_CP',
     `Z3：副本按源分区起名（name="${cp.name}" / latin="${cp.latin}"，源是「${src.name}」）`);
  ok(cp.start === src.start + src.count && cp.count === src.count,
     `Z3：副本排在源分区后面并沿用颗数（start=${cp.start}, count=${cp.count}）`);
  ok(cp.id !== src.id, `Z3：副本 id 与源分区不重复（${cp.id}）`);
  ok(byId.get('zName').value === cp.name, 'Z3：复制完自动选中副本（右栏跟着切换）');
  ok(!z3.slice(0, -1).some(o => cp.start < o.start + o.count && o.start < cp.start + cp.count),
     'Z3：副本不压住任何已有分区（validate 挑不出 V5）');
  const added = codes(prj(1)).filter(c => !codesBefore.has(c));
  ok(!added.some(c => ['V1', 'V2', 'V3', 'V3b', 'V5'].includes(c)),
     `Z3：复制分区不引入编号类问题（validate 新增条目: ${added.join(', ') || '无'}）`);
  byId.get('btnZoneDel').onclick();                     /* 收拾干净：删掉副本（这一段整段收走） */
  await new Promise(r => setTimeout(r, 700));
  ok(prj(1).zones.length === zsBefore, `Z3：删掉副本后回到 ${prj(1).zones.length} 个分区`);

  /* --- Z4：编号压缩 / 补缺号（回到预设的满板，才有 0..103 可数） --- */
  projRows()[0].onclick();
  byId.get('btnNew').onclick();                         /* 重置成干净的 SP-3122D 预设 */
  await new Promise(r => setTimeout(r, 700));
  ok(nums(prj(0)).length === 104 && nums(prj(0))[0] === 0 && nums(prj(0))[103] === 103,
     'Z4 前置：预设是满板 0..103（没被前面的用例带脏）');

  /* 分区表每渲染一次就往里追加一批行，只有最后一批还指向当前 state —— 拿错行会选中旧区间的编号 */
  const zr = rows();
  const row0 = zr[zr.length - prj(0).zones.length];
  ok(!!row0, 'Z4 前置：拿得到分区表当前渲染的第一行');
  (row0 || { onclick() {} }).onclick();                 /* 点第 1 个分区 → 整段选中它的 8 颗 */
  byId.get('btnDelLed').onclick();                      /* 删掉 0..7，人为留出缺号 */
  await new Promise(r => setTimeout(r, 700));
  ok(nums(prj(0)).length === 96 && nums(prj(0))[0] === 8,
     `Z4 前置：删掉 8 颗后剩 ${nums(prj(0)).length} 颗（最小号 ${nums(prj(0))[0]}）`);
  ok(codes(prj(0)).includes('V2'), 'Z4 前置：缺号确实进了 validate（V2）');

  byId.get('btnCompact').onclick();
  await new Promise(r => setTimeout(r, 700));
  const n1 = nums(prj(0));
  ok(n1.length === 96 && n1.every((n, i) => n === i),
     `Z4：压缩编号后是连续的 0..${n1.length - 1}（缺号被挤到尾部）`);

  const gap = 104 - n1.length;
  for (let i = 0; i < gap; i++) byId.get('btnFillGap').onclick();
  await new Promise(r => setTimeout(r, 700));
  const n2 = nums(prj(0));
  ok(n2.length === 104 && n2.every((n, i) => n === i),
     `Z4：「补一个缺号」点 ${gap} 次后补齐 0..103（共 ${n2.length} 颗）`);
  const cs = codes(prj(0)).filter(c => c !== 'OK');
  ok(!cs.some(c => ['V1', 'V2', 'V3', 'V3b', 'V12'].includes(c)),
     `Z4：补齐后 validate 无 V1/V2/V3/V3b/V12（补号不压坐标）（剩下: ${cs.join(', ') || '无'}）`);
}

/* ---- 17) 用户反馈（批 2 追加）：分区页灰底说明瘦身 / 挑形状补齐 5 种 / 点灯选灯 /
 *      手动挪出去的灯跟着形状走（相对位置不变，拖回原位附近自动对齐） ---- */
{
  /* 17.1 分区页：静态灰底说明只剩几条短句（大段手势说明撤到帮助页 / 悬浮说明里） */
  {
    const i = html.indexOf('<div class="pane on" data-pane="zones">');
    const pane = html.slice(i, html.indexOf('<div class="pane" data-pane="check">', i));
    ok(pane.length > 500, '拿得到「分区」页的 HTML 片段');
    const prose = [...pane.matchAll(/<div class="hint"(?![^>]*id=)[^>]*>([\s\S]*?)<\/div>/g)]
      .map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    ok(prose.length === 5, `分区页静态灰底说明只剩 ${prose.length} 条（≤ 5）`);
    const longest = prose.reduce((a, b) => (b.length > a.length ? b : a), '');
    ok(longest.length <= 100, `最长的一条 ${longest.length} 字（≤ 100）：「${longest.slice(0, 26)}…」`);
    ok(!/拖四角小方块改大小、拖框里挪动/.test(pane), '「①②③」那一大段手势说明已从页面上撤掉');
  }

  /* 17.2 挑形状补齐 5 种，与「形状类型」下拉一一对应 */
  {
    const CORE3 = new Function(coreSrc + '; return CORE;')();
    const kinds = [...html.match(/<select id="shKind">([\s\S]*?)<\/select>/)[1]
      .matchAll(/value="([a-z]+)"/g)].map(m => m[1]);
    const tools = CORE3.SHAPE.TOOLS.slice();
    const names = k => (CORE3.SHAPE.TOOL_NAMES || {})[k] || k;
    const galHtml = [...html.matchAll(/id="shGal\w+" data-kind="([a-z]+)"/g)].map(m => m[1]);
    ok(tools.join(',') === 'rect,rrect,circle,poly,line',
       `挑形状补齐成 5 种（${tools.map(names).join(' / ')}）`);
    ok(tools.join(',') === kinds.join(','),
       `缩略图与「形状类型」下拉同一套、同一顺序（${kinds.map(names).join(' / ')}）`);
    ok(galHtml.join(',') === tools.join(','), `HTML 里 ${galHtml.length} 个缩略图按钮的 data-kind 与之一致`);
    ok(CORE3.SHAPE.TOOLS.join(',') === CORE3.SHAPE.KINDS.join(','),
       'core：TOOLS 与 KINDS 一一对应（以后加类型不会漏掉缩略图按钮）');
  }
}

/* ---- 17b) 画布上：点灯选灯 / 挪出去的灯跟着形状走 ---- */
{
  const CORE4 = new Function(coreSrc + '; return CORE;')();
  const CELL = 40;
  const curSt = () => JSON.parse(store.get('led_layout_editor.v1')).projects[0].state;
  const shapes = () => curSt().shapes || [];
  const plan = sh => CORE4.SHAPE.plan(sh, CELL).pts;
  const gal = () => document.querySelectorAll('#shGallery button');
  const pd = (listeners['cv:pointerdown'] || [])[0];
  const pm = (listeners['cv:pointermove'] || [])[0];
  const pu = (listeners['cv:pointerup'] || [])[0];
  const move = (x, y) => pm({ clientX: x, clientY: y });
  const esc = () => (listeners['window:keydown'] || [])[0]({ key: 'Escape', target: { tagName: 'DIV' }, preventDefault() {} });
  const modeBtn = m => (byId.get('left').children || []).find(b => b.dataset.mode === m);
  const wait = () => new Promise(r => setTimeout(r, 700));
  let cal = null;
  const clickAt = (x, y) => {
    if (!cal) return;                                       /* 校准失败时不要在测试里炸栈，让断言去报错 */
    const c = cal.c(x, y);
    pd({ pointerId: 1, button: 0, clientX: c[0], clientY: c[1] });
    pu({});
  };
  const dragAt = (x0, y0, x1, y1) => {
    if (!cal) return;
    const a = cal.c(x0, y0), b = cal.c(x1, y1);
    pd({ pointerId: 1, button: 0, clientX: a[0], clientY: a[1] });
    move(b[0], b[1]);
    pu({});
  };

  projRows()[0].onclick();
  globalThis.confirm = () => true;
  byId.get('btnNew').onclick();                  /* 干净的 SP-3122D 预设：104 颗 / 5 个分区 / 5 个形状 */
  await wait();

  /* 画布映射：render() 最后一帧的世界变换直接给出来（世界 → 客户端），
   * 不用「拖个框反推 zoom」—— 反推的起点带半格误差，点灯就会点到旁边那颗；
   * 而且试错的拖拽会落进已有形状里，把工程本身改掉（挪形状 = 重铺该区）。 */
  cal = { get zoom() { return ctxM()[0]; },
          c: (x, y) => { const m = ctxM(); return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; } };
  ok(cal.zoom > 0.05 && cal.zoom < 6, `画布映射拿到了（render 变换 zoom=${cal.zoom.toFixed(3)}）`);

  /* 校准用的矩形：**算一个一定空白的世界点**（躲开所有形状的包围盒与每一颗灯），
   * 在那里拖一个框 —— 顺带验证「还没铺的形状不动任何一颗灯」。 */
  {
    const boxes = shapes().map(s => CORE4.SHAPE.boxOf(s));
    const led0 = curSt().leds.map(l => [l.x, l.y]);
    const blank = [];
    for (let x = -1500; x <= 2500; x += 100)
      for (let y = -600; y <= 2200; y += 100) {
        const pad = 200;
        if (boxes.some(b => x > b.x0 - pad && x < b.x1 + pad && y > b.y0 - pad && y < b.y1 + pad)) continue;
        if (led0.some(l => Math.abs(l.x - x) < 60 && Math.abs(l.y - y) < 60)) continue;
        blank.push([x, y]);
      }
    const w0 = blank[Math.floor(blank.length / 2)] || [0, 0];
    const a = cal.c(w0[0], w0[1]), d = cal.c(w0[0] + 140 / cal.zoom, w0[1] + 100 / cal.zoom);
    const n0 = shapes().length, leds0 = curSt().leds.length;
    esc();
    gal().find(b => b.dataset.kind === 'rect').onclick();      /* 挑形状 = 进添加态 */
    pd({ pointerId: 1, button: 0, clientX: a[0], clientY: a[1] });
    move(d[0], d[1]);
    pu({});
    await wait();
    const drew = shapes().length === n0 + 1;
    ok(drew, `在空白处拖出了矩形（世界 ${w0[0]},${w0[1]} 起，拖 140×100 屏幕 px）`);
    if (drew) {
      const b = CORE4.SHAPE.boxOf(shapes()[n0]);
      ok(Math.abs((b.x1 - b.x0) * cal.zoom - 140) < 2 && Math.abs((b.y1 - b.y0) * cal.zoom - 100) < 2,
         `世界 → 屏幕这一趟对得上（拖 140×100 屏幕 px = ${Math.round(b.x1 - b.x0)}×${Math.round(b.y1 - b.y0)} 世界 px，zoom=${cal.zoom.toFixed(3)}）`);
      ok(curSt().leds.length === leds0 && shapes()[n0].laid !== true,
         `画一个还没铺的形状，一颗灯都没动（仍 ${curSt().leds.length} 颗）`);
      byId.get('shDel').onclick();                           /* 校准用的形状擦掉（没画出来就别删了） */
      await wait();
      ok(shapes().length === n0, `校准用的形状已删掉（回到 ${shapes().length} 个形状）`);
    }
    esc();
  }

  /* 靶子：挑「已铺」里外框最大的那个形状（内部空间大，好找「离灯够远」的点），取它中间那颗灯 */
  const shBox = sh => CORE4.SHAPE.boxOf(sh);
  const area = sh => { const b = shBox(sh); return (b.x1 - b.x0) * (b.y1 - b.y0); };
  const tgt = shapes().filter(s => s.laid && plan(s).length >= 4).sort((a, b) => area(b) - area(a))[0];
  ok(!!tgt, `预设里有已铺的形状可当靶子（${tgt ? plan(tgt).length : 0} 颗，外框 ${tgt ? Math.round(shBox(tgt).x1 - shBox(tgt).x0) + '×' + Math.round(shBox(tgt).y1 - shBox(tgt).y0) : '?'}）`);
  const tp = plan(tgt)[Math.floor(plan(tgt).length / 2)];

  /* 17.3 点灯选灯：选择模式下点在灯上 = 选中那颗灯（不再被形状抢走） */
  clickAt(tp.x, tp.y);
  ok(byId.get('selInfo').textContent === `已选 1 颗：${tp.n}`,
     `点灯上选中的就是那颗灯（"${byId.get('selInfo').textContent}"）`);
  ok(!modeBtn('shape').classList.contains('on'), '点灯没被形状抢走（还在「选择/编辑」模式）');

  /* 17.3b 点形状的框内空白处 = 照样能进「画形状」编辑态 */
  const spot = (() => {
    const b = CORE4.SHAPE.boxOf(tgt), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const hs = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1],
                [cx, b.y0], [b.x1, cy], [cx, b.y1], [b.x0, cy]];
    const out = [];
    for (let t = 0.12; t <= 0.89; t += 0.11) for (let u = 0.12; u <= 0.89; u += 0.11) {
      const x = b.x0 + (b.x1 - b.x0) * t, y = b.y0 + (b.y1 - b.y0) * u;
      if (hs.some(h => Math.hypot(h[0] - x, h[1] - y) < 30)) continue;            /* 避开手柄 */
      if (!curSt().leds.every(l => Math.hypot(l.x - x, l.y - y) > 26)) continue;  /* 避开灯 */
      out.push([x, y]);
    }
    out.sort((p, q) => Math.hypot(p[0] - cx, p[1] - cy) - Math.hypot(q[0] - cx, q[1] - cy));
    return out[0] || null;
  })();
  ok(!!spot, `找得到一个「在形状里、但离每颗灯都超过半格」的点（${spot && Math.round(spot[0])},${spot && Math.round(spot[1])}）`);
  if (spot) clickAt(spot[0], spot[1]);
  const esi = +byId.get('shList').value;
  ok(modeBtn('shape').classList.contains('on') && Number.isInteger(esi) && !!shapes()[esi],
     `点形状框内的空白处 → 进「画形状」编辑态并选中形状 ${esi}`);
  esc();
  ok(!modeBtn('shape').classList.contains('on'), 'Esc 释放形状编辑，回到「选择/编辑」');

  /* 17.4 把形状里的一颗灯拖出去 → 挪形状时它保持相对位置 → 拖回原位附近自动对齐 */
  {
    const sh = shapes()[esi], pts = plan(sh || {}), k = Math.floor(pts.length / 2);
    const p0 = pts[k] || { x: 0, y: 0, n: -1 }, n = p0.n;
    const det = () => (shapes()[esi] || {}).det || {};
    ok(!!(sh && sh.laid && p0.n >= 0), `形状 ${esi} 是「已铺」的，瞄准中间那颗落点（#${n} @ ${p0.x},${p0.y}）`);

    dragAt(p0.x, p0.y, p0.x + 120, p0.y + 80);      /* 手动拖出去（吸附会把它落到格心上） */
    await wait();
    let led = curSt().leds.find(l => l.n === n);
    ok(!!det()[k], `拖出去的灯记下「相对形状原位」的偏移（det[${k}]=${JSON.stringify(det()[k])}）`);
    ok(!!led && Math.hypot(led.x - p0.x, led.y - p0.y) > CELL * 0.75,
       `那颗灯确实挪出去了（离原位 ${led ? Math.round(Math.hypot(led.x - p0.x, led.y - p0.y)) : '?'}px）`);

    if (spot) {                                     /* 再进编辑态，把形状往右挪 80px */
      clickAt(spot[0], spot[1]);
      dragAt(spot[0], spot[1], spot[0] + 80, spot[1]);
    }
    await wait();
    const p2 = plan(shapes()[esi])[k], d = det()[k] || [NaN, NaN];
    led = curSt().leds.find(l => l.n === n);
    ok(!!det()[k] && !!p2 && Math.abs(p2.x - p0.x - 80) < 21,
       `形状自己挪了 80px（落点 #${k}：${Math.round(p0.x)} → ${p2 ? Math.round(p2.x) : '?'}）`);
    ok(!!led && !!p2 && Math.abs(led.x - p2.x - d[0]) < 1.5 && Math.abs(led.y - p2.y - d[1]) < 1.5,
       `挪形状后那颗灯保持相对位置（形状原位 ${p2 ? Math.round(p2.x) + ',' + Math.round(p2.y) : '?'}；灯 ${led ? led.x + ',' + led.y : '?'}）`);
    ok(!!led && !!p2 && Math.hypot(led.x - p2.x, led.y - p2.y) > CELL * 0.75, '没有被形状拽回去');

    esc();
    if (led && p2) dragAt(led.x, led.y, p2.x, p2.y);   /* 拖回原位附近 */
    await wait();
    led = curSt().leds.find(l => l.n === n);
    ok(!det()[k], `拖回原位附近后偏移被清掉（det=${JSON.stringify(det())}）`);
    ok(!!led && !!p2 && Math.abs(led.x - p2.x) < 0.01 && Math.abs(led.y - p2.y) < 0.01,
       `那颗灯自动对齐回形状的原位（${led ? led.x + ',' + led.y : '?'}）`);
  }

  /* 17.5 面板诊断行：只留「形状跟分区对不对得上」—— 周长 / 每边落点 / 排得开 不再显示 */
  {
    const sel = byId.get('shList');
    sel.value = String(esi); sel.onchange({ target: sel });     /* 把诊断行刷成这个形状的 */
    esc();                                                      /* 下拉选形状会进编辑态，这里只要诊断行 */
    const info = (byId.get('shInfo') || {}).innerHTML || '';
    const plain = info.replace(/<br>/g, ' | ');
    ok(!/周长/.test(info) && !/每边落点/.test(info) && !/排得开/.test(info),
       `诊断行不再报周长/每边落点/排得开（"${plain.slice(0, 56)}…"）`);
    ok(/号段/.test(info), `诊断行仍报「形状与分区号段」的对照（"${plain.slice(0, 56)}…"）`);
  }

  /* 17.6 换类型 = 画布上看得见的变化（矩形 → 多边形给正六边形），多边形还有「边数」参数 */
  {
    const kEl = byId.get('shKind');
    const b0 = shBox(shapes()[esi]), cnt0 = plan(shapes()[esi]).length;
    kEl.value = 'poly'; kEl.oninput({ target: kEl });
    await wait();
    const p1 = shapes()[esi], b1 = shBox(p1);
    ok(p1.kind === 'poly' && p1.pts.length === 6 && Math.round(+p1.n) === 6,
       `矩形换成多边形 → 顶点变成 ${p1.pts.length} 个正多边形顶点（不再跟矩形长得一样）`);
    ok(Math.abs(b1.x0 - b0.x0) < 1e-6 && Math.abs(b1.x1 - b0.x1) < 1e-6 &&
       Math.abs(b1.y0 - b0.y0) < 1e-6 && Math.abs(b1.y1 - b0.y1) < 1e-6,
       '换多边形外框不动（还是原来那个框）');
    ok(!byId.get('shPolyNRow').classList.contains('hide'),
       '多边形时面板露出「边数」这一行（别的形状藏起来）');
    ok(byId.get('shPolyN').value === '6', `「边数」框里填的是当前值（${byId.get('shPolyN').value}）`);
    ok(plan(p1).length === cnt0, `多边形上照样铺 ${plan(p1).length} 颗（没因为换类型丢灯）`);

    const nEl = byId.get('shPolyN');
    nEl.value = '5'; nEl.oninput({ target: nEl });
    await wait();
    const p2 = shapes()[esi], b2 = shBox(p2);
    ok(p2.pts.length === 5 && Math.round(+p2.n) === 5, `改「边数」= 5 → 顶点 ${p2.pts.length} 个（正五边形）`);
    ok(Math.abs(b2.x0 - b1.x0) < 1e-6 && Math.abs(b2.x1 - b1.x1) < 1e-6 &&
       Math.abs(b2.y0 - b1.y0) < 1e-6 && Math.abs(b2.y1 - b1.y1) < 1e-6,
       '改边数时外框不动（手柄不会跳）');
    ok(plan(p2).length === cnt0, `五边形上也照铺 ${plan(p2).length} 颗`);

    kEl.value = 'rect'; kEl.oninput({ target: kEl });
    await wait();
    ok(byId.get('shPolyNRow').classList.contains('hide'), '换回矩形后「边数」又藏起来');
  }

  /* 17.7 换类型时「手动挪出去的灯」一律归位（旧偏移在新几何上没有意义） */
  {
    const pts = plan(shapes()[esi]), k = Math.floor(pts.length / 2), p0 = pts[k];
    dragAt(p0.x, p0.y, p0.x + 140, p0.y + 100);            /* 先把中间那颗拖出去 */
    await wait();
    ok(!!(((shapes()[esi] || {}).det) || {})[k], `前置：拖出去的灯记下了偏移（det[${k}] 有值）`);

    const kEl = byId.get('shKind');
    kEl.value = 'circle'; kEl.oninput({ target: kEl });
    await wait();
    const sh2 = shapes()[esi], det2 = sh2.det || {};
    ok(sh2.kind === 'circle' && Object.keys(det2).length === 0,
       `换类型后偏移清空 = 灯归位（det=${JSON.stringify(det2)}）`);
    ok(/归位/.test(byId.get('status').textContent),
       `状态栏说清了「挪出去的灯已归位」（"${byId.get('status').textContent.slice(0, 46)}…"）`);
    const led = curSt().leds.find(l => l.n === p0.n), on = plan(sh2).find(q => q.n === p0.n);
    ok(!!led && !!on && Math.hypot(led.x - on.x, led.y - on.y) <= 1,
       `那颗灯回到新形状的落点上（灯 ${led ? led.x + ',' + led.y : '?'} ≈ 落点 ${on ? on.x.toFixed(1) + ',' + on.y.toFixed(1) : '?'}；` +
       '圆的顶点不是整数格，存盘时按整数取整）');
    kEl.value = 'rect'; kEl.oninput({ target: kEl });
    await wait();
    ok(shapes()[esi].kind === 'rect' && !Object.keys(shapes()[esi].det || {}).length, '换回矩形收尾（仍无偏移）');
  }

  /* 17.8 「新增空白形状」：落在眼前（画布正中）+ 直接进编辑态，手柄立即可抓 */
  {
    esc();
    const zRows = (byId.get('zoneTbl') || {}).children || [];
    zRows[0].onclick();                                    /* 选一个分区 */
    const zs = byId.get('zStart'), zc = byId.get('zCount');
    zs.value = '1000'; zs.oninput({ target: zs });         /* 把它挪到没有灯的号段上 → 起「空白形状」 */
    zc.value = '6'; zc.oninput({ target: zc });
    await wait();
    const n0 = shapes().length;
    byId.get('shAdd').onclick();
    await wait();
    ok(shapes().length === n0 + 1, `「新增空白形状」加出来一个（${n0} → ${shapes().length}）`);
    ok(modeBtn('shape').classList.contains('on'), '新增后直接进「画形状」编辑态（8 个手柄立刻看得见、抓得住）');
    const nb = shapes()[shapes().length - 1], b = shBox(nb);
    ok((b.x1 - b.x0) >= 6 * CELL - 1e-6 && (b.y1 - b.y0) >= 5 * CELL - 1e-6 &&
       (b.x1 - b.x0) % CELL < 1e-6 && (b.y1 - b.y0) % CELL < 1e-6,
       `新形状不小于 6×5 格、且按格对齐（${Math.round(b.x1 - b.x0)}×${Math.round(b.y1 - b.y0)}px = ` +
       `${(b.x1 - b.x0) / CELL}×${(b.y1 - b.y0) / CELL} 格 —— 缩得小时按屏幕尺寸兜底放大）`);
    const a = cal.c(b.x0, b.y0), d = cal.c(b.x1, b.y1);
    ok(cal && a[0] >= 0 && a[1] >= 0 && d[0] <= 1200 && d[1] <= 900,
       `新形状整个落在画布可视范围内（客户端 ${Math.round(a[0])},${Math.round(a[1])} → ${Math.round(d[0])},${Math.round(d[1])}）`);
    ok(nb.laid !== true, '新形状还没铺（只画预览 + 轮廓）');
    const sw0 = (b.x1 - b.x0) * cal.zoom, sh0 = (b.y1 - b.y0) * cal.zoom;
    ok(sw0 >= 109 && sh0 >= 89,
       `新形状在屏幕上至少有 110×90px（实际 ${Math.round(sw0)}×${Math.round(sh0)}，当前缩放 ${cal.zoom.toFixed(2)}）—— 点得中`);
  }

  /* 17.9 改「边数」= 立刻重铺（不用先挪一下形状），挪出去的灯归位 */
  {
    const selL = byId.get('shList');
    selL.value = String(esi); selL.onchange({ target: selL });
    await wait();
    ok(Number(selL.value) === esi && modeBtn('shape').classList.contains('on'),
       '面板「形状」下拉里挑一个 = 选中它并直接进编辑态（手柄立刻可抓）');
    esc();

    const kEl2 = byId.get('shKind');
    kEl2.value = 'poly'; kEl2.oninput({ target: kEl2 });
    await wait();
    const sh0 = shapes()[esi];
    ok(sh0.kind === 'poly' && sh0.pts.length === Math.max(3, Math.round(+sh0.n)),
       `前置：${esi} 号形状是正 ${sh0.n} 边形（顶点 ${sh0.pts.length} 个）`);

    const p0 = plan(sh0)[Math.floor(plan(sh0).length / 2)];
    dragAt(p0.x, p0.y, p0.x + 160, p0.y + 120);          /* 先手动挪出去一颗，验证改边数会归位 */
    await wait();
    const kOff = plan(sh0).findIndex(p => p.n === p0.n);
    ok(!!((shapes()[esi].det || {})[kOff]), `前置：拖出去的灯记下偏移（det[${kOff}]）`);

    const before = curSt().leds.map(l => l.n + '@' + l.x + ',' + l.y).join(';');
    const nEl2 = byId.get('shPolyN');
    nEl2.value = '12'; nEl2.oninput({ target: nEl2 });
    await wait();
    const sh1 = shapes()[esi], pts1 = plan(sh1);
    ok(sh1.pts.length === 12 && Math.round(+sh1.n) === 12, `边数改成 12（顶点 ${sh1.pts.length} 个）`);
    ok(curSt().leds.map(l => l.n + '@' + l.x + ',' + l.y).join(';') !== before,
       '改完边数灯位就重排了 —— 不用先挪一下形状（这是用户实测的那条）');
    ok(pts1.every(p => { const l = curSt().leds.find(k => k.n === p.n);
                         return !!l && Math.hypot(l.x - p.x, l.y - p.y) <= 1; }),
       `这一区的 ${pts1.length} 颗灯全部落在新几何的落点上`);
    ok(!Object.keys(shapes()[esi].det || {}).length, `挪出去的那颗也归位了（det 清空）`);
    ok(/已跟着重铺/.test(byId.get('status').textContent),
       `状态栏说清了「已跟着重铺」（"${byId.get('status').textContent.slice(0, 40)}…"）`);
    kEl2.value = 'rect'; kEl2.oninput({ target: kEl2 });
    await wait();
  }

  /* 17.10 铺上灯之后怎么进形状编辑（这是用户实测「点不中形状」的那条路）：
   *   单击边框上的灯 = 选那颗灯（刻意保留）；双击**落在灯点上**也不算 —— 连点两颗灯只是选灯，
   *   绝不该悄悄把工具换成形状编辑态（换了之后每次点灯都在挪形状，看着就像「点灯有偏差」）。
   *   真正进编辑态的是：双击形状里的空白处 / 面板「形状」下拉 / 旁边的「编辑」按钮。 */
  {
    esc();
    const dbl = (listeners['cv:dblclick'] || [])[0];
    ok(typeof dbl === 'function', '画布上绑了 dblclick');
    const pts = plan(shapes()[esi]), p = pts[2] || pts[0];
    clickAt(p.x, p.y);
    ok(!modeBtn('shape').classList.contains('on'),
       `单击边框上的灯仍优先「选那颗灯」（#${p.n}）—— 点灯这件事不会被形状抢走`);
    const c = cal.c(p.x, p.y);
    dbl({ clientX: c[0], clientY: c[1] });
    ok(!modeBtn('shape').classList.contains('on'),
       '双击落在灯点上**不**换成形状编辑态（连点两颗灯 = 仍然只是选灯，不会偷偷换工具）');

    const spot2 = (() => {
      const b = shBox(shapes()[esi]);
      for (let t = 0.2; t <= 0.8; t += 0.1) for (let u = 0.2; u <= 0.8; u += 0.1) {
        const x = b.x0 + (b.x1 - b.x0) * t, y = b.y0 + (b.y1 - b.y0) * u;
        if (curSt().leds.every(l => Math.hypot(l.x - x, l.y - y) > CELL)) return [x, y];
      }
      return null;
    })();
    ok(!!spot2, `找得到形状里「离每颗灯都超过一格」的空白点（${spot2 && Math.round(spot2[0]) + ',' + Math.round(spot2[1])}）`);
    if (spot2) {
      const c2 = cal.c(spot2[0], spot2[1]);
      dbl({ clientX: c2[0], clientY: c2[1] });
      ok(modeBtn('shape').classList.contains('on') && Number(byId.get('shList').value) === esi,
         `双击形状里的空白处 → 进 ${esi} 号形状的编辑态（8 个手柄立即可抓）`);
      esc();
    }
    /* 面板「编辑」按钮：不管画布上点得中点不中，这条一定进得去 */
    ok(!!(byId.get('shEdit') || {}).onclick, '面板「形状」旁边有「编辑」按钮（#shEdit）');
    byId.get('shList').value = String(esi);
    byId.get('shEdit').onclick();
    ok(modeBtn('shape').classList.contains('on') && Number(byId.get('shList').value) === esi,
       `点面板「编辑」→ 进 ${esi} 号形状的编辑态`);
    esc();
  }

  /* 17.11 新增的空白形状：手柄真的抓得住（在左上角手柄上拖一下 = 改大了） */
  {
    esc();
    const i0 = shapes().length;
    byId.get('shAdd').onclick();
    await wait();
    const i = i0, b = shBox(shapes()[i]);
    ok(shapes().length === i0 + 1 && modeBtn('shape').classList.contains('on'),
       '「新增空白形状」直接进编辑态（不用先点中它）');
    dragAt(b.x0 + 0.5, b.y0 + 0.5, b.x0 - 70, b.y0 - 50);      /* 抓「左上」手柄往外拖 */
    await wait();
    const b2 = shBox(shapes()[i]);
    ok(b2.x0 < b.x0 - 20 && b2.y0 < b.y0 - 10,
       `抓左上角手柄拖一下就把形状改大了（${Math.round(b.x1 - b.x0)}×${Math.round(b.y1 - b.y0)} → ` +
       `${Math.round(b2.x1 - b2.x0)}×${Math.round(b2.y1 - b2.y0)}px）`);
    esc();
  }

  /* 17.12 用户实测的原始现场：**真正的空白画布**（0 灯 0 分区）上新增一个形状 ——
   * 得看得见、手柄抓得住（老毛病：形状只有几十屏幕 px / 手柄没画出来，根本点不中）。 */
  {
    esc();
    byId.get('btnProjNew').onclick();                      /* 空白项目（追加在末尾，并切过去） */
    await wait();
    const db = () => JSON.parse(store.get('led_layout_editor.v1'));
    const actSt = () => { const d = db(); return (d.projects.find(p => p.id === d.current) || d.projects[0]).state; };
    const actShapes = () => actSt().shapes || [];
    ok((actSt().leds || []).length === 0 && (actSt().zones || []).length === 0,
       `新项目是空的（${(actSt().leds || []).length} 灯 / ${(actSt().zones || []).length} 分区）—— 这就是「空白画布」`);

    /* 空白项目的 zoom / pan 变了：先拖一个矩形反推出这个项目的映射（同 17b 的办法） */
    gal().find(b => b.dataset.kind === 'rect').onclick();
    pd({ pointerId: 1, button: 0, clientX: 200, clientY: 200 });
    move(320, 300);
    pu({});
    await wait();
    const cbx = shBox(actShapes()[actShapes().length - 1]);
    const z2 = 120 / (cbx.x1 - cbx.x0);
    const c2 = (x, y) => [x * z2 + (200 - cbx.x0 * z2), y * z2 + (200 - cbx.y0 * z2)];
    const drag2 = (x0, y0, x1, y1) => {
      const a = c2(x0, y0), c = c2(x1, y1);
      pd({ pointerId: 1, button: 0, clientX: a[0], clientY: a[1] });
      move(c[0], c[1]);
      pu({});
    };
    ok(Math.abs((cbx.y1 - cbx.y0) * z2 - 100) < 2,
       `空白项目的画布映射校准好了（zoom=${z2.toFixed(3)}）`);
    byId.get('shDel').onclick();                            /* 校准用的擦掉 */
    await wait();                                           /* 等存盘落定（自动保存是防抖的） */
    ok(actShapes().length === 0, '校准用的形状已删掉，回到真正的空白画布');
    esc();

    const n0 = actShapes().length;
    byId.get('shAdd').onclick();
    await wait();
    const i = actShapes().length - 1, b = shBox(actShapes()[i]);
    ok(actShapes().length === n0 + 1 && modeBtn('shape').classList.contains('on'),
       `空白画布上「新增空白形状」：加出来了（${n0} → ${actShapes().length}），并直接进编辑态`);
    const a2 = c2(b.x0, b.y0), d2 = c2(b.x1, b.y1);
    ok(a2[0] >= 0 && a2[1] >= 0 && d2[0] <= 1200 && d2[1] <= 900,
       `新形状整个落在画布可视范围内（客户端 ${Math.round(a2[0])},${Math.round(a2[1])} → ` +
       `${Math.round(d2[0])},${Math.round(d2[1])}）—— 看得见`);
    const sw = (b.x1 - b.x0) * z2, shh = (b.y1 - b.y0) * z2;
    ok(sw >= 109 && shh >= 89,
       `新形状在屏幕上至少 110×90px（实际 ${Math.round(sw)}×${Math.round(shh)}）—— 手柄点得中`);
    drag2(b.x0 + 0.5, b.y0 + 0.5, b.x0 + 0.5 - 50 / z2, b.y0 + 0.5 - 40 / z2);   /* 抓左上角手柄往外拖 */
    await wait();
    const b3 = shBox(actShapes()[i]);
    ok(b3.x0 < b.x0 - 15 && b3.y0 < b.y0 - 10,
       `抓左上角手柄就把它改大了（${Math.round(b.x1 - b.x0)}×${Math.round(b.y1 - b.y0)} → ` +
       `${Math.round(b3.x1 - b3.x0)}×${Math.round(b3.y1 - b3.y0)}px）—— 摸得着`);
    esc();
  }

  /* 17.13 用户第五轮实测：选择模式下那 8 个蓝方块**不该还在画布上**（「没进形状编辑就不该看见手柄」）。
   * 按住形状边那一下按「挪动」处理（不再偷偷改大小）；要改大小先按住它进编辑态，手柄那时才画出来。 */
  {
    esc();
    ok(!modeBtn('shape').classList.contains('on'), '前置：已释放形状编辑（回到选择模式）');
    const cur0 = () => { const d = JSON.parse(store.get('led_layout_editor.v1'));
                         return (d.projects.find(p => p.id === d.current) || d.projects[0]).state; };
    const i = (cur0().shapes || []).length - 1;
    ok(i >= 0, `空白画布上那个形状还在（第 ${i + 1} 个）`);
    const b = shBox(cur0().shapes[i]);
    const hE = cal.c(b.x1, (b.y0 + b.y1) / 2);            /* 原来那个手柄在屏幕上的位置 */
    pd({ pointerId: 1, button: 0, clientX: hE[0], clientY: hE[1] });
    move(hE[0] + 60, hE[1]);
    pu({});
    await wait();
    const b2 = shBox(cur0().shapes[i]);
    ok(b2.x0 > b.x0 + 10 && Math.abs((b2.x1 - b2.x0) - (b.x1 - b.x0)) < 1,
       `选择模式按住「原来手柄的位置」= 整块挪动，不是改大小（宽 ${Math.round(b.x1 - b.x0)} → ` +
       `${Math.round(b2.x1 - b2.x0)}px；左边 ${Math.round(b.x0)} → ${Math.round(b2.x0)}）`);
    ok(modeBtn('shape').classList.contains('on'), '而且按下去当场进编辑态（手柄这时候才画出来）');

    /* 进了编辑态，手柄才是「看得见也抓得住」的：按住同一个手柄一次手势就改大小 */
    const b3 = shBox(cur0().shapes[i]);
    const hE3 = cal.c(b3.x1, (b3.y0 + b3.y1) / 2);
    pd({ pointerId: 1, button: 0, clientX: hE3[0], clientY: hE3[1] });
    move(hE3[0] + 60, hE3[1]);
    pu({});
    await wait();
    const b4 = shBox(cur0().shapes[i]);
    ok(b4.x1 > b3.x1 + 10 && Math.abs(b4.x0 - b3.x0) < 1,
       `编辑态下按住同一个手柄就改宽了（右边 ${Math.round(b3.x1)} → ${Math.round(b4.x1)}，左边没动）`);
    esc();
  }

  /* 17.14 缩得很小时点灯：命中半径有「至少 9 屏幕 px」的下限 ——
   * 老写法固定 0.42 格（世界 px），缩到 0.3 倍只剩 5 屏幕 px，点灯得靠亚像素精度。 */
  {
    projRows()[0].onclick();                               /* 回到 104 颗的预设项目 */
    await wait();
    esc();
    const wh = (listeners['cv:wheel'] || [])[0];
    for (let k = 0; k < 60 && cal.zoom > 0.28; k++)
      wh({ clientX: 600, clientY: 400, deltaY: 60, preventDefault() {} });
    const z = cal.zoom;
    ok(z < 0.45, `把画布缩到很小（zoom=${z.toFixed(3)}）`);
    const l = curSt().leds.find(k => k.n === 36) || curSt().leds[0];
    const c3 = cal.c(l.x, l.y);
    const wOff = CELL * 0.44;                                             /* 17.6 世界 px */
    pd({ pointerId: 1, button: 0, clientX: c3[0] + wOff * z, clientY: c3[1] });   /* 往邻灯那边偏一点点 */
    pu({});
    ok(byId.get('selInfo').textContent === `已选 1 颗：${l.n}`,
       `缩到 ${z.toFixed(2)} 倍、点偏 0.44 格（${(wOff * z).toFixed(1)} 屏幕 px）仍然选中那一颗` +
       `（老规则 0.42 格刚好漏掉；现在"${byId.get('selInfo').textContent}"）`);
    const probeX = l.x + CELL * 0.56;
    const nb = curSt().leds.map(k => ({ n: k.n, d: Math.hypot(k.x - probeX, k.y - l.y) }))
                           .sort((a, b) => a.d - b.d)[0];
    pd({ pointerId: 1, button: 0, clientX: c3[0] + CELL * 0.56 * z, clientY: c3[1] });   /* 偏过中点 */
    pu({});
    ok(byId.get('selInfo').textContent === `已选 1 颗：${nb.n}`,
       `偏过两颗之间的中点就选更近的那颗（#${l.n} → #${nb.n}）—— 命中取的是最近的一颗，不是第一颗`);
    esc();
  }

}

/* ---- 18) 用户第十轮实测：删分区要「删干净」—— 号段里的灯、挂在上面的形状一起走，
 *         后面的编号往前收拢（等效「删除 + 压缩编号 + 改小灯总数」），Ctrl+Z 连编号一起回来。
 *   老写法只把 zone 从表里 splice 掉：灯原地留下变成 V4「不属于任何分区」，形状掉成「参考线」。 ---- */
{
  const wait = () => new Promise(r => setTimeout(r, 750));
  const cur = () => { const d = JSON.parse(store.get('led_layout_editor.v1'));
                      return (d.projects.find(p => p.id === d.current) || d.projects[0]).state; };
  const rows = () => (byId.get('zoneTbl') || {}).children || [];
  const zRow = i => { const r = rows(); return r[r.length - cur().zones.length + i]; };
  const nums = st => st.leds.map(l => l.n).sort((a, b) => a - b);
  const CORE5 = new Function(coreSrc + '; return CORE;')();
  const codes = st => CORE5.validate(st).map(x => x.code);
  const issues = st => CORE5.validate(st).filter(x => x.level !== 'info').map(x => x.code);
  const key = e => (listeners['window:keydown'] || [])[0](
    Object.assign({ target: { tagName: 'DIV' }, preventDefault() {} }, e));

  const tip = html.match(/<button id="btnZoneDel" data-tip="([^"]*)"/)[1];
  ok(!/编号会保留/.test(tip) && /形状/.test(tip) && /灯总数/.test(tip),
     `「删除分区」的悬停说明不再说「编号会保留」，改成连灯带形状一起收走（"${tip.slice(0, 32)}…"）`);

  projRows()[0].onclick();
  byId.get('btnNew').onclick();                          /* 回到干净的 SP-3122D 满板 */
  await wait();
  const z0 = cur().zones.map(z => ({ id: z.id, name: z.name, start: z.start, count: z.count }));
  const n0 = nums(cur()).length, sh0 = (cur().shapes || []).length, lc0 = cur().meta.ledCount;
  ok(n0 === 104 && z0.length === 5 && sh0 === 5 && lc0 === 104,
     `前置：满板 ${n0} 灯 / ${z0.length} 分区 / ${sh0} 个形状 / 灯总数 ${lc0}`);
  const issues0 = issues(cur());                        /* 删之前的告警/错误（下面比值） */

  /* 挑中间那个分区 —— 它前后都有别的分区和形状，最能看出「收拢」与「没误伤」 */
  const k = Math.floor(z0.length / 2), dz = z0[k], len = dz.count, a0 = dz.start, a1 = a0 + len;
  const shGone = (cur().shapes || []).filter(sh => sh.zone === dz.id).length;
  zRow(k).onclick();
  ok(byId.get('zName').value === dz.name, `选中第 ${k + 1} 个分区「${dz.name}」（${a0}..${a1 - 1}，${len} 颗）`);
  ok(shGone >= 1, `它身上挂着 ${shGone} 个形状（下面要跟着一起没了）`);

  /* 17b 之后 confirm 换成了不记事的桩，这里要用真确认框的文案，先装回会记事的那种 */
  globalThis.confirm = m => { confirmCalls.push(m); return true; };
  confirmCalls.length = 0;
  byId.get('btnZoneDel').onclick();
  await wait();
  const st1 = cur();
  ok(confirmCalls.length === 1 && /颗灯一起删/.test(confirmCalls[0]) &&
     /形状一起删/.test(confirmCalls[0]) && new RegExp(`灯总数 ${lc0} → ${lc0 - len}`).test(confirmCalls[0]),
     `确认框先把后果说清楚（"${String(confirmCalls[0]).split('\n').slice(1, 3).join(' / ')}"）`);

  /* 1) 分区没了 */
  ok(st1.zones.length === z0.length - 1 && !st1.zones.some(z => z.id === dz.id),
     `分区从 ${z0.length} 个减到 ${st1.zones.length} 个（被删的那个不在了）`);
  /* 2) 灯跟着走，而且后面的编号往前收拢（不是留一排空号） */
  const n1 = nums(st1);
  ok(n1.length === n0 - len, `号段里的 ${len} 颗灯一起删（${n0} → ${n1.length} 颗）`);
  ok(n1.every((n, i) => n === i), `剩下的编号是连续的 0..${n1.length - 1}（后面的往前挪了 ${len} 位）`);
  ok(n1[n1.length - 1] === n0 - len - 1,
     `原来的末尾编号 ${n0 - 1} 一路挪到 ${n1[n1.length - 1]}（这一段不是留空号，是把后面的填上来）`);
  /* 3) 挂在这个分区上的形状一起删，别的形状还在 */
  const sh1 = st1.shapes || [];
  ok(sh1.length === sh0 - shGone && !sh1.some(s => s.zone === dz.id),
     `挂在上面的 ${shGone} 个形状一起删（${sh0} → ${sh1.length} 个），没有掉成「参考线」的残渣`);
  ok(sh1.every(s => !s.zone || st1.zones.some(z => z.id === s.zone)),
     '剩下的形状归属都还有主（没有孤儿形状）');
  ok(sh1.every(s => { const z = st1.zones.find(o => o.id === s.zone); return !z || s.first === z.start; }),
     '形状记的「起始编号」跟着分区一起挪了（不会指着旧号）');
  /* 4) 灯总数 / 别的分区 / 校验页 */
  ok(st1.meta.ledCount === lc0 - len, `灯总数跟着减：${lc0} → ${st1.meta.ledCount}`);
  const zBefore = z0.filter(z => z.start < a0), zAfter = z0.filter(z => z.start >= a1);
  ok(zBefore.every(z => (st1.zones.find(o => o.id === z.id) || {}).start === z.start),
     `删掉这一段前面的分区 start 一点没动（${zBefore.map(z => z.start).join(', ')}）`);
  ok(zAfter.every(z => (st1.zones.find(o => o.id === z.id) || {}).start === z.start - len),
     `后面的分区 start 一起往前挪 ${len} 位（${zAfter.map(z => z.start + '→' + (z.start - len)).join(', ')}）`);
  ok(!st1.zones.some(o => o.start + o.count > st1.meta.ledCount) && st1.leds.length === st1.meta.ledCount,
     '剩下的分区不越界、灯数与灯总数一致（校验页不会为这个红一屏）');
  const cs1 = codes(st1).filter(c => c !== 'OK');
  ok(!cs1.some(c => ['V1', 'V2', 'V3', 'V3b', 'V4', 'V5', 'V9'].includes(c)),
     `删完不冒出缺号/未归属/重复那些（剩下: ${cs1.join(', ') || '无'}）`);
  const added = issues(st1).filter(c => !issues0.includes(c));
  ok(added.length === 0,
     `删分区没让校验页多出新的告警/错误（删前 ${issues0.join(', ') || '无'}；删后 ${issues(st1).join(', ') || '无'}）`);
  /* 5) 状态栏照实说（含「整段收走 / 挪了几位 / 灯总数」） */
  const sm = byId.get('status').textContent;
  ok(/整段收走/.test(sm) && new RegExp(`往前挪了 ${len} 位`).test(sm) && new RegExp(`灯总数 ${lc0} → ${lc0 - len}`).test(sm),
     `状态栏说清了连带删了什么（"${sm.slice(0, 56)}…"）`);

  /* 6) Ctrl+Z：灯 / 分区 / 形状 / 灯总数 全回来 */
  key({ key: 'z', ctrlKey: true });
  await wait();
  const st2 = cur();
  ok(st2.zones.length === z0.length && nums(st2).length === n0 && st2.meta.ledCount === lc0 &&
     (st2.shapes || []).length === sh0,
     `Ctrl+Z 撤销后：分区 ${st2.zones.length}、灯 ${nums(st2).length}、形状 ${(st2.shapes || []).length}、` +
     `灯总数 ${st2.meta.ledCount}（全带回来了）`);
  ok(st2.zones[k].id === dz.id && st2.zones[k].start === a0 && st2.zones[k].count === len,
     '撤销后那个分区的 id / start / count 原样');
  ok((st2.shapes || []).some(s => s.zone === dz.id), '撤销后挂在它身上的形状也回来了');

  byId.get('btnNew').onclick();                          /* 收尾：恢复干净预设给后面的用例 */
  await wait();
  ok(cur().zones.length === 5 && nums(cur()).length === 104, '收尾：预设已复原（5 分区 / 104 灯）');
  globalThis.confirm = () => true;
}

console.log(fails?`\n=== ${fails} 项未通过 ===`:'\n=== 全部通过 ===');
process.exit(fails?1:0);
