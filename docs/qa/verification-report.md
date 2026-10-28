# M6 候选版验证报告（t109 / qa-automation）

> **版本注记（M7 发行包装，2026-10-28）**：本报告是 **t109 旧版**（产物 1,041,922 B / `9277a800…`），其中 AC-F08 的 **fail** 结论已被 **t113**（峰值基准修复 + acceptance/tech-spec/GDD 同步）与 **t123**（最终审查复核）取代；当前发布候选为 **1,045,498 B / `2d2d91c2…`**。本报告的 P0 矩阵与 blocked 清单仅作历史证据，最终结论以 [docs/reports/m6-gate.md](../reports/m6-gate.md) 与 [docs/reports/m6-rc.md](../reports/m6-rc.md) 为准。

- **日期**：2026-10-28 04:19–04:36（Asia/Shanghai）
- **验证对象**：候选版单文件 `dist/girls-band-live.html`（由本机 `npm run build` 新构建，未复用 t108 产物结论）
- **环境**：Windows 10/11 x64、Node v24.13.0、npm 11.6.2、Vitest 5.0.5、**Microsoft Edge 156.0.0.0（Chromium）**、viewport 1280×673（devicePixelRatio 2，截图 2560×1346）
- **产物**：1,041,922 B（1017.5 KiB），sha256 `9277a8003eb890a698b0c517445ff852cbc7abab9ea8d9a0dcebb267bb3b9df2`
- **本文件取代 t96 的 M5 版验证报告**；单元测试覆盖见 `docs/qa/unit-report.md`。
- **结论**：自动化四命令与 `file://` 全流程**通过**；P0 矩阵 **18 pass / 21 blocked / 1 fail**（A01–A27：13/14/0；F1–F13：5/7/1）。**不伪报全绿**：AC-F08 按验收原文判 **fail**（high），另有 1 个 medium 记录口径问题。M6 是否放行由制作人按本报告裁定。

---

## 1. 四命令（本次独立实跑，2026-10-28 04:19–04:20）

| # | 命令 | 退出码 | 关键输出 |
| --- | --- | --- | --- |
| 1 | `npm run typecheck` | 0 | `tsc --noEmit`，无错误输出 |
| 2 | `npm test` | 0 | `Test Files 24 passed (24)` / `Tests 263 passed (263)` / `Duration 1.77s`；无 skip/todo/only |
| 3 | `npm run build`（连续两次） | 0 / 0 | 两次 `build-single: dist/girls-band-live.html 1017.5 KiB (sha256 9277a8003eb8)`；根 `index.html` 同步写入 1,041,922 B |
| 4 | `npm run validate` | 0 | `validate: 14/14 rules passed（1017.5 KiB，sha256 9277a8003eb8）` |

- 产物核对：`dist/girls-band-live.html` 与仓库根 `index.html` 字节一致，各 1,041,922 B；两次构建 sha256 完全一致（AC-T03 / AC-T10）。
- 补充：`node tools/check-layers.mjs` → `check-layers: 83 files, 0 violations`（AC-T08 / AC-F10 的分层证据）。
- 测试明细：`tests/f3-bot.test.ts`（4）、`tests/seat-layout.test.ts`（21）、`tests/ui-smoke.test.tsx`（3）、`tests/clock.test.ts`（15，含 t108 新增 2 条）、`tests/hud.test.ts`（11）、`tests/levelup.test.ts`（1）均通过。

---

## 2. `file://` 单文件全流程（Edge，Chromium）

打开方式：`file:///D:/yan-github-code/Girls%20Band%20Live/dist/girls-band-live.html`（长跑证据用 `?dev=1` 暴露的 `__gbl.store` 在页面内按 1/60s 步长推进；正式 URL 无 `__gbl`，已验证）。

