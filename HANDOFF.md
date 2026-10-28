# LedStudio 项目交接文档

> 目标读者：接手本项目的下一个 AI 编码助手（Cline）。
> 先读这份，再读 [CLAUDE.md](CLAUDE.md)（里面有 32 条踩坑记录，改代码前必看）和 [README.md](README.md)（面向用户）。
> 本文由 Claude Code 在 v1.0 提交（`9209a17`）时整理，描述的是当时的代码状态；后续变更见 [docs/CHANGELOG.md](docs/CHANGELOG.md)。

<!-- auto:handoff-head -->
> **最新交接（2026-10-28）**：代码顶端 = `0ebb845`（本行刷新时）；全量 `node tests/run_all.mjs` = **26 套件 / 1897 项 / 0 FAIL**。本行由 `node tools/docsync.mjs stats --write` 刷新，别手改。
<!-- /auto -->
> **近五轮**：摘要**不在这里重复**（手写摘要会和实现 / 行号一起漂）—— 见 [docs/CHANGELOG.md](docs/CHANGELOG.md) 最新五条。
> **接着做**：① 「**在灯板上看**」等**模式模块**完成后按新语义回来做（用户显式挂起）；② 逐动画优化（用户每轮点名一条）：**「单点追逐」已过一遍**（F11/F12 动画与色彩分离），**「多点追逐」已加「间距」`spacing` + 快慢档接上 `FFTLevel`**（F13 / F14 ✓2026-10-26，顺带把 `A2`（看出当前档位）做掉）；下一条动画待用户点名；③ 批 2 剩下的那几站（动画 `A1`（快捷键）→ 校验 `C2 / C4 / C5` → 导出 `E3 / E4 / E5`）—— 批 2 里分区三条（Z2 / Z3 / Z4 ✓5135e3c）、效果页两条（F1 / F2 ✓894515f）与**模式页三条（M2 / M3 / M5：预览模式 / 全选全不选 / 按条拆分）**已落地；**界面通用的 H10（勾选框方块贴文字 ✓f2c52c5）** 也顺手修了；也可以改做批 5-C 画布直编，开工前与用户确认一句。批次表与条目细节见 [docs/audit/priority.md](docs/audit/priority.md)（§11 优先级总表）与 [docs/audit/checklist.md](docs/audit/checklist.md)（§12 验收清单），索引在 [docs/module-audit.md](docs/module-audit.md)。
> **文档地图（2026-10-17 重排）**：定位 → `node tools/docsync.mjs where <小节|符号|#id>`（`sections` 列全部顶格小节）；逐模块体检 → [docs/module-audit.md](docs/module-audit.md) 是**索引**（1.8k），正文 12 份在 `docs/audit/`（**一页 = 一份**，只读你要改的那份）；数字与自检 → `docsync stats --write` / `docsync check`（几秒、不跑测试）。
> **本轮结论（2026-10-28 第十轮 · 阈值随导出写进 C + 音量刻度 0..20）**：① 用户：「阈值设定在这里设置好了以后，也要在固件里面应用。最后所有的都要以此工具导出的c为准……不要考虑现在的固件已有的彩灯驱动，只是作为思路参考。还有音量范围不需要那么大，最多也就【0~20】」。② 改法：`exportEffectsC()` 写 `#define LED_GEN_AUDIO_MAX 20u` + `#define LED_GEN_FFT_THRESHOLD <state.anim.thr>u`；`led_gen_tick()` 里 `fast = led_gen_hal_audio_level() > LED_GEN_FFT_THRESHOLD && ring->speed_fast < ring->speed_slow` —— **不再读 `ring->speed_cur`**，固件不用再手改 `LED_FFT_THRESHOLD`，`ring_set_audio_level()` 也不在新链路上（留着无害）。③ 音量刻度统一 **0..20**（`FW.AUDIO_MAX`）：滑杆 / 阈值格 / `A().fft` / `simSetAudioLevel()` / `fftMusicLevel()` 全按它，随机音源改成底噪 0..1 + 鼓点 8..20 + 余音。④ 导出面板补丁说明 [7]、`GEN_COMMENTS.syncspeed / audioif / audioCfg`、HAL 文案、`docs/firmware-contract.md` §6.2 全改。⑤ 26 套件 / **1903 项** / 0 FAIL（c +4：宏 / 阈值随工程变 / tick 用 HAL + 宏 / 不再读 speed_cur；c_exec 新增「阈值下沿」：阈值 12 + 音量 10 必须仍安静，写死 4 就会亮）。⑥ **下一步**：逐预置动画优化（**双向填充 / 彩虹光点 / 多点追逐**仍未验证）。
>
> **上一轮（2026-10-28 第九轮 · 音乐阈值可调 + 「音乐来了」随机注入）**：① 用户两点：「音乐信号的阈值要可调，现在固定到4了。可以在音量的滑块上增加一个滑针来调整阈值，同时在音量条的末尾处增加一个参数输入框」「点击【音乐来了】就开始自动输入随机数，模仿板上真实情况。再次点击就取消，默认输入的是0」。② 阈值进工程：`state.anim.thr`（0..255，出厂 4 = 固件 `LED_FFT_THRESHOLD`，老存档补默认值）；`fftThreshold()` 夹范围；`ringSpeedFromAudio(r, level, thr)` / `simSetAudioLevel(sim, level, thr)` / `speedWhich()` 全带**第三个参数**（不传 = 4）。③ 预览条：「音量」滑杆上叠一根**可拖的竖针** `#aThrPin`（`cpBindDrag` + `thrAtClientX()`，按滑杆矩形折算、两端扣掉 range 滑块半径 8px），滑杆末尾加**「阈」数字框** `#aThr`，两者同一个数、手动档一起灰掉。④ **阈值只影响预览**：导出代码里没有这个数（固件读自己的宏），这条写进 invariants §13-1 / 帮助页 / tooltip，别塞进导出（坑 42）。⑤ 「音乐来了」= core 的 `fftMusicLevel()`：每 20ms 一拍随机注入（底噪 0..5 + ≈10% 起鼓点 110..255 + 余音每拍衰减 10..29），**固定种子 LCG**（不用 `Math.random`，重放/录屏/测试一致），**再点一下取消 → 音量回 0**；暂停时也在跳（`loop()` 的退出条件改成「板 / 编辑台 / 音乐三者都停」，只放音乐时不推帧）。⑥ 26 套件 / **1897 项** / 0 FAIL（anim2 +8、effects_core +12）。⑦ **下一步**：逐预置动画优化（**双向填充 / 彩虹光点 / 多点追逐**仍未验证）。⑧ **第十轮修正**：阈值不再「只影响预览」—— 改为随导出写进 C（`LED_GEN_FFT_THRESHOLD`）并由 `led_gen_tick()` 自己判档；音量刻度从 0..255 收成 **0..20**（见上一条）。
>
> **上上轮（2026-10-27 第八轮 · 预置「跳变」= 配色「跳变」）**：① 用户：「我现在在测试跳变这个动画模板。在色彩配置里面我们已经添加了跳变这个配置，这两者应该是一回事。选择动画跳变，即颜色也默认切换为跳变，同时调参接口也都是用同一套」。② 病灶与「呼吸」（F18 / 坑 40）**同源**：预置「跳变(渐暗后跳回)」是 `color:1 渐变 + 填充层锯齿脉动（wave:2 / pulse_period:30 / pulse_amp:255）`，包络活在**图层**上；色彩配置的「跳变」却是 `FW.COLOR.STEP + rise/hold/fade + 调色板` —— 套完预置配色下拉还停在「渐变」，节奏也不在那三行里。③ 改法：预置改成 `color:3`（跳变）+ `rise 0 / hold 0 / fade 30`（停留 30 拍 = 600 ms，硬启亮、匀速暗到 ≈9/255，**不落全黑**）+ **3 色调色板**（红/绿/蓝）+ 一个满亮填充层（`pulse_period 0`）；实测逐拍 247→9 后跳回 247 并换下一色，与旧锯齿（255→0）观感一致；套完配色下拉自己变「跳变」、旋钮就在「色彩配置」那一排（同一份 `rise/hold/fade`），想单色把调色板删到 1 个、想柔和用「七彩跳变」（6 色 + 4/8/8）。④ 26 套件 / **1877 项** / 0 FAIL（presets +4：color=3 / 3 色 / 0-0-30→30、图层不再有锯齿脉动、配色下拉与四格自己切过去、调色板 3 色块）。⑤ **下一步**：逐预置动画优化（**双向填充 / 彩虹光点 / 多点追逐**仍未验证，拖尾彗星已确认不动）。
>
> **更早一轮（2026-10-27 第七轮 · 「最高亮度」全局统一 + 三列时间加宽成 uint16）**：① 用户：「你提到的这两点都改掉」—— 第六轮收尾挂出的两条待决一起做掉。② 改名**全局化**：「填充亮度」这一格在所有填充层上都叫「最高亮度」（`LAYER_FIELDS.fill` 标签 / 帮助页 ② 填充表 / 校验 V25 文案 / `GEN_COMMENTS.llevel` 中英），`renderLayers()` 里那个「只有闪层才叫最高亮度」的三元特判删掉；「最低亮度」只留给带 `flash_low` 的音控闪层（别的填充层没有那一列）。③ 三列时间 `pulse_period` / `flash_fast` / `flash_on` 从 **uint8 → uint16**（`led_gen_layer_t` 仍 21 列，前面的列一列没挪），`led_gen_pulse()` 的 `period` 形参、`led_gen_flash_gain()` 的 `t` / `on`、`led_gen_inst_t.flash_age` 一起加宽 —— **只加宽结构体会被调用处静默截成 8 位**（400 拍变 144）；上限 `FLASH_MS_MAX = FRAME16_MAX(65535) × 20 = 1310700 ms ≈ 21.8 分钟`，`layerNums()` 用 `frame16()` 把存档怪值夹到 0..65535（与 C 装得下的一致）。④ 26 套件 / **1873 项** / 0 FAIL（core +3：1000 拍间隔真闪 3 次 / plan 不被夹 / `frame16` 夹值；presets +1：上限 1310700 + 填 600000 ms → 30000 拍；c +1：`uint16_t` 类型断言；c_exec +2：新增「长间隔闪」= 间隔 400 拍跑 405 拍，C ↔ JS 逐字节 + 亮段语义）。⑤ **下一步**：逐预置动画优化（用户每轮点名一条；**双向填充 / 彩虹光点 / 多点追逐**还没验证，拖尾彗星已确认不动）。
>
> **更早一轮（2026-10-27 第六轮 · 「闪烁」五个旋钮改名 / 改单位）**：① 用户：「闪烁的这5个可调参数是没问题的。只是名称和描述有点问题。填充亮度改为最高亮度，闪完暗到改为最低亮度，而且数值和亮度应该是对应起来的，不能说是255代表最暗，不符合直觉。间隔时间单位也要改为ms，这样用户在填入时可以直接根据实际时间要求填入对应的参数，而不是数拍子，也包括亮的时间。」② 改法：图层**末尾再加一列** `flash_low`（0..255 = **亮度本身**，0 = 全灭）→ `led_gen_layer_t` 20 → 21 列（前面的列一列没挪）；`flashGain(age, on, dark)` + `flashDarkGain(low, level) = round(low×255÷level)`（`genFill` 是 `level×gain÷255`，所以灭的时候渲染值正好 = `low`；`level = 255` 时一个数都不差）；`pulse_amp` 在闪层上收起（只管三角 / 方波 / 锯齿）。三个时间在图层卡上按 **ms** 显示与录入（`MS_FIELDS` / `TICK_MS = 20` / 上限 `FLASH_MS_MAX = 5100` / 步长 20，内部仍存 uint8 拍、C 结构体不加宽；填不成整拍的值靠 `onchange` 回显实际生效的毫秒数）；标签 = 最高亮度 / 最低亮度 / 没音乐时闪的间隔(ms) / 有音乐间隔(ms) / 亮的时间(ms)；预置 = `level:255 pulse_period:250 flash_fast:25 flash_on:10 flash_low:0`（`pulse_amp` 不再需要）。③ 26 套件 / **1866 项** / 0 FAIL（core 改签名 + `flashDarkGain` 三项、presets 五格 + ms 交互、c 列数 20 → 21、c_exec 用「最高 200 / 最低 50」真跑 C ↔ JS 逐字节 + 语义）。④ **待决**：安静间隔上限仍是 255 拍 = **5100 ms**（要更长就换成 uint16 / 0.1 s 单位，得替换这几列）；「闪」的阈值仍与 `LED_FFT_THRESHOLD(=4)` 统一（固件 `PixelFlash()` 里是 `>10`，用户没提就保持一份来源，别分家）。⑤ **下一步**：逐预置动画优化（用户每轮点名一条；**双向填充 / 彩虹光点 / 多点追逐**是还没验证的怀疑对象，拖尾彗星已确认不动）。
>
> **更早（2026-10-27 第五轮 · 「闪烁」改成间隔跟着音乐变）**：① 用户重述需求：「此效果在无音乐或者音乐信号小的时候，要做间隔 5s 闪烁一次，有音乐时，这个间隔会变短，比如要 500ms 闪一次。如果信号持续很大，超过阈值就一直闪烁。这其中的间隔时间和闪烁亮的时间都是可调的」，并点名固件要照【CFG_FUNC_SPI_RGB_EN】：`spim_led.c` 的 `PixelFlash()` = 亮 `PixelFlashTime`（10 × 10 ms）+ 静音 `PixelFlashIdleTime`（40 × 100 ms = 4 秒）+ `FFTLevel > 10` 且这一闪结束时**立刻重触发**（于是持续闪），`led_ring.c` /【CFG_FUNC_LED_RING_EN】那套没有这条；② 改法：图层**末尾加两列** `flash_fast`（有音乐间隔，预置 25 拍 = **500 ms**，0 = 同安静间隔）/ `flash_on`（亮几拍，预置 10 拍 = **200 ms**，0 = 默认 10 拍、超过间隔夹到间隔）→ `led_gen_layer_t` 18 → 20 列（前面的列一列没挪）；`per = (fast && flash_fast) ? flash_fast : pulse_period`，`flash_age` 每拍 +1、`>= per` 绕回 0（= 再闪一次），**越过阈值那一拍清零**（立刻闪）；`flashGain(age, on, amp)` 只留两档（亮 = 满亮 / 灭 = `255 - pulse_amp`），去掉上一轮的 2+8 淡出；`flashPlanOf()` → `{on, quiet, fast, bright, amp}`；③ 「有没有音乐」仍复用 `FFTLevel > LED_FFT_THRESHOLD(=4) → 快档`（C 里是 `fast`、JS 里是 `ringIsFast(sim)`），**固件接口零改动**；④ 图层卡**只有音控闪层**多出「有音乐间隔 / 亮的时间」两格（普通填充层仍 3 格），标签改「没音乐时闪的间隔(拍) / 闪完暗到」，帮助页 ② 填充表 +「常见做法 → 闪烁」+ 提示全改；⑤ 26 套件 / **1858 项** / 0 FAIL（core 闪段重写 +5、presets +5、c 列数 18 → 20 且 +1、c_exec 改跑 47 拍仍逐字节）；⑥ **待决**：`pulse_period` 上限还是 255（安静间隔最长 5.1 秒），要更长就得把这两列换成 0.1 秒单位或 uint16 —— 等用户提；⑦ **下一步**：逐预置动画优化（用户每轮点名一条；**双向填充 / 彩虹光点 / 多点追逐**是还没验证的怀疑对象，拖尾彗星已确认不动）。

