import fs from 'node:fs';
const h = fs.readFileSync('led_layout_editor.html', 'utf8');
const CORE = new Function(h.match(/<script id="core">([\s\S]*?)<\/script>/)[1] + '\n; return CORE;')();
const st = CORE.projectFromPreset(CORE.PRESET_SP3122D);
console.log(st.zones.map(z => z.name + ':' + z.count).join(' | '));
console.log('RING_SIZE', CORE.FW.RING_SIZE, 'LED_COUNT', CORE.FW.LED_COUNT);
