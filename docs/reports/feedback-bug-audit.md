# 反馈根因审计：人气 / 锁定 / 形态 / 安可（t138）

- 审计人：dev-engine
- 输入：`docs/feedback/playtester-01-casual.md`、`playtester-02-survivors.md`、`playtester-04-art.md`、`playtester-05-audio.md`
- 线上构建：`dist/girls-band-live.html`（2026-10-28 09:49，与反馈所述 1,045,498 bytes 一致）
- 方法：只读源码 + 静态数据流追踪 + 与反馈截图/结算数据互证；**未修改任何源码，未运行 git、未安装依赖**。
- 标记约定：`确认` = 代码路径可完整解释现象；`部分确认` = 主因明确但具体到某位玩家的操作轨迹无法完全重放；`未确认` = 证据不足，需要实机或补充日志。

## 0. 结论摘要

| # | 反馈问题 | 结论 | 根因一句话 | 置信度 |
| ---: | --- | --- | --- | --- |
| 1 | 峰值恒 30 / 第二排不生效 | **确认** | `backstage-audience-per-30s` 没有任何消费方，卡效果从未实现；峰值统计本身正确 | 确认 |
| 2 | 返听锁定不可解 | **确认（主因）** | 解锁条件是「光心**到音箱堆的距离** > 8m」，而 GDD 写的是「光心**移动** > 8m」；观众席中部到音箱堆常只有 5–7m，玩家怎么移都解不开，且没有最长锁定兜底 | 确认 |
| 3 | 光三形态无状态 | **确认** | `HudSnapshot` / `RunUiFlags` 都没有 `lightMode` 字段；且「回照」的护盾/独奏数值本身也未实现 | 确认 |
| 4 | 白光开局即有、读不出崩盘 | **部分确认** | 白光已改为「相对本局峰值」；开局理论值 0，`run=null` 的首帧/菜单会读 `emptyHud().whiteout=0.85`；真正的问题是白光只表达比例、不表达趋势与绝对量 | 部分确认 |
| 5 | 安可从未触发 | **确认** | 人气归零先进入 `empty-house`，而中断/安可判定要求 `present > 0`，所以「直接归零」这条最常见的死法永远进不了安可分支 | 确认 |
| 6 | 局内账条 0%/100% vs 结算 4%/80% | **确认** | HUD 读 `run.stats`，而 `run.stats` 只在结算时写一次；局内统计存在 store 内部变量，从未写回 | 确认 |

一个贯穿性发现：**24 张卡里有 11+ 个 modifier key 没有任何消费方**（见 §7），这不只影响「第二排」，也是 survivors「19 次三选一没有一次变强」的直接原因。

---

## 1. 人气峰值恒 30 / 第二排不生效

### 1.1 峰值统计本身是对的

| 位置 | 作用 |
| --- | --- |
| `src/game/store.ts:854` | `start-run` 时 `stats.peakAudience = countPresent(...)`（初值 = 开场 30） |
| `src/game/store.ts:1321-1322` | 每固定步长末尾 `stats.peakAudience = Math.max(stats.peakAudience, present)` |
| `src/game/store.ts:994-996` | 结算时再 `Math.max(peak, present)` 一次 |

反证：`playtester-01-casual` 局 3 的结算峰值是 **74**，说明统计会跟着人数上涨，不是「只记开场」。survivors 三局峰值都 30，是因为**那一局的人数从未超过 30**。

### 1.2 「第二排」卡：效果未实现（确认）

**复现步骤**：局内拿到「第二排」→ 记下当前人数与时间 → 跑满 30 秒以上 → 人数不变；结算「峰值人气」仍等于开局人数（survivors 局 3：2:26 拿卡，4:24 结算峰值 30）。headless 复核：`start-run → dispatch choose-card('second-row') → 跑 60s → countPresent()` 不增加。

- 卡定义：`src/data/cards.ts:395-403`，`modifiers: [{ key: 'backstage-audience-per-30s', value: 5 }]`。
- 全仓检索 `backstage-audience-per-30s` 只有 3 处：
  - `src/data/cards.ts:78`（单位表：每 30 秒后台返场人数）
  - `src/game/upgrades.ts:93`（合成规则表：`'add'`）
  - `src/types/data.ts:266`（`ModifierKey` 联合类型）
