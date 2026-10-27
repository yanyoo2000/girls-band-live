# M5 v2 单元测试报告（t96 / qa-automation）

- **版本**：M5 v2（2026-10-28）
- **作者**：qa-automation
- **范围**：`tests/**`（Vitest 纯逻辑测试）+ `docs/qa/unit-report.md`、`docs/qa/verification-report.md`
- **依据**：`docs/acceptance.md`（68 项）、`docs/tech-spec.md` §11（19 个必测模块）、`docs/gdd.md` §4 锁定数量
- **命令契约**：`npm run typecheck` / `npm test` / `npm run build` / `npm run validate`

---

## 0. 一句话结论

19 组必测模块全部有可执行的 Vitest 文件；`npm test` 在仓库根可直接运行（`vite.config.ts` 的 `test.root` 已指向仓库根）。
本报告的通过/失败数见 §1；`npm test` 最终以本文档 §1 的实跑输出为准，不以历史运行结果代替。

**边界声明**：

- 本任务只写 `tests/**` 与 `docs/qa/**`，未改 `src/**`。
- `tests/f3-bot.test.ts`（F3 驻守/扫场 bot）由 dev-engine 的 t105 交付，t96 **不重复创建**，只在最终复跑里引用其结果。
- `tests/seat-layout.test.ts` 由 tech-director 的 t103 交付，t96 **不重复创建**，只引用其结果。
- `tests/ui-smoke.test.tsx` 由 dev-ui 交付；t96 不接管。

---

## 1. 命令与结果（最终复跑，2026-10-28 03:35）

| 命令 | 状态 | 证据 |
| --- | --- | --- |
| `npm run typecheck`（`tsc --noEmit`） | **通过**（exit 0，无错误输出） | 2026-10-28 03:34 实跑 |
| `npm test`（`vitest run`） | **通过**：23 个测试文件 / 259 个用例 / 0 失败 / 1.58s | 末尾输出 `Test Files 23 passed (23)`、`Tests 259 passed (259)` |
| `npm run build` | **通过**（连续两次，exit 0） | 两次产物 sha256 完全一致：`1c17dbae37cdd552f8c4c133e0576b319a00f5322d98bfe516092ffccdf186fe`；`dist/girls-band-live.html` = 根 `index.html`，1,042,695 B |
| `npm run validate` | **通过**：`validate: 14/14 rules passed（1018.3 KiB，sha256 1c17dbae37cd）` | 2026-10-28 03:35 实跑（只读） |

> 说明：`build` 已由 t96 做构建校验（t106 集成已 completed，无并发写）；两次构建哈希一致即 AC-T10 的机器证据。
> `npm test` 的 23 个文件中：t96 自有 18 个 §11 模块（202 用例）+ 数据完整性 `data.test.ts`（18）+ 伤害结算 `combat.test.ts`（11）+ t103 的 `seat-layout.test.ts`（21）+ dev-ui 的 `ui-smoke.test.tsx`（3）+ t105 的 `f3-bot.test.ts`（4）。
> **无 `skip` / `todo` / `only`**：对 `tests/**` 全量 grep 0 命中。

### 1.1 数据完整性（GDD §4 锁定数量）

`tests/data.test.ts` 直接断言 24 卡 / 3 核心 / 15 支援 / 6 通用 / 3 构筑 / 3 进化 / 4 角色 / 4 瞬间 / 768 席 / 4 区 × 192 /
5 噪音 / Boss 三阶段 390·405·435·460 / 5 段 / 128BPM·4/4·304 小节 / 12 SFX / 16 行文案 / 17 配色 token，
并调用 `validateData()` 断言 0 问题。数据表被改动会第一时间失败，而不是等到 M6 人测。

---

## 2. 19 组必测模块覆盖（tech-spec §11）

