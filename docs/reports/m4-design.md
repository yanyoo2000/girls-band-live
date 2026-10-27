# M4 v2 门禁复检报告：设计、类型与验收一致性

- **门禁**：M4 v2（t87，第 2 次尝试）· 制作人门禁
- **日期**：2026-10-28
- **性质**：对首次门禁（2026-10-28 02:15，结论「不通过」）的复检；本报告取代旧报告。
- **依据**：`docs/brief.md`、`docs/gdd.md`、`docs/tech-spec.md`、`docs/acceptance.md`、`docs/art-direction.md`、`src/types/*.ts`、`docs/decision/selected-concept.md`
- **口径**：只判断设计能否作为 M5 的唯一施工依据；不重新评审创意，不以固定数量扣分；纯桌面、零外部素材、离线单文件是底线。
- **改动**：本报告只覆盖 `docs/reports/m4-design.md`；未改任何设计文档或类型文件；未运行 git、未安装依赖。

---

## 0. 结论

**通过。可以进入 M5。**

首次门禁的两个阻塞项均已修复并由本次复检独立验证：

- **B1（已关闭）**：tech-spec 的「文件清单 ↔ 模块签名」已对齐。§5 现有 **42 个模块签名**（game 20、three 6、audio 5、ui 5、集成 5、资产 1），§4 的每个逻辑/服务/生成模块都有签名；新增 `entities.ts`、`waves.ts`、`upgrades.ts`、`save.ts`、`music.ts`、`bootstrap.ts`、`copy.ts`、`App.tsx`、`procedural.ts`；§4 末尾用一段说明界定了「内容表/样式/React 屏幕组件/CLI 脚本」不设函数签名的原因。
- **B2（已关闭）**：GDD 的 §4 锁定内容已补齐到 P0 与验收。新增 **A23–A27**（3 进化 / 3 构筑 / 4 档评级 / 5 段·3 灯光态·1 曲目 / 热度 0–4），acceptance 新增 **AC-23–AC-27**，合计 **68 项**；GDD §23.1 与 acceptance §0.1 双向映射一致，热度口径统一为 0–4（常态 0–3，4 仅 `heat-cap` 解锁）。

**附带 2 条 M5 第一周必办 + 4 条低风险口径修正**（均不阻塞 M5 开工，见 §3）：`tsconfig.json` 落地、90 秒指标补齐；贴图计数/`Chord` 命名/版本标签/`@types/node` 口径。

---

## 1. 六项检查结果

| # | 检查项 | 结果 | 说明 |
| --- | --- | --- | --- |
| 1 | GDD 自行锁定最终内容规模并逐项定义 | **通过** | 938 行；§4 共 21 项（含热度 0–4 澄清）；A01–A27（22+5）；F1–F13；无占位 |
| 2 | tech-spec 锁定 13+ 模块接口、三层边界、数据/存档 schema、构建/测试/单文件、依赖清单 | **通过** | 1,647 行；42 个签名；边界/依赖矩阵；24 卡与 `gbl.save.v1`；validate 14 条；Vitest 19 模块；新增依赖 0 |
| 3 | `src/types` 存在且与 tech-spec 一致 | **通过** | 4 文件 / 1,887 行；严格 tsc exit 0；24 个 `CardId` 与 §7.2 零差异；`HeatLevel 0–4` 有注释 |
| 4 | acceptance ≥40 项、覆盖 GDD 锁定内容、每项可执行 | **通过** | 68 项（20 工程 + 22 P0 + 5 补充 + 13 修复 + 8 人测）；AC-23–27 补齐五类内容；每行有前置/步骤/通过线/证据 |
| 5 | art-direction 可落地、资产映射到文件、无外部素材 | **通过** | 56 条资产映射到 `procedural.ts` / `models.ts` / `theme.css`；无外链；预算 38/45/60 draw call；锁帧与降级明确 |
| 6 | 四份文档互相矛盾、TBD/未决接口、移动端残留、数量缩水/膨胀 | **通过（附 6 项低风险口径）** | 无 TBD；无移动端要求；无「无故」缩水/膨胀；剩余 6 项均为文档口径级，见 §3 |

