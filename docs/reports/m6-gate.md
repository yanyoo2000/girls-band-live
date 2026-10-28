# M6 发布候选门禁报告（t125 / 制作人）

- **日期**：2026-10-28（Asia/Shanghai）
- **对象**：v1.0.0 发布候选 `dist/girls-band-live.html`，**1,045,498 B（1,021.0 KiB）**，sha256 `2d2d91c2670bb447ad27d27950a627502d1aa9e7ffbd6aa6bdf14768014e0079`
- **依据**：`docs/reports/m6-rc.md`（t124）、t123 审查（verdict=pass，7 findings）、t118/t122 复测、`docs/qa/{unit,verification,compat,playtest,playtest-2,playtest-3}.md`、`docs/acceptance.md`、t113/t115/t121 修复报告
- **写入**：仅本文件；未改代码/文档，未运行 git

---

## 0. 结论

**通过，可进入 M7 发布。** 无 blocker、无 high。

但 **tag / GitHub Release 之前必须完成 4 项「发布前小修」**（全部为文档/口径级，不影响产物字节，见 §5）：
1. acceptance 补「whiteout 动画峰值」注记（REV-L2）；
2. `docs/qa/verification-report.md` 加「已被 t113/t123 取代」注记（该文件仍是 t109 旧版，含 AC-F08 fail）；
3. acceptance AC-08/AC-H02 的测试文件名 `tests/anti-camp.test.ts` 改为实际交付的 `tests/f3-bot.test.ts`；
4. REV-M3（B/A 评级可达性）与 REV-M4（序曲可逆空场）需创意/产品书面确认「刻意设计」，或原文写入 Release notes。

---

## 1. 检查表

| # | 检查项 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | t123 review 是否 pass、findings 是否关闭 | **PASS；7 findings 全部 `resolved:false`，已按 P1 defer** | 见 §2 |
| 2 | t124 产物：version / ≤2MB / 两次构建 sha / 四命令 | **全部通过** | 见 §3 |
| 3 | file:// 完整流程 + console/network | **通过**（本次独立冒烟 + dev 快进结算） | 见 §4 |
| 4 | QA high/blocker 是否关闭 | **4 项 high 全部关闭，0 blocker** | 见 §2.2 |
| 5 | 文档同步（H1/H2/H4/whiteout/XP） | **实现与 GDD/acceptance 一致**；4 处文档级不一致 | 见 §5 |
| 6 | 能否进入 M7 | **可**（附 4 项发布前小修） | §0 |

---

## 2. t123 审查与 QA high 关闭链条

### 2.1 t123（code-reviewer，review kind）

- `verdict = pass`；7 条 findings（4 medium + 3 low），**均未 resolve**，属「已知限制/P1」而非阻塞。
- REV-L3（H2 钩子位置与 GDD 第 24 排不一致）：t124 已在 GDD §14 写明「后排右端等价钩子、固定相机看不到第 24 排」→ **文档侧已关闭**，实现保持等价处理。
- 其余 6 条（REV-M1 构图底部近黑、REV-M2 升级前重后空、REV-M3 评级可达性、REV-M4 序曲可逆、REV-L1 光位 1/5、REV-L2 动画峰值）→ defer 到 P1；其中 M3/M4 需产品确认，L2 需文档注记。

### 2.2 QA high/blocker 关闭链条（逐条）

| ID | 来源 | 严重度 | 修复 | 复核 | 状态 |
| --- | --- | --- | --- | --- | --- |
| COMPAT-1 窗口缩放 canvas 自锁 | t111 | high | t115（读 documentElement + setSize(false) + 多事件） | t115 实测 Chrome 5 档 / Edge 5 档 css==inner、viewport==backing；t123 复核代码路径 | **关闭** |
| COMPAT-2 白光下 HUD 对比度 | t111 | high | t115（暗底衬/描边/11px/heat-0 opacity） | t115 像素采样峰值 14.8/16.5/7.7:1，0.312 时 16.4/17.1/5.1:1 | **关闭** |
| AC-F08 whiteout 口径 | t109 | high | t113（峰值基准公式 + 三处文档同步 + hud.test 11/11） | t123 复核：store/HUD/RenderSnapshot 同源 | **关闭** |
| H1 开局惩罚（光位被按钮污染） | t110/t118 | high | t121（只认 pointerNdc>0.01、删 run.time===0、相机首帧 snap） | t122 冷启 **5/5** PASS；本次冒烟 8s 内无锁定/过热 | **关闭** |
| H2/H3/H4/M2/M3 | t110/t117 | medium | t117 | t118 复测 PASS | **关闭** |
| 过热掉人 / 升级节奏 | t118 | medium | t121（XP 来源扩展，1.4s/人） | t122：10/10 三选一、驻守 30→4（−87%）/主歌 30→0 | **关闭** |

