# LedStudio 项目交接文档

> 目标读者：接手本项目的下一个 AI 编码助手（Cline）。
> 先读这份，再读 [CLAUDE.md](CLAUDE.md)（里面有 15 条踩坑记录，改代码前必看）和 [README.md](README.md)（面向用户）。
> 本文由 Claude Code 在 v1.0 提交（`9209a17`）时整理，描述的是当时的代码状态；后续变更见文末「变更记录」。

---

## 0. 一句话认识这个项目

**LedStudio** —— 一个**单文件、离线、零依赖**的 LED 灯效设计与代码生成工具。
交付物只有一个 HTML 文件 [led_layout_editor.html](led_layout_editor.html)（约 4750 行 / 244 KB），浏览器双击打开即可用，**没有构建、没有 `npm install`、没有 lint**。

它做三件事：① 画灯板排布（每颗灯的位置 + SPI 编号顺序）→ ② 在基础排布上编辑灯效 → ③ 生成能贴进目标固件的 C 代码（效果表 + 模式表 + 渲染器 + 固件补丁说明）。

原本为山景 BP1048B2 蓝牙音箱（SP-3122D，104 颗灯）做的，现独立成通用工具。目标固件接口约定见 [docs/firmware-contract.md](docs/firmware-contract.md)。

---

## 1. 整体架构与模块划分

### 1.1 文件结构

```
led_layout_editor.html       工具本体（唯一交付物）
README.md                    面向用户的说明
CLAUDE.md                    给 Claude 会话的项目说明（含 16 条踩坑）
HANDOFF.md                   本文件（交接文档）
docs/firmware-contract.md    目标固件必须提供什么 / 一次性补丁
tools/extract_fw_tables.py   从固件源码重抽查表与 fixture
tests/                       测试（node 直接跑，无需 npm）
  run_all.mjs                一键跑全部
  test_*.mjs                 20 个套件，每个独立可执行
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

core 脚本末尾有一份**手写的导出清单** `const CORE = { FW, GEN, resolveEffect, renderZoneMaskTo, … }`（在约 2831 行）。**测试只能看到这份清单里的符号**。往里加函数/常量时**必须**同步这份清单，否则测试抽不到（`CORE.xxx` 是 `undefined`，报错还很绕）——这就是 CLAUDE.md 坑 13。

### 1.3 core 脚本内部的模块（按出现顺序）

- **FW 对象**（约 691 行起）：固件常量 + 查表。含 `LED_COUNT/RING_SIZE/ZONE_MAX/ZONE_MAX_LEN`、`ANIM`（5 种内建动效枚举）、`COLOR`、`EASE`，以及 `ease_out_quad_tbl[256]`、`cos_window_tbl[256]`、`spectrum_tbl[256]`（彩虹 `{r,g,b}`）、`presets[9]`（9 个内建效果）。**这些查表由 `tools/extract_fw_tables.py` 从固件源码逐字提取，严禁手改**。
- **GEN 对象**（约 755 行起）：几何排布。`rectPath(W,H,dir)` 生成矩形环绕圈路径，`rectLeds(p,cell)` 撒点编号。
- **几何 / 分区方向**：`deriveZoneDir`、`zoneReverse`（方向由几何推导，不存储）。
- **校验**：`validate`（校验页的逻辑）。
- **工程模型**：`emptyProject()`、`projectFromPreset()`、`PRESET_SP3122D`、`defaultEffects()`、`newCustomEffect()`、`emptyModes()`、`defaultModesFromEffects()`。
- **动效（逐字移植固件 `ring_tick`/`render_all`）**：`animNew/animSet/animUpdate`、`zoneScaled`、`chaseSingle/chaseDual/fillAnim`、`colorUpdate`、`renderZoneMask`。
- **图层 / 渲染原语**：`LAYER/FALL/WAVE/CMODE` 枚举，`genSpot/genTwinkle/genFill/genGradient`、`genRender`、`renderZoneMaskTo`、`layerHue`、`pulseGain`、`bouncePos`、`effectColorAt`。
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

三种共有：**波形**（`WAVE`: 三角=呼吸 / 方波=闪烁 / 锯齿=跳变）、**配色模式**（`CMODE`: 跟随效果配色 / **本层空间色相** = 每颗灯自己的色相，用来做绕环彩虹）。效果级还有**起始位**（`offset`）与**随位置前进**（`moves`）。

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
| 16 个预置模板 | ui `effectPreset`（单点追逐/双点追逐/多点追逐(4)/拖尾彗星/摆动/呼吸/闪烁/跳变/绕环彩虹/彩虹光点/沿环渐变/渐变旋转/双向填充/呼吸彩虹/随机闪/闪+底色） |
| 效果编辑台（直线 + 圆环 + 8/24/40 多长度对比） | ui 效果编辑台 `stageView`；状态在 `state.stage` |
| 模式分配 + 覆盖参数 | core `resolveEffect/bindKey`；ui 模式页 |
| 动画页真实灯板预览 | ui 动画页；core `sim*` / `renderAllSim` |
| 速度档跟着音乐变（预览可模拟） | ui `#aSpeed` 的「自动」+ `#aAudio`「音乐来了」；core `ringIsFast/instSpeedFromRing/simSyncSpeed`；生成的 C 用同一条判据（`led_gen_tick`）—— 见 docs/firmware-contract.md 第三节 |
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

