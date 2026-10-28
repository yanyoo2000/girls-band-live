# 发布检查表 / Release Checklist — v1.0.1

> **用途**：发行前逐项签核。每项都必须有"命令输出 / 报告路径 / 截图 / 哈希"作为证据，不接受"感觉没问题"。
> **执行边界**：本表由发行经理维护；`git add/commit/tag/push`、GitHub Release、Pages 更新由制作人执行；项目许可证需用户确认。
> **当前状态**：v1.0.1 发布候选已通过最终审查（[t147 PASS](reports/v1.0.1-release.md)），**文档与检查表完成**；`git tag v1.0.1` / GitHub Release / Pages 更新待制作人执行。
> **最终产物**：`1,084,885 B（1,059.5 KiB）` / SHA-256 `25422f523607dacf613cc660cdf629292fffb5888f4cd4f9a36583a907099e51`；**不要重建产物**，只改文档。

## 0. 发布身份

| 项 | 值 |
| --- | --- |
| 产品名 | 《谁在听》 / WHO'S LISTENING |
| 版本 | **v1.0.1**（`package.json` version = `1.0.1`） |
| 发布日期 | 2026-10-28 |
| 发布物 | `dist/girls-band-live.html`（单文件、离线、`file://` 可玩） |
| 仓库入口 | 根 `index.html`（构建生成，与 dist 单文件字节一致，供 Pages 使用） |
| 在线试玩 | https://yanyoo2000.github.io/girls-band-live/ （Pages 已上线 v1.0.0，v1.0.1 待部署更新） |
| 目标平台 | 桌面 Chrome / Edge / Firefox（最新两个大版本），WebGL2，1280×720 起 |
| 默认分支 | `main` |
| 构建元信息 | `<!-- girls-band-live v1.0.1 build:inline -->` |
| 最终构建 | `1,084,885 B`（1,059.5 KiB），SHA-256 `25422f523607dacf613cc660cdf629292fffb5888f4cd4f9a36583a907099e51` |
| 两次构建 | 字节与 SHA-256 完全一致（t144/t145/t147） |
| Git tag | `v1.0.1`（_待制作人打 tag_；已有 `m6-rc`、`v1.0.0`） |
| Release 附件 | `dist/girls-band-live.html`（_待上传_；建议命名 `who-is-listening-v1.0.1.html`） |
| 上一版本 | v1.0.0：1,045,498 B / `2d2d91c2…`（已发布） |

---

## 1. 发布门禁（阻塞项）

> 全部勾选前**不得**打 tag、不得上传 Release 附件、不得更新 Pages。✅ = 已完成并有证据。

- [x] **t139 gameplay 修复**：11+ modifier 接线、`run.stats` 回写、返听 `lockOrigin`+8m/7s、安可归零窗口、形态/护盾字段（[报告](reports/optimization-gameplay.md)）。
- [x] **t140 audio 修复**：空场 0.22 + 心跳、静默 16s 兜底、合唱 0.38 + presence、升级 duck（[报告](reports/optimization-audio.md)）。
- [x] **t142 visual 修复**：曝光/光池/束光红边（[报告](reports/optimization-visual.md)）。
- [x] **t143 UI 修复**：三步教学、三形态、人气读数、Tab 构筑、键盘、失焦、小窗、卡面（[报告](reports/optimization-ui.md)）。
- [x] **t144 发布集成**：version 1.0.1、单文件 1,084,885 B / `25422f52…`、四命令全绿、file:// 通过（[v1.0.1-rc](reports/v1.0.1-rc.md)）。
- [x] **t145 独立验证**：四命令与 file:// 通过；16 pass / 0 partial / 3 blocked；无 blocker/high（[verification-report-v101](qa/verification-report-v101.md)）。
- [x] **t146 实机复测**：纯键盘 0 指针 9:30 闭环；可见性/人气预警/返听可解/安可/护盾 PASS；第二排/合唱墙/引线未 offer（如实记录）（[playtest-report-v101](qa/playtest-report-v101.md)）。
- [x] **t147 最终审查**：verdict = **PASS**；0 blocker/high；已知限制转 P1/defer（[v1.0.1-release](reports/v1.0.1-release.md)）。
- [x] **代码冻结**：v1.0.1 只改文档与版本；业务代码与 t147 审查版一致；冻结后只允许发布相关文档改动。
- [ ] **用户确认**：项目许可证（`LICENSE`）；Release 附件命名（见第 5 节）。
- [ ] **最终发布**：制作人 commit、annotated tag `v1.0.1`、GitHub Release、Pages 更新（同一 URL）。

