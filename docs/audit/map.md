# 体检 · 模块地图（模块 ↔ 代码 ↔ 测试）

> 从 [module-audit.md](../module-audit.md) 拆出（2026-10-17）：原来是 28k 字的单文件，改一个模块也要读整份 —— 现在按模块分文件。**小节号沿用拆分前（§1…§13）**，别处「见第 N 节」的引用照旧对得上；定位用 `node tools/docsync.mjs where <#id / 符号 / 小节名>`，行号不写进文档（会漂）。
> 本文件：§1

## 1. 模块地图（模块 ↔ 代码 ↔ 测试）

| 模块 | 页签 | HTML 标记 | 界面代码 | 核心逻辑 | 主要测试 |
|---|---|---|---|---|---|
| **分区** | `zones` | 251–320（板级参数 / 分区表 / **铺灯 · 形状** / 底图 —— 批 5-A 起全在这一页；批 7-A/B 起铺灯 = 形状） | 4209–4280（表 / 高亮 / 配色 / 编辑）、5879–6075（形状面板 ⇄ `SHAPE`：`readShapePanel` / `syncShapeEdit` / `shapeRows` / `shapeInfoText` / `shapeTouched` / `layShape` / `#shApply`/`#shFlip`/`#shKeep`/`#shAdd`/`#shDel`/`#shFromZone`）、画布上的形状参考层（虚线 + 头尾标记）、`normalizeShapes` | `SHAPE` 1347–1862（形状引擎：四档分布 / 头尾 / 诊断）、`deriveZoneDir`、`GEN`、`validate` | `test_ui` `test_struct` `test_core` `test_map` `test_shape` `test_persist` |
| **效果** | `fx` | 602–735（列表 / 过滤 / **编辑台设置** / **预置效果** / **图层（自定义动效）**（2026-10-27 起四个「+ 加图层」按钮已收起 —— 只留「改这一层的形状参数」：光点数 / 光宽 / 间距 / 衰减 / 方向 / 往返）/ 选中效果 / 内建参数 / **色彩配置**（配色 / **渐变库**：起始色 · 顺序 · **新建 / 另存为**多套 / 调色板 / 跳变·彩虹·呼吸的节奏 / **渐变的「速度 + 步进」**，沉在页面最下面）/ 底部**常驻播放条** `#fxPlayBar` 784–811（**速度档 / 音量 / 音乐来了不在这页**：它们在页签下面的 `#previewBar` 里 —— 所有 `.pane` 之外，效果页与动画页共用同一份） —— 按钮上只有**图标**（`.fxplay`，40×36 的键 + 56×40 的播放键，说明挂 `data-tip` 且都压在一行内；**归零 = 实心方块、单独摆在最左**，上/下一条 = **实心双三角**，前一帧/后一帧 = 三角 + 竖条；三组之间有 `.div` 分线）；`#fxShowReal`「在灯板上看」`class="hide"` **暂挂起**、接线留着） | 6282（列表 `renderFxList`）/ 6962（图层卡 `renderLayers`；光点层只剩光点数 / 光宽 / 间距三格，相位与脉动 2026-10-27 收起）、7117（预置 `applyPreset`）、`syncStagePlayBtn` 7018 / `stageToggle` 7031 / `stageStep(dir)` 7048（前/后一帧）/ `fxSelMove` 7082（播放条；`stageRate()` 读 `state.stage.rate`，`loop()` 6100 里 `accS` 独立累加）；渐变库界面 `renderGrad` 6701（`gradNewBlank` 新建 = `gradDefault()` / `gradSaveAs` 另存为 = 复制当前这条）/ `syncFxColorRows` 6863（起始色 · 顺序 · 色带预览 · 「步进(级)」那行与 `gradStepHint` 6849 的一整圈读数）；**取色面板** `wireColorChip` / `colorChip` → `cpBuild` / `cpOpen` / `cpPlace` / `cpPaint`（`.cchip` 色块 + `#cpPop`：色环 = 基础，「高级设置」里才是二维色图 + 色号框；调色板 / 渐变起始色 / 渐变顺序 / 分区颜色 四处共用，对外仍是 `el.value` / `el.oninput`） | `instApplyPreset` 3144、`instNew` 2827 / `instAdvances` 3004 / `instTick` 3010；渐变核心 `gradDefault` / `defaultGradients`、`gradTable`（256 级色环）、`gradNew` / `gradDrop`、`effGradStep` / `gradStepOf`（步进 1..16）在 2091–2253 | `test_effects_core` `test_effects_c` `test_effects_ui` `test_fx_presets` `test_color` `test_grad` `test_stage` `test_solo` `test_override` `test_split` `test_effects_c_exec` |
| **模式** | `mode` | 284–315 | 7306–7634（绑定卡 `renderBinds` 7364：效果 / 分区 / 覆盖参数 / **渐变下拉**（配色 = 渐变时出现，换它自动开该绑定的覆盖副本）） | `resolveEffect` / `bindKey` / `bindZones` | `test_modes` `test_override` `test_split` `test_grad` |
| **动画** | `anim` | 237–282 | 3542–3711（接线/播放）、3586–3639（下拉/同步） | `sim*`、`ringIsFast` / `instSpeedFromRing` / `simSyncSpeed` | `test_anim` `test_anim2` `test_effects_c_exec` |
| **校验** | `check` | 233–236 | `renderIssues` | `validate` | `test_core` `test_struct` |
| ~~**生成**~~ | ~~`gen`~~ | — | **批 5-A 已并入「分区」**（批 7-A/B 起 `genParams()` / `genInfo()` / `#gApply` 等已删除，改成 `SHAPE` + `#sh*`，见上一行） | `GEN`（批 7-A/B 起 `SHAPE` 接管铺灯） | `test_map` `test_struct` `test_shape` |
| **导出** | `exp` | 482–496（面板入口）、718–780（`#exportDlg` 弹窗） | 4640–4671（生成）、导出窗口（`EXPORT_KINDS` / `openExport` / `saveAsFile`）、文件 / JSON / PNG | `exportC` / `exportEffectsC` / `exportHalC` | `test_effects_c` `test_map` `test_wrap` `test_export` `test_gen_independence` |
| **帮助** | `help` | 482–683 | `tab('help')` 3457、`tipInit` | — | `test_help`（断言章节与 `data-tip`） |
| 横向 | — | 左侧栏/画布/键盘 | 2697–3440 | 项目库 2780–2921、撤销 2893–2906、状态栏 4540–4550、项目切换 4552–4595 | `test_ui` `test_persist` |

> **行号只是粗指路（2026-10-17 起）**：下表里的区间**不保证跟得上代码**，权威定位一律用 `#id` / 函数名 / 小节名 —— `node tools/docsync.mjs where <名字>` 直接给现算的行区间、所属小节、被哪些测试引用。每次只校准「本次改动到的那一行」，不重算全表；哪条区间落不上，`node tools/docsync.mjs check` 会列出来（只提示、不算错）。

