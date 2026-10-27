# M5 v2 开发门禁报告（t97 / 制作人）

- **日期**：2026-10-28（Asia/Shanghai）
- **范围**：M5 v2 全部实现（t88–t95）+ 玩法级修复（t103 座位真源、t105 F3 反驻守）+ 测试（t96）+ 构建骨架（t106）
- **依据**：`docs/acceptance.md`（68 项）、`docs/tech-spec.md`（42 模块 / §11 测试策略 / §12 90 秒门）、`docs/gdd.md` §4 锁定、`docs/qa/unit-report.md`、`docs/qa/verification-report.md`、`docs/agent-handbook.md`
- **写入**：仅本文件；未改任何 `src/**`、`tests/**`、设计文档

---

## 0. 结论

**通过，可进入 M6 候选版集成。**

- 8 个实现任务全部 completed，`src/**` 共 **82 个 TS/TSX 文件、27,010 行**；`tests/**` 4,342 行。
- 本次独立实跑：`tsc --noEmit` exit 0；`vitest run` **23 文件 / 259 用例 / 789 个 expect / 0 失败 / 1.54s**；`tests/f3-bot.test.ts` 4/4；`npm run validate` 14/14；单文件 `1,042,695 B`（1,018.3 KiB）且根 `index.html` 与 `dist/girls-band-live.html` 字节一致。
- 两个玩法级缺陷已关闭：**座位 0.7m 错位**（t103，4 条精确规则全 0 违例）与 **F3 反驻守**（t105，驻守 30→7、扫场 30→40，均为固定种子可复跑）。
- 42 个模块 / **77 个签名导出全部存在**，0 缺失；GDD §4 锁定的 15 类数量逐项对上。
- **无阻塞项**；6 条 M6 必修见 §6。

---

## 1. 本次独立实跑（不采信转述）

| # | 命令 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | `npx tsc --noEmit` | **exit 0** | 无错误输出；覆盖 `src/**`、`tests/**`、`tools/**`、`vite.config.ts` |
| 2 | `npx vitest run` | **exit 0**；23 文件 / 259 用例 / 789 expect / 1.54s | 末尾 `Test Files 23 passed (23)`、`Tests 259 passed (259)` |
| 3 | `npx vitest run tests/f3-bot.test.ts` | **exit 0**；4/4 | 见 §5.2 原始曲线 |
| 4 | `npm run validate` | **exit 0**；`14/14 rules passed（1018.3 KiB，sha256 1c17dbae37cd）` | 只读脚本；与 t96 报告一致 |
| 5 | `sha256sum` / `cmp` | `1c17dbae…186fe`；根 `index.html` 与 `dist/girls-band-live.html` **IDENTICAL** | 单文件发布物自包含 |
| 6 | 精确座位规则扫描（4 条） | **全 0 违例**；同名 `seatWorldPosition` 定义 **0**；`data/seats` 导出 `seatPositionAt/Of/AtPoint` 齐全 | 见 §5.1 |
| 7 | tech-spec §5 ↔ 实际导出对比 | 77 个签名导出，**缺失 0**（`tools/build-single.mjs#buildSingle` 按 §5.7 属 tools，已存在） | 脚本解析 §5.1–§5.8 |
| 8 | `skip/todo/only` 扫描 | 0 命中 | `grep -rE '\.(skip|todo|only)\(' tests` |

> **AC-T03/T04（build/validate）口径**：captain 指示其属候选版范围、记 M6 验证项。实况是 t106 已交付 `vite.config.ts`、`src/main.tsx`、`src/platform/**`、`tools/**`，`validate` 现在即可跑且 14/14 通过；本报告按实况记录为「已有证据、M6 集成变更后必须复跑」，不判 M5 失败。

---

## 2. 8 个实现任务交付清单

