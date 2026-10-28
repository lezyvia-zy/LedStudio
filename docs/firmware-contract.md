# 目标平台契约 —— `led_gen/v1`

> **一句话**：**工具是唯一真源**（参数、查表、引擎都由工具生成），平台只实现一层 HAL，
> 并按固定周期调两个入口。**平台后期按工具的需要改，而不是工具去迁就平台。**
>
> - 契约标识：`led_gen/v1`
> - 契约版本：`LED_GEN_HAL_VERSION`（当前 **1**）—— 平台侧写 `#define LED_GEN_HAL_IMPLEMENTS 1`，
>   与工具导出的版本不一致时**编译期直接报错**（`#error`），不靠文档自觉。
> - 唯一接口产物：`led_gen_hal.h`（导出窗口 →「HAL 接口」页签，保存成这个文件名）
> - 守边界的是测试：`tests/test_gen_independence.mjs`（含真编译 + 反向用例）

## 一、谁拥有什么

| 层 | 谁拥有 | 载体 | 平台要动吗 |
|---|---|---|---|
| **参数**：`LED_COUNT` / `RING_SIZE` / `ZONE_MAX` / `ZONE_MAX_LEN` / 音量刻度 `LED_GEN_AUDIO_MAX` + 阈值 `LED_GEN_FFT_THRESHOLD`（都在 `led_effects_gen.h` 里导出） | 工具 | `led_gen_config.h`（路线第 ③ 步落地） | 不用（连 `#define` 都删掉） |
| **查表与表**：`cos_window_tbl` / `spectrum_tbl` / `ease_out_quad_tbl` / 分区表 / 效果表 / 模式表 / 绑定表 | 工具 | `led_gen_data.h`（路线第 ② 步落地） | 不用 |
| **引擎**：图层原语、实例状态机、`led_gen_apply_mode` / `led_gen_tick` / 渲染器 | 工具 | `led_gen_core.c` / `.h`（路线第 ② 步落地） | 不用，**也不要手改** |
| **平台适配层（HAL）** | **平台** | 你的 `port.c`（实现第二节那 5 个函数） | **要写** |
| **调用点** | **平台** | 每 `LED_GEN_TICK_MS`(20ms) 调一次 `led_gen_tick()`；切模式时调 `led_gen_apply_mode(mode_idx)` | **要接** |

「参数的唯一真源是工具」的实际含义：改灯总数 / 环大小 / 分区上限，**只在工具里改**（或改工具开头的 `FW`，
换板子时同步一次），重新导出覆盖文件即可 —— 平台侧不需要再手改任何常量。
旧式做法（平台 `led_ring.h` 里一套 `#define`、工具里再抄一份）是这次的迁移对象：两份同名值必然漂移。

## 二、平台实现：`led_gen_hal.h`

导出的 `led_gen_hal.h` **只 `#include <stdint.h>`**，不含任何平台符号（这是可被测试断言的硬性质）。
它声明两件事：**平台要实现什么**、**平台要调用什么**。

### 2.1 平台要实现（5 个）

| 函数原型 | 语义 | 没有这个能力时 |
|---|---|---|
| `void led_gen_hal_present(const uint8_t *fb, uint16_t led_count);` | 把一帧推给灯。帧缓冲布局 `fb[灯号 * 3 + 0/1/2] = R/G/B`，长度 `led_count * 3`。真 SPI / DMA / WS2812 都收在这一层 | 必须实现 |
| `uint8_t led_gen_hal_audio_level(void);` | 音量 / 节奏档，`0..LED_GEN_AUDIO_MAX`（工具里定成 **20**）；引擎拿它跟导出的 `LED_GEN_FFT_THRESHOLD` 比 | `return 0` |
| `uint16_t led_gen_hal_brightness(void);` | 全局亮度，`0..256`（256 = 满亮） | `return 256` |
| `uint8_t led_gen_hal_zone_enable(uint8_t zone_idx);` | 分区开关：`1` = 亮，`0` = 灭 | `return 1` |
| `uint32_t led_gen_hal_millis(void);` | 单调毫秒计数 | `return 0`（引擎由平台固定周期驱动时不用它） |

### 2.2 平台要调用（2 个入口）

| 入口 | 什么时候调 |
|---|---|
| `void led_gen_apply_mode(uint8_t mode_idx);` | 上电、用户切模式时各一次 |
| `void led_gen_tick(void);` | 每 `LED_GEN_TICK_MS`（默认 20ms）一次 |