> 说明：`docs/qa/verification-report.md` 仍是 t109 旧版（产物 9277a800、P0 18 pass/21 blocked/1 fail），其中唯一 fail（AC-F08）已由 t113 修复、t123 复核关闭；该文件需加注记（§5 F2）。

---

## 3. 产物与四命令（本次独立实跑）

| 项 | 实测 |
| --- | --- |
| `package.json` version | **1.0.0** |
| 单文件 | `dist/girls-band-live.html` = 根 `index.html` = **1,045,498 B（1,021.0 KiB）**，≤2MB ✔ |
| sha256 | **`2d2d91c2670bb447ad27d27950a627502d1aa9e7ffbd6aa6bdf14768014e0079`** |
| 版本标记 | HTML 注释 `<!-- girls-band-live v1.0.0 build:inline -->`（页面内读取确认） |
| `npm run typecheck` | **exit 0** |
| `npm test` | **26 文件 / 268 用例 / 0 失败** |
| `npm run build` ×2 | 均 exit 0；两次 sha 完全一致 `2d2d91c2670b…`；每次均写出 1,045,498 B |
| `npm run validate` | **14/14 rules passed（1021.0 KiB，sha256 2d2d91c2670b）** |
| 根 `index.html` 与 dist 单文件 | 字节一致（同 sha） |

---

## 4. file:// 完整流程（本次独立冒烟）

**无 `?dev` 页面（正式玩家路径）**：
- 启动屏（`点击开始`，console 0）→ 主菜单（开始演出/曲目单/排练室/设置/制作名单 + 记录 229/9:30/C）→ 开始演出 → HUD（序曲、四区热度、安可、核心、卡牌 0/10）。
- 演出 7s→15s→63s 时间推进正常；**8 秒内无返听锁定、无过热**（H1 路径）。
- 升级三选一正常弹出（第 1/10 次，三张核心卡；Esc 不跳过）；按 3 选「回照」→ HUD 核心=回照、卡牌 1/10。
- Esc 暂停面板（0:50 · 序曲 · 回照）→ 继续 → Esc → 回主菜单 → 离开确认 → 主菜单（中断路径正常）。
- 全程 **console 0 条消息**；**Network 仅 1 条** `file:///…/girls-band-live.html` 文档请求。

**`?dev=1` 页面（快进结算，等价 t124 做法）**：
- `__gbl.store` 驱动 37,200 tick（620s 上限）→ `phase=results`、`time=570.0`、`ending=complete`、`grade=C`、**picks=10**，耗时约 3.0s。
- 结算页完整：峰值 126 / 终场 126 / 转化 125 / 烧死 1494 / 被覆盖 109 / 离场 0 / 空位 642 / 第二排（四区）22 / 裂缝 3 / 时长 9:30 / 后台四条角色文案；「再演一场」回到演出（t=0、核心未定、卡牌 0/10）。
- console 0 条；Network 仍仅 1 条 `?dev=1` 文档请求。

**未覆盖（不影响门禁结论）**：真人 90 秒门（AC-13/AC-H01）、音频听感、1920×1080 性能、Firefox。

---

## 5. 文档同步核对与发现

### 5.1 已同步（与实现一致）

| 项 | 文档 | 核对 |
| --- | --- | --- |
| XP 来源/首升/次数 | GDD §10（专项 + 0.7/s + 人气系数；首升 0:25–0:40；9:30 7–10 次） | 行 76/347/349 ✔ |
| H1 宽限/过热 | GDD §11（开场 5s 宽限 + 首次 pointermove 前不计时；过热 1.4s/人） | 行 423/424 ✔ |
| H4 whiteout | GDD §12（峰值公式；中央与 42% 半径 alpha=0；边缘 26%；11vh/10vw；旧公式作废） | 行 465 ✔ |
| H2 钩子 | GDD §14（后排右端 1.7m 等价；固定相机看不到第 24 排） | 行 548 ✔ |
| acceptance | AC-08 补 5s 宽限/1.4s；AC-13/AC-F04 钩子改「后排右端等价荧光棒」；AC-F08 峰值公式 | 行 73/78/109/114 ✔ |
| 锁定数量 | 24 卡/3 构筑/3 进化/9:30/768 席/10 选/阈值未改 | t124 声明 + 本次 test 全绿 ✔ |

