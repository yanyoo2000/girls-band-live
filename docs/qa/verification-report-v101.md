# v1.0.1 验证报告（t145 / qa-automation）

- **日期**：2026-10-28 15:33–16:05（Asia/Shanghai）
- **验证对象**：v1.0.1 候选单文件 `dist/girls-band-live.html`（本机重新构建）
- **版本**：`package.json` 1.0.1；产物 1,084,885 B（1,059.5 KiB）；sha256 `25422f523607dacf613cc660cdf629292fffb5888f4cd4f9a36583a907099e51`
- **环境**：Windows x64、Node v24.13.0、npm 11.6.2、Vitest 5.0.5、Microsoft Edge 156.0.0.0（Chromium）、viewport 1280×720（DPR 2；小窗口用 CDP 900×560 模拟）
- **结论**：四命令与 `file://` 全流程通过；v1.0.1 修复项 **16 pass / 0 partial / 3 blocked**（详见 §3）。**未发现 blocker/high**；blocked 均为“本环境无法验”的人耳/集显/跨浏览器项，不伪报为通过。

---

## 1. 四命令（本次独立实跑，2026-10-28 15:35，未复用 t144 结果）

| # | 命令 | 退出码 | 关键输出 |
| --- | --- | --- | --- |
| 1 | `npm run typecheck` | 0 | `tsc --noEmit`，无错误 |
| 2 | `npm test` | 0 | `Test Files 30 passed (30)` / `Tests 294 passed (294)` / `Duration 3.18s`；无 skip/todo/only |
| 3 | `npm run build`（连续两次） | 0 / 0 | 两次 `build-single: dist/girls-band-live.html 1059.5 KiB (sha256 25422f523607)`；根 `index.html` 同步 1,084,885 B |
| 4 | `npm run validate` | 0 | `validate: 14/14 rules passed（1059.5 KiB，sha256 25422f523607）` |

- 产物：`dist/girls-band-live.html` 与仓库根 `index.html` 字节一致；两次构建 sha 一致（可重复）。
- 修复项定向测试（本次实跑）：`tests/f3-bot.test.ts` 4/4、`tests/seat-layout.test.ts` 21/21、`tests/modifier-wiring.test.ts` 8/8、`tests/light.test.ts` 12/12、`tests/levelup.test.ts` 1/1、`tests/opening-grace.test.ts` 2/2 → 6 文件 / 48 用例全过。

---

## 2. `file://` 完整流程（Edge，Chromium）

> 打开：`file:///D:/yan-github-code/Girls%20Band%20Live/dist/girls-band-live.html`（?dev=1 仅用于长跑快进；正式 URL 无 `__gbl` 已单独验证）。

| 步骤 | 结果 | 证据 |
| --- | --- | --- |
| 启动 → 主菜单 | 通过；版本 1.0.1、四成员、记录；favicon 已内联（无 404） | `01-boot.png`、`02-menu.png` |
| 序曲 0–30s 三步教学 | 通过：step1「散光养人」、step2「束光烧人」实拍；step3「点击点燃」按 `runSeconds` 分段（<9/<19/≥19）存在，未单独留图 | `03-tutorial-1.png`、`20-prod-tutorial.png`、快照文本 |
| 演出 / 三形态 | 通过：散/束/回三格常驻；`lightMode` 随操作变化；回照时「独奏中/护盾」可见 | `18-solo-self.png`、`05-beam-audience.png` |
| 升级三选一 | 通过：首轮 3 核心（回照/合唱墙/引线），可点选；后续 10 次可读 | 快照 + `19` 结果 |
| 暂停 / Tab 构筑 | 通过：Esc 暂停且时间冻结；Tab 打开暂停面板并聚焦「当前构筑」 | `15-pause.png`、`16-build-tab.png` |
| 空场 → 安可/继续独奏 | 通过：人气归零先弹「人气告急」安可窗口；安可恢复后「人气上升」四区热度抬头；继续独奏 → 空场 → 跳过 → 结算 | `10-encore-window.png`、`12-empty-house.png` |
| 结算 | 通过：空场 C 与完整 9:30 B 两种；结算含「这一场为什么停在这里」三条归因 | `13-results-empty.png`、`19-results-complete-B.png` |
| 重开 | 通过：再演一场 → t≈0.5、picks=0、core=null、HUD 不串局 | 脚本读数 |
| 小窗口 | 通过：900×560 出现 ViewportGate（仍然继续/回主菜单）；继续后进入，Gate 关闭 | `17-viewport-gate.png` |
| 控制台 / 网络 | **console 0 条**；Network 仅 1 条 `file://` 文档请求，无外部请求 | `list_console_messages` / `list_network_requests` |
| 正式 URL（无 dev） | 通过：`window.__gbl === undefined`，教学/三形态正常 | `20-prod-tutorial.png` |

