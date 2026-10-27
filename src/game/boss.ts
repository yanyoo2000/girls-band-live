/**
 * Boss「静默」（dev-combat）：6:30–7:40 的三阶段、盲奏静默段与退场带走区。
 *
 * Boss 不被打死，也没有血条——它的「进度」是时间与段落（GDD §8.3）。三阶段分别拿走
 * 声音 / 视野 / 人，正好对应光的三种资源：
 * | 阶段 | 时间 | 拿走 | 逻辑落点 |
 * | --- | --- | --- | --- |
 * | bus | 6:30–6:45 | 声音 | 本文件写 `run.silenceRemaining`（audio 读同一字段） |
 * | light | 6:45–7:15 | 视野 | `bossLightVisibilityScale()` 供 light.ts 缩放锥长 |
 * | people | 7:15–7:40 | 人 | `bossHeatDecayMultiplier()` 供 audience.ts 加速褪色；返听强制出现 |
 * | retired | 7:40+ | — | 人气 <150 时永久带走一个区（写入 `BossState.strippedZone`） |
 *
 * 相位切换的 `changed` 约定（store 据此发 `BossEvent`，避免新增字段）：
 * - `changed && phase === 'bus'` → `action: 'enter'`（6:30 首次进入）；
 * - `changed && phase === 'light' | 'people'` → `action: 'advance'`；
 * - `changed && phase === 'retired'` → `action: 'retire'`（`strippedZone !== null` 时再补一条 `strip-zone`）。
 * 依据是类型里没有 `idle` 相位：6:30 之前 `phase` 已经是 `'bus'`，所以「进入」只能靠 `changed`
 * 与 `phaseStartedAt` 的哨兵值 0 区分。
 *
 * 纯逻辑：不 import react/three，不触 DOM，不读时钟（只用 `run.time` 与 `dt`）。
 */

import type { BossState, Ratio, RunState, Seconds, ZoneId } from '../types/game';
import type { DataRegistry } from '../types/data';

/** 阶段表的最小形状（`BalanceConfig.boss.phases` 只有这三个字段；名称/规则在 `BossDef` 里）。 */
type BossPhaseWindow = {
  readonly phase: 'bus' | 'light' | 'people';
  readonly startSec: Seconds;
  readonly endSec: Seconds;
};

/** Boss 的一次更新结果（tech-spec §5.3）。 */
export interface BossUpdate {
  readonly phase: BossState['phase'];
  readonly changed: boolean;
  readonly strippedZone: ZoneId | null;
  readonly returnedAudience: number;
}

/** Boss 计时旁路（RunState 无相关字段；按 run 键控，换局自动重置）。 */
interface BossLedger {
  /** 静默段结束时刻（bus 阶段写入）。 */
  silenceUntil: Seconds;
  /** 是否已经清过一次静默（避免每帧覆写 store 为「独奏会 6s 静默」写的值）。 */
  silenceCleared: boolean;
}

const ledgers = new WeakMap<RunState, BossLedger>();

function ledgerFor(run: RunState): BossLedger {
  const existing = ledgers.get(run);
  if (existing) return existing;
  const created: BossLedger = { silenceUntil: 0, silenceCleared: true };
  ledgers.set(run, created);
  return created;
}

/**
 * 6:30/6:45/7:15/7:40 四节点推进；静默段由 audio 与 store 共享 `run.silenceRemaining`。
 *
 * 阶段完成（6:45 / 7:15 / 7:40）各「返场」+`returnedAudiencePerPhase` 名观众（GDD §8.3），
 * 通过 `returnedAudience` 返回，由 store 落到观众数据（本文件不写观众）。
 */
export function updateBoss(run: RunState, data: DataRegistry, dt: Seconds): BossUpdate {
  const state = run.boss;
  const def = data.boss;
  const ledger = ledgerFor(run);
  const phases: readonly BossPhaseWindow[] = def.phases;

  if (dt <= 0 || phases.length === 0) {
    return { phase: state.phase, changed: false, strippedZone: null, returnedAudience: 0 };
  }

  const first = phases[0];
  if (!first) {
    return { phase: state.phase, changed: false, strippedZone: null, returnedAudience: 0 };
  }

  // 6:30 之前：Boss 尚未上台；清掉可能残留的静默（只清一次，避免覆盖他人写入）。
  if (run.time < first.startSec) {
    clearSilenceOnce(run, ledger);
    return { phase: state.phase, changed: false, strippedZone: null, returnedAudience: 0 };
  }

  // 7:40 退场：一次性判定，之后只回报结果。
  if (run.time >= def.retireSec) {
    if (state.retired) {
      clearSilenceOnce(run, ledger);
      return { phase: 'retired', changed: false, strippedZone: state.strippedZone, returnedAudience: 0 };
    }
    state.retired = true;
    state.phase = 'retired';
    state.phaseStartedAt = def.retireSec;
    state.strippedZone =
      countPresent(run) < def.stripZoneThreshold ? weakestPopulatedZone(run) : null;
    ledger.silenceUntil = 0;
    ledger.silenceCleared = true;
    run.silenceRemaining = 0;
    return {
      phase: 'retired',
      changed: true,
      strippedZone: state.strippedZone,
      returnedAudience: def.returnedAudiencePerPhase,
    };
  }

  const index = phaseIndexAt(phases, run.time);
  const current = phases[index];
  if (!current) {
    return { phase: state.phase, changed: false, strippedZone: null, returnedAudience: 0 };
  }

  // 哨兵：phaseStartedAt === 0 表示「还没进过任何阶段」（types 无 idle 相位）。
  const entering = state.phaseStartedAt <= 0;
  const changed = entering || state.phase !== current.phase;
  if (changed) {
    state.phase = current.phase;
    state.phaseStartedAt = current.startSec;
  }

  // 盲奏：阶段 1 内 `silenceRemaining` = min(阶段剩余, 8 小节时长)；其余阶段只清一次。
  if (current.phase === 'bus') {
    const barsSeconds = silenceSeconds(data);
    const phaseEnd = Math.min(current.endSec, current.startSec + barsSeconds);
    ledger.silenceUntil = phaseEnd;
    ledger.silenceCleared = false;
    run.silenceRemaining = Math.max(0, phaseEnd - run.time);
  } else {
    clearSilenceOnce(run, ledger);
  }

  return {
    phase: current.phase,
    changed,
    strippedZone: null,
    returnedAudience: changed && !entering ? def.returnedAudiencePerPhase : 0,
  };
}

