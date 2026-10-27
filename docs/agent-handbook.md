# 智能体工作室手册 / Agent Handbook

本文件是所有成员的协作契约。开始任务前必须阅读：`docs/brief.md`、本文件、`docs/production-plan.md`，以及与任务相关的既有文档。

---

## 1. 十条铁律

1. **只做任务范围内的事**：只创建/修改任务描述或 inScope 指定的文件；不重构无关代码，不删除他人文件。
2. **不要运行 git / gh**：提交、打 tag、建 release、关闭 milestone 由制作人（captain）统一执行。成员只写文件并在报告中列出路径。
3. **依赖受控但不设死名单**：可以按项目需要引入库/框架，但新增依赖必须由技术总监批准、锁定版本、提交 `package-lock.json`，并记录理由、包体与许可证；不得引入需要联网运行时或包含版权素材的包。成员不要擅自 `npm install` 新包；在报告中提出需求，由制作人统一安装。
4. **先读后写**：修改已有文件前必须先读；新文件先确认目录、命名与接口契约。
5. **共享工作区**：其他成员可能同时在写别的文件；不要做全局查找替换、批量重命名、格式化全仓库。
6. **文档用中文，代码标识符用英文**；文案必须原创。
7. **不虚构验证结果**：报告中的命令、输出、截图路径必须真实；没跑就写“未验证”。
8. **交付即证据**：文件路径 + 关键内容 + 验证命令 + 结果 + 风险，缺一不可。
9. **接口以 `docs/tech-spec.md` 与 `src/types/` 为准**：文档冲突时，技术方案优先；发现冲突在报告中指出，不要私自改契约。
10. **质量优先于速度**：宁可少写一个特性，也不留半成品、TODO、占位符、注释掉的死代码或 `any` 兜底。

---

## 2. 目标仓库结构

```
docs/
  brief.md                 项目简报（产品/评审/硬约束）
  agent-handbook.md        本文件
  production-plan.md       名册、里程碑、GitHub 流程
  decisions/               决策记录
  templates/               文档模板
  pitches/                 M1：10 份企划提案
  discussion/              M2：10 份交叉讨论
  concepts/                M2：3 个融合方案
  reviews/                 M3：3 份评审意见
  scores/                  M3：7 份打分表
  decision/                M3：定案记录
  gdd.md                   M4：游戏设计文档
  tech-spec.md             M4：技术方案与接口契约
  acceptance.md            M4：验收矩阵
  art-direction.md         M4：美术方向
  reports/                 每个里程碑的制作报告
  qa/                      M6：验证、试玩、兼容性报告与截图
src/
  main.tsx                 React 入口（技术总监/候选版）
  App.tsx                  UI 根组件（UI 工程师）
  game/                    纯 TypeScript 玩法逻辑（可单测）
  three/                   Three.js 渲染、场景、相机、实例化、特效、模型
  ui/                      React 组件
  audio/                   WebAudio 音乐与音效
  data/                    角色/武器/敌人/波次/台词数据
  types/                   共享类型契约（技术方案阶段创建）
  styles/                  CSS
  assets/                  程序化 SVG/Canvas 视觉资产
tests/                     Vitest 单元测试（*.test.ts）
tools/                     build-single.mjs / validate.mjs（零额外依赖）
dist/                      Vite 构建产物 + 单文件 girls-band-live.html
index.html                 Vite 根入口（候选版）
index.html（根）          构建生成：根目录发布入口（与 Vite 入口区分，构建脚本写入）
```

> 注意：Vite 根入口是 `index.html`；单文件构建脚本会生成根目录的 `index.html` 与 `dist/girls-band-live.html`。为避免覆盖，Vite 的入口放在 `src/index.html`，由 `vite.config.ts` 的 `root`/`build.rollupOptions.input` 指向；候选版集成必须明确这一点并保证可重复构建。

---

## 3. 技术契约

### 3.1 技术栈与版本

| 项 | 版本/约束 |
| --- | --- |
| React / React DOM | 19.3.x |
| Three.js | 0.186.x |
| TypeScript | 5.9.x，`strict: true` |
| Vite | 8.3.x + `@vitejs/plugin-react` 6.1.x |
| Vitest | 5.0.x |
| 目标 | WebGL2；仅桌面 Chrome/Edge/Firefox 最新两个大版本；不做移动端/触屏 |

> **依赖政策**：上表是核心栈，不是封闭清单。允许按项目需要引入其他库/框架；新增依赖由技术总监评估（必要性、包体、许可证、维护状态、离线可用性、供应链风险），记录在 `docs/tech-spec.md` 与 `docs/decisions/`，由制作人统一安装并提交 `package-lock.json`。禁止需要联网运行时、CDN 运行时依赖与包含版权素材的包。

### 3.2 三层边界

