# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

本文件给后续的 Claude Code 会话当项目说明。**先读这一份**，细节再看 `docs/`；面向用户的说明在 [README.md](README.md)。

> **接手项目 / 转交给别的 AI 助手时，先读 [HANDOFF.md](HANDOFF.md)**（架构、模块、已完成功能、待办、公约）；历史变更见 [docs/CHANGELOG.md](docs/CHANGELOG.md)。

## 常用命令

**没有构建、没有 `npm install`、没有 lint** —— 工具本体就是一个 HTML 文件，写出即所得。

```bash
# 跑工具：浏览器直接打开（唯一交付物，改完刷新即可）
#   双击 led_layout_editor.html

# 全部测试（必须在项目根目录跑，脚本按相对路径读 html）
node tests/run_all.mjs

# 只跑名字含这些字样的套件（按文件名匹配，可给多个）
node tests/run_all.mjs 效果 编译

# 单个套件也能直接跑（每个 test_*.mjs 都是独立可执行的）
node tests/test_map.mjs

# 真编译套件需要 cygwin gcc 进 PATH，否则 cc1.exe 找不到 DLL
export PATH="/c/Andestech/AndeSight_RDS_v323/cygwin/bin:$PATH"   # bash / git-bash
$env:PATH='C:\Andestech\AndeSight_RDS_v323\cygwin\bin;'+$env:PATH   # Windows PowerShell
node tests/run_all.mjs effects_c_exec

# 从固件源码重抽查表（--fixture 更新回归锚点，--js 输出贴进 html 的片段）
python tools/extract_fw_tables.py --sdk ../LED_Optimize/MVsB1_BT_Audio_SDK_v0.3.4 --fixture --js
```

`run_all.mjs` 靠正则 `/  PASS  /` `/  FAIL  /` 统计断言数，所以**每个套件里的 `ok()` 帮手必须原样输出这两个串**（两个空格、四字母），否则断言不计入总数。

## 这是什么

**LedStudio** —— 一个**单文件、离线、零依赖**的 LED 灯效设计与代码生成工具。

打开 [led_layout_editor.html](led_layout_editor.html) 即可用（双击进浏览器）。它做三件事：

1. 画出灯板排布（每颗灯的位置 + SPI 编号顺序）
2. 在**基础排布**上编辑灯效（追逐/彩虹/呼吸/…）
3. 生成能贴进目标固件的 C 代码（效果表 + 模式表 + 渲染器 + 补丁说明）

原本是给山景 BP1048B2 蓝牙音箱（SP-3122D，104 颗灯）做的，现已独立成通用工具；目标固件的接口约定见 [docs/firmware-contract.md](docs/firmware-contract.md)。

顶栏 7 个页签 = 主要工作面：`分区 效果 模式 动画 校验 导出 帮助`（原 8 个；**批 5-A** 已把「生成」并进「分区」—— 板级参数 / 铺灯 / 底图 都在那一页；**批 7-A/B** 又把三套铺灯控件换成统一的「形状」面板，见坑 17/20）。「校验」页查排布/编号问题，「帮助」页是完整教程（**它的文案被 `test_help` 断言，见坑 14**）。「导出」页只是**入口**：生成的内容都在独立窗口 `#exportDlg` 里（标题栏拖动 / 右下角拉伸 / Esc 关闭、保存可自选路径，见坑 16）。

## 三层模型与渲染（细节见 HANDOFF §2 / §3）

核心概念**三层**：**分区**（物理灯号一段）→ **效果**（图案做法，素材库，与分区无关）→ **模式**（「哪个分区跑哪个效果」的分配，顺序 = 固件 LEDMode）。多个分区引用同一效果 = **共享相位（真同步）**；绑定可用「覆盖参数」拿一份独立副本（`resolveEffect` / `bindKey`）。

渲染 = 图层逐灯位**取最大值**（`spot` 光点 / `fill` 填充 / `twinkle` 随机闪 / `gradient` 渐变）；图层可**旁路**（`en=0` 仍写进 C 表、预览与固件都跳过，全旁路报 `V37`）。

**等比缩放**：`zpos = pos × len / RING_SIZE`（宽度同缩）→ 同一效果在各分区**张角相同、点亮颗数不同**（光宽 10：8→1、24→9、40→15、104→37）。调宽度务必开「多长度对比」。

详见 [HANDOFF.md](HANDOFF.md) §2（三层模型）、§3（渲染）。

## 效果编辑台

效果页的中央画布是**编辑台**（`stageView`），不是真实灯板：一条可设颗数的直线 + 一个可设颗数的圆环 + 可选的 8/24/40 多长度对比。设置存在 `state.stage`。

