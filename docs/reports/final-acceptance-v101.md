# v1.0.1 最终验收报告 — 签核（t149 / 制作人）

- **日期**：2026-10-28（Asia/Shanghai）
- **签核对象**：v1.0.1 发布物 `dist/girls-band-live.html`（= 根 `index.html`），**1,084,885 B（1,059.5 KiB）**，SHA-256 `25422f523607dacf613cc660cdf629292fffb5888f4cd4f9a36583a907099e51`，构建元信息 `girls-band-live v1.0.1 build:inline`。
- **依据**：t147 最终审查（verdict=pass，5 findings）、t145 验证、t146 实机复测、t148 发行文档（README/CHANGELOG/release-notes/release-checklist/v1.0.1-release）、`docs/reports/v1.0.1-rc.md`
- **写入**：仅本文件；未改代码/文档，未运行 git

---

## 0. 结论：**SIGNED-OFF（v1.0.1 可发布）**

在冻结产物上真实运行四命令、完成 `file://` 全流程（含序曲教学、三形态、人气读数、暂停/Tab 构筑、结算/重开），并核对 t147/t145/t146 证据与 t148 文档。**无 blocker、无 high**；t147 的 5 条 findings（4 medium + 1 low）均为 P1/defer，不阻塞发布。

**不把「机器通过」写成「验收全绿」**：本次未复现安可窗口（由 t145/t146 证据覆盖）、未截到教学第 3 步（30s 轮播已过）、未复跑纯键盘 9:30（t146 已跑通）、像素亮度与音频听感以 QA 报告为准。defer 清单见 §5。

---

## 1. 产物与四命令（本次实跑）

| # | 命令 | 退出码 | 关键输出 |
| --- | --- | --- | --- |
| 1 | `npm run typecheck` | **0** | `tsc --noEmit` 无错误 |
| 2 | `npm test` | **0** | `Test Files 30 passed (30)` / `Tests 294 passed (294)` / 3.07s |
| 3 | `npm run build` ×2 | **0 / 0** | 两次均 `build-single: 1059.5 KiB (sha256 25422f523607)`；`dist/girls-band-live.html` 1,084,885 B；**两次 SHA 完全一致**；根 `index.html` 同步 |
| 4 | `npm run validate` | **0** | `validate: 14/14 rules passed（1059.5 KiB，sha256 25422f523607）` |

- `package.json` version = **1.0.1**；单文件含版本标记 `girls-band-live v1.0.1 build:inline`。
- 构建后 SHA 与 t144/t147/t148 冻结值**完全一致**，源码/产物未漂移；单文件 1,059.5 KiB ≤2MB。

---

## 2. `file://` 全流程（本次独立实跑）

### 2.1 正式路径（Chrome，无 `?dev`）

1. 打开 `dist/girls-band-live.html` → **ViewportGate「窗口太小」**（当前窗口小于 1024×640）：文案、`仍然继续（可能看不清）`、`回主菜单` 均可用；点击继续后正常进入启动屏。
2. 启动屏 `点击开始` →（声音已解锁，按钮变 `进入后台`）→ 主菜单（最佳记录 356 / B / 9:30）。
3. `开始演出` → 序曲 HUD：
   - **教学第 1 步**「散光养人」+「移动鼠标或 IJKL 移光；松开左键就是散光，被照到的人会留下来。」
   - 按 `J` 后推进到**第 2 步**「束光烧人」+「按住左键或 Shift＝束光，光里的观众会被烧；松开才养人。」
   - **三形态格常驻**：散光/养人、束光/烧人、回照/护盾；
   - **人气读数**：「人气持平；空位剪影」+ aria「人气持平。光形态散光。前左区热度灭…」；
   - **键盘提示**：「IJKL 移光 · Shift 束光 · Enter 点燃」「Esc 暂停 · Tab 构筑 · Space 终曲」；
   - 四区状态含「亮灯偏暗，有人在等你」。
4. `Esc` 暂停（0:38 · 序曲）：面板含「当前构筑」与「与 HUD 底部构筑条同源：核心、最近卡、转化/烧死记账」，底部提示「Tab 打开构筑并聚焦此处」。
5. 继续后按 `Tab`：**真的打开暂停面板并聚焦「当前构筑」region**（不再只是移焦点）——与提示一致。
6. 正式路径 **console 0 条**；**Network 仅 1 条** `file:///…/dist/girls-band-live.html` 文档请求。

### 2.2 结算与重开（`?dev=1` 快进，等价 t144/t145 做法）