引擎自己持有帧缓冲与实例状态；平台不需要（也不应该）碰引擎内部结构。

### 2.3 版本守卫（编译期，别省）

```c
/* port.c 顶部：声明「本平台实现的是哪一版契约」 */
#define LED_GEN_HAL_IMPLEMENTS 1        /* 与 led_gen_hal.h 里的 LED_GEN_HAL_VERSION 对齐 */
#include "led_gen_hal.h"
```

版本不一致时编译器直接停下：

```
#error "led_gen: platform HAL version != tool contract version. Re-export or update the platform side."
```

这条是「固件按工具的需要改」的落地点：工具升级契约 → 平台编译不过 → 被迫对齐，不会静默跑歪。

## 三、边界怎么被守住（机器判定，不靠自觉）

| 判据 | 断言位置 |
|---|---|
| ① `led_gen_hal.h` 里**没有任何平台符号**（含附录 A 账本里那 27 个、`led_ring.h` 之类），只 include `<stdint.h>` | `test_gen_independence` 1) 4) |
| ② 契约与本文档**双向一致**：契约标识、版本宏、`LED_GEN_HAL_IMPLEMENTS`、5 个实现函数、2 个入口、产物名，文档里缺一条就红 | `test_gen_independence` 2) 3) |
| ③ 现有生成物与平台的耦合**不许悄悄变多**：账本外的平台符号一出现就红（附录 A） | `test_gen_independence` 4) |
| ④ 真编译：平台照契约实现那 5 个函数 → 编过并跑起来；平台声明的版本与工具不符 → **必须编不过** | `test_gen_independence` 5) |

产物另有两个硬约定（测试里也断言）：**ASCII 注释模式下无一个非 ASCII 字节**（GBK 工程直接塞）、**行尾可选 LF / CRLF**。

## 四、现状 → 目标：路线与分工

| 步 | 内容 | 工具侧 | 平台侧 | 状态 |
|---|---|---|---|---|
| **① 契约先行** | 定下 HAL 与版本守卫：`led_gen_hal.h` + 本文档 + 独立性测试 | 已落地 | 照第二节写 `port.c`、按 20ms 调 tick | **已完成（2026-10-14）** |
| **② 引擎自洽化** | 查表 / 原语 / 类型全部由工具导出，去掉 `#include "led_ring.h"`，入口变成无参 `led_gen_tick(void)` | 待做 | 接口不变；只需不再需要 `led_ring.h` | 待做 |
| **③ 参数头** | `led_gen_config.h` 由工具出，取代平台那几个 `#define`（工具里 `FW` 从「副本」变「真源」） | 待做 | 删掉 `RING_SIZE` / `ZONE_MAX` / `ZONE_MAX_LEN` / `LED_COUNT` 的 `#define` | 待做 |
| **④ 多后端** | MVsB1 / 通用 C / Arduino-FastLED 各一份 `port.c` 样例 | 待做 | **只有 `port.c` 不同**，引擎与参数照旧 | 待做 |

② 之前，工具仍会导出一份**过渡期**的 `led_effects_gen.h`（它寄在平台 `led_ring.c` 里，见第五节与附录 A）。
契约一旦定下，这段过渡只为「已经量产的板子」保留，新平台直接按 ②③ 之后的形态接。

## 五、过渡期：现在这版 `led_effects_gen.h` 怎么用

现在的动效头文件仍然**必须贴进平台的 `led_ring.c`**（它要调那个文件里的 `static` 函数、直接用 `ring_t`），
所以要打一次「一次性补丁」。补丁清单在导出窗口的**「形式 → 粘贴块」**里（与这里同源），要点是：

1. `inc/led_ring.h`：`led_zone_t` 加 `reverse` 字段；`anim_ctx_t` 加 `gen_tick` 字段；旧的 `RING_PRESET_COUNT` 交出所有权。
2. `device/led_ring.c`：在 `render_all()` **之前**包含生成文件（要在 `cos_window_tbl` / `spectrum_tbl` / `anim_render_*` 之后），
   并 `#define LED_EFFECTS_GEN_RENDER 1`；`render_all()` 整帧交给 `led_gen_render_mode()`；`ring_tick()` 改成 `led_gen_tick()`。
3. `services/spimled_service.c`：删掉 `g_presets[]`，切模式时调 `led_gen_apply_mode()`。

