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

效果页的中央画布是**编辑台**（`stageView`），不是真实灯板：一条可设颗数的直线 + 一个可设颗数的圆环 + 可选的「多长度对比」。**对比条画的是板子上真实的几条长度**（`stageCompareRows()` 从 `state.zones` 取 `count`，去重后 1–3 条、标签写真实分区名、多了取最短 / 中位 / 最长；**板上一段分区都没有才**回落 8 / 24 / 40）。设置存在 `state.stage`。

- 渲染走 `renderZoneMaskTo(inst, mask, hue, len, pos)` —— **缓冲由调用方给**，所以长度不受 `ZONE_MAX_LEN` 限制。
- **编辑台的播放状态是独立的**（`stagePlaying`），与动画页的灯板预览（`A().playing`）互不影响。播放循环 `loop()` 按当前页决定推进谁。
- **效果页底部有一条常驻播放条**（`#fxPlayBar` + CSS `.fxbar`，排在这一页**最后一个**控件的位置）：**一排图标键**（照音乐播放器 —— CSS `.fxplay`，40×36 的键 + 大一号的播放键 56×40，svg 20 / 24px；三角挂 `path.rnd` 描一道 1.2 的圆角边，把尖角磨圆成截图那种圆角三角）。从左到右三组、之间各一条分线（`.div`）：**归零**（实心方块 = 停止记号，`#fxZero`，**单独摆最左边**）· **上一条 / 播放暂停 / 下一条**（**实心双三角** = 上一曲 / 下一曲；`▶` / `⏸` 两个 `<svg>` 挂在 `#fxTest` 里，靠 `.on` 切 CSS，见坑 26⑤）· **前一帧 / 后一帧**（三角 + 竖条，`#fxStepPrev` / `#fxStepNext`）。文字解释全在 `data-tip`（**都压在一行以内**，`test_stage` §10.1b 数着），按钮里那行字收在 `.vh`。**上一条 / 下一条**（双箭头 = 巡览，`fxSelMove(±1)`：只换 `selFx` + `state.anim.effectId`，**不动库顺序、不动绑定**，播放中切换不打断）、**播放 / 暂停**、**步进**（`stageStep(dir)`：**前一帧 / 后一帧各一个灯位**，一次按键正好落在一格上；播着会先暂停；这条效果不走位置时相位不动 —— 见坑 26⑦）、**倍率**（存 `state.stage.rate`，`stageRate()` 读、老工程兜底 1×）。**钉底要两道一起**：`#paneFx{padding-bottom:0}` + `.fxbar{margin-bottom:0; bottom:0}` —— 少一条，滚到底时条子会往上跳一小截（上一版 `bottom:-8px` 就是这么被用户看见的）。`loop()` 里两个累加器分开：`acc` 看 `A().rate`（灯板）、`accS` 看 `stageRate()`（编辑台）；「从头计时」统一走 `resetClock()`。**「在灯板上看」（`#fxShowReal`）暂挂起**（`class="hide"` 先不摆出来，按钮与接线都留着 —— 等「模式」模块完成后按新语义回来做）。
- 效果页改参数只把模式预览**标脏**（`simDirty`），不当场 `resetSim()` —— 否则会重置灯板动画的相位。
- 效果列表上方那个**「过滤」框是纯显示层**（`fxFilterTxt` / `fxFilterHit()` / `fxFilterClear()`）：只决定 `renderFxList()` 画哪几行（真下标照旧 —— 点过滤后剩下的那一行，选中的仍是它真实的槽位），**不写进 `state`、不进存档、不动 `slot` 与模式绑定**；「新建 / 复制 / 转为自定义」之后自动清掉，免得刚建好却看不见。以后再添这类「只影响显示」的输入框，照这个来。

## 文件结构（详见 HANDOFF §1）

- `led_layout_editor.html` —— 工具本体（唯一交付物）；`tests/` —— node 直接跑的 24 个套件；`tools/extract_fw_tables.py` —— 从固件源码重抽查表；`docs/` —— `firmware-contract.md`（契约 v1）、`module-audit.md`（体检索引）+ `audit/`（按模块分的正文）、`CHANGELOG.md`（历史变更）。
- HTML 内部**刻意分两个 `<script>`**：`id="core"`（不碰 DOM 的纯逻辑）与 `id="ui"`（画布/交互/面板）。因为 core 不碰 DOM，测试能 `new Function(...)` 直接抽出来在 node 跑。
- core 末尾有一份**手写导出清单** `const CORE = { … }` —— 往里加函数/常量**必须**同步（见坑 13）；改 core 之后务必跑 `node tests/run_all.mjs`。

## 测试怎么组织的

24 个套件、1399 项断言。五类：

