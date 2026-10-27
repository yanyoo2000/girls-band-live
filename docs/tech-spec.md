# 技术方案 / Technical Specification

- **版本**：M4 v1（2026-10-28）
- **作者**：技术总监（tech-director）
- **依据**：`docs/gdd.md`（M4 v1）、`docs/brief.md` §4、`docs/agent-handbook.md` §3、`docs/decision/selected-concept.md`、`docs/reports/audio-slice.md`
- **配套**：`docs/acceptance.md`（68 项验收）、`src/types/{game,data,save,ui}.ts`（类型契约，只读）
- **状态**：**接口冻结**。M5 实现必须逐字对齐本文件与 `src/types/`；变更走 §17.2 流程。
- **平台**：仅桌面浏览器（Chrome/Edge/Firefox 最新两个大版本，WebGL2）；不做触屏/移动端；离线单文件、零外部素材。

---

## 1. 文档控制

### 1.1 本文件锁定的内容

1. 三层边界与依赖方向（§3）；
2. 文件清单、模块归属与单一 owner（§4）；
3. 42 个模块的显式接口签名（§5：game 20、three 6、audio 5、ui 5、集成 5、资产 1；§4 中每个逻辑/服务模块都有签名）；
4. React / Three / game 的桥接方式与 10Hz HUD（§6）；
5. 数据与存档 schema（§7、§8）；
6. 性能预算、降级阶梯与测量口径（§9、§16）；
7. Vite 构建、单文件内联、validate 的 14 条规则（§10）；
8. Vitest 策略与 19 个必测模块（§11）；
9. 90 秒 C 核心测试场景与埋点（§12）；
10. 12 声部合唱池与程序化 IR 的实现路径（§13）；
11. F3 / F5 / F8 / F9 的可测接口（§14）；
12. 依赖清单与新增依赖决策（§15）；
13. 与 GDD §22 的逐条映射（§17）。

### 1.2 术语

| 术语 | 含义 |
| --- | --- |
| 逻辑层 / game | `src/game/**`，纯 TypeScript，可在 Node/Vitest 直接跑 |
| 渲染层 / three | `src/three/**`，只消费快照与事件 |
| UI 层 / ui | `src/ui/**` + `App.tsx`，React，只消费快照与发命令 |
| 快照 | 只读数据对象，按引用稳定（无变化不改引用） |
| 命令 | UI → game 的唯一写入通道（`GameCommand` / `UiCommand`） |
| 事件 | game → audio/three/ui/telemetry 的单向广播（`GameEvent`） |
| 拍点 | 由音频时钟派生的 `BeatTick`，全项目唯一时间语义 |

---

## 2. 技术栈与版本锁定

| 依赖 | 版本 | 用途 |
| --- | --- | --- |
| `react` / `react-dom` | 19.3.1 | 全部 DOM UI（菜单/HUD/弹层/结算） |
| `typescript` | 5.9.3 | `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| `three` | 0.186.1 | 3D 舞台、InstancedMesh、相机、灯光、粒子 |
| `vite` | 8.3.5 | 开发服务器与构建 |
| `@vitejs/plugin-react` | 6.1.2 | JSX 转换 |
| `vitest` | 5.0.5 | 纯逻辑单测（node 环境，无 jsdom） |
| `@types/node` / `@types/react` / `@types/react-dom` / `@types/three` | 24.0.0 / 19.3.0 / 19.3.0 / 0.186.0 | 类型 |

- 运行时**不引入**任何其他包；不引入 CSS 框架、不引入状态库、不引入音频库（§15）。
- 浏览器 API 只用：WebGL2、WebAudio、`localStorage`、`requestAnimationFrame`、`performance.now`、Pointer/Keyboard Events、`ResizeObserver`。
- 禁止：`document.write`、`eval`、`new Function`、动态 `import()`、`fetch`、`XMLHttpRequest`、`WebSocket`、`Worker`。

### 2.1 TypeScript 配置（`tsconfig.json`）

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "tests", "tools"]
}
```

- 禁止 `any`；不确定类型用 `unknown` + 收窄。禁止 `@ts-ignore` / `@ts-expect-error`（确有必要须在 PR 说明并获技术总监书面同意）。
- 导出函数必须有显式返回类型；导出类型/接口必须有 JSDoc 一行。
- `src/game/**` 不得出现 DOM 全局（`window`/`document`/`localStorage`/`AudioContext`/`requestAnimationFrame`）；由 §10.3 R12 静态检查。

---

## 3. 架构与依赖边界

### 3.1 三层与依赖方向

```
                    ┌──────────────────────────────┐
                    │  src/types/{game,data,save,ui}│  纯类型，零运行时依赖
                    └──────────────┬───────────────┘
                                   │ 只被 import
      ┌────────────────────────────┼────────────────────────────┐
      ▼                            ▼                            ▼
┌──────────────┐            ┌──────────────┐            ┌──────────────┐
│ src/data/**  │            │ src/game/**  │            │ src/audio/** │
│ 内容表        │◀───────────│ 纯逻辑        │            │ WebAudio     │
└──────┬───────┘  data       └──────┬───────┘            └──────┬───────┘
       │                           │ 快照/事件                  │ 拍点
       │                           ▼                            │
       │                    ┌──────────────┐                    │
       └───────────────────▶│ src/three/** │────────────────────┘
                            │ 渲染（无 React）│
                            └──────────────┘
┌──────────────────────────────────────────────────────────────────┐
│ src/ui/** + App.tsx（React）：只读快照 + 发命令，不碰 Three 对象      │
└──────────────────────────────────────────────────────────────────┘
                ▲                                   ▲
                └──────── src/main.tsx 装配 ─────────┘
```

**依赖矩阵**（行可以依赖列，`—` 表示禁止）：

| from \ to | types | data | game | three | audio | ui |
| --- | --- | --- | --- | --- | --- | --- |
| `src/types` | — | — | — | — | — | — |
| `src/data` | ✔ | — | — | — | — | — |
| `src/game` | ✔ | ✔ | — | — | — | — |
| `src/audio` | ✔ | ✔ | — | — | — | — |
| `src/three` | ✔ | ✔ | ✔（只读接口） | — | — | — |
| `src/ui` | ✔ | ✔ | ✔（store/命令） | — | — | — |
| `src/main.tsx` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `src/platform` | ✔ | — | — | — | — | — |

### 3.2 强制规则（可机器检查，见 §10.3 R12）

1. `src/game/**` 不 import `react`、`react-dom`、`three`；不出现 DOM/WebAudio/localStorage 全局。
2. `src/three/**` 不 import `react`；不写游戏状态（只读快照）；不调用 store 的 `dispatch`。
3. `src/ui/**` 不 import `three`（含 `three` 子路径）；UI 不实例化 `WebGLRenderer`。
4. `src/audio/**` 不 import `react`/`three`/`game` 实现（只 import 类型与数据）。
5. `src/data/**` 不 import `game`/`three`/`ui` 实现。
6. `src/types/**` 不 import 任何实现；文件内只有类型声明。
7. 禁止循环 import（`tools/check-layers.mjs` 用文件级图检测）。

### 3.3 types 内部规则

```
save.ts   ← game.ts   ← data.ts   ← ui.ts
（无 import）（无 import） （只 import game 类型）（只 import 三者类型）
```

- `save.ts` 是基座，不 import 任何文件；
- `game.ts` 不 import 任何文件（端口与实体都自包含）；
- `data.ts` 只 import `./game` 的 id/标量类型；
- `ui.ts` 可 import 三者，但只能是 `import type`。
- 运行时只允许 `import type`，因此 types 打包后为 0 字节。

### 3.4 每帧数据流（顺序固定）

```
rAF
 ├─① 采样 DOM 输入 → InputBuffer（ui/input-dom.ts）
 ├─② loop: 固定步长 60Hz 循环 n 次
 │    ├─ projector.toStage(ndc) → pointerWorld
 │    ├─ input.sample(...) → InputFrame
 │    ├─ store.dispatch({type:'tick', dt, input})
 │    │    ├─ 更新光/玩家/热度/转化/噪音/Boss/卡
 │    │    ├─ 读 audio.clock.positionAt(...)（唯一时间源）
 │    │    └─ events.emit(...)（同步分发）
 │    └─ telemetry.sample(...)（每 0.5s 一次）
 ├─③ uiBridge.publishHud()（≤10Hz 节流后才通知 React）
 ├─④ audio.setChoir(...) / setSegment(...)（不每帧建节点）
 └─⑤ renderer.draw(store.getRender(), displaySettings)
```

- 模拟 60Hz 固定步长；渲染用 `RenderSnapshot` 内插（渲染层自己按上一帧/本帧插值）。
- **所有拍点相关的时间只来自 `MusicClock`**，逻辑层不使用 `Date.now()`。
- 每帧不允许创建新数组/对象（除已池化的外）；`RenderSnapshot` 与 `HudSnapshot` 复用同一对象，只在内容变化时替换。

---

## 4. 目录、文件清单与所有权

> 与 `docs/agent-handbook.md` §5 的文件所有权表一致，并按 GDD §22.3 补充光/座位/热度/人浪与平台适配层。**冲突时以本表为准**（handbook §3.1 已声明技术方案优先）。

```
docs/
  tech-spec.md                       tech-director
  acceptance.md                      tech-director
  art-direction.md                   art-director
src/
  index.html                         tech-director（Vite 根入口，不是发布入口）
  main.tsx                           tech-director（装配/启动/销毁）
  App.tsx                            dev-ui
  game/
    loop.ts  store.ts  input.ts  collision.ts  rng.ts
    events.ts  pool.ts  entities.ts               dev-engine
    light.ts  audience.ts  crowd-wave.ts  lines.ts  telemetry.ts   dev-engine
    combat.ts  enemies.ts  waves.ts  boss.ts                      dev-combat
    progression.ts  upgrades.ts  save.ts                          dev-progression
  audio/
    engine.ts  music.ts  choir.ts  ir.ts  sfx.ts                  dev-audio
  three/
    renderer.ts  scene.ts  camera.ts  instancing.ts  fx.ts        dev-three
    models.ts                                                     art-director
  ui/
    screens/*.tsx  components/*.tsx（React 组件，props 契约见 §5.6）
    bridge.ts  hooks.ts  input-dom.ts  copy.ts                    dev-ui
  data/
    index.ts  characters.ts  cards.ts  noise.ts  segments.ts
    chords.ts  seats.ts  copy.ts  palette.ts  balance.ts          dev-content
  types/
    game.ts  data.ts  save.ts  ui.ts                              tech-director
  styles/
    base.css  ui.css                                              dev-ui
    theme.css                                                     art-director
  assets/
    procedural.ts（CanvasTexture/SVG 生成器）                      art-director
  platform/
    local-storage.ts  webgl-support.ts  bootstrap.ts              tech-director
tests/
  *.test.ts                                                       qa-automation
tools/
  build-single.mjs  validate.mjs  check-layers.mjs                tech-director
index.html（根）                                                  构建产物，不手改
dist/                                                             构建产物
```

