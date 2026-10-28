# M7 发布记录 / Release Notes — v1.0.0

- **日期**：2026-10-28（Asia/Shanghai）
- **作者**：release-manager（t126）
- **性质**：M7 发行包装最终记录。**只改文档，不重建产物、不运行 git、不安装依赖、不部署。**
- **对象**：v1.0.0 发布候选 `dist/girls-band-live.html`（= 根 `index.html`），**1,045,498 B（1,021.0 KiB）**，SHA-256 `2d2d91c2670bb447ad27d27950a627502d1aa9e7ffbd6aa6bdf14768014e0079`。
- **取代关系**：本文件取代 `docs/reports/m7-release-draft.md`（旧草稿保留作历史）；发布门禁依据 [m6-gate](m6-gate.md)、[m6-rc](m6-rc.md)、[t123 审查](m6-rc.md) 与 t118/t122 复测。

---

## 0. 结论

**v1.0.0 发行包装（文档侧）完成，可以进入 tag / Release 流程。**

- 产物已冻结：`1,045,498 B / 2d2d91c2…`；`package.json` version = `1.0.0`；构建元信息 `girls-band-live v1.0.0 build:inline`。
- 四命令全绿（typecheck 0 / test 26 文件 268 用例 / build ×2 同 SHA / validate 14/14）；`file://` 正式路径与快进结算均通过，console 0、Network 仅 1 条文档请求。
- t123 代码审查 **PASS**；t125 M6 门禁 **通过，无 blocker/high**。
- 发布前 5 项收尾已处理：F1 acceptance 动画峰值注记、F2 verification-report 旧版注记、F3 acceptance 测试文件名、F4 评级/序曲口径（写入本文件 Release notes）、F5 暂停面板构筑（写入已知限制）。
- **仍需用户确认 3 项**：仓库是否公开、是否开启 GitHub Pages、项目许可证；**仍需制作人执行**：commit、`v1.0.0` tag、GitHub Release 附件上传。

---

## 1. 最终产物与验证

| 项 | 值 |
| --- | --- |
| 产品名 | 《谁在听》 / WHO'S LISTENING |
| 版本 | **1.0.0** |
| 发布物 | `dist/girls-band-live.html`（单文件、离线、`file://` 可玩） |
| 根入口 | `index.html`（与发布物字节一致，供 Pages 使用） |
| 大小 | **1,045,498 B（1,021.0 KiB / 0.997 MiB）** ≤2 MiB 目标 |
| SHA-256 | **`2d2d91c2670bb447ad27d27950a627502d1aa9e7ffbd6aa6bdf14768014e0079`** |
| 构建元信息 | `<!-- girls-band-live v1.0.0 build:inline -->` |
| 两次构建 | 均 exit 0；字节与 SHA-256 完全一致（t124/t125） |
| `npm run typecheck` | exit 0 |
| `npm test` | 26 文件 / 268 用例 / 0 失败 |
| `npm run build` | exit 0 ×2（产出 dist + 根 index） |
| `npm run validate` | 14/14 rules passed（1021.0 KiB，sha256 `2d2d91c2670b`） |
| `node tools/check-layers.mjs` | 83 files, 0 violations |
| `file://` 正式路径（t125） | 启动 → 主菜单 → 演出（7/15/63s）→ 升级三选一（选「回照」）→ 暂停 → 回主菜单 → 离开确认；console 0 条、Network 仅 1 条文档请求 |
| `file://` 快进结算（t125） | 37,200 tick → results、complete、570.0s、picks=10；结算与 `RunResult` 一致；再演一场正常 |
| H1 开场路径 | 8 秒内无返听锁定/过热（t125）；t122 冷启 5/5 |
| 兼容 | Chrome/Edge 六档分辨率、窗口缩放、离线、键盘/焦点、WebGL2 缺失/上下文恢复通过（t111/t115）；Firefox 未实机 |
| 审核/门禁 | t123 审查 PASS（0 blocker/high）；t125 M6 门禁 PASS |
| 依赖 | 未新增；运行时仅 react/react-dom/three；`package-lock.json` 一致 |

