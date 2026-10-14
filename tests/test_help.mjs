/* 悬浮说明 + 帮助页 */
import fs from 'node:fs';
const html = fs.readFileSync('led_layout_editor.html','utf8');
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};

ok(/<button data-tab="help">帮助<\/button>/.test(html), '有「帮助」页签');
ok(/data-pane="help"/.test(html), '有帮助面板');
ok(/id="helpDoc"/.test(html), '帮助文档容器存在');

const doc = html.slice(html.indexOf('id="helpDoc"'), html.indexOf('<input type="file" id="fileJson"'));
/* 章节标题：P1 之后每个 <h3> 都带 id，目录按 id 生成锚点 */
const heads = [...doc.matchAll(/<h3[^>]*>(.*?)<\/h3>/g)].map(m=>m[1]);
const h3Tags = [...doc.matchAll(/<h3[^>]*>/g)].map(m=>m[0]);
const h3Ids  = [...doc.matchAll(/<h3 id="([^"]+)">/g)].map(m=>m[1]);
ok(heads.length >= 7, `帮助文档有 ${heads.length} 个章节: ${heads.join(' / ')}`);
ok(h3Ids.length === h3Tags.length && h3Ids.length === heads.length,
   `${h3Tags.length} 个 <h3> 全部带 id（能当目录锚点）`);
ok(new Set(h3Ids).size === h3Ids.length, `章节 id 互不重复: ${h3Ids.join(', ')}`);
['整体流程','三个概念，别搞混','效果页：图层怎么调','模式页怎么用','导出与固件','常见做法','快捷键']
  .forEach(h => ok(heads.includes(h), `含章节「${h}」`));
ok(doc.includes('光点') && doc.includes('填充') && doc.includes('随机闪') && doc.includes('亮度渐变'),
   '四种图层都有说明');
ok(doc.includes('本层空间色相') && doc.includes('沿环色相跨度'), '空间色相三项有说明');
ok(doc.includes('三角') && doc.includes('方波') && doc.includes('锯齿'), '三种波形有说明');
ok(doc.includes('呼吸灯') && doc.includes('彗星拖尾') && doc.includes('绕环彩虹'), '常见做法给了配方');
ok(/LED_MODE_1/.test(doc) || /慢速渐变色/.test(doc), '举了「一个模式里分区各跑各的」的例子');
ok(doc.includes('多个分区选同一个效果') && doc.includes('同步'), '解释了「同效果 = 同步」');
ok(doc.includes('ring_set_audio_level') && doc.includes('音乐来了'), '解释了「自动」速度档怎么跟着音乐变');

/* 悬浮说明 */
const tips = [...html.matchAll(/data-tip="([^"]+)"/g)].map(m=>m[1]);
ok(tips.length >= 50, `静态控件上挂了 ${tips.length} 条说明`);
ok(/id="fOffset"[^>]*data-tip=/.test(html) || /data-tip="[^"]*"[^>]*id="fOffset"/.test(html), '「起始位」有说明');
['fSlow','fSpeed','fMoves','aFix','xForm','mdAddBind','fColor'].forEach(id=>{
  const re = new RegExp('id="'+id+'"[^>]*data-tip=|data-tip="[^"]*"[^>]*id="'+id+'"');
  ok(re.test(html), `控件 ${id} 有说明`);
});
ok(/function tipInit/.test(html) && /function tipShow/.test(html), '运行时提示系统在');
ok(/id="tipBox"|tipEl\.id = 'tipBox'/.test(html), '提示小窗是动态创建的');
/* 动态生成的图层控件也带说明 */
ok(html.includes("'跟随效果配色：整个环同色"), '图层「配色」下拉有说明');
ok(html.includes('单边拖尾一边亮一边长尾'), '「衰减曲线」有说明');
ok(/selInput\([^)]*,\s*$|selInput\([^)]*,\s*'|selInput\([\s\S]{0,120}?'跟随/.test(html) || html.includes('selInput(WAVE_NAME'), '下拉支持挂说明');