> **§5 的覆盖范围**：42 个逻辑/服务/生成模块全部有函数签名（game 20、three 6、audio 5、ui 5、集成 5、资产 1）。
> 不设函数签名的文件分三类：内容表 `src/data/*`（由 `DataRegistry` 约束）、样式 `src/styles/*`（由 `theme.css` token 约束）、React 屏幕与组件 `screens/*`、`components/*`（由 `App` 的 props 契约约束）；`src/index.html` 是入口标记（§10.1），`tests/*` 由 §11 的文件名约定，`tools/validate.mjs`、`tools/check-layers.mjs` 是 CLI 脚本（契约见 §10.3、§3.2）。

### 4.1 相对 handbook 的 5 处明确调整（必须遵守）

| # | handbook 原约定 | 本方案 | 原因 |
| --- | --- | --- | --- |
| 1 | `src/game/input.ts` 归 dev-engine | 保留纯输入缓冲；DOM 监听放 `src/ui/input-dom.ts`（dev-ui） | game 层禁止触 DOM |
| 2 | `src/game/save.ts` 归 dev-progression | 保留纯解析/合并；`localStorage` 适配器放 `src/platform/local-storage.ts`（tech-director） | game 层禁止触 localStorage |
| 3 | `src/game/weapons.ts` | **不创建**；光三形态在 `src/game/light.ts` | GDD 锁定“无武器，只有光” |
| 4 | 根 `index.html` 为 Vite 入口 | Vite 入口放 `src/index.html`；根 `index.html` 与 `dist/girls-band-live.html` 由构建生成 | 避免构建覆盖源文件 |
| 5 | GDD §22.3 的“光/座区/热度/人浪”未在 handbook 表内 | 归 dev-engine：`light.ts`、`audience.ts`、`crowd-wave.ts`、`lines.ts`、`telemetry.ts` | 单一 owner，避免跨模块等待 |

### 4.2 单一 owner（GDD §22.3 / F10）

| 系统 | owner | 交付文件 |
| --- | --- | --- |
| 主循环、固定步长、store、输入缓冲、碰撞、RNG、事件、对象池、实体容器 | dev-engine | `loop/store/input/collision/rng/events/pool/entities` |
| 光/点燃/转化/座位/热度/人浪/三线 | dev-engine | `light/audience/crowd-wave/lines` |
| 噪音/返听/Boss | dev-combat | `enemies/boss/combat/waves` |
| 卡池/升级/进化/存档 | dev-progression | `progression/upgrades/save` |
| 舞台/灯光/观众/噪音渲染 | dev-three | `renderer/scene/camera/instancing/fx` |
| 模型与程序化资产 | art-director | `three/models`、`assets/**`、`styles/theme.css` |
| HUD/失败卡/结算/全部屏幕 | dev-ui | `App.tsx`、`ui/**` |
| 音乐/SFX/合唱/静默 | dev-audio | `audio/**` |
| 数据与平衡表 | dev-content | `data/**` |
| 内容文案与程序化纹理 | dev-ui / art-director | `ui/copy.ts`、`assets/procedural.ts`（`three/models.ts` 见上） |
| 启动参数与平台探测 | tech-director | `platform/bootstrap.ts`、`platform/webgl-support.ts`、`platform/local-storage.ts` |
| 类型契约、构建、平台适配、集成 | tech-director | `types/**`、`main.tsx`、`platform/**`、`tools/**`、`vite.config.ts`、`src/index.html` |

---

## 5. 模块接口签名（42 个模块，参数与返回值精确）

> 所有 `import type` 均指向 `src/types/`。返回类型不得写 `any`；可选参数不得超过 2 个。
> 覆盖范围：§4 中 42 个逻辑/服务/生成模块全部有签名；`src/data/*`、`src/styles/*`、`screens/*`、`components/*` 不设函数签名（约束见 §4 文件清单后的说明）。

### 5.1 game 核心（dev-engine）

```ts
// src/game/loop.ts
import type { AudioPort, FrameIndex, PointerProjector, Seconds } from '../types/game';
import type { DisplaySettings } from '../types/save';
import type { GameStore } from './store';
import type { InputSampler } from './input';
import type { FrameRenderer } from '../three/renderer';

/** 单帧耗时统计（QA 面板与自动降级共用）。 */
export interface FrameStats {
  readonly fps: number;
  readonly frameMs: number;
  readonly simMs: number;
  readonly renderMs: number;
  readonly drawCalls: number;
  readonly triangles: number;
  /** 连续超过预算的秒数（自动降级用）。 */
  readonly overBudgetSec: Seconds;
  readonly frame: FrameIndex;
}

export interface LoopDeps {
  readonly store: GameStore;
  readonly input: InputSampler;
  readonly projector: PointerProjector;
  readonly audio: AudioPort;
  readonly renderer: FrameRenderer;
  readonly display: () => DisplaySettings;
  /** 可选：每帧统计回调（QA 面板/自动降级）。 */
  readonly onStats?: (stats: FrameStats) => void;
}

export interface LoopHandle {
  start(): void;
  stop(): void;
  isRunning(): boolean;
  readonly stats: FrameStats;
}

/** 创建主循环（固定步长 60Hz + rAF 渲染）。 */
export function createLoop(deps: LoopDeps): LoopHandle;
```

```ts
// src/game/store.ts
import type {
  GameCommand, GameEventHandler, HudSnapshot, InputFrame, RenderSnapshot, RunResult, RunState, Seconds,
} from '../types/game';
import type { DataRegistry } from '../types/data';
import type { SavePort } from '../types/save';

export interface StoreDeps {
  readonly data: DataRegistry;
  readonly rng: Rng;
  readonly events: EventBus;
  readonly audio: AudioPort;
  readonly save: SavePort;
  readonly telemetry: TelemetryRecorder | null;
  /** 逻辑时钟后备实现（音频未就绪时用单调时钟）。 */
  readonly fallbackClock: MusicClock;
}

/** 局内唯一可变状态的持有者；所有写入经过 dispatch。 */
export interface GameStore {
  getRun(): RunState | null;
  getHud(): HudSnapshot;
  getRender(): RenderSnapshot;
  getResult(): RunResult | null;
  dispatch(command: GameCommand): void;
  subscribeHud(listener: () => void): () => void;
  subscribeEvents(handler: GameEventHandler): () => void;
  /** 固定步长 tick，由 loop 调用；禁止 UI 直接调用。 */
  tick(dt: Seconds, input: InputFrame): void;
  dispose(): void;
}

/** 创建 store（内部创建全部 game 子系统）。 */
export function createGameStore(deps: StoreDeps): GameStore;
```

```ts
// src/game/input.ts
import type { InputFrame, PointerProjector, Seconds, Vec2 } from '../types/game';

export type InputKey =
  | 'move-left' | 'move-right' | 'move-up' | 'move-down'
  | 'beam' | 'ignite' | 'interact' | 'pause';

/** 纯输入缓冲：只存数据，不触 DOM。 */
export interface InputBuffer {
  setKey(key: InputKey, down: boolean): void;
  press(key: InputKey): void;
  setPointerNdc(ndc: Vec2): void;
  setHoldSeconds(seconds: Seconds): void;
  clearFrameEdges(): void;
}

/** 输入采样器：把缓冲 + 投影器合成一帧 InputFrame。 */
export interface InputSampler {
  readonly buffer: InputBuffer;
  sample(projector: PointerProjector): InputFrame;
}

export function createInputBuffer(): InputBuffer;
export function createInputSampler(buffer: InputBuffer, moveSpeed: number): InputSampler;
```

```ts
// src/game/collision.ts
import type { Circle, CollisionQuery, Meters } from '../types/game';

/** 创建均匀网格（格子边长 = 最大实体直径，容量 = 实体硬上限）。 */
export function createSpatialGrid(cellSize: Meters, capacity: number): CollisionQuery;
/** 两个圆的 XZ 相交判定（含边界）。 */
export function circlesOverlap(a: Circle, b: Circle): boolean;
/** 点到线段距离（光路命中、失败卡回放用）。 */
export function distancePointToSegment(point: Circle['center'], from: Circle['center'], to: Circle['center']): Meters;
```

```ts
// src/game/rng.ts
import type { Rng } from '../types/game';

/** mulberry32 + 分叉标签哈希；同 seed 100% 复现。 */
export function createRng(seed: number): Rng;
/** 字符串标签 → 32 位整数（SHA-256 的同步简化版：FNV-1a）。 */
export function hashLabel(label: string, salt: number): number;
```

```ts
// src/game/events.ts
import type { EventBus, GameEvent, GameEventHandler } from '../types/game';

export function createEventBus(): EventBus;
/** 仅供测试：把事件序列化为稳定字符串（断言用）。 */
export function describeEvent(event: GameEvent): string;
export type { EventBus, GameEventHandler };
```

```ts
// src/game/pool.ts
import type { Pool } from '../types/game';

/** 固定容量对象池：容量满时 acquire 返回 null，由调用方丢弃。 */
export function createPool<T>(factory: () => T, capacity: number, reset: (item: T) => void): Pool<T>;
```

```ts
// src/game/entities.ts
import type { NoiseEntity, Pool, RunState, Seconds } from '../types/game';
import type { DataRegistry } from '../types/data';

/** 实体容器：噪音池 + 精英/Boss 槽位；id 单调递增，池化复用。 */
export interface EntityWorld {
  readonly noises: NoiseEntity[];
  readonly pool: Pool<NoiseEntity>;
  readonly capacity: number;
  /** 按 id 取实体；不存在返回 null。 */
  byId(id: number): NoiseEntity | null;
  /** 活跃实体数（渲染层与上限判定用）。 */
  activeCount(): number;
  /** 清空活跃实体并归还池（重开一局）；池本身保留。 */
  reset(): void;
}

/** 创建实体世界（容量 = GDD 噪音上限 180；低画质不改变逻辑容量）。 */
export function createEntityWorld(data: DataRegistry, capacity: number): EntityWorld;
/** 推进实体计时与回收（dying 结束归还池）。 */
export function updateEntities(world: EntityWorld, run: RunState, dt: Seconds): void;
```

### 5.2 game 系统（dev-engine）

```ts
// src/game/light.ts
import type { RunState, InputFrame, MusicalPosition, IgniteQuality, ZoneId, Vec2, Seconds } from '../types/game';
import type { DataRegistry } from '../types/data';

export interface LightUpdate {
  readonly movedDistance: number;
  readonly sweptZones: number;
  readonly enteredZone: ZoneId | null;
  readonly modeChanged: boolean;
}

export interface IgniteResult {
  readonly quality: IgniteQuality;
  readonly multiplier: number;
  readonly inChord: boolean;
  readonly zone: ZoneId | null;
  readonly sweepBonusApplied: boolean;
}

/** 推进光的位置/惯性/冷却/反驻守锚点（每固定步长调用一次）。 */
export function updateLight(run: RunState, input: InputFrame, data: DataRegistry, dt: Seconds): LightUpdate;
/** 判定一次点燃（窗口由 MusicClock 提供）。 */
export function evaluateIgnite(run: RunState, musical: MusicalPosition, data: DataRegistry, sweepBonus: number): IgniteResult;
/** 光锥覆盖的座位范围（桶查询，O(格子数)）。 */
export function queryLitSeats(run: RunState, data: DataRegistry, out: Int32Array): number;
```

