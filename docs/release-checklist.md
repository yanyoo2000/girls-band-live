# 发布检查表 / Release Checklist — v1.0.0

> **用途**：M7 发行前逐项签核。每项都必须有"命令输出 / 报告路径 / 截图 / 哈希"作为证据，不接受"感觉没问题"。
> **执行边界**：本表由发行经理维护；`git add/commit/tag/push`、GitHub Release、Pages 由制作人执行；仓库公开、许可证与 Pages 上线必须由**用户明确确认**。
> **当前状态**：草稿（2026-10-28）。M6 收尾修复（t115 / t117）尚未完成，**本表未全部通过，当前构建不是发布版**。

## 0. 发布身份

| 项 | 值 |
| --- | --- |
| 产品名 | 《谁在听》 / WHO'S LISTENING |
| 版本 | `v1.0.0`（草稿；`package.json` 当前仍为 `0.1.0`） |
| 发布物 | `dist/girls-band-live.html`（单文件、离线、`file://` 可玩） |
| 仓库入口 | 根 `index.html`（构建生成，与 dist 单文件字节一致，供 Pages 使用） |
| 目标平台 | 桌面 Chrome / Edge / Firefox（最新两个大版本），WebGL2，1280×720 起 |
| 默认分支 | `main` |
| 当前候选构建 | `1,043,675 B`（1019.2 KiB），SHA-256 `A220C425A6A00B5F716F7A4A9151148FFC2611FCFF7F6E3716ABFB64C2DF52D4`，2026-10-28（M6 修复期间中间构建；05:33/05:46 同哈希） |
| 最近全绿构建 | `1,041,592 B`（1017.2 KiB），SHA-256 `307d4e709c50…`（t113） |
| 发布冻结哈希 | _待最终构建回填_ |

---

## 1. 发布门禁（阻塞项）

> 全部勾选前**不得**打 tag、不得上传 Release 附件、不得开启 Pages。

- [ ] **t115 完成**：窗口缩放 canvas 自锁（COMPAT-1）、白光下 HUD 对比度（COMPAT-2）修复并复测。
- [ ] **t117 完成**：开局惩罚（H1）、相机遮挡（H3）、白光遮挡（H4）、1:12 钩子（H2）、结算读数（t110-M2/M3）、升级节奏（t110-M5）、Tab 构筑（t110-M6）等待修复项。
- [ ] **t118 回归**：Gameplay 修复后的实机复测报告存在，且无新增 blocker/high。
- [ ] **t119 代码审查 pass**：`code-reviewer` 对当前字节的 review verdict = pass；findings 全部关闭或有书面豁免。
- [ ] **t109 / t111 结论重新绑定当前字节**：两份 QA 报告验证的是旧构建；delivery 已提示 `src/App.tsx`、`src/game/save.ts`、`src/main.tsx`、`src/styles/base.css`、`src/styles/ui.css`、`src/three/renderer.ts`、`src/ui/bridge.ts`、`src/ui/components/Hud.tsx`、`src/ui/screens/BootScreen.tsx` 等已变化，必须重跑受影响的四命令与 `file://` 冒烟。
- [ ] **代码冻结**：冻结后只允许发布相关文档改动；任何源码改动都要重新走第 2–4 节。
- [ ] **用户确认**：项目许可证、仓库是否公开、是否开启 GitHub Pages（见第 5、6 节）。
- [ ] **最终验收**：制作人 `docs/reports/final-acceptance.md`（或等价记录）签署 v1.0.0。

---

## 2. 四命令（命令契约不可改名）

| # | 命令 | 通过标准 | 证据留存 | 结果 |
| --- | --- | --- | --- | --- |
| 1 | `npm run typecheck` | 退出码 0，0 错误；覆盖 `src/**`、`tests/**`、`tools/**` | 完整输出贴入发布记录 | [ ] 待冻结后重跑 |
| 2 | `npm test` | 退出码 0；24 个测试文件 / ≥264 用例全过；无 `skip` / `todo` / `only` | 末尾 `Test Files` / `Tests` 行 | [ ] 待冻结后重跑 |
| 3 | `npm run build` | 退出码 0；产出 `dist/girls-band-live.html` 与根 `index.html`，两者字节一致；连续两次 SHA-256 相同 | 两次构建输出 + `Get-FileHash` | [ ] 待冻结后重跑（连续两次） |
| 4 | `npm run validate` | 退出码 0；输出含 `validate: 14/14 rules passed` | 完整 validate 输出 | [ ] 待冻结后重跑 |