截图目录：`docs/qa/shots/verification-v101/`（14 张）。

---

## 3. v1.0.1 修复项验收

| # | 修复项 | 状态 | 证据 |
| --- | --- | --- | --- |
| 1 | 可见性：整体/舞台/观众席亮度 | **pass** | 1280×720 截图实测均值：全帧 **65.02**、观众席区 **54.88**、舞台区 **60.04**（验收线 32/32/35）；`04-spread-audience.png` |
| 2 | 束光 vs 散光像素差 | **pass** | 同姿势同位置对比：观众席区平均亮度差 **30.62/255**，**80.84%** 像素差 ≥6（验收 ≥6 或 ≥2%）；`04` vs `05` |
| 3 | 人气读数/预警（0 数字） | **pass** | HUD 快照含 `audienceTrend/-1|0|1`、`audienceLow`、`emptySeats`、`secondRowEmpty`、`zoneOccupancy/zoneLightRatios`；实拍「人气下降」「人气快见底了」→「人气告急」；战斗 HUD DOM 数字扫描 **0**；sr-only 播报同源 |
| 4 | 卡效果接线（第二排/合唱墙/护盾/引线） | **pass（单测）** | `tests/modifier-wiring.test.ts` 8/8：第二排 +5/30s、合唱墙 1:4 唱化、引线招灾 ×2、回照盾初始化；本局实际拿到 `second-row`、`shield`，峰值 30→356；未做单卡隔离数值实机对照 |
| 5 | 返听可解 / 超时 | **pass（单测）** | 单测「光心累计位移 ≥8m 或 7s 兜底可解除」通过；实局 `returnLocks=5`、HUD 有倒计时字段；本次未在浏览器内做“锁定→移光解除”单独录像 |
| 6 | 安可窗口 | **pass** | 人气归零先 `paused + 安可/继续独奏`（不再直接空场）；安可点击后趋势转「人气上升」、四区热度全部抬头、`encoreAvailable=false`；`10-encore-window.png` |
| 7 | 光形态 / 护盾 | **pass** | HUD 三格常驻；`lightMode=spread/beam/self` 实测；回照时 `soloShield=1`、文案「独奏中/护盾」；`18-solo-self.png` |
| 8 | 键盘等价 | **pass（短链）** | IJKL 移光（实测坐标变化）、Shift 束光（`lightMode=beam`）、Enter 点燃（`igniteCooldown=1`）、Tab 聚焦构筑；键盘可完成开始→暂停→结算→重开；**纯键盘 9:30 未跑（defer，见 §5）** |
| 9 | 失焦自动暂停 | **pass（模拟焦点丢失）** | `document.hasFocus=false + window.blur` → `phase=paused`、暂停面板出现；真实 OS 切窗在 headless 中不可复现（见 §5） |
| 10 | 最小窗口 | **pass** | 900×560 出现 ViewportGate（仍然继续/回主菜单/说明）；点继续后 Gate 关闭；`17-viewport-gate.png` |
| 11 | 统计同源（HUD/结算） | **pass** | 结算 `RunResult` 与 HUD 末值一致：`emptySeats 412`、`secondRowEmpty 23` 完全相等；单测「HUD 构建后 run.stats 回写，与结算同源」通过；结算页数字=结果 JSON（356/356/503/1227/480/101/412/23/3/9:30） |
| 12 | peak>30 + 至少一次核心 | **pass** | 完整 9:30 局：`ending=complete`、grade **B**、`peakAudience=356`、`finalAudience=356`、`picks=10`、核心 `solo-return`、人浪 3/裂缝 3、时长 570.02s |
| 13 | f3-bot / seat-layout 不回退 | **pass** | f3-bot 4/4：camp 30→7（≤18）、sweep 30→40（≥36）；seat-layout 21/21（768 席/0.7 gap/中心 0/镜像/跨走道） |
| 14 | 局内 0 数字 | **pass** | 1280×720 战斗 HUD DOM 扫描数字 = 0；结算页允许数字 |
| 15 | 白光（峰值基准 F08） | **pass（单测+起点/终点）** | 开局 30/768 peak=30 → `whiteout=0`；终场 peak=356/356 → 0；掉半 0.425 由 `tests/hud.test.ts` 断言；与 acceptance §8 峰值口径一致 |
| 16 | 空场流程 / 重开 | **pass** | 空场→「只剩你还在弹」→跳过→结算→再演一场（t=0.5/picks0/core null） |
| 17 | 音效/音乐听感 | **blocked** | AI 无听觉；本报告只做参数/结构测试（`audio-choir` 等 294 全过），不做听感验收 |
| 18 | 性能（集显/1080p/3 局） | **blocked** | 本次为单机单局，未采集目标硬件 3 局帧率/draw call 表；亮度截图来自 RTX 4080 环境 |
| 19 | Chrome/Firefox | **blocked** | 仅 Edge 156（Chromium）实测；未跨浏览器 |