- 渲染走 `renderZoneMaskTo(inst, mask, hue, len, pos)` —— **缓冲由调用方给**，所以长度不受 `ZONE_MAX_LEN` 限制。
- **编辑台的播放状态是独立的**（`stagePlaying`），与动画页的灯板预览（`A().playing`）互不影响。播放循环 `loop()` 按当前页决定推进谁。
- 效果页改参数只把模式预览**标脏**（`simDirty`），不当场 `resetSim()` —— 否则会重置灯板动画的相位。

## 文件结构（详见 HANDOFF §1）

- `led_layout_editor.html` —— 工具本体（唯一交付物）；`tests/` —— node 直接跑的 22 个套件；`tools/extract_fw_tables.py` —— 从固件源码重抽查表；`docs/` —— `firmware-contract.md`（契约 v1）、`module-audit.md`（逐模块体检）、`CHANGELOG.md`（历史变更）。
- HTML 内部**刻意分两个 `<script>`**：`id="core"`（不碰 DOM 的纯逻辑）与 `id="ui"`（画布/交互/面板）。因为 core 不碰 DOM，测试能 `new Function(...)` 直接抽出来在 node 跑。
- core 末尾有一份**手写导出清单** `const CORE = { … }` —— 往里加函数/常量**必须**同步（见坑 13）；改 core 之后务必跑 `node tests/run_all.mjs`。

## 测试怎么组织的

22 个套件、832 项断言。四类：

| 类型 | 代表 | 验什么 |
|---|---|---|
| **纯逻辑** | `test_effects_core` `test_core` `test_map` `test_shape` | 图层原语、排布生成、校验、C 文本；`test_shape` 另守住形状引擎（`cells` 档必须与旧 `GEN.rectLeds` 逐字节相同、21 颗闭环、每边颗数、反向编号、圆/圆弧、退化形状、圆角矩形/直线/椭圆/换类型外框不动/轮廓最近点） |
| **真编译** | `test_effects_c_exec` | 用 **AndeSight 自带的 cygwin gcc** 真编译生成的头文件、真运行，**3 模式 × 37 帧整个 104 灯 fb 与 JS 预览逐字节比对**；另有一段**前半慢档 / 后半快档**的场景，验「音乐来了会变快」 |
| **契约** | `test_gen_independence` | 契约第 ① 步的守门人：`led_gen_hal.h` 零平台符号 / 只 include 标准头 / ASCII / 行尾可控；契约与 `docs/firmware-contract.md` 双向一致；附录 A 账本（现有导出物的 29 个平台耦合）不许变多；**真编译**平台照契约实现能编过、版本不符必须编不过 |
| **假 DOM** | `test_ui` `test_modes` `test_stage` `test_override` `test_help` `test_export` … | 把界面层真跑一遍（`boot()` 走通）、交互、接线；`test_help` 还断言帮助页章节与 `data-tip`；`test_export` 断言导出窗口（开关 / 四页签 / 「另存为」与回退下载 / 拖动 / Esc）与右栏宽度上限 |
| **持久化** | `test_persist` `test_solo` | 关掉再打开还在、迁移（含「老存档没有 `shapes` 字段」）、状态隔离 |

`test_effects_c_exec` 需要能跑 cygwin gcc（见 README 的「真编译测试」一节）；**改图层原语或 C 模板后必须跑它** —— 它验的是「预览和生成的代码是不是一回事」，这条不成立整个工具就没意义。

## 踩过的坑（改代码前先看这个）