```ts
// src/game/audience.ts
import type {
  AudienceFrame, HeatLevel, Ratio, Rng, RunState, Seconds, ZoneId,
} from '../types/game';
import type { DataRegistry } from '../types/data';

export interface ConvertDelta {
  readonly converted: number;
  readonly colored: number;
  readonly black: number;
  readonly casts: readonly { readonly seat: number; readonly zone: ZoneId; readonly cause: 'covered' | 'cooled' | 'overheat' }[];
}

/** 创建 768 席初始数据（30 人出席，均匀分四区）。 */
export function createAudience(data: DataRegistry, rng: Rng): AudienceFrame;
/** 每固定步长：两段转化、热度升降、覆盖与离场。 */
export function updateAudience(run: RunState, data: DataRegistry, dt: Seconds): ConvertDelta;
/** 人浪扫过时的整区转化（1:4）。 */
export function applyCrowdWave(run: RunState, zone: ZoneId, data: DataRegistry): ConvertDelta;
/** 静态读取：某区当前出席人数。 */
export function countPresent(frame: AudienceFrame, zone: ZoneId | null): number;
```

```ts
// src/game/crowd-wave.ts
import type { RunState, Seconds, ZoneId } from '../types/game';
import type { DataRegistry } from '../types/data';

export interface CrowdWaveUpdate {
  readonly triggered: 0 | 1 | 2 | 3;
  readonly origin: ZoneId | null;
  readonly converted: number;
  readonly heatGain: 1;
  readonly cracked: boolean;
}

/** 人浪：2:00/5:00/8:00 三次，阈值不足退化为单区小浪。 */
export function updateCrowdWave(run: RunState, data: DataRegistry, dt: Seconds): CrowdWaveUpdate;
```

```ts
// src/game/lines.ts
import type { InstrumentLineId, RunState, Seconds } from '../types/game';

export interface LineUpdate {
  readonly broken: readonly InstrumentLineId[];
  readonly plugged: readonly InstrumentLineId[];
  readonly shieldActive: boolean;
}

/** 三条乐器线：噪音拽线、玩家按住 E 1.2s 插线、贝斯护盾。 */
export function updateLines(run: RunState, dt: Seconds, interactHeld: boolean): LineUpdate;
```

```ts
// src/game/progression.ts
import type { BuildState, CardId, CardOffer, EvolutionId, RunState } from '../types/game';
import type { Rng } from '../types/game';
import type { DataRegistry, ModifierKey } from '../types/data';

/** 空构筑（核心为 null）。 */
export function createBuild(): BuildState;
/** 经验与升级：返回触发的 offer（无则 null）；升级冻结由 store 处理。 */
export function addExperience(run: RunState, amount: number, rng: Rng): CardOffer | null;
/** 生成三选一：核心互斥、移除规则、不可重抽。 */
export function buildOffer(run: RunState, data: DataRegistry, rng: Rng): CardOffer;
/** 应用一张卡（写入 build、移除同构筑外的卡、刷新 modifiers 缓存）。 */
export function applyCard(run: RunState, cardId: CardId, data: DataRegistry): void;
/** 进化判定（核心 + 3 支援齐 → 进化 id）。 */
export function resolveEvolution(build: BuildState, data: DataRegistry): EvolutionId | null;
/** 汇总当前 modifier（key → 数值，累加/覆盖规则见 §7.3）。 */
export function collectModifiers(build: BuildState, data: DataRegistry): ReadonlyMap<ModifierKey, number>;
```

```ts
// src/game/telemetry.ts
import type {
  EndingKind, GameEvent, RunMode, TelemetryRecorder, TelemetryRun, TelemetrySample,
} from '../types/game';

/** dev/QA 构建启用；正式构建传 null（tree-shaken）。 */
export function createTelemetryRecorder(startedAt: string): TelemetryRecorder;
/** 汇总指标（定义见 §12.2）。纯函数，可单测。 */
export function summarizeRun(samples: readonly TelemetrySample[], events: readonly GameEvent[], seed: number, mode: RunMode, ending: EndingKind | null): TelemetryRun;
```

```ts
// src/game/upgrades.ts（dev-progression）
import type { BuildState, CardId, EvolutionId, HeatLevel } from '../types/game';
import type { DataRegistry, ModifierKey } from '../types/data';

/** 卡效果运行时：只负责“应用一张卡”和“读派生数值”，抽卡在 progression.ts。 */
export interface UpgradeRuntime {
  /** 派生数值（同名 key 加法合成，上限类取 max）；未配置返回 0。 */
  value(key: ModifierKey): number;
  has(cardId: CardId): boolean;
  matchesEvolution(evolution: EvolutionId): boolean;
}

export function createUpgradeRuntime(build: BuildState, data: DataRegistry): UpgradeRuntime;
/** 写入一张卡（去重、核心互斥移除、picks+1）；返回是否真的写入。 */
export function applyUpgrade(build: BuildState, cardId: CardId, data: DataRegistry): boolean;
/** 热度上限的唯一入口：持有 `heat-cap` 返回 4，否则 3。 */
export function heatCapFor(runtime: UpgradeRuntime): HeatLevel;
```

```ts
// src/game/save.ts（dev-progression，纯函数，不触 localStorage）
import type { RunResult } from '../types/game';
import type { RecordsV1, SaveDataV1, SaveLoadResult, SettingsPatch, SettingsV1 } from '../types/save';

/** 解析存档字符串：永不抛异常；损坏返回 recovered + 默认值。 */
export function parseSave(raw: string | null): SaveLoadResult;
/** 设置合并：缺字段补默认、非法值回默认、音量 clamp 0..1。 */
export function mergeSettings(current: SettingsV1, patch: Partial<SettingsV1>): SettingsPatch;
/** 结算写记录：best 比较、lastRun、clears/emptyHouse（不写局内进度）。 */
export function updateRecords(records: RecordsV1, result: RunResult, date: string): RecordsV1;
/** 序列化为稳定字符串（字段顺序固定，供测试与 diff）。 */
export function serializeSave(data: SaveDataV1): string;
```

### 5.3 战斗（dev-combat）

```ts
// src/game/combat.ts
import type { NoiseEntity, RunState, Seconds, ZoneId } from '../types/game';
import type { DataRegistry } from '../types/data';

export interface DamageResult {
  readonly burned: number;
  readonly sung: number;
  readonly converted: number;
}

/** 合唱波（每 4 拍开火）与烧穿结算；返回产出。 */
export function resolveChoirWave(run: RunState, data: DataRegistry, dt: Seconds): DamageResult;
/** 点燃脉冲对噪音的结算。 */
export function resolveIgniteDamage(run: RunState, zones: readonly ZoneId[], multiplier: number): DamageResult;
```

```ts
// src/game/enemies.ts
import type { NoiseEntity, Pool, ReturnListenerState, Rng, RunState, Seconds, ZoneId } from '../types/game';
import type { DataRegistry } from '../types/data';

export interface SpawnContext {
  readonly run: RunState;
  readonly data: DataRegistry;
  readonly rng: Rng;
  readonly pool: Pool<NoiseEntity>;
  readonly dt: Seconds;
}

export interface ReturnListenerResult {
  readonly state: ReturnListenerState;
  readonly spawned: boolean;
  readonly locked: boolean;
  readonly released: boolean;
  /** 唱化产生的观众数（烧死为 0）。 */
  readonly converted: number;
}

/** 刷怪：从光锥边缘 3–8m 生成；每 20s 30% 从背后；上限 180/90。 */
export function updateSpawner(ctx: SpawnContext): number;
/** 噪音行为：贴地爬向座位/循光直线/吞光块；唱化 2.5s。 */
export function updateNoise(run: RunState, data: DataRegistry, dt: Seconds): void;
/** 精英返听：4s 静止判定、锁定、解除、烧/唱结算。 */
export function updateReturnListener(run: RunState, data: DataRegistry, dt: Seconds): ReturnListenerResult;
```

```ts
// src/game/waves.ts
import type { Rng, RunState, Seconds } from '../types/game';
import type { DataRegistry } from '../types/data';

/** 本帧刷怪预算（纯函数，可单测）：段落生成率 × 裂缝加成，受同屏上限截断。 */
export interface WaveBudget {
  readonly floorNoise: number;
  readonly scream: number;
  readonly distortion: number;
  readonly cap: number;
  readonly fromBehindChance: number;
}

export function computeWaveBudget(run: RunState, data: DataRegistry): WaveBudget;
/** 消费预算并生成噪音（光锥边缘 3–8m；每 20s 30% 从背后）；返回生成数。 */
export function updateWaves(run: RunState, data: DataRegistry, rng: Rng, dt: Seconds): number;
```

```ts
// src/game/boss.ts
import type { BossState, RunState, Seconds, ZoneId } from '../types/game';
import type { DataRegistry } from '../types/data';

export interface BossUpdate {
  readonly phase: BossState['phase'];
  readonly changed: boolean;
  readonly strippedZone: ZoneId | null;
  readonly returnedAudience: number;
}

/** 6:30/6:45/7:15/7:40 四节点推进；静默段由 audio 与 store 共享同一 tick。 */
export function updateBoss(run: RunState, data: DataRegistry, dt: Seconds): BossUpdate;
```

### 5.4 渲染（dev-three / art-director）

```ts
// src/three/renderer.ts
import type { DisplaySettings } from '../types/save';
import type { RenderSnapshot } from '../types/game';

export interface RendererInfo {
  readonly webglVersion: 2;
  readonly maxTextureSize: number;
  readonly gpu: string;
}

export interface RenderStats {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly programs: number;
  readonly textures: number;
  readonly geometries: number;
  /** 半透明层叠的解析估算（§9.3），≤2.5。 */
  readonly overdrawEstimate: number;
  readonly dpr: number;
}

export interface FrameRenderer {
  readonly info: RendererInfo;
  resize(width: number, height: number, dpr: number): void;
  draw(snapshot: RenderSnapshot, settings: DisplaySettings): void;
  stats(): RenderStats;
  dispose(): void;
}

export function createRenderer(canvas: HTMLCanvasElement): FrameRenderer;
```

```ts
// src/three/scene.ts
import type { DataRegistry } from '../types/data';
import type { PaletteDef } from '../types/data';
import type * as THREE from 'three';

export interface SceneBundle {
  readonly scene: THREE.Scene;
  readonly stage: THREE.Group;
  readonly lights: { readonly key: THREE.SpotLight; readonly fill: THREE.SpotLight };
  setLighting(state: 'warm' | 'full' | 'blackout'): void;
  setVenueLight(value: number): void;
  dispose(): void;
}

export function createScene(data: DataRegistry, palette: PaletteDef): SceneBundle;
```

