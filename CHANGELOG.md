# 更新日志 / Changelog

《谁在听》/ WHO'S LISTENING 的版本变更记录。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

> **v1.0.0 已就绪（2026-10-28）**：`package.json` version = `1.0.0`，单文件 **1,045,498 B（1,021.0 KiB）**，SHA-256 `2d2d91c2670bb447ad27d27950a627502d1aa9e7ffbd6aa6bdf14768014e0079`；四命令全绿，t125 M6 门禁通过（无 blocker/high）。
> `git tag` / GitHub Release / GitHub Pages 由制作人执行；仓库公开、许可证与 Pages 需用户确认。发布步骤与待确认项见 [docs/reports/m7-release.md](docs/reports/m7-release.md)，检查表见 [docs/release-checklist.md](docs/release-checklist.md)。

---

## [1.0.0] — 2026-10-28

首个公开版本：少女乐队 × 吸血鬼幸存者，9 分 30 秒一局，离线单文件。

### Added

**游戏内容（M4 GDD 锁定、M5 实现、M6 打磨）**

- 4 名乐队成员：主唱 **江栖**（玩家）、主音吉他 **许燎**、贝斯 **闻笙**、鼓 **邵砚**；4 个不依赖立绘/配音的角色瞬间。
- 3 种光形态：散光（4.2m）、束光（1.6m）、回照（自保护盾，每 4 拍人气 −1）；点燃脉冲含完美 / 良好 / 错拍三档与和弦内/外 ±25%。
- 4 个座区 / 4 个声部；**768 席**（24 排 × 32 座，含 0.7m 走道 gap）；12 声部合唱池（4 区 × 3 层）。
- 3 种常规噪音（底噪 / 啸叫 / 失真）+ 精英「返听」+ 三阶段 Boss「静默」；180 同屏噪音上限（低画质 90）。
- **24 张卡池 / 单局最多 10 次三选一 / 3 条互斥构筑（合唱流、独奏流、招灾流）/ 3 个进化**；热度 0–4（4 仅 `heat-cap` 解锁）；实测主动局 7–10 次三选一、进化可成型。
- 5 段结构（序曲 / 主歌 / 副歌 / 桥段 / 终曲）、3 种灯光态、1 首固定曲（128 BPM、4/4、304 小节，9:30）；2:00 / 5:00 / 8:00 三次人浪，6:30 静默段，8:50 终曲「放下光」。
- 3 种结局形状（完成 / 空场完成 / 中断失败）与 S/A/B/C 四档评级；结算含空位、真实 `RunResult` 数据与三条后台文案。
- 8 个屏幕 + 6 类覆盖层：启动、主菜单、今晚的曲目单、排练室、设置、制作名单、演出 HUD、结算；升级三选一、暂停、设置、离开确认、安可/独奏中断选择、失败卡。
- 局内 HUD **0 数字**；白光随人气相对峰值变化；四区热度点、段位点、构筑条、节拍环。
- 设置：三路音量、高/低画质、减少动态、高对比、节拍脉冲、低闪；`gbl.save.v1` 存档（设置 / 最佳记录 / 解锁），损坏自动回退并备份 `.bad`。
- 无障碍：键盘全流程、焦点环、`prefers-reduced-motion` / `prefers-contrast` / `forced-colors`、失焦降音与冻结；暂停对话框背景 `inert` / `aria-hidden`；启动屏 Tab 焦点锁定。

**过程与交付（M1–M7）**

- M1：10 位策划的 10 份自由企划（[报告](docs/reports/m1-pitches.md)）。
- M2：10 份交叉互评 + 创意总监融合 3 案（A《暖场》/ B《松手》/ C《谁在听》）（[报告](docs/reports/m2-discussion.md)）。
- M3：3 位评审 + 7 位独立打分员，中位数计票选出 C《谁在听》（加权 7.75 → 7.8）（[报告](docs/reports/m3-selection.md)、[定案](docs/decision/selected-concept.md)）。
- M4：完整 GDD（21 项锁定内容）、技术方案（42 个模块签名、三层边界）、68 项验收矩阵、美术方向（[GDD](docs/gdd.md)、[技术方案](docs/tech-spec.md)、[验收](docs/acceptance.md)、[美术](docs/art-direction.md)）。
- M5：7 位工程师的 8 个实现任务（引擎、渲染、战斗、成长、内容、UI、音频、模型），82 个 TS/TSX 文件 / 27,010 行；19 组必测模块（[门禁](docs/reports/m5-dev.md)、[单测](docs/qa/unit-report.md)）。
- M6：候选版、四命令、`file://` 全流程、实机试玩、桌面兼容 / 无障碍、修复与最终审查（[验证](docs/qa/verification-report.md)、[试玩](docs/qa/playtest-report.md)、[试玩 3](docs/qa/playtest-report-3.md)、[兼容](docs/qa/compat-report.md)、[M6 候选](docs/reports/m6-rc.md)、[M6 门禁](docs/reports/m6-gate.md)）。
- M7：README / CHANGELOG / 发布检查表 / 发布记录（本文件与 [release-checklist](docs/release-checklist.md)、[m7-release](docs/reports/m7-release.md)）。

