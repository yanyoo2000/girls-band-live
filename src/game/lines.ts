/**
 * 三条乐器线：噪音拽线、玩家按住 E 插线、贝斯护盾。
 *
 * 用途：队友不是数值 buff，而是三条会断的线。断线让该成员的声音消失，
 * 贝斯线断掉还会让低频护盾失效（噪音移速惩罚消失）——这是“角色工具化”的反面。
 *
 * 依赖：`../types/game`（InstrumentLineId / LineState / RunState / Seconds）。
 * 注意：§5.2 的签名没有 `data` 参数，因此线的锚点（三名队友的舞台站位）只能
 * 由本模块常量提供；数值与 GDD §5.1 的站位一致，建议后续由 §5.2 增加 data 参数
 * 或把站位写进 `RunState`（见任务报告「与 tech-spec 的偏差」）。
 * 分配策略：返回值数组复用（模块级两个数组，每 tick 清空重填，不跨帧持有）。
 * 清理策略：计时状态放 `WeakMap<RunState>`，一局结束自动回收。
 *
 * 导出：`LineUpdate` 类型与 `updateLines(run, dt, interactHeld)`。
 */
import type { InstrumentLineId, RunState, Seconds, Vec2 } from '../types/game';

/** 线的锚点（队友站位，世界坐标；GDD §5.1：吉他右前 / 贝斯左前 / 鼓后中）。 */
const LINE_ANCHORS: Readonly<Record<InstrumentLineId, Vec2>> = {
  guitar: { x: 3.6, z: -2.2 },
  bass: { x: -3.6, z: -2.2 },
  drums: { x: 0, z: -3.4 },
};

/** 噪音拽线的判定半径（米）。 */
const LINE_BREAK_RADIUS = 1.2;
/** 噪音贴线多久后拽断（秒）。 */
const LINE_BREAK_SECONDS = 0.6;
/** 玩家插线的有效距离（米；GDD §15.2“1.5m 内”）。 */
const PLUG_RANGE = 1.5;
/** 插线所需按住秒数（GDD §5.2“1.2s”）。 */
const PLUG_SECONDS = 1.2;

/** 三线更新结果（模块级复用对象 + 两个复用数组，禁止跨帧持有）。 */
export interface LineUpdate {
  readonly broken: readonly InstrumentLineId[];
  readonly plugged: readonly InstrumentLineId[];
  readonly shieldActive: boolean;
}

/** 单线计时状态。 */
interface LineRuntime {
  /** 噪音贴线累计秒数。 */
  proximity: number;
  /** 本 tick 是否已上报断线（避免重复事件）。 */
  reportedBroken: boolean;
}

interface LinesRuntime {
  readonly guitar: LineRuntime;
  readonly bass: LineRuntime;
  readonly drums: LineRuntime;
  /** 本 tick 新断的线（复用数组）。 */
  readonly broken: InstrumentLineId[];
  /** 本 tick 新插上的线（复用数组）。 */
  readonly plugged: InstrumentLineId[];
}

const RUNTIMES = new WeakMap<RunState, LinesRuntime>();

function createLineRuntime(): LineRuntime {
  return { proximity: 0, reportedBroken: false };
}

function runtimeOf(run: RunState): LinesRuntime {
  const existing = RUNTIMES.get(run);
  if (existing !== undefined) {
    return existing;
  }
  const runtime: LinesRuntime = {
    guitar: createLineRuntime(),
    bass: createLineRuntime(),
    drums: createLineRuntime(),
    broken: [],
    plugged: [],
  };
  RUNTIMES.set(run, runtime);
  return runtime;
}

function lineRuntime(runtime: LinesRuntime, line: InstrumentLineId): LineRuntime {
  if (line === 'guitar') {
    return runtime.guitar;
  }
  if (line === 'bass') {
    return runtime.bass;
  }
  return runtime.drums;
}

function squaredDistance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

/** 是否存在足够近的活跃噪音（拽线判定）。 */
function noiseNear(run: RunState, anchor: Vec2, radius: number): boolean {
  const radiusSquared = radius * radius;
  const noises = run.noises;
  for (let i = 0; i < noises.length; i += 1) {
    const noise = noises[i];
    if (noise === undefined || !noise.active || noise.state === 'dying') {
      continue;
    }
    if (squaredDistance(noise.position, anchor) <= radiusSquared) {
      return true;
    }
  }
  return false;
}

const UPDATE: { broken: readonly InstrumentLineId[]; plugged: readonly InstrumentLineId[]; shieldActive: boolean } = {
  broken: [],
  plugged: [],
  shieldActive: true,
};

/**
 * 三条乐器线：噪音拽线、玩家按住 E 1.2s 插线、贝斯护盾。
 *
 * 顺序：先断线（噪音贴线 0.6s），再插线（玩家在 1.5m 内按住 E），最后结算护盾。
 */
export function updateLines(run: RunState, dt: Seconds, interactHeld: boolean): LineUpdate {
  const runtime = runtimeOf(run);
  runtime.broken.length = 0;
  runtime.plugged.length = 0;
  const lines: readonly InstrumentLineId[] = ['guitar', 'bass', 'drums'];
  const playerPosition = run.player.position;

  for (let i = 0; i < lines.length; i += 1) {
    const lineId = lines[i];
    if (lineId === undefined) {
      continue;
    }
    const state = run.lines[lineId];
    const anchor = LINE_ANCHORS[lineId];
    const timing = lineRuntime(runtime, lineId);

    if (!state.broken) {
      timing.reportedBroken = false;
      if (noiseNear(run, anchor, LINE_BREAK_RADIUS)) {
        timing.proximity += dt;
        if (timing.proximity >= LINE_BREAK_SECONDS) {
          state.broken = true;
          state.plugProgress = 0;
          timing.proximity = 0;
          runtime.broken.push(lineId);
          timing.reportedBroken = true;
        }
      } else {
        timing.proximity = 0;
      }
      continue;
    }

    // 断线：玩家靠近并按住 E 才恢复。
    const inRange = squaredDistance(playerPosition, anchor) <= PLUG_RANGE * PLUG_RANGE;
    if (inRange && interactHeld) {
      state.plugProgress += dt / PLUG_SECONDS;
      if (state.plugProgress >= 1) {
        state.broken = false;
        state.plugProgress = 0;
        runtime.plugged.push(lineId);
      }
    } else {
      state.plugProgress = Math.max(0, state.plugProgress - dt * 0.5);
    }
  }

  // 贝斯护盾：贝斯线未断时，闻笙侧翼的噪音移速 −30%（由 enemies 读取）。
  const shieldActive = !run.lines.bass.broken;
  run.lines.bass.shieldActive = shieldActive;

  UPDATE.broken = runtime.broken;
  UPDATE.plugged = runtime.plugged;
  UPDATE.shieldActive = shieldActive;
  return UPDATE;
}