| # | 文件 | 必测内容 | 用例 | 结果 | 主要 AC |
| --- | --- | --- | --- | --- | --- |
| 1 | `tests/rng.test.ts` | 同 seed 序列一致；fork 互不串扰；shuffle 保持元素集合 | 16 | 通过 | AC-T13、AC-F01 |
| 2 | `tests/clock.test.ts` | 128BPM/4/4/304 小节；tick↔秒映射；乐句边界 | 13 | 通过 | AC-26、AC-F12 |
| 3 | `tests/collision.test.ts` | 网格查询与暴力解一致（200 随机圆）；边界接触 | 13 | 通过 | AC-T17 逻辑侧 |
| 4 | `tests/pool.test.ts` | 复用、容量上限返回错误、reset 调用 | 7 | 通过 | AC-F10 逻辑侧 |
| 5 | `tests/light.test.ts` | 惯性/半径/三形态代价；回照人气 −1/4 拍；扫场奖励 | 12 | 通过 | AC-03、AC-F03 |
| 6 | `tests/ignite.test.ts` | 完美/良好/错拍倍率；和弦内/外 ±25%；错拍 ≤40% | 9 | 通过 | AC-04、AC-F05 |
| 7 | `tests/audience.test.ts` | 0.4/1.5s 两段；中断保留 50%；12s 掉级；覆盖 −1 与离场 | 11 | 通过 | AC-05、AC-27 |
| 8 | `tests/crowd-wave.test.ts` | 三次时间点；阈值不足→小浪；1:4 转化；裂缝 +1 | 7 | 通过 | AC-06 |
| 9 | `tests/f3-bot.test.ts`（**t105 / dev-engine 交付**） | 驻守 ≤18 / 扫场 ≥36；3 分钟落后；`dwellRewardRatio` | 4 | **通过**（camp end 7、sweep end 40） | AC-08、AC-F03、AC-H02 |
| 10 | `tests/progression.test.ts` | 24/10/3 互斥；offer 不含已移除卡；进化条件；`picks ≤ 10` | 14 | 通过 | AC-09、AC-24、AC-F01 |
| 11 | `tests/boss.test.ts` | 6:30/6:45/7:15/7:40 相位；静默 8 小节；退场带走区阈值 | 11 | 通过 | AC-07、AC-14 |
| 12 | `tests/save.test.ts` | 损坏回退；缺字段补默认；clamp；写失败静默（纯函数侧） | 15 | 通过 | AC-T12、AC-20 |
| 13 | `tests/hud.test.ts` | 白光公式 `0.85×(1−a/768)`；四区 waiting；0 数字（字段无 number 展示项） | 10 | 通过 | AC-11、AC-F08 |
| 14 | `tests/determinism.test.ts` | 同 seed 状态逐位一致；扫描 `src/game/**` 无 Math.random/Date.now；无 react/three | 5 | 通过 | AC-T13、AC-T08、AC-F10 |
| 15 | `tests/entities.test.ts` | 池化复用、id 稳定、dying 回收、容量上限不越界 | 10 | 通过 | AC-07 逻辑侧 |
| 16 | `tests/waves.test.ts` | 段落生成率、裂缝 +15%、同屏上限截断、背后生成 30% | 14 | 通过 | AC-07、AC-08 |
| 17 | `tests/upgrades.test.ts` | 单卡应用一次、核心互斥、`heatCapFor` 3/4、modifier 加法与取 max | 14 | 通过 | AC-09、AC-27、AC-F01 |
| 18 | `tests/music.test.ts` | 5 层段落掩码、段落切换目标增益、每第 4 小节七和弦 | 10 | 通过 | AC-18、AC-26 |
| 19 | `tests/copy.test.ts` | 三条失败原因模板、空场文案、评级标签、结算后台短句 4 条 | 11 | 通过 | AC-12、AC-16、AC-25 |

**t96 自有 18 个文件 + 引用 1 个（f3-bot）= 19 组；另有补充 `tests/data.test.ts`（18 用例，数据完整性）与 `tests/combat.test.ts`（11 用例，伤害结算）。**
辅助文件：`tests/helpers/store.ts`（无 DOM 的 GameStore 装配；不含测试用例）。

---

## 3. 68 项验收矩阵映射（自动化部分）

状态口径：

- **已自动化**：有 Vitest 用例实跑通过，可作为门禁证据；
- **部分自动化**：自动化覆盖了可机器判定的部分，其余必须人测/实机；
- **需人测**：本质是人测协议（playtest / compat / perf / audio 听感）；
- **M6 候选版**：依赖 `dist/` 单文件或两次构建、浏览器实机，M5 不阻塞。

### 3.1 工程与交付门（20 项）

