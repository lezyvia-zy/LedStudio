/* 导出窗口：独立弹窗（入口 / 三页签 / 选保存路径 / 回退下载 / 取消 / 拖动 / Esc） */
import fs from 'node:fs';
const html = fs.readFileSync('led_layout_editor.html','utf8');
const coreSrc = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
const uiSrc   = html.match(/<script id="ui">([\s\S]*?)<\/script>/)[1];
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};

/* ---- 1) 静态结构：独立窗口，不在右侧栏面板里 ---- */
{
  const rs = html.indexOf('<aside id="right">'), re = html.indexOf('</aside>', rs);
  const rightHtml = html.slice(rs, re);
  ok(ids.has('exportDlg') && ids.has('exportMask'), '有导出窗口容器与遮罩');
  ok(!/id="exportDlg"/.test(rightHtml), '导出窗口在 #right 之外（不占面板、不吃画布）');
  const dlgCss = (html.match(/\.dlg\{[^}]*\}/) || [''])[0].replace(/\s+/g,' ');
  ok(/position:fixed/.test(dlgCss) && /resize:both/.test(dlgCss) && /min-width/.test(dlgCss),
     '窗口是浮层、可拉伸、有最小尺寸: ' + dlgCss.slice(0, 90));
  const tipZ = +(html.match(/#tipBox\{[^}]*z-index:(\d+)/) || [])[1];
  const maskZ = +(html.match(/\.dlgMask\{[^}]*z-index:(\d+)/) || [])[1];
  ok(tipZ > maskZ, `说明框 z-index(${tipZ}) 高于窗口遮罩(${maskZ})：窗口里的 data-tip 不会被挡`);
  ['expOpenFx','expOpenTable','btnJson','expTabFx','expTabTable','expTabJson','expDrag',
   'expClose','expCopy','expSave','expTitle','expSub','xOut','eOut','jOut','xWarn','eWarn']
    .forEach(id => ok(ids.has(id), `有元素 #${id}`));
  ok(!ids.has('xCopy') && !ids.has('eCopy'), '窄面板时代的两个「复制」按钮已并成窗口里的一个');
  ok(/id="xForm"[\s\S]{0,400}?data-tip=/.test(html), '搬进窗口的「形式」下拉仍带说明');
  ok(!/第 4 节/.test(html), '提示文案不再引用过期的「第 4 节」（E2：补丁清单现在在 docs/firmware-contract.md 第二节）');
}

/* ---- 2) 假 DOM ---- */
const listeners = {};
const byId = new Map();
const boxCache = new Map();
const store = new Map();
let anchors = [];                        /* 记录 createElement('a')：用来断言回退下载的文件名 */
const CTX = new Proxy({}, { get:(t,k)=> (k in t ? t[k] : (t[k] = ()=>{})) , set:(t,k,v)=>{ t[k]=v; return true; } });
function mkEl(tag='div', id=''){
  return {
    tagName:(tag||'div').toUpperCase(), id, style:{}, dataset:{}, checked:false,
    get value(){ return this._v === undefined ? '' : this._v; },
    set value(v){ this._v = String(v); },
    textContent:'', disabled:false, files:[], clientWidth:1280, clientHeight:900, width:1280, height:900,
    get innerHTML(){ return this._html || ''; },
    set innerHTML(v){ this._html = v; if (v === '') this._ch = []; },
    get children(){ return this._ch ||= []; }, set children(v){ this._ch = v; },
    get className(){ return this._cn !== undefined ? this._cn : [...this.classList._s].join(' '); },
    set className(v){ this._cn = v; this.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); },
    classList:{ _s:new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);},
      toggle(c,f){ f===undefined ? (this._s.has(c)?this._s.delete(c):this._s.add(c)) : (f?this._s.add(c):this._s.delete(c)); },
      contains(c){ return this._s.has(c); } },
    appendChild(c){ if (c && c.id) byId.set(c.id, c); this.children.push(c); return c; },
    insertBefore(c){ if (c && c.id) byId.set(c.id, c); this.children.unshift(c); return c; },
    get firstChild(){ return this.children[0] || null; },
    remove(){}, focus(){}, select(){}, click(){ if (this.onclick) this.onclick(); },
    setPointerCapture(){}, getBoundingClientRect(){ return { left:0, top:0, width:1280, height:900 }; },
    addEventListener(t,f){ (listeners[id+':'+t] ||= []).push(f); },
    getContext(){ return CTX; },
    toBlob(cb){ cb({}); },
    set src(v){ this._src = v; }, get src(){ return this._src; },
  };
}