| 步骤 | 结果 | 证据 |
| --- | --- | --- |
| 启动页 → 点击开始 → 主菜单 | 通过；四成员/记录/音量可见 | `01-boot.png`、`02-menu.png` |
| 今晚的曲目单 | 通过；显示上一场真实数据（江栖/许燎/闻笙/邵砚 + 旁白） | `03-setlist.png` |
| 排练室 3 页（走位与光 / 烧与唱化 / 危险与返听） | 通过；翻页可用 | `04-rehearsal-p1.png`、`05-rehearsal-p2.png` |
| 开始演出（序曲） | 通过；舞台/HUD/四区点/5 段位点出现；HUD 0 数字 | `07-playing-start.png` |
| 移动 / 移光 | 通过：按 D 键 player.x 0 → 3.12（约 1.15s），光线位置 3.81 → 7.27，模式 spread | §4.1 读数；`08-playing-moved.png` |
| 升级三选一 | 通过：首轮 3 张核心（引线/回照/合唱墙），1/10，不可重抽；点选后回演出（核心=合唱墙，卡进度 1/10） | `11-levelup.png` |
| 暂停 | 通过：Esc → 暂停面板（1:51 · 主歌 · 合唱墙）；0.7s 内 `run.time` 冻结；Esc 恢复后时间前进 | `12-pause.png` |
| 失败/结算 | 通过（空场完成路径）：4:49 空场结束 → 散场之后（C、251/155/239/768/32、4:49、裂缝 1）；另完整跑通 9:30 完成局（§4.2） | `09-results-empty-house.png`、`19-results-complete.png` |
| 重开 | 通过：再演一场 → 新局序曲、核心未定、卡进度 0 | `10-restart-playing.png` |
| 设置 / 制作名单 | 通过；设置含三路音量/画质/减少动态/高对比/节拍脉冲/低闪 | `13-settings.png`、`15-credits.png` |
| 离开确认 | 通过：暂停 → 回主菜单 → 二次确认 | 快照（无截图） |
| 控制台 | **0 条消息**（启动/菜单/演出/升级/暂停/结算/重开/设置/破坏存档全程） | `list_console_messages` 为空 |
| 网络 | **仅 1 条** `file://…/girls-band-live.html` 文档请求；无 http(s)/CDN/字体请求 | `list_network_requests` |
| 正式 URL（无 `?dev=1`） | 通过：启动→主菜单；`window.__gbl === undefined`（dev 入口未泄漏） | `18-production-menu.png` |

截图目录：`docs/qa/shots/verification/`（17 张；命名见上表；`13-menu-after`/`14-menu-reload` 为菜单回退/刷新证据，未列入主流程）。

---

## 3. P0 矩阵抽查（docs/acceptance.md）

状态：**pass** = 本次有机器证据且满足通过线；**blocked** = 需人测/实机/更长跑，本次无法判定；**fail** = 按验收原文不满足，可复现。

### 3.1 AC-01–AC-22（A01–A22）

| ID | 状态 | 证据 / 说明 |
| --- | --- | --- |
| A01 | **pass** | 完整局 9:30：`ending=complete`、`duration=570.02s`、C、峰值 280/终场 205、3 人浪/3 裂缝；结算→再演一场可用（`19-results-complete.png`、`10-restart-playing.png`） |
| A02 | blocked | 主菜单四成员姓名/职责可见；5 名新玩家“她是谁/怎么打”需人测 |
| A03 | pass（单测） | `tests/light.test.ts` 12 例：三形态半径 4.2/1.6/3.0、回照每 4 拍 −1 人、锁定/吞光收窄；浏览器仅验证 spread 与移光 |
| A04 | pass（单测+链路） | `tests/ignite.test.ts` 9 例（1.6/1.2/0.4、和弦 ±25%、错拍最差 0.3）；浏览器点燃后 `igniteCooldown=0.72s`、`intensity>0` |
| A05 | pass | `tests/audience.test.ts` 11 例（0.4+1.5s、中断 50%、12s 掉级、覆盖 −1/黑化/离场）；实局转化 642 |
| A06 | pass | `tests/crowd-wave.test.ts` 7 例；实局 `crowdWaves=3`、`cracks=3`（2:00/5:00/8:00） |
| A07 | pass（部分） | 实局返听锁定 8 次、`burned=1287`；Boss `phase=retired`、`phaseStartedAt=460`；三阶段逐帧表现未逐个截图 |
| A08 | **pass** | `npx vitest run tests/f3-bot.test.ts` 4/4：驻守 30→7（−76.7%）、扫场 30→40（+33.3%）；gate-90s 9 项数值见 §4.3 |
| A09 | pass | 首轮三核心三选一、核心生效、卡进度 1/10；`tests/progression.test.ts` 14 例（24/10/3、互斥、不重抽、picks≤10） |
| A10 | blocked | 静音看 15s 的 5 人理解需人测 |
| A11 | pass（机器部分） | 战斗 HUD DOM 文本数字计数 **0**（脚本扫描 `main` 内数字=0）；结算页允许数字；5 人读白光比例仍需人测 |
| A12 | blocked | 本次未触发失败卡（空场是完成、不是失败卡）；需专门低人气/中断局 |
| A13 | blocked | 90 秒人类门需实测；埋点链路已在 f3-bot 验证（字段有值） |
| A14 | blocked | 6:30 静默段未单独观测（9:30 局经过该时刻但未截图/读数）；`tests/boss.test.ts` 11 例覆盖 8 小节=15s |
| A15 | blocked | 终曲长按：`holdProgress=1` 且 complete；但“人气充足/不足两种结果”与 Space 实操未分别验证 |
| A16 | pass | 结算页与 `RunResult` 逐项一致：280/205/642/1287/625/161/563/15/3/9:30，不含击杀数 |
| A17 | pass | 八屏走通：启动/主菜单/曲目单/排练/设置/制作名单/暂停/结算 + 升级/离开确认 |
| A18 | blocked | 5 层/12 合唱/12 SFX 听感与静音可玩需人测（`tests/music.test.ts` 仅逻辑） |
| A19 | pass | 高画质 DPR 1.5（canvas 1920/1280）、低画质 DPR 1.0（1280/1280），切换立即生效；两档均渲染 |
| A20 | pass | 破坏 `gbl.save.v1`（写 `{broken-json`）后启动：≤1s 进主菜单、记录回默认、`.bad` 备份存在、无未捕获异常（`17-save-recovered.png`）；设置 `reducedMotion=true` 刷新后保留 |
| A21 | blocked | 仅验证 Tab 焦点移动；高对比/色觉/减少动态视觉与 5 人复述未测 |
| A22 | blocked | 仅 120 帧单次采样（见 §4.1），非 1280×720 集显 3 局 |
| A23 | blocked | 本局 `evolution=null`（未凑齐核心+3 支援）；三进化效果需专门局 |
| A24 | blocked | 只走 1 条构筑（solo-return + 4 卡）；三构筑各一局未打 |
| A25 | blocked | 仅观测“complete 终场 205 → C”；S/A/B 边界 299/300、449/450、599/600 未测 |
| A26 | blocked | 5 段：末段=finale、存档 `segments=5`；但 3 种灯光态未逐态核验 |
| A27 | blocked | 实局热度 1–3 可见；无卡 3 档/有卡 4 档的 HUD 表现未测（`heatCapFor` 单测通过） |

