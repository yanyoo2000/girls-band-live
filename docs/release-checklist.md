# 发布检查表 / Release Checklist — v1.0.0

> **用途**：M7 发行前逐项签核。每项都必须有"命令输出 / 报告路径 / 截图 / 哈希"作为证据，不接受"感觉没问题"。
> **执行边界**：本表由发行经理维护；`git add/commit/tag/push`、GitHub Release、Pages 由制作人执行；仓库公开、许可证与 Pages 上线必须由**用户明确确认**。
> **当前状态**：v1.0.0 发布候选已通过 M6 门禁（[m6-gate](reports/m6-gate.md)），**文档与检查表完成**；`git tag` / GitHub Release / Pages 待执行；4 项发布前文档小修已按 captain 指示并入（F1/F2/F3 已改文档，F4/F5 写入 [m7-release](reports/m7-release.md) 与已知限制）。
> **最终产物**：`1,045,498 B（1,021.0 KiB）` / SHA-256 `2d2d91c2670bb447ad27d27950a627502d1aa9e7ffbd6aa6bdf14768014e0079`；**不要重建产物**，只改文档。

## 0. 发布身份

| 项 | 值 |
| --- | --- |
| 产品名 | 《谁在听》 / WHO'S LISTENING |
| 版本 | `v1.0.0`（`package.json` version = `1.0.0`） |
| 发布日期 | 2026-10-28 |
| 发布物 | `dist/girls-band-live.html`（单文件、离线、`file://` 可玩） |
| 仓库入口 | 根 `index.html`（构建生成，与 dist 单文件字节一致，供 Pages 使用） |
| 目标平台 | 桌面 Chrome / Edge / Firefox（最新两个大版本），WebGL2，1280×720 起 |
| 默认分支 | `main` |
| 构建元信息 | `<!-- girls-band-live v1.0.0 build:inline -->` |
| 最终构建 | `1,045,498 B`（1,021.0 KiB），SHA-256 `2d2d91c2670bb447ad27d27950a627502d1aa9e7ffbd6aa6bdf14768014e0079` |
| 两次构建 | 字节与 SHA-256 完全一致（t124/t125） |
| Git tag | `v1.0.0`（_待制作人打 tag_；M6 已打 `m6-rc`） |
| Release 附件 | `dist/girls-band-live.html`（_待上传_） |

---

## 1. 发布门禁（阻塞项）

> 全部勾选前**不得**打 tag、不得上传 Release 附件、不得开启 Pages。✅ = 已完成并有证据。

- [x] **t115 完成**：窗口缩放 canvas 自锁（COMPAT-1）、白光下 HUD 对比度（COMPAT-2）修复并复测；另修 4 项无障碍 medium（[报告](reports/compat-fix-report.md)）。
- [x] **t117 完成**：开局（H1）、相机（H3）、白光（H4）、1:12 等价钩子（H2）、结算断线/第二排口径（t110-M2/M3）（[报告](reports/gameplay-repair.md)）。
- [x] **t118 复测**：H2/H3/H4/M2/M3 关闭；H1 仍失败 → 转 t121。
- [x] **t121 修复 2**：H1 稳定（8/8 冷启）、过热 1.4s/人、升级 7–10 次（[报告](reports/gameplay-repair-2.md)）。
- [x] **t122 复测 2**：H1 冷启 5/5、三选一 10/10、F3 实机驻守 −87%/−100%、白光峰值可读（[报告](qa/playtest-report-3.md)）。
- [x] **t123 代码审查**：verdict = **pass**；4 medium + 3 low 转 P1（无 blocker/high）。
- [x] **t124 发布集成**：version 1.0.0、单文件 1,045,498 B / `2d2d91c2…`、四命令全绿、file:// 通过（[m6-rc](reports/m6-rc.md)）。
- [x] **t125 M6 门禁**：**通过，无 blocker/high**；4 项发布前小修（[m6-gate](reports/m6-gate.md)）。
- [x] **t109 / t111 旧结论绑定**：t109 的 AC-F08 fail 已由 t113/t123 覆盖；verification-report 文首已加「t109 旧版，已被 t113/t123 取代」注记；COMPAT-1/2 由 t115 实测关闭。
- [x] **发布前文档小修**：F1 acceptance AC-F08 动画峰值注记、F2 verification-report 旧版注记、F3 AC-08/AC-H02 测试文件名改为 `tests/f3-bot.test.ts`（本任务完成）；F4 评级/序曲口径写入 [m7-release](reports/m7-release.md)；F5 列入已知限制。
- [x] **代码冻结**：v1.0.0 只改文档与 `package.json` version，业务代码与 t123 审查版一致；冻结后只允许发布相关文档改动。
- [ ] **用户确认**：项目许可证、仓库是否公开、是否开启 GitHub Pages（见第 5、6、7 节）。
- [ ] **最终验收**：制作人 `docs/reports/final-acceptance.md`（或等价记录）签署 v1.0.0；tag/Release 由制作人执行。