function install(){
  for (const k of Object.keys(listeners)) delete listeners[k];
  byId.clear(); boxCache.clear(); anchors = [];
  globalThis.localStorage = { getItem:k => store.has(k)?store.get(k):null, setItem:(k,v)=>{store.set(k,v);}, removeItem:k=>store.delete(k) };
  globalThis.performance = globalThis.performance || { now:()=>Date.now() };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.devicePixelRatio = 1;
  globalThis.Image = class { set src(v){ this._s=v; } get src(){ return this._s; } };
  globalThis.FileReader = class { readAsText(){} readAsDataURL(){} };
  /* 假 Blob 记下内容，便于断言「写进文件里的到底是什么」 */
  globalThis.Blob = class { constructor(parts, opt){ this.parts = parts; this.type = opt && opt.type; } };
  globalThis.URL = { createObjectURL:()=>'blob:x', revokeObjectURL(){} };
  try { Object.defineProperty(globalThis,'navigator',{value:{clipboard:{writeText:()=>Promise.resolve()}},configurable:true}); } catch(e){}
  globalThis.alert = ()=>{}; globalThis.confirm = ()=>true; globalThis.prompt = (m,d)=>d||'X';
  const q = sel => { if (sel.startsWith('#')) { const id = sel.slice(1);
      if (byId.has(id)) return byId.get(id);
      if (!ids.has(id)) return null;
      byId.set(id, mkEl('div', id)); return byId.get(id); }
    if (!byId.has('body')) byId.set('body', mkEl('body','body'));
    return byId.get('body'); };
  const staticBoxes = { '#tabs button': [...html.matchAll(/data-tab="([a-z]+)"/g)].map(m=>m[1]),
                        '.pane': [...html.matchAll(/data-pane="([a-z]+)"/g)].map(m=>m[1]) };
  globalThis.document = {
    documentElement:{ attrs:{}, setAttribute(k,v){this.attrs[k]=v;}, getAttribute(k){return this.attrs[k]||null;} },
    querySelector: q,
    querySelectorAll(sel){
      if (sel === '#left button[data-mode]') return (byId.get('left') && byId.get('left').children) || [];
      if (staticBoxes[sel]) {
        if (!boxCache.has(sel))
          boxCache.set(sel, staticBoxes[sel].map(v => { const e = mkEl('button'); e.dataset = { tab:v, pane:v, mode:v }; return e; }));
        return boxCache.get(sel);
      }
      return [];
    },
    createElement: t => { const e = mkEl(t,''); if (e.tagName === 'A') anchors.push(e); return e; },
    body:{ appendChild(){}, },
    addEventListener(){},
    execCommand(){ return true; },
  };
  globalThis.window = { addEventListener(t,f){ (listeners['window:'+t] ||= []).push(f); },
                        devicePixelRatio:1, innerWidth:1280, innerHeight:800,
                        requestAnimationFrame: globalThis.requestAnimationFrame };
  globalThis.addEventListener = globalThis.window.addEventListener;
}
async function boot(){
  let err = null;
  try { new Function(coreSrc + '\n' + uiSrc)(); } catch(e){ err = e; }
  await new Promise(r => setTimeout(r, 700));      /* 等自动保存的防抖落地 */
  return err;
}
const fireWin = (type, e) => (listeners['window:'+type] || []).forEach(f => f(e));
const dlg  = () => byId.get('exportDlg');
const mask = () => byId.get('exportMask');
const txt  = id => (byId.get(id) || {}).textContent || '';
/* 假的系统「另存为」：把写进去的东西记下来 */
function fakePicker(){
  const rec = { opts:null, chunks:[] };
  globalThis.window.showSaveFilePicker = async o => {
    rec.opts = o;
    return { name: o.suggestedName,
             createWritable: async () => ({ write: async b => { rec.chunks.push(b); }, close: async () => {} }) };
  };
  return rec;
}

