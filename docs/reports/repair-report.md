# M6 修复报告：whiteout 口径与空场结算（t113）

- 日期：2026-10-28
- 角色：技术总监
- 起因：M6 验证（t109）发现 **AC-F08 high**（白光公式与实现冲突）与 **结算 records 双写 medium**
- 结论：两项均已修复；四命令全绿；AC-F08 不再构成 blocker。

---

## 1. AC-F08：白光是峰值基准（保留候选版实现）

**实现（未改代码，只同步文档口径）**：`computeWhiteout(audience, capacity, peakAudience?)`，`peak` 缺省为 capacity；store 传 `max(stats.peakAudience, present)`。HUD 与 `RenderSnapshot.whiteout` 同源，renderer 不再自行推导。

| 场景 | 旧固定公式 `0.85×(1−a/768)` | 新峰值公式 `0.85×(1−a/max(1,peak))` | 结论 |
| --- | ---: | ---: | --- |
| 开局 30 人（peak=30） | 0.8168 | **0** | 前 90 秒不再洗白 |
| 峰值/满场（a=peak） | 0.8168（30 人时） | **0** | 满血无白光 |
| 掉到峰值一半 | 0.425（若容量=峰值） | **0.425** | 与旧公式在满场基准下数值一致 |
| 空场（a=0, peak=30） | 0.85 | **0.85** | 死亡视觉不变 |

**同步的三处文档**：
- `docs/acceptance.md` AC-F08：改为峰值基准与 0/0/0.425 三个数值，明确旧固定公式作废；
- `docs/tech-spec.md` §14.3：签名加 `peakAudience?`、数据流“HUD 与 RenderSnapshot 同值”、断言补 `(30,768,30)=0`、`(15,768,30)≈0.425`、`(0,768,30)=0.85`；§11 #13 测试说明同步；
- `docs/gdd.md` §12.2：白光实现改为峰值公式，注明旧公式作废。

**验收状态**：AC-F08 的 blocker 解除；文字与实现一致，`tests/hud.test.ts` 11/11（含峰值断言）。

## 2. 空场结算：save 层唯一权威（删除 bridge 双写）

**旧问题**：`src/ui/bridge.ts` 在 `run-end` 时自行 `clears + (ending !== 'interrupted' ? 1 : 0)` 并写存档；`game/save.ts updateRecords` 只在 `complete` 加 `clears`。空场局被 bridge 多记一次 clears（t109：clears 2→3）。

**修复**：
- **删除 bridge 的 records 写入**（不再构造 `nextRecords`、不再调用 `deps.save.save`、不再写 `lastRun`）。
- bridge 只在 `run-end` 后延迟一个事件循环 `deps.save.load()`，用新记录刷新菜单/曲目单；记录由 `store.finishRun → save.updateRecords` 唯一写入。
- 口径：`complete` +1 `clears`；`empty-house` 只 +1 `emptyHouse`；`interrupted` 两者都不加。

**测试（`tests/save.test.ts`，16/16 通过）**：
- 新增「空场 + 完整两局」链路：空场后 `clears=0/emptyHouse=1`；再完整后 `clears=1/emptyHouse=1`；再空场 `clears=1/emptyHouse=2`；再完整 `clears=2/emptyHouse=2`。
- 保留原有「完成 +1 clears」「空场只 +emptyHouse」「中断不评级」断言。

**file:// 实测（本机，清空 localStorage 后连续三局完整终曲）**：
`records.clears` 依次为 1 → 2 → 3（每局只 +1，无重复写）；`emptyHouse` 保持 0；菜单 `最佳记录` 与存档一致。空场路径由 save 单测锁定（空场不进入 bridge 写入路径）。

## 3. 低危两项

- **lastRun.date 本地时区**：`save.ts` 新增 `localDateStamp()`；`updateRecords` 在日期非法/空串时回退本地 `YYYY-MM-DD`（store 传 `''` 时不再写空串）。file:// 实测 `lastRun.date = 2026-10-28`（本地），旧 UTC 实现会写 2026-10-27。tech-spec §8.3 已注明“本地时区 + 唯一权威”。
- **dwellRewardRatio 负值**：tech-spec §12.2 指标表与 §14.1、GDD §11.2 埋点均注明“负值 = 停住期人气净下降（停住净损失），是预期证据，不是阈值失败”。验收通过线仍为 `<0.75`。

## 4. 四命令（本次实跑）

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm test` | 24 文件 / 264 用例全过（save 16、hud 11、f3-bot 4、seat-layout 21、ui-smoke 3 等） |
| `npm run build` | exit 0；`dist/girls-band-live.html` 与根 `index.html` 均 1,041,592 B（1,017.2 KiB） |
| `npm run validate` | `validate: 14/14 rules passed`（sha256 `307d4e709c50…`） |

- 单文件 ≤2MB；本次未改构建/依赖，`tools/*` 与 package 未动。
- `file://?dev=1` 打开正常：主菜单→开始演出→（QA 快进）结算；console 0 条消息；Network 仅 1 条 `file://` 文档请求。

## 5. 是否仍有 AC-F08 blocker

**没有。** AC-F08 已改为峰值基准并与实现、HUD、RenderSnapshot、renderer 四处一致；旧固定公式在 acceptance/tech-spec/GDD 三处均标注作废。剩余风险不在本任务：90 秒真人门、性能/音频盲听、Chrome/Firefox 兼容仍按 t109 的 blocked 清单留给后续。