> **更早一轮（2026-10-27 第四轮 · 预置「闪烁」改成音控闪）**：① 用户：「看看闪烁效果吧。现在的效果不是我需要的。我需要的效果是，在没有音乐播放或者音乐信号小的时侯，间隔5s闪一次，有音乐时，超过阈值闪一次」—— 旧「闪烁」是填充层**方波脉动**（`wave:1`、20 拍 = 0.4 秒一轮），纯开环，跟音量毫无关系，也没有「越过阈值」这回事（那是**边沿事件**，纯函数 `pulseGain(tick, period, …)` 表达不了）；② 新做法：`WAVE.FLASH = 3`（音控闪）+ `flashGain()`（满亮 2 拍 + 8 拍淡出 = 10 拍 / 200 ms 的尖峰）+ `instTick(inst, loud)` 里那个**每实例时钟** `flashT` —— 安静时走到填充层的 `pulse_period` 绕回 0（预置 **250 拍 = 5 秒**），有音乐时只在**越过阈值那一拍**清零（闪一次，之后灭着等，一直大声不会自己再闪）；③ `loud` **复用固件那条现成链路**（`FFTLevel > LED_FFT_THRESHOLD(=4) → 快档`）：C 里就是 `led_gen_tick()` 早有的 `fast`、JS 里是同一句 `ringIsFast(sim)`，**固件接口零改动**；④ `genRender(…, flash)` / `led_gen_layers_render(…, flash)` 只让 `wave == FLASH` 的层吃这个增益，其余层照旧 `pulseGain()`（老存档 wave 0..2 行为零变化）；C 侧状态只加在**模块内部** `led_gen_inst_t`（`flash_age` / `loud_prev` / `flash_gain`），**导出头一列没加**；⑤ 26 套件 / **1847 项** / 0 FAIL（core +11、c_exec +4、presets +2）；⑥ **下一步**：逐预置动画优化（用户每轮点名一条）。**注意**：老工程里已经套过的「闪烁」保持老方波（**没有迁移**，存档 `wave` 还是 1），要新观感重新套一次预置；要「有音乐就一直闪」把 `else if (… < LED_GEN_FLASH_LEN)` 那句去掉即可。

