/**
 * 波次调度（dev-combat）。
 *
 * 职责：把 GDD §8.1 / §9.2 的「段落生成率」翻译成每帧可消费的刷怪预算，并在
 * 光锥边缘 / 背后包抄两种位置生成噪音；同时提供本模块共用的座位几何换算。
 * 伤害、唱化、精英与 Boss 分别在 combat.ts / enemies.ts / boss.ts。
 *
 * 约束（docs/tech-spec.md §5.3、handbook §3.2）：
 * - 只消费 RunState 与 DataRegistry，不 import react/three，不触 DOM；
 * - 不调用全局随机数与系统时钟：随机性只来自入参 `Rng`（由 store 以 `fork('spawn')` 注入）；
 * - 内容与数量全部来自 DataRegistry：段落生成率 `SegmentDef.spawnRates`、同屏上限
 *   `balance.noise.cap`、生成距离 `balance.noise.spawnMin/MaxDistance`、背后概率
 *   `balance.antiCamp.behindSpawnChance`、裂缝加成 `balance.noise.crackSpawnMultiplier`；
 * - 计时累加器不写进 RunState（types 已冻结、无可放字段），按 run 键控存 WeakMap；
 *   新 RunState 自动得到新累加器，不会串局。
 * - 正式装配走 `updateWavesWithPool`：实体必须来自对象池——`entities.updateEntities` 每拍
 *   用 `pool.active` 重建 `run.noises`，不经池的实体会在下一拍被丢掉；`updateWaves` 是
 *   不带池的纯函数入口，只用于单测与 QA 构造局面。
 *
 * 生成位置口径（GDD §8.1「从光锥边缘 3–8m 处生成」）：
 * 环半径 = 当前光锥半径 + [spawnMinDistance, spawnMaxDistance]，并保证落在锥外 0.5m 以上，
 * 这样噪音永远「从你目光的边缘渗出来」——这是因果可读性的核心。
 */

import type {
  NoiseEntity,
  NoiseKind,
  Pool,
  Rng,
  RunState,
  Seconds,
  Vec2,
  ZoneId,
} from '../types/game';
import type { DataRegistry, SegmentDef } from '../types/data';
import { collectModifiers } from './progression';
import { seatAtPoint, seatPositionAt } from '../data/seats';

/** 三种常规噪音（Boss 与精英不占波次预算，见 GDD §4）。 */
export type AmbientNoiseKind = 'floor-noise' | 'scream' | 'distortion';

/** 生成放置：光锥边缘环 / 玩家背后（反驻守）。 */
export type WavePlacement = 'ring' | 'behind';

/**
 * 本帧刷怪预算（纯函数产物，可单测）。
 * 三个速率单位是「只/秒」，已含裂缝加成；`cap` 是同屏硬上限。
 */
export interface WaveBudget {
  readonly floorNoise: number;
  readonly scream: number;
  readonly distortion: number;
  readonly cap: number;
  readonly fromBehindChance: number;
}

/** 生成累加器（按 run 键控；只存计时，不存内容）。 */
interface WaveLedger {
  readonly acc: Record<AmbientNoiseKind, number>;
  behindTimer: Seconds;
  behindPending: boolean;
}

const AMBIENT_KINDS: readonly AmbientNoiseKind[] = ['floor-noise', 'scream', 'distortion'];
const TAU = Math.PI * 2;

const ledgers = new WeakMap<RunState, WaveLedger>();

/** 取（或创建）本局的生成累加器。 */
function ledgerFor(run: RunState): WaveLedger {
  const existing = ledgers.get(run);
  if (existing) return existing;
  const created: WaveLedger = {
    acc: { 'floor-noise': 0, scream: 0, distortion: 0 },
    behindTimer: 0,
    behindPending: false,
  };
  ledgers.set(run, created);
  return created;
}

/** 当前段落：优先信 store 写入的 `run.segment`，退化时按时间匹配（QA 直接构造 RunState 也能跑）。 */
export function segmentAt(run: RunState, data: DataRegistry): SegmentDef | null {
  for (const segment of data.segments) {
    if (segment.id === run.segment) return segment;
  }
  for (const segment of data.segments) {
    if (run.time >= segment.startSec && run.time < segment.endSec) return segment;
  }
  return data.segments[data.segments.length - 1] ?? null;
}

/** 人浪触发点（时刻 + 人气门槛）。 */
export interface CrowdWaveMoment {
  readonly at: Seconds;
  readonly threshold: number;
}