### 测试覆盖（20 套件、646 项断言）

| 类型 | 套件 | 验什么 |
|---|---|---|
| 纯逻辑 | `test_effects_core`(56) `test_core`(30) `test_map`(8) `test_wrap`(4) `test_anim`(10) `test_effects_c`(43) | 图层原语、排布生成、校验、C 文本、回绕修正、速度档信号链 |
| 真编译 | `test_effects_c_exec`(10) | 用 AndeSight cygwin gcc 真编译生成的头文件、真运行，**3 模式 × 37 帧整个 104 灯 fb 与 JS 预览逐字节比对**；另有一段**前半慢档 / 后半快档**的音量档场景（验「音乐来了会变快」这条链路） |
| 假 DOM | `test_effects_ui`(50) `test_ui`(69) `test_anim2`(30) `test_modes`(25) `test_override`(29) `test_fx_presets`(32) `test_stage`(22) `test_split`(25) `test_help`(51) `test_export`(77) | 界面层真跑一遍（`boot()` 走通）、交互、接线（含速度档「自动」接线）；`test_help` 断言帮助页章节与 `data-tip`；`test_export` 断言导出窗口开关/三页签/「另存为」与回退下载/取消/拖动/Esc、右栏宽度上限自适应，以及批 1 的「校验没通过时导出被红条挡住」；`test_ui` 另守住批 5-A 的「板级参数 / 铺灯 / 底图 都在 zones 面板里」 |
| 持久化 | `test_persist`(31) `test_solo`(31) | 关掉再打开还在、迁移、状态隔离 |
| 结构 | `test_struct`(13) | 脚本分块结构 |

> 注：断言计数以 `run_all.mjs` 的统计为准（靠正则 `/  PASS  /` `/  FAIL  /`），上表括号内是粗略的 `ok(` 行数，仅供参考。

---

## 5. 进行中 / 未完成的功能（及当前思路）

工具本体**功能完整、646 项断言全绿**。以下是已知待办（原样摘自 CLAUDE.md「当前状态与接下来的事」）：

1. **抽公共测试驾具**：20 个套件现在**各自抄了一份假 DOM**（`install()` / `mkEl()` / `querySelector` 桩，其中 8 个文件直白地各写了一份），改一处要改 20 处。应该抽成 `tests/_harness.mjs`。
   - **注意**：测试里 `ctxDraw` 是可变全局，抽取时要用 getter/setter 包装。
