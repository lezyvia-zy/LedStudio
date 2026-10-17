# 工具模块体检报告（逐模块优化的底稿）

> **2026-10-17 拆过**：原来是一份 28k 字的单文件 —— 改一个模块也要把整份读进来（token 全花在别人的模块上）。正文按模块拆到 `docs/audit/` 下 12 个文件（**一页 / 一个模块 = 一份**），这里只留「怎么用 + 目录」。**小节号沿用拆分前的 §1…§13**，别处「见第 N 节」的引用照旧对得上。
>
> **定位**：每条发现都带**证据位置**（`#id` / 函数名 / 小节名），不写「第 N 行」—— 行号会漂（上一批平均偏了一千行）。改代码前先跑 `node tools/docsync.mjs where <名字>`：直接给现算的行区间、所属小节、被哪些测试引用几次。
>
> **严重度**：**P0** 数据正确性 / 数据丢失（用户会白干）· **P1** 易用性与防呆（会做错事、看不出错在哪）· **P2** 一致性 / 打磨（不致命，但手感差异与维护成本）。
>
> **进度**：做完一条就在该条编号后追加 `✓ <提交号>`（例：`**Z1** ✓abc1234`）；落地记录见 [CHANGELOG.md](CHANGELOG.md)。

## 目录（按「你要改哪」挑一份读，不用全读）

| 文件 | 管什么 | 小节 | 体量 |
|---|---|---|---|
| [audit/map.md](audit/map.md) | 模块地图：页签 ↔ 核心对象 ↔ 测试套件 | §1 | ~3k 字 |
| [audit/zones.md](audit/zones.md) | 分区页 `zones`（「生成」已并入这一页） | §3 | ~3k |
| [audit/fx.md](audit/fx.md) | 效果页 `fx`（含播放条） | §4 | ~4k |
| [audit/mode.md](audit/mode.md) | 模式页 `mode` | §5 | ~0.9k |
| [audit/anim.md](audit/anim.md) | 动画页 `anim` | §6 | ~0.9k |
| [audit/check.md](audit/check.md) | 校验页 `check` | §7 | ~1k |
| [audit/gen.md](audit/gen.md) | 生成页 `gen` | §8 | ~1k |
| [audit/exp.md](audit/exp.md) | 导出页 `exp` | §9 | ~1.5k |
| [audit/help.md](audit/help.md) | 帮助页 `help` | §10 | ~0.7k |
| [audit/priority.md](audit/priority.md) | **挑活先看这份**：横向发现 + 优先级总表 + 建议批次 + 改动面校准 | §2 / §11 | ~6k |
| [audit/checklist.md](audit/checklist.md) | 验收清单：改哪个模块跑哪些测试 | §12 | ~4k |
| [audit/invariants.md](audit/invariants.md) | 有意为之，**不要顺手改**（改这些 = 改产品语义） | §13 | ~1k |

## 0. 怎么用这份报告

1. 圈定本批次要做的条目（建议按 [audit/priority.md](audit/priority.md) 的批次走）。
2. 每个模块一次 commit（`feat(zones): …` / `fix(exp): …`），commit message 里带条目号（如 `Z1`）。
3. 每条**必须**补断言（见 [audit/checklist.md](audit/checklist.md)）；改到 C 模板或图层原语时跑 `test_effects_c_exec`。
4. 做完把该条状态改成 `✓ <提交号>`，并同步 README / CLAUDE / HANDOFF 里受影响的部分。
5. 新发现写进**对应模块那一份**，别往索引里加正文 —— 索引一胖，拆分就白做了。