```ts
// src/three/camera.ts
import type { CameraFrame, PointerProjector, Vec2 } from '../types/game';
import type * as THREE from 'three';

export interface CameraRig extends PointerProjector {
  readonly camera: THREE.PerspectiveCamera;
  update(frame: CameraFrame, dt: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

/** 跟随玩家、俯角 22°、FOV 45；NDC → 舞台 XZ（PointerProjector）。 */
export function createCameraRig(canvas: HTMLCanvasElement): CameraRig;
```

```ts
// src/three/instancing.ts
import type { AudienceFrame, NoiseFrame, ParticleFrame } from '../types/game';
import type { DataRegistry } from '../types/data';
import type { DisplaySettings } from '../types/save';
import type * as THREE from 'three';

/** 观众：768 实例 + 768 手机灯（低画质 384）。脏区上传，不整批重传。 */
export interface AudienceInstances {
  readonly mesh: THREE.InstancedMesh;
  readonly phones: THREE.InstancedMesh;
  apply(frame: AudienceFrame, settings: DisplaySettings): void;
  dispose(): void;
}

export interface NoiseInstances {
  readonly mesh: THREE.InstancedMesh;
  apply(frame: NoiseFrame, settings: DisplaySettings): void;
  dispose(): void;
}

export interface ParticleInstances {
  readonly mesh: THREE.InstancedMesh;
  apply(frame: ParticleFrame): void;
  dispose(): void;
}

export function createAudienceInstances(data: DataRegistry): AudienceInstances;
export function createNoiseInstances(capacity: number): NoiseInstances;
export function createParticleInstances(capacity: number): ParticleInstances;
```

```ts
// src/three/fx.ts
import type { SfxId, Vec3 } from '../types/game';
import type * as THREE from 'three';

export interface FxSystem {
  /** 事件驱动的短特效（点燃脉冲、返听锁、人浪、白闪）。 */
  trigger(cue: SfxId | 'crack' | 'flash' | 'sweep', at: Vec3): void;
  update(dt: number): void;
  setReducedMotion(enabled: boolean): void;
  dispose(): void;
}

export function createFxSystem(scene: THREE.Scene): FxSystem;
```

```ts
// src/three/models.ts（art-director）
import type { CharacterDef, DataRegistry, PaletteDef } from '../types/data';
import type { MemberId, NoiseKind } from '../types/game';
import type * as THREE from 'three';

/** 舞台、四名成员、音箱堆、鼓台、假灯头；全部基础几何体 + 顶点色。 */
export function buildStage(data: DataRegistry, palette: PaletteDef): THREE.Group;
export function buildMembers(data: DataRegistry): ReadonlyMap<MemberId, THREE.Group>;
/** 40px 可读的观众低模（头 + 肩，8–12 面）；一个几何体供 InstancedMesh 复用。 */
export function buildAudienceGeometry(): THREE.BufferGeometry;
export function buildNoiseGeometries(): Readonly<Record<NoiseKind, THREE.BufferGeometry>>;
```

### 5.5 音频（dev-audio）

```ts
// src/audio/engine.ts
import type { AudioPort, ChoirZoneMix, IgniteQuality, LayerId, SfxId, ZoneId } from '../types/game';
import type { DataRegistry } from '../types/data';

export interface AudioEngine extends AudioPort {
  /** 节点计数（验收 ≤120；合唱池 ≤44）。 */
  nodeCount(): number;
  /** 当前绝对拍号（视觉节拍的唯一来源）。 */
  beatIndex(): number;
  dispose(): void;
}

/** 首次用户手势后创建；失败时返回 null，game 走静默降级。 */
export function createAudioEngine(data: DataRegistry): Promise<AudioEngine | null>;
```

```ts
// src/audio/music.ts
import type { LayerId, SegmentId } from '../types/game';
import type { ChordKey, DataRegistry } from '../types/data';

/** 5 层编曲：段落 → 层增益；段落切换只改 gain，不重建节点。 */
export interface MusicLayers {
  /** 该段各层目标增益（0..1），未列出的层为 0。 */
  layers(segment: SegmentId): ReadonlyMap<LayerId, number>;
}

export function createMusicLayers(data: DataRegistry): MusicLayers;
/** 段落切换（setTargetAtTime 0.12s）；静默段由 engine 的主总线负责。 */
export function setMusicSegment(segment: SegmentId, layers: MusicLayers, ctx: BaseAudioContext, bus: GainNode): void;
/** 某小节的和弦（含每第 4 小节七和弦判定），供四区声部与点燃判定使用。 */
export function chordAtBar(bar: number, segment: SegmentId, data: DataRegistry): ChordKey;
```

```ts
// src/audio/choir.ts
import type { ChoirZoneMix, HeatLevel, ZoneId } from '../types/game';

export interface ChoirPool {
  /** 每 4 拍更新一次混音参数（不建新节点）。 */
  setMix(mix: Readonly<Record<ZoneId, ChoirZoneMix>>): void;
  setSilenced(silenced: boolean): void;
  /** 合唱总线增益 0..1（静默段为 0）。 */
  readonly bus: GainNode;
  dispose(): void;
}

/** 12 声部（4 区 × 3 层）；每声部 1 osc + 1 gain + 1 panner = 36 节点。 */
export function createChoirPool(ctx: BaseAudioContext, data: DataRegistry): ChoirPool;
```

```ts
// src/audio/ir.ts
/** 程序化 IR：指数衰减噪声 + 早期反射，2.4s / 1.8s / 1.2s 三档。 */
export function renderImpulseResponse(ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer;
/** 无 Convolver 时的 FDN 降级（4 comb + 2 allpass）。 */
export function createFallbackReverb(ctx: BaseAudioContext): { readonly input: AudioNode; readonly output: AudioNode; dispose(): void };
```

```ts
// src/audio/sfx.ts
import type { IgniteQuality, SfxId } from '../types/game';

/** 12 个 SFX 的合成配方；节流由 minInterval/maxConcurrent 控制。 */
export function createSfxBank(ctx: BaseAudioContext, output: AudioNode): {
  play(id: SfxId, variant: IgniteQuality | null): void;
  dispose(): void;
};
```

### 5.6 UI（dev-ui）

```ts
// src/ui/bridge.ts
import type { HudSnapshot, SongView, UiBridge, UiState } from '../types/ui';
import type { GameStore } from '../game/store';
import type { DataRegistry } from '../types/data';
import type { SaveDataV1, SavePort, SettingsV1 } from '../types/save';

export interface BridgeDeps {
  readonly store: GameStore;
  readonly data: DataRegistry;
  readonly save: SavePort;
  readonly initialSave: SaveDataV1;
  readonly song: SongView;
}

/** UI 桥：屏幕状态、HUD 节流、命令转发、存档写入（防抖 250ms）。 */
export function createUiBridge(deps: BridgeDeps): UiBridge;
```

```ts
// src/ui/hooks.ts
import type { HudSnapshot, UiState } from '../types/ui';
import type { UiBridge } from '../types/ui';

/** useSyncExternalStore 封装（每帧最多 10 次通知）。 */
export function useHud(bridge: UiBridge): HudSnapshot;
export function useUi(bridge: UiBridge): UiState;
```

```ts
// src/ui/input-dom.ts
import type { InputBuffer } from '../game/input';

export interface DomInputOptions {
  readonly target: HTMLElement;
  /** 焦点在输入框/对话框内时不接管键盘。 */
  readonly ignoreWhenTyping: boolean;
}

/** 绑定 pointer/keyboard，卸载时返回清理函数（不保存全局状态）。 */
export function attachDomInput(buffer: InputBuffer, options: DomInputOptions): () => void;
```

```ts
// src/ui/copy.ts（dev-ui）
import type { FailureReason, Grade } from '../types/game';
import type { CopyBank, CopyContext, CopyLineDef } from '../types/data';

/** 文案渲染：失败卡三条原因、结算后台短句、空场文案、评级标签。 */
export interface CopyRenderer {
  failureLine(reason: FailureReason): string;
  backstageLines(ctx: CopyContext): readonly CopyLineDef[];
  emptyHouseLine(): string;
  gradeLabel(grade: Grade): string;
}

export function createCopyRenderer(bank: CopyBank): CopyRenderer;
```

```ts
// src/App.tsx（dev-ui）
import type { ReactElement } from 'react';
import type { UiBridge } from '../types/ui';

/** UI 根组件：只接 bridge，不创建单例、不碰 Three、不承载游戏循环。 */
export function App(props: { readonly bridge: UiBridge }): ReactElement;
```

### 5.7 装配与平台（tech-director）

```ts
// src/main.tsx
/** 唯一启动入口：创建单例、挂载 React、启动循环；返回卸载函数。 */
export function bootstrap(root: HTMLElement, canvas: HTMLCanvasElement): Promise<() => void>;
```

```ts
// src/platform/local-storage.ts
import type { SaveLoadResult, SavePort, StorageLike } from '../types/save';

/** localStorage 适配：getItem/setItem 抛错时静默降级。 */
export function createLocalStorageSavePort(storage: StorageLike | null): SavePort;
```

```ts
// src/platform/webgl-support.ts
export interface WebGL2Support {
  readonly ok: boolean;
  readonly reason: string | null;
}
/** 创建临时 canvas 探测 WebGL2；失败给出中文原因（不抛异常）。 */
export function detectWebGL2(): WebGL2Support;
```

```ts
// src/platform/bootstrap.ts
import type { DevFlags } from '../types/ui';

/** 启动前置：解析查询参数、检测 WebGL2、决定 dev 开关；不创建渲染器。 */
export interface BootContext {
  readonly dev: DevFlags;
  readonly webgl2: { readonly ok: boolean; readonly reason: string | null };
  readonly supported: boolean;
}

/** search 传 `window.location.search`；纯函数，可单测（不读全局）。 */
export function createBootContext(search: string): BootContext;
```

```ts
// tools/build-single.mjs（Node ESM，零依赖）
/** 读取 dist/，内联为单文件并写出 dist/girls-band-live.html 与根 index.html。 */
export async function buildSingle(rootDir: string): Promise<{ bytes: number; sha256: string }>;
```

### 5.8 内容与资产（dev-content / art-director）

```ts
// src/assets/procedural.ts（art-director）
import type * as THREE from 'three';

/** 10 张程序化 CanvasTexture 的 id（与 art-direction.md 的贴图清单一致）。 */
export type TextureId =
  | 'seat-atlas' | 'stage-concrete' | 'stage-grid' | 'noise-grain' | 'setlist-paper'
  | 'handbill' | 'zone-glow' | 'phone-flare' | 'cone-falloff' | 'wave-streak';

/** 纹理生成器：按 id 缓存，重复调用返回同一张；零外部素材。 */
export interface ProceduralAssets {
  texture(id: TextureId): THREE.CanvasTexture;
  dispose(): void;
}

export function createProceduralAssets(): ProceduralAssets;
```