/**
 * 人浪触发接口：2:00 / 5:00 / 8:00 三个时刻与 90 / 280 / 460 的门槛（GDD §7.4），
 * 直接读 `balance.crowdWave`，不重复实现触发逻辑。
 *
 * 权威触发在 dev-engine 的 `crowd-wave.ts`（`updateCrowdWave`）；本表给波次预算与 QA 用：
 * 人浪 → 裂缝 +1 → 生成率每道 +15%（`computeWaveBudget` 已经消费 `run.cracks`），
 * 所以「2:00 之后怪变多」这条因果链在本模块可被单独断言。
 */
export function crowdWaveSchedule(data: DataRegistry): readonly CrowdWaveMoment[] {
  const { times, thresholds } = data.balance.crowdWave;
  const length = Math.min(times.length, thresholds.length);
  const schedule: CrowdWaveMoment[] = [];
  for (let index = 0; index < length; index += 1) {
    const at = times[index];
    const threshold = thresholds[index];
    if (at === undefined || threshold === undefined) continue;
    schedule.push({ at, threshold });
  }
  return schedule;
}

/**
 * 本帧刷怪预算（纯函数，可单测）。
 * 段落生成率 × 裂缝加成（每道裂缝 +`crackSpawnMultiplier`，GDD §8.1），上限取 `balance.noise.cap`。
 */
export function computeWaveBudget(run: RunState, data: DataRegistry): WaveBudget {
  const segment = segmentAt(run, data);
  const cracks = Math.max(0, run.cracks);
  const crackBonus = 1 + data.balance.noise.crackSpawnMultiplier * cracks;
  const rates = segment ? segment.spawnRates : null;
  return {
    floorNoise: (rates ? rates['floor-noise'] : 0) * crackBonus,
    scream: (rates ? rates.scream : 0) * crackBonus,
    distortion: (rates ? rates.distortion : 0) * crackBonus,
    cap: data.balance.noise.cap,
    fromBehindChance: data.balance.antiCamp.behindSpawnChance,
  };
}

/**
 * 消费预算并生成噪音；返回本帧生成数。**纯函数入口**：实体不进对象池，直接 push 进
 * `run.noises`，适合单测与 QA 构造局面（正式装配用 `updateWavesWithPool`）。
 *
 * - 每 20 秒掷一次「背后包抄」：命中后下一只底噪从玩家背后生成（GDD §8.2 / §11.1）；
 * - 桥段与「静默」阶段 2 的失真成对出现（GDD §8.1 / §9.2）；
 * - 同屏达到 `cap` 后停止生成并保留 1 个待生成额度（到上限不隐形、不堆叠，压力交给热度流失）。
 */
export function updateWaves(
  run: RunState,
  data: DataRegistry,
  rng: Rng,
  dt: Seconds,
): number {
  return pumpWaves(run, data, rng, dt, null);
}

/**
 * 池化入口（store 正式装配用）：与 `updateWaves` **共用同一份按 run 键控的预算累加器**，
 * 所以同一帧重复调用不会重复生成。
 *
 * 为什么必须走池：`entities.updateEntities` 每步长用 `pool.active` 重建 `run.noises`，
 * 不经池生成的实体会在下一拍被丢掉（见 `entities.ts` 头部「活跃表一致性」）。
 * 池化生成后不再 push：下一拍 `updateEntities` 会把它排进 `run.noises`。
 */
export function updateWavesWithPool(
  run: RunState,
  data: DataRegistry,
  rng: Rng,
  dt: Seconds,
  pool: Pool<NoiseEntity>,
): number {
  return pumpWaves(run, data, rng, dt, pool);
}

function pumpWaves(
  run: RunState,
  data: DataRegistry,
  rng: Rng,
  dt: Seconds,
  pool: Pool<NoiseEntity> | null,
): number {
  if (dt <= 0) return 0;
  const budget = computeWaveBudget(run, data);
  const ledger = ledgerFor(run);
  const multiplier = {
    'floor-noise': budget.floorNoise,
    scream: budget.scream,
    distortion: budget.distortion,
  };

  // 背后包抄：按固定节拍掷骰（interval 来自 balance.antiCamp）。
  const behindInterval = data.balance.antiCamp.behindSpawnInterval;
  if (behindInterval > 0) {
    ledger.behindTimer += dt;
    while (ledger.behindTimer >= behindInterval) {
      ledger.behindTimer -= behindInterval;
      if (rng.next() < budget.fromBehindChance) ledger.behindPending = true;
    }
  }

  // 失真成对：桥段与 Boss 阶段 2 各生成 2 只（GDD §8.1 / §8.3）。
  const distortionPairs = run.segment === 'bridge' || run.boss.phase === 'light';
  let active = pool
    ? Math.max(countActiveNoises(run), pool.active.length)
    : countActiveNoises(run);
  let spawned = 0;

  for (const kind of AMBIENT_KINDS) {
    ledger.acc[kind] += multiplier[kind] * dt;
    while (ledger.acc[kind] >= 1) {
      if (active >= budget.cap) {
        // 到上限：保留 1 个额度，等位置空出来立刻补上（不静默累积）。
        ledger.acc[kind] = 1;
        break;
      }
      ledger.acc[kind] -= 1;
      const placement: WavePlacement =
        kind === 'floor-noise' && ledger.behindPending ? 'behind' : 'ring';
      if (placement === 'behind') ledger.behindPending = false;
      if (spawnNoise(run, data, kind, placement, rng, pool)) {
        active += 1;
        spawned += 1;
      } else {
        // 池满或数据缺失：不再消耗本帧剩余额度，下一帧重试。
        ledger.acc[kind] = 1;
        break;
      }
      if (kind === 'distortion' && distortionPairs && active < budget.cap) {
        // 成对的第二只仍从光锥边缘来，确保「从你看的地方渗出」的因果不破。
        if (spawnNoise(run, data, kind, 'ring', rng, pool)) {
          active += 1;
          spawned += 1;
        }
      }
    }
  }
  return spawned;
}

