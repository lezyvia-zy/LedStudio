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
await new Promise(r => realST(r, 70));
const e0 = fxListOf(0)[0];
ok(e0.kind === 'custom', '槽位 0 已转为自定义');
ok(e0.layers.length === 1 && e0.layers[0].kind === 'spot', `起始图层: ${e0.layers[0].kind}`);
ok(e0.name === '单点追逐/' + CORE.FW.COLOR_NAME[e0.color], `名字保留: ${e0.name}`);

/* ---- 3) 加图层 ---- */
click('fxAddTwinkle');
click('fxAddFill');
await new Promise(r => realST(r, 70));
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
await new Promise(r => realST(r, 70));
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
ok(/^    \{ 1, 0, 0, 0, 1, 255, 0, 0, 0, 0, 0, \d+, 8, 1, 0, 3, 0, 1, 0, \d+, \d+, \d+, \d+, \d+, \d+, \d+, \d+, \d+, \d+ \},/m.test(eb),
   '效果行记录了 layers_count=3: ' + ((eb.match(/^    \{ 1,.*/m) || ['(没找到)'])[0]));

ok(/^    \{ 0, 1, 5, 20, /m.test(out), `图层表第一行 = kind=0(光点), en=1, count=5, width=20: ${(out.match(/^    \{ 0, 1, 5, 20,.*/m) || ['(没找到)'])[0]}`);
ok(byId.get('xWarn').innerHTML.includes('一次性补丁'), '导出时提示要打固件补丁');

/* ---- 6) 关掉工具再打开：自定义动效要还在 ---- */
install(); boot(); await new Promise(r => realST(r, 70));
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
  /* 勾选框紧贴卡片标题：标题不再 flex:1 把方块顶到复制 / ↑ / ↓ / × 那一头（用户实测反馈） */
  ok((head0.children || []).indexOf(cbs[0]) === 1,
     '「启用」方块紧跟标题（卡片头第 2 位），不再贴着小键那一边');
  ok((head0.children || [])[0].tagName === 'B',
     '卡片头顺序没变：标题 → 勾选 → 小键（标题仍是第一个）');

  const off = cbs[0];
  off.checked = false; off.onchange();
  await new Promise(r => realST(r, 70));
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
    await new Promise(r => realST(r, 70));
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
    await new Promise(r => realST(r, 70));
    const e3 = fxListOf(0)[0];
    ok(e3.layers[2].density === 9, `副本第 1 个数值改成 9（${e3.layers[2].density}）`);
    ok(JSON.stringify(e3.layers[1]) === JSON.stringify(e2.layers[1]), '原层没被副本带着改');
  }

  /* 满 8 层时「复制」按钮禁用 */
  for (let k = 0; k < 4; k++) click('fxAddFill');
  await new Promise(r => realST(r, 70));
  const n8 = fxListOf(0)[0].layers.length;
  ok(n8 === 8, `已填到 ${n8} 层`);
  const head8 = headOf(byId.get('fLayers').children[0]);
  const cp8 = (head8.children || []).find(b => b.tagName === 'BUTTON' && b.textContent === '复制');
  ok(cp8 && cp8.disabled === true, '满 8 层时「复制」按钮禁用');
}

/* ---- 6b) F3) 「上移 / 下移」调的是效果顺序，提示别再说成「模式顺序」 ---- */
{
  tabBtn('fx').onclick();
  const before = fxListOf(0).map(e => e.id);
  byId.get('fxTbl').children[0].onclick();
  click('fxDown');
  await new Promise(r => realST(r, 70));
  const after = fxListOf(0).map(e => e.id);
  ok(after[0] === before[1] && after[1] === before[0], '「下移」把前两条效果换了个位');
  ok(/效果顺序已调整/.test(byId.get('status').textContent),
     `提示说的是「效果顺序」: "${byId.get('status').textContent}"`);
  ok(!/模式顺序/.test(byId.get('status').textContent), '不再嘴瓢说成「模式顺序已调整」（F3）');
  click('fxUp');                                  /* 换回原顺序，后面的断言照旧 */
  await new Promise(r => realST(r, 70));
  ok(fxListOf(0).map(e => e.id).join() === before.join(), '「上移」换回原顺序');
}

