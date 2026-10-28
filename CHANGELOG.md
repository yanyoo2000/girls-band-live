# 更新日志 / Changelog

《谁在听》/ WHO'S LISTENING 的版本变更记录。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

> **当前状态：`v1.0.0` 草稿（2026-10-28），尚未冻结。**
> M6 收尾修复（t115 窗口缩放 / HUD 对比度、t117 开局 / 相机 / 白光 / 钩子 / 结算）尚未全部合入；本文件中的"已修复"只列已合入并有证据的条目，未合入项在 §M6 收尾中标注状态。发布前必须以最终构建重跑四命令并回填本文件。
>
> 发布物：`dist/girls-band-live.html`（单文件、离线、`file://` 可玩）。发布流程与冻结条件见 [docs/release-checklist.md](docs/release-checklist.md) 与 [docs/reports/m7-release-draft.md](docs/reports/m7-release-draft.md)。

---

## [1.0.0] — 2026-10-28（草稿）

首个公开版本：少女乐队 × 吸血鬼幸存者，9 分 30 秒一局，离线单文件。

### Added

**游戏内容（由 M4 GDD 锁定，M5 实现）**

- 4 名乐队成员：主唱 **江栖**（玩家）、主音吉他 **许燎**、贝斯 **闻笙**、鼓 **邵砚**；4 个不依赖立绘/配音的角色瞬间。
- 3 种光形态：散光（4.2m）、束光（1.6m）、回照（自保护盾，每 4 拍人气 −1）；点燃脉冲含完美 / 良好 / 错拍三档与和弦内/外 ±25%。
- 4 个座区 / 4 个声部；**768 席**（24 排 × 32 座，含 0.7m 走道 gap）；12 声部合唱池（4 区 × 3 层）。
- 3 种常规噪音（底噪 / 啸叫 / 失真）+ 精英「返听」+ 三阶段 Boss「静默」；180 同屏噪音上限（低画质 90）。
- **24 张卡池 / 单局最多 10 次三选一 / 3 条互斥构筑（合唱流、独奏流、招灾流）/ 3 个进化**；热度 0–4（4 仅 `heat-cap` 解锁）。
- 5 段结构（序曲 / 主歌 / 副歌 / 桥段 / 终曲）、3 种灯光态、1 首固定曲（128 BPM、4/4、304 小节，9:30）；2:00 / 5:00 / 8:00 三次人浪，6:30 静默段，8:50 终曲「放下光」。
- 3 种结局形状（完成 / 空场完成 / 中断失败）与 S/A/B/C 四档评级；结算含空位、真实 RunResult 数据与三条后台文案。
- **8 个屏幕 + 6 类覆盖层**：启动、主菜单、今晚的曲目单、排练室、设置、制作名单、演出 HUD、结算；覆盖层含升级三选一、暂停、设置、离开确认、安可/独奏中断选择、失败卡。
- 局内 HUD **0 数字**；白光随人气相对峰值变化；四区热度点、段位点、构筑条、节拍环。
- 设置：三路音量、高/低画质、减少动态、高对比、节拍脉冲、低闪；`gbl.save.v1` 存档（设置 / 最佳记录 / 解锁），损坏自动回退并备份 `.bad`。
- 无障碍：键盘全流程、焦点环、`prefers-reduced-motion` / `prefers-contrast` / `forced-colors`、失焦降音与冻结。

**过程与交付（M1–M7）**

- M1：10 位策划的 10 份自由企划（[报告](docs/reports/m1-pitches.md)）。
- M2：10 份交叉互评 + 创意总监融合 3 案（A《暖场》/ B《松手》/ C《谁在听》）（[报告](docs/reports/m2-discussion.md)）。
- M3：3 位评审 + 7 位独立打分员，中位数计票选出 C《谁在听》（加权 7.75 → 7.8）（[报告](docs/reports/m3-selection.md)、[定案](docs/decision/selected-concept.md)）。
- M4：完整 GDD（21 项锁定内容）、技术方案（42 个模块签名、三层边界）、68 项验收矩阵、美术方向（[GDD](docs/gdd.md)、[技术方案](docs/tech-spec.md)、[验收](docs/acceptance.md)、[美术](docs/art-direction.md)）。
- M5：7 位工程师的 8 个实现任务（引擎、渲染、战斗、成长、内容、UI、音频、模型），82 个 TS/TSX 文件 / 27,010 行；19 组必测模块与 24 个测试文件（[门禁](docs/reports/m5-dev.md)、[单测](docs/qa/unit-report.md)）。
- M6：单文件候选版、四命令、`file://` 全流程、实机试玩、桌面兼容 / 无障碍、独立修复（[验证](docs/qa/verification-report.md)、[试玩](docs/qa/playtest-report.md)、[兼容](docs/qa/compat-report.md)、[修复](docs/reports/repair-report.md)）。
- M7：README / CHANGELOG / 发布检查表 / 发布草稿（本文件与 [release-checklist](docs/release-checklist.md)、[m7-release-draft](docs/reports/m7-release-draft.md)）。