### 3.2 AC-F01–AC-F13

| ID | 状态 | 证据 / 说明 |
| --- | --- | --- |
| F01 | **pass** | `tests/progression.test.ts`：选核心后池 11 > 剩余 9、一局最多 10；实局 5 picks |
| F02 | **pass** | 战斗 HUD DOM 数字=0（脚本扫描）；结算/回顾文案允许数字 |
| F03 | **pass** | `tests/f3-bot.test.ts` 4/4；camp 7 ≤18、sweep 40 ≥36 |
| F04 | blocked | 90 秒人类门需实测；gate-90s 字段已可导出（§4.3） |
| F05 | blocked | 关声通关与错拍/完美体感需人测（单测 `ignite.test.ts` 通过） |
| F06 | blocked | 5 人复述四成员与 4 瞬间触发需人测 |
| F07 | blocked | 失败卡 + 1 秒回放未触发（空场不是失败卡） |
| **F08** | **fail** | **白光公式与验收原文不符**：验收要求 `0.85×(1−audience/768)`（±3%），实现改为 `0.85×(1−audience/max(1,peak))` 且 store 传峰值。开局 30/768 实测 HUD `whiteout=0`，按验收公式应为 **0.8168**（差值 0.8168 ≫ ±3%）。复现步骤见 §5-F1。截图 `07-playing-start.png`（无白光） |
| F09 | blocked | 满场（≥700 人）+180 噪音性能未测（本局峰值 280） |
| F10 | **pass** | `check-layers: 83 files, 0 violations`；`validate 14/14`；签名/42 模块由 t97 报告，本报告不重复计数 |
| F11 | blocked | 音频切片/合唱 A/B 需人听 |
| F12 | **pass** | 完整局 `duration=570.02s`（9:30±5s）；2:00/5:00/8:00 人浪 3 次、裂缝 3 |
| F13 | blocked | 命名查重属发行清单，未做 |

**统计**：A01–A27 = 13 pass / 14 blocked / 0 fail；F01–F13 = 5 pass / 7 blocked / 1 fail。合计 **18 pass / 21 blocked / 1 fail**。

### 3.3 AC-T01–AC-T20（补充，不属本任务矩阵但同一轮实跑）