| 类型 | 代表 | 验什么 |
|---|---|---|
| **纯逻辑** | `test_effects_core` `test_core` `test_map` `test_shape` | 图层原语、排布生成、校验、C 文本；`test_shape` 另守住形状引擎（`cells` 档必须与旧 `GEN.rectLeds` 逐字节相同、21 颗闭环、每边颗数、反向编号、圆/圆弧、退化形状、圆角矩形/直线/椭圆/换类型外框不动/轮廓最近点） |
| **真编译** | `test_effects_c_exec` | 用 **AndeSight 自带的 cygwin gcc** 真编译生成的头文件、真运行，**3 模式 × 37 帧整个 104 灯 fb 与 JS 预览逐字节比对**；另有一段**前半慢档 / 后半快档**的场景，验「音乐来了会变快」 |
| **契约** | `test_gen_independence` | 契约第 ① 步的守门人：`led_gen_hal.h` 零平台符号 / 只 include 标准头 / ASCII / 行尾可控；契约与 `docs/firmware-contract.md` 双向一致；附录 A 账本（现有导出物的 28 个平台耦合）不许变多；**真编译**平台照契约实现能编过、版本不符必须编不过 |
| **假 DOM** | `test_ui` `test_modes` `test_stage` `test_override` `test_help` `test_export` … | 把界面层真跑一遍（`boot()` 走通）、交互、接线；`test_help` 还断言帮助页章节与 `data-tip`；`test_export` 断言导出窗口（开关 / 四页签 / 「另存为」与回退下载 / 拖动 / Esc）与右栏宽度上限 |
| **画布映射** | `test_canvas_map` | 把浏览器的**位图 / CSS 盒子 / dpr** 三样分开建模，再用记录型 2D 上下文抓住 `render()` 真正用的变换、每一次 `arc` / `fillRect` / `fillText` —— 「屏幕上的那个灯点被点下去会选中谁」是**算出来**的：点灯准不准、布局变了 / dpr 变了会不会偏、手柄在一次手势里抓不抓得住、**哪些东西画出来了**（手柄只在形状编辑态出现、定头尾时画布上写着「① 点头 / ② 点尾」且那行提示**钉在画布窗口左上角**、缩放平移都不动）。**别处的假 DOM 三者恒等（1200×1200、dpr 1），这类 bug 在那儿根本看不见** |
| **持久化** | `test_persist` `test_solo` | 关掉再打开还在、迁移（含「老存档没有 `shapes` 字段」）、状态隔离 |

`test_effects_c_exec` 需要能跑 cygwin gcc（见 README 的「真编译测试」一节）；**改图层原语或 C 模板后必须跑它** —— 它验的是「预览和生成的代码是不是一回事」，这条不成立整个工具就没意义。
### 改之前定位、改完怎么验（省时版 · 2026-10-17 定）

1. **改之前先定位，别整份读 HTML**（380k 字 / 8000 行）：`node tools/docsync.mjs where 效果编辑台` 给小节的行区间 + 里面的顶层符号；`where renderStage` 给符号的区间 + **被哪些测试引用**（`test_effects_ui(9)` 这种）；`where '#paneFx'` 给控件在 HTML 里的行。`node tools/docsync.mjs sections` 一次列出全部顶格小节（core / ui 分组）。小节名要能被找到，标记必须**顶格**写 `/* ---------- 名字 ---------- */`。
2. **改动循环里只跑相关套件**：`node tests/run_all.mjs 效果 ui`（按名字子串过滤，一两秒出结果；不带参数才是全量，**约 22s**，默认 4 路并行，`--jobs=1` 串行约 58s）。别改一行就全量。
3. **数字不手改**：`node tools/docsync.mjs stats --write` —— 跑一次全量，然后刷新 HANDOFF 顶端的自动块、CLAUDE / README / HANDOFF 里的「套件 · 断言」数、HANDOFF「测试覆盖」表里每个套件的 `(N)`。收尾用 `node tools/docsync.mjs check`（几秒、**不跑测试**，顺带把 `docs/audit/` 里已经落不上的「`符号` N–M」区间引用列出来）。
4. **文档里不写「第 N 行」这类坐标**：定位一律用 `#id` / 函数名 / 小节名；`docs/audit/` 表里的区间只是**粗指路**，改到哪个模块**只校准那一行**，别全表重算。

5. **一个改动一个提交**（代码 + 测试 + 文档同一提交）；提交信息 = 标题一行 + 正文按「动机 / 根因 / 改动 / 测试 / 文档」分几段（每段 1–3 行，全文 ≤ 15 行），CHANGELOG 新条目同样 ≤ 15 行。

