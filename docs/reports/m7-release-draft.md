# M7 发布草稿 / Release Draft — v1.0.0

- **日期**：2026-10-28（Asia/Shanghai）
- **作者**：release-manager（t120）
- **性质**：M7 并行草稿。**不等待最终审查**，用于提前评审发行材料；**当前不可对外发布**。
- **输入**：[README.md](../../README.md)、[docs/gdd.md](../gdd.md)、[docs/tech-spec.md](../tech-spec.md)、[docs/qa/verification-report.md](../qa/verification-report.md)、[docs/qa/playtest-report.md](../qa/playtest-report.md)、[docs/qa/compat-report.md](../qa/compat-report.md)、[docs/reports/repair-report.md](repair-report.md)、[docs/reports/candidate-report.md](candidate-report.md)、[docs/reports/m5-dev.md](m5-dev.md)、[docs/acceptance.md](../acceptance.md)
- **边界**：本任务只写 4 个文件（README / CHANGELOG / release-checklist / 本文件）；未改代码、配置、构建产物；未运行 git、未安装依赖、未部署。

---

## 0. 结论（给制作人）

**发行材料草稿已就绪，但发布门禁未关闭。**

- 能写的已写：README 的玩家/开发者两段、CHANGELOG v1.0.0 草稿、发行前检查表、本状态报告。
- 不能写的没有编：M6 收尾修复 **t115（窗口缩放 / HUD 对比度）进行中**、**t117（开局 / 相机 / 白光 / 钩子 / 结算）尚未开始**，t118 复测、t119 代码审查未跑；因此 README 与 CHANGELOG 把相关项标为"进行中/待修"，没有写成已修复。
- 当前工作区构建 **不是** 发布日期候选：`1,043,675 B / A220C425…`（2026-10-28；05:33 首次构建 / 05:46 重建同哈希），相对 t109 验证有 9 个源码文件变化（含 t113 已合入修复与 t115 进行中改动），**未重跑四命令**。
- 发布前必须：完成 t115/t117 → t118 回归 → t119 review pass → 重跑四命令与 `file://` 冒烟 → 版本升 `1.0.0` → 冻结构建 → 制作人 tag/Release → 用户确认许可证/公开/Pages。

---

## 1. 当前状态

### 1.1 里程碑

| 里程碑 | 状态 | 关键证据 |
| --- | --- | --- |
| M1 企划提案 | 完成 | 10 份企划、[m1-pitches](m1-pitches.md) |
| M2 交叉讨论 | 完成 | 10 份互评、3 个融合案、[m2-discussion](m2-discussion.md) |
| M3 评审打分 | 完成 | 3 评审 + 7 打分 + 计票、[m3-selection](m3-selection.md) |
| M4 设计定稿 | 完成 | GDD / 技术方案 / 验收 / 美术、[m4-design](m4-design.md) |
| M5 开发 | 完成 | 8 个实现任务、[m5-dev](m5-dev.md)、[unit-report](../qa/unit-report.md) |
| M6 测试与审查 | **未完成** | 候选版、验证、试玩、兼容均已做；t115/t117/t118/t119 未完成；t109/t111 结论绑定旧字节 |
| M7 发布 | **草稿** | 本文件与 README/CHANGELOG/检查表；未打 tag、未 Release |

### 1.2 产物与版本

| 项 | 值 |
| --- | --- |
| 发布物 | `dist/girls-band-live.html`（单文件、`file://`、零外部素材） |
| 根入口 | `index.html`（构建生成，与 dist 单文件同字节） |
| 当前构建 | **1,043,675 B（≈1019.2 KiB / 0.995 MiB）**，SHA-256 `A220C425A6A00B5F716F7A4A9151148FFC2611FCFF7F6E3716ABFB64C2DF52D4`，2026-10-28（05:33 首次构建 / 05:46 重建同哈希） |
| 最近全绿构建（t113） | `1,041,592 B`（1017.2 KiB），SHA-256 `307d4e709c50d5c4e807cf171ce2dd8efeade9202ccb7967721dcc728bb85a7f` |
| 更早候选（t108/t109） | `1,041,922 B`，SHA-256 `9277a8003eb8…` |
| package.json version | **0.1.0**（发布前需升 1.0.0） |
| 构建元信息 | `girls-band-live v0.1.0 build:inline`（发布前需变 `v1.0.0`） |