> 产物固化于 2026-10-28 09:38（mtime），文档修改不影响 sha；发布时不得重新构建，除非重新走完整四命令并更新本文件。

---

## 2. 发布步骤

> 详细勾选项见 [docs/release-checklist.md](../release-checklist.md)。

0. **文档准备（已完成）**：README / CHANGELOG / release-checklist / 本文件；F1–F5 收尾。
1. **确认代码冻结**：v1.0.0 只允许文档改动；业务代码与 t123 审查版一致，`package.json` 仅 version 变更。
2. **tag 前复核**：`Get-FileHash` 确认 `dist/girls-band-live.html` 与根 `index.html` 仍为 `2d2d91c2…`、1,045,498 B；若字节变化，停止发布并重跑四命令 + `file://` 冒烟。
3. **用户确认**（阻塞）：仓库是否公开、是否开启 Pages、项目许可证（见 §3）。
4. **提交**：制作人 `chore(release): M7 v1.0.0`（M6 已打 `m6-rc`）。
5. **打 tag**：annotated `v1.0.0`，指向发布提交。
6. **GitHub Release**：标题《谁在听》v1.0.0；正文 = CHANGELOG 摘要 + §5 Release notes（10 条已知限制）；附件 = `dist/girls-band-live.html`（建议重命名 `who-is-listening-v1.0.0.html`，与正文一致）；写明 SHA-256、大小、平台要求、离线说明。
7. **下载验证**：从 Release 下载附件 → 核对 SHA-256 与大小 → `file://` 启动到演出（至少 30 秒）或完成一局。
8. **Pages（仅用户确认后）**：仓库 Settings → Pages → Source `Deploy from a branch` / `main` / `/ (root)`；验证 URL 无 404、可启动；在 README 与 Release 记录 URL。未确认则不做，并在发布说明写明。
9. **发布后归档**：M7 Issue 记录 tag/commit/附件哈希/四命令/Pages URL；归档证据到 `docs/qa/release/`；关闭 Issue/Milestone；通知用户已知限制。
10. **回滚**：若发现 P0，Release 标 `pre-release` / yank，修复后发 `v1.0.1`，不覆盖 `v1.0.0` tag；保留 t123 审查版 `877ac242…` 作为回滚候选。

**负责人**：文档（release-manager，已完成）；冻结/四命令/file://（tech-director / QA，t124/t125 已完成）；审查（code-reviewer，t123 PASS）；提交/tag/Release/Pages（producer）；确认（用户）。

---

## 3. 待用户确认项

| # | 事项 | 现状 | 需要用户决定 | 影响 |
| --- | --- | --- | --- | --- |
| U1 | 仓库是否公开 | 当前 private（`yanyoo2000/girls-band-live`） | 公开 / 保持私有 | 公开才能让 Release 附件免登录下载；公开会暴露全部历史与文档 |
| U2 | 是否开启 GitHub Pages | 未开启 | 开启 / 不开启 | 开启后根 `index.html` 可直接在线试玩；需仓库公开 |
| U3 | 项目许可证 | 未选择、无 `LICENSE` | MIT / Apache-2.0 / CC BY-NC / 其他 | 决定他人可如何使用、分发与商用 |
| U4 | 命名与商标 | 初检未发现同名电子游戏；有近名非游戏作品 | 是否委托正式商标检索 | 若撞名，使用备用标题《还亮着》/《灯下有人》，不改玩法 |
| U5 | Release 附件命名 | 待定 | `who-is-listening-v1.0.0.html` 或保留 `girls-band-live.html` | 仅影响下载文件名，不影响内容 |

---

## 4. 发布前收尾（captain 2026-10-28 指示）