6. **用户说「测试没问题」= 立刻提交，再改下一件**（2026-10-23 用户立的规矩）：听到「测试没问题 / 验过了 / 没问题 / 可以」这类话，**先把当次改动提交掉**（代码 + 测试 + 文档，格式按第 5 条；有文档计数变化就先 `stats --write` + `check --with-tests`），工作区清干净、回一句提交号，**然后**才动手改用户随即提出的新问题 —— 不要攒着一起提交，也不等用户再说「提交」。若那会儿工作区本来就已经干净（上一轮已提交过），直接说「已提交（提交号）」再进下一步即可。



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
12. **测试里改完控件要等「自动保存防抖」落地再断言**（自动保存有 400ms 防抖）。写法见各套件顶部的压缩器：把界面脚本的 400 / 700 / 900ms 定时器压到 **40ms**，测试**自己**的等待用真定时器 `realST(r, 70)`（40 < 70，落地顺序天然不变；3200 / 6000ms 的状态栏自动清除**不压**，有断言依赖它「还看得见」）。**别再写 `setTimeout(r, 700)`** —— 2026-10-17 之前每处固定睡 700ms，全量因此多花 100s。
13. **core 里新增的函数/常量必须加进末尾的 `CORE = { … }` 导出清单**，否则测试抽不到它（`CORE.xxx` 为 `undefined`，报错还很绕）。
14. **帮助页文案与 `data-tip` 是测试断言对象**（`test_help`）：章节标题、关键短语（如「本层空间色相」）、特定控件的 `data-tip` 都在断言里。改教程文字或删说明前先看 `test_help.mjs`。**每个 `<h3>` 必须带唯一的 `id`**（`#helpToc` 的目录按 h3 顺序生成、按 id 联动显隐），「常见做法」表里的「去做」按钮用 `data-go="<页签>"`，目标必须是已存在的页签（`test_help` 会校验）。
15. **速度档是 ring 级信号，不是实例级的**：`ring->speed_cur` 由固件 `ring_set_audio_level()` 按音量切，生成代码在 `led_gen_tick()` 开头把它同步进每个实例（`I->speed_cur = fast ? I->speed_fast : I->speed_slow`，各效果仍用自己配的 fast/slow）。改这条判据必须同时改 JS 侧的 `ringIsFast()` —— 否则真编译套件立刻红。判据是保守的：只有 `speed_fast < speed_slow` 且 `speed_cur` 落在快档才算「有声音」。
16. **导出的「另存为」必须先弹系统选择器、再异步生成内容**：`showSaveFilePicker()` 吃用户手势，塞进 `toBlob()` 的回调里就变成「非用户触发」而抛 `SecurityError` —— 所以 `saveAsFile(name, data, mime)` 的 `data` 允许传**函数**（先弹选择器 → `await make()` → 再写文件）。另外 `#tipBox` 的 `z-index` 必须**高于**弹窗遮罩（`.dlgMask`），否则导出窗口里的 `data-tip` 会被挡住弹不出来。
17. **铺灯 = 形状（批 7-A/B，取代批 5-A 的三套铺灯控件）**：核心引擎是 core 里的 `SHAPE`（`plan` / `info` / `arcs` / `fromRect` / `fromLeds` / `fromBox` / `boxOf` / `arcNear` / `roundPts`），面板是「分区」页的 `#sh*` 控件（`#shList` / `#shGallery` / `#shApply` / `#shPick` / `#shFlip` / `#shKeep` / `#shFromZone` / `#shInfo`…），旧的 `#gX0…` / `#cApply` / `#qApply` 与其一次性生成器 `genParams()` / `genInfo()` **全部删除**（`test_ui` 的「1b」块现在断言「旧控件已移除 + `#shInfo` + `SHAPE.plan`」）。`#gZone` 早就不在 —— 铺灯目标是分区表里选中的 `selZone`。按键 `g` / `t` 仍跳「分区」页；**页签总数从 8 变 7**，别照旧数字写文档。板级参数只留**项目名 / 灯总数**（见坑 18）。批 7-C 又加了左侧「画形状」工具（`shapeTool`/`shDraft`/`shPickStep`，快捷键 `S`）。批 7-D-2（第二轮实测）再补五处：`shSetKind()` 换类型时清 `sh.det`（**归位**）、`fromBox(..., reset)` 让「矩形 → 多边形」看得见变化、多边形 **边数** `#shPolyN`、`blankBox()` 把「新增空白形状」放到画布正中并**直接进编辑态**、面板诊断行去掉「周长 / 每边落点 / 排得开」。批 7-D-3（第三轮实测）再补两处：**改「边数」也当场重铺 + 归位**（`shapeTouchedPolyN` 里 `delete sh.det` + `shRelay`，别等下一次拖动）、**铺过灯的形状也要点得中**（`blankBox()` 尺寸按屏幕兜底 ≥110×90 屏幕 px；面板 `#shList` 选一项 = `enterShapeEdit()`；画布 `dblclick` 也进编辑态，单击仍是「点灯优先」）。批 7-D-6（第六轮实测）把 `#shPick`（在画布上定头尾）**从编辑态里搬出来**：它只是「改这一段编号」，**不是形状编辑** —— 不再 `setMode('shape')`（原先在编辑态里就退回 `select`，8 个手柄当场收起来），状态由 `shPickStep` + `shPickI` 表示、由 `pickShape()` 算给 `render()`（与 `mode` 无关），`cv.pointerdown` **第一步**就把它接走（`shPickClick`，点在形状包围盒内或**这一段自己的灯**上都算，点歪了只提醒不退出），**再点一次按钮 = 取消**（等待期间按钮自己改口叫「取消定头尾」），目标 = **分区表里选中的 `selZone` 那个分区的形状**（`shapeIndexOfZone`，开之前先 `syncShapeEdit()` 把面板刷成目标形状**再**读参数）。批 7-D-7（第八轮实测）把这两步的语义钉死：**第 1 下点哪儿，「头」就落在哪一颗上**（`CORE.SHAPE.setHeadTail` / `entryForHead` —— `entry` 是「落点表的起点」，而 `plan` 在 `dir='ccw'` 时会把表倒过来，直接 `entry = 弧长` 会**错开一格**，第 2 下一翻方向头就跳到旁边那颗），**第 2 下只定方向**（离头近的那边走；两点重合 / 开环往回点 → `dirSet:false`，方向与头都不动），**格点档（cells）比格点序号**（`cellsIdxAt`：灯沿格点环铺、编号也按环走，而弧长量的是轮廓顶点顺序，两者起点 / 绕向可以不一致）；画布上那行提示也钉在**画布窗口左上角**（不跟形状跑）。批 7-D-8（第九轮实测）只改**措辞与反馈**、算法一行不动：第 2 下不再叫「点尾」而叫「**点方向**」（老文案让人以为「最末尾的编号就在我点的那一颗上」—— 用户原话），并且在状态栏把「**尾是第几颗 / 离你点的那颗差几颗**」报出来（UI 段 `tailLanding` / `tailLandingTxt`：`SHAPE.plan()` 取落点表、`SHAPE.at(sh, s)` 取第 2 下点的那一处，尾正好在点的那颗上就说「正好就是你点的那一颗」）。
18. **板上限不让用户改（5-A′）**：`RING_SIZE` / `ZONE_MAX` / `ZONE_MAX_LEN` 是**固件** `led_ring.h` 的 `#define`，在工具里改只会让校验（V7 分区数、V8 单分区长度、V23 光宽、V26 int16 溢出）跟真固件脱节 —— 2026-10-14 把这三个输入框删了，改成一行只读说明 `#mBoardInfo`（`syncMeta()` 填）。`state.meta` 里这三个键**保留**：校验和「导出前警示」（分区数超 `ZONE_MAX`）还读它，`bindProject()` 会给老存档缺键补 `FW.*`。真要换板子 = 改固件 `#define`，再同步文件开头的 `const FW` 与 `docs/firmware-contract.md`。
19. **`led_gen` 契约是三处同源的，改一处必须改三处**（`docs/firmware-contract.md` 附录 C）：① `led_layout_editor.html` 里的 `LED_GEN_HAL`（`version` / `tag` / `tick_ms` / `proto` / `entry`，唯一真源）；② `docs/firmware-contract.md` 第二节 + 附录 A 账本；③ `tests/test_gen_independence.mjs` 的 `LEDGER` 与文档交叉断言 —— 少改一处，`test_gen_independence` 立刻红（这是刻意的：契约不靠自觉）。另外 **`led_gen_hal.h` 里不许出现任何平台符号**（连注释里提 `ring_t` 都不行），过渡期的话只写在工具提示与文档里，不进产物。改契约版本号时，平台侧 `LED_GEN_HAL_IMPLEMENTS` 会编译期报错，这是设计不是 bug。