1. **`undo/redo`、`打开工程` 必须原地改写 `state`**（`Object.assign`）。写成 `state = JSON.parse(...)` 会切断 `store.projects[i].state` 的引用，自动保存从此失效。
2. **凡是只改帧内容的操作（方向修正、单步、归零、切效果）都必须走 `applyFrame()`**，而 **`applyFrame()` 里必须带 `render()`** —— 少了它帧算出来了但画布不刷新，表现就是「按钮没作用」。
3. **`S()` 懒建 sim 时必须套用模式**，否则开局点任何只重画不推进的按钮都会面对空实例表、画面变黑。
4. **画布颜色不能每帧读 CSS 变量**（`getComputedStyle` 太贵），要像 `TC` 那样切主题时读一次缓存。深浅两套主题的变量名必须成对齐全。
5. **`simApplySolo` 必须走 `simApplyEffect`**（它会挂图层），走 `simSetupPreset` 的话自定义效果是空图层、什么都渲染不出来。
6. **导出时没覆盖的绑定要复用原效果那一行**，不要再复制一份（`modesPlan` 里踩过，效果表会翻倍）。
7. **图层原语是「逐点取最大」，只有 `genRender` 会清空缓冲。** 直接调原语时必须自己用干净缓冲，否则上一帧的值会留下 —— 测试里踩过三次。
8. **C 模板（`LED_GEN_IMPL`）里含中文的注释必须写成 `@key@` 占位符**，由 `GEN_COMMENTS` 按注释语言替换。漏一个，ASCII 模式就会往生成的头文件里塞非 ASCII 字节。
9. **补丁横幅整体是一段块注释，不要对它自己调 `mangleComment`** —— 会把开头的 `/*` 也改掉，生成的头文件直接编译不过（真编译器抓出来的）。
10. **`node` 读不了被透明加密的目录树**（比如 `MVsB1_BT_Audio_SDK_v0.3.4/` 下任何文件都会是密文乱码）。要读固件源码请用 python 或 Read 工具；测试需要的固件内容先由 python 抽成 fixture。**2026-10-14 实测**：把固件源码拷进工作区后，`python tools/extract_fw_tables.py --sdk MVsB1_BT_Audio_SDK_v0.3.4 --fixture --out <临时路径>` 能正常读，抽出的 9 行与 `tests/fixtures/fw_g_presets.txt` **逐字节一致**（哈希相同）—— 所以契约第 ② 步「引擎自洽化」要从固件对照查表/原语时，固定走 python（`search_codebase` / `read_files` 也能看，`node` 不行；那棵树不要 `git add`，`.git/hooks/pre-commit` 已拦）。
11. 面板（`.pane`）必须在 `#right` 里面，`.pane` 要有 `overflow:auto`、`#right` 要有 `min-height:0` —— 缺一条面板就滚不动、也切不回去。
12. **测试里改完控件要等 700ms 再断言存盘结果**（自动保存有 400ms 防抖）。
13. **core 里新增的函数/常量必须加进末尾的 `CORE = { … }` 导出清单**，否则测试抽不到它（`CORE.xxx` 为 `undefined`，报错还很绕）。
14. **帮助页文案与 `data-tip` 是测试断言对象**（`test_help`）：章节标题、关键短语（如「本层空间色相」）、特定控件的 `data-tip` 都在断言里。改教程文字或删说明前先看 `test_help.mjs`。**每个 `<h3>` 必须带唯一的 `id`**（`#helpToc` 的目录按 h3 顺序生成、按 id 联动显隐），「常见做法」表里的「去做」按钮用 `data-go="<页签>"`，目标必须是已存在的页签（`test_help` 会校验）。
15. **速度档是 ring 级信号，不是实例级的**：`ring->speed_cur` 由固件 `ring_set_audio_level()` 按音量切，生成代码在 `led_gen_tick()` 开头把它同步进每个实例（`I->speed_cur = fast ? I->speed_fast : I->speed_slow`，各效果仍用自己配的 fast/slow）。改这条判据必须同时改 JS 侧的 `ringIsFast()` —— 否则真编译套件立刻红。判据是保守的：只有 `speed_fast < speed_slow` 且 `speed_cur` 落在快档才算「有声音」。
16. **导出的「另存为」必须先弹系统选择器、再异步生成内容**：`showSaveFilePicker()` 吃用户手势，塞进 `toBlob()` 的回调里就变成「非用户触发」而抛 `SecurityError` —— 所以 `saveAsFile(name, data, mime)` 的 `data` 允许传**函数**（先弹选择器 → `await make()` → 再写文件）。另外 `#tipBox` 的 `z-index` 必须**高于**弹窗遮罩（`.dlgMask`），否则导出窗口里的 `data-tip` 会被挡住弹不出来。
17. **铺灯 = 形状（批 7-A/B，取代批 5-A 的三套铺灯控件）**：核心引擎是 core 里的 `SHAPE`（`plan` / `info` / `arcs` / `fromRect` / `fromLeds` / `fromBox` / `boxOf` / `arcNear` / `roundPts`），面板是「分区」页的 `#sh*` 控件（`#shList` / `#shGallery` / `#shApply` / `#shPick` / `#shFlip` / `#shKeep` / `#shFromZone` / `#shInfo`…），旧的 `#gX0…` / `#cApply` / `#qApply` 与其一次性生成器 `genParams()` / `genInfo()` **全部删除**（`test_ui` 的「1b」块现在断言「旧控件已移除 + `#shInfo` + `SHAPE.plan`」）。`#gZone` 早就不在 —— 铺灯目标是分区表里选中的 `selZone`。按键 `g` / `t` 仍跳「分区」页；**页签总数从 8 变 7**，别照旧数字写文档。板级参数只留**项目名 / 灯总数**（见坑 18）。批 7-C 又加了左侧「画形状」工具（`shapeTool`/`shDraft`/`shPickStep`，快捷键 `S`）。
18. **板上限不让用户改（5-A′）**：`RING_SIZE` / `ZONE_MAX` / `ZONE_MAX_LEN` 是**固件** `led_ring.h` 的 `#define`，在工具里改只会让校验（V7 分区数、V8 单分区长度、V23 光宽、V26 int16 溢出）跟真固件脱节 —— 2026-10-14 把这三个输入框删了，改成一行只读说明 `#mBoardInfo`（`syncMeta()` 填）。`state.meta` 里这三个键**保留**：校验和「导出前警示」（分区数超 `ZONE_MAX`）还读它，`bindProject()` 会给老存档缺键补 `FW.*`。真要换板子 = 改固件 `#define`，再同步文件开头的 `const FW` 与 `docs/firmware-contract.md`。
19. **`led_gen` 契约是三处同源的，改一处必须改三处**（`docs/firmware-contract.md` 附录 C）：① `led_layout_editor.html` 里的 `LED_GEN_HAL`（`version` / `tag` / `tick_ms` / `proto` / `entry`，唯一真源）；② `docs/firmware-contract.md` 第二节 + 附录 A 账本；③ `tests/test_gen_independence.mjs` 的 `LEDGER` 与文档交叉断言 —— 少改一处，`test_gen_independence` 立刻红（这是刻意的：契约不靠自觉）。另外 **`led_gen_hal.h` 里不许出现任何平台符号**（连注释里提 `ring_t` 都不行），过渡期的话只写在工具提示与文档里，不进产物。改契约版本号时，平台侧 `LED_GEN_HAL_IMPLEMENTS` 会编译期报错，这是设计不是 bug。

