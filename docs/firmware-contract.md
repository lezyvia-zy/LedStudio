# 目标固件契约

工具生成的 `led_effects_gen.h` 要贴进**目标工程的 `led_ring.c`**。这份文档说明它对目标固件的全部要求。

当前实现是按山景 MVsB1 SDK 的 `led_ring.h` / `led_ring.c` / `spimled_service.c` 这套结构写的。要移植到别的固件，照着这份清单对齐即可。

## 一、目标固件必须提供什么

生成的头文件里 `#include "led_ring.h"`，并直接使用下列符号。**它们在包含生成文件之前必须已经存在**：

### 常量

| 符号 | 含义 | 典型值 |
|---|---|---|
| `RING_SIZE` | 逻辑环大小，动画的基准长度 | 24 |
| `LED_COUNT` | 物理灯总数 | 104 |
| `ZONE_MAX` | 最多几个分区（也决定一个模式最多几个效果实例） | 8 |
| `ZONE_MAX_LEN` | 单个分区最多几颗灯（生成代码里的临时缓冲按它开） | 40 |

### 类型

| 符号 | 用途 |
|---|---|
| `rgb_t` | `{ uint8_t r, g, b; }` |
| `led_zone_t` | `{ uint8_t start, count, reverse; }` —— 分区的起止灯号 |
| `anim_t` / `anim_ctx_t` / `color_ctx_t` | 动画与颜色的运行状态 |
| `ring_t` | 灯环总状态，**必须至少有**：`anim`、`color`、`brightness`、`zones[ZONE_MAX]`、`zone_count`、`zone_en[ZONE_MAX]`、`fb[LED_COUNT][3]` |

### 枚举与常量

`ANIM_CHASE_SINGLE` / `ANIM_CHASE_DUAL` / `ANIM_SWING` / `ANIM_FILL` / `ANIM_TYPE_COUNT`、
`COLOR_SOLID` / `COLOR_SPECTRUM` / `COLOR_GRADIENT`、`EASE_OUT_QUAD`

### 函数与查表

| 符号 | 说明 |
|---|---|
| `cos_window_tbl[256]` | 余弦窗查表（光点衰减用）。**必须是固件里那一份**，否则预览与实物不一致 |
| `spectrum_tbl[256]` | 彩虹查表（`{r,g,b}` 数组） |
| `anim_set()` / `anim_update()` | 关键帧插值 |
| `color_update()` | 颜色循环推进 |
| `ring_set_position()` | 位置推进（生成代码另有一份带回绕修正的，见下） |
| `anim_render_chase_single/_dual/_swing/_fill()` | **固件原有的内建渲染函数**。生成代码会直接调它们来渲染「内建类型」的效果 —— 所以行为与固件完全一致；自定义效果才走生成的图层合成 |

> 上面这些在参考实现里是 `led_ring.c` 里的 `static`，所以**包含位置有讲究**：必须在它们全部定义之后、`render_all()` 之前。

## 二、要手工打的一次性补丁

打完这一次之后，**以后再改灯效或改「分区 → 效果」的分配，只需要替换 `led_effects_gen.h` 这一个文件**，固件不用再动。

导出页里的「粘贴块」会给出与下面完全一致的内容（含前后对照），可直接复制。

```
[1] inc/led_ring.h  效果条数改由本文件说了算，旧的那句整句注释掉:
        /* #define RING_PRESET_COUNT 9 */

[2] inc/led_ring.h  anim_ctx_t 加一个每实例的帧计数:
        uint16_t gen_tick;

[3] device/led_ring.c  在 render_all() 之前包含本文件
    （要在 cos_window_tbl / spectrum_tbl / anim_render_* 之后，生成代码要调它们）:
        #define LED_EFFECTS_GEN_RENDER 1
        #include "led_effects_gen.h"

[4] device/led_ring.c  render_all()：整帧交给生成代码
        新: void render_all(ring_t *ring) { led_gen_render_mode(ring); }
    （原来那段按分区遍历的代码整体注释保留，当兜底）

[5] device/led_ring.c  ring_tick()：让生成代码推进它自己的实例
        原: step_cnt / CHASE_SINGLE..SWING 那段自动前进
        新: led_gen_tick(ring);

[6] services/spimled_service.c  去掉 g_presets[]，改成按模式应用:
        #include "led_effects_gen.h"      <- 不定义宏，只要函数原型
        原: ring_apply_preset(&g_ring, &g_presets[mainAppCt.LEDMode]);
        新: led_gen_apply_mode(&g_ring, (uint8_t)mainAppCt.LEDMode);

[7] 可选 —— 内建那条路径现在被绕过了；如果还想留作兜底，记得把
    ring_set_position() 的回绕修正也打上（见下）
```