1. **`src/game/`（纯逻辑）**：不 import `react`、`react-dom`、`three`，不访问 DOM/Canvas/WebGL/localStorage/AudioContext。输入抽象为数据，渲染通过快照消费。可在 Node/Vitest 中直接测试。
2. **`src/three/`（渲染层）**：只消费 `game` 快照与事件，不直接修改游戏状态；不 import React。负责场景、相机、实例化、材质、特效、资源释放。
3. **`src/ui/` + `App.tsx`（React 层）**：只消费 `game` 的只读快照/命令接口；不直接操作 Three.js 对象；不每帧 `setState`。HUD 通过 `useSyncExternalStore` 订阅 ≤10Hz 的快照。
4. **`src/audio/`**：只依赖 WebAudio 与 game 事件；不 import React/Three。
5. **`src/data/`**：纯数据与类型；不 import React/Three/game 实现。

依赖方向：

```
data → types
game → types, data
three → types, data, game(只读快照/事件)
ui/App → types, game store/commands, data
main.tsx → 全部装配
```

禁止循环依赖；发现循环时通过 `types` 抽象接口。

### 3.3 TypeScript 约定

- `strict: true`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes` 由技术方案开启；不得用 `@ts-ignore`/`@ts-expect-error` 掩盖错误（确有必要须注释理由并获技术总监批准）。
- 公共 API 必须有显式返回类型；导出的函数/类型必须有 JSDoc 一行说明。
- 禁止 `any`；不确定类型用 `unknown` + 收窄。
- 枚举优先用字符串字面量联合，避免 `enum` 运行时代码。
- 类型集中在 `src/types/`：`game.ts`、`data.ts`、`save.ts`、`ui.ts`（技术方案阶段创建，工程师只 import 不改）。
- 数值时间单位统一为秒；坐标使用 Three.js 世界坐标（y 向上）；逻辑碰撞在 XZ 平面。

### 3.4 React 约定

- 函数组件 + hooks；不使用 class 组件。
- 组件文件 PascalCase（`Hud.tsx`），hooks `useXxx.ts`，工具 camelCase。
- 顶层 `App.tsx` 负责屏幕路由（menu/select/playing/levelup/paused/results/settings/credits），不承载游戏循环。
- 游戏循环、Three 渲染循环、音频调度都在 React 之外启动一次；React 只读快照。
- HUD 快照结构由 `src/types/ui.ts` 定义；更新频率 ≤10Hz；不要在 `requestAnimationFrame` 里 `setState`。
- 所有可交互元素可 Tab 聚焦、焦点可见、支持 Enter/Space；按钮有 `aria-label`；对话框使用 `role="dialog"` + 焦点陷阱；Esc 暂停/关闭。
- 禁止内联大量样式；样式集中在 `src/styles/`；主题变量在 `theme.css`。
- 不使用 `dangerouslySetInnerHTML`。

### 3.5 Three.js 约定

- 单例 `WebGLRenderer`，由 `main.tsx` 创建并在卸载时 `dispose()`；`antialias` 默认关（低画质可开），`powerPreference: 'high-performance'`，DPR 上限 2。
- 相机：俯视 3/4 透视相机，跟随玩家平滑；舞台边界用可读的地面/灯光标记。
- 敌人、子弹、经验宝石使用 `InstancedMesh` 或对象池；同屏实例上限由技术方案定义；每帧不新建几何体/材质。
- 所有模型由基础几何体组合（Box/Cylinder/Sphere/Cone/Torus 等）+ `MeshStandardMaterial`/`MeshBasicMaterial`；纹理用 CanvasTexture 程序化生成；禁止外部 glTF/GLB/贴图。
- 光照：环境光 + 方向光 + 舞台聚光灯；阴影默认关闭；发光/霓虹用 emissive + 叠加面片。
- 特效：粒子用 `Points` + 池；屏震只作用于相机；减少动态时关闭屏震/闪烁/密集粒子。
- 资源释放：场景卸载、重开、切角色时 dispose 几何体/材质/纹理；监听 `webglcontextlost` 并给出可恢复提示。
- 性能预算：draw call ≤ 120（目标 ≤ 80）；每帧 Three 更新 ≤ 6ms；实体上限 250；低画质模式降 DPR 至 1、粒子上限减半。

### 3.6 数据契约

- 角色、武器、进化、敌人、波次、台词、颜色全部在 `src/data/`；逻辑层不得硬编码内容。
- 所有 id 使用 kebab-case 且全局唯一；进化必须能通过 id 引用到武器与被动。
- 数值集中可调；每项内容提供 `name`、`description`、`id`。
- 数据文件导出 `as const` 或显式类型，必须通过 `tsc`。

### 3.7 存档契约

- key：`gbl.save.v1`；schema：`{ version: 1, settings: {...}, records: {...}, unlocks: {...} }`。
- 读取必须 try/catch；损坏/旧版本回退默认值；写入失败静默降级，不影响本局。
- 禁止存储个人数据；只存设置、最佳记录、解锁。

### 3.8 音频契约

- 仅 WebAudio 合成；首次用户手势后 `resume()`；页面隐藏/失焦时暂停或降音量。
- 至少 4 层音乐（drums/bass/chords/lead），强度随波次推进；关键 SFX（命中、升级、Encore、Boss、结算）。
- 静音/音量持久化到存档；所有节点可被总 gain 控制。
- 无外部音频文件；不使用 `<audio>` 标签加载资源。

### 3.9 性能契约

- 逻辑固定步长（建议 60Hz），渲染插值；单帧逻辑 ≤ 4ms。
- 对象池复用敌人/子弹/粒子/飘字；空间网格做碰撞粗筛。
- 每帧避免大数组分配与字符串拼接；HUD 快照复用对象。
- 目标 60fps（150 敌人）；掉帧时优先降粒子/飘字/DPR，不降逻辑正确性。
- 低画质模式：DPR 1、阴影关、粒子上限减半、后处理关。

---

## 4. 命令契约（不可改名）

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | Vite 开发服务器 |
| `npm run typecheck` | `tsc --noEmit`，必须 0 错误 |
| `npm test` | `vitest run`，纯逻辑测试 |
| `npm run build` | `tsc --noEmit` + `vite build` + `node tools/build-single.mjs`，生成 `dist/girls-band-live.html` 与根 `index.html` |
| `npm run validate` | `node tools/validate.mjs`，校验单文件自包含、挂载点、版本、大小 |

- 构建必须可重复：同一输入两次构建产物字节一致（版本号/时间戳不得写入产物）。
- 单文件产物中不得包含外部 `script`/`link`/`img`/字体引用，不得调用 `fetch`/`XMLHttpRequest`/`WebSocket`；`validate.mjs` 的精确规则由技术方案定义，初始规则见上。
- 单文件必须在 `file://` 下可启动（内联 module script 不得依赖外部 import）。