20. **形状只活在工具里，一个字节都不进固件**：`state.shapes`（顶点/分布/头尾/方向）决定「哪一号灯落在哪、编号怎么走」，但导出的只有 `g_default_zones[] = {start,count,reverse}` 与退路用的 `led_map[]` —— **坐标从来没被导出过**。所以改形状引擎不会碰契约（`test_gen_independence` 的账本不受影响），也别把形状数据塞进导出物。两条硬约束：① **`dist:'cells'` 档必须与旧 `GEN.rectLeds` 逐字节相同**（`SHAPE.asCells` 把轴对齐 + 整数格顶点还原成 `{x0,y0,W,H}` 再走 `GEN.rectPath`），`test_shape` 的 A 组守着它 —— 老工程「由分区反推」后重铺必须一字不差；② 形状的**灯距一律按沿路径弧长算**（`SHAPE.arcAt`），别用两点直线距离：拐角处弦长必然更短，当成灯距会得出「拐角灯变密了」的错误结论。面板输入框用 `oninput = shapeTouched`（只重算诊断、**不回填**输入框），回填只在 `syncShapeEdit()`（选中/增删/`afterChange`）里做，否则打字会被自己覆盖。改 `shapes` 结构后务必同时改 `normalizeShapes()`（老存档补 `[]`、坏字段就地纠正）与 `docs/module-audit.md` 的验收清单。7-C 引入 `sh.laid`（这形状描述的是不是板上已铺出的灯）：画形状拖出来的新形状 `laid=false`（只画预览、不写灯位、不带编号），点两下「头/尾」后自动铺并置 `laid=true`；`fromRect`/`fromLeds` 出来的形状一开始就是 `laid=true`，拖它改大小会**跟着重铺**（`shRelay`）。

## 当前状态与接下来的事

工具本体功能完整、832 项断言全绿（`node tests/run_all.mjs` 实测 22 套件 / 832 项 / 0 FAIL）。逐模块优化的体检报告在 [docs/module-audit.md](docs/module-audit.md)（页签 = 模块：可优化点 + 优先级批次 + 验收清单）—— 批 0/1/3/4、5-A、6-A、7-A/B、7-C 均已落地（历史见 [docs/CHANGELOG.md](docs/CHANGELOG.md)）。已知待办：

1. **抽公共测试驾具**：20 个套件各自抄了一份假 DOM（`install()` / `mkEl()` / `querySelector` 桩），改一处要改 20 处。应抽成 `tests/_harness.mjs`（注意 `ctxDraw` 是可变全局，抽取时用 getter/setter 包装）。
2. **`_fxui_body*.js` 的构建脚本**没搬过来 —— 有 6 个套件是从 `test_split.mjs` 前缀 + 各自 body 拼出来的。现在它们是完整独立文件 ✓ 能直接跑，但改公共部分时要留意重复。
3. **目标平台契约 v1 剩下的**（`docs/firmware-contract.md` 第四节）：② 引擎自洽化（把查表/原语改成工具导出、去掉 `led_ring.h` 依赖、清空附录 A 账本，工作量最大）；③ `led_gen_config.h` 参数头；④ 多后端（MVsB1 / 通用 C / Arduino-FastLED 各一份 `port.c`）。
4. **渲染后端只有「生成 C 头文件」一种**；以后可加 Arduino/FastLED、或直接出二进制。
