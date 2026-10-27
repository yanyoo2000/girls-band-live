/**
 * 人浪：2:00 / 5:00 / 8:00 三次，阈值不足退化为单区小浪。
 *
 * 用途：人浪不是技能，而是奖励——玩家只负责养人，浪自己发生；它把“养人”与
 * “招灾”连成一条可见的因果（浪过之处噪音变人、热度 +1、天花板裂缝 +1）。
 *
 * 依赖：`../types/game`（RunState / Seconds / ZoneId / HeatLevel）、
 * `../types/data`（DataRegistry 的 balance.crowdWave）、`./audience`（applyCrowdWave /
 * countPresent / zoneIndexOf）。
 * 分配策略：返回对象与扫描状态都复用（`CrowdWaveUpdate` 为模块级单例，
 * 每 tick 覆盖字段；`run.crowdWave` 只在状态变化时重建）。
 * 清理策略：运行时状态放 `WeakMap<RunState>`，一局结束自动回收。
 *
 * 导出：`CrowdWaveUpdate` 类型与 `updateCrowdWave(run, data, dt)`。
 */
import type { RunState, Seconds, ZoneId } from '../types/game';
import type { DataRegistry } from '../types/data';
import { applyCrowdWave, countPresent, zoneIndexOf } from './audience';

/** 一次人浪推进的结果（模块级复用对象，禁止跨帧持有）。 */
export interface CrowdWaveUpdate {
  readonly triggered: 0 | 1 | 2 | 3;
  readonly origin: ZoneId | null;
  readonly converted: number;
  readonly heatGain: 1;
  readonly cracked: boolean;
}

/** 座区固定顺序（与 `ZoneId` 联合类型一致）。 */
const ZONE_ORDER: readonly ZoneId[] = ['front-left', 'front-right', 'back-left', 'back-right'];

/** 人浪扫描的运行时状态。 */
interface CrowdWaveRuntime {
  /** 正在扫描：已用秒数；null 表示不在扫描中。 */
  sweeping: Seconds | null;
  /** 本次扫描已扫过的区（位掩码）。 */
  sweptMask: number;
  /** 下一次计划触发时间（秒）；null 表示三次已用完。 */
  nextAt: Seconds | null;
  /** 已触发次数（0..3）。 */
  index: 0 | 1 | 2 | 3;
  /** 本次扫描是否为真浪（达标）还是单区小浪。 */
  full: boolean;
  origin: ZoneId | null;
}

const RUNTIMES = new WeakMap<RunState, CrowdWaveRuntime>();

function runtimeOf(run: RunState, data: DataRegistry): CrowdWaveRuntime {
  const existing = RUNTIMES.get(run);
  if (existing !== undefined) {
    return existing;
  }
  const first = data.balance.crowdWave.times[0];
  const runtime: CrowdWaveRuntime = {
    sweeping: null,
    sweptMask: 0,
    nextAt: first === undefined ? null : first,
    index: 0,
    full: false,
    origin: null,
  };
  RUNTIMES.set(run, runtime);
  return runtime;
}

/** 出席最多的区（人浪起点）。 */
function largestZone(run: RunState): ZoneId {
  let bestZone: ZoneId = 'front-left';
  let bestCount = -1;
  for (let i = 0; i < ZONE_ORDER.length; i += 1) {
    const zone = ZONE_ORDER[i];
    if (zone === undefined) {
      continue;
    }
    const count = countPresent(run.audience, zone);
    if (count > bestCount) {
      bestCount = count;
      bestZone = zone;
    }
  }
  return bestZone;
}

/** 复用返回对象（每 tick 覆写；调用方只能在当 tick 内使用）。 */
const UPDATE: {
  triggered: 0 | 1 | 2 | 3;
  origin: ZoneId | null;
  converted: number;
  heatGain: 1;
  cracked: boolean;
} = { triggered: 0, origin: null, converted: 0, heatGain: 1, cracked: false };