- **没有任何 tick / store / combat / enemies 代码读取这个 key**。`store.tick` 里没有「每 30 秒」计时器，`collectModifiers` 的调用方只有 `combat.combatModifier` 的 8 个 key。
- 结论：拿了「第二排」不会加任何人。反馈里 2:26→4:24 应 +15 人却峰值 30，与此完全一致。

### 1.3 合唱墙核心：卡面条件与代价均未实现（确认）

- 卡面：`cards.ts:88-100`「四区各 ≥40 人时合唱波 ×1.5；人浪中 1 只噪音 = 4 名观众」，代价「人气自然衰减 +15%」。
- 实际 modifiers：`wave-damage-multiplier: 0.5`、`wave-convert-count: 4`、`audience-decay-rate: 0.15`。
- 消费情况：
  - `wave-damage-multiplier` → `combat.ts:182` **无条件**加 50%，**没有四区 ≥40 的判定**；
  - `wave-convert-count` → 无消费方（`combat.settleSungNoises` 用 `conversion.noiseToAudience = 2`，不读卡）；
  - `audience-decay-rate` → 无消费方（循环里没有任何「自然衰减」实现）。
- 可达性：开局 30 人（四区 7–8/区），反馈中最好的一局峰值 74（约 18/区）。要四区各 40（共 160 人）需要再唱化约 130 只噪音或等两次人浪，而三局都在 3–5 分钟空场——**短局内不可达**。

### 1.4 其他「加人」来源（供修复时对照）

| 来源 | 位置 | 产出 |
| --- | --- | --- |
| 唱化噪音 | `combat.ts:353-368` + `store.addColoredAudience` | 1 只 = 2 人（人浪中 4，进化 6） |
| 返听唱化 | `combat.returnListenerConversion` | 20 人 |
| 人浪整区转化 | `audience.applyCrowdWave` | 1:4 灰/黑转彩 |
| 第二排 | 卡存在、**未实现** | 0 |
| 轮换/达标返场 | Boss 阶段返场 +30 | 7:40 后 |

### 1.5 最小修复建议（按性价比排序）

1. **接上「第二排」**：在 `store.tick` 增一个 30s 累加器，读 `collectModifiers(run.build, data).get('backstage-audience-per-30s')`，>0 时调用已有的 `addColoredAudience(value)`（已存在，`store.ts` 内部函数），并 emit 一次 `convert`/`backstage` 事件让 HUD/音频有反馈。
2. **接上「合唱墙」条件**：在 `combat.choirDamageForZone` 里先判断「四区 `countPresent >= 40`」再给 +50%，否则只用基础伤害；同时把 `wave-convert-count` 接进 `conversionRatio()`（人浪/合唱波路径），把 `audience-decay-rate` 接进 `updateAudience` 的周期性自然流失。
3. **卡面与效果对齐**：如果 M6 前不打算实现 4×40，把卡面改成实际效果（「合唱波伤害 +50%」），否则就是持续误导。
4. **可达性**：若保留 4×40，需要把「唱化 1:2 + 人浪 + 第二排」的节奏整体提上来（例如第二排每 30s +5 改成 +8，或开局 30→60）；否则把门槛改为「四区各 ≥12」（当前峰值 74 时四区约 18，可达）。

### 1.6 风险

- 只接第二排而不解决「人数无法读」的问题，玩家仍然看不到 30→35 的变化（见 §4）。
- 合唱墙条件若真按 4×40 实现，短局会更弱——需要同时降低门槛或提高唱化产出，否则等于删卡。

---

## 2. 返听锁定不可解

### 2.1 代码路径