---

## 2. 前次阻塞项复核（逐条证据）

### 2.1 B1：文件清单 ↔ 模块签名（已关闭）

- `tech-spec §1.1`：改为「**42 个模块**（game 20、three 6、audio 5、ui 5、集成 5、资产 1）」。
- `tech-spec §5`：实测 42 个 `// src/`/`// tools/` 模块头，去重 42；此前缺失的模块均已有签名：
  - `game/entities.ts`（§5.1）、`game/waves.ts`（§5.3）、`game/upgrades.ts` 与 `game/save.ts`（§5.2）、`audio/music.ts`（§5.5）、`platform/bootstrap.ts`（§5.7）；
  - 同时补了 `ui/copy.ts`、`src/App.tsx`、`assets/procedural.ts` 的签名/归属。
- `tech-spec §4`：文件清单现含 `App.tsx`、`ui/hooks.ts`、`ui/copy.ts`、`platform/bootstrap.ts`；§4 末尾说明：`src/data/*` 由 `DataRegistry` 约束、`src/styles/*` 由 token 约束、`screens/components` 由 props 契约约束、`index.html` 为入口、`tests/*` 由 §11 约定、`validate.mjs`/`check-layers.mjs` 为 CLI 脚本——因此不需要函数签名。
- `tech-spec §11`：必测模块从 14 增到 **19**；`acceptance AC-T02` 已同步为 19。
- `tech-spec §18`：自检改为「§4 每个逻辑/服务模块都有签名（42/42）」。
- 复核结论：**§4/§5/§1.1/§11/§18/AC-T02/AC-F10 七处一致，B1 关闭。**

### 2.2 B2：GDD 锁定内容 ↔ P0 ↔ 验收（已关闭）

- `gdd §20.1.1` 新增 **A23–A27**，每条带可验收通过线：
  - A23 3 个进化：各触发 1 次、效果按 §10.3、每局 ≤1 次；
  - A24 3 条构筑：各跑 1 局、完成终曲且 ≥B、至少两项差异 ≥15%；
  - A25 4 档评级：S/A/B/C 各 1 局 + 599/600、449/450、299/300 边界；
  - A26 5 段 / 3 灯光态 / 1 曲目：事件日志逐项；
  - A27 热度 0–4：无卡 0–3、持 `heat-cap` 可达 4，HUD 双闪+外环。
- `gdd §23.1` 新增「B2 五项 ↔ A23–A27 ↔ AC-23–AC-27」映射表；`§22.4` 与 `§24.3` 同步要求覆盖 A01–A27 + B2 五项。
- `acceptance`：
  - 新增 **AC-23–AC-27**（每行 6 列：ID/前置/步骤/通过线/优先级/证据）；
  - 总数 **68**（20 工程 + 22 P0 + 5 补充 + 13 修复 + 8 人测），无重复 ID（68 unique / 68 rows）；
  - §0.1 追溯表新增「GDD §20.1（22+5）→ AC-01–22 + AC-23–27」与「GDD §4 21 项 → AC-23–27」；
  - §0 第 7 条与 AC-27 统一热度口径；§7 覆盖自检更新为 68 项、A01–A27、21 项锁定内容。
- `gdd §7.5` 新增热度 0–4 的统一口径表；`§4` 的「热度状态 4（0–3）」改为「4 档常态（0–3）+1 卡档（4）」，并注明原表述为口径笔误、非扩量。
- 复核结论：**五类缺口逐条有 A 项 + AC 行 + 映射；B2 关闭。**

---

## 3. 剩余 6 项（不阻塞 M5，但必须落账）

