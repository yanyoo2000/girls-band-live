/**
 * 主循环：固定步长 60Hz 模拟 + 每帧渲染。
 *
 * 用途：`rAF` 只负责“什么时候推进”，模拟永远以 1/60s 的固定步长前进，
 * 保证同一 seed + 同一输入序列在任何机器上得到同一局面（确定性）。
 * 逻辑时间不读帧时钟；帧时钟只用于 `FrameStats`（QA 面板与自动降级）。
 *
 * 依赖：`../types/game`（AudioPort / FrameIndex / PointerProjector / Seconds）、
 * `../types/save`（DisplaySettings）、`./store`（GameStore）、`./input`（InputSampler）、
 * `../three/renderer`（FrameRenderer，只依赖其接口）。
 * 宿主 API：`requestAnimationFrame` 是 game 层唯一的宿主调度入口（tech-spec §6.4
 * 明确 loop 用 rAF 常驻）；`performance.now()` 只用于帧耗时统计，不参与玩法时间。
 * 若无 rAF（Node 单测），退化为 16ms `setTimeout`。
 * 分配策略：每帧只复用 `FrameStats` 对象；`input.sample` 每步长复用内部帧；
 * 无数组分配。
 *
 * 导出：`FrameStats` / `LoopDeps` / `LoopHandle` 类型与 `createLoop(deps)`。
 */
import type { AudioPort, FrameIndex, PointerProjector, Seconds } from '../types/game';
import type { DisplaySettings } from '../types/save';
import type { GameStore } from './store';
import type { InputSampler } from './input';
import type { FrameRenderer } from '../three/renderer';

/** 固定步长（秒）：60Hz；与 `balance.performance.fixedStepHz` 一致。 */
const FIXED_STEP: Seconds = 1 / 60;

/** 单帧最多补算的步数（防止切后台回来后“追帧”卡死）。 */
const MAX_STEPS_PER_FRAME = 5;

/** 单帧超过该毫秒数记为超预算（自动降级用；tech-spec §9.1 上限 20ms）。 */
const OVER_BUDGET_MS = 20;

/** 单帧 dt 上限（秒）：切后台/断点后不产生巨大步长。 */
const MAX_FRAME_DT = 0.25;

/** 无 rAF 环境的退化帧间隔（毫秒）。 */
const FALLBACK_FRAME_MS = 16;

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

/** 帧统计的可变内部结构（以只读接口暴露）。 */
interface MutableFrameStats {
  fps: number;
  frameMs: number;
  simMs: number;
  renderMs: number;
  drawCalls: number;
  triangles: number;
  overBudgetSec: Seconds;
  frame: FrameIndex;
}

/** 宿主单调时钟（只用于帧统计；玩法时间由 store 的 MusicClock 决定）。 */
function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : 0;
}

/**
 * 创建主循环（固定步长 60Hz + rAF 渲染）。
 *
 * - 模拟冻结由 store 的相位决定（`levelup` / `paused` / `results` 不推进），loop 不判断；
 * - 每帧最多 5 步补算，超过则丢弃余量（宁可慢一点，也不雪崩）；
 * - `stats.overBudgetSec` 连续超 20ms 累计，供 §16.1 自动降级读取。
 */
export function createLoop(deps: LoopDeps): LoopHandle {
  const stats: MutableFrameStats = {
    fps: 0,
    frameMs: 0,
    simMs: 0,
    renderMs: 0,
    drawCalls: 0,
    triangles: 0,
    overBudgetSec: 0,
    frame: 0,
  };

  const result: FrameStats = stats as FrameStats;
  let running = false;
  let scheduled = false;
  let rafHandle = 0;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let lastFrameTime = -1;
  let accumulator = 0;
  let simFrame = 0;
  let smaFrameMs = 16.7;

  const hasRaf =
    typeof requestAnimationFrame === 'function' && typeof cancelAnimationFrame === 'function';

  const cancelScheduled = (): void => {
    if (!scheduled) {
      return;
    }
    scheduled = false;
    if (hasRaf) {
      cancelAnimationFrame(rafHandle);
      rafHandle = 0;
    } else if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
  };

  const schedule = (): void => {
    if (!running || scheduled) {
      return;
    }
    scheduled = true;
    if (hasRaf) {
      rafHandle = requestAnimationFrame(onFrame);
    } else {
      timeoutHandle = setTimeout(() => onFrame(nowMs()), FALLBACK_FRAME_MS);
    }
  };

  const onFrame = (timeMs: number): void => {
    scheduled = false;
    if (!running) {
      return;
    }
    const frameStart = nowMs();
    const deltaSeconds =
      lastFrameTime < 0 ? FIXED_STEP : Math.min(MAX_FRAME_DT, Math.max(0, (timeMs - lastFrameTime) / 1000));
    lastFrameTime = timeMs;
    accumulator += deltaSeconds;

    // 1) 固定步长模拟。
    const simStart = nowMs();
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME) {
      const input = deps.input.sample(deps.projector);
      deps.store.tick(FIXED_STEP, input);
      // 边沿只在同一 DOM 帧的第一个固定步长生效（点击一次 = 一次点燃）。
      deps.input.buffer.clearFrameEdges();
      accumulator -= FIXED_STEP;
      steps += 1;
      simFrame += 1;
    }
    if (steps === MAX_STEPS_PER_FRAME) {
      // 追不上就丢弃余量，避免下一帧继续雪崩。
      accumulator = Math.min(accumulator, FIXED_STEP);
    }
    stats.simMs = steps > 0 ? nowMs() - simStart : 0;

    // 2) 渲染（读 store 的 RenderSnapshot，不写状态）。
    const renderStart = nowMs();
    deps.renderer.draw(deps.store.getRender(), deps.display());
    const renderEnd = nowMs();
    stats.renderMs = renderEnd - renderStart;

    // 3) 统计。
    const rendererStats = deps.renderer.stats();
    stats.drawCalls = rendererStats.drawCalls;
    stats.triangles = rendererStats.triangles;
    stats.frameMs = renderEnd - frameStart;
    smaFrameMs = smaFrameMs * 0.9 + stats.frameMs * 0.1;
    stats.fps = smaFrameMs > 0 ? 1000 / smaFrameMs : 0;
    stats.overBudgetSec =
      stats.frameMs > OVER_BUDGET_MS ? stats.overBudgetSec + deltaSeconds : 0;
    stats.frame = simFrame;

    deps.onStats?.(result);
    schedule();
  };

  const start = (): void => {
    if (running) {
      return;
    }
    running = true;
    lastFrameTime = -1;
    accumulator = 0;
    smaFrameMs = 16.7;
    stats.overBudgetSec = 0;
    schedule();
  };

  const stop = (): void => {
    running = false;
    cancelScheduled();
  };

  return {
    start,
    stop,
    isRunning: () => running,
    stats: result,
  };
}
