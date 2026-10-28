/* 假 DOM：把界面层脚本真正跑一遍，捕捉 boot 期的运行错误与失效的选择器 */
import fs from 'node:fs';
const html = fs.readFileSync('led_layout_editor.html','utf8');

/* 省时：界面脚本里「等一等」的定时器（400ms 自动保存防抖、700/900ms 闪烁清除）整轮测试
 * 要等上百次，纯睡掉两分钟。这里只改「多久之后」，压到 40ms；测试自己的 wait 用真定时器
 * 70ms（40 < 70，落地顺序不变）。3200/6000ms 的状态栏自动清除**不压** —— 有断言依赖它
 * 「这时还看得见」。被测代码一字不动。 */
const realST = globalThis.setTimeout;
const FAST_MS = { 400: 40, 700: 40, 900: 40 };
globalThis.setTimeout = (fn, ms = 0, ...a) => realST(fn, FAST_MS[ms] || ms, ...a);
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
let ctxDraw = 0;
const CTX = new Proxy({}, { get:(t,k)=> (k in t ? t[k] : (t[k] = ()=>{ ctxDraw++; })), set:(t,k,v)=>{ t[k]=v; return true; } });

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


/* ============ 本文件专测：动画播放的项目独立性 + 单步/归零 ============ */

/* ---- A) 单步 / 归零 必须真的动，并且真的重绘画布 ---- */
const litNums = () => byId.get('fixDiag').innerHTML.replace(/<[^>]+>/g, '');
byId.get('aFix').checked = false; byId.get('aFix').onchange();     /* 关掉修正，观察原始编号 */
const a0 = litNums();
ctxDraw = 0;
byId.get('aReset').onclick();
ok(ctxDraw > 0, `「归零」重绘了画布（ctx 调用 ${ctxDraw} 次）`);

ctxDraw = 0;
for (let i = 0; i < 3; i++) byId.get('aStep').onclick();
const a1 = litNums();
ok(ctxDraw > 0, `「单步」重绘了画布（ctx 调用 ${ctxDraw} 次）`);
ok(a0 !== a1, '「单步」推进了动画（点亮编号发生变化）');
console.log('   归零后: ' + a0.replace(/修正[^：]*：/, ''));
console.log('   单步x3: ' + a1.replace(/修正[^：]*：/, ''));

byId.get('aReset').onclick();
ok(litNums() === a0, '「归零」把动画复位回起始状态');

/* ---- A3) 导出当前帧：直接存画布（不重绘、不改参数），并给状态栏反馈 ---- */
ok(!!(byId.get('btnFramePng') || {}).onclick, '动画页有「导出当前帧」按钮且已接线');
ctxDraw = 0;
byId.get('btnFramePng').onclick();
ok(ctxDraw === 0, '「导出当前帧」不重绘画布（存的正是此刻这一帧）');
ok(/已导出当前帧/.test(byId.get('status').textContent),
   `「导出当前帧」状态栏反馈: "${byId.get('status').textContent}"`);

/* ---- B) 播放状态必须按项目独立 ---- */
const rows = () => (byId.get('projList') || {}).children || [];
const animOf = i => JSON.parse(store.get('led_layout_editor.v1')).projects[i].state.anim;

/* 在项目 0 上开始播放 */
ok(byId.get('aPlay').textContent === '播放', `项目0 初始按钮: "${byId.get('aPlay').textContent}"`);
byId.get('aPlay').onclick();
await new Promise(r => realST(r, 70));
ok(byId.get('aPlay').textContent === '暂停', `项目0 点播放后按钮: "${byId.get('aPlay').textContent}"`);
ok(animOf(0).playing === true, '项目0 已记录 playing = true');

/* 新建空白项目 → 它必须是「未播放」，不能被项目0 带着跑 */
byId.get('btnProjNew').onclick();
await new Promise(r => realST(r, 70));
ok(animOf(1).playing === false, '新建的项目 playing = false（没有跟着项目0 一起放）');
ok(byId.get('aPlay').textContent === '播放', `切到新项目后按钮: "${byId.get('aPlay').textContent}"`);

/* 在新项目上播放，不能影响项目0 */
byId.get('aPlay').onclick();
await new Promise(r => realST(r, 70));
ok(animOf(1).playing === true, '新项目已记录 playing = true');
ok(animOf(0).playing === true, '项目0 的播放状态未被改动');