- 快进 38,400 tick（640s 上限）→ `phase=results`、`time=570.0`、`ending=complete`、`grade=C`、picks=8。
- 结算页实测：峰值 135 / 终场 135 / 转化 121 / 烧死 1273 / 转化-烧死 9% / 被覆盖 93 / 离场 0 / 空位 633 / 第二排 26 / 安可未用 / 裂缝 3 / 9:30；后台四条文案完整。
- 点「再演一场」→ **t=0.7、picks=0、core=null、emptySeats=738（30 人）**，教学重新出现——重开不串局。
- dev 页 console 0 条、Network 1 条 `?dev=1` 文档请求。

### 2.3 本次未覆盖（以 QA 证据为准）

- **安可窗口**：本轮快进路径未触发（t145「人气告急→安可/继续独奏→empty-house」、t146「白光 1.0→0.028」已实测）。
- **教学第 3 步「点击点燃」**：30 秒轮播在本轮采样时已结束（t143/t145 已记录三步齐全）。
- **纯键盘 9:30**：t146 已跑通（0 次指针、C/峰值 170、9 次三选一）。
- **亮度像素值**：以 t145 实测 65.02/54.88/60.04 为准。

---

## 3. 修复项证据核对

| 项 | 证据 | 判定 |
| --- | --- | --- |
| 可见性（光/观众/噪音/四区） | t145：全帧 65.02、观众席 54.88、舞台 60.04（验收 ≥32/32/35）；束光/散光观众区差 30.62/255、80.84% 像素差 ≥6；t146 光池与束光 +7.9% 实机 PASS | **通过** |
| 人气读数与空场预警 | 本次实机见「人气持平/空位剪影」；t145 字段 audienceTrend/audienceLow/emptySeats/secondRow/zoneOccupancy 齐全、战斗 HUD DOM 数字=0；t146「人气下降/快见底/安可窗口」PASS | **通过** |
| 卡效果接线 + 统计同源 | `modifier-wiring` 8/8；t145 实拿 second-row/shield，峰值 30→356；HUD emptySeats 412/secondRow 23 与 RunResult 一致 | **通过** |
| 返听锁定可解 | t146：t=28 锁定 → 移光约 8m → t=30 解锁 + toast「挣脱返听。光又归你了。」；f3-bot 4/4（camp 30→7 / sweep 30→40） | **通过** |
| 安可窗口 | t145/t146：归零先 `paused + waitEncore`，安可恢复白光 1.0→0.028，继续独奏→empty-house | **通过**（本次未复现，采信 QA） |
| 三形态/护盾 | 本次实机三格常驻；t146 回照「护盾」+ is-shield/is-cooldown meter + 独奏文本 PASS | **通过** |
| 键盘等价 | 本次 J/Shift/Enter 生效（教学推进）；t146 纯键盘 9:30 PASS（C/峰值 170/9 次三选一） | **通过** |
| 失焦/小窗 | 本次 ViewportGate 可用；t143/t145 blur→paused；900×560 Gate 可继续/回菜单 | **通过**（失焦以 QA 模拟证据为准） |
| 暂停/构筑/账条同源 | 本次 Tab 真开面板并聚焦构筑；t145 hud↔run.stats↔结算同源单测通过 | **通过** |
| 音频收尾 | t140 参数+测试全过（空场 0.22+心跳、静默 16s 兜底、合唱 0.38、duck）；人耳听感仍 defer | **部分（人耳 defer）** |

---

## 4. t147 审查与 findings

- t147 verdict = **pass**，0 blocker / 0 high。
- 5 条 findings 全部 `resolved=false`、P1/defer：
  - REV-M1 成长后段偏空（第 10 次常不来）；REV-M2 评级可达性（B 需 ≥300，A/S 不可控）；REV-M3 第二排/合唱墙/引线单局未 offer；REV-M4 断线无方位指示；REV-L1 点燃命中无短闪。
- 这些与 captain 允许的 defer 列表一致（峰值>300/A-S、2.5s 唱化、卡 offer 随机、断线方位、点燃视觉）。

---

## 5. defer 清单（必须写入 Release notes，不得伪装 pass）