2. **`_fxui_body*.js` 的构建脚本**（原来在临时目录）没搬过来 —— 有两个套件（`test_effects_ui`/`test_fx_presets`/`test_solo`/`test_stage`/`test_override`/`test_split`）是从 `test_split.mjs` 的前缀 + 各自 body 拼出来的。现在它们是完整独立文件 ✓ 能直接跑，但改其中一个的公共部分时要留意重复。
3. **目标固件契约还偏窄**：生成代码现在假定目标有 `led_ring.c`/`spimled_service.c` 那套结构（`ring_t`、`anim_ctx_t`、`ANIM_TYPE_COUNT`、静态的 `anim_render_*`）。要真正通用，得把这层抽成可配置的「后端」。
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
15. 速度档是 **ring 级信号**（`ring->speed_cur`，由固件 `ring_set_audio_level()` 按音量切），生成代码在 `led_gen_tick()` 开头同步进每个实例；预览侧 `simSetSpeed()` 也走同一条路（改的是 `sim.speed_cur` 再广播）。改判据要 C/JS 两边一起改（`ringIsFast()`），否则真编译套件立刻红。

### 6.2 底层硬件约束（详见 docs/firmware-contract.md）

- **`gen_tick` 必须是 `anim_ctx_t` 的字段**，不能用函数内 `static` 计数器：`anim_render_zone()` 每分区每帧都被调一次，用 static 会跑成 5 倍速。
- **`ring_set_position()` 回绕修正**：老固件「灯点转一圈闪一下」，根因是 `anim_set()` 把 `from` 设成当前值（5888）而目标是 0，插值沿最直的路倒扫整圈。修法是把 `from` 折算到离 `target` 最近的等价位置（位置以 `RING_SIZE*256` 为周期）。
- **`zpos` 归一化**：回绕瞬间 `pos` 会略小于 0，C 的 `/` 对负数**向零截断**、JS 是 `Math.floor`，两边差 1，破坏「预览与代码逐字节一致」。需在两边都归一化。
- **效果数 > 9 时**：固件模式键在 `MODE_OFF`(=9) 处回绕，只选得到 9 条。生成文件接管 `RING_PRESET_COUNT`，但 `main_task.c`、`main.c`、`display.c` 三处要跟着改（数码管 `(LEDMode+1)%10` 只显示一位，工具不管）。
- **速度跟着音乐变（`ring->speed_cur`）**：固件 `spimled_service.c` 每 20ms 调 `ring_set_audio_level(&g_ring, mainAppCt.FFTLevel)`，按 `LED_FFT_THRESHOLD` 把 `ring->speed_cur` 在 `speed_slow` / `speed_fast` 之间切。打补丁后 `ring_tick()` 已被 `led_gen_tick(ring)` 取代，**只有生成代码读这个 ring 级档位**才能生效（否则永远慢档）—— 现在 `led_gen_tick()` 每帧同步它。不需要额外补丁。注意 `ring->speed_slow / speed_fast` 打补丁后不再由 `ring_apply_preset()` 刷新（`ring_init()` 里是 8 / 1），只作判档参考。
- **连续编号假设**：生成代码假定分区在 SPI 链上连续编号（`start + i`）。目标板子编号不连续需要额外映射，目前没做。
- **颜色顺序假设**：生成代码直接用 `ring->fb[phys][3]`，R/G/B 顺序。目标用别的顺序要在 `led_gen_render_mode()` 里换。
- **彩虹表耦合**：色相/彩虹依赖 `spectrum_tbl` 是 `{r,g,b}` 的 256 项数组，换表就换整套配色风格。

---

## 7. 接下来需要实现的具体任务列表

按优先级 / 依赖排序：