/** 活跃噪音数（波次上限判定与 HUD 危险条共用）。 */
export function countActiveNoises(run: RunState): number {
  let count = 0;
  for (const entity of run.noises) {
    if (entity.active) count += 1;
  }
  return count;
}

/**
 * 生成一只噪音（光锥边缘或玩家背后）；返回实体，数据缺失或池满时返回 null。
 * `rng` 可为 null：精英召怪等没有 Rng 入参的路径退化到确定性中点与固定角。
 * `pool` 为 null 时直接 push 进 `run.noises`（测试路径）；否则走 `pool.acquire()`（正式路径）。
 */
export function spawnNoise(
  run: RunState,
  data: DataRegistry,
  kind: NoiseKind,
  placement: WavePlacement,
  rng: Rng | null = null,
  pool: Pool<NoiseEntity> | null = null,
): NoiseEntity | null {
  const position = placement === 'behind' ? behindPosition(run, data, rng) : ringPosition(run, data, rng);
  return spawnNoiseAt(run, data, kind, position, pool);
}

/**
 * 在指定位置生成一只噪音（精英召怪、音箱堆返听共用）；返回实体，数据缺失或池满时返回 null。
 *
 * 池化时**不 push**：`updateEntities` 下一拍会用 `pool.active` 重建 `run.noises`，
 * 提前 push 会在同一拍里被处理两次（覆盖结算会重复扣级）。
 */
export function spawnNoiseAt(
  run: RunState,
  data: DataRegistry,
  kind: NoiseKind,
  position: Vec2,
  pool: Pool<NoiseEntity> | null = null,
): NoiseEntity | null {
  const def = data.noise[kind];
  if (!def) return null;
  if (pool) {
    if (pool.active.length >= pool.capacity) return null;
    const entity = pool.acquire();
    entity.kind = kind;
    entity.active = true;
    entity.position = { x: position.x, z: position.z };
    entity.velocity = { x: 0, z: 0 };
    entity.radius = def.radius;
    entity.hp = def.maxHp;
    entity.maxHp = def.maxHp;
    entity.state = 'crawling';
    entity.targetSeat = -1;
    entity.singProgress = 0;
    entity.remaining = 0;
    return entity;
  }
  const entity: NoiseEntity = {
    id: nextNoiseId(run),
    kind,
    active: true,
    position: { x: position.x, z: position.z },
    velocity: { x: 0, z: 0 },
    radius: def.radius,
    hp: def.maxHp,
    maxHp: def.maxHp,
    state: 'crawling',
    targetSeat: -1,
    singProgress: 0,
    remaining: 0,
  };
  run.noises.push(entity);
  return entity;
}

/** 座区中心的座位世界坐标（合唱波与伤害归属用；坐标走 data 的唯一真源）。 */
export function zoneCenterOf(data: DataRegistry, zone: ZoneId): Vec2 {
  const def = data.zones.find((item) => item.id === zone);
  if (!def) {
    const fallback = seatPositionAt(data.seats, 0, 0);
    return { x: fallback.x, z: fallback.z };
  }
  const row = (def.rowRange[0] + def.rowRange[1]) / 2;
  const col = (def.colRange[0] + def.colRange[1]) / 2;
  const center = seatPositionAt(data.seats, row, col);
  return { x: center.x, z: center.z };
}

/**
 * 世界坐标 → 座区（不在观众席网格内返回 null）。
 * 只做「伤害归属」，座位索引的权威判定仍由 light/audience 持有。
 */
