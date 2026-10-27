# M5 集成注意事项（候选版必读）

> 来源：t88–t95 的任务报告与工程师消息。只记录跨模块约束，不重复实现细节。候选版集成时必须逐条核对。

## 1. Three / 渲染（t89）

1. **装配顺序**：`main` 必须先创建 `scene/camera/instancing/fx` 四个工厂，再让 loop 首次 draw；`renderer` 每次 draw 惰性绑定。顺序反了会拿到空句柄。
2. **座位镜像未解**：`models.buildSeats` 的 col→+x 与相机朝 +z 叠加后，data 的 front-left 会落在屏幕右侧，与 GDD §6.2 相反。t103 必须同时改 `three/models.ts` 与 `three/instancing.ts` 的座位布局，两处坐标逐字一致；seat-layout 测试要加“front-left 在屏幕左/前”的方向断言。
3. **NDC 约定**：`toStage(ndc)` 用 `ndc.x=屏幕横轴`、`ndc.z=屏幕纵轴`；`input-dom` 反投影按此传。
4. **数据帧**：`NoiseFrame.kind` 按 `NoiseKind` 声明顺序（0 底噪…4 静默），position stride 2；`ParticleFrame.position` 期望 xyz（xz 可降级），color 为 RGB 字节。
5. 白光遮罩由 `AudienceFrame` 推导（快照无 whiteout 字段），shader 白混合 ≤30%，保三色可读；灯光态由 `silenced + venueLight` 派生。

## 2. 战斗 / 波次（t90）

1. `light.ts` 需消费 `enemies.lightEatRatio()` 与 `stageBlackoutRemaining()`，否则“失真吞光/光灭”只在逻辑里成立、画面不可见（A07）。
2. 刷怪必须走 `updateSpawner`（池化入口）；不要用 `updateWaves` 直建实体，否则 `updateEntities` 用 `pool.active` 重建 `run.noises` 会丢实体。
3. `BossEvent` 映射按 `boss.ts` JSDoc：`bus=enter` / `light|people=advance` / `retired=retire`。
4. `BalanceConfig` 尚缺 6 个 GDD 数值（点燃基数 6、合唱波 12m、四区 ×1.5、热度 4 ×1.25、连锁 6m、返听裂缝 −20%），当前为文件顶部具名常量；候选版可迁移到 `data/balance.ts` 或保留并注明。

## 3. 成长 / 卡池（t91）

1. store 整局必须持有**同一个 BuildState 对象**；经验账本按对象身份，禁止每帧克隆。
2. 升级流程：`addExperience → run.phase/offer → applyCard → 清 offer`；进化由 store 在 `applyCard` 后发 `EvolutionEvent` 并置 `evolutionFired`。
3. `audience.ts` 两处 `cards.includes('heat-cap')` 应改用 `heatCapFor`；`combat.ts` 本地 `sumModifiers` 可换 `collectModifiers`。
4. `upgrades.ts` 额外导出 `modifierTotals`（避免循环依赖），属已批准偏差。
5. `cards.ts` 头注释把 `shield-max` 写成 max，实际加法 60+60=120，候选版修正注释；AC-09 的“最多见 12 张”按“获得 10 + 首轮未选 2 核心”核对。

## 4. 音频（t94）

1. 额外导出：`applyAudioMix(engine,{master,music,sfx})`（设置变更/启动时调用，master=0 静音）与 `setAudioHostHidden(engine,hidden)`（visibilitychange/blur 降到 12%）。
2. `createAudioEngine(data)` 签名未变；settings 由集成层注入。
3. 节点峰值 107（预算 ≤120）；静默总线 0；12 声部池 42 节点。

## 5. 数据（t92）

1. API：`data`、`buildDataRegistry()`、`validateData()`；另有 BALANCE/LIGHT_FORMS/HEAT_LEVEL_RULES/GRADE_RULES/CHOIR_WAVE_RULES/MEMBER_RULES/LINE_RULES/CARD_RULES/OPEN_TUNING/RETURN_LISTENER_RULES/STAGE_LAYOUT/CLIMAX_EVENTS/OPENING_HOOKS/WAVE_TABLE/MODIFIER_UNITS 等规则常量。
2. GDD 和弦冲突已按“每第 4 小节七和弦”处理：副歌 `Am–F–Dm–Am7 | Am–F–Cmaj7–G7`，E 移到桥段；不要改回 Am–F–Dm–E。
3. 段落边界用 GDD 秒数（非整小节）；音频换层最多滞后 1.875s。

## 6. 座位坐标（t103）

1. 唯一真源：`data/seats.ts` 的 `seatPositionAt/seatPositionOf/seatAtPoint`，`aisleGap=0.7`，`origin.x=−9.96`。
2. 删除 `audience.ts`/`waves.ts` 的同名实现、`instancing/models` 的 `SEAT_AISLE_GAP` 与 `*_FALLBACK_*`/`useFallbackOrigin`。
3. `light.ts` 反算与 `enemies.ts` 目标座必须走 data API；`store.ts` import 改 data。
4. 测试：`tests/seat-layout.test.ts`（768 round-trip、576×0.7、x 中心 0±1e-6、front-left 方向、light/zoneAtPoint 跨走道）。
5. t97 只按 4 条精确 grep 验收，不用 `0.7/0.8/0.35/SEAT_` 裸匹配。

## 7. QA（t96）

- 19 个 `tests/*.test.ts` + `docs/qa/unit-report.md` + `docs/qa/verification-report.md`；不创建 seat-layout 测试（归 t103）。
- 四命令：`npm run typecheck`、`npm test`、`npm run build`、`npm run validate`；build/validate 需候选版先落地 `vite.config.ts` 与 `tools/*`。

## 8. 当前状态

- 全仓 `tsc --noEmit` 0 错误（2026-10-28 03:0x）。
- 已建 81 个 `src/` 文件；候选版尚缺 `src/main.tsx`、`src/index.html`、`src/platform/*`、`vite.config.ts`、`tools/{build-single,validate,check-layers}.mjs`、根 `index.html`、`dist/`。
- t96/t97/t103 为 M5 收口关键任务；t103 未完成前 t97 不得通过。