> **上一轮（2026-10-27 第三轮 · 两套「呼吸」合一 / 调色板里的纯黑占位 / 黑色色块改不动）**：① 用户问「动画里面的呼吸，和色彩配置里面的呼吸是一回事吗？如果是的话，我在手动切换动画到呼吸时，色彩配置里面没有一同改变为呼吸」+「色彩配置里的呼吸第二个默认是黑色，这是不对的，修改也修改不了」—— 查证：**不是一回事**，预置「呼吸」= 静态 + 填充层三角脉动（`color:0 纯色`），色彩配置「呼吸」= `FW.COLOR.BREATH`（平滑包络 + 每周期换色），两个旋钮各管一半；② **纯黑的来源**：`defaultEffects()` 的 `palette: [c1, c2]`、`applyPreset()` 的 `[c1, c2 || [0,0,0]]`、`effPaletteRaw()` 的兜底，都把固件老表里「`c2 = 0,0,0` = 没有第二色」当成一种颜色，切到呼吸时那一个周期整条全灭（看着像动画停了）；③ **改不动的真因**：取色面板的色环只写 `cpHsv.h`，黑（v=0）/ 灰（s=0）的 v / s 恒 0，拖了还是黑的 —— 和帮助页「色环出来就是满饱和满亮度」自相矛盾；④ 修法：预置「呼吸」= `color:5 + 40/10/90 + palette:[[255,0,0]]` + 满亮填充层（就是配色呼吸，套完配色下拉自己变过去；三角脉动留给「闪烁 / 跳变 / 呼吸彩虹」）、三处不再产黑（兜底只收「真配过的 c2」）+ `normalizeEffect()` 把「2 条目 + 第 2 纯黑 + 第 1 有色」在**呼吸**下清掉（幂等，跳变 / 覆盖照留）、`cpPureHue()` 让色环在黑 / 灰上也能出颜色（暗色只换色相、亮度保留）；⑤ 26 套件 / **1830 项** / 0 FAIL（core +6、presets +8、color +4）；⑥ **下一步**：逐预置动画优化（用户每轮点名一条）。**「拖尾彗星」用户实测通过、不改** —— 量过（`_demo/cometcheck.mjs`）：光宽 12 在 24 灯环上 = 头 255 + 线性斜坡 234→22 铺 12 颗（占半圈，≥32 可见 11 颗；104 灯的分区等比成 52 颗，比例不变），尾端停在 22 而不是 0 只是 8.6% 亮度的一个小台阶，肉眼看不出；**别再把它往 6–8 收**（那是上一轮的待决猜测，已作废）。

> **上一轮（2026-10-27 第二轮 · 「走到头折返」其实只走到一半就掉头）**：① 用户报「走到头折返的功能，还是有问题，实际看并没有走到头。走到了一半就掉头了」—— 上一轮把折叠区间从 `rd` 改成 `half`（半圈），环上没有「头」，我拿「环的对侧」当了折返点，于是光点只在前半圈来回；② 更深一层：**环是闭合的**，`genRender()` 又把 `pos` 绕回 `[0, rd)`，「走了几圈」这个信息在渲染层根本拿不到 —— 折返点只能落在**接缝**（走到最后一颗灯、绕满一整圈），圈数必须由推进逻辑数：`instTick()` 在光标跨过接缝（`current` 由负回到 ≥0；`ringSetPosition()` 在 target 回绕那一刻把 `current` 平移整圈、画面不动，所以真正的接缝是 `current` 走到 0 那一拍）时翻转 `inst.lap`；③ `genSpot(..., lap)`：`q = bounce ? bouncePos(pos + (lap ? rd : 0), rd) : pos`（偶数圈正着走、奇数圈倒着走 = 一个来回两圈），`genRender(..., lap)` / `renderZoneMaskTo()` 把 `inst.lap` 送进图层；④ C 模板同构：`led_gen_inst_t` 加 `uint8_t lap` + `int16_t lap_pos`（**模块内部结构体，导出头一列没加**）、`led_gen_spot(..., lap)` / `led_gen_layers_render(..., lap)`、`led_gen_tick()` 里同一句翻圈（`@lapf@` / `@lapflip@` / `@bounceq@` 进 `GEN_COMMENTS`），固件接口零改动；⑤ 界面两行 `data-tip` + 帮助页① 光点表改成「一路走到最后一颗灯（绕满一整圈）才掉头，一个来回 = 两圈」；⑥ 26 套件 / **1810 项** / 0 FAIL（core 3b 重写 6 项 + 3c 新增 4 项走真实 `instTick`；c_exec 新增「往返长跑」模式：24 颗、慢档 8 拍/颗 = 192 拍一圈，跑 240 拍**真的跨过接缝**后 C 与 JS 仍逐字节一致，且光点确实落在「倒着走那圈」的第 20 颗）；⑦ **下一步**：逐预置动画优化（用户每轮点名一条；「拖尾彗星」尾长 = 光宽 = 12 灯，24 灯环上占半圈，点名时一起调）。

> **上一轮（2026-10-27 · 图层「方向 / 往返」两个参数真的没接上）**：① 用户报「往返和方向这两个参数似乎没起作用」—— 查证结果是**两个都真的空转**：**往返** `genSpot()` 拿 `rd`（整环）当 span 去折已经绕回 `[0, rd)` 的 `pos`，`bouncePos()` 在这区间恒等返回（实测「摆动(往返)」与「单点追逐」逐字节相同，摆不起来；C 模板 `led_gen_spot()` 同一行、固件同样空转）；**方向** `dir` 只进 `FALL.TAIL` 那一支（翻拖尾的边），余弦 / 线性 / 硬边下 `|d|` 对称、勾哪个都逐字节相同，而它自己的提示写的是「跑的方向」；② 按「参数要真的作用」修：`q = bounce ? bouncePos(pos, half) : pos`（**折返点 = 环的对侧 / 半圈**）+ `p0 = dir > 0 ? q : rd - q`（**反向 = 位置镜像**，整条反着走）+ 拖尾 `dd = dir > 0 ? -d : d`（**尾永远拖在身后**；老写法把尾甩在前面，彗星像倒着飞）；③ C 模板 `led_gen_spot()` 逐行对齐（新增 `q`、`p0` 三目、`@reverse@` 进 `GEN_COMMENTS`），**导出结构体一列没加、固件接口零改动**，`test_effects_c_exec` 真编译逐字节守住 JS ↔ C；④ 界面两行 `data-tip` + 帮助页① 光点表改成「跑到环的对侧（半圈）就掉头 / 配合起始位挪那一段」；⑤ 26 套件 / **1800 项** / 0 FAIL（`test_effects_core` 新增 5 项：3b 往返三条、4b 方向两条，拖尾那条改断「尾在身后」）；⑥ **下一步**：逐预置动画优化（用户每轮点名一条；「拖尾彗星」的尾长 = 光宽 = 12 灯，24 灯环上占半圈，可留待点名时一起调）。