---

## 5. 文件所有权（避免并行冲突）

| 成员 | 拥有的文件 |
| --- | --- |
| `dev-engine` | `src/game/loop.ts`、`entities.ts`、`input.ts`、`collision.ts`、`rng.ts`、`events.ts`、`pool.ts`、`store.ts` |
| `dev-combat` | `src/game/combat.ts`、`enemies.ts`、`weapons.ts`、`waves.ts`、`boss.ts` |
| `dev-progression` | `src/game/progression.ts`、`upgrades.ts`、`save.ts` |
| `dev-content` | `src/data/*.ts` |
| `dev-three` | `src/three/renderer.ts`、`scene.ts`、`camera.ts`、`instancing.ts`、`fx.ts` |
| `dev-ui` | `src/App.tsx`、`src/ui/**`、`src/styles/base.css`、`src/styles/ui.css` |
| `dev-audio` | `src/audio/**` |
| `art-director` | `src/three/models.ts`、`src/assets/**`、`src/styles/theme.css` |
| `tech-director` | `src/types/**`（M4）、`src/main.tsx`、`index.html`、`vite.config.ts`、`tsconfig.json`、`tools/**`（候选版/集成） |
| `qa-automation` | `tests/**`、`docs/qa/unit-report.md`、`docs/qa/verification-report.md` |
| `qa-playtester` | `docs/qa/playtest-report.md`、`docs/qa/shots/**` |
| `qa-compat` | `docs/qa/compat-report.md`、`docs/qa/shots/**` |

- 不在自己名下的文件，只读；需要修改时在报告中提出，由制作人协调。
- 同一目录的 `index` 文件（如 `src/data/index.ts`）由内容工程师统一维护。

---

## 6. 文件命名与文案

- 文件名：小写 kebab-case；React 组件文件 PascalCase；类型文件 camelCase。
- 文档标题：`#` 一级标题 + 稳定二级小节。
- 代码：`camelCase` 函数/变量，`PascalCase` 类/构造器/组件，`UPPER_SNAKE_CASE` 常量。
- 中文文案使用全角标点；专有名词前后加空格。
- 禁止在游戏 UI 中出现 “Vampire Survivors” 等他人商标；类型描述只出现在文档中。

---

## 7. 任务报告格式

完成任务时，`output`/报告必须包含：

```
交付：<文件路径列表>
摘要：<≤150 字，做了什么、关键决策>
验证：<命令 + 结果；没有则写明“未运行”>
风险/遗留：<≤3 条；没有写“无”>
```

评审/打分任务额外包含：结论（pass/needs_revision 或 A/B/C 排名）、逐项分数、findings（id/severity/file/line/problem/requiredFix）。

---

## 8. 里程碑与提交

- 共 7 个里程碑（M1–M7），详见 `docs/production-plan.md`。
- 成员**不提交**；每个里程碑由制作人统一 commit、打 tag、push、关闭 GitHub Milestone/Issue。
- 成员完成后不要等待“下一步指令”，按 DAG 自动进入可领取的任务；需要澄清时在报告中写清楚，由制作人转达。
- 质量任务失败（review = needs_revision）时，按审查 findings 修复；不要绕过或降低验收标准。

---

## 9. 完成定义（成员级）

- 文档：结构完整、无 TBD、与 brief/rubric 一致、有明确结论。
- 实现：文件存在、`npm run typecheck` 对本模块无错误、遵循 tech-spec 接口、无外部依赖、无占位代码。
- 测试：真实运行并记录输出；失败要写清复现步骤。
- 美术/音频：无外部素材、可离线、体积受控、遵循 art-direction。
- 审查：只基于证据下结论；不修改代码；findings 必须可执行。