---

## 2. 四命令（命令契约不可改名）

| # | 命令 | 通过标准 | 实测（2026-10-28，t124/t125） | 结果 |
| --- | --- | --- | --- | --- |
| 1 | `npm run typecheck` | 退出码 0，0 错误；覆盖 `src/**`、`tests/**`、`tools/**` | exit 0，无错误 | [x] 通过 |
| 2 | `npm test` | 退出码 0；26 个测试文件 / 268 用例全过；无 `skip` / `todo` / `only` | `Test Files 26 passed` / `Tests 268 passed` | [x] 通过 |
| 3 | `npm run build` | 退出码 0；产出 `dist/girls-band-live.html` 与根 `index.html`，两者字节一致；连续两次 SHA-256 相同 | exit 0 ×2；均 1,045,498 B；sha 两次一致 `2d2d91c2670b…` | [x] 通过 |
| 4 | `npm run validate` | 退出码 0；输出含 `validate: 14/14 rules passed` | `14/14 rules passed（1021.0 KiB，sha256 2d2d91c2670b）` | [x] 通过 |

补充（已完成）：

- [x] `node tools/check-layers.mjs` → `83 files, 0 violations`（t123）。
- [x] `npx vitest run tests/f3-bot.test.ts` → 4/4；驻守 30→7（≤18）、扫场 30→40（≥36）；t122 实机驻守 −87%/−100%、扫场回补。
- [x] 失败处理：无失败项；若后续任何命令失败，不得用脚本绕过或改测试，按 tech-spec §17.2 变更流程修复后重跑全部四项。

> 记录模板：命令、时间、退出码、关键输出、执行人（t123/t124/t125 已留存）。

---

## 3. 单文件与体积

- [x] `dist/girls-band-live.html` 存在：**1,045,498 B（1,021.0 KiB，0.997 MiB）**，**≤2 MiB 目标**，远低于 4 MiB 硬上限。
- [x] 根 `index.html` 与 `dist/girls-band-live.html` **字节一致**（SHA-256 相同 `2d2d91c2…`）。
- [x] `npm run build` 连续两次，`dist/girls-band-live.html` SHA-256 完全一致（AC-T10）。
- [x] `validate` R1–R14 全过（自包含、单一内联 module、无外链、无字体、无 sourcemap、无 crossorigin/integrity、版本元信息、分层、确定性）。
- [x] 构建元信息为 `girls-band-live v1.0.0 build:inline`（页面内读取确认）。
- [x] 产物包含 React / Three 的 MIT 声明（`legalComments: 'eof'`）。
- [x] 无 `dist/assets/**`、`dist/index.html` 等 Vite 中间产物被误当作发布物；Release 附件只放 `dist/girls-band-live.html`。
- [x] `package-lock.json` 与 `package.json` 一致；未新增依赖；`node_modules/` 未提交。

---

## 4. `file://` 冒烟（v1.0.0 最终构建）

浏览器矩阵：**Chrome 已实测**（t124/t125）；**Edge 已实测**（t115 兼容）；Firefox 本机未安装 → 已知限制。