> **上一轮（2026-10-27 · 光点层「相位 / 脉动」与四个加层按钮收起）**：① 用户问「追逐动画中的【相位，脉动周期、脉动深度】以及下面的【光点、随机闪、填充、亮度渐变】这些参数是干嘛的？似乎用不上」—— 查证结果：**相位与「选中效果 → 起始位」是同一件事**（`genRender(…, offset)` vs `genSpot(…, phase)` 7/7 组逐字节相同），光点层的脉动**没有任何预置在用**，四个加层按钮是「自定义叠加」的入口；② 按用户「把这些用不到的先删除了。我们先关注每一个预制的动画，自定义动画有关的设置，最后再来处理」执行：`LAYER_FIELDS.spot` 只留「光点数 / 光宽 / 间距」，四个 `#fxAdd*` 按钮与接线删掉，`×` 只剩一层时禁用 + `delLayer()` 兜底 —— **字段与 18 列导出一个字没动、固件零改动**，`addLayer()` 本体留着等「自定义动画」那一轮放开；**填充层的脉动必须留**（呼吸 / 闪烁 / 跳变 / 呼吸彩虹靠它）；③ 顺手修掉帮助页「相位 = 错开 spacing」那句错文案（相位只整体平移，点距看 `spacing`）；④ 26 套件 / **1795 项** / 0 FAIL（新增 1 项：只剩一层时 `×` 必须禁用）；⑤ **下一步**：逐预置动画优化（用户每轮点名一条）。
> **上一轮（2026-10-26 · 渐变「速度」夹 1..16 / 切过来收 4）**：① 用户报「配色下拉选「渐变」后，编辑台 / 灯板上的颜色一直不变」—— 渐变链路（`colorUpdate` 的 SPECTRUM 分支 / `gradTable` / 导出 `grad_first + phase`）**一行没动**、相关套件全绿，根因是「速度」这一格**多义**：跳变下它是派生的「停留(拍)」（渐亮 + 亮 + 变暗，常 30~60），渐变下是「每 N 拍走 1 级」→ 60 拍 = 一圈 307 秒，实测 60 帧只推进 1 级（255,0,0 → 255,6,0），看着就是「没生效」（先用假 DOM 跑编辑台播放复现：速度 2 → 31 种颜色，速度 60 → 2 种）；② 新增 `GRAD_SPEED_MAX = 16`（用户可设上限：16 拍一级 = 一圈 4096 拍 ≈ 82 秒）+ `GRAD_SPEED_CUT = 4`（从别的配色切过来的收敛值：4 拍一级 = 20 秒一圈，一眼看得出在动）：`syncFxColorRows` 让 `#fSpeed.max` 跟配色走（渐变 16 / 其余 255）+ 提示词写清秒数，`bind('fSpeed')` 在渐变下夹 1..16（填 0 当 1），`bind('fColor')` 在**切到渐变那一刻**把大数收进 4 并在状态栏说明「原来的 N 拍 = 一圈 M 秒」；③ 跳变的「停留」本来由 `stepSpeedOf()` 派生、覆盖改用 `period`，夹紧不伤它们；导出的 `spectrum_speed` 与固件本来就是同一个数；④ **渐变 ≠ 覆盖里的渐变条目**（用户特别强调要区分）：前者 = 整条同色、随时间在 256 级颜色环上流动；后者 = 扫过去时**沿灯位**铺的位置渐变（第 32 条）；⑤ 26 套件 / **1741 项** / 0 FAIL（`test_grad` 新增 B1c 段 8 项）；⑥ **用户 2026-10-26 人工回归通过**：六种配色（纯色 / 跳变 / 渐变 / 彩虹 / 呼吸 / 覆盖）逐个切换都说 OK —— 「渐变不变色」这条**已闭环**，别再回头改渐变的色环算法；⑦ **同日复核色彩配置**（用户「梳理一下…不要为了优化而优化」+「灰色字说明缩减」）：六种配色 × 参数行的归属本来就一致（各配色只显示用得上的行、标题跟着换、调色板条目 / 渐变色库 / 覆盖位置渐变三套概念互不越界），**结构保持原样**；只压缩了灰字（`#fPalHint` 每模式一句（覆盖 150 → 46 字）、`#fxGradHint` 不再逐个念颜色、`#fxGradStepHint` 压成「一整圈 = N 拍 ≈ M 秒（速度 × 步进）」一行、起始色行内灰字）+ `#fSpeed.min` 跟配色走（渐变 1 / 其余 0）+ 删掉一条不可达的 `#fSpeed` 兜底文案；`_demo/` 已进 `.gitignore`。
> **上一轮（2026-10-24 · 覆盖：条目自带两端渐变）**：① 调色板条目两种形态 —— 纯色 `[r,g,b]` / 两端渐变 `[r,g,b,r,g,b]`（`palIsGrad` / `effPaletteRaw`；`effPalette` 仍只取首端三色，其他配色零变化）；② **「覆盖方式 / 每组趟数」删掉** —— 铺法看条目本身：`coverTint()` → `coverEntry()`（`hue[]` 从 tint 改成**条目索引** `(ri+1)%n`，第 0 趟前 / 未参与 = 0），`wipeColorAt()` → `wipeEntryAt(c, idx, i, S)`（纯色条目硬边、渐变条目 `i·256/(S-1)`，端点精确 / 中间 `>>8`）+ `wipeSpan()`；`inst.color.paletteB` 存末端色；③ 导出：`led_gen_palette` 每条目 **2 行**（首 / 末，纯色条目重复自己），STEP / BREATH 取 `pal_first + 2*idx`（行为不变），WIPE 的 `zone_render` 只输出索引、`render_mode` 按 `pa/pb + t` 插值，`E->gap` / `E->hue_speed` 归还（仍借 `width` / `hue_base`，**结构体一列没加**）；④ 界面删两行、调色板加「+渐变」（`#fxPalAddGrad`，胶囊 `.palcell.grad` + 左右透明热区），取色面板底部 `#cpExtra` 切换「纯色 ↔ 渐变」—— **这两样只在「覆盖」出现**（`show('fxPalAddGrad', mode === WIPE)` + `renderPalette` 的 `canGrad`；跳变 / 呼吸把 6 数条目按首端色画成普通色块、不挂 `__cpExtra`，数据不动，切回覆盖还是胶囊）；⑤ 老存档一次性迁移（`cover_mode` 1 → 渐变链、2 → 按 `cover_group` 分组；迁完置 0，幂等）；⑥ 26 套件 / 1897 项 / 0 FAIL（core 覆盖段重写 + 迁移；presets 加 +渐变 / 胶囊 / 左右改色 / 面板来回切；c_exec 的 WGR 改渐变条目、WMX → 单向 + 渐变条目，11 模式逐字节）。**取舍**：渐变按灯位 `i` 铺（往返第 2 趟不翻面）；跳变 / 呼吸只取渐变条目左端色。

> **上一轮（2026-10-24 · 覆盖调色板放开到 16 色）**：① 颜色**按趟从调色板轮换** —— 第 `r` 趟用 `pal[r % n]` 当底、`pal[(r+1) % n]` 盖上去（`n` = 调色板颜色数，最多 16），所以每一趟的盖色正好是下一趟的底色，换趟帧不跳色；`n = 2` 与老版逐帧一致；② `colorUpdate()` 新增 `case FW.COLOR.WIPE`（`⌊gen_tick / period⌋ % n` 取颜色对），`coverTint()` 的 tint 改成**相对本趟颜色对**（`ri === r0` ? 盖色 : 底色，渐变 `g` / `255-g`）—— tint 端点跟着趟变，别再按绝对趟号奇偶算；③ `palFixed(WIPE)` 2 → 0：调色板 `+` / `−` 常给，`palDelColor` 守住至少 2 个；④ 导出：`led_gen_tick()` 新增覆盖分支（走 `led_gen_palette[E->pal_first + idx]`，回绕 `% n`），`zone_render` 的 tint 判据改 `ri == r0`，**结构体一列没加**；⑤ 老存档零迁移；`n > 2` + 渐变方式时「换趟那一帧」上一趟那片按本趟颜色对渲染（一帧的近似，纯色方式完全精确）；⑥ 26 套件 / 1897 项 / 0 FAIL（core +12：四色逐趟轮换 / 换趟帧底色 / 两色 = 老行为；presets +4：能加到 3 色、删到 2 色就守住；c_exec +3：新增「四色覆盖」模式真编译，10 模式逐字节）。
> **上一轮（2026-10-24 · 覆盖：往返/单向 + 纯色/渐变/混合）**：① **方向 `cover_dir`**（0 往返 / 1 单向）—— 单向时 `pos` 不再按 `r` 奇偶翻转，每趟都从同一头推、颜色照旧一趟一换（像跑马灯从头刷）；② **方式 `cover_mode` 扩到 0 纯色 / 1 渐变 / 2 混合**，混合配 **`cover_group`（1..16）= 每组几趟**：`⌊ri/group⌋` 奇数 = 渐变、从纯色开始 → 前几组纯色、后几组渐变；铺法按 **`ri`（最后一次扫到它的那趟）** 算，换招那一帧同屏就是「上一趟纯色段 + 这一趟渐变段」（按当前趟 `r0` 算会整条硬切，坑写在 invariants 第 10 条）；③ 导出继续借字段：`E->width` 灯数 / `E->gap` 铺法 / `E->hue_base` 方向 / `E->hue_speed` 每组趟数，**结构体一列没加**；④ 界面：覆盖下多「覆盖方向」「每组趟数」两行（后者只在混合时出现），「覆盖方式」多一个「混合（纯色 ↔ 渐变）」，`data-tip` / 帮助页 / `#fPalHint` 跟着换说法；⑤ 老存档零迁移（四个字段缺省 = 整条 + 纯色 + 往返 + 每组 1 趟）；⑥ 26 套件 / 1897 项 / 0 FAIL（core +8：单向三帧 / 混合换招同屏 / 每组 1 趟 / 四参数夹紧；presets +3；c_exec +2：新增「单向 + 混合」模式真编译逐字节）。
> **上一轮（2026-10-24 · 覆盖连环扫）**：覆盖从「单向扫一次、盖满整条跳回底色」改成**连环扫** —— 第 `r` 趟（`r = ⌊tick/period⌋`）在 `r·period + ⌊pos·period/S⌋` 拍扫到第 `pos` 颗，`r` 奇时方向反转，颜色在 `pal[0]` / `pal[1]` 间交替；**覆盖灯数 `cover_span`**（0 / 超长 = 整条）+ **方式 `cover_mode` 0 纯色 / 1 渐变**（`i·256/(S-1)`，第 2 趟 `255-g`，对应固件 `PixelColorCover()` 两种铺法）；`period` = 「速度(拍/趟)」；`hue[]` 在覆盖下改当 0..255 的 tint（`wipeColorAt()`，`>>8`；**`0xFE` 哨兵废了**）；导出不加列（当时只借 `E->width` / `E->gap`），真编译 C 与 JS 逐字节一致。
> **观察项（未决，先别拆 HTML）**：`where` 够不够用还没实测 —— 接下来 2~3 轮真实模块改动各记一行进 `.git/readlog.txt`（判据写死在文件头）：一次命中且读取 ≤20k 字就不拆；命中后还要读 2+ 区间才谈拆 core；反复「必须看整体结构」才谈全拆。

---

## 0. 一句话认识这个项目

**LedStudio** —— 一个**单文件、离线、零依赖**的 LED 灯效设计与代码生成工具。
交付物只有一个 HTML 文件 [led_layout_editor.html](led_layout_editor.html)，浏览器双击打开即可用，**没有构建、没有 `npm install`、没有 lint**。

它做三件事：① 画灯板排布（每颗灯的位置 + SPI 编号顺序）→ ② 在基础排布上编辑灯效 → ③ 生成能贴进目标固件的 C 代码（效果表 + 模式表 + 渲染器 + 固件补丁说明）。

原本为山景 BP1048B2 蓝牙音箱（SP-3122D，104 颗灯）做的，现独立成通用工具。目标固件接口约定见 [docs/firmware-contract.md](docs/firmware-contract.md)。

---

## 1. 整体架构与模块划分

### 1.1 文件结构

