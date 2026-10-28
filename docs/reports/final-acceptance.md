# M7 最终验收报告 — v1.0.0 签核（t127 / 制作人）

- **日期**：2026-10-28（Asia/Shanghai）
- **签核对象**：v1.0.0 发布物 `dist/girls-band-live.html`（= 根 `index.html`），**1,045,498 B（1,021.0 KiB）**，SHA-256 `2d2d91c2670bb447ad27d27950a627502d1aa9e7ffbd6aa6bdf14768014e0079`，构建元信息 `girls-band-live v1.0.0 build:inline`。
- **依据**：`docs/acceptance.md`（68 项）、`docs/reports/m6-gate.md`、`docs/reports/m7-release.md`、`README.md`、`CHANGELOG.md`、`docs/release-checklist.md`、`docs/gdd.md`
- **写入**：仅本文件；未改代码/文档，未运行 git

---

## 0. 结论：**SIGNED-OFF（v1.0.0 可发布）**

在最终冻结产物上真实运行四命令、完成 `file://` 全流程（含 90 秒 H1 采样与 9:30 结算/重开），并抽查 P0/F/H。**无 blocker；产物、文档、版本、附件四处一致。**

**但本签核不把「机器通过」写成「验收全绿」**：以下 8 类项仍为**未人测 / defer**，必须随 Release notes 公开（§4）：90 秒真人门、音频听感、集显/1080p 性能、Firefox、失败卡与三构筑/三进化实机、评级边界、静音可读、无障碍人测。另有 3 项用户确认（仓库公开/Pages/许可证）不阻塞本地签核，但阻塞公开发布。

---

## 1. 产物与四命令（本次实跑，未复用旧结果）

| # | 命令 | 退出码 | 关键输出 |
| --- | --- | --- | --- |
| 1 | `npm run typecheck` | **0** | `tsc --noEmit`，无错误 |
| 2 | `npm test` | **0** | `Test Files 26 passed (26)` / `Tests 268 passed (268)` |
| 3 | `npm run build` ×2 | **0 / 0** | 两次均 `build-single: 1021.0 KiB (sha256 2d2d91c2670b)`；`dist/girls-band-live.html` 1,045,498 B，**两次 SHA 完全一致**；根 `index.html` 同步写入 |
| 4 | `npm run validate` | **0** | `validate: 14/14 rules passed（1021.0 KiB，sha256 2d2d91c2670b）` |

- `package.json` version = **1.0.0**（`girls-band-live@1.0.0`）。
- `dist/girls-band-live.html` 与根 `index.html`：同为 `2d2d91c2670b…`、1,045,498 B。
- 单文件中存在版本标记 `<!-- girls-band-live v1.0.0 build:inline -->`。
- `npm run build` 后产物哈希与 t124/t125/t126 冻结值**完全一致**，说明源码与产物未漂移。

---

## 2. `file://` 全流程（本次独立实跑）

### 2.1 正式路径（Chrome，无 `?dev` 参数）

1. 打开 `dist/girls-band-live.html` → 启动屏（`点击开始`，焦点在按钮）。
2. 点击开始 → 主菜单（开始演出 / 曲目单 / 排练室 / 设置 / 制作名单；记录 229 / 9:30 / C）。
3. 开始演出 → HUD（序曲、四区热度、安可未用、核心未定、卡牌 0/10）。
4. **H1 90 秒采样（指针停在按钮上、双手离开）**：

| 采样区间（演出时间） | 返听锁定 | 过热点 | whiteout | 备注 |
| --- | --- | --- | --- | --- |
| t=7 → 23s | 否 | 否 | 0 | 首段 10 次采样全部干净 |
| t=32 → 50s | 否 | 否 | 0 | 选第 1 张核心（回照）后 |
| t=58 → 98s | 否 | 否 | 0 | 覆盖 90 秒门窗口 |

→ **t=7–98s 全程无锁定、无过热、whiteout=0**，H1（开局惩罚）在 v1.0.0 产物上复现通过。