打完这一次之后，**再改灯效或改「分区 → 效果」的分配，只需要替换 `led_effects_gen.h` 这一个文件**。
第 ② 步把引擎自洽化之后，**连这一次补丁都不需要**：平台只剩「实现 5 个函数 + 两个调用点」。

## 六、参考实现（MVsB1 / SP-3122D 这台样机）

### 6.1 五个 HAL 函数落在现有的哪块代码上

| HAL 函数 | 在这台样机上 |
|---|---|
| `led_gen_hal_present` | 把 `fb`（`LED_COUNT*3` 字节）按 SPI 帧格式搬进发送缓冲，再调现有的 `spi_dma_send()`。原来 `spimled_service.c` 里那段拷贝逻辑搬进这里 |
| `led_gen_hal_audio_level` | `return (uint8_t)mainAppCt.FFTLevel;`（0..20 的刻度；引擎自己拿它跟 `LED_GEN_FFT_THRESHOLD` 比） |
| `led_gen_hal_brightness` | `return mainAppCt.LEDBrightness;`（0..256） |
| `led_gen_hal_zone_enable` | `return mainAppCt.Knob*LEDOnOff;`（旋钮灯开关那几位） |
| `led_gen_hal_millis` | 返回系统 tick 换算的毫秒；也可以 `return 0`，让 `spimled_service.c` 那 20ms 定时器直接调 `led_gen_tick()` |

### 6.2 速度档怎么跟着音乐走（引擎自己判，不用改固件）

**判据归引擎**：生成的 `led_gen_tick()` 每帧读一次平台的音量，跟**导出进同一个头文件的阈值宏**比：

```c
/* led_effects_gen.h（工具导出，阈值就是工具里那根针 /「阈」格调的那个数） */
#define LED_GEN_AUDIO_MAX       20u
#define LED_GEN_FFT_THRESHOLD   4u

/* led_gen_tick() 里 */
fast = (uint8_t)(((led_gen_hal_audio_level() > LED_GEN_FFT_THRESHOLD) &&
                  (ring->speed_fast < ring->speed_slow)) ? 1u : 0u);
...
I->speed_cur = (fast != 0u) ? I->speed_fast : I->speed_slow;   /* 各效果仍用自己配的 fast/slow */
```

平台原来那条 `ring_set_audio_level(&g_ring, mainAppCt.FFTLevel)` **不在新链路上了** ——
留着也不会影响观感（引擎不读 `ring->speed_cur`），但也可以顺手删掉；音量只要通过
`led_gen_hal_audio_level()` 露出来就行。

三点要注意：

- **刻度是 0..20**（`LED_GEN_AUDIO_MAX`）：平台给的是 0..20 的 `FFTLevel`，阈值也在同一刻度上。
- **判据是保守的**：只有「快档确实更快」（`speed_fast < speed_slow`）且音量过阈值时才认快档；
  平台没接音量（`return 0`）、或参数被改成 `fast >= slow`，行为与打补丁前一模一样。
- **`ring->speed_slow / speed_fast` 只是判档参考**：打补丁后 `ring_apply_preset()` 不再被调用，
  这两个字段不会被效果参数刷新（`ring_init()` 里是 8 / 1）。各效果真正的快慢由效果表里的 `slow` / `fast` 决定。
- 工具侧对应：页签下面那条**预览条**（效果页 / 动画页共用同一份）里「速度档」选**自动（跟着音乐）**，
  拖「音量」= 直接给音量，或点「音乐来了」模拟有声音那一下；阈值就是导出那个宏，
  判档逻辑与生成代码同源，所以预览仍是逐字节可信的（工具里的「手动慢 / 快」只影响预览）。

### 6.3 `ring_set_position()` 的回绕修正（内建路径用）

老问题：**灯点转一圈会闪一下**。原因是 `anim_set()` 把 `from` 设成当前值（5888）而目标是 0，
插值沿着「最直的路」倒着把整圈扫回来。修法是把 `from` 折算到离 `target` 最近的等价位置
（位置以 `RING_SIZE*256` 为周期）：

```c
{
    int32_t span = (int32_t)RING_SIZE * 256;
    int32_t half = (int32_t)RING_SIZE * 128;
    int32_t cur  = ring->anim.position.current;
    while (cur - target >  half) cur -= span;
    while (target - cur >  half) cur += span;
    ring->anim.position.current = (int16_t)cur;
}
anim_set(&ring->anim.position, target, duration, ease);
```