0. **逐模块优化（当前主线）**：见 `docs/module-audit.md` —— 页签 = 模块的体检结果（每条 = 现象 + 证据行号 + 严重度 + 改动面 + 验收清单），按批次推进，每个模块一次提交（commit message 带条目号）。**批 0 / 1 / 3 / 4 与 批 5-A（分区 + 生成 合并成一页）已落地**；批 2（易用性）与 批 5 的 B / C（`zone.rect` 扶正、画布直编）待做。
1. **抽公共测试驾具 `tests/_harness.mjs`**（坑 12 相关，`ctxDraw` 用 getter/setter 包装）—— 消除 20 个套件各抄一份假 DOM 的重复，之后改测试公共部分只改一处。
2. **补 `_fxui_body*.js` 的构建脚本**（原来在临时目录）—— 或者用抽出的 `_harness.mjs` 统一掉那 6 个「`test_split.mjs` 前缀 + body」拼出来的套件。
3. **把目标固件契约抽成可配置的「后端」** —— 把 `ring_t`/`anim_ctx_t`/`ANIM_TYPE_COUNT`/静态 `anim_render_*` 这层对目标固件的硬假设抽象成可配置项（见 firmware-contract.md 第六节「移植到别的固件」的已知注意点）。
4. **新增渲染后端**：目前只有「生成 C 头文件」，可加 Arduino/FastLED 后端、或直接输出二进制。
5. （若继续做）**非连续编号映射**、**非 RGB 颜色顺序**等硬件适配项，等「后端」抽象做完后作为后端配置项落地。

---

## 8. 基础公约与代码要求（务必遵守）

### 8.1 全局公约（用户全局 `~/.claude/CLAUDE.md`，适用于所有项目）

- **编程语言**：C 语言（针对目标固件侧；LedStudio 工具本体是 JS）。
- **文件编码**：默认 Windows ANSI（GBK/CP936）。**修改 GBK 文件**（如固件 SDK 源码）时：用 Python 以二进制模式读写 + `str.encode('gbk')` 做字节级替换，**禁止用 Edit 工具往 GBK 文件写中文**（会被写成 UTF-8 导致乱码）。
- **代码修改原则**：修改/删减代码时**保留原代码，注释掉**，而不是直接删除；新增代码紧跟其后。注释掉的代码保留原缩进和格式。
- **编译**：不需要编译，只负责写/改源码。
- **项目上下文**：日常开发基于山景 BP10 系列蓝牙音频芯片；主要 SDK 版本 MVsB1_BT_Audio_SDK_v0.3.2 / v0.3.4；资料目录 `D:\Work\资料\山景资料\...`；工作代码目录 `D:\Work\MountainView\Demo_Test\`。

### 8.2 LedStudio 项目公约

- **没有构建、没有 `npm install`、没有 lint** —— 工具就是一个 HTML 文件，改完刷新即可。
- **改 core 之后务必跑 `node tests/run_all.mjs`**。
- **改图层原语或 C 模板后必须跑 `test_effects_c_exec`**（真编译）—— 它验的是「预览和生成的代码是不是一回事」。
- `run_all.mjs` 靠正则 `/  PASS  /` `/  FAIL  /` 统计断言数，**每个套件的 `ok()` 帮手必须原样输出这两个串**（两个空格、四字母），否则断言不计入总数。
- core 里新增函数/常量必须加进末尾的 `CORE = { … }` 导出清单。
- 改帮助页文案/`data-tip` 前先看 `test_help.mjs`。

### 8.3 代码风格

- 与周围代码保持一致：注释密度、命名、写法。
- 中文注释为主（工具内文案面向中文用户）；core 的 C 模板注释用 `@key@` 占位 + `GEN_COMMENTS` 双语替换。
- 引用文件用 `file:line` 形式（如 `led_layout_editor.html:2626`），方便点击跳转。

---

## 9. 快速上手命令（接手后先跑一遍）

```bash
# 打开工具：双击 led_layout_editor.html

# 全部测试（必须在项目根目录跑，脚本按相对路径读 html）
node tests/run_all.mjs

# 只跑名字含这些字样的套件
node tests/run_all.mjs 效果 编译

# 单个套件也能直接跑
node tests/test_map.mjs

# 真编译套件（需 cygwin gcc 进 PATH，否则 cc1.exe 找不到 DLL）
export PATH="/c/Andestech/AndeSight_RDS_v323/cygwin/bin:$PATH"   # bash / git-bash
$env:PATH='C:\Andestech\AndeSight_RDS_v323\cygwin\bin;'+$env:PATH   # Windows PowerShell
node tests/run_all.mjs effects_c_exec