| 位置 | 逻辑 |
| --- | --- |
| `src/game/enemies.ts:525-532` | `isCamping`：`light.anchorAge ≥ 4s` 或任一区 `litSeconds ≥ 5s` |
| `src/game/enemies.ts:365-395` | 生成返听：`state.locked = true`，锚点 = `nearestSpeakerStack` |
| `src/game/enemies.ts:396-421` | **解锁判定**：`distanceXZ(lightPoint, anchor) > balance.antiCamp.releaseDistance(8)`，或视线角偏离 > 60° 持续 `releaseSeconds(1.5s)` |
| `src/game/waves.ts:356-363` | 音箱堆坐标：`(x≈±9.96, z≈4.3)`（座位网格最前排再前一格） |
| `src/game/enemies.ts`（锁定块末尾） | 锁定期间每 1.5s 在光锥边缘召 1 只啸叫；`state.lockSeconds` 只累加，**没有任何上限或超时解除** |

### 2.2 根因：GDD 的「光心移动 >8m」被实现成「光心与锚点距离 >8m」

- GDD §8.2/§11.1 原文：「持续到你**让光心移动 >8m**，或让光与它断开视线 1.5s」。
- 代码比较的是 `distance(光心, 锚点)`。音箱堆在观众席最前排两角，玩家在观众席中部（z 5–26）时：
  - 前排左区中心 ≈ (5.3, 10) → 到最近锚点 ≈ **7.3m < 8m**；
  - 前排右区中心 ≈ (−5.3, 10) → 同样 ≈ 7.3m；
  - 只有把光移到**后排**（z ≈ 20+）或**对侧远角**才会超过 8m。
- 于是「把光从前左移到前右」（移动量 10.6m，符合 GDD）**不会解锁**；玩家看到的现象就是「移光没用」。
- 视线条件同样难触发：光停在观众席时，光心与锚点的夹角变化很小（都在画面下方），`angleDelta > 60°` 基本不会持续 1.5s。
- 另外：锁定后 `isCamping` 若仍为真（光没离开该区、`anchorAge` 没重置），冷却结束会再生成第二只返听（cap=2），造成「刚挣脱又被咬」的观感。

### 2.3 复现步骤（静态可推演）

1. 开局把光停在前排任一区中心 15–20 秒 → `isCamping` 成立 → 返听在最近音箱堆生成并锁定。
2. 把光在观众席内左右移动 10m（仍在锚点 8m 内）→ `distance` 始终 ≤8m，视线角不变 → `locked` 保持 true。
3. 不把光移到后排/对侧，人气持续下降 → 空场。HUD 只显示「返听锁定」布尔，没有倒计时或解法提示（`HudSnapshot.returnLocked` 在 `src/types/game.ts` 的 `HudSnapshot` 中只有布尔）。

> 注：survivors 局 2 用的是「回照」核心，光心会回到主唱脚下（舞台）；若主唱站在舞台中央 (0,−1)，到锚点约 11.3m，理论上应解锁。因此「40 秒完全不解锁」**部分确认**——取决于他实际把光停在哪里；但「在前排移动无法解锁」这一主因是确定的。

### 2.4 最小修复建议

1. **改判定语义**（一行级）：锁定瞬间记录 `lockOrigin = light.position`，解锁条件改为「自锁定起光心**累计位移** ≥ `antiCamp.releaseDistance`」或「当前光心与 `lockOrigin` 的距离 ≥ 8m」；保留「离锚点 >8m」作为快速通道。
2. **加兜底**：`balance.antiCamp` 增 `maxLockSeconds`（建议 6–8s），`lockSeconds` 到点强制解锁；解除时 emit `return-listener`（已有 `unlock` action）与一声明显的挣脱音效。
3. **给解法**：`HudSnapshot` 增 `returnLockRemaining: Seconds`（或 `returnLockProgress: Ratio`），HUD 显示「移开 / 点燃 2 次 / 绕后」的倒计时环；排练室第 3 页同步。
4. **避免立刻重锁**：解锁后给一个短冷却（`spawnCooldown ≥ 4s`），且同一只返听在「已解锁过一次」后不再自动重锁。

### 2.5 风险

- 改判定会让锁定更容易解除 → 反驻守变弱。**必须重跑 `tests/f3-bot.test.ts`**（t105 刚修好，camp ≤18 / sweep ≥36），否则会打回原形。
- 加 `maxLockSeconds` 与「锁定期间每 1.5s 召啸叫」叠加，会降低锁定期的 DPS 压力，需要同步看驻守 bot 的掉人曲线。