/* ---- 结构：所有面板都必须在右侧栏 #right 里面 ---- */
{
  const rightStart = html.indexOf('<aside id="right">');
  const rightEnd = html.indexOf('</aside>', rightStart);
  const rightHtml = html.slice(rightStart, rightEnd);
  const panes = [...html.matchAll(/data-pane="([a-z]+)"/g)].map(m => m[1]);
  const outside = panes.filter(n => !rightHtml.includes('data-pane="' + n + '"'));
  ok(outside.length === 0, outside.length
     ? '这些面板跑到 #right 外面去了（会导致切不回去、也滚不动）: ' + outside.join(',')
     : `${panes.length} 个面板都在 #right 里 (${panes.join(',')})`);
  /* 页签和面板要一一对应 */
  const tabs = [...rightHtml.matchAll(/data-tab="([a-z]+)"/g)].map(m => m[1]);
  const missTab = panes.filter(n => !tabs.includes(n));
  const missPane = tabs.filter(n => !panes.includes(n));
  ok(missTab.length === 0 && missPane.length === 0,
     `页签与面板一一对应（页签 ${tabs.length} / 面板 ${panes.length}）` +
     (missTab.length ? ' 缺页签: ' + missTab : '') + (missPane.length ? ' 缺面板: ' + missPane : ''));
  /* 面板要可滚动：CSS 里 .pane 必须有 overflow */
  const paneCss = (html.match(/\.pane\{[^}]*\}/) || [''])[0];
  ok(/overflow:\s*auto/.test(paneCss), '.pane 设了 overflow:auto（长内容能滚动）: ' + paneCss);
  const rightCss = (html.match(/#right\{[^}]*\}/) || [''])[0];
  ok(/min-height:\s*0/.test(rightCss), '#right 设了 min-height:0（flex 子项才能收缩出滚动条）');
}


/* ---- 说明框只能有一套：不能同时挂原生 title ---- */
{
  const both = [...html.matchAll(/<[a-zA-Z][^>]*>/g)].map(m => m[0])
    .filter(t => /\btitle=/.test(t) && /data-tip=/.test(t));
  ok(both.length === 0, both.length
     ? '这些标签同时挂了 title 和 data-tip（会弹两个框叠加）: ' + both.map(t => t.slice(0, 50)).join(' | ')
     : '没有任何标签同时挂 title 与 data-tip（不会出现两个框）');
  ok(!/\btitle="/.test(html), '页面里已经没有原生 title 了（统一走自定义提示框）');
  const jsTitle = [...html.matchAll(/[\w.\]]\.title\s*=/g)].map(m => m[0]);
  ok(jsTitle.length === 0, jsTitle.length
     ? 'JS 里还在设 .title（会再弹一个原生框）: ' + jsTitle.join(' ')
     : 'JS 里也没有 .title 赋值了');
  ok(/function tip\(node, text\)/.test(html), 'tip() 只写 data-tip');
  ok(!/setAttribute\('title'/.test(html), '没有任何地方再设 title 属性');
}

/* ---- P1/P2/P4：帮助页目录、搜索、每行的「去做」 ---- */
{
  const uiSrc = html.match(/<script id="ui">([\s\S]*?)<\/script>/)[1];
  ok(/id="helpNav"/.test(html) && /id="helpToc"/.test(html) && /id="helpCount"/.test(html),
     '帮助页顶部有目录容器与命中计数');
  ok(/id="helpSearch"[^>]*data-tip=/.test(html), '帮助搜索框存在且带说明');
  /* 目录按 h3 顺序生成 → 链接数 = 章节数（以后加章节不会漏） */
  ok(/function helpBuildToc[\s\S]{0,600}?querySelectorAll\('h3'\)[\s\S]{0,600}?a\.dataset\.hs = h\.id/.test(uiSrc),
     '目录按 h3 顺序生成（链接数天然等于章节数）');
  ok(/function helpFilter[\s\S]{0,1400}?style\.display/.test(uiSrc), '搜索按章节整块显隐（清空恢复全篇）');
  ok(/!helpTouched/.test(uiSrc), '帮助页只在第一次进入时回顶（之后切回来停在原处）');
  /* P4：常见做法每行末尾的「去做」 */
  const goes = [...doc.matchAll(/data-go="([a-z]+)"/g)].map(m => m[1]);
  ok(goes.length >= 8, `「常见做法」有 ${goes.length} 行带「去做」按钮`);
  /* 目标页直接按页面上的页签列表算 —— 以后合并 / 改名页签时这里不会失效 */
  const known = [...html.matchAll(/data-tab="([a-z]+)"/g)].map(m => m[1]);
  ok(goes.every(p => known.includes(p)), `「去做」目标页都是已存在的页签: ${[...new Set(goes)].join(', ')}`);
  ok(/querySelectorAll\('#helpDoc \[data-go\]'\)/.test(uiSrc), '「去做」按钮已接线（切页 + 状态栏说明）');
}

console.log(fails?`\n=== ${fails} 项未通过 ===`:'\n=== 全部通过 ===');
process.exit(fails?1:0);