# 从固件源码重抽查表（--fixture 更新回归锚点，--js 输出贴进 html 的片段）
python tools/extract_fw_tables.py --sdk ../LED_Optimize/MVsB1_BT_Audio_SDK_v0.3.4 --fixture --js
```

---

## 10. 关键注意点速查（改代码前 5 秒扫一遍）

1. core 加了新东西 → 记得同步 `CORE` 导出清单（坑 13）。
2. 动了图层原语 / C 模板 → 跑 `test_effects_c_exec`。
3. 动了帧内容 → 走 `applyFrame()` + `render()`（坑 2）。
4. 动了 `state` 引用 → 原地 `Object.assign`（坑 1）。
5. 动了帮助页文字 / `data-tip` → 看 `test_help`（坑 14）。
6. 动了面板 CSS → `.pane` 在 `#right` 里、`overflow:auto`、`#right` `min-height:0`（坑 11）。
7. 查表（`cos_window_tbl`/`spectrum_tbl`/`presets`）→ 用 `extract_fw_tables.py` 抽，不要手改。

---

## 11. 变更记录

**2026-10-14 —— 批 5-A：「生成」页并入「分区」页（页签 8 → 7）**

- **动机**：用户实测后的原话 —— 「[分区] 模块可以和 [生成] 模块合并，客户在此页面就可以参照实物布局和形状，来在画布上进行彩灯样式编辑」。现状是「看照片 → 定形状 → 铺灯 → 调编号」被拆在两页，而「生成」页里的 `#gZone` 下拉只是为了在两页之间传「给哪个分区铺」。本轮按用户选择**只做 A（页面合并）**，画布交互保持不变。
- **页面**：`data-pane="gen"` 整块搬进 `data-pane="zones"`，顺序改为 板级参数 → 分区表（+ 增删）→ 选中分区 → 灯 → 铺灯 ×3（矩形环绕圈 / 圆环圆弧 / 矩形描点）→ 底图 —— 自上而下就是「换一块板」的工序：先对 `<define>`，再排分区，再按形状铺，最后照底图核对。
- **删 `#gZone`**：下拉与它的 `onchange` 一起删；铺灯目标 = 分区表里当前选中的分区（`selZone`），同一页直接看得见，不再需要「二手选择」。
- **快捷键**：`g` / `t` 原来都是「跳生成页」，现改指「分区」页 —— 不留「按了跳到空白面板」的死键。
- **文案**：`btnProjNew` 的状态栏提示、铺灯的前置提示、帮助页「整体流程」第 1 条（补上「这一页还管板级参数 / 铺灯 / 底图」）。
- **测试**：`test_ui` 新增「1b」块 3 条（页签与面板里都不再有 `gen`、`#gZone` 已删、16 个控件都落在 zones 面板里）；`test_help` 的「去做」目标页改为**按实际页签列表**校验（以后合并 / 改名页签不会失效）→ 全量 **20 套件 / 646 项 / 0 FAIL**（`test_ui` 66 → 69，其余套件不变）。
- **未做**：批 5 的 B（`zone.rect` 与铺灯表单互相回填、跟着项目存盘）与 C（画布上点灯即选分区、拉框定形状、拖形状手柄重铺）。注意 `zone.rect` 在预设里已经存在、只被 `buildPreset` 消费过一次 —— **B 是 C 的地基**，顺序不能倒。见 `docs/module-audit.md` 第 11 节批 5 记录。

**2026-10-14 —— 批 1「防呆闭环」落地（`81dd19f` / `d90ddc8` / `0677fed`）**