---

## 6. React ↔ Three ↔ game 桥接

### 6.1 外部 store（不用状态库）

- **单例**：`createGameStore`、`createRenderer`、`createAudioEngine`、`createUiBridge` 全部在 `main.tsx` 创建一次，React 只拿引用。
- **读**：`useSyncExternalStore(bridge.hud.subscribe, bridge.hud.getSnapshot)`；`getSnapshot` 必须返回**同一引用**直到内容变化（否则 React 19 会无限重渲染）。
- **写**：只通过 `bridge.dispatch(command)`；UI 不直接调 store 的 `tick`/内部函数。
- **HUD 快照结构**见 `src/types/game.ts` 的 `HudSnapshot`：局内 0 个数字（覆盖比例、四区热度、危险条、节拍相位、段位点、状态图标）。

### 6.2 HUD ≤10Hz 的具体实现

```ts
// bridge.ts 内部（示意，实现以文件为准）
const HUD_INTERVAL = 0.1;            // 1000ms / 10Hz
let lastPublish = -Infinity;
let cached: HudSnapshot = store.getHud();
function publishHud(now: Seconds): void {
  if (now - lastPublish < HUD_INTERVAL) return;
  const next = store.getHud();       // store 内部按拍点边界重建，引用稳定
  if (next === cached) return;
  cached = next;
  lastPublish = now;
  listeners.forEach((l) => l());
}
```

- 通知条件：内容引用变化 **且** 距上次 ≥100ms；两者同时满足才 `notify`。
- `HudSnapshot.revision` 由 store 在每个逻辑拍点边界 +1；UI 用它做 key。
- 禁止在 rAF 回调里 `setState`；禁止把 `RenderSnapshot` 传给 React。
- 升级三选一/暂停/结算属于低频 UI，走 `publishUi()`（状态变化时调用，不节流）。

### 6.3 屏幕路由

| 当前 | 事件 | 下一屏 / 覆盖层 |
| --- | --- | --- |
| `boot` | WebGL2 检测完成 + 首次手势 | `menu` |
| `menu` | `start-run` | `playing` |
| `menu` | 点击“今晚的曲目单 / 排练室 / 设置 / 制作名单” | 对应屏（`backTo: menu`） |
| `playing` | `Esc` / `pause` | `playing` + overlay `pause` |
| `playing` | 升级触发（`LevelUpEvent`） | overlay `levelup`（模拟冻结） |
| `playing` | 中断（安可用尽） | overlay `failure` → 3s 后 `results` |
| `playing` | 9:10 最后一音 / 空场结束 | `results` |
| `results` | 再演一场 | `playing`（同 seed 规则见 §7.5） |
| `results` | 回主菜单 | `menu` |

- `App.tsx` 只渲染当前 `route.screen`；`overlay` 叠在 `playing` 之上，同一时刻只允许一个。
- 路由变化不得重建 renderer / audio / store；只切 React 子树。

### 6.4 启动与销毁顺序

```
bootstrap(root, canvas)
 1. detectWebGL2() → 失败：渲染中文提示（React boot 屏），返回空清理函数
 2. createLocalStorageSavePort(window.localStorage) → load()（永不抛）
 3. buildDataRegistry()（dev 下跑 validateData，失败仅 console.warn）
 4. createRenderer(canvas)（失败 → 提示屏）
 5. createScene / createCameraRig / createInstancing / createFxSystem
 6. createAudioEngine(data)（不 start；等待首次手势）
 7. createEventBus / createRng(seed) / createGameStore
 8. createUiBridge
 9. createRoot(root).render(<App bridge={bridge} />)
10. createInputBuffer + attachDomInput
11. createLoop.start()（rAF 常驻；模拟只在 playing 相位推进）
12. 首次 pointerdown/keydown → audio.start()（失败静默降级）

dispose()
 1. loop.stop()
 2. attachDomInput 返回的清理函数
 3. uiBridge.dispose()
 4. store.dispose()（退订事件、释放池）
 5. audio.dispose()
 6. fx / instancing / camera / scene / renderer.dispose()
 7. root.unmount()
```

- 顺序不可交换：音频必须在 renderer 之后释放（音频事件可能触发 UI 提示）。

### 6.5 React 19 StrictMode 与 HMR

- React 树挂在 `#root`，开 `StrictMode`；所有单例在 `main.tsx` 模块级创建，**不放入 effect**，避免开发期双挂载重复实例。
- `App.tsx` 只做订阅与卸载清理；effect 内不得创建 renderer/audio。
- Vite HMR：`import.meta.hot?.dispose(() => dispose())`；生产构建无此分支。

### 6.6 禁止清单（review 直接判 blocking）

- UI 里 `new THREE.*` / `WebGLRenderer`；
- `src/game/**` 中出现 `window`、`document`、`localStorage`、`AudioContext`；
- 每帧 `setState` / `useState`；
- 把可变对象直接传进 React 又原地修改；
- 在 render 中 `dispatch`（必须放事件处理器或 effect）。

---

## 7. 数据 schema 与 id 规则

### 7.1 id 规则（与 `src/types/game.ts` 的联合类型一一对应）

- 全部 kebab-case：`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`；
- 三类 id 固定联合类型（不可扩展）：`ZoneId`（4）、`SegmentId`（5）、`MemberId`（4）；
- 卡 id 固定 24 个 `CardId`；进化固定 3 个 `EvolutionId`；
- 数据注册表用**穷尽 Record**：`Readonly<Record<CardId, CardDef>>`，缺一张 `tsc` 直接报错（F1 的编译期保险）；
- 数据自检 `validateData(data): readonly string[]`（dev/测试调用）：卡池 24、核心 3、支援 15、通用 6、进化引用齐全、座位 768、段落 5、SFX 12、合唱声部 12。
- **热度口径（与 acceptance §0 第 7 条一致）**：共 5 档 0–4——0 灰 / 1 抬头 / 2 举棒 / 3 合唱 / 4 和声。常态上限为 3；第 5 档 4 仅由 `heat-cap` 卡解锁（`heatCapFor()` 返回 3 或 4），HUD 用主色高亮 + 每拍双闪 + 外环表示，输出 +25%、褪色 ×1.5、不新增颜色。与 GDD §4 / §7.3 / §12.2 一致。

**内容项与 GDD 用语的对应**（GDD 用“武器 / 波次 / 台词”，本项目按冠军 C 的设定映射为下表，避免出现不存在的系统）：

| GDD 用语 | 本项目实现 | 类型 | 说明 |
| --- | --- | --- | --- |
| 武器 | 光的三种形态 | `LightFormDef`（`Record<LightMode, …>`） | GDD §6.1 锁定；没有独立武器系统，`weapons.ts` 不创建 |
| 波次 | 段落 + 生成率 + 裂缝/返听上限 | `SegmentDef.spawnRates`、`balance.noise` | 刷怪按段推进，不设离散波次编号 |
| 台词 | 文案库（四名成员 + 旁白） | `CopyBank`、`CopyLineDef` | 由本局数据驱动，不联网、不生成自由文本 |
| 进化 | 3 个进化 | `EvolutionDef` | `core + requires` 可解析，见 §7.3 |
| 敌人 | 3 常规 + 1 精英 + Boss | `NoiseDef`、`BossDef` | `NoiseKind` 固定 5 值 |
| 颜色 | 16 个 palette token | `PaletteDef`、`PaletteToken` | 三色规则（灰/彩/黑）写进验收 |


### 7.2 24 卡 id 表（数据层必须逐项实现）

| 类别 | id | 名称 | 构筑 |
| --- | --- | --- | --- |
| 核心 | `choir-wall` | 合唱墙 | 合唱流 |
| 核心 | `solo-return` | 回照 | 独奏流 |
| 核心 | `bait-line` | 引线 | 招灾流 |
| 支援 | `four-part` | 四部齐 | 合唱流 |
| 支援 | `keep-them` | 留人 | 合唱流 |
| 支援 | `front-row` | 第一排 | 合唱流 |
| 支援 | `sing-under-light` | 灯下合唱 | 合唱流 |
| 支援 | `heat-cap` | 热度上限 | 合唱流 |
| 支援 | `tight-beam` | 收束 | 独奏流 |
| 支援 | `shield` | 护盾 | 独奏流 |
| 支援 | `solo-extend` | 独奏延长 | 独奏流 |
| 支援 | `burn-chain` | 烧穿 | 独奏流 |
| 支援 | `self-hear` | 自听 | 独奏流 |
| 支援 | `return-bait` | 返听诱饵 | 招灾流 |
| 支援 | `distortion-feed` | 失真饲料 | 招灾流 |
| 支援 | `black-tide` | 黑潮 | 招灾流 |
| 支援 | `louder-brighter` | 越吵越亮 | 招灾流 |
| 支援 | `reverse-light` | 反向灯 | 招灾流 |
| 通用 | `breathe` | 换气 | — |
| 通用 | `pluck` | 擦弦 | — |
| 通用 | `second-row` | 第二排 | — |
| 通用 | `footwork` | 走位 | — |
| 通用 | `beat-ignite` | 节拍点燃 | — |
| 通用 | `encore-insurance` | 安可保险 | — |

### 7.3 进化解析与 modifier 合成

- 解析：`EvolutionDef.core === build.coreCard` 且 `requires.every(id => build.cards.includes(id))` → 进化按 `builds[build].evolution` 触发，每局一次。
- 卡效果：`CardModifier { key, value }`；合成规则集中在一处 `collectModifiers()`：
  - 同名 key：**加法**（`heat-cap` 等上限类为 `max()`，由 `ModifierKey` 白名单决定）；
  - 百分比类统一存小数（`0.2` 表示 +20%），由使用方乘算；
  - 代价写成负值（例如人气衰减 +15% = `audience-decay-rate: 0.15`）；
  - 未在 `collectModifiers` 白名单的 key 视为数据错误，dev 启动时报错。
- 抽卡（F1 数学）：24 卡池、核心 3 互斥、单局 10 次；选核心后移除其余 2 核心与另两条构筑 10 张支援 → 剩余 11 张（5 支援 + 6 通用），剩余选择 9 次，故最少 2 张不见。

### 7.4 座位网格与四声部

- 24 排 × 32 座 = 768；中央走道在列 15/16 之间，主走道在排 11/12 之间。
- 四区各 12 排 × 16 座 = 192：
  - `front-left`：排 0–11、列 0–15；`front-right`：排 0–11、列 16–31；
  - `back-left`：排 12–23、列 0–15；`back-right`：排 12–23、列 16–31。
- 声部固定：根 / 三 / 五 / 七；第 4 区只在七和弦小节是内音（`ChordDef.zoneInChord`）。
- 渲染实例索引 = `row * 32 + col`；`AudienceFrame.state/heat/phone/zone` 与之同序。

### 7.5 种子与 dev 入口