---

## 3. 光三形态无状态

### 3.1 代码现状

- 逻辑层有状态：`run.light.mode`（`src/game/light.ts` 每 tick 写 `run.light.mode = 'spread' | 'beam' | 'self'`），`run.light.radius` 随形态变化。
- 但**快照层没有**：
  - `src/types/game.ts` 的 `HudSnapshot` 字段：`revision / whiteout / critical / zones / lightCoverage / noisePressure / beatPhase / beatStrength / segmentIndex / silent / returnLocked / brokenLines / overheatedZone / holdProgress / encoreAvailable / runSeconds` —— **没有 `lightMode`，也没有 solo/护盾**。
  - `src/ui/bridge.ts` 的 `RunUiFlags`（`bridge.ts:420-440`）同样没有。
  - HUD 组件（`src/ui/components/Hud.tsx`）没有形态指示。
- **更深一层**：`回照` 核心的护盾效果本身没有实现。
  - 卡 modifiers：`shield-max: 60`、`shield-regen: 6.4`（`src/data/cards.ts:111-115`）。
  - 全仓检索 `shield`：只有 `lines.ts` 的「贝斯护盾」（线断则失效）与存档字段，`light.ts` / `audience.ts` / `combat.ts` **没有** 玩家护盾数值、没有护盾判定、没有 `self-duration` / `self-cooldown` 的消费。
  - 所以即使给 HUD 加字段，也没有「护盾值」可显示——这是美术/UI 反馈「拿到回照后画面没有任何变化」的最终原因。

**复现步骤**：选核心「回照」→ 把光移到主唱脚下（或按住左键/点击）→ 观察 HUD 与画面：没有形态文字、没有护盾圈、没有冷却环；只有「核心 回照」卡名。survivors 局 2、局 3 均复现。

### 3.2 最小修复建议

1. **类型契约扩展**（需 tech-director 走 §17.2 变更：改 `src/types/game.ts` + tech-spec 同步）：
   - `HudSnapshot` 增 `readonly lightMode: LightMode;`
   - `readonly igniteCooldown: Ratio;`（0..1，用于点燃环）
   - `readonly soloShield: Ratio;`（0 = 非独奏/无护盾，1 = 满）
2. **实现独奏护盾**（`light.ts` 或新逻辑块）：`coreCard === 'solo-return'` 且 `mode === 'self'` 时维护护盾值，受噪音撞击 −12、每 2 拍 +6，归零强制退出回照；同时「独奏时贝斯护盾失效」在 `lines.ts` 读 `run.light.mode === 'self'`。
3. **UI**：HUD 常驻三格形态指示（散/束/回），首次拿到核心时给出「把光收回脚下」的一行提示与画面护盾圈（美术层已有 `render.light` 可扩展 `shield` 字段）。
4. **临时兜底**（不改契约）：先在 HUD 用「点燃冷却环 + 回照时屏幕边缘冷色描边」表达形态，等契约变更落地再补文字。

### 3.3 风险

- `HudSnapshot` 是冻结接口，加字段需要三处同步（types / tech-spec / bridge + HUD），否则 `tools/validate` R12 与 `tsc` 会拦。
- 「独奏无法转化」是回照的代价（`canConvert=false`，已实现），若护盾再强，可能变成「停住无敌」——需要 bot 复测（驻守 bot 用回照的极端情况）。

---

## 4. 人气读数（白光）

### 4.1 现状

- 公式：`src/game/audience.ts:828` `computeWhiteout(audience, capacity, peakAudience)` = `0.85 × (1 − audience / max(1, peak, audience))`。
- 调用：`store.ts:635`（HUD）、`store.ts:728`（Render uniform），都传 `max(1, stats.peakAudience, present)`。
- 所以**开局 30/30 → 白光 0**；线上构建 09:49 已包含 `peakAudience`（`dist/girls-band-live.html` 可检索到 2 处）。
- 但 `emptyHud()`（`store.ts:281`）的 `whiteout: 0.85`：`run === null` 时（菜单/首帧）HUD 会拿到 0.85。如果 `start-run` 后的第一拍没有立即 `publishHud(true)`，玩家会看到一次满白闪。

