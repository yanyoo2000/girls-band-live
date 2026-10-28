# M6 候选版报告（t108 集成修复）

- 日期：2026-10-28
- 角色：技术总监（候选版集成）
- 基线：t106 构建骨架（单文件可 `file://` 启动）
- 结论：**候选版可审查**。四命令全绿，单文件 1,017.5 KiB，`file://` 完整流程（启动→主菜单→演出→移动/移光→升级→暂停→结算→重开）无控制台错误。

---

## 1. t106 六项集成问题的处理

| # | 问题 | 处理 | 证据 |
| --- | --- | --- | --- |
| 1 | 音频时钟语义不一致（engine 用 startTime/state.segment；store 传 run.time） | 新增 `src/data/music-clock.ts` 的 `createRunMusicClock`：time = 本局演唱秒数，段落按 `data.segments` 推导。`audio/engine` 的 `positionAt/tickAt` 与 `platform/bootstrap` 的降级时钟都复用它；engine 只保留 `now()`（AudioContext）与 `isRunning()`。静默段、失谐降级、音频总线未动 | `tests/clock.test.ts` 新增 2 条：engine 时钟按 time 推进 overture→verse→chorus→bridge→finale；engine 与 fallback 在 8 个时间点逐项相同。file:// 实跑：`run.segment` 依次为 verse/chorus/bridge/finale |
| 2 | HUD 由 main 的 100ms 定时器发布 | `ui/bridge.ts` 订阅 `store.subscribeHud`，在 store 每次发布时调用 `bridge.publishHud()`（内部仍有 100ms 闸门 → ≤10Hz）；main 删除 `setInterval` 与相关清理 | 代码检索无 `setInterval`/`hudTimer`；file:// 中暂停面板读到 0:36、升级面板实时出现，React 未在 rAF 中 setState |
| 3 | canvas 层级/pointer-events 靠 main 注入 | 固化到 `src/styles/base.css`：`#game-canvas` 固定铺满 z0、`pointer-events:none`（输入由 `#root` 冒泡给 input-dom）；`#root` 固定 z1；`.app` 背景透明。main 删除 `injectLayoutStyle` | `styles/base.css` 的「3D 画布与 React 层级」段；file:// 菜单/演出截图可见舞台透出 |
| 4 | `game/loop` 以 type-only import 引用 `three/renderer` | `FrameRenderer/RenderStats/RendererInfo` 移入 `src/types/game.ts`；`three/renderer.ts` 实现并从 types 再导出（API 不变）；loop 只 import types | `game/loop.ts` 无 three import；`check-layers` 恢复“game 零 three 依赖”（不再需要 type-only 豁免） |
| 5 | validate R7 注释 URL 豁免 | 保留两处文档引用豁免（React error docs、Three AgX GLSL 注释），并新增“脚本正文不得出现 src/href/new URL 指向 http(s)”三条运行时外链断言 | `validate: 14/14`；DevTools Network 只有 `file:///…/girls-band-live.html?dev=1` 一条文档请求，无外部请求 |
| 6 | 30/768 人气时白光 0.82，前 90 秒洗白 | `computeWhiteout(audience, capacity, peak)` 改为**峰值基准**：`0.85×(1−a/max(1,peak))`；store 的 HUD 与渲染快照都传峰值；`RenderSnapshot` 新增 `whiteout` 字段，renderer 不再自行推导 | 开局 30 人：旧值 0.8168 → 新值 **0**；800×450 的实机截图对比（修复前后）可读性恢复；`tests/hud.test.ts` 增加峰值/开局/掉半/超峰值断言 |

## 2. 四命令（2026-10-28 04:1x）

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm test` | 24 文件 / 263 测试全过（含 f3-bot 4、seat-layout 21、ui-smoke 3、clock 15、hud 11、新增 levelup 1） |
| `npm run build` | exit 0；`build-single` 写出 `dist/girls-band-live.html` 与根 `index.html` |
| `npm run validate` | `validate: 14/14 rules passed`（1,017.5 KiB，sha256 `9277a8003eb8…`） |

- 单文件 **1,041,922 bytes（1,017.5 KiB）**，≤2MB；根 `index.html` 与 dist 字节一致。
- 连续两次构建 sha256 均为 `9277a8003eb8…`（可重复）。

## 3. file:// 冒烟（Chrome，最新构建 `?dev=1`）

1. 启动页 → 点击开始 → 主菜单（四成员/最佳记录）；
2. 开始演出：舞台/HUD/四区点出现，白光不再洗白；
3. 键盘移动 + 鼠标移光：镜头、光池、四区点变化；
4. 升级：扫光 4 区 8 个代表座位 → 30.6s 触发第一次三选一（回照/合唱墙/引线），点选“回照”后回到演出；
5. 暂停：Esc → “先喘一口气（0:36 · 序曲）” → 继续；
6. 结算：快进到 570s（9:30），ending=complete、grade=C、终场 259 人、9:30；后台四句与真实数据一致；
7. 重开：点击“再演一场”→ 新局从序曲开始、核心未定、白光 0；
8. 全程 **console 0 条消息**；Network 仅 1 条 `file://` 文档请求。

> 快进使用 `?dev=1` 暴露的 `__gbl.store` 在 DevTools 中按固定步长推进模拟（只用于 QA 证据），正式构建默认无此入口、无需快进。

## 4. 剩余风险 / 给后续任务

1. **90 秒门与人类手感（AC-13/H01）**：仍需真人实测；本次只验证了模拟链路与 UI。
2. **性能与音频听感（AC-T14–17 / AC-18）**：单文件 1MB、draw call 未在本次复测（t89 实测 27）；音频盲听 A/B 未做。
3. **HUD 发布频率**：store 每拍通知 + bridge 100ms 闸门，实测 ≤10Hz；若后续把 store 改为更密通知，桥仍会限流。
4. **文档口径**：`RenderSnapshot.whiteout`、`FrameRenderer` 迁入 types、峰值白光、audio 时钟语义属于技术方案变更，需在 M6/M7 同步 `docs/tech-spec.md`（本任务不改 docs）。
5. **视觉**：开局白光不再洗白，但白光改“峰值基准”后，满场（768）不代表满血；若产品要求“按场馆容量”，需在 M7 重新定义并同步 GDD 文案。
6. **t97 记录的 D7 和弦表、D8 draw call、D9 纹理**未在本任务处理，保持 backlog。