- **导出不再放过错误（E1 + C3）**：`EXPORT_KINDS.{fx,table}.gate = true`，生成前先过 `exportGate()` —— 工程里有 `err`（如 V5/V9）时清空输出区、在导出窗口顶部亮红条（列出条数与错误代码），点「仍要导出」才放行（`expForce` 只放行这一次，重开窗口会再问）。`.json` 是整库备份，标 `gate:false`：只提示、不拦。
- **校验条目能跳（C1）**：`validate()` 的条目多了 `jump:{pane, zone|fx|mode}`，点校验页的条目就切到对应页并选中那一条（涉及编号的仍照旧闪灯），`jumpTip()` 把「点它能跳到哪」写进悬浮提示。
- **绑定冲突有校验（M1）**：新增 `V34`（warn）—— 同一模式内同一分区被多条绑定覆盖（一条绑定不勾分区 = 全部分区）时点出分区名与「第几条绑定」，并跳回那个模式。
- **铺灯不再静默覆盖（G1）**：`#gApply`/`#cApply`/`#qApply` 动手前数一下号段上的现存灯，先问一句（写清颗数与「可撤销」）；号段空着就不打扰；`genInfo()` 常驻显示「该号段已有 N 颗，铺灯会覆盖」。
- **删效果不再静默丢引用（F4）**：确认框列出「哪个模式的几条绑定在用它」，并说明那些绑定会变成「（空）」，删完按 `warn` 级提醒去重选。顺带修 F3 文案（「效果顺序已调整」）。
- **测试**：+50 条（`test_core` 30 / `test_ui` 66 / `test_export` 77 / `test_effects_ui` 50 / `test_modes` 25），全量 **20 套件 / 643 项 / 0 FAIL**。

**2026-10-10 —— 速度档跟着音乐变（不需要新的固件补丁）**

- **根因**：补丁 [5] 把 `ring_tick()` 换成 `led_gen_tick(ring)` 之后，推进实例的只剩生成代码，而它只读实例自己的 `speed_cur` —— 固件 `ring_set_audio_level()` 每 20ms 写的 `ring->speed_cur` 没人读，速度永远停在慢档。
- **改法（零固件改动）**：`led_gen_tick()` 每帧先算一次 ring 级档位（`ring->speed_fast < ring->speed_slow && ring->speed_cur <= ring->speed_fast`），再把 `I->speed_cur` 设成该实例自己的 `speed_fast` / `speed_slow`。判据保守：固件没接音量或参数退化（`fast >= slow`）时一律慢档，与打补丁前行为一致。
- **预览同源**：`simInit()` 增加 ring 级 `speed_slow/speed_fast/speed_cur`；`simSetSpeed(sim,'fast'|'slow')` 改为「改 ring 级 + 广播」（等价 `ring_set_audio_level()`）；`simTick()` 每拍同步一次。新增纯函数 `ringIsFast()` / `instSpeedFromRing()` / `simSyncSpeed()`（已加进 `CORE`）。
- **界面**：动画页「速度档」新增「自动（跟着音乐）」；新增「音乐来了」按钮（仅自动档可用，文案与 `on` 状态跟着切；`A().audio` 随项目存盘）。
- **文档**：`docs/firmware-contract.md` 新增第三节「速度档怎么跟着音乐走」并重编号（原三～六 → 四～七）；补丁清单新增 [7]（速度档，无需补丁），原 [7] 变 [8]；工具内帮助页加说明；README / CLAUDE.md（新增坑 15）同步。
- **测试**：+16 条，合计 **437**。真编译套件新增「前 18 拍慢档 + 后 19 拍快档」场景（C 侧与 JS 逐字节一致 + 快档段确实与原慢档不同）；`test_effects_core` 加信号链 7 条；`test_anim2` 加自动档接线 6 条；`test_help` 加帮助页 1 条。

**2026-10-10 —— `b7aef3a` 文档落盘**：补交 `HANDOFF.md`、`LedStudio.code-workspace`，更新 CLAUDE.md 踩坑（v1.0 提交 `9209a17` 之后的工作）。同批修正 `test_modes.mjs` / `test_split.mjs` 开头写错的文件说明，并在 README / CLAUDE / HANDOFF 的真编译命令旁补 Windows PowerShell 写法（`export PATH=...` 在 PowerShell 里不成立）。