### 5.2 发现（非阻塞，发布前小修）

| ID | 问题 | 影响 | 建议 |
| --- | --- | --- | --- |
| F1 | acceptance 无「whiteout 动画峰值」注记；m6-rc §6 第 8 条已声称「按动画峰值注明」 | 验收截图口径可能被判超差（REV-L2 未关闭） | acceptance AC-F08 补一句「动画峰值 0.957–1.000 属表现层脉动，静态上限 0.85」 |
| F2 | `docs/qa/verification-report.md` 仍是 t109 旧版（1,041,922 B / 9277a800 / AC-F08 fail） | 发布包若带 QA 文档会出现「与候选版矛盾」 | 文首加「已被 t113/t123 取代」注记，或更新为当前版本 |
| F3 | acceptance AC-08/AC-H02 证据列写 `tests/anti-camp.test.ts`，实际为 `tests/f3-bot.test.ts` | 追溯断链（t97 D1 遗留） | 改文件名或加「等价 f3-bot」注记 |
| F4 | REV-M3（常规打法 160=C，B 需 ≥300）、REV-M4（序曲驻守 30→4 后 45s 回满）未做产品裁决 | 玩家可能读成「只有唱化流可玩」「序曲惩罚无效」 | 创意/产品书面确认是刻意设计，或列入 Release notes「已知限制」 |
| F5 | 暂停面板「当前构筑」在已选核心后仍显示「还没有拿到卡。第一次升级会先选核心。」（本次实测，t=1:08、核心=回照） | 文案误导（low）；HUD 核心显示正确 | M7 修或列入 known limitations |

---

## 6. 发布时必须写入 Release notes 的已知限制（9 条 + QA 口径）

1. 90 秒真人门（AC-13/AC-H01）未做：需 10 名外部新玩家。
2. 音频听感/盲听 A/B（AC-18/F11）未做。
3. 性能仅采样级（t111 约 130fps）；1920×1080、连续 3 局、集显未正式测。
4. W 边界相机构图底部约 55% 近黑（台面/成员/观众仍可见）。
5. 升级曲线前重后空：10 次集中在 3:48 内。
6. 评级可达性：常规打法 160=C，B 需终场 ≥300（待产品确认）。
7. 序曲可逆空场：驻守后 45s 扫场可回满，F3 代价偏弱。
8. H2 等价钩子位于 back-right 第一排右端（非 GDD 原文第 24 排）。
9. whiteout 临界动画峰值 0.957–1.000（静态上限 0.85）；`dwellRewardRatio` 负值 = 停住净损失，非阈值失败。
10. 暂停面板构筑区不列已选核心（F5）。

---

## 7. M7 输入

- 发布物：`dist/girls-band-live.html`（1,045,498 B / `2d2d91c2…`），已验证 file:// 全流程与四命令。
- 发布前 4 项小修：§5.2 的 F1/F2/F3/F4（文档与产品确认）；F5 可并入 M7 修复或 known limitations。
- 建议 M7 任务顺序：文档小修 → README/CHANGELOG/Release notes（含 §6）→ tag/Release（captain 执行）→ 发布后补 90 秒真人门与音频盲测（P1）。
- 禁止在 M7 改锁定数量与玩法规则；如需改，走 tech-spec §17.2。

---

## 附录：本次复检命令与输出

```bash
npm run typecheck     # exit 0
npm test              # Test Files 26 passed / Tests 268 passed
npm run build         # ×2，均 exit 0，sha 2d2d91c2670b… 两次一致
npm run validate      # 14/14 rules passed（1021.0 KiB，sha256 2d2d91c2670b）
sha256sum dist/girls-band-live.html index.html   # 同 sha 2d2d91c2670b…
```

浏览器：Chrome（file://，无 dev 参数）启动→主菜单→演出→升级→暂停→回主菜单；`?dev=1` 快进 37,200 tick 至结算（complete/C，picks=10）→「再演一场」。两次 console 均 0 条、Network 均 1 条文档请求。

> 门禁只写本报告；未修改任何代码或文档。以上数字均为本次独立复跑所得。
