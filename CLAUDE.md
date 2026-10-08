# CLAUDE.md

本文件给后续的 Claude Code 会话当项目说明。**先读这一份**，细节再看 `docs/`。

## 这是什么

**LedStudio** —— 一个**单文件、离线、零依赖**的 LED 灯效设计与代码生成工具。

打开 [led_layout_editor.html](led_layout_editor.html) 即可用（双击进浏览器）。它做三件事：

1. 画出灯板排布（每颗灯的位置 + SPI 编号顺序）
2. 在**基础排布**上编辑灯效（追逐/彩虹/呼吸/…）
3. 生成能贴进目标固件的 C 代码（效果表 + 模式表 + 渲染器 + 补丁说明）

原本是给山景 BP1048B2 蓝牙音箱（SP-3122D，104 颗灯）做的，现已独立成通用工具；目标固件的接口约定见 [docs/firmware-contract.md](docs/firmware-contract.md)。

## 三层模型（最要紧的概念，别搞混）

| 层 | 是什么 | 存在哪 | 在哪编辑 |
|---|---|---|---|
| **分区** | 物理灯号的一段（如 16–55 顶环） | `state.zones` | 分区页 |
| **效果** | 一种图案的做法，**与分区无关**，是素材库 | `state.effects.list` | 效果页 |
| **模式** | 一套「哪个分区跑哪个效果」的分配，**顺序 = 固件 LEDMode** | `state.modes.list` | 模式页 |

一个模式 = 若干条 `{ effect, zones[] }` 绑定。

- **多个分区引用同一个效果时共享一份实例（相位同步）** —— 「0-7 与 8-15 做同步渐变」就是这么实现的。
- `zones` 为空 = 覆盖全部分区。
- **绑定可以「覆盖参数」**：`bind.override` 是一份**完整的效果副本**，让这条绑定用自己的一套参数。`resolveEffect(state, bind)` 取实际效果，`bindKey()` 是同步判定的身份键（效果 id + 覆盖内容）。导出时覆盖会**解析成独立的效果行**，目标固件零改动。

## 渲染：效果 = 图层叠加

图层逐灯位**取最大值**（连带胜出那一层的颜色）：

| 图层 | 用途 | 关键参数 |
|---|---|---|
| 光点 spot | 沿环跑的光斑 | 个数/宽度/相位/衰减曲线（余弦·线性·硬边·单边拖尾）/往返 |
| 填充 fill | 整环同亮 | 亮度 + 脉动（= 呼吸） |
| 随机闪 twinkle | 与位置无关的随机亮度 | 密度/刷新率/亮度区间 |
| 亮度渐变 gradient | 沿环明暗斜坡 | 上下限/起始位/绕环轮数/旋转 |

三种共有：**波形**（三角=呼吸 / 方波=闪烁 / 锯齿=跳变）、**配色模式**（跟随效果配色 / **本层空间色相** = 每颗灯自己的色相，用来做绕环彩虹）。效果级还有**起始位**与**随位置前进**。

### 等比缩放这条语义必须记住

`zpos = pos × len / RING_SIZE`，宽度也按 `len / RING_SIZE` 缩放。结果是：

> **同一个效果在各分区张角相同、点亮的颗数不同。** 光宽 10 时实测：8 颗 → 1 颗亮、24 颗 → 9 颗、40 颗 → 15 颗、104 颗 → 37 颗。

所以在一种长度上调好宽度，到别的长度上会走样 —— 这就是**编辑台要有多长度对比**的原因。

## 效果编辑台

效果页的中央画布是**编辑台**（`stageView`），不是真实灯板：一条可设颗数的直线 + 一个可设颗数的圆环 + 可选的 8/24/40 多长度对比。设置存在 `state.stage`。