| # | 项 | 现状 | 风险 | 处理 |
| --- | --- | --- | --- | --- |
| C1 | `tsconfig.json` 尚未创建 | 根目录无该文件；`tech-spec §2.1` 已给出完整内容；按 production-plan 属 M6 集成交付 | M5 期间 `npm run typecheck` 无法直接运行（AC-T01 会被卡） | **M5 第一周必办**：技术总监先落地 `tsconfig.json`（内容照 §2.1），再让实现任务跑 typecheck |
| C2 | 90 秒指标覆盖 6/8 | `tech-spec §12.2` 定义 8 项；acceptance 的 AC-H01/F03/F04 显式引用 6 项；`dwellP50/P90`、`zoneConversionRate` 无单列通过线 | 90 秒门验收不完整 | **M5 第一周必办**：在 AC-H01 或新增 AC 行补齐两项，或注明由 `gate-90s` 汇总报告统一判定 |
| C3 | 贴图计数 10 vs 13 | `art-direction.md:151` 列 10 条 CanvasTexture，其中「四区地纹 4×64²」若按 4 张计为 13 张；`:168` 预算写「贴图 10」 | 资产预算口径不一致（对 60fps 影响很小） | M5 美术任务统一：四区地纹合成 1 张 atlas，或预算改为 13 |
| C4 | `Chord` 命名 | GDD §22.1 写 `Chord`；types 为 `ChordDef`/`ChordKey`；tech §17.1 已注明 `ChordDef` 对应 `Chord` | M5 按名检索可能多绕一步 | M5 第一周：GDD 改为 `ChordDef`，或保留别名说明 |
| C5 | 版本标签 | GDD/tech/acceptance 均「M4 v1」；`art-direction.md` 标题为「M4 v2」 | 版本追溯混淆 | 统一为 M4 v1（或全部升 v2 并写明变更） |
| C6 | `@types/node` 版本口径 | `package.json` 为 `^24.0.0`；`tech-spec §2` 写死 24.0.0 | dev 依赖漂移（lockfile 已锁实际值） | 技术总监统一为锁定版本；不影响运行时 |

> C1/C2 是 M5 第一周的硬条件：C1 不完成，`typecheck` 无法执行；C2 不完成，90 秒门的验收不完整。C3–C6 可在 M5 内并行修正。

---

## 4. 逐项核对明细

### 4.1 GDD（`docs/gdd.md`，938 行 / 65.7KB）

- **锁定规模：通过。** §4 共 21 项，每项有推导理由：1 可操作主唱 + 4 成员、3 光形态、4 座区/声部、768 席（24×32，4×192）、热度 0–4（4 仅卡解锁）、3 常规噪音 + 1 精英 + 1 Boss 3 阶段、1 场馆 × 5 段 × 3 灯光态、1 曲目、24 卡/10 次/3 核心/3 构筑/3 进化、12 声部、2 真光、180 噪音、9:30、4 评级、3 结局。
- **逐项定义：通过。** §5 角色 4 瞬间、§6 光/四声部、§7 观众/热度/人浪（含 §7.5 热度 0–4）、§8 敌人/Boss、§9 关卡、§10 卡池/进化/构筑、§13 失败/结算、§15 UI、§16 3D、§17 音频、§18 存档、§19 无障碍。
- **P0 与修复：通过。** §20.1 A01–A27（22+5）；§23 F1–F13；§23.1 B2 五项映射；§24.3 给下游的输入已同步。
- **数量变化：无「无故」缩水/膨胀。** 相比 `hybrid-c.md`：1008→768 席（实例/决策理由）、8 卡→24 卡/10 选（修 F1 假构筑）、9–12 分钟→9:30（在 M3 目标内）、4 噪音→3+精英+Boss（第 4 个原本就是 Boss）；4 角色/1 可操作/3 光形态/4 区/12 声部保持。唯一显著缩水（1008→768）有推导且不损失决策。

### 4.2 tech-spec（`docs/tech-spec.md`，1,647 行 / 78.7KB）