/* ---- 3) 启动：窗口默认关着 ---- */
install();
let bootErr = await boot();
ok(!bootErr, bootErr ? `启动抛错: ${bootErr.message}` : '界面层启动无异常');
ok(dlg() && !dlg().classList.contains('on'), '启动时导出窗口是收起来的（不占界面）');
ok(mask() && !mask().classList.contains('on'), '遮罩也是收起来的');
ok(!byId.has('xOut') || !byId.get('xOut').value, '没打开窗口就不算导出内容（惰性，白算没意义）');

/* ---- 4) 从「导出」页签的入口打开 ---- */
byId.get('expOpenFx').onclick();
ok(dlg().classList.contains('on') && mask().classList.contains('on'), '点「动效头文件…」打开窗口（连遮罩）');
ok(dlg().style.width === '1000px' && /^\d+px$/.test(dlg().style.left),
   `窗口居中且不铺满: ${dlg().style.width} @ left ${dlg().style.left}`);
ok(/led_effects_gen|LED_EFX|#ifndef/.test(byId.get('xOut').value), '窗口里已经生成动效头文件内容');
ok(byId.get('eOut').classList.contains('hide') && byId.get('jOut').classList.contains('hide'),
   '另外两页的预览先收起来（一次只看一样）');
ok(txt('expTitle').includes('动效') && txt('expSub').includes('bt_audio_app_src'),
   `标题栏说明了当前导的是什么: ${txt('expTitle')} / ${txt('expSub')}`);
ok(/导出窗口已打开/.test(txt('status')), `状态栏给了反馈: "${txt('status')}"`);

/* ---- 5) 三个页签各自算自己的内容 ---- */
byId.get('expTabTable').onclick();
ok(!byId.get('eOut').classList.contains('hide') && byId.get('xOut').classList.contains('hide'),
   '切到「排布表 C」：只显示排布表那份');
ok(/g_default_zones|reverse/.test(byId.get('eOut').value), '排布表内容已生成');
byId.get('expTabJson').onclick();
{
  const j = JSON.parse(byId.get('jOut').value);
  ok(j.format === 'ledboard' && Array.isArray(j.leds) && j.leds.length === 104,
     `工程 JSON 预览可用（format=ledboard，${j.leds.length} 颗灯）`);
  ok(!byId.get('expJsonHint').classList.contains('hide'), 'JSON 页显示了「保存后怎么载入」的提示');
}

/* ---- 6) 「保存到文件…」：有系统选择器时就自己选路径 ---- */
{
  byId.get('expTabFx').onclick();
  const rec = fakePicker();
  await byId.get('expSave').onclick();
  ok(rec.opts && rec.opts.suggestedName === 'led_effects_gen.h',
     `另存为的默认文件名: ${rec.opts && rec.opts.suggestedName}`);
  ok(rec.opts.types[0].accept['text/plain'].includes('.h'), '配了 .h 的类型过滤器（选择框里默认看得到头文件）');
  ok(rec.chunks.length === 1 && String(rec.chunks[0].parts[0]).includes('#ifndef'),
     '写进文件的内容就是窗口里看到的头文件');
  ok(/已保存/.test(txt('status')), `状态栏报出结果: "${txt('status')}"`);
}

/* ---- 7) 排布表 / JSON 各有各的文件名与过滤器 ---- */
{
  byId.get('expTabTable').onclick();
  const rec = fakePicker();
  await byId.get('expSave').onclick();
  ok(/^SP-3122D.*_g_default_zones\.c$/.test(rec.opts.suggestedName),
     `排布表文件名带项目名: ${rec.opts.suggestedName}`);
  byId.get('expTabJson').onclick();
  const rec2 = fakePicker();
  await byId.get('expSave').onclick();
  ok(/^SP-3122D.*\.json$/.test(rec2.opts.suggestedName) && !!rec2.opts.types[0].accept['application/json'],
     `JSON 走 application/json 过滤器: ${rec2.opts.suggestedName}`);
}

/* ---- 8) 没有系统选择器 → 退回下载，并在状态栏说清楚 ---- */
{
  delete globalThis.window.showSaveFilePicker;
  byId.get('expTabFx').onclick();
  anchors = [];
  await byId.get('expSave').onclick();
  const a = anchors[anchors.length - 1];
  ok(a && a.download === 'led_effects_gen.h', `退回下载，文件名 ${a && a.download}`);
  ok(/不能选保存路径|下载/.test(txt('status')), `状态栏解释了替代方案: "${txt('status')}"`);
}

/* ---- 9) 用户在系统对话框里点「取消」：不写文件也不下载 ---- */
{
  globalThis.window.showSaveFilePicker = async () => { const e = new Error('cancel'); e.name = 'AbortError'; throw e; };
  anchors = [];
  const r = await byId.get('expSave').onclick();
  ok(r === false, '取消保存返回 false（调用方知道没存成）');
  ok(/已取消/.test(txt('status')), `状态栏说明是取消: "${txt('status')}"`);
  ok(anchors.length === 0, '取消时不会偷偷下载一份');
}

/* ---- 10) 「保存 .h…」按钮走同一条路 ---- */
{
  const rec = fakePicker();
  byId.get('xDownload').onclick();
  await new Promise(r => setTimeout(r, 0));
  ok(rec.opts && rec.opts.suggestedName === 'led_effects_gen.h', '「保存 .h…」也会弹选择路径');
}

/* ---- 11) PNG 也走「另存为」，且是先拿选择器再编码 ---- */
{
  const rec = fakePicker();
  byId.get('btnPng').onclick();
  await new Promise(r => setTimeout(r, 0));
  ok(/\.png$/.test(rec.opts.suggestedName), `PNG 用同一套保存流程: ${rec.opts.suggestedName}`);
  ok(!!rec.opts.types[0].accept['image/png'], 'PNG 有 image/png 过滤器');
  ok(rec.chunks.length === 1, 'PNG 数据写进去了（假 canvas 的 toBlob 直接回调）');
}

/* ---- 12) 关窗口：按钮 / 遮罩 / Esc ---- */
{
  const isOn = () => dlg().classList.contains('on');
  byId.get('expClose').onclick();
  ok(!isOn() && !mask().classList.contains('on'), '「关闭」按钮关掉窗口与遮罩');
  byId.get('expOpenFx').onclick();
  byId.get('exportMask').onclick();
  ok(!isOn(), '点窗口外面（遮罩）也能关');
  byId.get('expOpenFx').onclick();
  fireWin('keydown', { key:'Escape', target:{ tagName:'BODY' }, preventDefault(){} });
  ok(!isOn(), 'Esc 关掉导出窗口');
  let threw = false;
  try { fireWin('keydown', { key:'Escape', target:{ tagName:'BODY' }, preventDefault(){} }); } catch (e) { threw = true; }
  ok(!threw, '窗口已经关着时再按 Esc 不报错');
  /* Esc 不能影响别处：编辑器里按 Esc 仍然什么都不做 */
  ok(byId.get('exportDlg') && !isOn(), '关掉后 DOM 里窗口还是那个（下次直接复用）');
}

/* ---- 13) 拖动标题栏：能拖、拖不出屏幕、点按钮不误拖 ---- */
{
  const fire = (t, e) => (listeners['expDrag:' + t] || []).forEach(f => f(e));
  byId.get('expOpenFx').onclick();
  const before = dlg().style.left;
  fire('pointerdown', { target:{ tagName:'DIV' }, clientX:400, clientY:300, pointerId:1, preventDefault(){} });
  fire('pointermove', { clientX:520, clientY:380 });
  fire('pointerup', {});
  ok(dlg().style.left === '120px' && dlg().style.top === '80px',
     `按住标题栏拖动生效: left=${dlg().style.left} top=${dlg().style.top}`);
  ok(dlg().style.left !== before, '位置确实变了（不再是居中那个点）');
  const l0 = dlg().style.left;
  fire('pointerdown', { target:{ tagName:'BUTTON' }, clientX:400, clientY:300, pointerId:2, preventDefault(){} });
  fire('pointermove', { clientX:900, clientY:600 });
  fire('pointerup', {});
  ok(dlg().style.left === l0, '标题栏上的按钮（关闭）不会误触发拖动');
  fire('pointerdown', { target:{ tagName:'DIV' }, clientX:99999, clientY:99999, pointerId:3, preventDefault(){} });
  fire('pointermove', { clientX:99999, clientY:99999 });
  fire('pointerup', {});
  ok(/^\d+px$/.test(dlg().style.left) && parseInt(dlg().style.left, 10) <= 1280 - 80,
     `拖到屏幕外会被夹住，不会拖丢: left=${dlg().style.left}`);
  byId.get('expClose').onclick();
}

/* ---- 14) 右栏宽度：存档里的超大值会被夹紧（老版本就是这么「铺满整个工具」的） ---- */
{
  store.set('led_layout_editor.rightWidth', '5000');       /* 老版本可能存下的超大值 */
  install();
  const err = await boot();
  ok(!err, '带超大宽度存档也能正常启动');
  ok(byId.get('right').style.flexBasis === '820px',
     `恢复时夹到上限: ${byId.get('right').style.flexBasis}（不再是原样 5000px）`);
  store.set('led_layout_editor.rightWidth', '820');
  install();
  globalThis.window.innerWidth = 900;                      /* 窄窗口 */
  await boot();
  ok(byId.get('right').style.flexBasis === '440px',
     `窄窗口(900)下上限跟着窗口收: ${byId.get('right').style.flexBasis}（老版本仍是 820 = 铺满）`);
  globalThis.window.innerWidth = 1280;
}

/* ---- 15) E1/C3) 校验没通过时导出被红条挡住：默认不生成，点「仍要导出」才放行 ---- */
{
  const zc = byId.get('zCount');
  ok(!!zc, '前置：分区「长度」输入框在（用它造一个 V9 错误）');
  const count0 = zc.value;
  zc.value = '999'; zc.oninput({ target: zc });        /* 0+999 > LED_COUNT → V9（err 级） */
  await new Promise(r => setTimeout(r, 700));

  byId.get('expOpenFx').onclick();
  ok(!byId.get('expErrBar').classList.contains('hide'), '有 err 时导出窗口顶部亮起红条');
  ok(/校验未通过/.test(txt('expErrMsg')) && /V9/.test(txt('expErrMsg')),
     `红条说清了几个错、哪几条: "${txt('expErrMsg')}"`);
  ok(byId.get('xOut').value === '', '默认不生成内容（免得一张「看起来正常」的表贴进固件）');
  ok(!byId.get('expErrGo').classList.contains('hide'), '红条上给了「仍要导出」的出口');

  byId.get('expTabJson').onclick();
  ok(JSON.parse(byId.get('jOut').value).format === 'ledboard', 'JSON 页不受闸门影响（工程越有问题越该先存一份）');
  ok(byId.get('expErrGo').classList.contains('hide'), 'JSON 页不显示「仍要导出」（本来就没拦）');

  byId.get('expTabFx').onclick();
  ok(byId.get('xOut').value === '', '切回动效页仍然被挡住（同一份工程数据）');
  byId.get('expErrGo').onclick();
  ok(/#ifndef|led_effects_gen/.test(byId.get('xOut').value), '点「仍要导出」后照常生成内容');
  ok(!byId.get('expErrBar').classList.contains('hide'), '红条留在原位（问题本身还没修）');

  /* 修好问题 → 闸门自己关上 */
  zc.value = count0; zc.oninput({ target: zc });
  await new Promise(r => setTimeout(r, 700));
  byId.get('expTabFx').onclick();
  ok(byId.get('expErrBar').classList.contains('hide'), '把问题修掉后红条自动收起');
  ok(/#ifndef|led_effects_gen/.test(byId.get('xOut').value), '内容又正常生成了');
  byId.get('expClose').onclick();
}

console.log(fails ? `\n=== ${fails} 项未通过 ===` : '\n=== 全部通过 ===');
process.exit(fails ? 1 : 0);