5. 升级三选一：第 1 次在 t≈23s（第 1/10 次，三核心）、第 2 次在 t≈72s（第 2/10 次，支援/通用），选卡后 HUD 核心=回照、卡牌计数前进；升级弹层期间模拟暂停（正确设计）。
6. `Esc` 暂停：面板显示「停在 1:45 · 主歌 · 回照」，当前构筑「烧穿 / 独奏流」；`Esc` 继续。
7. 回主菜单 → 离开确认 → 主菜单（中断路径正常）。
8. **console 0 条消息**；**Network 仅 1 条** `file:///…/dist/girls-band-live.html` 文档请求，无外部请求。

### 2.2 9:30 结算与重开（`?dev=1` 快进，等价 t124/t125 做法）

- `__gbl.store` 驱动 37,200 tick（620s 上限）→ `phase=results`、`time=570.0`、`ending=complete`、`grade=C`、**picks=10**，耗时约 2.7s。
- 结算页实测：峰值 126 / 终场 126 / 转化 125 / 烧死 1494 / 转化-烧死 8% / 被覆盖 109 / 离场 0 / 空位 642 / 第二排（四区）22 / 安可未用 / 裂缝 3 / 时长 9:30；三条后台文案完整。
- 点击「再演一场」→ 回到序曲（t=0、核心未定、卡牌 0/10），重开正常。
- 该页 console 0 条、Network 1 条。

### 2.3 证据路径

- 实机截图（升级弹层 + HUD，2730×1536）：只读附件对象 `C:\Users\17841\.dsh\attachments\v1\objects\3c\3cf4616c…`（sha256 `3cf4616c…`），**不在仓库内**；仓库内既有截图见 `docs/reports/compat-shots/`（t115）、`docs/reports/gameplay-shots/`（t117/t121）、`docs/qa/shots/`（t111/t122）。
- 本次采样与结算数值见 §2.1/§2.2 表格。

---

## 3. P0 / F / H 抽查结论

> 状态口径：**实证** = 本次 v1.0.0 实跑或自动化测试直接覆盖；**部分** = 自动化/间接证据覆盖核心逻辑、表现层未人测；**defer** = 明确未人测，不判 pass。

### 3.1 P0 功能（A01–A27）

| ID | 判定 | 证据 / 理由 |
| --- | --- | --- |
| A01 主菜单→演出→结算→重开 | **实证** | 本次 §2.1→§2.2 全链路 |
| A02 4 角色/1 可操作/4 瞬间 | 部分 | `data.test.ts` + 主菜单可见；辨识度未人测 |
| A03 光三形态 | 部分 | `light.test.ts`；本次实机切换散光/束光/回照可用 |
| A04 点燃三档/和弦 | 部分 | `ignite.test.ts`；关声判定未人测 |
| A05 观众状态/覆盖/离场 | 部分 | `audience.test.ts`；HUD 表现已见 |
| A06 人浪 | 部分 | `crowd-wave.test.ts`；画面未逐次人测 |
| A07 返听/Boss | 部分 | `boss.test.ts`；实机返听锁定未在本轮触发 |
| A08 反驻守 | **实证** | `tests/f3-bot.test.ts` 4/4（camp 7 / sweep 40） |
| A09 卡池/10 选/互斥 | **实证**（核心） | `progression.test.ts`；本次实机 2 次选卡、快进 picks=10 |
| A10 静音可读性 | **defer** | 需人测 |
| A11 HUD 0 数字/白光 | **实证** | `hud.test.ts` 11/11 + 本次 HUD 无人数/伤害数字 |
| A12 失败卡 | **defer** | t117 已实现，未人测（本轮未触发中断） |
| A13 90 秒真人门 | **defer** | 需 10 名外部新玩家（AI/采样不可替代） |
| A14 静默 8 小节 | 部分 | `boss.test.ts`；音频总线需实机 |
| A15 放下光/空场 | 部分 | t122 实机空场完成；本轮为 complete 路径 |
| A16 结算字段 | **实证** | 本次结算页与 `RunResult` 一致 |
| A17 菜单/曲目单/排练室/设置/制作名单 | 部分 | 本次到达主菜单；逐屏由 t111 覆盖 |
| A18 音乐/听感 | **defer** | 音频听感未人测 |
| A19 高/低画质 | **defer** | 需实机人测 |
| A20 存档 | 部分 | t113 实机三局 + `save.test.ts`；`.bad` 破坏未本轮复测 |
| A21 无障碍 | 部分 | t111 键盘/焦点/高对比实测；读屏未人测 |
| A22 3 局性能 | **defer** | 需人测 |
| A23 3 进化 | 部分 | t122 实机进化成型；本轮未构造 |
| A24 3 构筑 | 部分 | `progression.test.ts`；结算差异未逐条人测 |
| A25 评级边界 | **defer** | 需人测（B 需终场 ≥300 为刻意设计，见 Release notes） |
| A26 5 段/304 小节/9:30 | **实证** | 本次 9:30 结算 + `clock.test.ts` |
| A27 热度 0–4 | 部分 | `upgrades.test.ts`；HUD 表现已见 |