| ID | 状态 | 证据 |
| --- | --- | --- |
| T01–T05 | pass | §1：typecheck 0、test 263、build 两次同哈希、validate 14/14、1017.5 KiB ≤2MB |
| T06 | blocked | 仅 Edge 156 验证；Chrome/Firefox 未独立测 |
| T07 | pass | 网络仅 1 条 file:// 文档请求 |
| T08 | pass | check-layers 0 违规 |
| T09 | blocked | rAF 内 setState 属静态审查（REV） |
| T10 | pass | 两次 build sha256 一致 |
| T11 | blocked | 关闭 WebGL2 提示未测 |
| T12 | pass | 损坏存档回退 + `.bad`（§2、`17-save-recovered.png`） |
| T13 | blocked | 同 seed 两局 9:30 `RunResult` 全等未做（单局已完成） |
| T14 | blocked | 120 帧单次：avg 7.52ms / 133fps / p95 8.1ms（RTX 4080，非目标集显 3 局） |
| T15 | blocked | 1080p 未单独测；draw calls 24、tris 23,924 |
| T16 | blocked | 3 局内存未测 |
| T17 | blocked（部分） | `renderer.stats()`：drawCalls 24（≤60）、triangles 23,924（≤120k）、overdrawEstimate 0；SpotLight 数/后处理未核 |
| T18 | blocked（部分） | 暂停时 `run.time` 冻结、恢复前进；音频 `AudioContext.state` 与拍点对齐未读 |
| T19 | blocked（部分） | “减少动态”立即生效且刷新保留；其余三项未逐项验 |
| T20 | blocked（部分） | Tab 焦点可移动；未做纯键盘完整流程 |

---

## 4. 命令行读数与补充证据

### 4.1 移动/移光/暂停（脚本读数）

- 移动：`player.x 0 → 3.1167`（约 1.15s，D 键按住），`light.position x 3.81 → 7.27`，`mode=spread`。
- 暂停：`phase=paused`；700ms 后 `run.time` 从 111.80 → 111.80（冻结）；Esc 恢复后 112.13 → 112.65（前进）。
- 性能采样（1280×673，DPR 1.5，RTX 4080）：120 帧 avg 7.52ms（≈133fps）、p95 8.10ms、max 8.80ms；`renderer.stats()` = drawCalls 24 / triangles 23,924 / programs 13 / textures 1 / overdrawEstimate 0 / dpr 1.5。

### 4.2 完整 9:30 局（`ending=complete`）

- `seed=1582833878`；`duration=570.0167s`；`grade=C`；`peakAudience=280`、`finalAudience=205`、`converted=642`、`burned=1287`、`covered=625`、`leftVenue=161`、`cracks=3`、`crowdWaves=3`、`returnLocks=8`、`encoreUsed=false`。
- 构筑：核心 `solo-return`，卡 `beat-ignite/breathe/tight-beam/shield`（`picks=5`），`evolution=null`。
- Boss：`phase=retired`、`phaseStartedAt=460`、`retired=true`、`strippedZone=null`。
- HUD：`holdProgress=1`、`segmentIndex=4`、`brokenLines=["drums"]`。
- 存档 `lastRun.segments=5`、`clears` 4、`emptyHouse` 2（记录口径见 §5-F2）。
- 截图：`19-results-complete.png`。

### 4.3 F3 / 座位 / 90 秒 telemetry（本次实跑）

- `npx vitest run tests/f3-bot.test.ts` → **4/4**：驻守 30→7（−76.7%，要求 ≤18）、扫场 30→40（+33.3%，要求 ≥36）、gate-90s、两条曲线同屏。
- `npx vitest run tests/seat-layout.test.ts` → **21/21**：768 席、走道 gap 0.7、x 中心 0、z 5.2–26.6、跨走道间距 1.32/1.6、front-left screenX<0、列 0 最左、四区中心反查、light/zoneAtPoint 跨走道、坐标公式仅在 `data/seats.ts`。
- gate-90s telemetry（字段存在且为数值）：
  ```json
  {"samples":179,"firstActiveLightMoveAt":0.5167,"lightMovesPerMinute":25.61,
   "dwellP50":3,"dwellP90":3.02,
   "zoneConversionRate":{"front-left":1,"front-right":1,"back-left":1,"back-right":0.375},
   "igniteOnBeatRate":0.596,"dwellRewardRatio":-4.342,"endedAt":89.5}
  ```
- `zoneConversionRate.back-right=0.375` 与 `dwellRewardRatio=-4.342` 均为原始输出；后者负值口径见 §5-F4。

---

## 5. 发现（可复现）

### F-01 [high] AC-F08 白光公式与验收原文不一致（P0 fail）

**复现**：

1. `npm run build`；用 Edge 打开 `dist/girls-band-live.html?dev=1`，点击开始 → 主菜单 → 开始演出。
2. 在 DevTools 控制台执行 `__gbl.store.getHud().whiteout`（开局约 1–2s，出席 30/768）→ **0**。
3. 对照：`computeWhiteout(30, 768)` → **0.816796875**（验收 F08 公式）；`__gbl.store.getHud().whiteout` 用的是峰值基准 `0.85×(1−audience/max(1,peak))`。
4. 截图 `07-playing-start.png` 中开局无白光；按验收原文应出现约 82% 白光。