- 种子来源：`?seed=12345`（dev/QA）或 `Date.now() % 2^31`（正式）；写入 `RunConfig.seed`。
- 同 seed 复现：刷怪、卡序、观众初始分布、Boss 抖动全部走 `Rng.fork('spawn'|'cards'|'seats'|'fx')`；`src/game/**` 禁止 `Math.random`（`tests/determinism.test.ts` 扫描）。
- dev 入口（仅 `?dev=1`）：
  - `?dev=1&seed=N`：固定种子；
  - `?dev=1&run=gate-90s`：90 秒门埋点局（`RunConfig.mode='gate-90s'`）；
  - `?dev=1&quality=low`：强制低画质；
  - `?dev=1&scene=results`：直接进结算（QA 截图用，数据为合成样本，带 `DEV` 水印）；
  - `window.__gblTelemetry?.exportJson()`：导出最近一局埋点（仅 dev）。
- 正式构建：`import.meta.env.DEV === false` 时以上分支与 telemetry 记录器全部 tree-shake。

---

## 8. 存档

### 8.1 schema（与 `src/types/save.ts` 一一对应）

```json
{
  "version": 1,
  "settings": {
    "master": 0.8, "music": 0.7, "sfx": 0.8,
    "quality": "high", "reducedMotion": false, "highContrast": false,
    "beatPulse": true, "lowFlash": false
  },
  "records": {
    "bestAudience": 0, "bestTime": 0, "clears": 0, "emptyHouse": 0,
    "bestRank": "-",
    "lastRun": { "date": "2026-10-28", "audience": 0, "converted": 0, "burned": 0, "rank": "-", "segments": 0 }
  },
  "unlocks": { "cardsSeen": [], "momentsSeen": [] }
}
```

### 8.2 读取与回退（顺序固定）

1. `localStorage.getItem('gbl.save.v1')`，抛错 → 默认值 + `status='fresh'`；
2. `JSON.parse` 失败 → 备份原文到 `gbl.save.v1.bad` → 默认值 + `status='recovered'`；
3. `version !== 1` → 丢弃（不迁移，v1 是首个版本）→ 默认值 + `recovered`；
4. 逐字段校验：数值 clamp 到允许区间（音量 0..1、quality 只允许 `high|low`）；未知字段忽略；
5. `unlocks` 只保留 `CardId`/`MemberMomentId` 合法值，去重；
6. 读取结果**永不抛异常**，最多 2ms。

### 8.3 写入时机

| 触发 | 内容 | 时机 |
| --- | --- | --- |
| 设置变更 | `settings` | 250ms 防抖 |
| 每局结束 | `records`（含 lastRun） | 结算产生 `RunResult` 后一次 |
| 首次见到卡/瞬间 | `unlocks` | 立即（低频） |
| 写入失败 | 静默，不重试、不提示 | — |

- 只存设置/记录/解锁；**不存局内进度**，重开从 0:00 开始。
- `records.bestRank` 比较顺序：`S > A > B > C > '-'`。

---

## 9. 性能预算与测量

### 9.1 预算表（来自 GDD §16.3，锁定）

| 项 | 目标 | 上限 | 测量方式 |
| --- | ---: | ---: | --- |
| 帧率（1280×720 高画质） | 60fps | ≥55fps 均值 | `FrameStats` 30s 采样 |
| 帧率（1280×720 低画质） | 60fps | ≥55fps 均值 | 同上 |
| 帧时间 p95 | 16.6ms | 20ms | 采样直方图 |
| 模拟 | ≤4ms | 6ms | `performance.now()` 包住 tick 批 |
| 渲染 | ≤6ms | 8ms | rAF 前后差 |
| Draw calls | ≤45 | 60 | `renderer.info.render.calls` |
| 三角面 | ≤80k | 120k | `renderer.info.render.triangles` |
| 光锥 overdraw | ≤25% 屏幕 | 30% | §9.3 解析估算 |
| 总 overdraw | ≤2.0× | 2.5× | §9.3 解析估算 |
| 粒子 | 300 | 300（低 120） | 池 `active.length` |
| DPR | 1.5 | 低画质 1.0 | `renderer.getPixelRatio()` |
| 实体 | — | 960 | 观众 768 + 噪音 180 + 余量 |
| React HUD | 10Hz | 10Hz | bridge 计数 |
| 音频节点 | — | 120（合唱 ≤44） | `AudioEngine.nodeCount()` |

### 9.2 实例与上传策略

- 观众 768 → 2 个 `InstancedMesh`（人形 + 手机灯）；`instanceMatrix` 只在座位布局变化时整批上传（一局一次）。
- 每帧只更新 `instanceColor` 的脏区：`AudienceFrame.dirty` 由 store 合并相邻区间（上限 8 段/帧），渲染层用 `BufferAttribute.updateRanges` 局部上传。
- 热度/状态用属性整型纹理（`DataTexture`，768×1 RGBA8）传递：状态、热度、手机灯、区索引各 1 通道；每帧最多 1 次 `needsUpdate`。
- 噪音 180 → 1 个 `InstancedMesh`（三种几何合并为一个，实例属性区分）；精英/Boss 独立 mesh（各 1 draw call）。
- 粒子 300 → 1 个 `InstancedMesh`（四边形），`Points` 不用（移动端不需要，四边形更稳）。
- 无阴影、无后处理、无 SSAO/Bloom；白闪用 CSS overlay（`#flash`），静默用 scene 灯光态切换。

### 9.3 overdraw 口径

- 解析估算：遍历所有半透明/自发光面片，取投影后屏幕面积 × alpha 累加 / 画布面积；写入 `RenderStats.overdrawEstimate`。
- 光锥：加法混合，`depthWrite=false`、`depthTest=true`，alpha 峰值 ≤0.25；同时可见 ≤2 个（主光 + 场馆光）。
- 达标线：`overdrawEstimate ≤ 2.5`，且单锥屏幕覆盖 ≤30%。

---

## 10. 构建与单文件