### 3.2 F（M3 修复 13 项）

| ID | 判定 | 证据 |
| --- | --- | --- |
| F01 一局最多 10 卡/核心互斥/不可拿完 | **实证** | `progression.test.ts` + 本次 picks=10 |
| F02 战斗 HUD 可读 | 部分 | 实机 HUD 可见；未人测 |
| F03 反驻守 bot | **实证** | `f3-bot.test.ts` |
| F04 90 秒门埋点 | **defer** | 需真人样本（埋点字段已在 `telemetry.ts`） |
| F05 点燃跟拍/关声可玩 | 部分 | `ignite.test.ts`；关声未人测 |
| F06 角色复述 | **defer** | 人测 |
| F07 失败卡 + 回放 | **defer** | 人测（本轮未触发） |
| F08 whiteout 峰值公式 | **实证** | `hud.test.ts` + acceptance 动画峰值注记 |
| F09 满场性能 | **defer** | 人测 |
| F10 确定性 | **实证** | `determinism.test.ts` + validate R12/R13 |
| F11 音频切片/合唱 A/B | **defer** | 人耳 |
| F12 9:30 计时 | **实证** | 本次 570.0s |
| F13 命名查重 | **defer** | release 阶段（U4 商标） |

### 3.3 H（人测协议 8 项）

H01 90 秒真人门（10 人）、H02 bot 90s/180s 复现、H03 音频盲听、H04 静音可玩、H05 角色复述、H06 少一轨是否疼、H07 失败卡可读、H08 钩子片段识别 —— **全部 defer（未人测）**，验收文档已写明协议与样本量，不得以机器测试替代。

### 3.4 修复项 H1–H4（M6 回归）

| 项 | 判定 | 证据 |
| --- | --- | --- |
| H1 开局惩罚（指针污染） | **实证** | 本次 t=7–98s 无锁定/过热/whiteout；t122 冷启 5/5 |
| H2 后排钩子 | **实证**（等价物） | GDD §14 已写明等价位置；t118 可见性实测 |
| H3 相机构图 | 部分 | t118/t122 四向可见；W 边界底部近黑（medium，已知限制） |
| H4 白光可读 | **实证** | t117/t122 实机 whiteout 0.85 中心可读；t115 对比度取样 |

---

## 4. defer 清单（必须写入 Release notes，不得伪装 pass）