| ID | 事项 | 处理 | 状态 |
| --- | --- | --- | --- |
| F1 | acceptance AC-F08 补「whiteout 动画峰值 0.957–1.000，静态上限 0.85」 | 已写入 [acceptance](../acceptance.md) AC-F08 | ✅ 完成 |
| F2 | `docs/qa/verification-report.md` 仍是 t109 旧版（AC-F08 fail） | 文首加「t109 旧版，已被 t113/t123 取代；AC-F08 结论按 t113」注记 | ✅ 完成 |
| F3 | acceptance AC-08/AC-H02 的 `tests/anti-camp.test.ts` 文件名 | 改为实际 `tests/f3-bot.test.ts`（注明等价 anti-camp） | ✅ 完成 |
| F4 | REV-M3（160=C / B 需 300）与 REV-M4（序曲 45s 回满） | 本文件 §5 写为「刻意设计 / 已知 P1」并给理由；CHANGELOG Known issues 同步 | ✅ 完成 |
| F5 | 暂停面板「当前构筑」在已选核心后仍显示「还没有拿到卡」 | 写入已知限制（low，不阻塞 v1.0.0）；HUD 核心显示正确 | ✅ 完成 |

---

## 5. Release notes（可直接粘贴到 GitHub Release；按 m6-gate §6 的 10 条）

### 已知限制 / Known limitations

1. **90 秒真人门未做**：AC-13 / AC-H01 需要 10 名外部新玩家，≥7 人在 90 秒内主动移光；现有证据为 AI 试玩、冷启采样与 bot 埋点，**不能替代真人样本**。
2. **音频听感 / 盲听 A/B 未人测**：5 层音乐、12 声部合唱、12 SFX 的听感、静默段与「少一轨是否疼」未由人耳验证；无 `docs/qa/audio-report.md`。
3. **性能仅采样级**：t111 约 130fps（RTX 4080）；1920×1080、连续 3 局、集显/低画质未正式测。
4. **W 边界相机构图**：台面/成员/观众/荧光棒可见，但画面底部约 55% 接近黑色（t122 medium）。
5. **升级曲线前重后空**：10 次三选一集中在 3:48 内，之后 5:42 没有新的构筑推进（t122 medium）。
6. **评级可达性（REV-M3，刻意设计 / 已知 P1）**：常规扫场+点燃约 160 人 = C，B 需终场 ≥300。**理由**：评级刻度奖励「养人/唱化」而非单纯扫场击杀；C 是常规打法基线，B 及以上要求把观众养到 300+（与 GDD §13.5 一致）。制作人口径（2026-10-28）确认为刻意设计，待 90 秒真人门与玩家反馈后再评估；若玩家普遍读成「只有唱化流可玩」，P1 调整提示或阈值。
7. **序曲可逆空场（REV-M4，刻意设计 / 已知 P1）**：驻守把 30 人打到 4 后，45 秒扫场可回满 30，序曲 F3 代价偏弱。**理由**：序曲是教学/邀请段（GDD §14 温柔开局），设计上不允许第一分钟即锁死失败；反驻守主要针对中后段驻守（返听/过热在有噪音时生效）。制作人口径确认为刻意设计，P1 观察是否需要为中后段补强。
8. **H2 等价钩子位置**：1:12 荧光棒位于 back-right 第一排最右端（1.7m），非 GDD 原文第 24 排——固定 45°/22° 相机看不到第 24 排；GDD §14 与 acceptance AC-13/AC-F04 已同步等价处理。
9. **whiteout 临界动画峰值**：HUD 内联静态上限 0.85，临界态动画峰值可达 0.957–1.000（表现层脉动）；验收按动画峰值注明。`dwellRewardRatio` 负值 = 停住期人气净下降，属预期证据，不是阈值失败。
10. **暂停面板构筑区不列已选核心（F5）**：已选核心后仍显示「还没有拿到卡。第一次升级会先选核心。」（low；HUD 核心显示正确）；`Tab` 打开暂停面板与 HUD「Tab 看构筑」提示不完全一致（t110-M6 未修）。