**依据**：`docs/acceptance.md` AC-F08；实现 `src/game/audience.ts:828`（`peakAudience = capacity` 默认）、`src/game/store.ts:613`（传峰值）。t108 已在候选报告 §4.6 声明这是有意修复（避免前 90 秒洗白），但验收/技术方案未同步。

**影响**：P0 门禁按验收原文不能通过；若 M6 保留峰值基准，需制作人书面豁免并更新 `docs/acceptance.md` F08、`docs/tech-spec.md` §14.3、GDD §12 的白光口径；否则应回退为容量公式或把“峰值基准”写进验收。

### F-02 [medium] 结算记录 `clears` 双写且空场口径不一致

**复现**：

1. 让存档 `records.clears=2, emptyHouse=1`；打一局到空场完成（或构造 `ending=empty-house`）。
2. 结算后读 `localStorage['gbl.save.v1'].records`：`clears` **2→3**、`emptyHouse` **1→2**；主菜单“完成终曲”同步 +1。
3. 对照 `src/game/save.ts updateRecords()`：`empty-house` 只加 `emptyHouse`，不加 `clears`；`src/ui/bridge.ts:937` 对**所有非 interrupted** 结局 `clear +1`，随后 `deps.save.save(saveData,'run-end')` 又写一次（与 store 的 finishRun 写记录竞争）。
4. 本次实测：空场局后 `clears` +1；完整局后 `clears` +1（这条正确）。两处语义不一致，若 UI 写失败/被覆盖，重载后数值会变。

**影响**：AC-20 的“记录”可信度；不阻塞流程，建议 M6 修、M7 前收口。**要求**：只保留一个记录权威（store/finishRun）或把 bridge 条件改为 `result.ending === 'complete'`，并补一条回归测试。

### F-03 [low] `lastRun.date` 用 UTC 日期

- 实测存档 `lastRun.date="2026-10-27"`，本地时区为 2026-10-28（Asia/Shanghai）；`src/ui/bridge.ts` 的 `today()` 取 UTC。属展示/记录口径问题，不影响验收但建议改本地日期或注明 UTC。

### F-04 [low] `dwellRewardRatio` 为负值

- gate-90s 输出 `dwellRewardRatio=-4.342`；验收只要求 `<0.75`，数值上通过，但负值说明分母/符号口径需技术总监确认（t97 也已记录），建议在埋点文档中说明符号含义。

### 观察（非缺陷）

1. 正式 URL 无 `?dev=1` 时 `window.__gbl === undefined`，dev 入口没有泄漏到候选版。
2. 空场完成局（4:49、C、0 人）可正常结算并可再演一场；空场不是失败卡。
3. 开局 30/768 时白光为 0（峰值基准的预期行为），与 F-01 是同一改动。
4. 本验证修改了 `file://` 源下的本地存档（多局记录 + 一次损坏恢复测试）；损坏测试后已回写原始记录，但后续真实跑局使 `clears/emptyHouse` 增加——属本地测试数据，不是产品缺陷。

---

## 6. 未覆盖 / 需后续

- **人测**：AC-02/10/12/13/18/21/22/25、F-04/F-05/F-06/F-07/F-09/F-11/F-13（90 秒门、静音可读、失败卡、音频盲听、高对比、集显性能、评级边界、3 构筑/3 进化）。
- **实机性能**：1280×720 集显 3 局、1920×1080、满场 180 噪音、内存 3 局（AC-T14–T17、F09）。
- **浏览器**：Chrome/Firefox `file://` 与 WebGL2 关闭提示（AC-T06/T11）。
- **同 seed 全局长跑**：两局 9:30 `RunResult` 对照（AC-T13）——本次只做了单局。
- **失败卡/中断**：未触发（A12/F07）。
- **三进化/三构筑/评级边界**：未专门构造（A23/A24/A25）。
- **音频**：未做听感与 `AudioContext.state`/拍点对齐读数（A18/T18）。

---

## 7. 复现命令

```bash
npm run typecheck
npm test
npm run build        # 连续两次可验证 sha256 一致
npm run validate
node tools/check-layers.mjs
npx vitest run tests/f3-bot.test.ts tests/seat-layout.test.ts
# file:// 冒烟（Edge）：
# file:///D:/yan-github-code/Girls%20Band%20Live/dist/girls-band-live.html
```

证据截图：`docs/qa/shots/verification/`（17 张）。