/* 切回项目0：应当接着放（按钮是「暂停」） */
rows()[0].onclick();
await new Promise(r => setTimeout(r, 100));
ok(byId.get('aPlay').textContent === '暂停', `切回项目0 按钮: "${byId.get('aPlay').textContent}"（记得住）`);

/* 在项目0 上暂停，不能影响新项目 */
byId.get('aPlay').onclick();
await new Promise(r => realST(r, 70));
ok(animOf(0).playing === false, '项目0 已暂停');
ok(animOf(1).playing === true, '新项目仍在播放（互不影响）');

/* ---- C) 选中的效果也应各项目独立（#aPreset 现在装的是效果 id，不是预设下标）---- */
const pre = byId.get('aPreset');
const optIds = (pre.children || []).map(o => o.value);
ok(optIds.length === 9, `下拉有 ${optIds.length} 项（来自本项目的模式表）`);
const pick = optIds[5];
pre.value = pick; pre.onchange();
await new Promise(r => realST(r, 70));   /* 等自动保存的 400ms 防抖 */
ok(animOf(0).modeId === pick, `项目0 选中模式改成 ${animOf(0).modeId}`);
rows()[1].onclick();
await new Promise(r => setTimeout(r, 100));
const id1 = animOf(1).modeId;
ok(id1 !== pick, `切到新项目后选中的是它自己的模式 ${id1}（没有被带过去）`);
ok(pre.value === id1, `面板已同步成新项目的选中模式: ${pre.value}`);
rows()[0].onclick();
await new Promise(r => setTimeout(r, 100));
ok(pre.value === pick, '切回项目0 又回到它自己选的模式');


/* ---- D) 速度档 / 音乐音量（FFTLevel）→ 快慢档的接线与存盘 ---- */
const spd = byId.get('aSpeed'), aud = byId.get('aAudio');
const fft = byId.get('aFft'), ftxt = byId.get('aFftTxt');
/* 手动档：滑杆与按钮都灰掉，读数是「手动 …」 */
spd.value = 'slow'; spd.onchange();
await new Promise(r => setTimeout(r, 100));
ok(fft.disabled === true && aud.disabled === true, '手动慢/快档时音量滑杆与「音乐来了」都灰掉');
ok(/手动/.test(ftxt.textContent), `手动档读数：${ftxt.textContent}`);

/* 自动档：音量 0 = 慢档 */
spd.value = 'auto'; spd.onchange();
await new Promise(r => realST(r, 70));
ok(animOf(0).speed === 'auto', '速度档改成了 auto');
ok(fft.disabled === false && aud.disabled === false, '自动档下音量滑杆与「音乐来了」都可用');
fft.value = '0'; fft.oninput();
ok(/慢档/.test(ftxt.textContent), `音量 0 → 慢档：${ftxt.textContent}`);
/* 阈值边界：4 还是慢、5 就快（固件判的是「大于」LED_FFT_THRESHOLD，不是大于等于） */
fft.value = '4'; fft.oninput();
ok(/慢档/.test(ftxt.textContent), `音量 4（= 阈值）还是慢档：${ftxt.textContent}`);
fft.value = '5'; fft.oninput();
ok(/快档/.test(ftxt.textContent), `音量 5（> 阈值）切快档：${ftxt.textContent}`);
await new Promise(r => realST(r, 70));      /* 等自动保存落地（animOf 读的是存档快照） */
ok(animOf(0).fft === 5, `音量 5 也存进了存档（fft = ${animOf(0).fft}）`);

/* 端到端：单步「前进几个节拍」= 当前档位（该效果自己的 slow / fast） */
fft.value = '0'; fft.oninput();
byId.get('aStep').onclick();
const stepSlow = byId.get('status').textContent;
fft.value = '120'; fft.oninput();
byId.get('aStep').onclick();
const stepFast = byId.get('status').textContent;
const nSlow = +((stepSlow.match(/前进 (\d+) 个/) || [])[1] || 0);
const nFast = +((stepFast.match(/前进 (\d+) 个/) || [])[1] || 0);
ok(nSlow > 1 && nFast === 1,
   `单步节拍数跟着音量档位走：慢档 ${nSlow} 拍 / 快档 ${nFast} 拍（「${stepSlow}」/「${stepFast}」）`);