/**
 * 阶段 2「吞光」：光锥可见度倍率（light.ts 读它把锥长 −50%，GDD §8.3）。
 * 非阶段 2 恒为 1。
 */
export function bossLightVisibilityScale(run: RunState, data: DataRegistry): Ratio {
  return run.boss.phase === 'light' ? data.balance.boss.phase2LightScale : 1;
}

/**
 * 阶段 3「冷却」：四区热度衰减倍率（audience.ts 读它把褪色 ×3，GDD §8.3）。
 * 非阶段 3 恒为 1。
 */
export function bossHeatDecayMultiplier(run: RunState, data: DataRegistry): number {
  return run.boss.phase === 'people' ? data.balance.boss.phase3DecayMultiplier : 1;
}

/** 静默时长：`silenceBars` 小节 × 每小节拍数 × 每拍秒数（8 小节 @128BPM = 15s）。 */
function silenceSeconds(data: DataRegistry): Seconds {
  const grid = data.beatGrid;
  const beatsPerBar = grid.beatsPerBar;
  const bpm = grid.bpm > 0 ? grid.bpm : 120;
  return data.balance.boss.silenceBars * beatsPerBar * (60 / bpm);
}

/** 当前时间落在第几个阶段（取 startSec ≤ time 的最后一个）。 */
function phaseIndexAt(phases: readonly BossPhaseWindow[], time: Seconds): number {
  let index = 0;
  for (let i = 0; i < phases.length; i += 1) {
    const phase = phases[i];
    if (phase && time >= phase.startSec) index = i;
  }
  return index;
}

/** 静默只清一次：清完就置位，把后续帧的写入权让给别的系统（如独奏会 6s 静默）。 */
function clearSilenceOnce(run: RunState, ledger: BossLedger): void {
  if (ledger.silenceCleared) return;
  ledger.silenceCleared = true;
  ledger.silenceUntil = 0;
  run.silenceRemaining = 0;
}

/**
 * 带走哪个区：在场人数最少的**有人区**（空区带走没有代价，等于无惩罚）；
 * 全场空场时返回 null（GDD §13.2 空场是完成，不是失败，不该再夺走什么）。
 * 同数取 ZoneId 顺序靠前者，保证确定性。
 */
function weakestPopulatedZone(run: RunState): ZoneId | null {
  const state = run.audience.state;
  const zoneOfSeat = run.audience.zone;
  const counts = [0, 0, 0, 0];
  for (let seat = 0; seat < state.length; seat += 1) {
    const code = state[seat] ?? 0;
    if (code !== 1 && code !== 2 && code !== 3) continue;
    const zone = zoneOfSeat[seat] ?? 0;
    if (zone < counts.length) counts[zone] = (counts[zone] ?? 0) + 1;
  }
  // ZoneId 顺序固定为 types 中的联合顺序（front-left, front-right, back-left, back-right）。
  const order: readonly ZoneId[] = ['front-left', 'front-right', 'back-left', 'back-right'];
  let weakest: ZoneId | null = null;
  let weakestCount = Number.POSITIVE_INFINITY;
  for (let index = 0; index < order.length; index += 1) {
    const zone = order[index];
    const count = counts[index] ?? 0;
    if (!zone || count === 0) continue;
    if (count < weakestCount) {
      weakest = zone;
      weakestCount = count;
    }
  }
  return weakest;
}

/** 出席人数（不影响 Boss 相位，只用于退场判定）。 */
function countPresent(run: RunState): number {
  let count = 0;
  const state = run.audience.state;
  for (let seat = 0; seat < state.length; seat += 1) {
    const code = state[seat] ?? 0;
    if (code === 1 || code === 2 || code === 3) count += 1;
  }
  return count;
}