---

## 2. 四命令（命令契约不可改名）

| # | 命令 | 通过标准 | 实测（2026-10-28，t145/t147） | 结果 |
| --- | --- | --- | --- | --- |
| 1 | `npm run typecheck` | 退出码 0，0 错误；覆盖 `src/**`、`tests/**`、`tools/**` | exit 0，无错误 | [x] 通过 |
| 2 | `npm test` | 退出码 0；30 个测试文件 / 294 用例全过；无 `skip` / `todo` / `only` | `Test Files 30 passed` / `Tests 294 passed` | [x] 通过 |
| 3 | `npm run build` | 退出码 0；产出 `dist/girls-band-live.html` 与根 `index.html`，两者字节一致；连续两次 SHA-256 相同 | exit 0 ×2；均 1,084,885 B；sha 两次一致 `25422f523607…` | [x] 通过 |
| 4 | `npm run validate` | 退出码 0；输出含 `validate: 14/14 rules passed` | `14/14 rules passed（1059.5 KiB，sha256 25422f523607）` | [x] 通过 |

补充（已完成）：

- [x] `node tools/check-layers.mjs` → `84 files, 0 violations`（t147）。
- [x] 定向测试：`f3-bot` 4/4、`seat-layout` 21/21、`modifier-wiring` 8/8、`light` 12/12、`levelup` 1/1、`opening-grace` 2/2 → 6 文件 / 48 用例全过（t145）。
- [x] 失败处理：无失败项；若后续任何命令失败，不得用脚本绕过或改测试，按 tech-spec §17.2 变更流程修复后重跑全部四项。

> 记录模板：命令、时间、退出码、关键输出、执行人（t144/t145/t147 已留存）。

---

## 3. 单文件与体积

- [x] `dist/girls-band-live.html` 存在：**1,084,885 B（1,059.5 KiB，1.034 MiB）**，**≤2 MiB 目标**，远低于 4 MiB 硬上限。
- [x] 根 `index.html` 与 `dist/girls-band-live.html` **字节一致**（SHA-256 相同 `25422f52…`）。
- [x] `npm run build` 连续两次，`dist/girls-band-live.html` SHA-256 完全一致（AC-T10）。
- [x] `validate` R1–R14 全过（自包含、单一内联 module、无外链、无字体、无 sourcemap、无 crossorigin/integrity、版本元信息、分层、确定性）。
- [x] 构建元信息为 `girls-band-live v1.0.1 build:inline`（页面内读取确认）。
- [x] 产物包含 React / Three 的 MIT 声明（`legalComments: 'eof'`）。
- [x] 无 `dist/assets/**`、`dist/index.html` 等 Vite 中间产物被误当作发布物；Release 附件只放 `dist/girls-band-live.html`。
- [x] `package-lock.json` 与 `package.json` 一致；未新增依赖；`node_modules/` 未提交。

---

## 4. `file://` 冒烟（v1.0.1 最终构建）

浏览器矩阵：**Edge 已实测**（t145/t146/t147）；Chrome 已有 v1.0.0/v1.0.1 历史；Firefox 本机未安装 → 已知限制。

