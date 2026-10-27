/**
 * 90 秒门埋点：0.5s 采样 + 事件流水，最后汇总成 `TelemetryRun`。
 *
 * 用途：C《谁在听》的玩法成立性由“玩家会不会主动移光”裁决（tech-spec §12）：
 * firstActiveLightMoveAt / lightMovesPerMinute / dwellP50·P90 / zoneConversionRate /
 * igniteOnBeatRate / dwellRewardRatio 六个指标全部来自这里。
 * 只在 dev/QA 构建挂载（正式构建传 null 由 tsc tree-shaking 掉），仅内存、不联网。
 *
 * 依赖：`../types/game`（TelemetrySample / TelemetryRun / TelemetryRecorder /
 * GameEvent / RunMode / EndingKind / HeatLevel / Ratio / Seconds / ZoneId）。
 * 容量策略：采样环形缓冲 2048 条（9:30 一局最多 1140 条），事件缓冲 4096 条；
 * 超出丢弃最旧，内存不随局时长增长。`begin()` 重置指针，旧数组复用不重新分配。
 *
 * 导出：
 * - `createTelemetryRecorder(startedAt)`；
 * - `summarizeRun(samples, events, seed, mode, ending)`（纯函数，可单测）。
 */
import type {
  EndingKind,
  GameEvent,
  RunMode,
  Seconds,
  TelemetryRecorder,
  TelemetryRun,
  TelemetrySample,
  ZoneId,
} from '../types/game';

/** 采样缓冲容量（2048 × 0.5s ≈ 17 分钟，覆盖 9:30 一局）。 */
const SAMPLE_CAPACITY = 2048;
/** 事件缓冲容量（一个 tick 最多几十条转化事件；一局远小于此）。 */
const EVENT_CAPACITY = 4096;

/** 需要留存的事件种类（足够复算 6 个指标，不存 hud/audio-cue 噪音）。 */
const KEPT_EVENTS: ReadonlySet<GameEvent['kind']> = new Set<GameEvent['kind']>([
  'ignite',
  'convert',
  'cast-out',
  'cover',
  'crowd-wave',
  'return-listener',
]);

/** 环形缓冲（固定容量，覆盖最旧）。 */
interface Ring<T> {
  readonly items: (T | null)[];
  head: number;
  size: number;
}

function createRing<T>(capacity: number): Ring<T> {
  return { items: new Array<T | null>(capacity).fill(null), head: 0, size: 0 };
}

function ringPush<T>(ring: Ring<T>, item: T): void {
  const capacity = ring.items.length;
  if (capacity === 0) {
    return;
  }
  if (ring.size < capacity) {
    ring.items[(ring.head + ring.size) % capacity] = item;
    ring.size += 1;
    return;
  }
  ring.items[ring.head] = item;
  ring.head = (ring.head + 1) % capacity;
}

function ringToArray<T>(ring: Ring<T>): readonly T[] {
  const capacity = ring.items.length;
  const result: T[] = [];
  for (let i = 0; i < ring.size; i += 1) {
    const item = ring.items[(ring.head + i) % capacity];
    if (item !== null && item !== undefined) {
      result.push(item);
    }
  }
  return result;
}

/** 分位数（线性插值；空数组返回 0）。 */
function percentile(sorted: readonly number[], ratio: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const position = (sorted.length - 1) * ratio;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower] ?? 0;
  const high = sorted[upper] ?? low;
  return low + (high - low) * (position - lower);
}