### 10.1 Vite 配置要点（`vite.config.ts`）

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: false,
    sourcemap: false,
    assetsInlineLimit: 100_000_000,
    modulePreload: false,
    reportCompressedSize: false,
    rollupOptions: { input: 'src/index.html' },
  },
  esbuild: { legalComments: 'eof', charset: 'utf8' },
});
```

- `src/index.html` 只做三件事：`<div id="root"></div>`、`<canvas id="game-canvas"></canvas>`、`<script type="module" src="./main.tsx"></script>`。
- 不写 `<link rel="icon">`（避免外部请求）；CSS 全部从 `main.tsx` import。
- `legalComments: 'eof'` 保留 React/Three 的 MIT 声明（约 3–5KB），满足许可证要求。

### 10.2 `tools/build-single.mjs` 算法（零依赖）

1. 读 `dist/index.html`、`dist/assets/*.js`、`dist/assets/*.css`；
2. 删除所有 `<link rel="modulepreload">`；
3. 把 `<link rel="stylesheet" href="...">` 替换为 `<style>…</style>`（CSS 内 `url(...)` 已内联，不再出现）；
4. 把 `<script type="module" ... src="...">` 替换为 `<script type="module">…</script>`；
5. JS 内容做安全处理：`</script` → `<\/script`，`<!--` → `<\!--`；
6. 移除 `<script type="module">` 上的 `crossorigin`；
7. 写入 `dist/girls-band-live.html` 与根 `index.html`（字节一致）；
8. 返回 `{ bytes, sha256 }`，`build` 结束时打印。

### 10.3 `tools/validate.mjs` 的 14 条规则（`npm run validate`）

| # | 规则 | 失败信息 |
| --- | --- | --- |
| R1 | `dist/girls-band-live.html` 与根 `index.html` 存在 | 缺少产物 |
| R2 | 两个文件字节一致（SHA-256 相同） | 根入口与 dist 不一致 |
| R3 | 体积 ≤ 4 MiB（`4 * 1024 * 1024`） | 超预算，列出字节数 |
| R4 | 含 `<div id="root">`，且位于首个 `<script` 之前 | 挂载点缺失/顺序错误 |
| R5 | 恰好 1 个 `<script type="module">`，且无 `src=` | 脚本未内联或重复 |
| R6 | 无 `<link rel="stylesheet"`、无 `<link` 指向 http(s) | 外链样式 |
| R7 | 无 `http://`、`https://`、`//cdn`（例外：`xmlns="http://www.w3.org/2000/svg"`） | 外部 URL |
| R8 | 无 `fetch(`、`XMLHttpRequest`、`WebSocket`、`EventSource`、`import(`、`new Worker(` | 运行时会联网/动态加载 |
| R9 | 无 `@font-face`、`fonts.googleapis`、`.woff`、`.ttf` | 外部字体 |
| R10 | 无 `sourceMappingURL`、无 `crossorigin`、无 `integrity` | 调试产物残留 |
| R11 | 含 `girls-band-live` 与构建元信息注释（版本号，不含时间戳） | 版本标记缺失 |
| R12 | 分层检查：`game` 无 react/three/DOM；`three` 无 react；`ui` 无 three；`types` 无实现 import；无循环 import | 违反依赖方向（列出文件行号） |
| R13 | `src/game/**` 无 `Math.random`、无 `Date.now`；`src/ui/**` 无 `new THREE` | 破坏确定性/分层 |
| R14 | 两次构建（`dist/` 清空后）SHA-256 一致 | 构建不可重复 |

- validate 只读文件，不写任何内容；退出码非 0 时打印“失败规则 + 具体文件/行”。
- 成功输出固定一行：`validate: 14/14 rules passed`；失败输出 `validate: FAILED R<n> <message>`（`AC-T04` 以此字符串判定）。

### 10.4 体积超预算的处理顺序

1. 确认 Three 只 import 用到的模块（`three/src/...` 或 `three` 的 tree-shaking 效果）；
2. 关闭 `legalComments` 之外的注释、确认 `minify` 生效；
3. 检查是否误引入 `@types` 到运行时；
4. 仍超 4MiB → M6 不通过，由制作人提交用户确认是否放宽预算；不得删功能。

---

## 11. Vitest 策略

- 环境：`node`；只测 `src/game/**`、`src/data/**`、`src/audio/{ir,music}.ts`、`src/ui/copy.ts` 的纯函数部分（不测 React/Three/WebAudio 节点）。
- 命令：`npm test` = `vitest run`；不使用 coverage 插件（P1 再议）。
- 命名：`tests/<module>.test.ts`，`describe` 用中文描述行为，`it` 用“应……”句式。
- 单测不得读取真实时钟：所有函数接受注入时间/`dt`；`MusicClock` 用 fake。
- 期望指标：19 个文件、≥80 个 `it`、全部 <5s 跑完。

| # | 测试文件 | 必测内容 |
| --- | --- | --- |
| 1 | `tests/rng.test.ts` | 同 seed 序列一致；fork 互不串扰；shuffle 保持元素集合 |
| 2 | `tests/clock.test.ts` | 128BPM/4/4/304 小节；tick↔秒映射；乐句边界 |
| 3 | `tests/collision.test.ts` | 网格查询与暴力解一致（200 随机圆）；边界接触 |
| 4 | `tests/pool.test.ts` | 复用、容量上限返回 null、reset 调用 |
| 5 | `tests/light.test.ts` | 惯性/半径/三形态代价；回照人气 −1/4 拍；扫场奖励 |
| 6 | `tests/ignite.test.ts` | 完美/良好/错拍倍率；和弦内/外 ±25%；错拍 ≤40% |
| 7 | `tests/audience.test.ts` | 0.4/1.5s 两段；中断保留 50%；12s 掉级；覆盖 −1 与离场 |
| 8 | `tests/crowd-wave.test.ts` | 三次时间点；阈值不足→小浪；1:4 转化；裂缝 +1 |
| 9 | `tests/anti-camp.test.ts` | 驻守 bot 45s 掉 ≥40%；扫场 bot +20%；3 分钟落后 ≥25%；`dwellRewardRatio<0.75` |
| 10 | `tests/progression.test.ts` | 24/10/3 互斥；offer 不含已移除卡；进化条件；`picks ≤ 10` |
| 11 | `tests/boss.test.ts` | 6:30/6:45/7:15/7:40 相位；静默 8 小节；退场带走区阈值 |
| 12 | `tests/save.test.ts` | 损坏回退；缺字段补默认；clamp；`.bad` 备份；写失败静默 |
| 13 | `tests/hud.test.ts` | 白光公式 `0.85×(1−a/768)`；四区 waiting；0 数字（字段无 number 展示项） |
| 14 | `tests/determinism.test.ts` | 同 seed 两局 `RunResult` 全等；扫描 `src/game/**` 无 `Math.random`/`Date.now` |
| 15 | `tests/entities.test.ts` | 池化复用、id 稳定、dying 回收、容量上限不越界 |
| 16 | `tests/waves.test.ts` | 段落生成率、裂缝 +15%、同屏上限截断、背后生成概率 30% |
| 17 | `tests/upgrades.test.ts` | 单卡应用一次、核心互斥、`heatCapFor` 3/4、modifier 加法与上限取 max |
| 18 | `tests/music.test.ts` | 5 层段落掩码、段落切换目标增益、每第 4 小节七和弦 |
| 19 | `tests/copy.test.ts` | 三条失败原因模板、空场文案、评级标签、结算后台短句 4 条 |

---

## 12. 90 秒 C 核心测试场景与埋点

### 12.1 场景定义（唯一版本，M6 复测用）

- 入口：`?dev=1&run=gate-90s&seed=<N>`；**无 UI 提示、无教程弹窗**。
- 内容：0:00–1:30 序曲；无噪音；30 名观众（前两排，四区均匀）；1:12 最后一排最右的荧光棒亮起；1:30 自动结束并导出埋点。
- 采样：每 0.5s 一条 `TelemetrySample`；事件（点燃/转化/覆盖/返听/人浪）逐条记录。
- 导出：`window.__gblTelemetry.exportJson()` → QA 保存 `docs/qa/telemetry/seed-<N>.json`；不联网、不上传、不写存档。
- 正式构建：记录器不挂载，入口参数被忽略。

### 12.2 指标定义与通过线

| 指标 | 定义 | 通过线 |
| --- | --- | --- |
| `firstActiveLightMoveAt` | 光心首次进入某区座位包围盒、连续停留 ≥0.4s 的时刻；且该窗口玩家位移 <0.3m（排除跑动带动） | ≥7/10 人 ≤90s；中位数 ≤60s |
| `lightMovesPerMinute` | 主动移光次数 ×60/观测秒数；一次计为：光心跨区移动且 0.3s 内有指针输入；同区 <1.5m 抖动不计 | 中位数 ≥4 |
| `dwellP50` / `dwellP90` | 驻留段（连续停留在 1.5m 半径内）时长分布，仅统计 ≥0.6s 的段 | P50 ≤6s；P90 ≤14s |
| `zoneConversionRate[zone]` | 该区被照亮 ≥0.4s 的人数中最终转彩的比例 | 最低区 ≥最高区 ×0.6（防“只养一区”） |
| `igniteOnBeatRate` | (perfect + good) / 全部点燃；无点燃的样本不计入 | ≥0.55 |
| `dwellRewardRatio` | 驻留期人气净变化/秒 ÷ 移动期人气净变化/秒 | <0.75（驻守不是最优） |
| 返听出现 | 驻光 4.2s 内必须出现 | 是/否 |
| 驻守 bot | 见 §14.1 | 45s 掉 ≥40% |

### 12.3 与验收的对应

- `AC-H01` 用 10 份埋点 JSON 汇总；`AC-F03` 用 bot 测试；`AC-F04` 用 `firstActiveLightMoveAt`。
- 埋点字段只读展示，不进 HUD、不写存档；正式发布版本删除入口与记录器。

---

## 13. 12 声部合唱池与程序化 IR

### 13.1 声部池结构（4 区 × 3 层 = 12）

```
每声部：OscillatorNode(PeriodicWave "aah") → GainNode → StereoPannerNode → choirBus
合唱总线：choirBus → 压缩器 → 混响发送 → 总输出
额外：1 条共享呼吸噪声（BufferSource → bandpass → gain）叠加到合唱总线
节点计数：12×3 = 36 + 呼吸链 3 + 总线 3 + 压缩/混响 2 ≈ 44（≤44 预算）
```

- 单声部参数：`freq = 和弦音高 × 2^(cents/1200)`；`detune ∈ ±15 cents`（每声部由人数驱动微移，避免相位锁死）；`pan = 该区中心 ±0.35`（近/中/远三层扇形展开）。
- 层次映射：区内容量 192 → 近/中/远各 64 人；每层 8 人一档，`gain` 按 `√(人数/64) × 0.22`，上限 1。
- **变厚不变响**：人数每 +8 人 → 该层加一层 detune 声部并 `−3dB` 总线补偿；12 声部上限后只增混响湿度（`wet 0.18→0.42`），不再增音压。
- 更新频率：每 4 拍一次（`setChoir`），不每帧；参数用 `setTargetAtTime`，时间常数 0.08s。
- 静默段：`choirBus.gain = 0`（数字零），与主总线同步；`AudioContext` 时钟继续。

### 13.2 程序化 IR

```ts
// 伪代码（实现于 src/audio/ir.ts）
const length = Math.floor(ctx.sampleRate * seconds);       // 1.2 / 1.8 / 2.4s
for (let i = 0; i < length; i++) {
  const t = i / ctx.sampleRate;
  const decay = Math.exp(-t * (6.9 / seconds));            // −60dB 于 seconds
  left[i] = (rngA() * 2 - 1) * decay;
  right[i] = (rngB() * 2 - 1) * decay;
}
// 6 个早期反射抽头（8–60ms，左右不同延迟，幅度 0.35→0.12）
// 一阶低通模拟高频吸收（系数 0.55），归一化峰值 0.7
```

- 缓存：每档 IR 只生成 1 次，`ConvolverNode.normalize = true`；`ConvolverNode` 全项目 1 个实例。
- 降级（无 Convolver 或 CPU 超预算）：FDN（4 comb + 2 allpass，`DelayNode` + 反馈增益 0.7/0.62），听感更“房间”，成本 ~0.3ms。
- 验收：`AudioEngine.nodeCount() ≤120`；合唱池 ≤44；切换静默不断音（gain 到 0，不是 stop）。

### 13.3 混音（修切片“偏暗/琶音弱/鼓机感”）

- 目标高频占比 8–10%：踩镲 0.07→0.10、加 8 分 shaker、琶音 +3dB。
- Groove：每个鼓点固定 ±3–8ms 偏移 + ±2dB 力度（写死在数据里，不用随机），修复“像鼓机”。
- 母线：压缩 −18dB / 3.5:1 / 4ms / 220ms → 6kHz 高架 +2.5dB → tanh 软削波 → 总音量。
- 侧链：kick 压贝斯（0.52 / 14ms / 100ms）。

---

## 14. F3 / F5 / F8 / F9 的可测接口

### 14.1 F3 反驻守 → `updateLight` 的返回值 + bot 测试

接口（签名见 §5.2）：

```ts
export interface LightUpdate {
  readonly movedDistance: number;
  readonly sweptZones: number;
  readonly enteredZone: ZoneId | null;
  readonly modeChanged: boolean;
}
```

- 判定规则写在数据里（`balance.antiCamp`）：`anchorRadius 6`、`anchorSeconds 4.0`、`releaseDistance 8`、`releaseSeconds 1.5`、`sameZoneSeconds 5`、`sweepWindow 4`、`sweepZones 2`、`sweepBonus 0.2`；过热点由 `balance.heat.overheatSeconds 8` 控制。
- bot 测试（`tests/anti-camp.test.ts`，纯 game 层，60Hz 跑 180s）：
  - 驻守 bot：光心固定 + ±0.3m 微摆 → 断言 45s 人气相对开局下降 ≥40%，且返听在 4.2s 内出现；
  - 扫场 bot：每 3s 换区 → 断言 45s 人气净增 ≥20%；
  - 3 分钟对比：驻守人气低于扫场 ≥25%；
  - `dwellRewardRatio < 0.75`。
- 通过线同时被 `AC-F03`、`AC-H02` 引用；**不通过不是调数值，而是改规则**（GDD §11.2）。

### 14.2 F5 光跟拍 → `evaluateIgnite` + 关声可玩

```ts
export function evaluateIgnite(
  run: RunState,
  musical: MusicalPosition,
  data: DataRegistry,
  sweepBonus: number,
): IgniteResult;
```

- `IgniteResult.multiplier`：完美 1.6、良好 1.2、错拍 0.4；和弦内 ×1.25、外 ×0.75；扫场奖励再 +0.2。
- 判定窗口：`perfectWindow 0.08s`、`goodWindow 0.14s`（均由 `musical.beatPhase` 换算到最近拍）。
- 单测断言：完美/错拍伤害比 ≥1.5；错拍 ≤40% 基础；`igniteOnBeatRate` 由埋点统计。
- 关声可玩：视觉节拍环（`HudSnapshot.beatPhase/beatStrength`）与舞台脉冲驱动全部取自同一 `MusicClock`。

### 14.3 F8 血条视觉 → `computeWhiteout` + DOM 遮罩

```ts
// src/game/audience.ts（dev-engine，纯函数；与 HudSnapshot 同源）
export function computeWhiteout(audience: number, capacity: number): Ratio; // 0.85 * (1 - a/cap)，clamp 0..0.85
```

- 数据流：`HudSnapshot.whiteout` → React `#whiteout` 的 CSS 径向渐变 alpha；同时 `renderer` 用同一 uniform 对观众材质去饱和。
- 断言（`tests/hud.test.ts`）：`computeWhiteout(768,768)=0`、`(0,768)=0.85`、`(384,768)≈0.425`；单调递减；永不 >0.85。
- 不进后处理：`renderer.stats().programs` 中不得出现 EffectComposer 相关；`validate` R10 检查无 `EffectComposer` 字符串。
- 人测：5 人 3 秒读血量（`AC-11`）。

### 14.4 F9 overdraw → `RenderStats` + 预算开关

```ts
export interface RenderStats {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly programs: number;
  readonly textures: number;
  readonly geometries: number;
  readonly overdrawEstimate: number;
  readonly dpr: number;
}
```

- `createRenderer` 内部维护半透明面片清单；`stats().overdrawEstimate` = Σ(投影面积 × alpha)/画布面积。
- 断言（`tests/perf-budget.test.ts` 只测常量与解析函数，不测 GPU）：默认场景下估算 ≤2.5；draw call 预算常量与 GDD 一致；QA 实机读 `renderer.info` 复测（`AC-T17`）。
- 自动降级（§16）读取 `FrameStats.overBudgetSec`，连续 3s 超预算即降一档。

---

## 15. 依赖清单

| 名称 | 版本 | 用途 | 许可证 | 预估包体（min+gzip） | 是否新增 |
| --- | --- | --- | --- | ---: | --- |
| react | 19.3.1 | UI 运行时 | MIT | ~45KB | 否（已有） |
| react-dom | 19.3.1 | DOM 渲染 | MIT | ~130KB | 否 |
| three | 0.186.1 | 3D 渲染 | MIT | ~155KB（tree-shaken） | 否 |
| typescript | 5.9.3 | 编译（dev） | Apache-2.0 | 0（不进产物） | 否 |
| vite | 8.3.5 | 构建（dev） | MIT | 0 | 否 |
| @vitejs/plugin-react | 6.1.2 | JSX（dev） | MIT | 0 | 否 |
| vitest | 5.0.5 | 单测（dev） | MIT | 0 | 否 |
| @types/* | 见 §2 | 类型（dev） | MIT | 0 | 否 |

**新增依赖：0**。理由与备选评估：

| 候选 | 结论 | 理由 |
| --- | --- | --- |
| `zustand` / `redux` | 不引入 | 外部 store + `useSyncExternalStore` 约 60 行即可；多一个运行时包不划算 |
| `tone.js` | 不引入 | 调度语义与“静默段数字零/拍点统一”冲突；包体大；WebAudio 原生足以实现 5 层 + 12 声部 |
| `vite-plugin-singlefile` | 不引入 | `tools/build-single.mjs` 约 80 行零依赖；避免构建期第三方插件风险 |
| `seedrandom` | 不引入 | mulberry32 + FNV-1a 共约 20 行；确定性可单测 |
| `gl-matrix` | 不引入 | Three 自带 `Vector3/Matrix4`，逻辑层只用 Vec2 |
| `howler` | 不引入 | 只面向文件音频，与程序化合成目标相反 |
| `jsdom` | 不引入 | 不测 React 组件；实机 + 截图替代 |
| `@vitest/coverage-v8` | P1 再议 | 当前以“必测模块清单”代替覆盖率门槛 |

- 供应链：全部为既有依赖，版本已锁定在 `package.json`；新增依赖必须走 `docs/decisions/` 记录 + 制作人安装。

---

## 16. 风险、技术前提与降级路线

### 16.1 降级阶梯（自动，按顺序执行，只降表现不降逻辑）

| 档 | 触发 | 动作 |
| ---: | --- | --- |
| 0 | 默认 | 高画质：DPR 1.5、粒子 300、观众 768、噪音 180、2 真光 |
| 1 | 连续 3s `frameMs > 20` | DPR 1.25、粒子 220 |
| 2 | 仍超预算 3s | DPR 1.0、粒子 180 |
| 3 | 仍超预算 3s | 切低画质：观众可见 384、噪音 90、粒子 120、锥体 1 |
| 4 | 仍超预算 | 关闭手机灯实例、关闭假灯头闪烁；提示“已自动降低画质” |

- 回升只在**本局结束**时评估一次（避免抖动）；同一局最多降 3 档。
- 降级不改变判定：座位、热度、噪音数量逻辑仍按满量模拟；只减少渲染实例（低画质时不可见实例不更新 GPU）。

### 16.2 技术风险

| # | 风险 | 概率 | 影响 | 对策 | 验收 |
| --- | --- | --- | --- | --- | --- |
| T1 | 音频时钟与 rAF 漂移，拍点不准 | 中 | 高（玩法塌） | 只用 `AudioContext.currentTime`；lookahead ≥150ms；暂停用 `suspend()`；恢复对齐拍点 | `AC-18`、`AC-T18` |
| T2 | 768 实例 + 脏区上传写错，画面撕裂/掉帧 | 中 | 高 | typed array 单缓冲、`updateRanges` ≤8 段、整批只在布局变化时上传 | `AC-T17`、`AC-22` |
| T3 | 单文件在 `file://` 下 module 作用域/CSP 失败 | 中 | 高 | M6 第一周先验证 `file://`；`base:'./'`、`modulePreload:false` | `AC-T06` |
| T4 | React StrictMode 双挂载导致双 renderer/双 audio | 中 | 中高 | 单例在 `main.tsx` 创建；effect 只订阅 | `AC-T09`、review |
| T5 | 三色 + 白光 + `instanceColor` 在低端 GPU 上色阶断层 | 中 | 中 | 顶点色 + 8bit 属性纹理；高对比模式加形状 | `AC-21`、截图 |
| T6 | 静默段被当成 bug | 中 | 中高 | 电平表拉平、视觉节拍保留、叙事预告一次；`AC-14` 明文验收 | `AC-14` |
| T7 | 合唱“只变响不变厚” | 中 | 中高 | 12 声部 + detune + 混响湿度 + −3dB 补偿；A/B 盲听 | `AC-H06` |
| T8 | 24 卡数据漂移（缺卡/多卡/进化引用错） | 中 | 中 | 穷尽 `Record<CardId,...>` 编译期检查 + `validateData` + 单测 | `AC-F01` |
| T9 | 90 秒门不过 | 中高 | 致命（玩法） | 埋点前置 + 无教程序曲 + 唯一荧光棒；不过则改规则（不是调数值） | `AC-H01`、`AC-F04` |
| T10 | 类型契约漂移（7 人并行） | 中 | 中高 | 类型冻结；改动走 §17.2；`typecheck` 硬门 | `AC-T01` |
| T11 | 打包体积超 4MB | 低 | 中 | Three tree-shaking、无额外依赖、`legalComments:'eof'` | `AC-T05` |
| T12 | Safari 17 `file://` 行为差异 | 中 | 低 | 尽力兼容；不支持时给提示，不阻塞发布 | `AC-T06` |

### 16.3 技术前提（必须成立，否则方案要改）

1. 音频时钟可作为唯一时间源（WebAudio `currentTime` 单调且与视觉同步）；
2. 768 实例 + 30 万三角面内在 1280×720 可 60fps（低画质兜底）；
3. 单文件内联后在 Chrome/Edge/Firefox 的 `file://` 下可启动；
4. 12 声部合唱在 ~44 节点预算内成立；
5. `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` 下 7 人并行仍能保持 `typecheck` 0 错（靠类型冻结）。

---

## 17. 与 GDD §22 的映射与变更流程

### 17.1 GDD §22 逐条落点

| GDD 要求 | 本文件 |
| --- | --- |
| §22.1 单一数据源（beatGrid/segments/chords/cards/noiseTable/seatGrid/sfx） | §7（类型 `DataRegistry`）、§5.5、§13 |
| §22.1 共享类型清单 | `src/types/*.ts`（全部覆盖：`RunPhase`、`LightMode`、`ZoneId`、`AudienceCell`、`HeatLevel`、`NoiseKind`、`NoiseEntity`、`ReturnListenerState`、`CardId`、`CardDef`、`CardOffer`、`ChordDef`（对应 GDD 的 `Chord`）、`SegmentDef`、`RunState`、`HudSnapshot`、`RunResult`、`SaveDataV1`、`AudioCue`） |
| §22.1 所有系统读同一拍点 | §3.4、§12、§14.2 |
| §22.2 React 只做 UI、HUD ≤10Hz、禁每帧 setState | §6.1、§6.2 |
| §22.2 InstancedMesh、脏区、无阴影/后处理、真光 ≤2 | §9.2、§10.3 R10、§14.4 |
| §22.2 固定步长 60Hz、对象池、实体上限 960 | §3.4、§9.1、§5.1 |
| §22.2 种子确定性 | §7.5、§11 #14 |
| §22.2 音频 lookahead/suspend/对齐/静音视觉等价 | §13.1、§16.2 T1、§14.3 |
| §22.2 Vite 单文件、零外部、≤4MB | §10 |
| §22.3 系统单一 owner | §4.2 |
| §22.4 验收矩阵 | `docs/acceptance.md`（68 项，映射见其 §0.1；含 GDD §20.1 补充 A23–A27 与 §23.1 的五类锁定内容） |
| §22.4 技术红线（无后处理/真光≤2/每帧 setState/全量上传/低画质档/无外部） | §9、§10.3、§16 |

### 17.2 接口冻结与变更流程

1. `src/types/**` 与本文件 §5/§6 的签名 = 冻结接口；实现不得私自扩展。
2. 变更申请：在任务报告中写明“文件 + 现状 + 期望 + 影响模块 + 迁移方式”，由技术总监评估。
3. 批准后：技术总监**在一次提交中**同时改 `src/types/**` + 本文件 + 受影响的调用点，并在 `docs/decisions/` 记录。
4. 禁止：新增 `any` 绕过、在实现文件里私建同名类型、用 `as` 强转绕过契约。

---

## 18. 交付自检

| 检查 | 结果 |
| --- | --- |
| 三层边界与依赖方向明确、可机器检查 | 是（§3、§10.3 R12） |
| 文件清单与所有者完整、可并行 | 是（§4） |
| §4 每个逻辑/服务模块都有签名（42/42：game 20、three 6、audio 5、ui 5、集成 5、资产 1） | 是（§5） |
| 类型契约存在、纯类型、`tsc` 通过 | 是（`src/types/*.ts`，strict 四开关 0 错） |
| 桥接方式（外部 store + useSyncExternalStore + 10Hz） | 是（§6） |
| 数据 schema 与 id 规则、进化可解析 | 是（§7） |
| 存档 schema、损坏回退、只存三类 | 是（§8） |
| 性能预算与降级 | 是（§9、§16） |
| 构建与单文件、validate 规则 | 是（§10） |
| Vitest 策略与命令契约 | 是（§11） |
| 依赖清单（新增 0，附备选评估） | 是（§15） |
| ≥40 项验收矩阵 | 是（`docs/acceptance.md`，68 项） |
| 与 GDD 一致；每个接口都有签名，没有待补项 | 是（§17） |
| 仅桌面、无触屏内容 | 是（全文） |

*本文件是 M5 实现的唯一技术依据；与 `docs/agent-handbook.md` 冲突时以本文件为准。*