**工程**

- Vite `root=src` + 零依赖 `tools/build-single.mjs`：把 JS/CSS 全部内联为单文件，`dist/girls-band-live.html` 与根 `index.html` 字节一致。
- `npm run validate` 14 条规则（R1–R14）：产物一致性、≤4 MiB、无外部 URL / 字体 / 运行时联网、单一内联 module、无 sourcemap / crossorigin、分层与确定性、构建可重复。
- 分层强制：`game` 无 react/three/DOM、`three` 无 react、`ui` 无 three、`types` 无实现 import；`game/**` 无 `Math.random` / `Date.now`。
- 性能预算：draw calls ≤60（目标 45）、三角面 ≤120k、后处理 0、真 SpotLight ≤2、DPR 上限 1.5 / 低画质 1.0。
- WebGL2 缺失提示页、WebGL 上下文丢失/恢复提示、断网可启动、单文件 0 外部网络请求。
- 24 个测试文件 / 264 个 Vitest 用例（t113 基线）：RNG、时钟、碰撞、对象池、光、点燃、观众、人浪、F3 bot、成长、Boss、存档、HUD、确定性、实体、波次、升级、音乐、文案、座位布局、UI 冒烟。
- 60 秒程序化音频垂直切片原型（[报告](docs/reports/audio-slice.md)、[原型](prototypes/audio-slice.html)）。

### Changed

- **白光口径改为峰值基准**：`computeWhiteout` 使用 `0.85 × (1 − audience / max(1, peakAudience))`；开局 30/768 → 0、掉到峰值一半 → 0.425、空场 → 0.85。旧固定公式 `0.85 × (1 − audience / 768)` 作废；`docs/acceptance.md` AC-F08、`docs/tech-spec.md` §14.3、`docs/gdd.md` §12.2 已同步。
- **结算记录唯一权威**：删除 `ui/bridge.ts` 的 records 双写，记录只由 `game/save.ts` 的 `updateRecords` 写入；`complete` +1 `clears`、`empty-house` 只 +1 `emptyHouse`、`interrupted` 不加。
- **音频时钟统一**：新增 `data/music-clock.ts` 的 `createRunMusicClock`，engine / fallback / store 共用「本局演唱秒数 + 段落表」语义。
- **HUD 发布路径**：`ui/bridge.ts` 订阅 store 的 HUD 发布（≤10Hz），删除 `main.tsx` 的 100ms 定时器；React 不在 rAF 内 setState。
- **画布层级固化**：`#game-canvas` 的 `z-index` / `pointer-events:none` / 尺寸规则移入 `styles/base.css`，不再由 `main.tsx` 注入。
- **`lastRun.date` 改为本地时区**（`localDateStamp()`），不再写 UTC 日期或空串。
- 座位世界坐标收敛到 `data/seats.ts` 唯一真源（含走道 gap 与原点），删除 576 席 0.7m 错位的重复实现。
- `game/loop` 不再 type-only import `three/renderer`；`FrameRenderer` / `RenderStats` / `RendererInfo` 迁入 `src/types/game.ts`。
- 构建元信息保留 `girls-band-live v<version> build:inline`，`legalComments: 'eof'` 保留 MIT 声明。
- M4/M5 文档同步：GDD 反驻守规则（停住信号、压力态流失、区热度定义）、和弦表、失败卡时长、`ChordDef` 命名、`@types/node` 口径。

### Fixed

以下条目均已合入当前源码，并有报告/单测证据。