/**
 * 人浪：2:00/5:00/8:00 三次，阈值不足退化为单区小浪。
 *
 * - 达标：人气 ≥ 90 / 280 / 460，浪从最大区开始，3s 内扫过四区；
 * - 不足：只扫起点区（小浪），不阻止下一次；
 * - 每次触发：裂缝 +1（上限 3），四区热度 +1（在 `applyCrowdWave` 内）。
 */
export function updateCrowdWave(run: RunState, data: DataRegistry, dt: Seconds): CrowdWaveUpdate {
  UPDATE.triggered = 0;
  UPDATE.origin = null;
  UPDATE.converted = 0;
  UPDATE.cracked = false;

  const runtime = runtimeOf(run, data);
  const config = data.balance.crowdWave;
  const index = runtime.index;

  // 1) 触发判定（只在下一次计划时刻之后）。
  if (runtime.sweeping === null && runtime.nextAt !== null && run.time >= runtime.nextAt) {
    const threshold = config.thresholds[index] ?? Number.POSITIVE_INFINITY;
    const attendees = countPresent(run.audience, null);
    runtime.full = attendees >= threshold;
    runtime.origin = largestZone(run);
    runtime.sweeping = 0;
    runtime.sweptMask = 0;
    UPDATE.triggered = (index + 1) as 1 | 2 | 3;
    UPDATE.origin = runtime.origin;
    if (run.cracks < 3) {
      run.cracks += 1;
      UPDATE.cracked = true;
    }
  }

  // 2) 扫描推进：按 3s 均分四区（小浪只扫起点区）。
  if (runtime.sweeping !== null) {
    runtime.sweeping += dt;
    const progress = config.sweepSec > 0 ? runtime.sweeping / config.sweepSec : 1;
    const clamped = progress > 1 ? 1 : progress;
    const zonesToSweep = runtime.full ? ZONE_ORDER : runtime.origin === null ? [] : [runtime.origin];
    const perZone = zonesToSweep.length > 0 ? 1 / zonesToSweep.length : 1;
    for (let i = 0; i < zonesToSweep.length; i += 1) {
      const zone = zonesToSweep[i];
      if (zone === undefined) {
        continue;
      }
      const bit = 1 << zoneIndexOf(zone);
      if ((runtime.sweptMask & bit) !== 0) {
        continue;
      }
      // 浪头到达该区的时刻：起点区立即，其后依次 +1/4。
      const arrival = i * perZone;
      if (clamped + 1e-9 >= arrival) {
        const delta = applyCrowdWave(run, zone, data);
        UPDATE.converted += delta.converted;
        runtime.sweptMask |= bit;
      }
    }

    if (clamped >= 1) {
      runtime.sweeping = null;
      runtime.sweptMask = 0;
      // 三次之后不再排下一浪（index 表示“已触发次数”，用完即 3 且 nextAt=null）。
      if (runtime.index === 0) {
        runtime.index = 1;
        runtime.nextAt = config.times[1] ?? null;
      } else if (runtime.index === 1) {
        runtime.index = 2;
        runtime.nextAt = config.times[2] ?? null;
      } else if (runtime.index === 2) {
        runtime.index = 3;
        runtime.nextAt = null;
      } else {
        runtime.nextAt = null;
      }
      runtime.full = false;
      runtime.origin = null;
    }
  }

  // 3) 写回快照（进度每 tick 变化；其余字段只在状态改变时被替换）。
  //    `origin` 在整个扫描期都有效（触发 tick 之后也保留），供渲染层画浪头方向。
  UPDATE.origin = runtime.origin;
  const sweepingProgress =
    runtime.sweeping === null || config.sweepSec <= 0
      ? null
      : Math.min(1, runtime.sweeping / config.sweepSec);
  run.crowdWave = {
    index: runtime.index,
    nextAt: runtime.nextAt,
    progress: sweepingProgress,
    origin: runtime.origin,
  };

  return UPDATE;
}