| ID | 自动化证据 | 状态 |
| --- | --- | --- |
| AC-T01 | `npm run typecheck` 实跑 | 已自动化（见 §1） |
| AC-T02 | `npm test`：19 组模块 + 数据完整性；无 skip/todo（全仓 grep 0 命中） | 已自动化（见 §1） |
| AC-T03 | **`npm run build` 连续两次 exit 0**；`dist/girls-band-live.html` 与根 `index.html` 字节一致（各 1,042,695 B） | 已自动化 |
| AC-T04 | `npm run validate` → `14/14 rules passed` | 已自动化（实跑） |
| AC-T05 | 产物 1,042,695 B = 1018.3 KiB ≤ 4 MiB | 已核对 |
| AC-T06 | 三浏览器 `file://` | 需人测（COMPAT） |
| AC-T07 | 0 网络请求 | 需人测（COMPAT）；validate 已扫产物无外链 |
| AC-T08 | `determinism.test.ts` 扫 game 无 react/three；validate 内建分层 R12/R13 | 部分自动化 |
| AC-T09 | rAF 内无 setState（静态审查） | 代码审查（REV） |
| AC-T10 | 连续两次 `npm run build` 的 `dist/girls-band-live.html` sha256 完全一致（`1c17dbae37cd…`） | 已自动化 |
| AC-T11 | WebGL2 提示页 | 需人测（platform/webgl-support.ts 已就位） |
| AC-T12 | `save.test.ts` 坏 JSON/版本/字段回退；`.bad` 备份属 `platform` | 部分自动化 |
| AC-T13 | `determinism.test.ts` 同 seed 600 tick 状态逐位一致（未跑满 9:30，见 §4） | 部分自动化 |
| AC-T14 | 帧率采样 | 需人测 |
| AC-T15 | 1080p 帧率/draw call | 需人测 |
| AC-T16 | 3 局内存 | 需人测 |
| AC-T17 | 预算常量/overdraw | 需人测（实机 `renderer.info`） |
| AC-T18 | 失焦/暂停/拍点对齐 | 需人测 |
| AC-T19 | `save.test.ts` `mergeSettings`（缺省/非法/clamp/changed）；UI 生效需人测 | 部分自动化 |
| AC-T20 | `ui-smoke.test.tsx` 启动/导航；完整键盘流程需人测 | 部分自动化 |

### 3.2 P0 功能（22 项 + GDD §4 补充 5 项）

| ID | 自动化证据 | 状态 |
| --- | --- | --- |
| AC-01 | 主菜单→演出→结算→重开 | 需人测 |
| AC-02 | `data.test.ts` 4 角色/1 可操作/4 瞬间；可辨识度人测 | 部分自动化 |
| AC-03 | `light.test.ts` 三形态半径/回照 −1 人气/每 4 拍一次 | 部分自动化 |
| AC-04 | `ignite.test.ts` 完美 1.6/良好 1.2/错拍 0.4、和弦 ±25%、错拍最差 0.3 | 部分自动化（关声可判断需人测） |
| AC-05 | `audience.test.ts` 0.4+1.5s、中断保留 50%、12s 掉级、覆盖 −1/黑化/离场 | 部分自动化 |
| AC-06 | `crowd-wave.test.ts` 2:00/5:00/8:00、小浪、1:4、裂缝 +1 | 部分自动化（画面人测） |
| AC-07 | `boss.test.ts` 四节点/静默/退场；`waves.test.ts` 刷怪；返听解除需实机 | 部分自动化 |
| AC-08 | `f3-bot.test.ts`（t105）固定种子 bot | 已自动化（见 §1） |
| AC-09 | `progression.test.ts` 24/10/3、互斥、不重抽 | 部分自动化（结算差异人测） |
| AC-10 | 静音可读性 | 需人测 |
| AC-11 | `hud.test.ts` 快照无人数/击杀/伤害字段，比例 0..1；人测读白光 | 部分自动化 |
| AC-12 | 失败卡三条原因/可读 | 需人测 |
| AC-13 | 90 秒门埋点 | 需人测 |
| AC-14 | `boss.test.ts` 8 小节 = 15s、6:45 清静默 | 部分自动化（音频总线需实机） |
| AC-15 | 放下光/空场 | 需人测 |
| AC-16 | 结算字段与 `RunResult` | 需人测 |
| AC-17 | `ui-smoke.test.tsx` 主菜单/曲目单/排练室/设置/制作名单 | 部分自动化 |
| AC-18 | `music.test.ts` 5 层掩码/段落切换/七和弦；听感 A/B 人测 | 部分自动化 |
| AC-19 | 高/低画质 | 需人测 |
| AC-20 | `save.test.ts` 读/合并/序列化；写盘 `.bad` 属 platform | 部分自动化 |
| AC-21 | 无障碍属性/形状编码 | 需人测（部分在 ui-smoke 渲染） |
| AC-22 | 3 局性能 | 需人测 |
| AC-23 | `upgrades.test.ts` 3 进化解析；效果触发人测 | 部分自动化 |
| AC-24 | `progression.test.ts` 3 构筑/卡池 11>9；结算差异人测 | 部分自动化 |
| AC-25 | 评级阈值边界 | 需人测 |
| AC-26 | `data.test.ts` 5 段/304 小节/1 曲；`clock.test.ts` 时长映射 | 部分自动化（灯光态人测） |
| AC-27 | `upgrades.test.ts` `heatCapFor` 3/4、`heat-cap` 取 max | 部分自动化（HUD 表现人测） |

