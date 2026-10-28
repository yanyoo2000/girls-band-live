# v1.0.1 P0 Gameplay 接线报告（t139）

- 日期：2026-10-28
- 角色：技术总监
- 依据：`docs/reports/feedback-bug-audit.md`（t138）、t134 速通、t122 复测
- 结论：P0 卡效果/统计/锁定/安可/形态/快照全部接线；四命令全绿；3 局 9:30 完成、峰值 >30、核心触发、三选一 10 次且前 3 分钟仅 3 次。**峰值 >300 与 A/S 可达性本轮 defer**（见 §6）。

---

## 1. 卡效果接线（逐 key）

| modifier key | 对应卡 | 消费点 | 测试 |
| --- | --- | --- | --- |
| `backstage-audience-per-30s` | 第二排 +5/30s | `store.tick` 30s 计时 → `addColoredAudience`；结算/峰值同步 | `modifier-wiring`：与无卡基线 31s 对照 +5 |
| `wave-damage-multiplier` | 合唱墙（四区≥40 ×1.5） | `combat.choirDamageForZone` 四区 present≥40 才加 50% | `modifier-wiring`（wave-convert 同卡；条件路径单测） |
| `wave-convert-count` | 合唱墙 1 怪=4 人 | `combat.noiseConversionValue` → 唱化产出 | `modifier-wiring` 期望 4 |
| `audience-decay-rate` | 合唱墙代价 +15% | `store.tick` 每 30s 移除 `ceil(present×rate)` | 观察路径；见 §6 说明 |
| `shield-max` / `shield-regen` | 回照/护盾 | `store.updateSoloState` 初始化/回复；`audience` 锁定/过热流失优先扣盾 | `modifier-wiring`：self 盾值>0、HUD 同步 |
| `self-duration` / `self-cooldown` | 独奏延长 | `updateSoloState` 独奏时长/冷却；`light.updateLight` 冷却期强制散光 | 状态机接线；见 §6 |
| `bait-zone-multiplier` | 引线招灾×2 | `waves.ringPosition` 诱饵区概率提升 | `modifier-wiring` `baitZoneWeight=2` |
| `black-zone-heat-cap` | 引线代价热度上限2 | `audience.zoneHeatCap` 按光心区取 2 | 接线；见 §6 |
| `black-resing-multiplier` | 引线黑观众二次唱化+50% | `audience` 黑→彩进度 ×1.5 | 接线 |
| `heat-decay-delay` | 留人 +4s | `audience` 掉级延迟 | 接线 |
| `back-row-decay-extra` | 第一排代价 | 后排掉级延迟 −2s | 接线 |
| `front-row-heat-floor` | 第一排最前60人 | 前两排热度不低于 floor | 接线 |
| `encore-retain` | 安可保险 | `store.useEncore` 恢复比例替代 balance | 接线；见 §6 |

## 2. 局内统计回写

- `store.buildHud()` 每拍 `run.stats = statsSnapshot(stats, run.time)`；HUD 账条/`RunUiFlags` 与 `finishRun` 结算同源。
- 修复前：局内永远 0%/100%；修复后：`run.stats.converted/covered/leftVenue` 实时。
- 测试：`modifier-wiring` 断言 HUD 构建后 `run.stats.converted>0`，且 `converted >= covered`（累计人次口径）。
- 峰值：`startRun` 初值 30、每 tick `max(peak,present)`、结算再 max；第二排现在真加人，峰值可 >30（实测 120–195）。

## 3. 返听锁定可解

- `ReturnListenerState.lockOrigin` 在锁定瞬间记录光心；解锁条件改为「到锚点 >8m **或** 距 lockOrigin ≥8m **或** lockSeconds ≥7s 兜底」；解锁后 spawnCooldown ≥4s。
- HUD：`returnLockRemaining` + `maxLock`；`HudSnapshot` 驱动倒计时条（无数字）。
- 测试：`modifier-wiring` 光心位移 9m → released；lockSeconds=7 → released。
- f3-bot 未回退：camp 30→9 ≤18；sweep 30→40 ≥36；4/4。

## 4. 安可窗口 / 空场

- `present===0 && !encoreUsed` 时不再直接 empty-house：进入 `paused` + `waitEncore`，`lowAudienceBars=8`，由 InterruptOverlay 让玩家选「安可/继续独奏」。
- 安可恢复目标改为 `min(peak, max(minAudience, peak×ratio))`（peak30 →30，不再 60）；`encore-retain` 覆盖比例。
- 空场后：`levelUpEnabled=false`（store 禁止 levelup），`canRestart=true`；继续独奏仍走 empty-house。
- 测试：`modifier-wiring` 人气清零 → paused/低人气阈值 → encore → playing + 观众恢复。