**复现步骤**：开局（30/30）读 `hud.whiteout` → 理论 0；人气掉到 15 → 白光 0.425；掉到 0 → 0.85。用反馈截图对比：`05-run-main.png`（开局，四周暗角）与 `09-空场白光.png`（0.85 满白）不是同一种视觉。

### 4.2 为什么仍然「读不出崩盘」

1. 白光只表达「当前 / 本局峰值」，而峰值对玩家不可见。开局 30、掉到 15 时白光 0.425——玩家不知道 0.425 意味着「掉了一半」，因为没有刻度、没有趋势。
2. 一旦峰值被抬高（例如 74），白光基线也抬高；从 74 掉到 37 与从 30 掉到 15 观感相同。
3. 反馈中「边缘一直在白」更可能是画面四周的暗角/雾（见 `docs/feedback/shots/playtester-01-casual/05-run-main.png`：四角是暗的、非白），**未确认**是否为 whiteout 遮罩；`playtester-04-art` 的 `09-空场白光.png` 才是真正的 0.85 满白。

### 4.3 非数字替代读数（建议，按实现成本排序）

1. **分区亮灯比例**：每区 `colored / 192` 映射到角标的填充高度或色带（0–25/50/75/100%），玩家能一眼看出「这一区还剩多少人」。
2. **趋势箭头**：用 10s 滑动窗口的 `present` 差分，三档「↑ / → / ↓」显示在目光—危险条上；不给数字，只给方向。
3. **空位剪影**：观众席最前两排的「空座」用更暗的方块显式画出来（当前 768 席几乎全黑，玩家看不出哪空了）。
4. **崩盘预警**：`present < peak × 0.15` 且持续 3s → 屏幕边缘脉动频率提升 + 主唱呼吸声（`member-moment` 已有 `breath`）+ 心跳音；空场前 8–10 秒给一次强提示。
5. **白光分级**：把 0.85 的连续值改成 4 档（0 / 0.2 / 0.45 / 0.85），每档配一个明确的音效/边缘强度，避免「一直在白」的钝感。

### 4.4 风险

- 白光公式已被 `docs/acceptance.md`/tech-spec §14.3 引用（原始口径是 `0.85×(1−a/768)`）；当前实现改成了 peak 基准，**与验收口径不一致**，需要 tech-director 确认以哪个为准（若按原始口径，开局 30/768 → 0.82，正是反馈「开局即白」的另一种解释）。

---

## 5. 安可未触发

### 5.1 代码路径与根因

| 位置 | 逻辑 |
| --- | --- |
| `src/game/store.ts:1321-1326` | `present === 0` → 立刻 `phase = 'empty-house'` |
| `src/game/store.ts:1329-1339` | 中断判定要求 `present > 0` 且 `present ≤ peak × 0.08` 连续 `lowAudienceBars(8)` 小节 |
| `src/game/store.ts:1340-1348` | 满足才进入 `paused` + `waitEncore`，此时才允许 `encore` 命令 |
| `src/ui/bridge.ts:248-252` | `isWaitingEncore` 同样要求 `lowAudienceBars ≥ 8 && !encoreUsed` |

- 三局都是「人气清零」→ 走 `present === 0` 分支 → **永远不会进入中断判定** → 安可窗口永远不会出现。
- 即便人气是缓慢下滑，`peak × 0.08` 在 peak=30 时是 2.4 人，需要「>0 且 ≤2」持续 8 小节（约 15 秒）才触发，实战中几乎不可能精确落在这个窗口。

**复现步骤**：任一局让人气直接归零（束光扫观众 / 放任噪音覆盖）→ 立刻出现「空场，只剩你还在弹」，没有「安可 / 继续独奏」弹窗；结算显示「安可未用」。三局一致。

### 5.2 最小修复建议