```
led_layout_editor.html       工具本体（唯一交付物）
README.md                    面向用户的说明
CLAUDE.md                    给 Claude 会话的项目说明（含 32 条踩坑）
HANDOFF.md                   本文件（交接文档）
docs/firmware-contract.md    目标固件必须提供什么 / 一次性补丁
tools/extract_fw_tables.py   从固件源码重抽查表与 fixture
tests/                       测试（node 直接跑，无需 npm）
  run_all.mjs                一键跑全部（默认 4 路并行，约 20s）
  test_*.mjs                 24 个套件，每个独立可执行
  fixtures/fw_g_presets.txt  固件 g_presets[] 的回归锚点
  .build/                    真编译套件产物（.gitignore 已忽略）
examples/
  SP-3122D.json              SP-3122D 工程（可「打开工程」）
  SP-3122D_layout.png        排布图
```

### 1.2 HTML 内部：两个 `<script>`（刻意的分层）

这是**最重要**的结构设计：

| 脚本 | 行号（约） | 内容 | 是否碰 DOM |
|---|---|---|---|
| `<script id="core">` | 784–2847 | 纯逻辑：查表、图层原语、渲染、模式解析、C 导出 | **否** |
| `<script id="ui">` | 2849–5295 | 画布、交互、面板、本地存储、多项目、导出窗口 | 是 |

**core 不碰 DOM，所以测试能把 core 单独抽出来在 node 里跑：**

```js
const CORE = new Function(html.match(/<script id="core">([\s\S]*?)<\/script>/)[1] + '\n; return CORE;')();
```

core 脚本末尾有一份**手写的导出清单** `const CORE = { FW, GEN, resolveEffect, renderZoneMaskTo, … }`（core 脚本的最后一段 —— 搜 `const CORE = {` 就能找到）。**测试只能看到这份清单里的符号**。往里加函数/常量时**必须**同步这份清单，否则测试抽不到（`CORE.xxx` 是 `undefined`，报错还很绕）——这就是 CLAUDE.md 坑 13。

### 1.3 core 脚本内部的模块（按出现顺序）

- **FW 对象**（core 脚本里的第一段 —— 搜 `const FW = {`）：固件常量 + 查表。含 `LED_COUNT/RING_SIZE/ZONE_MAX/ZONE_MAX_LEN`、`ANIM`（5 种内建动效枚举）、`COLOR`、`EASE`，以及 `ease_out_quad_tbl[256]`、`cos_window_tbl[256]`、`spectrum_tbl[256]`（彩虹 `{r,g,b}`）、`presets[9]`（9 个内建效果）。**这些查表由 `tools/extract_fw_tables.py` 从固件源码逐字提取，严禁手改**。
- **GEN 对象**（搜 `const GEN = {`）：几何排布。`rectPath(W,H,dir)` 生成矩形环绕圈路径，`rectLeds(p,cell)` 撒点编号。
- **几何 / 分区方向**：`deriveZoneDir`、`zoneReverse`（方向由几何推导，不存储）。
- **校验**：`validate`（校验页的逻辑）。
- **工程模型**：`emptyProject()`、`projectFromPreset()`、`PRESET_SP3122D`、`defaultEffects()`、`newCustomEffect()`、`emptyModes()`、`defaultModesFromEffects()`。
- **动效（逐字移植固件 `ring_tick`/`render_all`）**：`animNew/animSet/animUpdate`、`zoneScaled`、`chaseSingle/chaseDual/fillAnim`、`colorUpdate`、`renderZoneMask`。
- **图层 / 渲染原语**：`LAYER/FALL/WAVE` 枚举，`genSpot/genTwinkle/genFill/genGradient`、`genRender`、`renderZoneMaskTo`、`pulseGain`、`bouncePos`、`effectColorAt`。**图层不带颜色**（2026-10-26）—— 原语只写 `mask`，`hue[]` 的 0xFF 哨兵 / 彩虹 / 覆盖索引都在 `renderZoneMaskTo()` 里落。
- **模式 / 模拟**：`simInit`、`instNew`、`instApplyPreset`、`simApplyEffect`、`simApplyMode`、`simApplySolo`、`simSetSpeed`、`ringIsFast`、`instSpeedFromRing`、`simSyncSpeed`、`instTick`、`simTick`、`resolveEffect`、`bindKey`、`effectAtSlot`、`effectById`。
- **C 导出**：`exportC`、`exportEffectsC`、`modesPlan`、`layerToCRow`、`layerNums`、`buildPatchText`、`mangleComment`、`PATCH_BANNER2`、`patchLines`、`genImpl`、`GEN_COMMENTS`、`LED_GEN_IMPL`、`ANIM_TOK`、`COLOR_TOK`。

### 1.4 ui 脚本内部的模块（按出现顺序）

悬浮说明（`data-tip`）→ 主题（深浅色）→ 项目库（多项目 + localStorage 自动保存）→ 撤销 → 坐标 → 右侧栏宽度 → 绘制 → 效果编辑台（`stageView`）→ 命中 → 画布交互 → 键盘 → 左侧栏（项目区 + 模式区）→ 面板（`.pane`）→ 效果页 → 预置效果模板 → 模式页 → 动效 C 导出 → 文件 → 状态栏 → 导出窗口（`#exportDlg` 弹窗 + 标题栏拖动 + `saveAsFile`/`openExport`/`closeExport`/`showExportKind`）→ 项目切换/新建/删除 → 装配 → 分区增删 → 项目设置。

### 1.5 运行时状态模型

- **`state`** —— 指向当前项目的 state 对象（撤销/重做也保持这个身份不变）：
  ```js
  { format, version, meta:{name,ledCount,ringSize,zoneMax,zoneMaxLen,savedAt},
    view, canvas, anim, stage:{ringN,stripN,compare},
    effects:{list[]}, modes:{version,list[]}, zones[], leds[] }
  ```
- **`store`** —— `store.projects[i] = { id, name, state }`，多项目，自动保存到 localStorage（400ms 防抖）。
- **`A()`** —— 动画页预览状态：`playing/speed/rate/audio/previewTarget/modeId/soloEffectId/fix/showNum/showRing/showArrow/showFrame`。
  （`speed='auto'` + `audio=true` = 模拟「样机上有声音」，与固件 `ring_set_audio_level()` 切档等价）
- **`S()`** —— 懒建的模拟器（sim），`sim.plan` 是 `[{inst, zones:[分区下标]}]`。
- **`stagePlaying`** —— 效果编辑台的独立播放状态，与动画页的 `A().playing` 互不影响。

---

## 2. 三层模型（最要紧的概念，别搞混）

| 层 | 是什么 | 存在哪 | 在哪编辑 |
|---|---|---|---|
| **分区** | 物理灯号的一段（如 16–55 顶环） | `state.zones` | 分区页 |
| **效果** | 一种图案的做法，**与分区无关**，是素材库 | `state.effects.list` | 效果页 |
| **模式** | 一套「哪个分区跑哪个效果」的分配，**顺序 = 固件 LEDMode** | `state.modes.list` | 模式页 |

一个模式 = 若干条 `{ effect, zones[] }` 绑定：

- **多个分区引用同一个效果时共享一份实例（相位同步）** —— 这就是「0-7 与 8-15 做同步渐变」的实现方式。
- `zones` 为空 = 覆盖全部分区。
- **绑定可以「覆盖参数」**：`bind.override` 是一份**完整的效果副本**，让这条绑定用自己的一套参数。`resolveEffect(state, bind)` 取实际效果，`bindKey()` 是同步判定的身份键（效果 id + 覆盖内容）。导出时覆盖会**解析成独立的效果行**，目标固件零改动。

---

## 3. 渲染：效果 = 图层叠加

图层逐灯位**取最大值**（连带胜出那一层的颜色）：

| 图层 | 用途 | 关键参数 |
|---|---|---|
| 光点 `spot` | 沿环跑的光斑 | 个数/宽度/相位/衰减曲线（余弦·线性·硬边·单边拖尾）/往返 |
| 填充 `fill` | 整环同亮 | 亮度 + 脉动（= 呼吸） |
| 随机闪 `twinkle` | 与位置无关的随机亮度 | 密度/刷新率/亮度区间 |
| 亮度渐变 `gradient` | 沿环明暗斜坡 | 上下限/起始位/绕环轮数/旋转 |

三种共有：**波形**（`WAVE`: 三角=呼吸 / 方波=闪烁 / 锯齿=跳变；**不在图层卡上暴露**，只由预置给）。**颜色一律来自效果级「色彩配置」**（「本层取色 / 空间色相」2026-10-26 已退休，老存档自动迁成效果级彩虹）。效果级还有**起始位**（`offset`）与**随位置前进**（`moves`）。

**图层可以旁路**：图层卡最左的勾选框取消勾选 = `en = 0` —— 那一层照旧写进 C 表（行号不漂移），
但 JS 预览与固件合成都跳过它（`genRender` 里 `if (L.en === 0) continue;` ↔ C 的 `if (!L->en) continue;`），
想比「少了这层会怎样」不用删了再加回来。旁边的**复制**把参数深拷贝一份插在原层后面（满 8 层禁用）。
整条效果的层全被旁路时，校验页报 `V37`（渲染出来是全黑）。

### 等比缩放这条语义必须记住

`zpos = pos × len / RING_SIZE`，宽度也按 `len / RING_SIZE` 缩放。结果是：