20. **形状只活在工具里，一个字节都不进固件**：`state.shapes`（顶点/分布/头尾/方向）决定「哪一号灯落在哪、编号怎么走」，但导出的只有 `g_default_zones[] = {start,count,reverse}` 与退路用的 `led_map[]` —— **坐标从来没被导出过**。所以改形状引擎不会碰契约（`test_gen_independence` 的账本不受影响），也别把形状数据塞进导出物。两条硬约束：① **`dist:'cells'` 档必须与旧 `GEN.rectLeds` 逐字节相同**（`SHAPE.asCells` 把轴对齐 + 整数格顶点还原成 `{x0,y0,W,H}` 再走 `GEN.rectPath`），`test_shape` 的 A 组守着它 —— 老工程「由分区反推」后重铺必须一字不差；② 形状的**灯距一律按沿路径弧长算**（`SHAPE.arcAt`），别用两点直线距离：拐角处弦长必然更短，当成灯距会得出「拐角灯变密了」的错误结论。面板输入框用 `oninput = shapeTouched`（只重算诊断、**不回填**输入框），回填只在 `syncShapeEdit()`（选中/增删/`afterChange`）里做，否则打字会被自己覆盖。改 `shapes` 结构后务必同时改 `normalizeShapes()`（老存档补 `[]`、坏字段就地纠正）与 `docs/audit/checklist.md`（§12 验收清单）。另外 `shapes` 还多了 `sh.det`（**手动挪出去的灯**的相对偏移：键 = 落点序号、值 = `[dx,dy]`）：只有「离形状上的原位 > 0.75 格」的灯才记（吸附会把灯落到格心、与原落点差 0.71 格，所以容差比半格宽），`layShape` / `resyncZoneCount` 铺灯时按它落位（`ptsToLeds`）、`syncShapeDet` 在手动拖完灯后回填 / 清除、`btnMirror` 镜像时 `dx` 取反 —— 加字段时这四处 + `normalizeShapes` 一起改。7-C 引入 `sh.laid`（这形状描述的是不是板上已铺出的灯）：画形状拖出来的新形状 `laid=false`（只画预览、不写灯位、不带编号），点两下「头/尾」后自动铺并置 `laid=true`；`fromRect`/`fromLeds` 出来的形状一开始就是 `laid=true`，拖它改大小会**跟着重铺**（`shRelay`）。7-D-2 起：`sh.det` 在**换类型**时一律清掉（`shSetKind`）—— 换类型换的是整套几何，旧偏移新几何上没有意义；`fromBox(sh, kind, box, reset)` 的 `reset=true` =「按类型生成标准形」（**换类型 / 新建**走这档），多边形在这档下按 `sh.n`（边数，3~64，面板 `#shPolyN` 只给 `poly` 露出）重画正 n 边形，**不 reset 的那档只缩放顶点**（拖手柄改大小 / 挪动）；多边形的顶点由「边数 + 外框」决定，那个藏着不显示的 `#shPts` **不参与读入**（否则刚重画的正多边形会被旧文本覆盖回去）。新增空白形状的位置由 `blankBox()` 定（画布正中 + 避开已有形状 + 必须整个可见），建完直接 `enterShapeEdit()`。7-D-3 起：**改「边数」和换类型一样当场重铺**（`shapeTouchedPolyN` → `delete sh.det` + `shRelay`）；`blankBox()` 的尺寸**按屏幕兜底**（`max(6×5 格, ~110×90 屏幕 px)`，上限可视区六成）—— 否则画布缩得小时新形状只有几十屏幕 px，手柄点不中；**进编辑态有三条入口**：画布上点形状的框内空白 / 轮廓、**面板 `#shList` 选一项**、**画布上双击形状**（单击仍是「点灯优先」，刻意保留），三条都走 `enterShapeEdit()`。7-D-4 起（**同一份代码里「谁抢按下」的规则统一了，见坑 21**）：`handleAnyAt()` / `shHandleRing()` / `beginShapeDrag()` 三个新帮手 —— 手柄抓住就改大小（一次按住直接拖，`shHandleRing` 的 1.6 倍缓冲圈排在「包围盒内 = 挪动」之前）、选择模式按住形状内部 = 进编辑态**并立刻能挪**；编辑态下「还没真拖过」的 draft 不算一笔操作（Esc 照旧释放编辑态）；`#shEdit`「编辑」按钮。7-D-5 起：① **手柄只在「画形状」编辑态画**（`const handleSh = shapeCur;`，`shapePicked` 这个标记**整个删掉**了）—— 铺灯时那 8 个蓝方块不再抢点击；② 「铺到灯位」的蓝色高亮**按状态算**（`syncShapeTool()` 里 `toggle('pri', 有归属分区 && !sh.laid)`，HTML 里不再写死 `class="pri"`），铺完就灭；③ 定头尾第 1 下（点「头」）对**已铺过**的形状**当场重铺**（`shPickStep1` 里 `sh.laid && z` → `layShape`），画布上还写着当前该干嘛（见 render 里那段 banner，`shPickStep` 驱动），点歪了（没落在形状上）不再静默退出编辑态（`shDown` 第 5 步只提醒一句）；④ 「反向编号」对已铺过的形状**不再弹确认框**（`!sh.laid && !confirmOverwrite(z)`；铺到灯位 / 定头尾照旧每次都问）。