- [x] 双击 `dist/girls-band-live.html`（或拖入浏览器）进入启动屏 → 主菜单；favicon 内联无 404。
- [x] 主菜单 → 今晚的曲目单 → 排练室（3 页）→ 设置 → 制作名单 → 返回，均可用。
- [x] 序曲 0–30s 三步教学（散光养人 / 束光烧人 / 点击点燃）+ 三形态常驻格出现。
- [x] 开始演出：舞台、HUD、四区亮灯比例、趋势、光池出现；局内 HUD **0 数字**。
- [x] `WASD` 移动、鼠标移光、左键束光/点燃、`E` 插线、`Space` 终曲长按均有响应。
- [x] 键盘等价：`IJKL` 移光、`Shift` 束光、`Enter` 点燃、`1/2/3` 选卡；t146 **0 指针**完成 9:30。
- [x] 升级三选一：首轮 3 核心可读；完整局 picks=10（t145）；纯键盘局 9 次选卡（t146）。
- [x] `Esc` 暂停/继续；`Tab` 打开构筑并聚焦；失焦/切后台自动暂停；空场也可暂停。
- [x] 至少完成 **1 局完整 9:30**（`ending=complete`，grade B、peak 356，t145），结算与 `RunResult` 一致；再演一场回到序曲（t=0.5、picks=0、core=null）。
- [x] 空场/安可路径：人气归零先出安可窗口；继续独奏 → 空场 → 结算（t145/t146）。
- [x] 设置修改后刷新仍保留；手动破坏 `gbl.save.v1` 后启动正常并生成 `.bad`（历史验证）。
- [x] 断网（DevTools offline / 拔网线）后仍可启动到演出（t111 历史）。
- [x] DevTools Console：**0 条错误/未捕获异常**（t145/t147 两路径均 0）。
- [x] Network：除 `file://` 文档自身外 **0 个请求**；无 `http(s)` / CDN / 字体下载（各 1 条文档请求）。
- [x] WebGL2 缺失提示页文案正确、不白屏（t111）。
- [x] WebGL 上下文丢失/恢复提示正确，恢复后继续绘制（t111）。
- [x] 窗口缩放：Chrome 5 档 / Edge 5 档 css==inner、viewport==backing，无刷新（t115）。
- [x] 小窗口：900×560 ViewportGate（仍然继续 / 回主菜单）；1280×720 无 Gate（t145/t146）。
- [x] 分辨率：1280×720、1366×768、1920×1080 无布局溢出、HUD 无越界；800×600 显示"窗口太小了"提示（t111/t115）。
- [x] 高对比 / 减少动态 / 低闪 / 节拍脉冲四项立即生效且刷新保留（t111/t143）。
- [x] 失焦自动暂停：blur / visibilitychange → paused + 暂停面板（t143/t145 模拟；真实 OS 切窗由 t135 人测）。
- [ ] Firefox 实机（本机未安装，未测）→ 已知限制。
- [ ] 失败卡/中断局、三构筑各一局、三进化、S/A 边界（未专门构造）→ 已知限制。
- [x] 截图归档：`docs/qa/shots/verification-v101/`（14 张）、`docs/qa/shots/playtest-v101/`（7 张）、`docs/reports/optimization-ui-shots/`。

---

## 5. GitHub Release（制作人执行）

- [ ] 代码冻结后，制作人提交：`chore(release): v1.0.1`（已有 `m6-rc`、`v1.0.0`）。
- [ ] annotated tag `v1.0.1`，tag 指向发布提交。
- [ ] Release 标题：`《谁在听》 v1.0.1`；正文使用 [release-notes-v1.0.1](release-notes-v1.0.1.md)（含修复亮点与 defer）。
- [ ] 附件：`dist/girls-band-live.html`（建议重命名为 `who-is-listening-v1.0.1.html`，命名需与 Release 正文一致）。
- [ ] Release 正文写明附件 SHA-256 `25422f52…`、文件大小（1,084,885 B / 1,059.5 KiB）、平台要求（桌面 + WebGL2）、离线说明。
- [ ] 下载附件到另一目录，核对 SHA-256 与大小一致，并 `file://` 打开一次。
- [ ] **不要**把 `dist/assets/**`、`node_modules`、QA 截图压缩包作为 Release 附件（除非用户要求）。
- [ ] Release 发布后，在 Issue 评论 commit / tag / 附件哈希，关闭对应 Milestone/Issue。

---

## 6. GitHub Pages（已上线；v1.0.1 更新）

> 仓库已公开、Pages 已上线（当前 v1.0.0）。v1.0.1 发布后更新同一 URL。

- [x] 确认 Pages 源：`Deploy from a branch` / `main` / `/ (root)`。
- [ ] v1.0.1 发布后确认根 `index.html` 为 `25422f52…`，部署完成。
- [ ] 访问 https://yanyoo2000.github.io/girls-band-live/ ，核对构建注释 `v1.0.1`，完成启动 → 主菜单 → 演出 → 暂停 → 结算冒烟。
- [ ] 若缓存未更新，强刷或等待 Pages 部署；必要时在 Settings → Pages 手动重新发布。
- [ ] 检查 URL 无 404、无混合内容、无外部请求。
- [ ] 在 README 与 Release 中记录在线 URL。
- [ ] 若部署异常且无法及时修复，发布说明明确"在线版暂为 v1.0.0，附件为 v1.0.1"。

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

