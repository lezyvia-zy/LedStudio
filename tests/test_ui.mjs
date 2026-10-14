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
  const moved = ['mName','mLedCount','mLedTrim','gX0','gW','gDir','gK','gApply','cX','cR','cApply','qDir','qApply','bgFile','bgAlign','bgClear'];
  const miss = moved.filter(id => !zonesPane.includes('id="' + id + '"'));
  ok(miss.length === 0, miss.length ? `这些控件没搬进「分区」页: ${miss.join(', ')}`
                                    : `板级参数 / 铺灯 / 底图的 ${moved.length} 个控件都在「分区」页里`);
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
const CTX = new Proxy({}, { get:(t,k)=> (k in t ? t[k] : (t[k] = ()=>{})) , set:(t,k,v)=>{ t[k]=v; return true; } });

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
                      '#left button[data-mode]': [], '.pane': [...html.matchAll(/data-pane="([a-z]+)"/g)].map(m=>m[1]) };
globalThis.document = {
  documentElement:{attrs:{},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]||null;}},
  querySelector:q,
  querySelectorAll(sel){
    if (sel === '#left button[data-mode]') return (byId.get('left')?.children || []);
    /* 同一批静态节点要缓存 —— 真实 DOM 每次返回的就是同一批元素，boot 时绑的 onclick 才留得住 */
    if (staticBoxes[sel]) {
      if (!boxCache.has(sel))
        boxCache.set(sel, staticBoxes[sel].map(v => { const e = mkEl('button'); e.dataset = { tab:v, pane:v, mode:v }; return e; }));
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
  /* 周长放宽，确保拦截点只在「覆盖确认」这一处 */
  const gw = byId.get('gW'), gh = byId.get('gH');
  gw.value = '20'; gw.oninput({ target: gw });
  gh.value = '20'; gh.oninput({ target: gh });

  go('zones');
  rows()[3].onclick();                       /* 环 A：号段上还有原排布留下的灯 */
  const before = leds();

  confirmCalls.length = 0;
  globalThis.confirm = m => { confirmCalls.push(m); return false; };
  byId.get('gApply').onclick();
  await new Promise(r => setTimeout(r, 700));
  ok(confirmCalls.length === 1 && /已经有 \d+ 颗灯/.test(confirmCalls[0]),
     `铺灯前先把「要覆盖多少颗」问清楚: "${String(confirmCalls[0]).split('\n')[0]}"`);
  ok(/重铺/.test(confirmCalls[0]) && /撤销/.test(confirmCalls[0]),
     '确认框说明了会发生什么、能不能撤销');
  ok(leds() === before, `点「取消」一颗灯都不动（仍 ${leds()} 颗）`);
  ok(/已取消/.test(byId.get('status').textContent),
     `状态栏说明已取消: "${byId.get('status').textContent}"`);

  globalThis.confirm = m => { confirmCalls.push(m); return true; };
  byId.get('gApply').onclick();
  await new Promise(r => setTimeout(r, 700));
  ok(confirmCalls.length === 2, '再点一次仍然先问（每次都问，不设「别再问了」）');
  ok(/已铺设/.test(byId.get('status').textContent),
     `确认之后才真铺: "${byId.get('status').textContent}"`);

  /* 号段上没有灯 → 直接铺，不打扰 */
  confirmCalls.length = 0;
  rows()[0].onclick();                       /* 第 1 个分区已挪到 115.. 上，没有灯 */
  byId.get('gApply').onclick();
  await new Promise(r => setTimeout(r, 700));
  ok(confirmCalls.length === 0, '号段上本来没有灯 → 不弹确认框，直接铺');
  ok(/已铺设/.test(byId.get('status').textContent),
     `直接铺成功: "${byId.get('status').textContent}"`);
  globalThis.confirm = () => true;
}

console.log(fails?`\n=== ${fails} 项未通过 ===`:'\n=== 全部通过 ===');
process.exit(fails?1:0);