21. **画布位图必须与「CSS 盒子 × dpr」始终一致**（批 7-D-4，用户第四轮实测「点灯有偏差 / 手柄拖不动」的根因）：浏览器是把 `cv.width/height`（**位图**）拉伸到 CSS 盒子上显示的，而命中测试（`s2w`）按 **CSS px** 算 —— 两者一错开，整块画布就按比例偏（越靠边越偏）。而画布是 flex 子元素：右栏宽度、面板内容高低、滚动条有无、窗口在不同 DPI 的显示器间移动、浏览器缩放导致 dpr 变化……**都不发 `window.resize`**，只挂 `resize` 一定漏。现在三道保险：① `render()` 开头 `if (canvasStale()) resizeCanvas()`（**任何一次重画都自愈**）；② boot 时 `initCanvasWatch()` 给画布挂 `ResizeObserver`；③ `watchDpr()` 按当前 dpr 登记 `matchMedia('(resolution: Xdppx)')`，dpr 变了重算并**重新登记**。新增画布交互（命中 / 拖拽 / 手柄）时**不要自己算屏幕坐标**，一律走 `s2w` / `w2s`。另一半是「这一下到底算谁的」的规则：① 命中半径有**屏幕下限** `hitTol() = max(0.42 格, 9 屏幕 px)`，且取的是**最近的一颗**（不是第一颗）—— 老写法固定 0.42 格（世界 px），缩到 0.3 倍只剩 2~3 屏幕 px，等于要求亚像素精度；② **只有画出来的东西才允许抢按下**：手柄**只在「画形状」编辑态画**（`render()` 里 `const handleSh = shapeCur;`，没有第二个分支），所以只有这个模式认手柄（`if (mode === 'shape') handleAnyAt(wx, wy, false)`）—— 选择 / 放置 / 擦除模式下画布上一个手柄都没有，也就不可能抢点击（7-D-5 之前「选过形状就一直画手柄」的 `shapePicked` 已经删了）；③ 手柄外还有 1.6 倍容差的**缓冲圈**（`shHandleRing`），并且必须排在「包围盒内 = 挪动」**之前** —— 否则瞄着手柄差几像素，要么整块形状连灯一起被挪走，要么掉到包围盒外被当成「点空白」直接退出编辑态（手柄瞬间消失，看着就像「手柄抓不住」）；④ **一次按住就能改大小**（`beginShapeDrag()`：先 `enterShapeEdit()` 再立刻开 draft），不用「先点中、松手、再按第二遍」；⑤ 铺过灯的形状上，单击 / 双击**落在灯点上**都优先选灯（`dblclick` 里 `if (hit(wx, wy)) return;`）—— 连点两颗灯绝不该偷偷把工具换成形状编辑态（换了之后每次点灯都在挪形状，就是用户说的「点灯有偏差」）。这些规矩的回归测试在 `tests/test_canvas_map.mjs`：它把浏览器的位图 / CSS 盒子 / dpr 三样分开建模，再用记录型 2D 上下文抓住 `render()` 真正用的变换与每一次 `arc`，所以「屏幕上那个灯点被点下去会选中谁」是算出来的 —— **别的套件的假 DOM 里三者恒等（1200×1200、dpr 1），这类 bug 在那儿完全看不见**。改画布时也别在 `pointerdown` 里新开「模式判断」，按下顺序固定为：**定头尾（`shPickStep`，7-D-6 起排第一步 —— 那两下专门定头 / 尾，谁都别抢）** → 手柄 → 选择模式的形状内部 → 各模式自己的处理。画布上的 overlay 也有压层次序：**定头尾那一行提示必须画在最后**（7-D-6：原先画在灯之前，被彩灯点 / 形状轮廓压住 —— 用户实测第 1 条），它还得是**画布窗口左上角**的一行（7-D-6 先把它改成「最后画」不再被压住，7-D-7 再把位置钉死、跟视口平移缩放无关 —— 老写法挂在形状上方：形状一挪、一放大提示就跟着跳，还可能被塞进形状里面）。两条 7-D-4 补的：① **看不见的手柄不许存在** —— 既然规则是「只有画出来的才抢按下」，画与抢就必须同源：切模式（`setMode`）**当场 `render()`**（boot 早期 `state` 还没装就跳过）；② 7-D-5 把这条推到极致：手柄**只在编辑态画**（选择模式下就一个都不画）—— 用户第五轮实测「没进形状编辑，那 8 个蓝方块还在，铺灯时很容易变成边形状」，所以在选择模式按住形状边**算挪动**（不再是「偷偷改大小」），要改大小先按住进编辑态。