/** 相邻采样间光心位移（米）。 */
function lightStep(a: TelemetrySample, b: TelemetrySample): number {
  const dx = b.light.x - a.light.x;
  const dz = b.light.z - a.light.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * dev/QA 构建启用；正式构建传 null（tree-shaken）。
 *
 * @param startedAt ISO 时间戳（由 platform 层提供，game 层不读时钟）
 */
export function createTelemetryRecorder(startedAt: string): TelemetryRecorder {
  const samples = createRing<TelemetrySample>(SAMPLE_CAPACITY);
  const events = createRing<GameEvent>(EVENT_CAPACITY);
  let seed = 0;
  let mode: RunMode = 'normal';

  const begin = (nextSeed: number, nextMode: RunMode): void => {
    samples.head = 0;
    samples.size = 0;
    events.head = 0;
    events.size = 0;
    seed = nextSeed;
    mode = nextMode;
  };

  const sample = (next: TelemetrySample): void => {
    ringPush(samples, next);
  };

  const event = (next: GameEvent): void => {
    if (KEPT_EVENTS.has(next.kind)) {
      ringPush(events, next);
    }
  };

  const finish = (ending: EndingKind | null): TelemetryRun => {
    const run = summarizeRun(ringToArray(samples), ringToArray(events), seed, mode, ending);
    // `summarizeRun` 的五个参数不含 startedAt（§5.2 冻结签名），由记录器补齐。
    return { ...run, startedAt };
  };

  return { begin, sample, event, finish };
}

/** 指标计算的最小输入（与 `summarizeRun` 参数同源）。 */
interface Options {
  readonly samples: readonly TelemetrySample[];
  readonly events: readonly GameEvent[];
  readonly seed: number;
  readonly mode: RunMode;
  readonly ending: EndingKind | null;
}

/**
 * 汇总指标（定义见 tech-spec §12.2）。纯函数，可单测。
 *
 * 口径说明（写入任务报告的“歧义”清单）：
 * - `firstActiveLightMoveAt`：签名没有 `DataRegistry`，无法读座位包围盒，因此用
 *   `litSeats > 0`（光罩到人）作为“进入座位区”的代理，并要求窗口内玩家位移 <0.3m；
 * - `lightMovesPerMinute`：采样里没有指针输入，用“光心位移 ≥1.5m”作为主动移光代理；
 * - `zoneConversionRate`：采样里没有分区点亮数，用 convert / (convert + cast-out) 事件比。
 */
export function summarizeRun(
  samples: readonly TelemetrySample[],
  events: readonly GameEvent[],
  seed: number,
  mode: RunMode,
  ending: EndingKind | null,
): TelemetryRun {
  const options: Options = { samples, events, seed, mode, ending };
  return summarize(options);
}

function summarize(options: Options): TelemetryRun {
  const { samples, events, seed, mode, ending } = options;

  let firstActiveLightMoveAt: Seconds | null = null;
  const dwellSegments: number[] = [];
  let moves = 0;

  // 1) 主动移光时刻：光罩到人、至少持续到下一个采样（0.5s ≥ 0.4s），且玩家几乎没动。
  for (let i = 0; i < samples.length; i += 1) {
    const current = samples[i];
    if (current === undefined) {
      continue;
    }
    if (current.litSeats <= 0) {
      continue;
    }
    const next = samples[i + 1];
    if (next === undefined || next.litSeats <= 0) {
      continue;
    }
    const playerDx = next.player.x - current.player.x;
    const playerDz = next.player.z - current.player.z;
    if (Math.sqrt(playerDx * playerDx + playerDz * playerDz) >= 0.3) {
      continue;
    }
    firstActiveLightMoveAt = current.t;
    break;
  }

  // 2) 移光次数 / 驻留段：以 1.5m 为分界。
  let dwellAccum = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const previous = samples[i - 1];
    const current = samples[i];
    if (previous === undefined || current === undefined) {
      continue;
    }
    const step = lightStep(previous, current);
    const dt = current.t - previous.t;
    if (step >= 1.5) {
      moves += 1;
      if (dwellAccum >= 0.6) {
        dwellSegments.push(dwellAccum);
      }
      dwellAccum = 0;
    } else {
      dwellAccum += dt;
    }
  }
  if (dwellAccum >= 0.6) {
    dwellSegments.push(dwellAccum);
  }

  const sortedDwell = dwellSegments.slice().sort((a, b) => a - b);
  const dwellP50 = percentile(sortedDwell, 0.5);
  const dwellP90 = percentile(sortedDwell, 0.9);

  const firstTime = samples[0]?.t ?? 0;
  const endedAt = samples.length > 0 ? (samples[samples.length - 1]?.t ?? 0) : 0;
  const observed = endedAt - firstTime;
  const lightMovesPerMinute = observed > 0 ? (moves * 60) / observed : 0;

  // 3) 区转化率（事件口径）。
  const convertedByZone: Record<ZoneId, number> = {
    'front-left': 0,
    'front-right': 0,
    'back-left': 0,
    'back-right': 0,
  };
  const castByZone: Record<ZoneId, number> = {
    'front-left': 0,
    'front-right': 0,
    'back-left': 0,
    'back-right': 0,
  };
  let ignitePerfect = 0;
  let igniteGood = 0;
  let igniteTotal = 0;
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (event === undefined) {
      continue;
    }
    if (event.kind === 'convert') {
      convertedByZone[event.zone] += event.amount > 0 ? event.amount : 1;
    } else if (event.kind === 'cast-out') {
      castByZone[event.zone] += event.amount > 0 ? event.amount : 1;
    } else if (event.kind === 'ignite') {
      igniteTotal += 1;
      if (event.quality === 'perfect') {
        ignitePerfect += 1;
      } else if (event.quality === 'good') {
        igniteGood += 1;
      }
    }
  }
  const zoneConversionRate: Record<ZoneId, number> = {
    'front-left': conversionRate(convertedByZone['front-left'], castByZone['front-left']),
    'front-right': conversionRate(convertedByZone['front-right'], castByZone['front-right']),
    'back-left': conversionRate(convertedByZone['back-left'], castByZone['back-left']),
    'back-right': conversionRate(convertedByZone['back-right'], castByZone['back-right']),
  };
  const igniteOnBeatRate = igniteTotal > 0 ? (ignitePerfect + igniteGood) / igniteTotal : 0;

  // 4) 驻光收益比：驻留期人气净变化/秒 ÷ 移动期人气净变化/秒。
  let dwellDelta = 0;
  let dwellSeconds = 0;
  let moveDelta = 0;
  let moveSeconds = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const previous = samples[i - 1];
    const current = samples[i];
    if (previous === undefined || current === undefined) {
      continue;
    }
    const dt = current.t - previous.t;
    const delta = current.audience - previous.audience;
    if (lightStep(previous, current) >= 1.5) {
      moveDelta += delta;
      moveSeconds += dt;
    } else {
      dwellDelta += delta;
      dwellSeconds += dt;
    }
  }
  const dwellRate = dwellSeconds > 0 ? dwellDelta / dwellSeconds : 0;
  const moveRate = moveSeconds > 0 ? moveDelta / moveSeconds : 0;
  const dwellRewardRatio = moveRate === 0 ? 0 : dwellRate / moveRate;

  return {
    seed,
    mode,
    startedAt: '',
    samples,
    firstActiveLightMoveAt,
    lightMovesPerMinute,
    dwellP50,
    dwellP90,
    zoneConversionRate,
    igniteOnBeatRate,
    dwellRewardRatio,
    endedAt,
    ending,
  };
}

/** 区转化率：转化 / (转化 + 离场)；分母为 0 时按 0 处理（不编造成功）。 */
function conversionRate(converted: number, cast: number): number {
  const total = converted + cast;
  if (total <= 0) {
    return 0;
  }
  return converted / total;
}