1. **90 秒真人门（AC-13 / AC-H01 / AC-F04）**：需 10 名外部新玩家、≥7 人在 90 秒内主动移光；现有 AI 试玩与埋点不能替代。
2. **音频听感 / 盲听 A/B（AC-18 / AC-F11 / AC-H03 / H06）**：5 层音乐、12 声部合唱、12 SFX 未人耳验证；静默段与「少一轨是否疼」未验。
3. **集显 / 1920×1080 / 连续 3 局性能（AC-22 / AC-F09 / AC-19）**：仅有 RTX 4080 约 130fps 采样。
4. **Firefox 实机**：本机未安装，Chrome/Edge 已测。
5. **失败卡/中断局、三构筑各一局、三进化、评级边界（AC-12 / AC-24 / AC-25 / AC-F07）**：未专门构造。
6. **静音可读性（AC-10 / AC-H04）**：未人测。
7. **无障碍读屏与色觉复述（AC-21 / AC-H05）**：键盘/焦点/高对比已测，读屏未测。
8. **H05–H08 人测协议**：角色复述、少一轨、失败卡可读、钩子识别均未做。

另 3 项用户确认（不阻塞本地签核）：**U1 仓库是否公开、U2 是否开启 Pages、U3 项目许可证**（当前无 `LICENSE`）。

---

## 5. 文档 / 版本 / 附件一致性

| 项 | 结果 |
| --- | --- |
| `package.json` version | **1.0.0** ✔ |
| 单文件内版本标记 | `girls-band-live v1.0.0 build:inline` ✔ |
| 根 `index.html` | 与 dist 单文件同 SHA（1,045,498 B）✔ |
| `README.md` | v1.0.0 状态、打开方式、操作、玩法、四命令、已知限制 11 条 ✔ |
| `CHANGELOG.md` | `[1.0.0] — 2026-10-28` 条目、M1–M7、Fixed/Known issues 10 条 ✔ |
| `docs/release-checklist.md` | 12 节；§2 四命令、§3 单文件、§4 file://、§9 文档一致性均 [x]；§1「最终验收」[ ] 由本报告满足；§5 Release 附件 [ ] 待制作人上传 ✔ |
| `docs/reports/m7-release.md` | 最终产物、11 步发布流程、U1–U5、Release notes 10 条 ✔ |
| GitHub Release 附件路径 | `dist/girls-band-live.html` 存在且 1,045,498 B / `2d2d91c2…`；仓库无 `.github/`，Release 由制作人手工创建（附件源即该文件）✔ |
| 许可证 | **缺失**（U3 未决）；不阻塞本地签核，公开发布前需用户选择 |

---

## 6. 签核与后续

**SIGNED-OFF：v1.0.0 可以发布。**

- 制作人执行：`git add/commit chore(release): M7 v1.0.0` → annotated tag `v1.0.0` → GitHub Release（标题《谁在听》v1.0.0，附件 `dist/girls-band-live.html`，正文含 10 条已知限制）→ 勾选 checklist §1/§5/§10。
- 用户确认：U1 仓库公开、U2 Pages、U3 许可证；U4 商标检索、U5 附件命名可后置。
- 发布后：下载附件复验 SHA-256/大小 + `file://` 启动一局；补 90 秒真人门与音频盲测（P1）。
- 回滚：若发现 P0，Release 标 pre-release/yank，保留 t123 审查版 `877ac242…` 作为回退，修复后发 `v1.0.1`。

---

## 附录：本次验收命令与证据

```bash
npm run typecheck     # exit 0
npm test              # 26 files / 268 tests passed
npm run build         # ×2 exit 0；1,045,498 B；sha 2d2d91c2670b… 两次一致
npm run validate      # 14/14 rules passed（1021.0 KiB，sha256 2d2d91c2670b）
sha256sum dist/girls-band-live.html index.html   # 同为 2d2d91c2670b…
```

浏览器（Chrome，`file://`）：启动→主菜单→演出→H1 90s（t=7–98 无锁定/过热/whiteout）→升级 2 次→暂停（1:45 主歌/回照/烧穿·独奏流）→继续→回主菜单；`?dev=1` 快进 37,200 tick→结算（complete/C/570.0s/picks=10）→再演一场。两页 console 均 0 条、Network 均 1 条文档请求。

> 本报告只写 `docs/reports/final-acceptance.md`；未修改任何代码或文档。以上数值均为本次 v1.0.0 产物上的独立复跑结果。