- **F3 反驻守（t105）**：驻守 45s 人气 30 → 7（−76.7%，要求 ≤18）、扫场 30 → 40（+33.3%，要求 ≥36）；`tests/f3-bot.test.ts` 4/4 可独立复跑；`gate-90s` 埋点可导出。
- **白光开局洗白（t108 / t113）**：峰值基准后开局 30 人白光 = 0，不再在前 90 秒把画面洗白；`tests/hud.test.ts` 11/11。
- **空场结算 records 双写（t113）**：`clears` 每局只 +1；`empty-house` 只记 `emptyHouse`；`tests/save.test.ts` 16/16 覆盖「空场 + 完整」交替链路；`file://` 实测连续三局 `clears` 1 → 2 → 3。
- **`lastRun.date` UTC 日期（t113）**：本地日期写入，实测 2026-10-28。
- **`dwellRewardRatio` 负值口径（t113）**：文档注明"负值 = 停住期人气净下降，是预期证据，不是阈值失败"。
- **座位 0.7m 错位（t103）**：`data/seats.ts` 唯一真源，`tests/seat-layout.test.ts` 21/21；四区归属与走道 gap 一致。
- **音频时钟语义漂移（t108）**：engine 与 fallback 在 8 个时间点逐项相同；段落切换按 `data.segments` 推导。
- **HUD 定时器 / 画布注入层级（t108）**：删除 `setInterval`、`injectLayoutStyle`；canvas 层级固化 CSS。
- **构建重复性**：连续两次构建 SHA-256 一致；根 `index.html` 与 `dist/girls-band-live.html` 字节一致。
- **损坏存档**：坏 JSON / 缺字段回退默认，备份 `gbl.save.v1.bad`，不阻塞启动。
- **WebGL2 缺失 / 上下文丢失**：显示中文提示与恢复提示，恢复后继续绘制。

### M6 收尾（合入后随 v1.0.0 发布，当前状态：t115 进行中 / t117 待开始）

> 这些条目来自 t110 实机试玩与 t111 兼容报告的 high 发现，**在最终构建前不得视为已修复**。状态以 [docs/reports/m7-release-draft.md](docs/reports/m7-release-draft.md) 为准。

- **t115（进行中）**：窗口缩放 canvas 自锁（COMPAT-1；根因：`resize()` 读 `canvas.clientWidth` + `setSize(..., true)` 写死内联 px）与白光下 HUD 对比度（COMPAT-2；白光 0.312 时区名 3.32:1 / 三角 2.31:1）。
- **t117（待开始）**：开局 / 相机 / 白光 / 1:12 钩子 / 结算读数 / 升级节奏 / Tab 构筑，详见下列 H1–H4、t110-M2/M3、t110-M5/M6。
- **H1 开局惩罚**：序曲 4 秒返听锁定 / 8 秒过热、开局光位跟随指针落在座位区、55 秒空场。目标：序曲免返听/过热，开局光位不落座位区，给 ≥30 秒观察期。
- **H3 相机钻鼓台**：按 `W` 走向舞台后侧时画面被鼓台/白光吞掉。目标：遮挡回避（抬高机位或拉近），保证任意站位能看见台面与至少一角观众席。
- **H4 白光遮挡**：白光 0.42 即将整屏洗白，与 H3 叠加后不可读。目标：白光上限 ≤0.35 或改边缘渐晕，优先保证观众席可见。
- **H2 1:12 唯一荧光棒钩子**：`OPENING_HOOKS` 数据存在但无代码引用；目标：实现该座位 + 唯一高亮与音效，或删除并同步 GDD。
- **t110-M2 结算断线次数恒 0**：`bridge.ts` 硬编码 `ZERO_LINE_BREAKS`；目标：统计三条线断裂次数并传入结算。
- **t110-M3 结算读数口径**：转化 106 > 被覆盖 61/83、两局转化恰好 106、"第二排还空着 0 个位置"；目标：明确转化/覆盖/离场互斥口径与文案。
- **t110-M5 升级节奏**：首轮三选一在 t=300，9:30 只拿到 1 次（GDD 期望 10 次）；目标：前 2 分钟 2–3 次选择。
- **t110-M6 Tab 与 HUD 提示不符**：`Tab` 打开暂停面板，HUD 写"Tab 看构筑"；目标：Tab 打开不打断演出的构筑查看，或改提示。
- **t110-M1 四角区点方位**：`ui.css` 与 `data/seats.ts` 的 `corner` 上下颠倒；目标：三者一致。
- **t110-M7 节拍环不可读**、**t110-M8 断线无方位指引**：可读性修复（P1，若时间允许）。
### Known issues