> 三次构建三个哈希，说明构建漂移真实存在；**不得把任何旧哈希写进 Release**。发布时以最终重建的哈希为准。

### 1.3 质量门现状

| 证据 | 结果 | 对发布的影响 |
| --- | --- | --- |
| 四命令（t113，最近全绿） | `typecheck` 0；`test` 24 文件 / 264 用例；`build` exit 0；`validate` 14/14 | 只能证明 t113 字节；当前源码已变 |
| `file://` 全流程（t109） | 启动 → 主菜单 → 曲目单 → 排练室 → 升级 → 暂停 → 结算（空场 + 完整 9:30）→ 重开；console 0；网络仅 1 条文档请求 | 需对最终构建复跑 |
| 实机试玩（t110） | 4 次会话、2 局完整 9:30（其中 1 局空场完成）+ 1 次重开；局 B 主动终止；**4 个 high**（H1–H4） | t117 待修 |
| 兼容 / 无障碍（t111） | Chrome/Edge 六档分辨率、离线、键盘、存档、减少动态、高对比通过；**2 个 high**（窗口缩放、白光下 HUD 对比度） | t115 进行中 |
| 单元测试覆盖 | 24 文件 / 264 用例；19 组必测模块 + 数据完整性 + 座位布局 + F3 bot + UI 冒烟 | 通过；最终构建后重跑 |
| 代码审查 | t119 未执行 | 发布阻塞 |
| 命名 / 商标 / 许可证 / Pages | 未定 | 用户确认 |

### 1.4 为什么旧 QA 结论不能直接用于发布

`agent_teams_status` 的 delivery 提示（2026-10-28 05:35）指出：t109 的 verdict 所覆盖的 revision 已不存在，至少以下文件在 t109 之后变化（sha256 前缀对比）：

| 文件 | 旧 | 新 |
| --- | --- | --- |
| `src/App.tsx` | `874884c1` | `ba824d59` |
| `src/game/save.ts` | `057a9f75` | `0899b637` |
| `src/main.tsx` | `490863a4` | `29e9728c` |
| `src/styles/base.css` | `6e974b9a` | `7427438d` |
| `src/styles/ui.css` | `9da94605` | `404ac7fd` |
| `src/three/renderer.ts` | `5ad27dce` | `a5b79e51` |
| `src/ui/bridge.ts` | `fc1a33ef` | `86b53d0f` |
| `src/ui/components/Hud.tsx` | `211f9653` | `7454b8e1` |
| `src/ui/screens/BootScreen.tsx` | `3c753469` | `e8950f2f` |

其中既包含 t113（whiteout / records）的已合入修复，也包含 t115 进行中的未完成改动（窗口缩放、HUD 对比度）。**发布前必须让 t109/t111 的等价验证重新绑定当前字节**。

---

## 2. 待审查 / 待修项

### 2.1 阻塞发布（必须关闭）

| # | 项 | 负责 | 当前状态 | 关闭条件 |
| --- | --- | --- | --- | --- |
| B1 | t115：窗口缩放 canvas 自锁（COMPAT-1）+ 白光下 HUD 对比度（COMPAT-2） | tech-director | **in_progress** | 修复 + 双浏览器窗口缩放复测 + 白光 0.85 时区名 ≥4.5:1；`ui.css` / `main.tsx` / `renderer.ts` 变更后四命令 |
| B2 | t117：开局惩罚（H1）、相机遮挡（H3）、白光遮挡（H4）、1:12 钩子（H2）、结算读数（t110-M2/M3）、升级节奏（t110-M5）、Tab 构筑（t110-M6） | tech-director | **pending** | 修复 + 专项证据；H1 需序曲无惩罚与开局光位不落区 |
| B3 | t118：Gameplay 修复回归 | qa-playtester | pending | 至少 2 局完整 9:30 + 开局 90 秒 + 相机四向 + 结算读数复核；无 blocker/high |
| B4 | t119：代码审查（发布质量门） | code-reviewer | pending | verdict = pass；findings 关闭或有制作人书面豁免 |
| B5 | t109 / t111 结论绑定当前字节 | qa-automation / qa-compat | 过期 | 对冻结构建重跑四命令、`file://` 全流程、兼容关键项 |
| B6 | 版本与构建冻结 | tech-director / producer | 未做 | `package.json` 1.0.0、重新构建、记录最终 SHA-256 与大小 |
| B7 | 用户确认 | 用户 | 未确认 | 许可证、仓库公开、Pages（见 [release-checklist §5–§7](../release-checklist.md)） |