1. **峰值 >300 / A-S 评级可达性**：v1.0.1 完整局峰值 109–356；B 需终场 ≥300，A/S（450/600）仍不可控，需产品调经济/评级公式。
2. **2.5s 唱化**：12HP 底噪 vs 24dmg/s 仍 0.5s 死，未动 HP/伤害（避免破坏 f3/点燃手感）。
3. **卡 offer 随机**：第二排/合唱墙/引线单局可能抽不到，玩家与 QA 无法单局确认；建议调权重/保底（P1）。
4. **断线方位指示**：仅文字「靠近队友按 E」，无方位/边缘箭头（P1）。
5. **点燃命中短闪**：仅音效/冷却 meter，瞄准点无一拍短闪（P1）。
6. **人耳音频**：5 层/12 声部/静默/空场音乐仅参数与测试断言，无听感验收。
7. **性能人测**：1920×1080、连续 3 局、集显/Firefox 未测；仅有 1280–1920 渲染指标与 131–145fps 采样。
8. **90 秒真人门**：仍需 10 名外部新玩家，AI/脚本不能替代。
9. **AudienceFrame.lit 逐座数组**：未加，t143 以 zoneLightRatios + lightCoverage 近似。
10. **暗室观感**：t142 亮度已达标，但暗室人眼观感未确认。

---

## 6. 文档 / 版本 / Release notes / 附件一致性

| 项 | 结果 |
| --- | --- |
| `package.json` version | **1.0.1** ✔ |
| 单文件版本标记 | `girls-band-live v1.0.1 build:inline` ✔ |
| 根 `index.html` | 与 dist 单文件同 SHA（1,084,885 B）✔ |
| `README.md` | v1.0.1 状态、1,084,885 B/`25422F52…`、序曲三步教学、键盘/失焦/Tab/小窗、10 条已知限制 ✔ |
| `CHANGELOG.md` | `[1.0.1] — 2026-10-28` 条目（Added/Changed/Fixed/Known issues/Verification/Upgrade），保留 1.0.0 历史 ✔ |
| `docs/release-notes-v1.0.1.md` | 下载/运行、修复清单、验证摘要、defer、升级说明 ✔ |
| `docs/reports/v1.0.1-release.md` | 产物/四命令/file://、11 步发布流程、U1–U5、defer、回滚 ✔ |
| `docs/release-checklist.md` | 已更新 v1.0.1（产物/四命令/单文件/file:///Release 附件/Pages/回滚/签核）✔ |
| GitHub Release 附件路径 | `dist/girls-band-live.html` 存在（1,084,885 B / `25422f52…`）；仓库无 `.github/`，Release 由制作人手工创建 ✔ |
| 小问题（low） | `release-checklist.md` 无独立「v1.0.1 最终验收」勾选行，建议发布时补一行指向本报告 |

---

## 7. 签核与后续

**SIGNED-OFF：v1.0.1 可以发布。**

- 制作人执行：commit（`chore(release): v1.0.1`）→ annotated tag `v1.0.1` → GitHub Release（附件 `dist/girls-band-live.html`，正文用 `docs/release-notes-v1.0.1.md` + 10 条 defer）→ 更新 Pages（同一 URL）→ 勾选 checklist。
- 用户确认：许可证（当前无 `LICENSE`）、Release 附件命名（`who-is-listening-v1.0.1.html` 或原名）、Pages 部署、商标检索。
- tag 前复核：`1,084,885 B` / `25422f523607dacf613cc660cdf629292fffb5888f4cd4f9a36583a907099e51`；若字节变化停止发布并重跑四命令 + file://。
- 发布后：从 Release 下载附件复验 SHA/大小 + `file://` 启动一局；补 90 秒真人门、人耳音频、性能人测（P1）。
- 回滚：发现 P0 则标 pre-release/yank，保留 v1.0.0（`2d2d91c2…`）与 t147 审查版（`25422f52…`）作为回退。

---

## 附录：本次验收命令与证据

```bash
npm run typecheck     # exit 0
npm test              # 30 files / 294 tests passed / 3.07s
npm run build         # ×2 exit 0；1,084,885 B；sha 25422f523607… 两次一致
npm run validate      # 14/14 rules passed（1059.5 KiB，sha256 25422f523607）
sha256sum dist/girls-band-live.html index.html   # 同为 25422f523607…
```

浏览器（Chrome，`file://`）：ViewportGate → 启动 → 主菜单 → 演出（教学 1/2 步、三形态、人气读数、键盘提示）→ Esc 暂停 → Tab 构筑聚焦 → 继续；`?dev=1` 快进 38,400 tick → 结算（complete/C/570.0s/峰值 135）→ 再演一场（t=0.7/picks=0/core=null）。两页 console 0 条、Network 各 1 条文档请求。

> 本报告只写 `docs/reports/final-acceptance-v101.md`；未修改任何代码或文档。以上数值均为本次 v1.0.1 产物上的独立复跑结果；未复现项已明确标注来源。