生成代码里有一份等价的 `led_gen_set_position()`，所以**只有你还用内建路径时才需要打**。

### 6.4 `render_all()` 里 `zpos` 的归一化

回绕瞬间 `pos` 会略小于 0，算出来的 `zpos` 也是负的。渲染器本身能处理（按周期取模），
但 C 的 `/` 对负数是**向零截断**、JS 是 `Math.floor`，两边会差 1，破坏「预览与代码逐字节一致」的验证：

```c
if (zpos < 0) zpos = (int16_t)(zpos + (int16_t)(len * 256));
else if (zpos >= (int16_t)(len * 256)) zpos = (int16_t)(zpos - (int16_t)(len * 256));
```

生成代码内部已经这么做了（`led_gen_render_mode()` 里那两行）。

### 6.5 效果数超过 9 个时

平台的模式键原来在 `MODE_OFF`(=9) 处回绕，所以只选得到 9 条。生成文件会把 `RING_PRESET_COUNT`
定义成实际条数，模式键那几处要跟着改（导出页会多给一段补丁）：`apps/main_task.c` 的 `MSG_LED_MODE`
分支两处、`main.c` 自动轮换那处，改完要能看到 `RING_PRESET_COUNT`。数码管显示模式号那段
（`display/display.c` 的 `(LEDMode+1)%10`）只显示一位，工具不管这块。

## 七、移植到别的平台要注意

- HAL 那一层与平台无关，照第二节实现即可；**引擎与参数不要改**，那是工具的地盘。
- 生成代码假定分区在灯链上是**连续编号**的（`start + i`）。编号不连续要额外一层映射，目前没做。
- 帧缓冲颜色顺序是 **R/G/B**。平台用的顺序不同，在 `led_gen_hal_present()` 里换。
- 色相 / 彩虹依赖 `spectrum_tbl` 是 `{r,g,b}` 的 256 项数组；换表就换整套配色风格（表由工具出，别在平台里改）。

## 附录 A：当前耦合账本（第 ② 步之后清零）

过渡期这版 `led_effects_gen.h` 还在用平台这 27 个符号。**这是账本，不是许可**：
`tests/test_gen_independence.mjs` 会断言「导出物里的平台符号 ⊆ 本表」，冒出新的立刻红。
第 ② 步做完后，把本表清空、这一节改成「**无耦合（引擎自洽）**」，测试会跟着收紧。

> 2026-10-16 起少了一条：内建单点追逐的渲染改成生成代码自带（`led_gen_anim_chase_single()`，
> 平顶光带），不再调平台的 `anim_render_chase_single()` —— 账本 29 → 28。
>
> 2026-10-23 起再少一条：渐变色不再走平台的 `color_update()`，改成查工具导出的
> `led_gen_grad[]`（每个用到的渐变色环 256 行 `{r,g,b}`，效果行用 `grad_first` 指进来）——
> 账本 28 → 27。自定义渐变 / 起始色因此不需要固件侧改任何代码。
>
> 同日：`led_gen_effect_t` **末尾多了一列** `uint8_t grad_step`（渐变的「步进」= 每动一次前进几级，
> 1..16；`spectrum_speed` 仍是「几拍动一次」）。它只是生成物自己那张常量表里的字段，**不碰任何平台
> 符号**（账本仍是 27）；固件侧照旧「重新覆盖生成的 `led_effects_gen.h`」，一行都不用改。