### 2.2 发行材料待审查 / 待回填

| # | 项 | 状态 | 说明 |
| --- | --- | --- | --- |
| D1 | README | 草稿完成 | 发布冻结后回填最终哈希/大小；操作键位随 t117（Tab）复核 |
| D2 | CHANGELOG | 草稿完成 | "M6 收尾"条目需在 t115/t117 完成后改为已修复并附证据 |
| D3 | 发布检查表 | 草稿完成 | 第 2–4 节待最终构建勾选；第 8 节命名查重需人工复核 |
| D4 | 本文件 | 草稿完成 | 最终发布后改为"发布记录"或归档 |
| D5 | 命名查重 | 初步检索 | 未发现同名电子游戏；存在近名桌游/公民科学项目；正式商标检索待用户 |
| D6 | 项目许可证 | 未定 | 需用户选择并添加 `LICENSE` |
| D7 | Pages / 仓库公开 | 未定 | 默认不做；需用户明确确认 |

### 2.3 未人测 / 已知限制（发布说明必须列出）

- **90 秒门**：AC-13 / AC-H01 需 10 名新玩家，≥7 人 90 秒内主动移光；现有 AI 试玩与 bot 埋点不能替代。
- **人耳音频**：5 层音乐、12 声部合唱、12 SFX、静默段、盲听 A/B；无 `docs/qa/audio-report.md`。
- **性能**：1280×720 集显 3 局、1920×1080、满场 180 噪音、3 局内存；现有数据为 RTX 4080 单机采样。
- **Firefox**：本机未安装，未实机验证。
- **失败卡/中断局**：AC-12 / AC-F07 未触发。
- **三构筑 / 三进化 / 评级边界**：AC-23 / AC-24 / AC-25 未专门构造。
- **其余 blocked**：AC-02 / AC-10 / AC-14 / AC-15 / AC-21 / AC-22 / AC-26 / AC-27；AC-F04 / F05 / F06 / F07 / F09 / F11 / F13；AC-T06 / T09 / T11 / T13 / T14–T20 的部分子项。
- **仅桌面**：无移动端/触屏/手柄。

### 2.4 已关闭项（不在待修清单）

- F3 反驻守（t105）：camp 30→7、sweep 30→40，`tests/f3-bot.test.ts` 4/4。
- whiteout 峰值基准（t108/t113）：开局 30/768 = 0，掉半 = 0.425，空场 = 0.85；AC-F08 文档同步。
- 空场结算 records 双写（t113）：`save.ts` 唯一权威；`tests/save.test.ts` 16/16。
- `lastRun.date` 本地时区（t113）。
- 座位 0.7m 错位（t103）：`tests/seat-layout.test.ts` 21/21。
- 音频时钟、HUD 发布、画布层级、构建重复性（t108）。
- 损坏存档回退、WebGL2 提示、上下文恢复（t109/t111）。

---

## 3. 发布步骤（建议顺序）

> 每一步的详细勾选项见 [docs/release-checklist.md](../release-checklist.md)。

1. **关闭修复门**：t115、t117 完成；t118 回归；t119 review pass。若 review 要求返工，回到修复并重跑受影响项。
2. **重跑 QA 绑定**：对当前源码重跑四命令；`file://` 全流程（Chrome/Edge，至少 1 局完整 9:30 + 1 局空场）；窗口缩放与 HUD 对比度复测；记录结果。
3. **版本升级**：`package.json` → `1.0.0`；确认 lockfile；重新构建两次，核对 SHA-256 一致；确认构建元信息 `girls-band-live v1.0.0 build:inline`。
4. **冻结构建**：记录最终 `dist/girls-band-live.html` 的字节数、SHA-256、构建时间；根 `index.html` 与之一致。
5. **回填发布文档**：README（版本/哈希/限制）、CHANGELOG（1.0.0 日期与修复清单）、release-checklist（勾选与签核）、本文件（状态改"已发布"）。
6. **原创与命名复核**：零外部素材扫描、依赖许可证、项目 LICENSE（用户选定）、标题查重（初步已做）。
7. **用户确认**：仓库是否公开、是否开启 Pages、许可证；未确认则只交付离线单文件 + Release 附件。
8. **提交与 tag**：制作人 `chore(release): M7 v1.0.0`、annotated tag `v1.0.0`、推送。
9. **GitHub Release**：标题《谁在听》v1.0.0；正文含 CHANGELOG 摘要、已知限制、SHA-256、大小、平台要求；附件为单文件。
10. **发布后验证与归档**：下载附件核对哈希、`file://` 启动到结算；Pages（若启用）冒烟；M7 Issue 记录 tag/commit/哈希/命令输出；通知用户。
11. **回滚预案**：若发现 P0，标记/yank Release，保留或回退 tag，修复后发 `v1.0.1`。