**工程**

- Vite `root=src` + 零依赖 `tools/build-single.mjs`：把 JS/CSS 全部内联为单文件，`dist/girls-band-live.html` 与根 `index.html` 字节一致。
- `npm run validate` 14 条规则（R1–R14）：产物一致性、≤4 MiB、无外部 URL / 字体 / 运行时联网、单一内联 module、无 sourcemap / crossorigin、分层与确定性、构建可重复。
- 分层强制：`game` 无 react/three/DOM、`three` 无 react、`ui` 无 three、`types` 无实现 import；`game/**` 无 `Math.random` / `Date.now`。
- 性能预算：draw calls ≤60（目标 45）、三角面 ≤120k、后处理 0、真 SpotLight ≤2、DPR 上限 1.5 / 低画质 1.0。
- WebGL2 缺失提示页、WebGL 上下文丢失/恢复提示、断网可启动、单文件 0 外部网络请求；窗口缩放 canvas 跟随视口（resize / orientation / fullscreen / visualViewport / ResizeObserver / DPR）。
- **26 个测试文件 / 268 个 Vitest 用例**：RNG、时钟、碰撞、对象池、光、点燃、观众、人浪、F3 bot、开场宽限、成长、Boss、存档、HUD、确定性、实体、波次、升级、音乐、文案、座位布局、UI 冒烟、结算口径。
- 60 秒程序化音频垂直切片原型（[报告](docs/reports/audio-slice.md)、[原型](prototypes/audio-slice.html)）。

### Changed

- **白光口径改为峰值基准**：`computeWhiteout` 使用 `0.85 × (1 − audience / max(1, peakAudience))`；开局 30/768 → 0、掉到峰值一半 → 0.425、空场 → 0.85；旧固定公式 `0.85 × (1 − audience / 768)` 作废。表现层改为中央与 42% 半径 `alpha=0`、边缘最外圈 26%、四边 11vh/10vw；`acceptance` AC-F08、`tech-spec` §14.3、`gdd` §12 已同步。
- **结算记录唯一权威**：删除 `ui/bridge.ts` 的 records 双写，记录只由 `game/save.ts` 的 `updateRecords` 写入；`complete` +1 `clears`、`empty-house` 只 +1 `emptyHouse`、`interrupted` 不加；`lastRun.date` 改为本地时区。
- **结算读数口径**（t117）：断线次数按 `line break` 事件累计并传入结算；「当前构筑 / 第二排空位」按四区各自第二排计算；结果页使用「转化人次 / 离场人次」并注明累计人次口径。
- **开局惩罚修复**（t121）：删除首帧直接采纳指针与 `pointerWorld` 位移判定，只认 `pointerNdc > 0.01`；开场 5 秒宽限、首次移动鼠标前不累计压力；相机首帧 snap，避免开场缓动被误判为玩家操作。
- **音频时钟统一**：新增 `data/music-clock.ts` 的 `createRunMusicClock`，engine / fallback / store 共用「本局演唱秒数 + 段落表」语义。
- **HUD 发布路径**：`ui/bridge.ts` 订阅 store 的 HUD 发布（≤10Hz），删除 `main.tsx` 的 100ms 定时器；React 不在 rAF 内 setState。
- **画布层级与缩放**：`#game-canvas` 的 `z-index` / `pointer-events:none` / 尺寸规则固化到 `styles/base.css`；`main.tsx` 读 `documentElement` 尺寸，`renderer.setSize(..., false)` 并清内联 px，修复窗口缩放自锁。
- **座位世界坐标**收敛到 `data/seats.ts` 唯一真源（含走道 gap 与原点）。
- `game/loop` 不再 type-only import `three/renderer`；`FrameRenderer` / `RenderStats` / `RendererInfo` 迁入 `src/types/game.ts`。
- **经验来源扩展**（t121/t124）：转化 +1、点燃 +1/+2/+3、点燃击杀 +1/只（≤8）、合唱击杀 +1/只（≤12）、人浪 +10、基础演出 0.7/s + 人气系数；首升 0:25–0:40，主动局 7–10 次三选一；24 卡 / 10 选 / 3 核心 / 3 构筑 / 3 进化未改。
- 构建元信息：`girls-band-live v1.0.0 build:inline`；`legalComments: 'eof'` 保留 MIT 声明。