> **同一个效果在各分区张角相同、点亮的颗数不同。** 光宽 10 时实测：8 颗 → 1 颗亮、24 颗 → 9 颗、40 颗 → 15 颗、104 颗 → 37 颗。

所以在一种长度上调好宽度，到别的长度上会走样 —— 这就是**效果编辑台要多长度对比**的原因。

---

## 4. 已完成功能 → 对应文件

| 功能 | 实现位置 |
|---|---|
| 灯板排布绘制（矩形环绕圈 + SPI 编号） | core `GEN.rectPath/rectLeds`；ui 分区页/画布交互 |
| 分区增删、方向推导（不存储方向） | core `deriveZoneDir/zoneReverse`；ui 分区增删 |
| 排布校验 | core `validate`；ui 校验页 |
| 内建效果（9 个，来自固件 `presets[]`） | core `FW.presets` + `defaultEffects` |
| 自定义效果（图层列表） | core `newCustomEffect` + 图层原语；ui 效果页 |
| 图层旁路 / 复制（F5） | ui `renderLayers` 的 `layOn` 勾选 + `copyLayer`；core `layerNums`/`genRender` 的 `en`；生成的 C 里 `led_gen_layer_t.en` + `if (!L->en) continue;`；校验 `V37` |
| 21 个预置模板 | ui `effectPreset`（单点追逐/双点追逐/多点追逐(4)/拖尾彗星/摆动/呼吸/闪烁/跳变/绕环彩虹/彩虹光点/沿环渐变/渐变旋转/双向填充/呼吸彩虹/随机闪/闪+底色/全点亮(测配色)/彩虹环/七彩跳变/多色呼吸/颜色覆盖） |
| 效果编辑台（直线 + 圆环 + 多长度对比，对比长度取自板子真实分区） | ui 效果编辑台 `stageView` / `stageCompareRows`；状态在 `state.stage` |
| 效果列表过滤（只影响显示，不进存档） | ui `#fxFilter` / `fxFilterHit` / `fxFilterClear` / `renderFxList`；值只在 UI 变量 `fxFilterTxt` |
| 模式分配 + 覆盖参数 | core `resolveEffect/bindKey`；ui 模式页 |
| 动画页真实灯板预览 | ui 动画页；core `sim*` / `renderAllSim` |
| 速度档跟着音乐变（预览可模拟，两页共用一份） | ui **`#previewBar` 预览条**（`#aSpeed` 的「自动」+ `#aFft` 音量 + `#aAudio`「音乐来了」—— 住在 `#right` 里、任何 `.pane` 之外，`syncPreviewBar()` / `PREVIEW_BAR_PANES = ['fx','anim']` 决定哪几页露面）；core `ringIsFast/instSpeedFromRing/simSyncSpeed`；生成的 C 用同一条判据（`led_gen_tick`）—— 见 docs/firmware-contract.md 第三节 |
| C 代码导出（效果表+模式表+渲染器+补丁横幅） | core `exportC/exportEffectsC/modesPlan/buildPatchText`；ui 导出页 |
| 导出窗口（独立弹窗，可拖动 / 拉伸，Esc 或点遮罩关闭） | ui `openExport/closeExport/showExportKind/exportIsOpen`；`#exportDlg` + `.dlgMask`；内容按页签惰性生成 |
| 保存时自选路径（系统「另存为」） | ui `saveAsFile`（`showSaveFilePicker`，不支持时退回 `download`）；PNG 先拿选择器再编码，避免回调里丢用户手势 |
| 生成 C 注释双语（中/ASCII） | core `GEN_COMMENTS` + `mangleComment`（模板内中文用 `@key@` 占位） |
| 多项目 + 自动保存（localStorage） | ui 项目库 `store` |
| 保存/打开工程（JSON） | ui 文件模块 |
| 撤销/重做 | ui 撤销模块 |
| 深浅色主题 | ui 主题模块（`TC` 缓存） |
| 悬浮说明 + 完整帮助页 | ui 悬浮说明 + 帮助页；被 `test_help` 断言 |
| 从固件源码重抽查表 | `tools/extract_fw_tables.py` |
| **契约 v1：工具 → 平台唯一接口** | core `LED_GEN_HAL` / `exportHalC`；导出窗口「HAL 接口」页签；契约文档 `docs/firmware-contract.md`；守边界的是 `test_gen_independence`（零平台符号 + 文档一致 + 真编译版本守卫） |

### 测试覆盖（26 套件、1897 项断言）