- **90 秒门未人测**：AC-13 / AC-H01 要求 10 名新玩家中 ≥7 人在 90 秒内主动移光；现有证据来自 AI 试玩与 bot 埋点，**不能替代真人样本**。
- **人耳音频未验**：5 层音乐、12 声部合唱、12 SFX 的听感与静音可玩未做盲听 A/B；无 `docs/qa/audio-report.md`。
- **性能未在目标硬件复测**：帧率数据来自 RTX 4080；1280×720 集显 3 局、1920×1080、满场 180 噪音、3 局内存增长未测。
- **Firefox 未实机验证**：本机未安装；仅静态审查。Safari 不在承诺范围。
- **失败卡 / 中断局未触发**：AC-12 / AC-F07 仍 blocked。
- **三构筑 / 三进化 / 评级边界未专门构造**：AC-23 / AC-24 / AC-25 仍 blocked。
- **部分 P0 人测项 blocked**：角色复述（AC-02 / H05）、静音可读（AC-10 / H06）、高对比与色觉（AC-21 / H07）、空场提示一致性（L1）、静音段逐态核验（AC-14 / AC-26）等。
- **命名 / 商标 / 项目许可证 / 仓库公开 / GitHub Pages** 未定；发布前需用户确认（见 [release-checklist](docs/release-checklist.md) §5–§7）。
- **当前构建非最终版**：`package.json` 仍为 `0.1.0`，构建元信息为 `girls-band-live v0.1.0 build:inline`；发布前需升到 `1.0.0` 并重建。
- **仅桌面**：不做移动端 / 触屏 / 手柄；窗口小于 1024×640 显示提示。

### Verification

| 证据 | 结果 |
| --- | --- |
| 四命令（最近一次全绿，t113） | `typecheck` exit 0；`test` 24 文件 / 264 用例；`build` exit 0；`validate` 14/14 |
| 最近全绿构建 | `1,041,592 B`（1017.2 KiB），SHA-256 `307d4e709c50…` |
| 当前工作区构建 | `1,043,675 B`（1019.2 KiB），SHA-256 `A220C425…`（2026-10-28，M6 修复中；05:33/05:46 构建同哈希，**未重跑四命令**） |
| `file://` 全流程（M6 候选，t109） | 启动 → 主菜单 → 曲目单 → 排练室 → 演出 → 移动/移光 → 升级 → 暂停 → 结算（空场 + 完整 9:30）→ 重开 → 设置/制作名单；控制台 0 条；网络仅 1 条 `file://` 文档请求 |
| 单文件自包含 | 无 `<script src>` / `<link href>` / `<img src>` / `@import` 外链；无字体/图片/音频/模型文件 |
| 兼容矩阵（t111） | Chrome / Edge 六档分辨率通过；真实窗口缩放 2 项 high（t115 进行中）；断网可玩；WebGL2 缺失提示与上下文恢复通过 |
| 体积 | ≤2 MiB 目标、≤4 MiB 硬上限（当前 ≈0.995 MiB） |

> 发布冻结后，此表必须用**最终构建**重跑并回填，旧构建的哈希不得作为发布证据。

### Upgrade notes

- 单文件版本无需安装/迁移；直接替换 HTML 即可。
- 存档 key 仍为 `gbl.save.v1`，字段向后兼容；损坏或被旧版本写入非法值时自动回退默认并生成 `gbl.save.v1.bad`。
- 若从更早的 M5 开发版升级，`lastRun.date` 可能为 UTC 日期（历史数据），新记录使用本地日期。

### Not planned / P2

- 多可操作角色、第二场馆、第二曲目、联机、账号、内购、关卡编辑器、完整多语言、配音、过场动画。
- 移动端 / 触屏 / 手柄（项目明确仅桌面）。

---

## 版本说明

- `1.0.0`：首个公开版本（本文件草稿）。
- 开发期版本号 `0.1.0` 对应 M5–M6 候选版；发布前统一升至 `1.0.0`。