## 5. 光三形态 / 快照契约（t143 只读）

- `LightState` 新增 `soloShield/soloRemaining/selfCooldown`；`HudSnapshot`/`RunUiFlags` 新增（可选，兼容旧 fixtures）：
  `lightMode`、`igniteCooldown`、`soloShield`、`lockRemaining`/`returnLockRemaining`、`maxLock`/`maxLockSeconds`、`level/xp/nextLevelXp`、`zoneOccupancy`/`zoneLightRatios`、`audienceTrend`、`audienceLow`、`emptySeats`/`secondRowEmpty`。
- `RunResult.lineBreaks?: {guitar,bass,drums}`（store 计数填；bridge 保留事件计数）。
- `LevelUpView.level/xp/nextLevelXp?`；`RunUiFlags.levelUpEnabled/canRestart?`。
- HUD 新增 `LightState` 组件：散/束/回照文字 + 护盾条 + 锁定条（不显示数字）。
- **defer**：`AudienceFrame.lit: Float32Array` 逐座 0..1 未加；t143 可读 `HudSnapshot.zoneLightRatios` + `lightCoverage` 近似。

## 6. 数据 / 节奏实测与 defer

3 局正常（seed 202611/202612/202613，页面内真实键鼠等价输入 + 自动选卡）：

| seed | 三选一 | 前3分钟 | 时间点 | 峰值 | 结局 | 核心 |
| ---: | ---: | ---: | --- | ---: | --- | --- |
| 202611 | 10 | 3 | 40/103/158/223/283/333/388/437/480/515 | 195 | complete C | 回照 |
| 202612 | 10 | 3 | 38/102/158/220/277/328/365/406/444/480 | 120 | complete C | 引线 |
| 202613 | 10 | 3 | 40/105/169/236/300/354/416/466/504/549 | 130 | complete C | 回照 |

- XP 缩放：前 3 分钟 ×0.30，之后线性到 ×1.5；两次升级至少间隔 8s（不背靠背）；阈值/10 选/24 卡未改。
- **defer（写清理由）**：
  1. **峰值 >300**：当前 3 局 120–195；4×40 合唱墙条件与第二排已接线，但普通操作经济仍不足。调高唱化/人数会改 f3 与评级，需产品定数。
  2. **A/S 可达**：B 需终场≥300，当前峰值不足；评级公式未改，待 peak 经济解决后重测。
  3. **噪音 HP / 2.5s 唱化**：12HP vs 24dmg/s 仍 0.5s 死；本轮未动 HP/伤害，避免破坏 f3/点燃手感；建议下一轮把唱化改为独立进度或提高底噪 HP。
  4. **AudienceFrame.lit**：逐座被照数组未加；t143 用 zoneLightRatios/lightCoverage。
  5. **4×40 门槛**：按卡面实现（≥40/区），短局难达；若产品要可达，需把门槛降到 12–20 或提高唱化产出。

## 7. 四命令 / file://

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm test` | 30 文件 / 292 用例全过（新增 modifier-wiring 8） |
| `npm run build` | exit 0；`dist/girls-band-live.html` = 根 `index.html` = **1,061,149 B（1,036.3 KiB）**；sha256 `fc932fe35677…` |
| `npm run validate` | 14/14 rules passed |

- file:// 3 局 9:30 均 complete；控制台 0；Boss/人浪/结算正常。
- 未改 24 卡/3 构筑/3 进化/9:30/768 席数量；未运行 git、未安装依赖。

## 8. 给 t143 的集成点

- 读取字段见 §5；**空场后** `RunUiFlags.levelUpEnabled=false`、`canRestart=true`；暂停/重开由 `canPause/canRestart` 决定。
- 连续两局：bridge `startRun` 先 `hudSnapshot=FALLBACK_HUD`，store 新建 build；`modifier-wiring` 已断言 build/core/cards 清空。若 UI 仍显示 chips，请确认使用的是 `bridge.run` 最新快照而不是旧的 `state`。
- 失焦/blur 暂停：本轮未改 bridge/main（scope 外）；建议 t143 在 visibilitychange/blur 调 `bridge.dispatch({type:'pause'})`，需注意不要覆盖菜单/结算。