| 类型 | 套件 | 验什么 |
|---|---|---|
| 纯逻辑 | `test_effects_core`(229) `test_core`(30) `test_map`(8) `test_wrap`(4) `test_anim`(17，含「这一拍该不该自己往前走一格」= `instAdvances`，`instTick` 与效果页步进共用那一份判断) `test_effects_c`(52) `test_shape`(75) | 图层原语、排布生成、校验、C 文本、回绕修正、速度档信号链；`test_shape` 另守住形状引擎（`cells` 档与旧 `GEN.rectLeds` 逐字节相同、21 颗闭环、每边 6/5/6/4、反向编号、圆/圆弧、退化形状、圆角矩形/直线/椭圆/换类型外框不动/轮廓最近点、形状不进导出物），以及 7-D-2 的**多边形**（`fromBox(..., reset)` 换类型给正 n 边形且外框不动、椭圆/直线换多边形（闭边补上）、`blank.n` 生效、`regularPts` 顶点填满外框、拖手柄只缩放不改顶点个数、自定义多边形顶点不被动），以及 **7-D-7** 的**定头尾两次点击**（新增 K 段：4 种分布 × 2 个初始方向**逐颗**验「点哪儿 = 头就在哪颗」（差 ≤0.06px）、第 2 下点「尾」= 编号往离头近的那边走且**头仍停在第 1 下那一颗**、两点重合 / 开环往回点 / 格点档点回同一颗这三种情形**方向与头都不动**）|
| **契约** | `test_gen_independence`(62) | `led_gen_hal.h` 零平台符号 / 只 include 标准头 / ASCII / 行尾可控；契约与 `docs/firmware-contract.md` 双向一致；附录 A 账本（现有导出物的 28 个耦合）不许变多；真编译：平台照契约实现能编过 + 跑起来、**平台版本与工具不符必须编不过** |
| 真编译 | `test_effects_c_exec`(40) | 用 AndeSight cygwin gcc 真编译生成的头文件、真运行，**4 模式 × 37 帧整个 104 灯 fb 与 JS 预览逐字节比对**（含一条绑**内建单点追逐**的模式；桩里 `anim_render_chase_single()` 写成「一被调就 abort」，跑通即证明生成代码没再调平台原语）；另有一段**前半慢档 / 后半快档**的音量档场景（验「音乐来了会变快」这条链路） |
| 假 DOM | `test_effects_ui`(80) `test_ui`(282) `test_canvas_map`(98) `test_anim2`(45) `test_modes`(49) `test_override`(34) `test_fx_presets`(171) `test_color`(76) `test_grad`(133) `test_stage`(127，§10/§10.1b/§10.1c/§11/§12 = 效果页底部**常驻播放条**：位置与控制件齐全 / **删掉了「播放（常驻）」标题** / `.fxbar` 的 `bottom:0` + 下外边距 0 与 `#paneFx{padding-bottom:0}`（钉底不随滚动移动）/ 图标键（svg + 悬浮说明 + `.vh`）与 `.on` 切图标 / 键 40×36、播放键 56×40、svg 20/24px / **实心双三角**的上一条下一条与**实心方块**的归零在最左、三组各有分线 / 悬浮说明都压在一行 ≤30 字 / 倍率只写 `state.stage.rate` 不动 `anim.rate` / **后一帧让位置正好走一格、前一帧正好退一格（到头绕回）** / 归零回起始相位 / 上一条下一条巡览不定库顺序 / 播放中切换不打断 / 「在灯板上看」挂起但接线留着 / 灰字只剩 4 条且按钮行都走 `.btnrow`) `test_split`(25) `test_help`(59) `test_export`(96) | 界面层真跑一遍（`boot()` 走通）、交互、接线（含速度档「自动」接线）；`test_help` 断言帮助页章节与 `data-tip`；`test_export` 断言导出窗口开关/四页签/「另存为」与回退下载/取消/拖动/Esc、右栏宽度上限自适应，以及批 1 的「校验没通过时导出被红条挡住」（HAL 页不受闸门影响）；`test_ui` 另守住批 5-A / 7-B 的「板级参数 / 形状铺灯 / 底图 都在 zones 面板里、旧的三套铺灯控件已删除」，批 7-C 的「形状选择框 / 画形状拖拽 / 画完释放回选择模式 / 点形状（含已铺形状内部）进编辑、点空白释放 / 编辑态点形状选择框换类型、灯立即重铺 / 面板只留分区类型起始编号颗数方向 / 点其它形状切换选中、Esc 释放 / 定头尾自动铺 / 换类型外框不动 / 拖手柄改大小 / 改分区灯数自动增删灯」，以及 7-D 的「形状选择框**五格**且 `data-kind` 与 `SHAPE.KINDS` 一一对应、分区页只剩 5 条短灰底说明（≤ 100 字）/ 选择模式下点灯优先选中那颗灯（点形状框内空白才进编辑）/ 把灯拖出形状后记下相对偏移、挪形状时保持相对位置、拖回原位附近自动吸附并清掉偏移」，以及 7-D-2 的「诊断行不再报周长/每边落点/排得开（仍报分区号段对照）/ 换类型 → 多边形**看得见变化**（正六边形，外框不动）/「边数」行只给多边形露出、改成 5 → 正五边形且外框不动 / 换类型后 `det` 清空、那颗灯回到新形状的落点上 / 新增空白形状 = 6×5 格、整个落在画布可视区内、建完直接进编辑态」，以及 7-D-3 的「**改「边数」当场重铺**（不挪形状灯位就变、每颗灯都落在新几何的落点上、`det` 归位清空、状态栏说「已跟着重铺」）/ 面板「形状」下拉选一项 = 进编辑态 / 单击边框上的灯**仍优先选灯**、**双击**才进形状编辑态 / 新增的形状直接进编辑态且**抓左上角手柄拖一下外框真的变大** / **真·空白画布**（`btnProjNew`，0 灯 0 分区）新增的形状落在画布正中可视区内、屏幕尺寸 ≥110×90px、手柄拖得动」；以及 **7-D-4**（用户第四轮实测）的「**画布位图与 CSS 盒子 × dpr 一直对得上**（布局变了 / dpr 变了之后点灯都不偏，`test_canvas_map` 把浏览器这三样分开建模来守）/ **选择模式抓住手柄一次手势就把形状改大**（不必先点中）/ **瞄着手柄差几像素仍算改大小**（不会整块挪走、也不会掉到包围盒外变成「点空白」退出编辑态）/ 单击与**双击落在灯点上**都优先选灯（连点两颗灯不会偷偷换成形状编辑态）/ 面板「编辑」按钮进编辑态 / 缩到 0.26 倍点偏 0.44 格仍选中那一颗、偏过中点就选更近的那颗；以及**「看不见的手柄不存在」**（切到放置 / 擦除模式的**当场重画**里那把 8 个手柄不再出现，切回选择模式又回来；删掉形状后不替下一个形状画手柄）；以及 **7-D-6**（用户第六轮实测）的「**定头尾不是形状编辑**（点它左侧栏**不**变「画形状」、画布上一个手柄都不画、**再点一次按钮 = 取消**、两步里全板编号先藏起来 / 点完第 1 下只亮「头 N」/ 第 2 下全部回来、右栏按钮自己改口叫「取消定头尾」、目标 = **分区表里选中的那个分区的形状**（提示与 `#shList` 都跟着换）、提示框是**最后画**的所以压在所有灯之上）」；以及 **7-D-7**（用户第八轮实测）的「第 1 下点完**头就落在点的那颗灯上**（不再错开一格）/ 第 2 下**只定方向**（点顺当前方向那颗 → 方向保持；点另一侧那颗 → 掉头；两种都**头一动不动**）/ 提示框**钉在画布左上角**（画布缩放后仍钉在同一处，对照：形状角会跟着动）/ 源码次序：banner 排在所有灯与手柄之后」；以及 **7-D-8**（用户第九轮实测，**只改措辞与反馈、算法一行不动**）的「第 2 下改叫「**方向**」（画布横幅 / 左栏「现在：」/ `data-tip` / 帮助页四处都写「② 点方向」，且整份 HTML 里**不再出现**「② 再点一下定」）/ 状态栏报出「**尾是第几颗 / 离你点的那颗差几颗**」（`tailLanding` / `tailLandingTxt`）—— 用户原话「我理解的是第二次点击的［尾］指的是最末尾的编号应该在的位置」」；以及 **7-D-9**（用户第十轮实测）的「**删分区 = 把这一段整段收走**：号段里的灯、挂在这个分区上的形状一起删，后面的编号往前挪 `count` 位（灯号 / 别的分区 `start` / 形状 `first`）、`meta.ledCount` 跟着减 —— 删完校验页不冒缺号 / 未归属 / 重复，**告警与错误一条都没变多**；确认框先列清「几颗灯 / 几个形状 / 灯总数 A → B」；状态栏报「整段收走 / 挪了几位 / 灯总数」；Ctrl+Z 把灯 / 分区 / 形状 / 灯总数全带回来；按钮 `data-tip` 不许再说「编号会保留」」；以及 **批 11**（用户第十一轮实测，**只动分区页**）的「**上移 / 下移把相邻两段整段换位**（灯数与形状归属还原样不动、**编号按新顺序整段重排**：每个分区的 `start` + 所属灯号 + 形状 `first` + 框选 `sel` 一起走；按分区逐条验「灯数与形状归属没变」，上移再下移**逐灯逐位**回到原样；选中的是头 / 尾那一条时两个按钮 `disabled`）/ **模式绑定里的分区序号一起对调**（`binds[].zones` 存的是**序号**不是 id，漏了对调绑定就悄悄改指到别的分区；`zones: []` = 全部分区，天然跟着新顺序走）/ **导出的 C 排布表 `g_default_zones[]` 跟着新顺序排**（直接拿它当契约验）/ **数字框能整段删掉重填**（`#zCount` 空着不落状态、不点别处 = 没改、点别处才回填原值；`#zStart` / `#mLedCount` 同一套 `bindNumField`）」 |
| 持久化 | `test_persist`(44) `test_solo`(33) | 关掉再打开还在、迁移（含「老存档没有 `shapes` 字段」）、状态隔离；形状参数（分布 / 类型 / 多边形**边数**）随项目存盘；`test_solo` 另守住「效果页编辑台播放与动画页灯板播放互不影响」与「『在灯板上看』虽挂起但接线仍在」 |
| 结构 | `test_struct`(13) `test_docs`(15) | 脚本分块结构 / 文档一致性（计数自洽、无「第 N 行」式坐标、HANDOFF 顶端自动块在位） |

> 注：断言计数以 `run_all.mjs` 的统计为准（靠正则 `/  PASS  /` `/  FAIL  /`）；上表括号内的数字由 `node tools/docsync.mjs stats --write` 按实测逐个刷新，别手改。

---

## 5. 进行中 / 未完成的功能（及当前思路）

工具本体**功能完整、1897 项断言全绿**（26 套件 / 0 FAIL）。以下是已知待办（原样摘自 CLAUDE.md「当前状态与接下来的事」）：

1. **抽公共测试驾具**：20 个套件现在**各自抄了一份假 DOM**（`install()` / `mkEl()` / `querySelector` 桩，其中 8 个文件直白地各写了一份），改一处要改 20 处。应该抽成 `tests/_harness.mjs`。
   - **注意**：测试里 `ctxDraw` 是可变全局，抽取时要用 getter/setter 包装。
2. **`_fxui_body*.js` 的构建脚本**（原来在临时目录）没搬过来 —— 有两个套件（`test_effects_ui`/`test_fx_presets`/`test_solo`/`test_stage`/`test_override`/`test_split`）是从 `test_split.mjs` 的前缀 + 各自 body 拼出来的。现在它们是完整独立文件 ✓ 能直接跑，但改其中一个的公共部分时要留意重复。
3. **目标平台契约 v1 已定下（2026-10-14 契约第 ① 步「契约先行」）**：接口面 = `led_gen_hal.h`（工具导出，5 个平台实现函数 + 2 个平台调用入口 + 编译期版本守卫），边界由 `test_gen_independence` 机器判定。剩下的：② 引擎自洽化（把查表/原语/类型改成工具导出，去掉 `led_ring.h` 依赖，清空附录 A 账本）→ ③ `led_gen_config.h` 参数头 → ④ 多后端。详见 `docs/firmware-contract.md` 第四节。
4. **渲染后端目前只有「生成 C 头文件」一种**；以后可以加别的（比如 Arduino/FastLED、或直接出二进制）。

---

## 6. 已知 Bug / 待优化（尤其底层硬件约束）

### 6.1 工具自身的坑（详见 CLAUDE.md「踩过的坑」，这里只列标题）