- [x] 双击 `dist/girls-band-live.html`（或拖入浏览器）进入启动屏 → 主菜单。
- [x] 主菜单 → 今晚的曲目单 → 排练室（3 页）→ 设置 → 制作名单 → 返回，均可用。
- [x] 开始演出：舞台、HUD、四区热度点、段位点出现；局内 HUD **0 数字**。
- [x] `WASD` 移动、鼠标移光、左键束光/点燃、`E` 插线、`Space` 终曲长按均有响应。
- [x] 升级三选一：第 1 次选卡后回到演出，构筑条更新；一局最多 10 次（t122 实测 10/10；t125 快进 picks=10）。
- [x] `Esc` 暂停/继续；失焦冻结/降音；`Tab` 打开暂停面板并显示构筑（与 HUD 提示不完全一致 → F5 已知限制）。
- [x] 至少完成 **1 局完整 9:30**（`ending=complete`），结算数据与 `RunResult` 逐项一致；再演一场回到序曲（t124 empty-house 570.0s；t125 complete 570.0s）。
- [x] 空场路径（`ending=empty-house`）结算并可重开（t124）。
- [x] 设置修改后刷新仍保留；手动破坏 `gbl.save.v1` 后启动正常并生成 `.bad`（t115/历史验证）。
- [x] 断网（DevTools offline / 拔网线）后仍可启动到演出（t111）。
- [x] DevTools Console：**0 条错误/未捕获异常**（t124/t125 两路径均 0）。
- [x] Network：除 `file://` 文档自身外 **0 个请求**；无 `http(s)` / CDN / 字体下载（t124/t125 各 1 条文档请求）。
- [x] WebGL2 缺失提示页文案正确、不白屏（t111）。
- [x] WebGL 上下文丢失/恢复提示正确，恢复后继续绘制（t111）。
- [x] 窗口缩放：Chrome 5 档 / Edge 5 档 css==inner、viewport==backing，无刷新（t115）。
- [x] 分辨率：1280×720、1366×768、1920×1080 无布局溢出、HUD 无越界；800×600 显示"窗口太小了"提示（t111/t115）。
- [x] 高对比 / 减少动态 / 低闪 / 节拍脉冲四项立即生效且刷新保留（t111）。
- [x] 键盘全流程：Tab / Shift+Tab / Enter / Space / Esc 可达（t111/t115；完整"开始→结算"键鼠流程未专门录屏 → 已知限制）。
- [x] H1 开场路径：8 秒内无返听锁定、无过热（t125 独立冒烟；t122 冷启 5/5）。
- [ ] Firefox 实机（本机未安装，未测）→ 已知限制。
- [ ] 失败卡/中断局、三构筑各一局、三进化、评级边界（未专门构造）→ 已知限制。
- [x] 截图归档：t115 `docs/reports/compat-shots/`（5 张）、t117/t121 `docs/reports/gameplay-shots/`、QA `docs/qa/shots/`。

---

## 5. GitHub Release（制作人执行）

- [ ] 代码冻结后，制作人提交：`chore(release): M7 v1.0.0`（M6 已打 `m6-rc`，v1.0.0 在此之后）。
- [ ] annotated tag `v1.0.0`，tag 指向发布提交。
- [ ] Release 标题：`《谁在听》 v1.0.0`；正文使用 [CHANGELOG 的 1.0.0 节](../CHANGELOG.md) + [m7-release 的 Release notes 10 条](reports/m7-release.md)。
- [ ] 附件：`dist/girls-band-live.html`（建议重命名为 `who-is-listening-v1.0.0.html`，命名需与 Release 正文一致）。
- [ ] Release 正文写明附件 SHA-256、文件大小（1,045,498 B / 1,021.0 KiB）、平台要求（桌面 + WebGL2）、离线说明。
- [ ] 下载附件到另一目录，核对 SHA-256 `2d2d91c2…` 与大小一致，并 `file://` 打开一次。
- [ ] **不要**把 `dist/assets/**`、`node_modules`、QA 截图压缩包作为 Release 附件（除非用户要求）。
- [ ] 仓库可见性：当前为 private；**转公开需用户确认**（会暴露全部历史与文档）。
- [ ] Release 发布后，在 M7 Issue 评论 commit / tag / 附件哈希，关闭 Issue 与 Milestone。

---

## 6. GitHub Pages（需用户明确确认后才做）

> 默认**不做**。未确认时只交付本地单文件与 Release 附件。