**负责人**：修复 t115/t117（tech-director）；回归 t118（qa-playtester）；审查 t119（code-reviewer）；四命令/兼容复跑（qa-automation / qa-compat）；提交/tag/Release/Pages（producer）；文档（release-manager）；确认（用户）。

---

## 4. 本次交付文件

| 文件 | 内容 | 状态 |
| --- | --- | --- |
| [README.md](../../README.md) | 玩家段（玩法/如何打开单文件/操作/规则/限制）+ 开发者段（命令/目录/架构/测试/36 人与 M1–M7/许可证） | 草稿完成 |
| [CHANGELOG.md](../../CHANGELOG.md) | v1.0.0 草稿：Added / Changed / Fixed（已合入 + M6 收尾）/ Known issues / Verification | 草稿完成 |
| [docs/release-checklist.md](../release-checklist.md) | 12 节发行检查表：门禁、四命令、单文件、`file://`、Release、Pages、原创素材、命名查重、版本、发布后、回滚、签核 | 草稿完成 |
| 本文件 | 当前状态、待审查/待修项、发布步骤 | 草稿完成 |

---

## 5. 风险与注意事项

| 风险 | 影响 | 处置 |
| --- | --- | --- |
| 修复未完成就发布 | 相机/开局/白光/结算缺陷进入首发，90 秒门基本不可用 | 坚持 t115/t117/t118/t119 门禁 |
| 构建漂移 | Release 哈希与验证字节不一致 | 冻结后只改文档；任何源码改动重跑四命令并重新冻结 |
| 旧 QA 结论被误用 | 把旧构建的"通过"写成新构建的验收 | 所有报告标注构建哈希；发布前重新绑定 |
| 人测缺失 | 90 秒门/音频/性能/失败卡未验证 | 在 Release 与 README 明示"未人测"，不宣称全绿 |
| 命名/商标冲突 | 上线后被迫改名 | 发布前查重；备用标题《还亮着》《灯下有人》 |
| 许可证未定 | 无法合规开源/分发 | 用户选择并添加 `LICENSE`；依赖 MIT/Apache-2.0 已保留声明 |
| Pages 未经确认就上线 | 暴露仓库与文档 | 默认不做；用户确认后再开启 |
| 单文件被中间产物替换 | 用户拿到不可用 HTML | 发布检查表第 3 节与发布后哈希核对 |

---

## 6. 证据索引

- [M6 验证报告](../qa/verification-report.md)：P0 矩阵 18 pass / 21 blocked / 1 fail；四命令、`file://` 全流程、截图 17 张。
- [M6 实机试玩报告](../qa/playtest-report.md)：4 次会话、H1–H4、M1–M8、L1–L4，截图 48 张。
- [M6 兼容报告](../qa/compat-report.md)：Chrome/Edge 矩阵、离线、无障碍、COMPAT-1/2，截图 44 张。
- [M6 修复报告](repair-report.md)：whiteout 口径与空场结算，四命令全绿（1,041,592 B / `307d4e70…`）。
- [M6 候选版报告](candidate-report.md)：集成 6 项与 `file://` 冒烟（1,041,922 B / `9277a800…`）。
- [M5 开发报告](m5-dev.md)：8 个实现任务、42 模块 / 77 签名、82 TS/TSX / 27,010 行。
- [M5 单测报告](../qa/unit-report.md)：19 组必测模块、68 项验收映射。
- [验收矩阵](../acceptance.md)：68 项，含 AC-13 90 秒门、AC-18 音频、AC-F08 白光口径。
- [GDD](../gdd.md) / [技术方案](../tech-spec.md)：锁定内容与实现契约。
- [发布检查表](../release-checklist.md) / [CHANGELOG](../../CHANGELOG.md) / [README](../../README.md)。

---

## 7. 变更记录

| 日期 | 变更 | 作者 |
| --- | --- | --- |
| 2026-10-28 | 初稿：状态、待修项、发布步骤、证据索引 | release-manager（t120） |