| 任务 | owner | 文件数 | 核心交付 | 行数 |
| --- | --- | --- | --- | --- |
| t88 引擎与状态底座 | dev-engine | 13 | `loop/store/input/collision/rng/events/pool/entities` + `light/audience/crowd-wave/lines/telemetry` | 7,633（game 区域 20 文件，含 t90/t91） |
| t89 场景与渲染 | dev-three | 5 | `renderer/scene/camera/instancing/fx` | 2,722（three 区域 6 文件，含 models） |
| t90 战斗与高潮 | dev-combat | 4 | `combat/enemies/waves/boss` | —（计入 game） |
| t91 成长与存档 | dev-progression | 3 | `progression/upgrades/save` | —（计入 game） |
| t92 内容数据 | dev-content | 10 | `data/**` 全部表（角色/卡/噪音/段落/和弦/座位/文案/配色/平衡） | 3,644 |
| t93 React UI | dev-ui | 34 | `App.tsx`、13 组件、8 屏幕、6 覆盖层、`styles/{base,ui}.css`、`ui/**` | 4,052 |
| t94 音频 | dev-audio | 5 | `engine/music/choir/ir/sfx` | 2,296 |
| t95 模型与资产 | art-director | 3 | `three/models.ts`（计入 three）、`assets/procedural.ts`（864）、`styles/theme.css`（计入 styles 3,179） | — |
| t103 座位真源 | tech-director | 11 | `types/data`、`data/seats`、`audience/waves/light/store/enemies`、`instancing/models`、`tests/seat-layout`、tech-spec §7.4 | — |
| t105 F3 反驻守 | dev-engine | 3 | `audience.ts` 规则、`tests/f3-bot.test.ts`、`reports/f3-anticamp.md` | — |
| t106 构建骨架 | tech-director | 11 | `src/index.html`、`main.tsx`、`platform/**`、`vite.config.ts`、`tools/**`、`dist/girls-band-live.html` | 241（platform） |

**越界改动检查**：逐任务 `changedPaths` 与 tech-spec §4 所有权表比对，**未发现越界**。
- t88 改 `light/audience/crowd-wave/lines/telemetry` 符合 §4.1 第 5 条（GDD §22.3 归 dev-engine）。
- t95 改 `three/models.ts` 符合 §4（art-director 单 owner）。
- t93 改 `App.tsx`、`styles/base.css`、`styles/ui.css` 符合 §4。
- t103/t105 的跨文件修改在各自任务授权清单内；t106 的 `index.html`/`dist/**` 是构建产物，不手改。
- 未创建 `src/game/weapons.ts`（§4.1 第 3 条明令）。

---

## 3. 接口符合性

### 3.1 签名覆盖

- tech-spec §5 声明 **42 个模块 / 77 个函数签名**；实际解析 `src/**` 得 175 个导出函数，逐条比对：**缺失 0**。
- 三层边界：`game` 无 `react/react-dom/three`、`three` 无 `react`、`ui` 无 `three`（`tools/check-layers.mjs` 的 R12/R13 + validate 14 条规则覆盖，本次 validate 通过）。
- 依赖新增：运行期仅 `react 19.3.1 / react-dom / three 0.186.1`，与 tech-spec §15 一致，0 新增。

### 3.2 已登记的接口偏差（均不阻塞，来源为各任务报告 + 本次核查）

| # | 偏差 | 影响 | 处置 |
| --- | --- | --- | --- |
| D1 | §11 第 9 项要求 `tests/anti-camp.test.ts`，实际交付 `tests/f3-bot.test.ts` | 命名不符约定，内容已覆盖 45s bot | 接受（t105 授权文件名），M6 可选改名 |
| D2 | `upgrades.ts` 额外导出 `modifierTotals`（§5 将其置于 progression） | 为避免 upgrades↔progression 循环依赖 | 接受；progression 单向转发 |
| D3 | `AudioPort` 无音量入口，新增 `applyAudioMix/setAudioHostHidden/readEngineChoirGain` | 设置与失焦降音需要 | 接受；未改既有签名 |
| D4 | `UiBridgeRuntime extends UiBridge`；HUD 增暂停按钮/构筑条/记账线 | 加法扩展 | 接受；HUD 仍 0 数字 |
| D5 | 失败卡 5 秒自动进结算（tech-spec 写 3 秒） | 验收上限 6 秒内 | 接受；Esc 可跳 |
| D6 | Boss 无 `idle` 相位，用 `phaseStartedAt` 哨兵 + `changed` 约定 | 状态机语义 | 接受；store 已按约定发 `boss` 事件 |
| D7 | t92 和弦表：副歌 8 小节改 `Am–F–Dm–Am7 / Am–F–Cmaj7–G7`（GDD 原写 E，无 E7） | 保住「第 4 小节七和弦」硬规则 | 需 t107 GDD 文字同步（M6 前） |
| D8 | 成员模型 2 网格 + 1 描边 = 12 draw calls（art-direction 估 9） | 渲染预算内（38/45/60） | 接受 |
| D9 | 纹理按 tech-spec 10 个 id 落地（art-direction 曾写 13） | 关闭 M4-C3 口径 | 接受；以 tech-spec 为准 |

### 3.3 重复实现（本次新发现，非阻塞）