/* 「音乐来了」= 让音量自己跳（档位仍由音量决定，不再是一个布尔直接切快档） */
aud.onclick();
await new Promise(r => realST(r, 70));
ok(animOf(0).audio === true, '「音乐来了」状态存住了（audio = true）');
ok(aud.classList.contains('on') && /随机跳/.test(aud.textContent), `按钮已按下: "${aud.textContent}"`);
/* 关掉 = 取消注射，音量回到 0（用户：「再次点击就取消，默认输入的是 0」） */
aud.onclick();
await new Promise(r => realST(r, 70));
ok(animOf(0).audio === false && animOf(0).fft === 0,
   `再点一下停（audio = false，音量回到 ${animOf(0).fft}）`);

/* ---- E) 音乐阈值可调：滑杆上的针 + 末尾的「阈」格 ---- */
console.log('--- 音乐阈值（滑杆针 / 阈格）---');
const thrIn = byId.get('aThr'), thrPin = byId.get('aThrPin');
ok(!!thrIn && !!thrPin && thrIn.value === '4' && /%/.test(thrPin.style.left || ''),
   `阈值控件都在：格子里 ${thrIn && thrIn.value}、针在 ${thrPin && thrPin.style.left}`);
thrIn.value = '10'; thrIn.oninput();
fft.value = '5'; fft.oninput();
ok(/慢档/.test(ftxt.textContent), `阈值改成 10 后，音量 5 是慢档：${ftxt.textContent}`);
fft.value = '11'; fft.oninput();
ok(/快档/.test(ftxt.textContent), `音量 11（> 阈值 10）才快档：${ftxt.textContent}`);
await new Promise(r => realST(r, 70));
ok(animOf(0).thr === 10, `阈值存进存档（thr = ${animOf(0).thr}）`);
/* 拖针：假 DOM 的滑杆 1200px 宽，指到正中间 → 约 128 */
const pinDown = (listeners['aThrPin:pointerdown'] || [])[0];
ok(typeof pinDown === 'function', '阈值针挂了 pointerdown（拖得动）');
pinDown({ clientX: 600, pointerId: 1, preventDefault(){} });
await new Promise(r => realST(r, 70));
ok(animOf(0).thr >= 9 && animOf(0).thr <= 11, `拖到滑杆中间 → 阈值 ${animOf(0).thr}（0..20 刻度的中间 ≈10）`);
const pinMove = (listeners['aThrPin:pointermove'] || [])[0];
pinMove({ clientX: -9999 });
await new Promise(r => realST(r, 70));
ok(animOf(0).thr === 0 && thrIn.value === '0', `拖到最左 → 阈值 0（格子跟着写 ${thrIn.value}）`);
/* 拖到最右 = 255：只有满音量才算「有音乐」 */
pinMove({ clientX: 99999 });
await new Promise(r => realST(r, 70));
ok(animOf(0).thr === 20, `拖到最右 → 阈值 ${animOf(0).thr}（夹在 0..20）`);

/* ---- F) 快档阻尼（450 → 460ms，向上取整；采样固定 40ms，工具不暴露）---- */
console.log('--- 快档阻尼 ---');
const hldIn = byId.get('aHold'), stTxt = byId.get('aStageTxt');
ok(!!hldIn && !byId.get('aSample') && hldIn.value === '450' && /460 ms/.test(stTxt.textContent),
   `只有「阻尼」一格（采样固定 40ms 不暴露）：${hldIn && hldIn.value} → 读数 ${stTxt.textContent}`);
hldIn.value = '0'; hldIn.oninput();
await new Promise(r => realST(r, 70));
ok(animOf(0).stageHoldMs === 0 && /^0 ms$/.test(stTxt.textContent),
   `阻尼 = 0（不保持）→ 读数 ${stTxt.textContent}`);
hldIn.value = '450'; hldIn.oninput();
await new Promise(r => realST(r, 70));
ok(animOf(0).stageHoldMs === 450 && /460 ms/.test(stTxt.textContent),
   `阻尼填 450ms → 向上取整 23 拍，读数 ${stTxt.textContent}`);
ok(animOf(0).audioSampleMs === 40, `采样周期固定 40ms（存在工程里、随导出写进 C）`);

spd.value = 'slow'; spd.onchange();
await new Promise(r => setTimeout(r, 100));
ok(thrIn.disabled === true && thrPin.classList.contains('off') && aud.disabled === true,
   '回手动档后阈值格 / 针 / 「音乐来了」都灰掉（那时档位是手选的，阈值不起作用）');


console.log(fails?`\n=== ${fails} 项未通过 ===`:'\n=== 全部通过 ===');
process.exit(fails?1:0);