> 注意 [2] 的 `gen_tick` **必须是一个字段**，不能用函数内的 `static` 计数器：`anim_render_zone()` 是每个分区每帧都被调一次，用 static 会跑成 5 倍速。

## 三、连带的两个修正

### 1. `ring_set_position()` 的回绕修正（内建路径用）

打这个补丁之前有个老问题：**灯点转一圈会闪一下**。原因是 `anim_set()` 把 `from` 设成当前值（5888）而目标是 0，插值沿着「最直的路」倒着把整圈扫回来 —— 实测 8 个 tick 扫完整个环。

修法是把 `from` 折算到离 `target` 最近的等价位置（位置以 `RING_SIZE*256` 为周期）：

```c
/* 原: anim_set(&ring->anim.position, target, duration, ease); */
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

### 2. `render_all()` 里 `zpos` 的归一化

回绕瞬间 `pos` 会略小于 0，算出来的 `zpos` 也是负的。渲染器本身能处理（它按周期取模），但 C 的 `/` 对负数是**向零截断**、JS 是 `Math.floor`，两边会差 1，破坏「预览与代码逐字节一致」的验证。

```c
if (zpos < 0) zpos = (int16_t)(zpos + (int16_t)(len * 256));
else if (zpos >= (int16_t)(len * 256)) zpos = (int16_t)(zpos - (int16_t)(len * 256));
```

> 内建路径被绕过时这条也用不上；但生成代码内部已经这么做了。

## 四、效果数超过 9 个时

固件的模式键原来在 `MODE_OFF`(=9) 处回绕，所以只选得到 9 条。生成文件会把 `RING_PRESET_COUNT` 定义成实际条数，模式键那几处要跟着改（导出页会多给一段补丁）：

- `apps/main_task.c` 的 `MSG_LED_MODE` 分支：`>= MODE_OFF` → `>= RING_PRESET_COUNT`（两处，含 `LEDOnOff` 那行）
- `main.c` 自动轮换那处同样改
- 这两个文件要能看到 `RING_PRESET_COUNT`（加 `#include "led_ring.h"`，或直接写死数字）
- **数码管显示模式号**那段（`display/display.c` 的 `(LEDMode+1)%10`）只显示一位，工具不管，需要自己改

## 五、生成文件里各部分的职责

| 部分 | 内容 |
|---|---|
| 顶部 | 效果数/模式数/最大实例数，以及 `RING_PRESET_COUNT` 的接管 |
| 类型 | `led_gen_layer_t`（图层）、`led_gen_effect_t`（效果）、`led_gen_bind_t`（绑定）、`led_gen_mode_t`（模式） |
| `LED_EFFECTS_GEN_RENDER` 段 | 图层渲染原语、效果库表、模式表、绑定表、实例状态，以及 `led_gen_apply_mode` / `led_gen_tick` / `led_gen_render_mode` |
| 末尾横幅 | 上面第二节那份补丁清单（用 `/-* … *-/` 转义，避免提前闭合块注释） |

`led_gen_render_mode()` 先把 `ring->fb` 清零，然后**逐分区**：按 `zone → 实例` 映射取状态，算 `zpos = pos × len / RING_SIZE` 并归一化，渲染出亮度掩码 + 每灯位色相，最后乘上亮度写进 `fb`。SPI 发送仍由固件原有的 `spi_dma_send()` 负责。

## 六、移植到别的固件

按第一节对齐符号即可。已知要注意的点：

- 生成代码假定分区在 SPI 链上是**连续编号**的（`start + i`）。如果目标板子的编号不连续，需要额外一层映射，目前没做。
- 生成代码直接用 `ring->fb[phys][3]`，颜色顺序 R/G/B。如果目标用别的顺序，在 `led_gen_render_mode()` 里换。
- 色相 / 彩虹依赖 `spectrum_tbl` 是 `{r,g,b}` 的 256 项数组；换表就会换整套配色风格。
