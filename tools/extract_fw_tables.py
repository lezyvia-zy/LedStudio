# -*- coding: utf-8 -*-
"""
从目标固件源码里抽出「查表与固件表」，生成两份东西：

  1. --js      → 一段 JS 代码（Object.assign(FW, {...})），贴进 led_layout_editor.html
  2. --fixture → tests/fixtures/fw_g_presets.txt，供 test_effects_c.mjs 做回归锚点

为什么需要它：
  * 工具里的 cos_window_tbl / ease_out_quad_tbl / spectrum_tbl / presets
    必须与固件逐字一致，手抄一定会错（而且 GBK 源码手抄更容易错）。
  * 回归锚点是「工具默认导出 9 行 == 固件 g_presets[]」，固件一改就要重生成。

用法（在项目根目录）：
    python tools/extract_fw_tables.py --sdk ../LED_Optimize/MVsB1_BT_Audio_SDK_v0.3.4 \
        --fixture --js > /tmp/fw_tables.js

注意：源码是 GBK。这个脚本按字节读、按 gbk 解码，中文注释坏了也不影响（只要的是数字）。
"""
import argparse
import os
import re
import sys

LED_RING_C = 'BT_Audio_APP/bt_audio_app_src/device/led_ring.c'
SPIMLED_SVC = 'BT_Audio_APP/bt_audio_app_src/services/spimled_service.c'


def read_gbk(path):
    if not os.path.exists(path):
        sys.exit('找不到文件: %s' % path)
    return open(path, 'rb').read().decode('gbk', 'replace')


def arr(src, name, count=None):
    """抽出一个 C 数组里的所有整数"""
    m = re.search(re.escape(name) + r'\s*\[[^\]]*\]\s*=\s*\{(.*?)\n\};', src, re.S)
    if not m:
        sys.exit('没找到数组: %s' % name)
    nums = [int(x) for x in re.findall(r'-?\d+', m.group(1))]
    if count is not None and len(nums) != count:
        sys.exit('%s: 期望 %d 个，实际 %d 个' % (name, count, len(nums)))
    return nums


def fmt(name, vals, per=16):
    out = ['  %s: [' % name]
    for i in range(0, len(vals), per):
        out.append('    ' + ','.join(str(v) for v in vals[i:i + per]) + ',')
    out.append('  ],')
    return '\n'.join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sdk', default='../LED_Optimize/MVsB1_BT_Audio_SDK_v0.3.4',
                    help='SDK 根目录（含 BT_Audio_APP）')
    ap.add_argument('--fixture', action='store_true', help='生成 tests 用的 fixture')
    ap.add_argument('--js', action='store_true', help='生成贴进工具的 JS 表')
    ap.add_argument('--out', default=None, help='fixture 的输出路径')
    a = ap.parse_args()

    c = read_gbk(os.path.join(a.sdk, LED_RING_C))
    s = read_gbk(os.path.join(a.sdk, SPIMLED_SVC))

    ease = arr(c, 'ease_out_quad_tbl', 256)
    cosw = arr(c, 'cos_window_tbl', 256)
    sp   = arr(c, 'spectrum_tbl', 768)

    m = re.search(r'g_presets\[RING_PRESET_COUNT\]\s*=\s*\{(.*?)\n\};', s, re.S)
    if not m:
        sys.exit('没找到 g_presets[]')
    rows = [l.strip() for l in m.group(1).split('\n') if l.strip().startswith('{')]
    if len(rows) != 9:
        sys.exit('g_presets 行数 %d，期望 9' % len(rows))

    if a.fixture:
        out = a.out or 'tests/fixtures/fw_g_presets.txt'
        d = os.path.dirname(out)
        if d:
            os.makedirs(d, exist_ok=True)
        with open(out, 'w', encoding='utf-8', newline='\n') as f:
            f.write('# 从 %s 抽出的 g_presets[] 真身（工具的回归锚点）\n' % SPIMLED_SVC)
            f.write('# 重新生成: python tools/extract_fw_tables.py --fixture\n')
            f.write('\n'.join(rows) + '\n')
        print('fixture 写好: %s（%d 行）' % (out, len(rows)), file=sys.stderr)

    if a.js:
        ROW = re.compile(r'^\{\s*(\w+)\s*,\s*(\w+)\s*,\s*'
                         r'(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'
                         r'\{(\d+),(\d+),(\d+)\}\s*,\s*\{(\d+),(\d+),(\d+)\}\s*\},?$')
        pr = ['  presets: [']
        for i, r in enumerate(rows):
            m2 = ROW.match(r)
            if not m2:
                sys.exit('第 %d 行解析不了: %s' % (i, r))
            anim, color, w, gap, slow, fast, speed, c1r, c1g, c1b, c2r, c2g, c2b = m2.groups()
            pr.append('    {anim:FW.ANIM.%s,color:FW.COLOR.%s,width:%s,gap:%s,slow:%s,fast:%s,speed:%s,'
                      'c1:[%s,%s,%s],c2:[%s,%s,%s]},'
                      % (anim.replace('ANIM_', ''), color.replace('COLOR_', ''),
                         w, gap, slow, fast, speed, c1r, c1g, c1b, c2r, c2g, c2b))
        pr.append('  ],')
        print('\n'.join([
            '/* 以下查表与固件逐字一致，由 tools/extract_fw_tables.py 抽出，请勿手改 */',
            'Object.assign(FW, {',
            fmt('ease_out_quad_tbl', ease),
            fmt('cos_window_tbl', cosw),
            '  spectrum_tbl: [' + ','.join('{r:%d,g:%d,b:%d}' % (sp[i], sp[i + 1], sp[i + 2])
                                          for i in range(0, 768, 3)) + '],',
            '\n'.join(pr),
            '});',
        ]))

    if not a.fixture and not a.js:
        ap.print_help()


if __name__ == '__main__':
    main()