1. **归零前给安可窗口**：在 `present` 首次跌破 `peak × 0.08` 时启动「告急」状态（白光脉动 + 心跳），而不是等到 8 小节；若期间 `!encoreUsed`，在 `present` 归零的那一帧先弹「安可 / 继续独奏」而不是直接 `empty-house`。
2. **或**：`present === 0` 时若 `!encoreUsed`，把 `phase` 设为 `paused` + `waitEncore`，让玩家选择（选「继续独奏」才进空场）。
3. **排练室/卡面**写明安可条件（「人气见底时可救一次」），否则「安可保险」卡对玩家等于不存在。
4. 保留 GDD §13.2 的「空场是完成不是失败」：安可只是把「直接归零」改成「可救一次」，不改变结局语义。

### 5.3 风险

- 改归零流程会改变空场演出节奏（空场是目前最好的结算屏之一），建议只加一次「可选安可」，不做强制弹窗。
- 安可恢复公式：`max(60, peak × 0.4)`（`store.ts:1557-1561`）；peak=30 时恢复 60 人——比开局还多，需要同步调成 `min(peak, ...)` 或 `max(开局人数, ...)`。

---

## 6. 局内账条 vs 结算口径

### 6.1 代码路径（根因确认）

- HUD 账条：`src/ui/components/Hud.tsx:183-213`（`BuildStrip`）：
  - `total = run.converted + run.burned`；`convertShare = total === 0 ? 0 : converted / total`。
- 数据源：`src/ui/bridge.ts:437-439` → `run.stats.converted / run.stats.burned / run.stats.covered`。
- **`run.stats` 只在 `src/game/store.ts:1013`（`finishRun`）写一次**；局内每 tick 更新的是闭包里的 `stats`（`MutableStats`），从未写回 `run.stats`。
- 因此局内 `converted = 0, burned = 0` → `total = 0` → `convertShare = 0` → 账条恒为 **0% 转化 / 100% 烧死**，与 survivors「局 1、局 2 恒为 0%/100%」完全一致。
- 结算页（`ResultsScreen.tsx:43`）用 `view.stats`（来自 `RunResult`），所以显示 4%/80% 正确。

**复现步骤**：局内读左下「账」条（恒 0%/100%）→ 结算页读「转化 / 烧死」（12/296 = 4%、8/2 = 80%）。两者同源不同值，因为局内读的是从未写回的 `run.stats`。

### 6.2 最小修复建议

1. **在 `buildHud()` 里回写**：`run.stats = statsSnapshot(stats, run.time)`（对象替换，字段只读但引用可变），每拍一次（≈2Hz，可忽略分配）。之后 HUD 的账条自动变成「本局累计」。
2. 若不想每拍替换 `RunState.stats`（结算语义被污染的风险）：给 `HudSnapshot` 增 `convertedRate: Ratio` / `burnedRate: Ratio`，由 store 直接算，bridge 改读这两个字段（需契约变更）。
3. 在账条旁标注时间窗（若保留滑动窗口方案）；当前实现不是滑动窗口，是「永远 0」。
4. 顺带修 `playtester-02` P7（暂停面板不显示核心）：`PauseOverlay` 已接收 `coreName`（`bridge.ts:365`），但 `BuildStrip` 与暂停面板读取的 `run` 来源不同，需要统一到 `getRun()`。

### 6.3 风险

- `run.stats` 兼作「结算快照」，回写后如果结算前又读 `run.stats` 会拿到实时值而不是终值——需要确认 `finishRun` 里先算终值再写（当前顺序是对的）。
- 账条从「永远 0%」变成真实比例后，玩家会更强烈地感到「我一直在烧」——这与 §1 的「养人爬坡」是同一个问题的两面，建议同批修。

---

## 7. 附加发现（不在六问内，但同源、会放大上述问题）

### 7.1 24 张卡里 11+ 个 modifier 没有消费方

`combat.combatModifier()`（`combat.ts:96-98`）是唯一的动态读取入口，它实际被调用的 key 只有 8 个：

```
wave-damage-multiplier / zone-output-multiplier / all-zone-damage-multiplier /
burn-multiplier / burn-chain-chance / damage-per-noise /
return-listener-sing-multiplier / return-listener-cap
```