/* ---- 6c) F4) 删掉被模式引用的效果：先把「谁在用」列清楚，取消就一条不删 ---- */
{
  const st = projState(0);
  const target = st.effects.list[1];
  const users = st.modes.list.filter(m => (m.binds || []).some(b => b.effect === target.id));
  ok(users.length >= 1, `前置：有 ${users.length} 个模式在用「${target.name}」`);

  const calls = [];
  globalThis.confirm = m => { calls.push(m); return false; };
  tabBtn('fx').onclick();
  byId.get('fxTbl').children[1].onclick();
  click('fxDel');
  await new Promise(r => setTimeout(r, 50));
  ok(calls.length === 1 && calls[0].includes(target.name),
     `删除前先问了一句: "${String(calls[0]).split('\n')[0]}"`);
  ok(users.every(m => calls[0].includes(m.name)),
     `确认框列出了引用它的模式名: ${users.map(m => m.name).join('、')}`);
  ok(/（空）/.test(calls[0]),
     '确认框说明了那些绑定会变成「（空）」（不再是静默丢引用）');
  ok(fxListOf(0).length === 9, `点「取消」时效果一条没少（仍 ${fxListOf(0).length} 条）`);

  globalThis.confirm = m => { calls.push(m); return true; };
  click('fxDel');
  await new Promise(r => realST(r, 70));
  ok(fxListOf(0).length === 8, `确认后删掉 1 条（剩 ${fxListOf(0).length} 条）`);
  ok(/已删除效果/.test(byId.get('status').textContent),
     `状态栏给了反馈: "${byId.get('status').textContent.slice(0, 40)}"`);
  ok(/lv-warn/.test(byId.get('status').className), '被人引用的效果被删掉时提示是 warn 级（要留意，不是普通提示）');
  globalThis.confirm = () => true;
}

/* ---- 6d) F2) 效果列表过滤：只影响显示，不动槽位 / 顺序 / 选中 ---- */
{
  tabBtn('fx').onclick();
  await new Promise(r => setTimeout(r, 50));
  const tbl = () => byId.get('fxTbl');
  const infoOf = () => byId.get('fxFilterInfo').textContent;
  const slotsNow = () => fxListOf(0).map(e => e.slot + ':' + e.id).join();
  const filterTo = q => { byId.get('fxFilter').value = q; byId.get('fxFilter').oninput({ target: byId.get('fxFilter') }); };
  const nAll = fxListOf(0).length;
  const custom = fxListOf(0).find(e => e.kind === 'custom');
  const nCustom = fxListOf(0).filter(e => e.kind === 'custom').length;

  ok(!!byId.get('fxFilter'), '效果页有「过滤」输入框');
  ok(/id="fxFilter"[^>]*data-tip="[^"]*只影响显示/.test(html), '过滤框带说明，写明「只影响显示」');
  ok(nAll === 8 && nCustom === 1 && !!custom, `前置：库里 ${nAll} 条（自定义 ${nCustom} 条）`);

  /* 6d-1 按类型过滤：只画自定义那一条；信息栏报数；槽位与顺序一条没动 */
  const before = slotsNow();
  let n0 = tbl().children.length;
  filterTo('自定义');
  ok(tbl().children.length - n0 === nCustom, `过滤「自定义」只画了 ${tbl().children.length - n0} 行（库里自定义 ${nCustom} 条）`);
  ok(new RegExp('^显示 ' + nCustom + ' / 共 ' + nAll + ' 条').test(infoOf()), `信息栏报了「${infoOf()}」`);
  ok(slotsNow() === before, '过滤只动显示：槽位与顺序一条没变');

  /* 6d-2 点过滤后剩的那一行：选中的是它真实的槽位，不是「第几行」 */
  tbl().children[n0].onclick();
  await new Promise(r => realST(r, 70));
  ok(projState(0).anim.effectId === custom.id && byId.get('fName').textContent === custom.name,
     `点过滤后的行选中的还是「${custom.name}」（真实槽位 ${custom.slot}）`);

  /* 6d-3 选中的那条被滤掉：说一声，但选中 / 槽位都不动 */
  n0 = tbl().children.length;
  filterTo('内建');
  ok(/被过滤隐藏/.test(infoOf()), `选中的那条被滤掉时提示了: "${infoOf()}"`);
  ok(projState(0).anim.effectId === custom.id, '过滤不会顺手改选中（state 里还是那条自定义效果）');
  ok(tbl().children.length - n0 === nAll - nCustom, `过滤「内建」画了 ${tbl().children.length - n0} 行`);
  ok(slotsNow() === before, '过滤不碰槽位：和过滤前那一串一模一样');

  /* 6d-4 一条都没匹配：仍给一行说明，别像空表 */
  n0 = tbl().children.length;
  filterTo('zzz没有这个');
  ok(tbl().children.length - n0 === 1, '没匹配时补了一行说明');
  ok(/^显示 0 \/ 共 8 条/.test(infoOf()), `信息栏报「${infoOf()}」`);

  /* 6d-5 清空过滤：全回来，信息栏清掉 */
  n0 = tbl().children.length;
  filterTo('');
  ok(tbl().children.length - n0 === nAll && infoOf() === '', `清空过滤后 ${nAll} 行都回来了，信息栏也清空（"${infoOf()}"）`);

  /* 6d-6 过滤态下「新建」：过滤自动清空，刚建的效果看得见 */
  filterTo('zzz没有这个');
  click('fxAdd');
  await new Promise(r => realST(r, 70));
  const n2 = fxListOf(0).length;
  ok(byId.get('fxFilter').value === '' && n2 === nAll + 1,
     `过滤态点「新建」→ 过滤自动清空，效果加到 ${n2} 条`);
  ok(fxListOf(0).map(e => e.slot).join() === '0,1,2,3,4,5,6,7,8', '新建后槽位仍是 0..8 连号');
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
install(); boot(); await new Promise(r => realST(r, 70));

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