- [ ] 用户书面确认：仓库公开 + 开启 Pages。
- [ ] 仓库 Settings → Pages：Source = `Deploy from a branch`，Branch = `main`，Folder = `/ (root)`。
- [ ] 根 `index.html` 是内联单文件，无相对资源 404；访问 URL 能进入启动屏。
- [ ] 在 Pages URL 上完成一次等价冒烟（启动 → 主菜单 → 演出 → 暂停 → 结算）。
- [ ] 检查 URL 无 404、无混合内容、无外部请求。
- [ ] 在 README 与 Release 中记录 Pages URL。
- [ ] 若用户未确认：在发布说明中明确"未上线 Pages，仅提供离线单文件"。

---

## 7. 原创素材复核

- [x] **零外部素材**：产物无 `<img>` / `<audio>` / `<video>` / `<link rel="icon">` / `@font-face` / `.woff` / `.ttf` / glTF / GLB / 第三方音频；`validate` R6–R9 全过。
- [x] 所有视觉为 Three.js 基础几何 + 程序化材质 + CanvasTexture / SVG；`src/assets/procedural.ts` 为唯一资产来源。
- [x] 所有音乐 / 音效为 WebAudio 实时合成；无采样音频文件、无第三方 loop。
- [x] 字体仅使用系统字体栈（PingFang SC / Microsoft YaHei / Noto Sans SC / system-ui 等），未打包字体。
- [x] 文案、角色名（江栖 / 许燎 / 闻笙 / 邵砚）、乐队名（留声）、场馆（B2 旧货仓）、曲目（《再亮一会儿》）、Boss / 精英 / 噪音命名均为本项目原创。
- [x] 未使用现实乐队、歌曲、专辑封面、人物肖像、商标或既有 IP 的素材 / 近似复制；未参考任何具体作品的角色/UI。
- [x] 依赖许可证复核：`react`、`react-dom`、`three`（MIT）；`vite`、`vitest`、`@vitejs/plugin-react`（MIT）；`typescript`（Apache-2.0）；`@types/*`（MIT）。`legalComments` 保留 MIT 声明。
- [ ] 项目自身许可证已选定并添加 `LICENSE` 文件（**待用户确认**：MIT / Apache-2.0 / CC BY-NC 等）。
- [x] QA 截图 / 录屏可公开（无个人隐私、无系统通知、无第三方内容）；如需附在 Release，先逐张检查。
- [x] 构建工具与运行时无远程字体/统计/埋点；`gbl.save.v1` 仅本地保存设置与记录。

---

## 8. 命名查重

检查对象：中文名《谁在听》、英文名 **WHO'S LISTENING**、乐队「留声」、曲目《再亮一会儿》、仓库名 `girls-band-live`。

- [x] 在 **Steam / itch.io / App Store / Google Play** 检索中英文名：初步未发现同名电子游戏。
- [x] 在 **Google / B 站 / 微博 / 小红书** 检索中文名：初步未发现同名作品/账号（需人工复核）。
- [ ] 在 **中国商标网 / USPTO** 做正式检索（建议委托专业机构；本表不构成法律意见）→ 待用户/人工。
- [x] 若撞名：使用 GDD 备用标题《还亮着》或《灯下有人》，不改玩法；同步更新 README / CHANGELOG / 构建标题。
- [x] 检查仓库名与游戏名：仓库名 `girls-band-live` 为开发期代号，成品名《谁在听》；发布前确认名称策略。

**初步检索记录（2026-10-28，仅供内部参考，非法律意见）**：