**统计**：16 pass（其中 4 项标注单测/模拟/短链）、0 partial、3 blocked（听感/性能跨硬件/跨浏览器）。无 fail。

### 关键读数

- 完整 9:30 局：seed 2910478291；peak 356 / final 356 / converted 503 / burned 1227 / covered 480 / left 101 / empty 412 / secondRow 23 / cracks 3 / crowdWaves 3 / returnLocks 5 / duration 570.02s；核心 solo-return，10 picks，卡含 `second-row`、`shield`、`tight-beam`、`breathe` 等。
- 白场：开局 `whiteout=0`；终局 `whiteout=0`；HUD 面板「人气快见底了 / 还有一次安可」出现在 1:19。
- 小窗口：900×560 `viewportGate=true`；继续后清除。
- 失焦：模拟 `hasFocus=false + blur` → paused + 暂停面板。

---

## 4. 发现

**无 blocker / high。** 以下为观察与口径说明：

1. **QA 快进副作用（非产品 bug）**：用 `?dev=1` 直接 `store.dispatch({type:'choose-card'})` 绕过 UI 时，bridge 的升级弹层可能停在旧状态（`route.overlay='levelup'` 而 `run.phase=empty-house`）。正式 UI 点击选卡不会出现；点一次旧卡即可恢复并继续空场流程。本报告的长跑使用 `bridge.dispatch` 选卡，避免该副作用。
2. **失焦暂停是模拟验证**：headless 浏览器多页之间切页不触发 `document.hasFocus=false`，因此用“覆写 hasFocus + 派发 blur”验证代码路径；真实 OS 失焦在 t135 已有人测，本次不冒充实机。
3. **纯键盘 9:30 未跑**：t143/t144 已明确 defer；本次只验证键盘短链（IJKL/Shift/Enter/Tab/Esc）与结算/重开。
4. **亮度测量不是 t142 固定 seed 对照**：本次为运行中截图（含有光池/直方差异），但三项均值与束光像素差均大幅超过验收线；如需与 t142 数字逐位对齐，应在固定 seed/固定机位复测。
5. **ViewportGate 用 CDP viewport 模拟**：真实窗口 resize 在本次 MCP 会话中对已存在页不生效，故用 Emulation 900×560 验证 Gate 逻辑（与 t144 的实机 900×560 结果一致）。
6. **最小窗口 Esc 未单独按键**：本次点「仍然继续」验证出口；Esc 出口由 t143 报告与源码（Gate 内 Esc=继续）保证，未在本轮单独按键。

---

## 5. 未覆盖 / 需后续

- **人耳音频**（合唱四档、静默 16s、空场 0.22 心跳、升级 duck）：参数/结构已测，听感需人测（t141 计划已标 defer）。
- **性能**：1280×720 集显 3 局、1920×1080、连续 3 局内存；本次环境为高端 GPU，未采集。
- **浏览器**：Chrome/Firefox `file://` 与 WebGL2 关闭提示。
- **纯键盘 9:30 完整局**（t146）：未跑，不以短链冒充。
- **真实 OS 失焦/最小化**：仅模拟。
- **评级 S/A 可达性**：本局 B（peak 356）已证明 B 可达；S/A 阈值仍属 P2 defer，未验证。
- **第二排 +5/30s、合唱墙四区≥40、引线指定区** 的实机隔离数值：只有单测与整局观测，未做单卡对照实验。

---

## 6. 复现命令

```bash
npm run typecheck
npm test
npm run build   # 连续两次，sha 应一致
npm run validate
npx vitest run tests/f3-bot.test.ts tests/seat-layout.test.ts tests/modifier-wiring.test.ts tests/light.test.ts tests/levelup.test.ts tests/opening-grace.test.ts
# file://
# file:///D:/yan-github-code/Girls%20Band%20Live/dist/girls-band-live.html
# ?dev=1 仅供长跑快进：长跑用 bridge.dispatch 选卡可避免 §4-1 的 QA 副作用
```

证据：`docs/qa/shots/verification-v101/`（14 张）。