补充（可选但建议）：

- [ ] `node tools/check-layers.mjs` → `0 violations`（分层证据）。
- [ ] `npm test -- tests/f3-bot.test.ts`（或 `npx vitest run tests/f3-bot.test.ts`）→ 4/4；驻守 ≤18、扫场 ≥36。
- [ ] 若任何命令失败：**不得**用脚本绕过或改测试；按 tech-spec §17.2 变更流程修复后重跑全部四项。

> 记录模板：命令、时间、退出码、关键输出、执行人。

---

## 3. 单文件与体积

- [ ] `dist/girls-band-live.html` 存在，体积 **≤2 MiB（目标）**，硬上限 **4 MiB**；记录实际字节数。
- [ ] 根 `index.html` 与 `dist/girls-band-live.html` **字节一致**（SHA-256 相同）。
- [ ] `npm run build` 连续两次，`dist/girls-band-live.html` SHA-256 完全一致（AC-T10）。
- [ ] `validate` R1–R14 全过（自包含、单一内联 module、无外链、无字体、无 sourcemap、无 crossorigin/integrity、版本元信息、分层、确定性）。
- [ ] 构建元信息为 `girls-band-live v1.0.0 build:inline`（当前为 `v0.1.0`，**发布前必须升版本**）。
- [ ] 产物包含 React / Three 的 MIT 声明（`legalComments: 'eof'`），未被压缩工具删除。
- [ ] 无 `dist/assets/**`、`dist/index.html` 等 Vite 中间产物被误当作发布物；Release 附件只放单文件。
- [ ] `package-lock.json` 已提交且与 `package.json` 一致；`node_modules/` 未提交。

---

## 4. `file://` 冒烟（发布前最后一轮）

浏览器矩阵：**Chrome 与 Edge 必测**；Firefox 尽力（本机当前未安装，见已知限制）。

- [ ] 双击 `dist/girls-band-live.html`（或拖入浏览器）能进入启动屏 → 主菜单。
- [ ] 主菜单 → 今晚的曲目单 → 排练室（3 页）→ 设置 → 制作名单 → 返回，均可用。
- [ ] 开始演出：舞台、HUD、四区热度点、段位点出现；局内 HUD **0 数字**。
- [ ] `WASD` 移动、鼠标移光、左键束光/点燃、`E` 插线、`Space` 终曲长按均有响应。
- [ ] 升级三选一：第 1 次选卡后回到演出，构筑条更新；一局最多 10 次。
- [ ] `Esc` 暂停/继续；失焦冻结/降音；`Tab` 与 HUD 提示一致（t110-M6 修复后）。
- [ ] 至少完成 **1 局完整 9:30**（`ending=complete`），结算数据与 `RunResult` 逐项一致；再演一场回到序曲。
- [ ] 再完成 **1 局空场**（`ending=empty-house`）路径，结算可重开。
- [ ] 设置修改后刷新仍保留；手动破坏 `gbl.save.v1` 后启动正常并生成 `.bad`。
- [ ] 断网（DevTools offline / 拔网线）后仍可启动到演出。
- [ ] DevTools Console：**0 条错误/未捕获异常**（允许 three 的 context lost/restored info 日志，仅手动触发时）。
- [ ] Network：除 `file://` 文档自身外 **0 个请求**；无 `http(s)` / CDN / 字体下载。
- [ ] WebGL2 缺失提示页（可用 devtools 覆盖 `getContext` 模拟）文案正确、不白屏。
- [ ] WebGL 上下文丢失/恢复提示正确，恢复后继续绘制。
- [ ] 窗口缩放：1600 ↔ 1880 ↔ 1200 下 canvas 跟随视口（COMPAT-1 修复后复测）。
- [ ] 分辨率：1280×720、1366×768、1920×1080 无布局溢出、HUD 无越界；800×600 显示"窗口太小了"提示。
- [ ] 高对比 / 减少动态 / 低闪 / 节拍脉冲四项立即生效且刷新保留。
- [ ] 键盘全流程：仅用 Tab / Shift+Tab / Enter / Space / Esc 完成"开始 → 升级选择 → 结算 → 重开"。
- [ ] 截图归档：每项至少 1 张，存 `docs/qa/shots/release/`（新建目录）或在发布记录中列出路径。