- [x] [README.md](../README.md)：v1.0.1 状态、在线 URL、单文件打开、操作（键盘/失焦/Tab）、玩法、四命令、36 人/M1–M7、已知 defer。
- [x] [CHANGELOG.md](../CHANGELOG.md)：新增 `[1.0.1]` 条目（Added/Changed/Fixed/Known issues/Verification/Upgrade），保留 v1.0.0 历史。
- [x] [docs/release-notes-v1.0.1.md](release-notes-v1.0.1.md)：GitHub Release 用玩家说明（下载/在线、改了什么、操作、验证、defer、升级）。
- [x] [docs/reports/v1.0.1-release.md](reports/v1.0.1-release.md)：最终产物、四命令、file://、版本对比、defer、证据索引、风险。
- [x] `package.json` → `"version": "1.0.1"`（已确认）。
- [x] 构建元信息 `girls-band-live v1.0.1 build:inline` 出现在单文件中。
- [x] 根 `index.html` 由最终构建生成，与 dist 单文件同 sha。
- [x] [docs/qa/verification-report-v101.md](qa/verification-report-v101.md)、[docs/qa/playtest-report-v101.md](qa/playtest-report-v101.md) 存在且与产物 sha 一致。
- [x] [docs/gdd.md](gdd.md) §26、[docs/acceptance.md](acceptance.md) §8、[docs/tech-spec.md](tech-spec.md) §6.1/§19 已同步 v1.0.1 口径；锁定数量未改。
- [x] 发布说明列出所有 **defer / 未人测** 项，不把"机器通过"写成"验收全绿"。

---

## 10. 发布后验证

- [ ] 从 Release 下载附件 → 核对 SHA-256 `25422f52…` 与大小 → `file://` 打开 → 完成一局到结算（或至少启动 + 演出 30 秒）。
- [ ] 访问 Pages URL → 核对构建注释 `v1.0.1` → 启动 → 演出 30 秒 → 暂停 → 关闭；记录 URL 与时间。
- [ ] 检查 Release 附件下载不需要登录。
- [ ] 在 Issue 记录：tag、commit、附件哈希、四命令结果、在线 URL、时间、执行人。
- [ ] 归档本次发布证据（命令输出、截图、哈希）到 `docs/qa/release/` 或 Release 正文。
- [ ] 通知用户发布完成与已知 defer。

---

## 11. 回滚预案

- [x] 保留上一版本作为回滚候选：v1.0.0 `2d2d91c2670b…`（1,045,498 B，已发布）。
- [x] 记录最终候选 SHA-256 `25422f52…` 与四命令结果。
- [ ] 若发布后发现 P0（无法启动 / 存档损坏 / 严重性能问题）：立即在 Release 标记 `pre-release` 或 yank，并发布说明；回退 Pages 到 v1.0.0 构建。
- [ ] 修复后重新走第 1–4 节，发布 `v1.0.2`，不覆盖 `v1.0.1` tag。

---

## 12. 签核

| 角色 | 负责项 | 签核人 | 日期 | 结论 |
| --- | --- | --- | --- | --- |
| 发行经理 | 第 2–4、7–9、10 节文档与检查表 | release-manager | 2026-10-28 | **完成**（README/CHANGELOG/release-notes-v1.0.1/v1.0.1-release/checklist） |
| 技术总监 | 第 1–4 节修复与构建冻结 | tech-director | 2026-10-28 | t144 完成（v1.0.1 候选） |
| QA | 第 1、4 节回归与报告 | qa-automation / qa-playtester / qa-compat | 2026-10-28 | t145 验证 + t146 实机复测完成 |
| 代码审查 | 第 1 节 review pass | code-reviewer | 2026-10-28 | t147 PASS（0 blocker/high） |
| 制作人 | 第 1、5、6、10、11 节提交/Release/Pages | producer | _待_ | tag/Release/Pages 待执行 |
| 用户 | 许可证、附件命名 | 用户 | _待_ | **待确认** |