### Fixed

以下条目均已合入 v1.0.0，并有报告/单测/实机证据。

- **F3 反驻守（t105 + t121/t122 实机）**：驻守 45s 人气 30 → 7（−76.7%）/ 主歌 30 → 0（−100%）；扫场 30 → 40（+33.3%）；`tests/f3-bot.test.ts` 4/4；t122 实机驻守序曲 −87%、主歌 −100%。
- **H1 开局惩罚（t117/t121）**：修复「开始演出」按钮指针污染光位与开场缓动误判；冷启 8/8 + 复测 5/5 无锁定/过热，光位回到 data 初始位、30 人、whiteout 0。
- **H3 相机（t117/t121）**：`CAMERA_LIMITS.minZ` 放宽 + 首帧 snap + `FRAMING_AHEAD`；W/A/S/D 到边界可见台面、成员、观众与荧光棒，不再整屏灰白。
- **H4 白光遮挡（t117）**：veil 改径向渐变（中心与 42% 半径内不遮挡），whiteout 0.85 时舞台/成员/敌方轮廓清晰。
- **H2 1:12 钩子（t117）**：固定相机看不到第 24 排，采用等价钩子——back-right 第一排最右端 1.7m 绿色 emissive 荧光棒 + 加色光球，开局可见、可被追光照亮；GDD §14 已注明等价处理。
- **升级节奏（t121/t122）**：主动局三选一从「t=300 仅 1 次」提升到 7–10 次（t122 10/10，26–228s），构筑与进化成型。
- **过热掉人（t121）**：过热约 1.4s/人，与 balance 一致；驻守 45s 30→4（−87%）。
- **结算记录与口径（t113/t117）**：空场不再多记 `clears`；断线次数不再恒 0；第二排空位按四区计算（完整局 642 空位时第二排 22）；转化/被覆盖/离场有累计人次注释。
- **whiteout 开局洗白（t108/t113）**：峰值基准后开局白光 = 0；`tests/hud.test.ts` 11/11。
- **`dwellRewardRatio` 负值口径（t113）**：文档注明「负值 = 停住期人气净下降，是预期证据，不是阈值失败」。
- **座位 0.7m 错位（t103）**：`data/seats.ts` 唯一真源，`tests/seat-layout.test.ts` 21/21。
- **音频时钟语义漂移（t108）**：engine 与 fallback 在 8 个时间点逐项相同。
- **窗口缩放 canvas 自锁（t115/COMPAT-1）**：Chrome 5 档 / Edge 5 档窗口尺寸变化后 css==inner、viewport==backing，无刷新。
- **白光下 HUD 对比度（t115/COMPAT-2）**：暗底衬 + 描边 + 11px 字号；像素采样峰值 14.8/16.5/7.7:1（1280）、14.6/16.1/7.3:1（1920），0.312 时 16.4/17.1/5.1:1。
- **无障碍 medium（t115）**：skip link 焦点、暂停 `inert`、启动屏 Tab 锁定、区形状 heat-0 对比度、HUD 小字 10→11px。
- **构建重复性**：连续两次构建 SHA-256 一致；根 `index.html` 与 `dist/girls-band-live.html` 字节一致。
- **损坏存档 / WebGL2 缺失 / 上下文丢失**：坏档回退并备份 `.bad`；提示页与恢复提示正常。
- **文档口径（t124）**：GDD §10/§11/§12/§14 与 acceptance AC-08/AC-13/AC-F04 同步 XP、宽限、whiteout、等价钩子；锁定数量未改。

### Known issues

发布时已知限制；均为 P1/已知项，无 blocker/high。完整说明见 [m6-gate §6](docs/reports/m6-gate.md) 与 [m7-release](docs/reports/m7-release.md)。