**其他未覆盖**：Firefox 未实机；失败卡/中断局、三构筑各一局、三进化、评级边界、静默可读性、高对比/色觉复述未专门构造；仅桌面，不做移动端/触屏/手柄。

### 安装与运行

- 下载 `dist/girls-band-live.html`（或 Release 附件），双击或拖入 Chrome / Edge / Firefox；需要 WebGL2 与硬件加速；窗口 ≥1280×720（最小 1024×640）。
- 无需联网、无需安装；只在浏览器 `localStorage` 的 `gbl.save.v1` 保存设置与记录。
- 校验：`Get-FileHash -Algorithm SHA256 <文件>` 应为 `2d2d91c2670bb447ad27d27950a627502d1aa9e7ffbd6aa6bdf14768014e0079`，大小 1,045,498 B。

### 验证摘要

- 四命令：typecheck 0；test 26 文件 / 268 用例；build ×2 同 SHA；validate 14/14。
- `file://`：启动 → 主菜单 → 演出 → 升级 → 暂停 → 回主菜单 → 离开确认；`?dev=1` 快进 9:30 结算 → 再演一场；console 0、Network 1 条文档请求。
- t123 审查 PASS；t125 M6 门禁通过（0 blocker / 0 high）。

---

## 6. 发布检查表与证据索引

- 发布检查表：[docs/release-checklist.md](../release-checklist.md)（12 节；四命令、单文件、file://、Release、Pages、原创、命名、版本、发布后、回滚、签核）。
- M6 门禁：[m6-gate.md](m6-gate.md)；M6 候选：[m6-rc.md](m6-rc.md)。
- 审查：t123（PASS；4 medium + 3 low → P1）。
- 修复： [compat-fix-report.md](compat-fix-report.md)（t115）、[gameplay-repair.md](gameplay-repair.md)（t117）、[gameplay-repair-2.md](gameplay-repair-2.md)（t121）。
- 复测：[playtest-report-2.md](../qa/playtest-report-2.md)（t118）、[playtest-report-3.md](../qa/playtest-report-3.md)（t122）。
- 验证：[verification-report.md](../qa/verification-report.md)（t109 旧版，已加注记）、[compat-report.md](../qa/compat-report.md)（t111）、[unit-report.md](../qa/unit-report.md)。
- 设计/验收：[gdd.md](../gdd.md)、[tech-spec.md](../tech-spec.md)、[acceptance.md](../acceptance.md)。
- 文档：[README.md](../../README.md)、[CHANGELOG.md](../../CHANGELOG.md)、[release-checklist.md](../release-checklist.md)。

---

## 7. 风险与回滚

| 风险 | 影响 | 处置 |
| --- | --- | --- |
| 发布前再次构建 | SHA 变化、文档与附件不一致 | 发布期只改文档；tag 前用 `Get-FileHash` 复核；若变化重跑四命令与 file:// |
| 仓库公开决定仓促 | 历史/文档暴露 | 等用户明确确认；未确认时 Release 可为 draft 或仅本地/私有分发 |
| Pages 未确认就开启 | 暴露与合规风险 | 默认不做；确认后再开并验证 URL |
| 许可证缺失 | 无法合规分发/被误用 | 用户选定后补 `LICENSE`；依赖 MIT/Apache-2.0 声明已保留 |
| 命名/商标撞名 | 上线后被迫改名 | 发布前人工商店/商标检索；备用标题《还亮着》《灯下有人》 |
| 未人测项被误读为「全绿」 | 玩家预期落差 | Release notes 明示 10 条已知限制；不使用「验收全绿」表述 |
| 发布后发现 P0 | 无法游玩/存档问题 | Release 标 `pre-release`/yank；回退 t123 审查版 `877ac242…`；修复后发 `v1.0.1` |

---

## 8. 变更记录

| 日期 | 变更 | 作者 |
| --- | --- | --- |
| 2026-10-28 | 初稿：最终产物、发布步骤、待用户确认项、F1–F5 收尾、Release notes 10 条 | release-manager（t126） |