- **`zoneAtPoint` 两份**：`game/audience.ts:134`（经 `seatAtPoint` + `zoneOfSeat` 二分）与 `game/waves.ts:329`（经 `zoneAtPoint` + `zones[]` 行列范围）。当前 4 区四等分下**结果等价**（`seat-layout.test.ts` 同时导入两者做跨走道归属断言）；若未来区定义非等分，两者会分叉。M6 建议收敛为一处。
- **`zoneOfSeat` 两份**：`data/seats.ts:146`（返回 `ZoneId | null`）与 `game/audience.ts:121`（返回 `ZoneId`），语义略不同但等价。
- **常量副本 4 个**：`ui/copy.ts` 复制 `BAND_NAME/ZONE_ORDER/SEGMENT_ORDER/GRADE_LABELS`，当前值与 `data/**` 一致；属 UI 层有意的展示副本，M6 可加一致性断言防漂移。

---

## 4. GDD §4 锁定内容核对

| 项目 | GDD 锁定 | 实测 | 证据 |
| --- | --- | --- | --- |
| 可操作角色 / 乐队成员 | 1 / 4 | 4 角色（1 可操作）+ 4 瞬间 | `data/characters.ts`、`data.test.ts` |
| 武器 | 无（光 3 形态） | 散光/束光/回照 3 形态 | `types LightMode`、`data/lightForms` |
| 常规噪音 | 3 | 底噪/啸叫/失真 | `data/noise.ts` |
| 精英 / Boss | 返听 / 静默 3 阶段 | 返听（300HP）+ Boss 4 节点 | `enemies.ts`、`boss.ts` |
| 座位 | 768（24×32，4×192） | 24×32=768，4 区各 192 | `data/seats.ts` |
| 座区 / 声部 | 4 / 4 | 4 区（根/三/五/七） | `data/seats.ts` |
| 卡池 / 单局选择 | 24 / 10 | 24 卡（3 核心 + 15 支援 + 6 通用）/ 10 选 | `CARD_IDS` 24、`progression.test.ts` |
| 构筑 / 进化 | 3 / 3 | choir/solo/bait；3 进化可解析 | `BUILDS`、`upgrades.test.ts` |
| 热度 | 0–4（4 仅 heat-cap） | 5 档，`heatCapFor` 3/4 | `upgrades.test.ts` |
| 段落 / 灯光态 / 曲目 | 5 / 3 / 1（9:30，304 小节） | 5 段、3 态、1 曲 304 小节 @128BPM | `data/segments.ts`、`clock.test.ts` |
| 评级 / 结局 | S/A/B/C / 3 | 4 档 / complete、empty-house、interrupted | `types/game.ts:132`、`store.ts` |
| 合唱声部 | 12 | 4 区 × 3 层 = 12（44 节点内） | `audio/choir.ts` |
| 台词/文案 | 10 触发点 + 5 失败原因 + 4 评级 | copy 16 行覆盖，`copy.test.ts` 11 用例 | `data/copy.ts` |
| 波次 | 5 段生成率 × 裂缝 | `waves.test.ts` 14 用例（生成率/裂缝 +15%/上限 180/背后 30%） | `waves.ts` |
| 时长 | 9:30 单局 | 304 小节；`clock.test.ts` 映射 | `music.test.ts` |

---

## 5. 关键玩法链路抽查

### 5.1 座位真源（t103）

- `data/seats.ts` 为唯一真源：`seatPositionAt/seatPositionOf/seatAtPoint` 正反向均含 `aisleGap=0.7`，`origin.x=-9.96`（32×0.62+0.7=19.92，中心 0）。
- 精确规则实跑：R1（`SEAT_*_GAP`/`*_FALLBACK_*`）、R2（`origin.x + col * spacing.x` 直连）、R3（`9.61|9.96`）、R4（走道+0.7/0.8）在 `data/seats.ts` 之外**全部 0 命中**；同名 `seatWorldPosition` 定义 **0**。
- `tests/seat-layout.test.ts` 21 用例：768 席 round-trip、576 席 0.7m 位移、x 中心 0、light/zoneAtPoint 跨走道归属。
- 调用链已统一：`light.ts`（反算行列）、`store.ts`、`enemies.ts`（底噪目标座）、`waves.ts`、`three/instancing|models`（删 gap/fallback 第二真源）均走 data。

### 5.2 F3 反驻守（t105）

`npx vitest run tests/f3-bot.test.ts` 实跑输出：

```
[camp]  驻守 45s：30 → 7     曲线 [30,28,31,23,20,16,23,14,11]（−76.7% ≥ 40%）
[sweep] 扫场 45s：30 → 40    曲线 [30,26,20,20,40,40,40,40,40]（+33.3% ≥ 20%，中途未归零）
[gate-90s] samples=179, firstActiveLightMoveAt=0.517, lightMovesPerMinute=25.61,
           dwellP50=3, dwellP90=3.02, zoneConversionRate={1,1,1,0.375},
           igniteOnBeatRate=0.596, dwellRewardRatio=-4.342, endedAt=89.5
```