1. **90 秒真人门未做**：AC-13 / AC-H01 需要 10 名外部新玩家，≥7 人在 90 秒内主动移光；当前只有 AI 试玩、冷启采样与 bot 埋点，不能替代真人样本。
2. **音频听感 / 盲听 A/B 未人测**：5 层音乐、12 声部合唱、12 SFX 的听感、静默段与「少一轨是否疼」无人耳验证；无 `docs/qa/audio-report.md`。
3. **性能未正式验收**：现有约 130fps 级采样（RTX 4080）；1920×1080、连续 3 局、集显/低画质未正式测。
4. **W 边界相机构图**：台面/成员/观众/荧光棒可见，但画面底部约 55% 接近黑色（t122 medium）。
5. **升级曲线前重后空**：10 次三选一集中在 3:48 内，之后 5:42 没有新的构筑推进（t122 medium）。
6. **评级可达性（REV-M3，刻意设计 / 已知 P1）**：常规扫场+点燃约 160 人 = C，B 需终场 ≥300。**理由**：评级刻度奖励「养人/唱化」而非单纯扫场击杀，C 是常规打法基线，B 及以上要求把观众养到 300+（与 GDD §13.5 阈值一致）；制作人口径（2026-10-28）确认为刻意设计，待 90 秒真人门与玩家反馈后再评估。若玩家普遍读成「只有唱化流可玩」，P1 调整提示或阈值。
7. **序曲可逆空场（REV-M4，刻意设计 / 已知 P1）**：驻守把 30 人打到 4 后，45 秒扫场可回满 30，序曲 F3 代价偏弱。**理由**：序曲是教学/邀请段（GDD §14 温柔开局），设计上不允许第一分钟即锁死失败；反驻守主要针对中后段驻守（返听/过热在有噪音时生效）。制作人口径确认为刻意设计，P1 观察是否需要为中后段补强。
8. **H2 等价钩子位置**：1:12 荧光棒位于 back-right 第一排最右端（1.7m），非 GDD 原文第 24 排——固定 45°/22° 相机看不到第 24 排；GDD §14 与 acceptance AC-13/AC-F04 已同步等价处理。
9. **whiteout 临界动画峰值**：HUD 内联静态上限 0.85，临界态动画峰值可达 0.957–1.000（表现层脉动）；验收按动画峰值注明。`dwellRewardRatio` 负值 = 停住期人气净下降，属预期证据，不是阈值失败。
10. **暂停面板构筑区不列已选核心（F5）**：已选核心后仍显示「还没有拿到卡。第一次升级会先选核心。」（low；HUD 核心显示正确）；`Tab` 打开暂停面板与 HUD「Tab 看构筑」提示不完全一致（t110-M6 未修）。
11. **其他未覆盖**：Firefox 未实机验证；失败卡/中断局、三构筑各一局、三进化、评级边界、静默可读性、高对比/色觉复述未专门构造；仅桌面，不做移动端/触屏/手柄。
12. **命名 / 商标 / 许可证 / 仓库公开 / Pages 未定**：发布前需用户确认；GitHub Pages 未上线，默认只交付离线单文件与 Release 附件。

### Verification

| 证据 | 结果 |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm test` | **26 文件 / 268 用例 / 0 失败** |
| `npm run build` ×2 | 均 exit 0；两次 SHA-256 一致；`dist` 与根 `index.html` 均 **1,045,498 B（1,021.0 KiB）** |
| `npm run validate` | **14/14 rules passed（1021.0 KiB，sha256 `2d2d91c2670b`）** |
| `node tools/check-layers.mjs` | 83 files, 0 violations |
| 发布候选 SHA-256 | `2d2d91c2670bb447ad27d27950a627502d1aa9e7ffbd6aa6bdf14768014e0079` |
| `file://` 正式路径（t125） | 启动 → 主菜单 → 演出（7/15/63s）→ 升级三选一（选「回照」）→ 暂停 → 回主菜单 → 离开确认；console 0 条、Network 仅 1 条文档请求 |
| `file://` 快进结算（t125） | 37,200 tick → results、complete、570.0s、picks=10；结算与 `RunResult` 一致；再演一场正常 |
| 版本标记 | HTML 注释 `<!-- girls-band-live v1.0.0 build:inline -->` |
| 体积 | 1,021.0 KiB ≤ 2 MiB 目标、≤ 4 MiB 硬上限 |
| 审核/门禁 | t123 审查 PASS；t125 M6 门禁通过（0 blocker / 0 high；4 项发布前文档小修） |
| 兼容矩阵（t111/t115） | Chrome / Edge 六档分辨率、窗口缩放、离线、键盘/焦点、WebGL2 缺失/上下文恢复通过；Firefox 未测 |

> 本表对应最终 v1.0.0 构建；发布说明与 Release 正文使用同一组数据。

### Upgrade notes

- 单文件版本无需安装/迁移；直接替换 HTML 即可。
- 存档 key 仍为 `gbl.save.v1`，字段向后兼容；损坏或被旧版本写入非法值时自动回退默认并生成 `gbl.save.v1.bad`。
- 若从更早的 M5 开发版升级，`lastRun.date` 可能为 UTC 日期（历史数据），新记录使用本地日期。

### Not planned / P2

- 多可操作角色、第二场馆、第二曲目、联机、账号、内购、关卡编辑器、完整多语言、配音、过场动画。
- 移动端 / 触屏 / 手柄（项目明确仅桌面）。

---

## 版本说明

- `1.0.0`：首个公开版本（当前版本）。
- 开发期版本号 `0.1.0` 对应 M5–M6 候选版；v1.0.0 已将 `package.json` 与构建元信息升到 `1.0.0`。