/* ---- 8) 名称自动生成：界面不给改名，规则 =「模板 / 配色」 ---- */
console.log('--- 名称自动生成（模板 / 配色）---');
{
  /* 8a 静态：名称那一格不再是输入框，也没有改名绑定 */
  ok(/<span>名称<\/span><b id="fName"/.test(html) && !/<input[^>]*id="fName"/.test(html),
     '名称这一行是只读展示（<b id="fName">），不再是输入框');
  ok(!/bind\('fName'/.test(uiSrc) && !/\$\('#fName'\)\.value/.test(uiSrc),
     '没有改名字的输入绑定，也没有往 #fName 写 value 的地方');
  ok(/\$\('#fName'\)\.textContent = e\.name/.test(uiSrc), '#fName 的名字由 syncFxEdit 写 textContent');
  ok(/fxEffectName/.test(uiSrc) && /e\.tpl = name/.test(uiSrc),
     '套用模板时把模板名记进 e.tpl（名字的「模板」那一半）');

  /* 8b 重开工具（存档里是上一段迁移出来的老工程：9 条内建） */
  install(); boot(); await new Promise(r => realST(r, 70));
  tabBtn('fx').onclick();
  const L = () => projState(0).effects.list;
  const shown = () => byId.get('fName').textContent;
  const CN = CORE.FW.COLOR_NAME;
  byId.get('fxTbl').children[0].onclick();          /* 槽位 0 = 单点追逐 / 彩虹循环 */
  await new Promise(r => realST(r, 70));
  ok(shown() === L()[0].name && /^单点追逐\//.test(shown()),
     `内建效果显示自动名（不是输入框里的旧值）：${shown()}`);

  /* 8c 改配色 → 「配色」那一半跟着变 */
  const col = byId.get('fColor');
  col.value = String(CORE.FW.COLOR.SOLID);
  col.onchange({ target: col });
  await new Promise(r => realST(r, 70));
  ok(L()[0].name === '单点追逐/' + CN[CORE.FW.COLOR.SOLID] && shown() === L()[0].name,
     `改配色 → 名字立刻跟着变：${L()[0].name}`);

  /* 8d 套用模板 → 「模板」那一半换成模板名 */
  byId.get('fxPresetPick').value = '拖尾彗星';
  click('fxPresetApply');
  await new Promise(r => realST(r, 70));
  ok(L()[0].name === '拖尾彗星/' + CN[CORE.FW.COLOR.SOLID] && shown() === L()[0].name,
     `套「拖尾彗星」→ 名字：${L()[0].name}`);
  ok(L()[0].tpl === '拖尾彗星', `模板名记在 tpl 上（改别的参数、重开工具都认）：${L()[0].tpl}`);

  /* 8e 套完再微调图层参数：名字不跟着抖（「记住模板」的意思） */
  const nums = [];
  (function walk(n) { (n.children || []).forEach(c => {
    if (c.tagName === 'INPUT' && c.type === 'number') nums.push(c); walk(c); }); })(byId.get('fLayers').children[0]);
  nums[1].value = '31'; nums[1].oninput();          /* 光宽 */
  await new Promise(r => realST(r, 70));
  ok(L()[0].layers[0].width === 31 && L()[0].name === '拖尾彗星/' + CN[CORE.FW.COLOR.SOLID],
     `光宽改成 ${L()[0].layers[0].width}，名字仍是「${L()[0].name}」`);

  /* 8f 再改配色 → 名字照样跟着走 */
  col.value = String(CORE.FW.COLOR.SPECTRUM);
  col.onchange({ target: col });
  await new Promise(r => realST(r, 70));
  ok(L()[0].name === '拖尾彗星/' + CN[CORE.FW.COLOR.SPECTRUM], `再改配色 → ${L()[0].name}`);

  /* 8g 「新建」= 没套过模板 → 「自定义 / 配色名」 */
  click('fxAdd');
  await new Promise(r => realST(r, 70));
  const last = L()[L().length - 1];
  ok(last.name === '自定义/' + CN[last.color] && shown() === last.name,
     `新建的效果自动叫：${last.name}（模板那半 = 自定义）`);
  ok(!L().some(e => /副本/.test(e.name)), '库里不再有「… 副本」这类手工名字');
}

console.log(fails ? `\n=== ${fails} 项未通过 ===` : '\n=== 全部通过 ===');
process.exit(fails ? 1 : 0);