---

## 5. GitHub Release（制作人执行）

- [ ] 代码冻结后，制作人提交：`chore(release): M7 v1.0.0`。
- [ ] annotated tag `v1.0.0`，tag 指向发布提交。
- [ ] Release 标题：`《谁在听》 v1.0.0`；正文使用 [CHANGELOG 的 1.0.0 节](../CHANGELOG.md) 并附「已知限制 / 未人测项」。
- [ ] 附件：`dist/girls-band-live.html`（可重命名为 `who-is-listening-v1.0.0.html`，命名需与 Release 正文一致）。
- [ ] Release 正文写明附件 SHA-256、文件大小、平台要求（桌面 + WebGL2）、离线说明。
- [ ] 下载附件到另一目录，核对 SHA-256 与大小一致，并 `file://` 打开一次。
- [ ] **不要**把 `dist/assets/**`、`node_modules`、QA 截图压缩包作为 Release 附件（除非用户要求）。
- [ ] 仓库可见性：当前为 private；**转公开需用户确认**（会暴露全部历史与文档）。
- [ ] Release 发布后，在 M7 Issue 评论 commit / tag / 附件哈希，关闭 Issue 与 Milestone。

---

## 6. GitHub Pages（需用户明确确认后才做）

> 默认**不做**。未确认时只交付本地单文件与 Release 附件。

- [ ] 用户书面确认：仓库公开 + 开启 Pages。
- [ ] 仓库 Settings → Pages：Source = `Deploy from a branch`，Branch = `main`，Folder = `/ (root)`。
- [ ] 根 `index.html` 是内联单文件，无相对资源 404；访问 URL 能进入启动屏。
- [ ] 在 Pages URL 上完成一次 `file://` 等价冒烟（启动 → 主菜单 → 演出 → 暂停 → 结算）。
- [ ] 检查 URL 无 404、无混合内容、无外部请求。
- [ ] 在 README 与 Release 中记录 Pages URL。
- [ ] 若用户未确认：在发布说明中明确"未上线 Pages，仅提供离线单文件"。

---

## 7. 原创素材复核

- [ ] **零外部素材**：产物无 `<img>` / `<audio>` / `<video>` / `<link rel="icon">` / `@font-face` / `.woff` / `.ttf` / glTF / GLB / 第三方音频；`validate` R6–R9 全过。
- [ ] 所有视觉为 Three.js 基础几何 + 程序化材质 + CanvasTexture / SVG；`src/assets/procedural.ts` 为唯一资产来源。
- [ ] 所有音乐 / 音效为 WebAudio 实时合成；无采样音频文件、无第三方 loop。
- [ ] 字体仅使用系统字体栈（PingFang SC / Microsoft YaHei / Noto Sans SC / system-ui 等），未打包字体。
- [ ] 文案、角色名（江栖 / 许燎 / 闻笙 / 邵砚）、乐队名（留声）、场馆（B2 旧货仓）、曲目（《再亮一会儿》）、Boss / 精英 / 噪音命名均为本项目原创。
- [ ] 未使用现实乐队、歌曲、专辑封面、人物肖像、商标或既有 IP 的素材 / 近似复制；未参考任何具体作品的角色/UI。
- [ ] 依赖许可证复核：`react`、`react-dom`、`three`（MIT）；`vite`、`vitest`、`@vitejs/plugin-react`（MIT）；`typescript`（Apache-2.0）；`@types/*`（MIT）。`legalComments` 保留 MIT 声明。
- [ ] 项目自身许可证已选定并添加 `LICENSE` 文件（**待用户确认**：MIT / Apache-2.0 / CC BY-NC 等）。
- [ ] QA 截图 / 录屏可公开（无个人隐私、无系统通知、无第三方内容）；如需附在 Release，先逐张检查。
- [ ] 构建工具与运行时无远程字体/统计/埋点；`gbl.save.v1` 仅本地保存设置与记录。

---

## 8. 命名查重