- **模块签名：通过。** 42 个唯一模块（game 20、three 6、audio 5、ui 5、集成 5、资产 1）；参数/返回类型精确；`heatCapFor(runtime: UpgradeRuntime)` 等新增接口有定义。
- **三层边界：通过。** §3 依赖矩阵 + §3.2 七条强制规则 + validate R12/R13 机器检查。
- **数据/存档 schema：通过。** §7 24 卡 id 表、`validateData` 穷尽 Record、座位 24×32/四区 192、和弦内音规则；§8 `gbl.save.v1` 四级回退、250ms 防抖、`save.ts` 纯函数签名。
- **构建/测试/单文件：通过。** §10 Vite root=src、零依赖 build-single、validate R1–R14；§11 19 个必测模块（与 AC-T02 一致）；§2 版本与 `package.json` 一致（仅 `@types/node` caret，C6）。
- **依赖清单：通过。** 新增 0；候选库逐个给否决理由。
- **文件清单：通过。** §4 与 §5 对齐；不签名的文件类型有明确说明（内容表/样式/React 组件/CLI）。

### 4.3 类型契约（`src/types/*.ts`，4 文件 / 1,887 行）

- **存在且纯类型：通过。** `game.ts` 903 行、`data.ts` 573、`save.ts` 130、`ui.ts` 281。
- **编译（独立复验）：通过。** `npx tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --noUnusedLocals --noUnusedParameters --noFallthroughCasesInSwitch --noImplicitOverride --verbatimModuleSyntax --isolatedModules --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler src/types/*.ts` → **exit 0**。
- **与 tech-spec 一致：通过。** `CardId` 24 个与 §7.2 集合比较 **零差异**；`LightMode`、`NoiseKind`、`ZoneId`、`SegmentId`、`HeatLevel 0–4` 与 GDD/tech 一致；`ChordDef` 与 GDD `Chord` 的映射已在 tech §17.1 注明（C4）。
- **前置：** 根 `tsconfig.json` 尚未创建（C1）；本次以命令行 flags 复验。

### 4.4 验收矩阵（`docs/acceptance.md`，185 行 / 68 项）

- **数量与唯一性：通过。** 68 = 20 工程（AC-T01–T20）+ 22 P0（AC-01–22）+ 5 补充（AC-23–27）+ 13 修复（AC-F01–F13）+ 8 人测（AC-H01–H08）；无重复 ID（68 unique / 68 rows）。
- **可执行：通过。** 每行含前置、步骤、通过线、优先级、证据；AC-23–27 均为 6 列完整行。
- **覆盖：通过。** AC-01–22 ↔ A01–22；AC-23–27 ↔ A23–27；AC-F01–13 ↔ F1–13；AC-T/AC-H 覆盖工程与人测；§0.1 与 §7 自检同步为 68 项、A01–A27、§4 21 项。
- **遗留：** 90 秒指标 6/8（C2）。

### 4.5 美术方向（`docs/art-direction.md`，204 行）

- **可落地：通过。** 硬光低模、3 秒锁帧（2:00 人浪第 18 帧）、色板/对比度、四名成员 380–520 面与三重辨识、3+1+1 敌人、Boss「没有光」、L0–L8 分层、三灯光态×五段、HUD 六元素、无障碍与禁止事项。
- **资产映射：通过。** 56 条 = CanvasTexture 10 + SVG 13 + 程序化几何 25 + 主题 token 8；分别落到 `src/assets/procedural.ts`、`src/three/models.ts`、`src/styles/theme.css`。
- **无外部素材：通过。** 与 GDD/tech/validate R7–R9 一致。
- **性能：通过。** draw calls 38/45（硬顶 60）、三角面 40k/80k、材质 10/12、粒子 300；降级顺序与 GDD §16.3/tech §16.1 一致。
- **口径：** 贴图 10 vs 13（C3）；版本标签（C5）。

### 4.6 矛盾、TBD、移动端、数量