### 3.3 M3 修复（13 项）

| ID | 自动化证据 | 状态 |
| --- | --- | --- |
| AC-F01 | `progression.test.ts` 一局最多 10 张、选核心后池 11、不可拿完 | 已自动化 |
| AC-F02 | 战斗 HUD DOM 扫描 | 需人测（QA-PLAY） |
| AC-F03 | `f3-bot.test.ts`（t105） | 已自动化（见 §1） |
| AC-F04 | 90 秒门埋点 | 需人测 |
| AC-F05 | `ignite.test.ts` 错拍/完美/和弦 ±25% | 部分自动化（关声人测） |
| AC-F06 | 角色复述/瞬间 | 需人测 |
| AC-F07 | 失败卡 + 回放 | 需人测 |
| AC-F08 | `hud.test.ts` `0.85×(1−a/768)`：0/0.425/0.85、单调、clamp | 已自动化 |
| AC-F09 | 满场性能 | 需人测 |
| AC-F10 | `determinism.test.ts` 分层扫描 + validate R12/R13 | 部分自动化 |
| AC-F11 | 音频切片/合唱 A/B | 需人测（AUD） |
| AC-F12 | 9:30 计时 | 需人测 |
| AC-F13 | 命名查重 | 需人测（release） |

### 3.4 人测协议（8 项）

AC-H01–AC-H08 全部为**人测**（10 人盲听、5 人复述、关声通关等），不在 qa-automation 的自动化范围；
执行者：qa-playtester / qa-compat / 制作人指定样本；本报告只提供可复跑的埋点/单测前置。

---

## 4. 未覆盖与风险（必须如实记录）

1. **`RunResult` 全等的 9:30 全局长跑未做**：`determinism.test.ts` 用 600 tick（10s）逐位比对观众/噪音/光/HUD，并扫源码禁 `Math.random`/`Date.now`；全局长跑（34,200 tick × 2）会超出 5s 测试预算，留给 M6 的 `AC-T13` 实机两局对照。
2. **WebAudio 听感不可自动化**：`music.test.ts` 只测段落掩码/增益目标/和弦；5 层听辨、12 声部“变厚不变响”、静音可玩必须人测（AC-18/F11/H06）。
3. **Three.js / GPU 不在 node 测试**：draw call、overdraw、768 实例、光照均需实机（AC-T14–T17、F09）。
4. **平台层（`src/platform/**`）的 `.bad` 备份与写失败静默**未单测：属 M6 集成范围；`save.test.ts` 覆盖纯函数侧回退与 clamp，`AC-T12` 仍须实机破坏存档验证。
5. **`tests/f3-bot.test.ts` 的归属**：t105 交付；若它最终仍红，t96 只记录、不改其断言（避免“为通过而弱化断言”）。t97 不应把 f3-bot 的红算到 t96 的 19 组模块头上，但必须在门禁里显示“F3 未通过”。
6. **`tests/seat-layout.test.ts` 归属 t103**：t96 不重复创建座位测试；若后续座位真源再改，以 t103 的 21 项为准。

---

## 5. 复跑方式

```bash
npm run typecheck     # tsc --noEmit，含 tests/**、tools/**、vite.config.ts
npm test              # vitest run，include = tests/**/*.test.ts(x)，root = 仓库根
npm run validate      # 只读单文件校验（14 规则）
npm run build         # M6 候选版：tsc → vite build → tools/build-single.mjs（写 dist/ 与根 index.html）
```

- 单个文件：`npx vitest run tests/<name>.test.ts`
- 失败定位：Vitest 会打印用例名与断言差异；不要用 `skip`/`todo` 掩盖失败。