22. **「删除分区」= 把这一段从板上整段收走，不是只删表里那一行**（批 7-D-9，用户第十轮实测「要连带灯和形状一起删除干净」）：UI 段 `zoneDelClean(zi)` 一次做四件事 —— 删号段 `[start, start+count)` 里的灯；删挂在这个分区上的形状（归属没了的形状只剩「参考线」，留着就是残渣）；**后面的编号往前挪 `count` 位**（灯号 / 其它分区的 `start` / 形状记的 `first` 一起减）；`meta.ledCount` 跟着减 —— 等效用户手点「删除 → 压缩编号 → 改小灯总数」，删完校验页**不会**冒出 `V2/V3/V4/V5/V9` 那一串。`snapshot()` 在动手之前拍，Ctrl+Z 连编号一起回来。**老写法只 `state.zones.splice()`**：灯原地留下 → 校验页一屏 `V4`「不属于任何分区」、形状掉成「参考线」，这就是用户说的「删不干净」。以后再加「删分区 / 删形状 / 删灯」这类动作，**先想清楚「这一段还剩什么」再动 `state`**：号段、形状的 `first`、`meta.ledCount`、`sel` / `selZone` / `selShape` / `shPick*` 这几样都得跟着收尾（定头尾的目标被删掉要 `shPickEnd()`）。顺带：分区页那 **5 条静态灰底说明的条数与长度**被 `test_ui` 17.1 数着（≤ 5 条、每条 ≤ 100 字），想补说明请写进 `data-tip` / 帮助页。

23. **「分区顺序」= 板上的编号顺序；换顺序就得把编号按新顺序重排**（批 11，用户第十一轮实测「要交换分区顺序 —— 分区的灯数与形状保持不变，灯的编号自动重新排序」）：分区表的先后**不只是显示顺序** —— `exportC` 里 `g_default_zones[] = {start,count}` 就按它排（固件按这张表认分区），所以「挪位置」真正要做的是**重排编号**。分区页新增「上移 / 下移」两键 → UI 段 `zoneMove(zi, dir)`：相邻两段互换后调 `zoneRelayNumbers(oldStartById)` —— 先拿「挪之前每个分区 **id** → 它的旧 `start`」建一张 `旧编号 → 新编号` 映射（从最左边那段起重新铺、每段长度不变、段内先后照旧），然后 ① 每个分区自己的 `start` 改成新值；② **灯跟着自己所属的分区换号**（坐标一颗不动，变的只是谁拿哪个号）；③ 形状的 `first` 按「段内偏移不变」跟着自己分区的新 `start` 走；④ `sel`（框选）跟着换号。**这里踩过一次**：形状的旧起点必须按 **id** 查（`oldStartById[sh.zone]`）—— 第一版拿「换完位置后的新下标」去查旧 `start` 数组，号段整体错位（顶环的 `first` 直接飞到 16、校验页冒出 8 个 `V1`），`test_ui` 第 19 段那条「每个形状的 first 必须等于它所属分区的新 start」就是为它立的。另有一条**更隐蔽**的：`zoneRelayBinds(zi, zj)` —— 模式绑定里 `binds[].zones` 存的是**分区序号**（不是 id），而且是「覆盖哪些分区」的集合（空数组 = 全部分区，自动跟着新顺序走、不用动），换顺序时**必须把这两个序号在每条绑定里对调**，否则绑定会悄悄改指到别的分区去；这条只有「一个分区一条绑定」的存档（`#mdAllZones` 拆开那档）才看得见，测试里就是这么验的。`snapshot()` 在动手之前拍，Ctrl+Z 连编号一起回来；上移再下移逐灯逐位比对 = 完全回到原样（可逆）。**导出物与契约零改动**：`exportC` 本来就按 `state.zones` 的顺序排，所以换完顺序导出的 `g_default_zones[]` 自然跟着变 —— 测试直接把这条当契约验了。