其余 key 在 `src/game/**` 中**没有任何读取点**（只出现在 `data/cards.ts`、`upgrades.ts` 的合成规则表、`types`）：

| key | 对应卡/效果 | 状态 |
| --- | --- | --- |
| `backstage-audience-per-30s` | 第二排 +5 人/30s | **未实现** |
| `wave-convert-count` | 合唱墙「人浪 1:4」 | **未实现** |
| `audience-decay-rate` | 合唱墙代价「人气衰减 +15%」 | **未实现** |
| `shield-max` / `shield-regen` | 回照护盾 60 / 回 6 | **未实现** |
| `self-duration` / `self-cooldown` | 回照持续/冷却 | **未实现** |
| `bait-zone-multiplier` | 引线「招灾 ×2」 | **未实现** |
| `black-zone-heat-cap` | 引线代价「该区热度上限 2」 | **未实现** |
| `black-resing-multiplier` | 引线「黑观众二次唱化 +50%」 | **未实现** |
| `front-row-heat-floor` | 第一排「最前 60 人永不掉 0 级」 | **未实现** |
| `heat-decay-delay` | 留人「掉级延迟 +4s」 | **未实现** |

这与 survivors「19 次三选一没有一次产生变强体感」直接对应：**多数卡只是改了一个没人读的数字**。建议在 M6 前做一次「卡效果接线」专项（每张卡至少有一个消费点 + 一条单测）。

### 7.2 结算「第二排还空着 64 个位置」的口径

`store.countSecondRowEmpty`（`store.ts:374-387`）遍历四区各自的第二排（4 × 16 = 64 席）。玩家读到「第二排」会以为是「观众席第 2 排」（32 席），文案与实际口径不符。建议改为「四区第二排还空着 64 个位置」或只统计全场第 2 排。

### 7.3 暂停面板「当前构筑」与 HUD 不一致

`bridge.buildPause()`（`bridge.ts:358-368`）确实读了 `run.build.coreCard`，`PauseOverlay.tsx:26` 也渲染了 `coreName`；但反馈看到的是「还没有拿到卡」。可能是暂停面板里的卡列表（`view.cards`）为空时的兜底文案压过了核心显示，属 UI 层小 bug，**未确认**具体分支，建议 QA 用 `?dev=1` 复现后定位。

---

## 8. 建议修复顺序（M6 前）

| 优先级 | 问题 | 理由 |
| ---: | --- | --- |
| P0 | §1.2 第二排未实现 + §6 `run.stats` 未回写 | 两项都是「玩家看不到任何增长」的直接原因，改动小、收益最大 |
| P0 | §2 返听解锁判定（改为光心位移 / 加超时兜底） | 反驻守是设计核心，当前会变成不可逆死亡螺旋；改完必须重跑 `tests/f3-bot.test.ts` |
| P1 | §5 安可窗口（归零前一次选择） | 救场机制对玩家等于不存在；与「空场是完成」不冲突 |
| P1 | §1.3 合唱墙条件与代价接线（或改卡面） | 核心卡「选了用不上」是构筑信任问题 |
| P1 | §7.1 卡效果接线专项 | 决定 24 张卡是否有意义 |
| P2 | §3 形态 HUD + 独奏护盾实现 | 需要契约变更（HudSnapshot），走 §17.2 |
| P2 | §4 非数字人气读数（区亮灯比例/趋势/预警） | 设计工作量在 UI，建议与 §1 同批 |

## 9. 未确认清单

1. survivors「白光从开局就一直在」：线上构建已用 peak 基准，开局理论白光 0；截图显示的是暗角/雾，**未确认**是否为 `emptyHud().whiteout=0.85` 的首帧或画面固有暗角。
2. survivors「移光/绕后 40 秒完全不解锁」：主因（距离判定）已确认，但他的具体光心轨迹无法重放；若他把光移到后排/对侧，理论上应能解锁——**部分确认**。
3. 暂停面板「当前构筑」不显示核心：代码路径看起来会显示，**未确认**实际渲染分支。
4. `zoneConversionRate` 在 90 秒门里最低区 0.375（t105 记录）：与本次六问无关，属埋点口径，留给 QA。