- 未发现同名电子游戏《谁在听》或 WHO'S LISTENING（初步检索未发现 Steam / itch.io 方向的冲突结果）。
- 存在近名但不同类的作品：教育桌游 [Look Who's Listening!](https://www.superduperinc.com/look-whos-listening.html)、公民科学项目 [Who's Listening?（SciStarter / Dark Sky）](https://darksky.scistarter.org/whos-listening)、Ludum Dare 59 作品 [SOMEONE IS LISTENING](https://ldj.am/59/someone-is-listening)。均不构成直接同名冲突，但建议发布前人工复核商店与商标库。
- 备用标题：**《还亮着》**、**《灯下有人》**（GDD 指定，仅发行期撞名替换用）。

---

## 9. 文档与版本一致性

- [x] [README.md](../README.md)：v1.0.0 状态、单文件打开方式、操作、玩法、四命令、36 人/M1–M7、已知限制（90 秒真人门、音频、性能、Pages 等）。
- [x] [CHANGELOG.md](../CHANGELOG.md)：`1.0.0` 最终条目、M1–M7、F3/whiteout/相机/开局/升级节奏/记录修复、10 条已知限制（含 REV-M3/M4 刻意设计与 F5）。
- [x] `package.json` → `"version": "1.0.0"`（已确认）。
- [x] 构建元信息 `girls-band-live v1.0.0 build:inline` 出现在单文件中。
- [x] 根 `index.html` 由最终构建生成，与 dist 单文件同 sha。
- [x] [docs/reports/m7-release.md](reports/m7-release.md)：最终产物、发布步骤、待用户确认项、Release notes 10 条（取代旧的 m7-release-draft.md）。
- [x] [docs/qa/verification-report.md](qa/verification-report.md)：文首已加「t109 旧版，已被 t113/t123 取代」注记。
- [x] [docs/acceptance.md](acceptance.md)：AC-F08 已补「动画峰值 0.957–1.000，静态上限 0.85」；AC-08/AC-H02 证据改为 `tests/f3-bot.test.ts`。
- [x] [docs/gdd.md](gdd.md)、[docs/tech-spec.md](tech-spec.md) 的白光口径、反驻守规则、和弦表、失败卡时长与实现一致（t107/t113/t124 已同步）。
- [x] 发布说明列出所有 **blocked / 未人测** 项，不把"机器通过"写成"验收全绿"。

---

## 10. 发布后验证

- [ ] 从 Release 下载附件 → 核对 SHA-256 与大小 → `file://` 打开 → 完成一局到结算（或至少启动 + 演出 30 秒）。
- [ ] 若启用 Pages：访问 URL → 启动 → 演出 30 秒 → 暂停 → 关闭；记录 URL 与时间。
- [ ] 检查 Release 附件下载不需要登录（仓库公开后）。
- [ ] 在 M7 Issue 记录：tag、commit、附件哈希、四命令结果、Pages URL（如有）、时间、执行人。
- [ ] 归档本次发布证据（命令输出、截图、哈希）到 `docs/qa/release/` 或 Release 正文。
- [ ] 通知用户发布完成与已知限制。

---

## 11. 回滚预案

- [x] 保留上一构建作为回滚候选：t123 审查版 `877ac242…`（1,045,498 B，业务代码与 v1.0.0 一致，仅版本标记不同）。
- [x] 记录最终候选 SHA-256 `2d2d91c2670b…` 与四命令结果。
- [ ] 若发布后发现 P0（无法启动 / 存档损坏 / 严重性能问题）：立即在 Release 标记 `pre-release` 或 yank，并发布 `v1.0.0` 撤回说明。
- [ ] Pages 回滚：关闭 Pages 或回退到上一提交；确认旧 URL 不再提供可玩版本。
- [ ] 修复后重新走第 1–4 节，发布 `v1.0.1`，不覆盖 `v1.0.0` tag。

---

## 12. 签核

| 角色 | 负责项 | 签核人 | 日期 | 结论 |
| --- | --- | --- | --- | --- |
| 发行经理 | 第 2–4、7–9、10 节文档与检查表 | release-manager | 2026-10-28 | **完成**（README/CHANGELOG/checklist/m7-release；F1/F2/F3 文档小修） |
| 技术总监 | 第 1–4 节修复与构建冻结 | tech-director | 2026-10-28 | t124 完成（v1.0.0 候选） |
| QA | 第 1、4 节回归与报告 | qa-automation / qa-playtester / qa-compat | 2026-10-28 | t118/t122 复测完成 |
| 代码审查 | 第 1 节 review pass | code-reviewer | 2026-10-28 | t123 PASS（0 blocker/high） |
| 制作人 | 第 1、5、6、10、11 节提交/Release/最终验收 | producer | _待_ | t125 门禁 PASS；tag/Release 待执行 |
| 用户 | 许可证、仓库公开、Pages | 用户 | _待_ | **待确认** |