export function zoneAtPoint(data: DataRegistry, point: Vec2): ZoneId | null {
  const seat = seatAtPoint(data.seats, point);
  if (seat === null) return null;
  for (const zone of data.zones) {
    const inRow = seat.row >= zone.rowRange[0] && seat.row <= zone.rowRange[1];
    const inCol = seat.col >= zone.colRange[0] && seat.col <= zone.colRange[1];
    if (inRow && inCol) return zone.id;
  }
  return null;
}

/**
 * 舞台前沿中心（含「舞台在 0 排之前一个座位距」的几何假设）。
 * types 未定义舞台几何，失真「到舞台」与返听音箱堆位置都由座位网格推导；
 * x 取首末座的中点（镜像后为 0），换尺寸时逻辑不需要改常量。
 */
export function stageAnchorOf(data: DataRegistry): Vec2 {
  const cols = Math.max(1, data.seats.cols);
  const first = seatPositionAt(data.seats, 0, 0);
  const last = seatPositionAt(data.seats, 0, cols - 1);
  return {
    x: (first.x + last.x) / 2,
    z: first.z - data.seats.spacing.z,
  };
}

/** 左右两个音箱堆坐标（返听生成点，GDD §9.1）；顺序固定为 [左, 右]（屏幕左 = +x）。 */
export function speakerStacksOf(data: DataRegistry): readonly [Vec2, Vec2] {
  const cols = Math.max(1, data.seats.cols);
  const z = seatPositionAt(data.seats, 0, 0).z - data.seats.spacing.z;
  return [
    { x: seatPositionAt(data.seats, 0, 0).x, z },
    { x: seatPositionAt(data.seats, 0, cols - 1).x, z },
  ];
}

/** 距离最近的音箱堆（返听从「最近的音箱堆」出现，GDD §8.2）。 */
export function nearestSpeakerStack(data: DataRegistry, point: Vec2): Vec2 {
  const stacks = speakerStacksOf(data);
  const dx0 = stacks[0].x - point.x;
  const dx1 = stacks[1].x - point.x;
  return Math.abs(dx0) <= Math.abs(dx1) ? stacks[0] : stacks[1];
}

/** 光锥外环位置：锥半径 + [3, 8]m，且至少离开锥 0.5m。 */
function ringPosition(run: RunState, data: DataRegistry, rng: Rng | null): Vec2 {
  // 引线：诱饵区更容易被招灾（bait-zone-multiplier 的消费点）。
  const bait =
    run.build?.coreCard === 'bait-line'
      ? 1 + Math.max(0, collectModifiers(run.build, data).get('bait-zone-multiplier') ?? 0)
      : 1;
  if (bait > 1 && run.light.lightingZone !== null && rng !== null && rng.next() < 0.3 * bait) {
    const center = zoneCenterOf(data, run.light.lightingZone);
    return { x: center.x + rng.range(-1, 1), z: center.z + rng.range(-1, 1) };
  }
  const min = data.balance.noise.spawnMinDistance;
  const max = data.balance.noise.spawnMaxDistance;
  const picked = rng ? rng.range(min, max) : (min + max) / 2;
  const radius = Math.max(run.light.radius + 0.5, picked);
  const angle = rng ? rng.next() * TAU : TAU * 0.25;
  return {
    x: run.light.position.x + Math.cos(angle) * radius,
    z: run.light.position.z + Math.sin(angle) * radius,
  };
}

/** 玩家背后位置：沿朝向反方向 [3, 8]m（反驻守，GDD §11.1「背后包抄」）。 */
function behindPosition(run: RunState, data: DataRegistry, rng: Rng | null): Vec2 {
  const min = data.balance.noise.spawnMinDistance;
  const max = data.balance.noise.spawnMaxDistance;
  const distance = rng ? rng.range(min, max) : (min + max) / 2;
  const facing = run.player.facing;
  return {
    x: run.player.position.x - Math.cos(facing) * distance,
    z: run.player.position.z - Math.sin(facing) * distance,
  };
}

/** 单调 id：活跃实体最大 id + 1（回收后不复用旧 id，重放与断言稳定）。 */
function nextNoiseId(run: RunState): number {
  let max = -1;
  for (const entity of run.noises) {
    if (entity.id > max) max = entity.id;
  }
  return max + 1;
}

/** t139 测试/接线：引线诱饵区的招灾权重（1 = 无卡；2 = 核心卡 +100%）。 */
export function baitZoneWeight(run: RunState, data: DataRegistry): number {
  return run.build?.coreCard === 'bait-line'
    ? 1 + Math.max(0, collectModifiers(run.build, data).get('bait-zone-multiplier') ?? 0)
    : 1;
}