- 断言为真比较：`endAudience <= 18`、`>= 36`、`phase !== 'empty-house'`、`samples >= 150`、`endedAt > 80`；无 `skip/todo`。
- 测试纯 `createGameStore` 驱动（假 AudioPort/SavePort、固定种子），不依赖 DOM/three/WebGL。
- **缺口（D10）**：§11 第 9 项要求的「3 分钟落后 ≥25%」与「`dwellRewardRatio < 0.75`」只有打印、无断言；`dwellRewardRatio=-4.342` 为负值的口径需人工解读。M6 补断言或由 90 秒人类门覆盖。

### 5.3 失真吞光 / 黑场（t90 遗留项已闭合）

- `store.ts:1075-1084` 已消费 `enemies.lightEatRatio()`（锥长按被吞比例收窄，每只 30%/上限 60%）与 `stageBlackoutRemaining()`（抵台光灭 1.5s，`radius=0`）。
- `updateLight` 每 tick 先重置 `light.radius = form.radius`，再乘吞光系数，**无累积衰减 bug**；黑场期间 `audience` 因半径 0 停止转化。
- Boss 事件：`store.ts:1174-1177` 按 `changed` 约定发 `enter/advance/retire`。

---

## 6. 风险与 M6 必须先修

### 6.1 M6 必修（候选版放行条件）

| # | 事项 | 依据 | 验收方式 |
| --- | --- | --- | --- |
| M1 | 90 秒人类门 ≥7/10 主动移光 | GDD F3 / AC-13 / AC-F04 | 真实玩家盲测 + `gate-90s` 埋点对照 |
| M2 | 完整 9:30 两局 `RunResult` 对照（同 seed） | AC-T13 | M6 实机长跑 |
| M3 | file:// 实机验收（Chrome/Edge，断网） | AC-T03/T05/T10 | 打开 `dist/girls-band-live.html`，0 控制台错误 |
| M4 | 60fps / draw call / overdraw 实机测量 | AC-T14–T17、F09 | 三局性能采样，对照预算 38/45/60 |
| M5 | 音频盲听 A/B（5 层、12 声部、静音可玩） | F11 / AC-18 / AC-H01–H08 | 人耳协议，不得用单测替代 |
| M6 | t107 GDD 文字同步（和弦表 E7、反驻守规则、失败卡时长） | D5/D7 | GDD 与实现一致后由创意总监签收 |

### 6.2 非阻塞观察（记入候选版 backlog）

1. `zoneAtPoint`/`zoneOfSeat` 双实现当前等价，M6 可收敛（§3.3）。
2. `ui/copy.ts` 与 `data/**` 的 4 个常量副本，建议加一致性断言。
3. `dwellRewardRatio` 负值口径需在 M6 埋点报告里解释（当前 −4.342，GDD 通过线 <0.75）。
4. `tests/anti-camp.test.ts` 命名与 tech-spec §11 不一致（实际 `f3-bot.test.ts`）。
5. 移动端残留扫描唯一命中 `src/main.tsx:69` 的 CSS `touch-action:none`（防手势滚动，非触屏交互），判定为可接受。
6. `@types/node ^24.0.0` 与实际 Node v24.13.0 一致，M4-C6 关闭。

---

## 7. M6 输入

- 可玩的单文件基线：`dist/girls-band-live.html`（1,042,695 B，sha256 `1c17dbae…186fe`），源码与测试全绿。
- M6 只需做：集成（main/platform 已由 t106 提前落地）、真实设备验收（M1–M5）、GDD 同步（M6）、候选版打磨（音频混音、性能、无障碍人测）。
- 禁止在 M6 改玩法规则与 GDD 锁定数量；如需改，走 tech-spec §17.2 变更流程。

---

## 附录：本次复检命令

```bash
npx tsc --noEmit                                   # exit 0
npx vitest run                                     # 23 files / 259 tests passed
npx vitest run tests/f3-bot.test.ts                # 4/4，camp 7 / sweep 40
npm run validate                                   # 14/14 passed，1018.3 KiB
sha256sum dist/girls-band-live.html index.html     # 同为 1c17dbae…186fe
node /tmp/m5-seat-scan.mjs                         # R1–R4 全 0；同名 seatWorldPosition 0（临时脚本，不落库）
node /tmp/m5-spec-check.mjs                        # 77 个签名导出，缺失 0（临时脚本，不落库）
```

> 门禁只写本报告；未修改任何实现、测试或设计文档。以上数字均为本次独立复跑所得，未引用他人转述作为通过依据。