- 渲染走 `renderZoneMaskTo(inst, mask, hue, len, pos)` —— **缓冲由调用方给**，所以长度不受 `ZONE_MAX_LEN` 限制。
- **编辑台的播放状态是独立的**（`stagePlaying`），与动画页的灯板预览（`A().playing`）互不影响。播放循环 `loop()` 按当前页决定推进谁。
- 效果页改参数只把模式预览**标脏**（`simDirty`），不当场 `resetSim()` —— 否则会重置灯板动画的相位。

## 文件结构

```
led_layout_editor.html       工具本体（唯一交付物）
tests/                       测试（node 直接跑，无需 npm）
  run_all.mjs                一键跑全部
  fixtures/fw_g_presets.txt  固件 g_presets[] 的 fixture（v1.0 的回归锚点）
tools/extract_fw_tables.py   从固件源码重抽查表与 fixture
docs/firmware-contract.md    目标固件必须提供什么
```

HTML 内部**分两个 `<script>`**，这个分块是刻意设计的：

- `id="core"` —— 不碰 DOM 的纯逻辑（查表、图层原语、渲染、模式解析、C 导出）
- `id="ui"` —— 画布、相互作用、面板

**因为 core 不碰 DOM，测试能直接抽出来在 node 里跑：**

```js
const CORE = new Function(html.match(/<script id="core">([\s\S]*?)<\/script>/)[1] + '\n; return CORE;')();
```

改 core 之后务必跑 `node tests/run_all.mjs`。

## 测试怎么组织的

19 个套件、421 项断言。四类：

| 类型 | 代表 | 验什么 |
|---|---|---|
| **纯逻辑** | `test_effects_core` `test_core` `test_map` | 图层原语、排布生成、校验、C 文本 |
| **真编译** | `test_effects_c_exec` | 用 **AndeSight 自带的 cygwin gcc** 真编译生成的头文件、真运行，**3 模式 × 37 帧整个 104 灯 fb 与 JS 预览逐字节比对** |
| **假 DOM** | `test_ui` `test_modes` `test_stage` `test_override` … | 把界面层真跑一遍（`boot()` 走通）、交互、接线 |
| **持久化** | `test_persist` `test_solo` | 关掉再打开还在、迁移、状态隔离 |

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
10. **`node` 读不了被透明加密的目录树**（比如 `MVsB1_BT_Audio_SDK_v0.3.4/` 下任何文件都会是密文乱码）。要读固件源码请用 python 或 Read 工具；测试需要的固件内容先由 python 抽成 fixture。
11. 面板（`.pane`）必须在 `#right` 里面，`.pane` 要有 `overflow:auto`、`#right` 要有 `min-height:0` —— 缺一条面板就滚不动、也切不回去。
12. **测试里改完控件要等 700ms 再断言存盘结果**（自动保存有 400ms 防抖）。

## 当前状态与接下来的事

工具本体功能完整、421 项断言全绿。已知的待办：

1. **抽公共测试驾具**：19 个套件现在**各自抄了一份假 DOM**（`install()` / `mkEl()` / `querySelector` 桩），改一处要改 19 处。应该抽成 `tests/_harness.mjs`。注意：测试里 `ctxDraw` 是可变全局，抽取时要用 getter/setter 包装。
2. **`_fxui_body*.js` 的构建脚本**（原来在临时目录）没搬过来 —— 有两个套件（`test_effects_ui`/`test_fx_presets`/`test_solo`/`test_stage`/`test_override`/`test_split`）是从 `test_split.mjs` 的前缀 + 各自 body 拼出来的。现在它们是完整独立文件 ✓ 能直接跑，但改其中一个的公共部分时要留意重复。
3. **目标固件契约还偏窄**：生成代码现在假定目标有 `led_ring.c`/`spimled_service.c` 那套结构（`ring_t`、`anim_ctx_t`、`ANIM_TYPE_COUNT`、静态的 `anim_render_*`）。要真正通用，得把这层抽成可配置的「后端」。
4. 渲染后端目前只有「生成 C 头文件」一种；以后可以加别的（比如 Arduino/FastLED、或直接出二进制）。