1. `undo/redo`、`打开工程` 必须**原地改写** `state`（`Object.assign`），不能 `state = JSON.parse(...)`（会切断 `store.projects[i].state` 引用，自动保存失效）。
2. 只改帧内容的操作（方向修正、单步、归零、切效果）必须走 `applyFrame()`，且 `applyFrame()` 里必须带 `render()`。
3. `S()` 懒建 sim 时必须套用模式，否则空实例表、画面变黑。
4. 画布颜色不能每帧读 CSS 变量（`getComputedStyle` 太贵），要像 `TC` 那样切主题时读一次缓存。
5. `simApplySolo` 必须走 `simApplyEffect`（挂图层），走 `simSetupPreset` 会渲染出空图层。
6. 导出时没覆盖的绑定要**复用原效果那一行**，不要复制（否则效果表翻倍）。
7. 图层原语是「逐点取最大」，只有 `genRender` 会清空缓冲。直接调原语时必须自己用干净缓冲。
8. C 模板 `LED_GEN_IMPL` 里含中文的注释必须写成 `@key@` 占位符，由 `GEN_COMMENTS` 替换，否则 ASCII 模式会往头文件塞非 ASCII 字节。
9. 补丁横幅整体是一段块注释，不要对它调 `mangleComment`（会把开头的 `/*` 改掉，头文件直接编译不过）。
10. `node` 读不了被透明加密的目录树（如 `MVsB1_BT_Audio_SDK_v0.3.4/` 下任何文件都是密文）。读固件源码用 python 或 Read 工具；测试需要的固件内容先由 python 抽成 fixture。
11. 面板 `.pane` 必须在 `#right` 里，`.pane` 要 `overflow:auto`、`#right` 要 `min-height:0`，否则面板滚不动、切不回去。
12. 测试里改完控件要等 700ms 再断言存盘结果（自动保存有 400ms 防抖）。
13. core 新增函数/常量必须加进末尾 `CORE = { … }` 导出清单。
14. 帮助页文案与 `data-tip` 是 `test_help` 断言对象，改教程文字前先看 `test_help.mjs`。
15. 速度档是 **ring 级信号**（`ring->speed_cur`，由固件 `ring_set_audio_level(&g_ring, mainAppCt.FFTLevel)` 按 `LED_FFT_THRESHOLD` 切），生成代码在 `led_gen_tick()` 开头同步进每个实例；预览侧两条路都通向同一条链：`simSetSpeed(sim,'fast'|'slow')`（手动档）与 `simSetAudioLevel(sim, fft)`（自动档，等价 `ring_set_audio_level()`），都是改 `sim.speed_cur` 再广播。改判据要 C/JS 两边一起改（`ringIsFast()`），否则真编译套件立刻红。
16. 图层的「间距」= `spacing`：**0 才是老行为**（`rd / count` 均布，字段缺省也走这一支，且那一支**不许**夹「至少 1 颗灯」）；> 0 才换成 `zoneScaled(spacing) * 256`。`genSpot()` / C 的 `led_gen_spot()` / `layerNums()` 三处必须一起改，导出列是**末尾第 18 列**，前面的列不许挪位（`test_effects_c` 数着 18）。

### 6.2 底层硬件约束（详见 docs/firmware-contract.md）

- **`gen_tick` 必须是 `anim_ctx_t` 的字段**，不能用函数内 `static` 计数器：`anim_render_zone()` 每分区每帧都被调一次，用 static 会跑成 5 倍速。
- **`ring_set_position()` 回绕修正**：老固件「灯点转一圈闪一下」，根因是 `anim_set()` 把 `from` 设成当前值（5888）而目标是 0，插值沿最直的路倒扫整圈。修法是把 `from` 折算到离 `target` 最近的等价位置（位置以 `RING_SIZE*256` 为周期）。
- **`zpos` 归一化**：回绕瞬间 `pos` 会略小于 0，C 的 `/` 对负数**向零截断**、JS 是 `Math.floor`，两边差 1，破坏「预览与代码逐字节一致」。需在两边都归一化。
- **效果数 > 9 时**：固件模式键在 `MODE_OFF`(=9) 处回绕，只选得到 9 条。生成文件接管 `RING_PRESET_COUNT`，但 `main_task.c`、`main.c`、`display.c` 三处要跟着改（数码管 `(LEDMode+1)%10` 只显示一位，工具不管）。
- **速度跟着音乐变（`ring->speed_cur`）**：固件 `spimled_service.c` 每 20ms 调 `ring_set_audio_level(&g_ring, mainAppCt.FFTLevel)`，按 `LED_FFT_THRESHOLD`(=4) 把 `ring->speed_cur` 在 `speed_slow` / `speed_fast` 之间切（**`FFTLevel > 4` 才快**，「大于」不是「大于等于」）。这条联动是**老 SPI RGB 灯功能（`CFG_FUNC_SPI_RGB_EN`）**就有的，与 `CFG_FUNC_LED_RING_EN` 无关。打补丁后 `ring_tick()` 已被 `led_gen_tick(ring)` 取代，**只有生成代码读这个 ring 级档位**才能生效（否则永远慢档）—— 现在 `led_gen_tick()` 每帧同步它。不需要额外补丁。注意 `ring->speed_slow / speed_fast` 打补丁后不再由 `ring_apply_preset()` 刷新（`ring_init()` 里是 8 / 1），只作判档参考。工具侧对应：`simSetAudioLevel(sim, fft)`（预览）/ `stageSetSpeed()`（编辑台）/ **页签下面那条「预览条」**上的音量滑杆（= FFTLevel + 阈值读数，效果页与动画页共用同一份 `state.anim`）。
- **连续编号假设**：生成代码假定分区在 SPI 链上连续编号（`start + i`）。目标板子编号不连续需要额外映射，目前没做。
- **颜色顺序假设**：生成代码直接用 `ring->fb[phys][3]`，R/G/B 顺序。目标用别的顺序要在 `led_gen_render_mode()` 里换。
- **彩虹表耦合**：色相/彩虹依赖 `spectrum_tbl` 是 `{r,g,b}` 的 256 项数组，换表就换整套配色风格。

---

## 7. 接下来需要实现的具体任务列表

按优先级 / 依赖排序：

0. **逐模块优化（当前主线）**：见 `docs/module-audit.md`（**索引**）+ `docs/audit/`（按模块分 12 份，一页 = 一份）—— 页签 = 模块的体检结果（每条 = 现象 + 证据位置（`#id` / 符号 / 小节）+ 严重度 + 改动面 + 验收清单），按批次推进，每个模块一次提交（commit message 带条目号）。**批 0 / 1 / 3 / 4、5-A（分区 + 生成 合并成一页）、6-A、7-A/B、7-C、7-D、7-D-2、7-D-3、7-D-4、7-D-5、7-D-6、7-D-7、7-D-8、7-D-9（删分区连灯带形状一起收走）与 批 2 的分区三条（Z2 / Z3 / Z4 ✓5135e3c）均已落地**；批 2 的其余条目（`F1`/`F2`、`M2`/`M3`/`M5`、`A1`/`A2`、`C2`/`C4`/`C5`、`E3`/`E4`/`E5`）与 批 5 的 B / C（画布直编）待做。
1. **抽公共测试驾具 `tests/_harness.mjs`**（坑 12 相关，`ctxDraw` 用 getter/setter 包装）—— 消除 20 个套件各抄一份假 DOM 的重复，之后改测试公共部分只改一处。
2. **补 `_fxui_body*.js` 的构建脚本**（原来在临时目录）—— 或者用抽出的 `_harness.mjs` 统一掉那 6 个「`test_split.mjs` 前缀 + body」拼出来的套件。
3. **把目标固件契约抽成可配置的「后端」** —— 把 `ring_t`/`anim_ctx_t`/`ANIM_TYPE_COUNT`/静态 `anim_render_*` 这层对目标固件的硬假设抽象成可配置项（见 firmware-contract.md 第六节「移植到别的固件」的已知注意点）。
4. **新增渲染后端**：目前只有「生成 C 头文件」，可加 Arduino/FastLED 后端、或直接输出二进制。
5. （若继续做）**非连续编号映射**、**非 RGB 颜色顺序**等硬件适配项，等「后端」抽象做完后作为后端配置项落地。

---

## 8. 基础公约与代码要求（务必遵守）

### 8.1 LedStudio 项目公约

- **没有构建、没有 `npm install`、没有 lint** —— 工具就是一个 HTML 文件，改完刷新即可。
- **改 core 之后务必跑 `node tests/run_all.mjs`**。
- **改图层原语或 C 模板后必须跑 `test_effects_c_exec`**（真编译）—— 它验的是「预览和生成的代码是不是一回事」。
- `run_all.mjs` 靠正则 `/  PASS  /` `/  FAIL  /` 统计断言数，**每个套件的 `ok()` 帮手必须原样输出这两个串**（两个空格、四字母），否则断言不计入总数。
- core 里新增函数/常量必须加进末尾的 `CORE = { … }` 导出清单。
- 改帮助页文案/`data-tip` 前先看 `test_help.mjs`。
- **用户说「测试没问题」= 先提交、再改下一件**（2026-10-23 立的规矩）：当次改动（代码 + 测试 + 文档）**立即提交**、工作区清干净并回报提交号，**然后**才动用户随后提出的新问题；不攒在一起，也不用等用户再喊「提交」。当时工作区若已经干净，说一句「已提交（提交号）」再接着干。

### 8.2 代码风格

- 与周围代码保持一致：注释密度、命名、写法。
- 中文注释为主（工具内文案面向中文用户）；core 的 C 模板注释用 `@key@` 占位 + `GEN_COMMENTS` 双语替换。
- 引用文件用 `file:line` 形式（如 `led_layout_editor.html:2626`），方便点击跳转。

---

## 9. 关键注意点速查（改代码前 5 秒扫一遍）

1. core 加了新东西 → 记得同步 `CORE` 导出清单（坑 13）。
2. 动了图层原语 / C 模板 → 跑 `test_effects_c_exec`。
3. 动了帧内容 → 走 `applyFrame()` + `render()`（坑 2）。
4. 动了 `state` 引用 → 原地 `Object.assign`（坑 1）。
5. 动了帮助页文字 / `data-tip` → 看 `test_help`（坑 14）。
6. 动了面板 CSS → `.pane` 在 `#right` 里、`overflow:auto`、`#right` `min-height:0`（坑 11）。
7. 查表（`cos_window_tbl`/`spectrum_tbl`/`presets`）→ 用 `extract_fw_tables.py` 抽，不要手改。

---

## 10. 变更记录

历史变更（批 7-A/B、7-C、5-A、批 1、速度档、文档落盘，以及 module-audit 的批 1 / 批 5 落地记录）已集中到 [docs/CHANGELOG.md](docs/CHANGELOG.md)。