24. **数字输入框不能一「清空」就回填**（批 11，用户第十一轮实测「分区的 count 参数没办法彻底删除再输入新参数，框里始终有个 1」）：老写法 `z.count = Math.max(1, +e.target.value || 1)` —— 用户全选删掉的一瞬间 `value === ''`，`+'' || 1` = 1，紧接着 `afterChange → syncZoneEdit` 又把「1」写回框里，于是**永远打不进新数字**（`start` 同理回填 0）。现在统一走 UI 段的 `bindNumField(id, { get, set, min, max })`：`oninput` **只在「确实打出了一个数」时才落状态**（空着 / 只打了个负号先不动 state，框里就保持空的，用户能接着打字），`onchange`（离开输入框）才定稿 —— 空着离开 = 这次没改，把原值写回来；越界 / 负数在定稿时夹紧。`#zStart` / `#zCount` / `#mLedCount` 都已切过去，**以后新增数字框一律用它**，别再写 `+e.target.value || N` 这一类「清空即归零」的写法。

25. **效果名是「算出来」的，不是「存下来」的**（2026-10-16，用户要求「名称改为自动生成，用现有的【模板+配色】规则」）：名字的唯一来源是 core 的 `fxEffectName(e)` = `模板 / 配色` —— 内建的「模板」= `FW.ANIM_NAME[anim]`（如「单点追逐」），自定义的 = `e.tpl`（**最近一次套用的预置模板名**，`applyPreset()` 写入；缺省 = 「自定义」），配色取 `FW.COLOR_NAME[color]`。`defaultEffects()` 也走它（内建 9 条的默认名与从前逐字相同）。界面侧：`#fName` 是**只读** `<b>`（`syncFxEdit()` 写 `textContent`），**没有** `bind('fName')`；改参数后由 `fxLive()` / `fxStruct()` 里的 `fxSyncName()` 重算。两条别踩：① **只算 `selEffect()`** —— 「正在微调某条绑定的覆盖」那份 `editBinding.override` 的名字由模式页给出（带「覆盖」），`test_override` 断言它，别被顺手改掉；② `fxLive()` 里**不能**整体调 `syncFxEdit()`：它会 `renderLayers()` 重建图层卡 DOM，正在拖的数值框当场失焦 —— 这里只用 `syncFxName()` 刷 `#fName` 那一格 + `renderFxList()`。名字**只进导出的 C 注释**（中文注释写 `name`、ASCII 注释写 latin 别名），不进固件数据，所以导出物 / 契约账本 / C 模板都不受影响。


26. **效果页的「播放」是编辑台自己的，别跟动画页的灯板混起来**（2026-10-16，用户要求「把【播放】独立出来，常驻在效果模块下方，加暂停 / 调速 / 步进 / 上下效果切换」）：
    ① **两套时钟**：`loop()` 里 `acc` 给灯板（`A().rate`）、`accS` 给编辑台（`stageRate()` = `state.stage.rate`，兜底 1×）—— 播放条上调倍率**不许**改 `A().rate`（那会把动画页的灯板预览也带快）；「从头计时」一律走 `resetClock()`（同时清两个累加器），别再手写 `lastT = performance.now(); acc = 0;`（原有四处已换掉）。
    ② **两个播放状态**：编辑台 `stagePlaying`、灯板 `A().playing` 互不影响（`test_solo` 守着）；`#fxTest` 的 onclick 只走 `stageToggle(on, restart)`，restart=true = 从头放。
    ③ **「上一条 / 下一条」= 只换「现在看哪一条」**（`fxSelMove`）：动 `selFx` + `state.anim.effectId`（顺手清过滤、落库），**绝不动库里的顺序**（那是「上移 / 下移」`moveFx` 的事），也不动模式绑定；播放中切换**不打断**播放。
    ④ 播放条**必须排在效果页最后一个控件的位置**（`#fxPlayBar`），`test_stage` §10 数着它的位置与控制件 —— 以后往效果页加控件，**加在播放条之前**，别把它挤到中间。**钉底要两道一起**：`#paneFx{padding-bottom:0}`（这一页那格的下内边距留 0）+ `.fxbar{margin-bottom:0}`（`fieldset` 默认带 10px 外边距），配合 `bottom:0` —— 少一条，滚到底时条子会往上跳一小截（上一版只写 `position:sticky; bottom:-8px`，用户实测「还是随滚动条移动，范围很小」）。
    ⑤ **图标键里那行字收在 `.vh` 里，别改按钮的 `textContent`**：播放键里挂着两个 `<svg>`（`.iPlay` / `.iPause`），`syncStagePlayBtn()` 只 `classList.toggle('on', stagePlaying)`（由 CSS 切图标）+ 写 `#fxPlayBtnTxt`（`.vh` 里那行字，读屏与测试用）。写 `$('#fxTest').textContent = …` 会把那两个 svg 一起冲掉（表单控件里再挂新的图标键照这个来）。
    ⑥ **效果页的灰字规矩跟「分区」页一样**（静态灰底说明 ≤ 5 条、每条 ≤ 100 字，`test_stage` §12 数着）：新说明优先写进控件的 `data-tip` 或帮助页，别再往页面上堆 `.hint`；按钮行一律用 `.btnrow`（`flex + gap:4px`，行内标签加 `.lb` 与 `label.row` 的 56px 标签列对齐），**别再写 `style="margin:4px 0"`** —— 那样每个子块各排各的，宽窄不齐。**悬浮说明也要短**（播放条那六个图标键各一条，压在一行内 ≤ 30 字，`test_stage` §10.1b 数着）。
    ⑦ **步进是「拨相位」，不是「多跑几拍」**（2026-10-16 第二轮，用户要「前一帧 / 后一帧两种」）：`stageStep(dir)`（dir=+1 后一帧、-1 前一帧）先把 `inst.anim.position.target` 往目标方向挪 256（位置单位是 1/256 颗，256 = 一个灯位；取模 `RING_SIZE*256`），用 `ringSetPosition(…, speed_cur, OUT_QUAD)` 起插值，**再跑同样多的 `instTick` 把这段插值走满** —— 一次按键正好落在一格上（老写法只是干跑 `speed_cur` 拍，落点停在这一格插值的半路上，前后也没法对称）。跑之前把 `inst.step_cnt` 设成 `-n`，免得 `instTick` 里那条自动前进又叠一格；跑完设回 0（＝固件自己走完一格后的状态）。**走不走位置先问 core 的 `instAdvances(inst)`**（`instTick` 与它**共用同一份判断**：位置型动画 CHASE_SINGLE / CHASE_DUAL / SWING 或 `moves`）—— 不走位置的效果（呼吸 / 闪烁）只把那几拍的账走掉、相位不动，状态栏也照实说，别假装它动了。