| 类别 | 符号 | 为什么会用到 |
|---|---|---|
| 头与类型（6） | `led_ring.h` | 生成物 `#include` 它 |
| | `ring_t` | `led_gen_tick` / `led_gen_render_mode` 的入参，并直接读它的字段 |
| | `anim_ctx_t` | 实例里的动画上下文 |
| | `color_ctx_t` | 实例里的颜色上下文 |
| | `rgb_t` | 取色结果 |
| | `led_zone_t` | 分区表元素（`start` / `count` / `reverse`） |
| 查表（2） | `cos_window_tbl` | 光点衰减窗（必须与预览同源） |
| | `spectrum_tbl` | 彩虹表（256 项 `{r,g,b}`） |
| 宏（6） | `LED_COUNT` | 物理灯总数（帧缓冲尺寸） |
| | `RING_SIZE` | 逻辑环大小（动画基准长度） |
| | `ZONE_MAX` | 分区数上限 / 最大实例数 |
| | `ZONE_MAX_LEN` | 单分区最长（临时缓冲尺寸） |
| | `RING_PRESET_COUNT` | 模式条数（生成物 `#undef` 后接管） |
| | `LED_EFFECTS_GEN_RENDER` | 平台在包含生成物前必须定义（开启渲染段） |
| 枚举（7） | `ANIM_CHASE_SINGLE` | 内建动画类型（生成代码按它分支） |
| | `ANIM_CHASE_DUAL` | 同上 |
| | `ANIM_SWING` | 同上 |
| | `ANIM_FILL` | 同上 |
| | `COLOR_SOLID` | 配色类型（纯色） |
| | `COLOR_GRADIENT` | 配色类型（旧的「双色渐变」= 相位 +85；新配色 3..6 由生成代码处理，不叫这个枚举） |
| | `EASE_OUT_QUAD` | 位置插值的缓动类型 |
| 函数（6） | `anim_set` | 起一段关键帧插值 |
| | `anim_update` | 推进插值 |
| | `ring_set_position` | 位置推进（生成代码另有一份带回绕修正的） |
| | `anim_render_chase_dual` | 内建渲染原语（双点追逐直接调它，行为与平台一致） |
| | `anim_render_swing` | 同上（摆动） |
| | `anim_render_fill` | 同上（填充） |

> 单点追逐**不在表里**：2026-10-16 起它的光带（平顶，带内一律满档）由生成代码自画
> `led_gen_anim_chase_single()`，平台的 `anim_render_chase_single()` 不再被调用（可整段删掉）。

## 附录 B：MVsB1 `port.c` 骨架（照抄改改就能用）

```c
/* ============================================================================
 * led_gen 平台适配层 —— MVsB1 / SP-3122D
 * 工具拥有参数 / 查表 / 引擎；这里只把「平台能力」喂给引擎、把帧推出去。
 * ==========================================================================*/
#define LED_GEN_HAL_IMPLEMENTS 1        /* 与工具契约版本对齐：不一致编译期就报错 */
#include "led_gen_hal.h"
#include "main_app_ctrl.h"              /* mainAppCt */
#include "spim_led.h"                   /* spi_dma_send() 那一套 */

void led_gen_hal_present(const uint8_t *fb, uint16_t led_count)
{
    /* 把 fb（led_count*3 字节，R/G/B）按 SPI 帧格式搬进发送缓冲，再发。
       原来 spimled_service.c 里那段拷贝逻辑搬到这里即可。 */
    spi_led_send_frame(fb, led_count);
}

uint8_t led_gen_hal_audio_level(void)   { return (uint8_t)mainAppCt.FFTLevel; }   /* 0..LED_GEN_AUDIO_MAX(20) */
uint16_t led_gen_hal_brightness(void)   { return (uint16_t)mainAppCt.LEDBrightness; }
uint8_t led_gen_hal_zone_enable(uint8_t zone_idx)
{
    /* 分区开关：旋钮灯那些位；没有就 return 1 */
    (void)zone_idx;
    return mainAppCt.LEDOnOff ? 1u : 0u;
}
uint32_t led_gen_hal_millis(void)       { return 0u; }   /* 由 20ms 定时器驱动 tick */

/* ---- 平台调用点 ---- */
/* 上电 / 切模式：*/  /* led_gen_apply_mode((uint8_t)mainAppCt.LEDMode); */
/* 每 20ms：      */  /* led_gen_tick(); */
```

## 附录 C：改契约时要同步的三处

契约不是文档，是**三处同源**的东西 —— 少改一处，`tests/test_gen_independence.mjs` 就会红：

1. `led_layout_editor.html` 里的 `LED_GEN_HAL`（`version` / `tag` / `tick_ms` / `proto` / `entry`）—— 唯一真源。
2. 本文档第二节（平台实现 / 平台调用表）与附录 A（账本）。
3. `tests/test_gen_independence.mjs` 的 `LEDGER`（账本）与文档交叉断言。

顺带：改了生成物的**行为**（图层原语、C 模板、`led_gen_tick`）必须跑 `test_effects_c_exec`
（真编译 + 与 JS 预览逐字节比对）—— 预览和生成的代码必须是一回事，这条不成立整个工具就没意义。



