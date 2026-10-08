import fs from 'node:fs';
const html = fs.readFileSync('led_layout_editor.html','utf8');
let fails = 0;
const ok = (c,m)=>{ console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c) fails++; };

for (const [name, src] of [['core', html.match(/<script id="core">([\s\S]*?)<\/script>/)[1]],
                           ['ui',   html.match(/<script id="ui">([\s\S]*?)<\/script>/)[1]]]) {
  try { new Function(src); ok(true, `${name} 脚本语法 OK（${src.split('\n').length} 行）`); }
  catch (e) { ok(false, `${name} 脚本语法: ${e.message}`); }
}

const pairs = [['div',/<div[\s>]/g,/<\/div>/g], ['fieldset',/<fieldset[\s>]/g,/<\/fieldset>/g],
               ['table',/<table[\s>]/g,/<\/table>/g],   ['aside',/<aside[\s>]/g,/<\/aside>/g],
               ['main',/<main[\s>]/g,/<\/main>/g],      ['header',/<header[\s>]/g,/<\/header>/g],
               ['select',/<select[\s>]/g,/<\/select>/g],['section',/<section[\s>]/g,/<\/section>/g]];
for (const [t, ro, rc] of pairs) {
  const o = (html.match(ro)||[]).length, c = (html.match(rc)||[]).length;
  ok(o === c, `<${t}> 开 ${o} / 闭 ${c}`);
}
const ext = (html.match(/https?:\/\/[^"' )]+/g)||[]).filter(u => !u.includes('w3.org'));
ok(ext.length === 0, ext.length ? '存在外部引用: ' + ext.join(', ') : '无外部网络引用（离线可用）');
ok(!/\brequire\(|import\s+\w+\s+from/.test(html), '无模块加载依赖');
ok(html.includes('charset="utf-8"'), '声明 UTF-8 编码');
const bytes = fs.statSync('led_layout_editor.html').size;
console.log(`\n  文件 ${(bytes/1024).toFixed(1)} KB · ${html.split('\n').length} 行`);
process.exit(fails?1:0);