27. **勾选框（方块）要贴着自己的功能文字，别让「控件列」或别的元素把它顶远**（2026-10-16，用户实测「几个勾选的方块 UI 有偏差，和对应的功能文字离得有点远了」）：四条 ——
    ① `label.row>input[type=checkbox]{flex:0 0 auto}`：**别让上面那条 `label.row>input{flex:1 1 auto}`（「控件列吃掉剩余宽度」）把方块也一起撑开** —— 撑开后浏览器把方块画在被撑宽的框里，**方块离文字多远全看这一行有多宽**，同一个页面里各行还不一样（看着像没对齐）。
    ② `input[type=checkbox]{margin:0}`：浏览器 UA 样式给勾选框自带 `3px 3px 3px 4px` 外边距，会把方块从旁边文字推开一点（而且各处推的量看着不一样）；行里已经有 `gap` 了，归零。
    ③ **勾选框行的 `label` 要加 `.ck`**（`class="row ck"`，全工具 12 处）：`label.row.ck{gap:5px}` + `label.row.ck>span:first-child{min-width:0; max-width:none}` —— 标签列不再为「对齐控件列」留 56px 空档，**方块紧贴自己的文字**。`test_ui` §20 数着「每个含 checkbox 的 `label.row` 都得带 `.ck`」，新增勾选框行照抄就行。
    ④ 图层卡那枚「启用」方块：卡片标题**不能** `flex:1`（那是把它顶到复制 / ↑ / ↓ / × 那一头的元凶）—— 标题改 `nowrap + ellipsis`，方块靠 `.cardHead .layOn{flex:0 0 auto; margin:0 auto 0 2px}`（`margin-right:auto` 吃掉中间空档：方块跟在标题后面，小键仍靠右）；`test_effects_ui` §6b 数着「方块排在卡片头第 2 位、标题仍是第 1 位」。**纯 CSS / 类名 / 一处 inline style 的改动，导出物、`state`、图层原语都没动。**

## 当前状态与接下来的事

工具本体功能完整、1399 项断言全绿（`node tests/run_all.mjs` 实测 24 套件 / 1399 项 / 0 FAIL）。逐模块优化的体检报告在 [docs/module-audit.md](docs/module-audit.md)（**索引**：怎么用 + 目录；正文按模块分在 `docs/audit/` 下 12 份，一页 = 一份 —— 可优化点、优先级批次、验收清单）—— 批 0/1/3/4、5-A、6-A、7-A/B、7-C、7-D、7-D-2、7-D-3、7-D-4、7-D-5、7-D-6、7-D-7、7-D-8、7-D-9、**批 11（分区顺序上移/下移 + 数字框能删干净重填）**、批 2 的分区三条（Z2 / Z3 / Z4 ✓5135e3c）、效果页两条（F1 / F2 ✓894515f）、**模式页三条（M2 预览模式 / M3 绑定全选全不选 / M5 按分区拆开下放到每条绑定）** 与**效果页播放条两轮（4f07af8 / 6f3129）+ 第三轮（F9 二刷）**、**界面通用 H10（勾选框方块紧贴功能文字）**、**效果页配色内核（6 种配色 / 调色板 / 呼吸 / 覆盖）** 均已落地（历史见 [docs/CHANGELOG.md](docs/CHANGELOG.md)）。已知待办：

1. **抽公共测试驾具**：20 个套件各自抄了一份假 DOM（`install()` / `mkEl()` / `querySelector` 桩），改一处要改 20 处。应抽成 `tests/_harness.mjs`（注意 `ctxDraw` 是可变全局，抽取时用 getter/setter 包装）。
2. **`_fxui_body*.js` 的构建脚本**没搬过来 —— 有 6 个套件是从 `test_split.mjs` 前缀 + 各自 body 拼出来的。现在它们是完整独立文件 ✓ 能直接跑，但改公共部分时要留意重复。
3. **目标平台契约 v1 剩下的**（`docs/firmware-contract.md` 第四节）：② 引擎自洽化（把查表/原语改成工具导出、去掉 `led_ring.h` 依赖、清空附录 A 账本，工作量最大）；③ `led_gen_config.h` 参数头；④ 多后端（MVsB1 / 通用 C / Arduino-FastLED 各一份 `port.c`）。
4. **渲染后端只有「生成 C 头文件」一种**；以后可加 Arduino/FastLED、或直接出二进制。