- **TBD/占位：0。** 全量检索仅命中 `tech-spec:1644` 的自检否定句「没有待补项」。
- **移动端/触屏：无残留要求。** 所有出现均为「不做」或游戏内「手机灯」道具；`acceptance.md:148` 明确触屏缺陷不在验收范围。
- **矛盾：** 前次 B1/B2 已关闭；剩余 C1–C6 均为低风险口径/前置项，不影响 M5 的接口与验收契约。
- **数量：** 见 4.1；无无故缩水/膨胀。

---

## 5. 音频切片与 C 专项（状态记录）

- **技术证据：已有。** `prototypes/audio-slice.html`（5 层、60.000s 整循环、`file://` 0 console 错误、峰值 −2.07 dBFS、削波 0、静音/抽走 RMS=0、五层独奏可测）；`docs/reports/audio-slice.md` 为实测报告。
- **听感：待人类确认。** 报告明确「我没有耳朵」；「想不想跟着抖腿」「少一轨是否疼」只能由 10 人盲听判定。**本门禁不把听感记为通过。**
- **C 专项未做：** 4/8/12 声部 A/B（GDD §17.3、AC-F11/AC-H06）与 90 秒门（GDD §14.2、AC-F04/AC-H01）尚未执行；这两项是 M5/M6 的验收项，不影响 M4 设计门禁的「通过」结论，但 M5 门禁前必须有结论。

---

## 6. 放行结论与 M5 输入

**判定：通过。可以进入 M5。**

**M5 第一周必办（硬条件）：**

1. **C1**：技术总监按 `tech-spec §2.1` 落地 `tsconfig.json`；否则 `npm run typecheck` 无法运行，M5 门禁必挂。
2. **C2**：acceptance 补齐 `dwellP50/P90` 与 `zoneConversionRate` 的判定方式（或注明由 `gate-90s` 汇总报告统一判定）。

**M5 内并行修正（不阻塞开工）：** C3 贴图计数、C4 `Chord` 命名、C5 版本标签、C6 `@types/node` 版本口径。

**M5 必须遵守的输入：**

- 玩法与内容以 `docs/gdd.md` 为准；接口与文件边界以 `docs/tech-spec.md` + `src/types/*` 为准；验收以 `docs/acceptance.md` 的 68 项为准；视觉以 `docs/art-direction.md` 为准。
- 任何接口变更走 `tech-spec §17.2`（类型 + 文档 + 调用点一次提交）；不得私自扩展类型。
- M5 门禁（t97）将复核：`tsc` 0 错、19 个 Vitest 模块、68 项验收的自动化部分、90 秒门与音频 A/B 的结论。

---

## 附录：本次复检的真实执行

- **文件规模**：`gdd.md` 938 行 / 65,703 B；`tech-spec.md` 1,647 行 / 78,680 B；`acceptance.md` 185 行 / 23,196 B；`art-direction.md` 204 行 / 13,286 B；`src/types/*.ts` 4 文件 / 1,887 行。
- **计数**：GDD §4 锁定 21 项；A 行 27（22+5）；F 行 13；acceptance 68 行（68 unique）；tech §5 模块 42（42 unique）；tech §11 测试 19 行。
- **类型复验**：上述 `npx tsc` 命令 **exit 0**；`CardId` 与 tech §7.2 **零差异**。
- **前次阻塞复核**：§4/§5/§1.1/§11/§18/AC-T02/AC-F10 七处一致性检查通过；A23–A27 与 AC-23–AC-27 双向映射通过。
- **占位符/移动端扫描**：TBD 类 0 命中；触屏/移动端仅「不做」与「手机灯」道具语境；无外部 URL（仅 validate R7 的规则文本）。
- **未改写**：本任务只覆盖 `docs/reports/m4-design.md`；未改任何 GDD/tech-spec/acceptance/art-direction/type 文件；未运行 git；未安装依赖。
- **报告取代关系**：本文取代 2026-10-28 02:15 的首次 M4 门禁报告（结论「不通过」，B1/B2 两项阻塞）。