检查对象：中文名《谁在听》、英文名 **WHO'S LISTENING**、乐队「留声」、曲目《再亮一会儿》、仓库名 `girls-band-live`。

- [ ] 在 **Steam / itch.io / App Store / Google Play** 检索中英文名，记录是否重名或近似。
- [ ] 在 **Google / B 站 / 微博 / 小红书** 检索中文名，记录同名作品/账号。
- [ ] 在 **中国商标网 / USPTO** 做初步检索（正式商标检索建议委托专业机构，本表不构成法律意见）。
- [ ] 若撞名：使用 GDD 备用标题《还亮着》或《灯下有人》，不改玩法；同步更新 README / CHANGELOG / 构建标题。
- [ ] 检查仓库名与游戏名是否一致；GitHub 仓库名 `girls-band-live` 已存在（开发期），发布前确认名称策略。

**初步检索记录（2026-10-28，仅供内部参考，非法律意见）**：

- 未发现同名电子游戏《谁在听》或 WHO'S LISTENING（初步检索未发现 Steam / itch.io 方向的冲突结果）。
- 存在近名但不同类的作品：教育桌游 [Look Who's Listening!](https://www.superduperinc.com/look-whos-listening.html)、公民科学项目 [Who's Listening?（SciStarter / Dark Sky）](https://darksky.scistarter.org/whos-listening)、Ludum Dare 59 作品 [SOMEONE IS LISTENING](https://ldj.am/59/someone-is-listening)。均不构成直接同名冲突，但建议发布前人工复核商店与商标库。
- 备用标题：**《还亮着》**、**《灯下有人》**（GDD 指定，仅发行期撞名替换用）。

---

## 9. 文档与版本一致性

- [ ] [README.md](../README.md)：与最终构建一致（版本、大小、哈希、已知限制、操作键位）。
- [ ] [CHANGELOG.md](../CHANGELOG.md)：`1.0.0` 日期、构建哈希、已修复/未修复项与最终状态一致。
- [ ] `package.json` → `"version": "1.0.0"`（当前 `0.1.0`），重新 `npm install --package-lock-only` 或确认 lockfile 无需变化。
- [ ] 构建元信息 `girls-band-live v1.0.0 build:inline` 出现在单文件中。
- [ ] 根 `index.html` 由最终构建重新生成。
- [ ] [docs/reports/m7-release-draft.md](reports/m7-release-draft.md)：状态、待修项、发布步骤与最终一致。
- [ ] [docs/gdd.md](gdd.md)、[docs/tech-spec.md](tech-spec.md)、[docs/acceptance.md](acceptance.md) 中的白光口径、反驻守规则、和弦表、失败卡时长与实现一致（t107 / t113 已同步，发布前复核）。
- [ ] 发布说明列出所有 **blocked / 未人测** 项，不把"机器通过"写成"验收全绿"。

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

- [ ] 若发布后发现 P0（无法启动 / 存档损坏 / 严重性能问题）：立即在 Release 标记 `pre-release` 或 yank，并发布 `v1.0.0` 撤回说明。
- [ ] 保留上一构建（`1,041,592 B / 307d4e70…`）作为回滚候选，记录其验证范围。
- [ ] Pages 回滚：关闭 Pages 或回退到上一提交；确认旧 URL 不再提供可玩版本。
- [ ] 修复后重新走第 1–4 节，发布 `v1.0.1`，不覆盖 `v1.0.0` tag。

---

## 12. 签核

| 角色 | 负责项 | 签核人 | 日期 | 结论 |
| --- | --- | --- | --- | --- |
| 发行经理 | 第 2–4、7–9、10 节文档与检查表 | release-manager | 2026-10-28 | 草稿 |
| 技术总监 | 第 1–4 节修复与构建冻结 | tech-director | _待_ | _待_ |
| QA | 第 1、4 节回归与报告 | qa-automation / qa-playtester / qa-compat | _待_ | _待_ |
| 代码审查 | 第 1 节 review pass | code-reviewer | _待_ | _待_ |
| 制作人 | 第 1、5、6、10、11 节提交/Release/最终验收 | producer | _待_ | _待_ |
| 用户 | 许可证、仓库公开、Pages | 用户 | _待_ | _待_ |
