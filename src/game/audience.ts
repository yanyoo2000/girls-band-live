/**
 * 观众系统：768 席的三态（灰 / 彩 / 黑）、两段转化、热度升降、覆盖与离场。
 *
 * 用途：本作唯一的“血条”（人气 = 出席人数）与唯一的资源（热度 = 输出）；
 * 光走到哪、噪音覆盖到哪，都只改这一个 768 长的实例数据。
 *
 * 依赖：`../types/game`（AudienceFrame / ConvertDelta / DirtyRange / HeatLevel /
 * Ratio / Rng / RunState / Seconds / Vec2 / ZoneId）、`../types/data`（DataRegistry 的
 * seats / zones / balance / noise）。
 * 分配策略：逐席数据是一次性分配的 TypedArray（768 长），tick 内零对象分配；
 * `dirty` 使用固定的 8 个槽位对象（未用槽 `count === 0`，渲染层跳过）。
 * 清理策略：无全局单例，一局一份 frame + WeakMap 绑定运行时；`disposeAudience`
 * 在重开时解除绑定，避免旧局数据滞留。
 *
 * 导出（§5.2 的 4 个 + 座位/血条辅助）：
 * - `createAudience(data, rng)` / `updateAudience(run, data, dt)`；
 * - `applyCrowdWave(run, zone, data)` / `countPresent(frame, zone)`；
 * - `computeWhiteout(audience, capacity)`（tech-spec §14.3）；
 * - `zoneAtPoint(point, data)` / `zoneIndexOf(zone)`（座位坐标统一走 `src/data/seats.ts`）；
 * - `disposeAudience(frame)`（重开一局时解除运行时绑定）。
 */
import type {
  AudienceFrame,
  HeatLevel,
  Ratio,
  Rng,
  RunState,
  Seconds,
  Vec2,
  ZoneId,
} from '../types/game';
import type { DataRegistry, ZoneDef } from '../types/data';
import { nearestSeatColumn, nearestSeatRow, seatAtPoint, seatPositionOf } from '../data/seats';

/** 座区固定顺序（与 `ZoneId` 联合类型、§7.4 的渲染实例顺序一致）。 */
const ZONE_ORDER: readonly ZoneId[] = ['front-left', 'front-right', 'back-left', 'back-right'];

/** 一次更新触发的转化/离场汇总（tech-spec §5.2 定义在 audience.ts 内）。 */
export interface ConvertDelta {
  readonly converted: number;
  readonly colored: number;
  readonly black: number;
  readonly casts: readonly {
    readonly seat: number;
    readonly zone: ZoneId;
    readonly cause: 'covered' | 'cooled' | 'overheat';
  }[];
}

/** 同一座位两次“被覆盖”之间的最短间隔（秒）：噪音路过一次只结算一次。 */
const COVER_COOLDOWN: Seconds = 1.5;

/**
 * F3 反驻守规则（GDD §11.1；对 GDD §7.3「若已 0 级，−6 人离场」的收口）。
 *
 * 判定「停住」有两个信号，任一成立即进入**压力状态**：
 * - `run.returnListener.locked`：返听的锁定（光被咬住）；
 * - `zone.overheat`：光心在同一区连续 ≥ `balance.heat.overheatSeconds`（8s）→ 过热点。
 *
 * 压力状态下的效果（其余情况覆盖只打热度、不带走人）：
 * - 每次覆盖带走 `LOCKED_COVER_EVICTS` 人（热区也不能靠热度免疫）；
 * - 锁定：每 `PRESSURE_DRAIN_SEC` 秒从锁定区带走 1 人；
 * - 过热：每 `OVERHEAT_DRAIN_SEC` 秒从光心区带走 1 人，且该区热度读数 −1（掉输出）。
 *
 * 为什么「未停住时不带走人」：四区轮转的扫场 bot 若每次覆盖都触发离场，45 秒内会团灭
 * （F3 实测 30→0），而驻守区因热度高反而不掉人——与「驻守应受罚」完全相反。
 * 热度必须是护盾：只要玩家在动、在换区，零散覆盖只让座位变黑；停住才会持续失血。
 *
 * 实测（tests/f3-bot.test.ts，4 个种子）：驻守 45s 30→6~10，扫场 45s 30→40~41。
 * GDD 文字建议见 docs/reports/f3-anticamp.md §5。
 */
const LOCKED_COVER_EVICTS = 1;
/** 锁定期间的人气流失间隔（秒/人）。 */
const PRESSURE_DRAIN_SEC: Seconds = 2;
/** 过热点的人气流失间隔（秒/人）：比锁定更快，且光不离开就一直持续。 */
const OVERHEAT_DRAIN_SEC: Seconds = 1.4;

/** 每 tick 最多上报的脏区段数（tech-spec §9.2）。 */
const MAX_DIRTY_RANGES = 8;

/** 脏区槽位（可变视图；以只读 `DirtyRange` 暴露给渲染层）。 */
interface MutableDirtyRange {
  start: number;
  count: number;
}

/** 观众座位的运行时数据（不进 `AudienceFrame`，因为它是渲染契约而非玩法数据）。 */
interface AudienceRuntime {
  readonly progress: Float32Array;
  readonly litSeconds: Float32Array;
  readonly darkSeconds: Float32Array;
  readonly heatClock: Float32Array;
  readonly decayClock: Float32Array;
  readonly litLastTick: Uint8Array;
  readonly coveredTick: Float32Array;
  /** 下一次可被覆盖的局内时刻（秒）；防止同一噪音持续压座时每秒扣 6 人。 */
  readonly coverReadyAt: Float32Array;
  /** 锁定期间人气持续流失的累计秒数。 */
  lockedDrainClock: Seconds;
  /** 过热点人气持续流失的累计秒数。 */
  overheatDrainClock: Seconds;
  readonly changed: Uint8Array;
  tick: number;
}

const RUNTIMES = new WeakMap<AudienceFrame, AudienceRuntime>();
const DIRTY_BUFFERS = new WeakMap<AudienceFrame, MutableDirtyRange[]>();

/** 出席判定：灰 / 彩 / 黑都算出席（离场与空座不算）。 */
function isPresent(state: number): boolean {
  return state === 1 || state === 2 || state === 3;
}

/** 座区定义索引（ZoneId → 0..3，固定顺序）。 */
export function zoneIndexOf(zone: ZoneId): number {
  const index = ZONE_ORDER.indexOf(zone);
  return index < 0 ? 0 : index;
}

/** 座位索引 → 所属座区（§7.4：前左 / 前右 / 后左 / 后右）。 */
export function zoneOfSeat(seat: number, data: DataRegistry): ZoneId {
  const cols = data.seats.cols;
  const row = Math.floor(seat / cols);
  const col = seat - row * cols;
  const back = row >= data.seats.rows / 2;
  const right = col >= cols / 2;
  if (back) {
    return right ? 'back-right' : 'back-left';
  }
  return right ? 'front-right' : 'front-left';
}

/** 世界坐标 → 座区（不在观众席范围内返回 null）。坐标换算走 data 的唯一真源。 */
export function zoneAtPoint(point: Vec2, data: DataRegistry): ZoneId | null {
  const seat = seatAtPoint(data.seats, point);
  if (seat === null) {
    return null;
  }
  return zoneOfSeat(seat.row * data.seats.cols + seat.col, data);
}

/** 区定义（缺失时返回覆盖全场的防御性定义）。 */
function zoneDef(zone: ZoneId, data: DataRegistry): ZoneDef {
  for (let i = 0; i < data.zones.length; i += 1) {
    const def = data.zones[i];
    if (def !== undefined && def.id === zone) {
      return def;
    }
  }
  return {
    id: zone,
    voice: 'root',
    rowRange: [0, data.seats.rows - 1],
    colRange: [0, data.seats.cols - 1],
    colorToken: 'zone-root',
    corner: 'top-left',
  };
}

/** 遍历某区的座位（闭区间）。 */
function forEachZoneSeat(zone: ZoneId, data: DataRegistry, visit: (seat: number) => void): void {
  const def = zoneDef(zone, data);
  const cols = data.seats.cols;
  const rowStart = Math.max(0, Math.min(data.seats.rows - 1, def.rowRange[0]));
  const rowEnd = Math.max(0, Math.min(data.seats.rows - 1, def.rowRange[1]));
  const colStart = Math.max(0, Math.min(cols - 1, def.colRange[0]));
  const colEnd = Math.max(0, Math.min(cols - 1, def.colRange[1]));
  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let col = colStart; col <= colEnd; col += 1) {
      visit(row * cols + col);
    }
  }
}

function createRuntime(size: number): AudienceRuntime {
  return {
    progress: new Float32Array(size),
    litSeconds: new Float32Array(size),
    darkSeconds: new Float32Array(size),
    heatClock: new Float32Array(size),
    decayClock: new Float32Array(size),
    litLastTick: new Uint8Array(size),
    coveredTick: new Float32Array(size).fill(-1),
    coverReadyAt: new Float32Array(size),
    lockedDrainClock: 0,
    overheatDrainClock: 0,
    changed: new Uint8Array(size),
    tick: 0,
  };
}

/**
 * 创建 768 席初始数据（30 人出席，前两排，均匀分四区）。
 *
 * 座位选择走注入的 `rng`（同一 seed 完全复现）；四区配额按
 * `floor(30/4)=7` 分配，余 2 人给前两区（8/8/7/7）。
 */
export function createAudience(data: DataRegistry, rng: Rng): AudienceFrame {
  const size = data.seats.capacity;
  const state = new Uint8Array(size);
  const heat = new Uint8Array(size);
  const phone = new Uint8Array(size);
  const zone = new Uint8Array(size);
  const tint = new Float32Array(size);

  for (let z = 0; z < ZONE_ORDER.length; z += 1) {
    const zoneId = ZONE_ORDER[z];
    if (zoneId === undefined) {
      continue;
    }
    const def = zoneDef(zoneId, data);
    const quota = z < 2 ? 8 : 7;
    // 前两排（row 0/1）中属于该区的候选座位。
    const candidates: number[] = [];
    const cols = data.seats.cols;
    // 前两排 = 该区自己的前两排（后区从第 12 排开始，不能写死 0/1）。
    const rowStart = def.rowRange[0];
    const rowEnd = Math.min(def.rowRange[0] + 1, def.rowRange[1]);
    const colStart = def.colRange[0];
    const colEnd = def.colRange[1];
    for (let row = rowStart; row <= rowEnd; row += 1) {
      for (let col = colStart; col <= colEnd; col += 1) {
        candidates.push(row * cols + col);
      }
    }
    const picked = rng.shuffle(candidates);
    for (let i = 0; i < quota && i < picked.length; i += 1) {
      const seat = picked[i];
      if (seat === undefined) {
        continue;
      }
      state[seat] = 1;
      heat[seat] = 0;
      phone[seat] = 0;
      zone[seat] = z;
    }
  }

  const dirtyRanges: MutableDirtyRange[] = [];
  for (let i = 0; i < MAX_DIRTY_RANGES; i += 1) {
    dirtyRanges.push({ start: 0, count: 0 });
  }

  const frame: AudienceFrame = {
    revision: 1,
    size,
    state,
    heat,
    phone,
    zone,
    tint,
    dirty: dirtyRanges,
  };

  RUNTIMES.set(frame, createRuntime(size));
  DIRTY_BUFFERS.set(frame, dirtyRanges);
  return frame;
}

/** 重开一局时解除运行时绑定（旧 frame 可被 GC）。 */
export function disposeAudience(frame: AudienceFrame): void {
  RUNTIMES.delete(frame);
  DIRTY_BUFFERS.delete(frame);
}

/** 读取运行时；缺失说明 frame 不是本模块创建的（单测构造），按空运行时处理。 */
function runtimeOf(frame: AudienceFrame): AudienceRuntime {
  const existing = RUNTIMES.get(frame);
  if (existing !== undefined) {
    return existing;
  }
  const runtime = createRuntime(frame.size);
  RUNTIMES.set(frame, runtime);
  return runtime;
}

/** 单 tick 的空结果（避免每帧分配；只读）。 */
const EMPTY_DELTA: ConvertDelta = { converted: 0, colored: 0, black: 0, casts: [] };

/** 热度值加上限（返回 number，写入 Uint8Array；不引入 `as`）。 */
function nextHeat(current: number, cap: number): number {
  const raised = current + 1;
  if (raised > cap) {
    return cap;
  }
  return raised < 0 ? 0 : raised;
}

/** number → `HeatLevel`（0..4 的闭区间收敛，避免在赋值处写 `as`）。 */
function toHeatLevel(value: number): HeatLevel {
  if (value <= 0) {
    return 0;
  }
  if (value === 1) {
    return 1;
  }
  if (value === 2) {
    return 2;
  }
  if (value === 3) {
    return 3;
  }
  return 4;
}

/** 从某区带走 `count` 人（优先移除热度为 0 的观众，避免误伤“正在被照亮的人”）。 */
function evictFromZone(
  frame: AudienceFrame,
  runtime: AudienceRuntime,
  zone: ZoneId,
  data: DataRegistry,
  count: number,
  casts: { seat: number; zone: ZoneId; cause: 'covered' | 'cooled' | 'overheat' }[],
  cause: 'covered' | 'cooled' | 'overheat' = 'covered',
): number {
  if (count <= 0) {
    return 0;
  }
  let removed = 0;
  // 第一遍：热度为 0 的出席者（最容易被带走）。
  forEachZoneSeat(zone, data, (seat) => {
    if (removed >= count) {
      return;
    }
    if ((frame.heat[seat] ?? 0) === 0 && evictIfPresent(frame, runtime, seat, zone, casts, cause)) {
      removed += 1;
    }
  });
  // 第二遍：仍有缺口时，从该区任意出席者里带走。
  if (removed < count) {
    forEachZoneSeat(zone, data, (seat) => {
      if (removed >= count) {
        return;
      }
      if (evictIfPresent(frame, runtime, seat, zone, casts, cause)) {
        removed += 1;
      }
    });
  }
  return removed;
}

/**
 * 从某区带走 `count` 人；该区已空时退化到其余三区（人气是全场资源，不是单区资源）。
 *
 * 没有这个回退，驻守 bot 会先把光所在区清空，随后 `litSeats === 0` 让过热点消失、
 * 压力归零，人气卡在 24 不再下降（F3 调试实证）。
 */
function evictFromAnywhere(
  frame: AudienceFrame,
  runtime: AudienceRuntime,
  data: DataRegistry,
  preferZone: ZoneId,
  count: number,
  casts: { seat: number; zone: ZoneId; cause: 'covered' | 'cooled' | 'overheat' }[],
  cause: 'covered' | 'cooled' | 'overheat',
): number {
  let removed = evictFromZone(frame, runtime, preferZone, data, count, casts, cause);
  if (removed >= count) {
    return removed;
  }
  for (let i = 0; i < ZONE_ORDER.length; i += 1) {
    const zone = ZONE_ORDER[i];
    if (zone === undefined || zone === preferZone) {
      continue;
    }
    removed += evictFromZone(frame, runtime, zone, data, count - removed, casts, cause);
    if (removed >= count) {
      break;
    }
  }
  return removed;
}

/** 出席者离场（返回是否真的移除了出席者）。 */
function evictIfPresent(
  frame: AudienceFrame,
  runtime: AudienceRuntime,
  seat: number,
  zone: ZoneId,
  casts: { seat: number; zone: ZoneId; cause: 'covered' | 'cooled' | 'overheat' }[],
  cause: 'covered' | 'cooled' | 'overheat' = 'covered',
): boolean {
  const state = frame.state[seat] ?? 0;
  if (state !== 1 && state !== 2 && state !== 3) {
    return false;
  }
  evictRaw(frame, runtime, seat, zone, casts, cause);
  return true;
}

/** 实际写入离场状态（所有离场路径共用，保证 runtime 同步）。 */
function evictRaw(
  frame: AudienceFrame,
  runtime: AudienceRuntime,
  seat: number,
  zone: ZoneId,
  casts: { seat: number; zone: ZoneId; cause: 'covered' | 'cooled' | 'overheat' }[],
  cause: 'covered' | 'cooled' | 'overheat' = 'covered',
): void {
  frame.state[seat] = 4;
  frame.phone[seat] = 0;
  frame.heat[seat] = 0;
  frame.tint[seat] = 0;
  runtime.changed[seat] = 1;
  runtime.progress[seat] = 0;
  runtime.litSeconds[seat] = 0;
  runtime.darkSeconds[seat] = 0;
  casts.push({ seat, zone, cause });
}

/**
 * 每固定步长：两段转化、热度升降、覆盖与离场。
 *
 * 顺序固定：① 先结算噪音覆盖（把彩观众打黑、把 0 级观众赶走），
 * ② 再结算光照转化与热度，③ 最后聚合区级读数（`ZoneState`）。
 */
export function updateAudience(run: RunState, data: DataRegistry, dt: Seconds): ConvertDelta {
  const frame = run.audience;
  const runtime = runtimeOf(frame);
  const size = frame.size;
  if (size === 0 || dt <= 0) {
    return EMPTY_DELTA;
  }
  runtime.tick += 1;

  const balance = data.balance;
  const stopSec = balance.conversion.stopSec;
  const seatSec = balance.conversion.seatSec;
  const interruptRetain = balance.conversion.interruptRetain;
  const riseSec = balance.heat.riseSec;
  const decayDelay = balance.heat.decayDelay;
  const decaySec = balance.heat.decaySec;
  const heat4DecayMultiplier = balance.heat.heat4DecayMultiplier;
  const overheatSeconds = balance.heat.overheatSeconds;
  const heatCap = run.build.cards.includes('heat-cap') ? 4 : 3;
  // 半径由 light.ts 统一收窄（返听锁定 −30%、Boss 吞光、失真吞光），此处不重复乘。
  const lightRadius = run.light.radius;
  const lightRadiusSquared = lightRadius * lightRadius;
  const form = data.lightForms[run.light.mode];
  // 返听锁定期间转化 −50%（GDD §8.2 / §11.1；半径收窄在 light.ts 已落地）。
  const conversionMultiplier = form.conversionMultiplier * (run.returnListener.locked ? 0.5 : 1);
  const canConvert = form.canConvert && run.light.mode !== 'self';
  const seats = data.seats;
  const zones = data.zones;

  let converted = 0;
  let colored = 0;
  let black = 0;
  let evicted = 0;
  const casts: { seat: number; zone: ZoneId; cause: 'covered' | 'cooled' | 'overheat' }[] = [];

  // ① 噪音覆盖：逐噪音取覆盖圆内的座位（AABB 裁剪，单噪音约 9 席）。
  const noises = run.noises;
  for (let n = 0; n < noises.length; n += 1) {
    const noise = noises[n];
    if (noise === undefined || !noise.active || noise.state === 'dying') {
      continue;
    }
    const coverRadius = data.noise[noise.kind].coverRadius;
    const centerCol = nearestSeatColumn(seats, noise.position.x);
    const centerRow = nearestSeatRow(seats, noise.position.z);
    const reachCol = Math.ceil(coverRadius / Math.max(0.0001, seats.spacing.x)) + 1;
    const reachRow = Math.ceil(coverRadius / Math.max(0.0001, seats.spacing.z)) + 1;
    const colMin = Math.max(0, Math.floor(centerCol - reachCol));
    const colMax = Math.min(seats.cols - 1, Math.ceil(centerCol + reachCol));
    const rowMin = Math.max(0, Math.floor(centerRow - reachRow));
    const rowMax = Math.min(seats.rows - 1, Math.ceil(centerRow + reachRow));
    for (let row = rowMin; row <= rowMax; row += 1) {
      for (let col = colMin; col <= colMax; col += 1) {
        const seat = row * seats.cols + col;
        const position = seatPositionOf(seats, seat);
        const dx = position.x - noise.position.x;
        const dz = position.z - noise.position.z;
        if (dx * dx + dz * dz > coverRadius * coverRadius) {
          continue;
        }
        const state = frame.state[seat] ?? 0;
        if (!isPresent(state)) {
          continue;
        }
        if (runtime.coveredTick[seat] === runtime.tick) {
          continue;
        }
        if ((runtime.coverReadyAt[seat] ?? 0) > run.time) {
          continue;
        }
        runtime.coveredTick[seat] = runtime.tick;
        runtime.coverReadyAt[seat] = run.time + COVER_COOLDOWN;
        const seatZone = zones[frame.zone[seat] ?? 0]?.id ?? 'front-left';
        const currentHeat = frame.heat[seat] ?? 0;
        const locked = run.returnListener.locked;
        runtime.litSeconds[seat] = 0;
        runtime.darkSeconds[seat] = 0;
        runtime.changed[seat] = 1;

        // ① 覆盖先打断热度：−1 级并打黑（三态里的第三种颜色）。
        if (currentHeat > 0) {
          frame.heat[seat] = currentHeat - 1;
          if (state === 2) {
            frame.state[seat] = 3;
            black += 1;
          }
          frame.phone[seat] = 0;
        }

        // ② 离场结算：只有“停住”（锁定 / 该区过热）时，覆盖才带走人。
        if (locked || run.zones[seatZone]?.overheat === true) {
          evicted += evictFromZone(frame, runtime, seatZone, data, LOCKED_COVER_EVICTS, casts);
        }
      }
    }
  }

  // ② 持续流失：停住 = 被咬住。
  //    - 返听锁定：每 `PRESSURE_DRAIN_SEC` 秒从锁定区带走 1 人；
  //    - 过热点（光心在同一区连续被照 ≥8s）：每 `OVERHEAT_DRAIN_SEC` 秒带走 1 人。
  //    两条都与覆盖频率解耦，避免“噪音多就必死、噪音少就无敌”的不稳定。
  const lightZone = run.light.lightingZone;
  const lightZoneState = lightZone === null ? null : run.zones[lightZone];
  const overheated = lightZoneState?.overheat === true;
  if (run.returnListener.locked) {
    runtime.lockedDrainClock = (runtime.lockedDrainClock ?? 0) + dt;
    while ((runtime.lockedDrainClock ?? 0) >= PRESSURE_DRAIN_SEC) {
      runtime.lockedDrainClock = (runtime.lockedDrainClock ?? 0) - PRESSURE_DRAIN_SEC;
      const drainZone = lightZone ?? ZONE_ORDER[0] ?? 'front-left';
      evicted += evictFromAnywhere(frame, runtime, data, drainZone, 1, casts, 'cooled');
    }
  } else {
    runtime.lockedDrainClock = 0;
  }
  if (overheated && lightZone !== null) {
    runtime.overheatDrainClock = (runtime.overheatDrainClock ?? 0) + dt;
    while ((runtime.overheatDrainClock ?? 0) >= OVERHEAT_DRAIN_SEC) {
      runtime.overheatDrainClock = (runtime.overheatDrainClock ?? 0) - OVERHEAT_DRAIN_SEC;
      evicted += evictFromAnywhere(frame, runtime, data, lightZone, 1, casts, 'overheat');
    }
  } else {
    runtime.overheatDrainClock = 0;
  }

  // ③ 逐席：转化 / 热度 / 掉级（用光心覆盖判定）。
  const lightX = run.light.position.x;
  const lightZ = run.light.position.z;
  for (let seat = 0; seat < size; seat += 1) {
    const state = frame.state[seat] ?? 0;
    if (!isPresent(state)) {
      runtime.progress[seat] = 0;
      runtime.litSeconds[seat] = 0;
      runtime.darkSeconds[seat] = 0;
      runtime.litLastTick[seat] = 0;
      continue;
    }

    const seatPosition = seatPositionOf(data.seats, seat);
    const dx = seatPosition.x - lightX;
    const dz = seatPosition.z - lightZ;
    const lit = canConvert && dx * dx + dz * dz <= lightRadiusSquared;
    const litPreviously = runtime.litLastTick[seat] === 1;
    runtime.litLastTick[seat] = lit ? 1 : 0;

    if (lit) {
      runtime.litSeconds[seat] = (runtime.litSeconds[seat] ?? 0) + dt;
      runtime.darkSeconds[seat] = 0;

      if (state === 1) {
        // 灰 → 彩：0.4s 拉停 + 1.5s 入座；进度受形态倍率与过热点惩罚影响。
        const seatZoneId = zones[frame.zone[seat] ?? 0]?.id ?? 'front-left';
        const overheat = run.zones[seatZoneId]?.overheat === true;
        const overheatPenalty = overheat ? 1 - balance.heat.overheatConversionPenalty : 1;
        runtime.progress[seat] =
          (runtime.progress[seat] ?? 0) + dt * conversionMultiplier * overheatPenalty;
        const total = stopSec + seatSec;
        const ratio = (runtime.progress[seat] ?? 0) / total;
        frame.tint[seat] = ratio > 0.999 ? 0.999 : ratio < 0 ? 0 : ratio;
        if ((runtime.progress[seat] ?? 0) >= total) {
          frame.state[seat] = 2;
          frame.tint[seat] = 1;
          frame.phone[seat] = 1;
          frame.heat[seat] = 1;
          runtime.progress[seat] = 0;
          runtime.changed[seat] = 1;
          converted += 1;
          colored += 1;
        }
      } else if (state === 2) {
        // 被返听咬住时热度不再上升（光的“点亮”能力被夺走）；锁定解除后恢复。
        if (!run.returnListener.locked) {
          runtime.heatClock[seat] = (runtime.heatClock[seat] ?? 0) + dt;
        }
        let currentHeat = frame.heat[seat] ?? 0;
        while ((runtime.heatClock[seat] ?? 0) >= riseSec && currentHeat < heatCap) {
          currentHeat = nextHeat(currentHeat, heatCap);
          runtime.heatClock[seat] = (runtime.heatClock[seat] ?? 0) - riseSec;
          runtime.changed[seat] = 1;
        }
        frame.heat[seat] = currentHeat;
        frame.phone[seat] = currentHeat >= 1 ? 1 : 0;
      } else if (state === 3) {
        // 黑观众被光照 ≥ singSeconds 且区热度 ≥ 2 → 二次唱化（回到彩）。
        const recovery = data.noise['floor-noise'].singSeconds;
        const seatZoneId = zones[frame.zone[seat] ?? 0]?.id ?? 'front-left';
        if ((run.zones[seatZoneId]?.heat ?? 0) >= balance.noise.singHeatRequired) {
          runtime.progress[seat] = (runtime.progress[seat] ?? 0) + dt;
          if ((runtime.progress[seat] ?? 0) >= recovery) {
            frame.state[seat] = 2;
            frame.phone[seat] = 1;
            frame.tint[seat] = 1;
            runtime.progress[seat] = 0;
            runtime.changed[seat] = 1;
            converted += 1;
            colored += 1;
          }
        } else {
          runtime.progress[seat] = Math.max(0, (runtime.progress[seat] ?? 0) - dt);
        }
      }
    } else {
      // 光移开：拉停/入座进度一次性保留 50%（§7.2）。
      if (litPreviously) {
        runtime.progress[seat] = (runtime.progress[seat] ?? 0) * interruptRetain;
        if (state === 1) {
          const total = stopSec + seatSec;
          const ratio = (runtime.progress[seat] ?? 0) / total;
          frame.tint[seat] = ratio > 1 ? 1 : ratio;
        }
        runtime.changed[seat] = 1;
      }
      runtime.litSeconds[seat] = 0;
      if (state === 2) {
        runtime.darkSeconds[seat] = (runtime.darkSeconds[seat] ?? 0) + dt;
        if ((runtime.darkSeconds[seat] ?? 0) > decayDelay) {
          const seatZoneId = zones[frame.zone[seat] ?? 0]?.id ?? 'front-left';
          const overheat = run.zones[seatZoneId]?.overheat === true;
          const multiplier = (frame.heat[seat] ?? 0) >= 4 ? heat4DecayMultiplier : 1;
          runtime.decayClock[seat] =
            (runtime.decayClock[seat] ?? 0) + dt * multiplier * (overheat ? 2 : 1);
          let currentHeat = frame.heat[seat] ?? 0;
          while ((runtime.decayClock[seat] ?? 0) >= decaySec && currentHeat > 0) {
            currentHeat -= 1;
            runtime.decayClock[seat] = (runtime.decayClock[seat] ?? 0) - decaySec;
            runtime.changed[seat] = 1;
          }
          frame.heat[seat] = currentHeat;
          frame.phone[seat] = currentHeat >= 1 ? 1 : 0;
          if (currentHeat === 0) {
            runtime.decayClock[seat] = 0;
          }
        }
      } else if (state === 3) {
        runtime.progress[seat] = Math.max(0, (runtime.progress[seat] ?? 0) - dt * 2);
      }
    }
  }

  // ③ 区级聚合：热度中位数、亮座、黑座、过热点（同一区被照 ≥8s）。
  for (let z = 0; z < zones.length; z += 1) {
    const def = zones[z];
    if (def === undefined) {
      continue;
    }
    const zoneState = run.zones[def.id];
    if (zoneState === undefined) {
      continue;
    }
    let attendees = 0;
    let heatSum = 0;
    let litSeats = 0;
    let blackSeats = 0;
    let coloredInZone = 0;
    forEachZoneSeat(def.id, data, (seat) => {
      const state = frame.state[seat] ?? 0;
      if (!isPresent(state)) {
        return;
      }
      attendees += 1;
      heatSum += frame.heat[seat] ?? 0;
      if (state === 2) {
        coloredInZone += 1;
      }
      if (state === 3) {
        blackSeats += 1;
      }
      if ((runtime.litSeconds[seat] ?? 0) > 0) {
        litSeats += 1;
      }
    });
    // 区热度＝区内出席者的平均热度（四舍五入）。
    // 用平均而不是中位数：开局每区只有 8 人，中位数会被“少数还没被照到的人”直接压到 0，
    // 使区热度读数在扫场时长期为 0（F3 实测扫场 45s 团灭的根因之一）。
    const averageHeat = attendees > 0 ? heatSum / attendees : 0;
    // 过热点：光停太久，观众开始疲（热度读数 −1）。这是 GDD §11.1「褪色 ×2」的强化落点，
    // 让「停住」不仅掉人、也掉输出（合唱波伤害/唱化都读这个 heat）。
    const overheatPenalty = zoneState.overheat ? 1 : 0;
    zoneState.heat = toHeatLevel(Math.max(0, Math.round(averageHeat) - overheatPenalty));
    zoneState.litSeats = litSeats;
    zoneState.blackSeats = blackSeats;
    zoneState.choirDrivers = coloredInZone;
    // 过热点只统计“光心所在区”的连续被照：光心离开该区即中断。
    // 否则扫场时光锥半径仍覆盖相邻区，会让 enemies.isCamping 把扫场误判成驻守
    // （F3 实测：扫场在 5 秒内被返听锁住，掉 12 人）。
    if (run.light.lightingZone === def.id) {
      zoneState.litSeconds += dt;
      zoneState.overheat = zoneState.litSeconds >= overheatSeconds;
    } else {
      zoneState.litSeconds = 0;
      zoneState.overheat = false;
    }
  }

  // ④ 脏区合并（上限 8 段）并写回只读快照。
  publishDirty(frame, runtime);

  return { converted, colored, black, casts };
}

/** 把本 tick 变化过的座位合并成连续区间（≤8 段），写入 frame.dirty。 */
function publishDirty(frame: AudienceFrame, runtime: AudienceRuntime): void {
  const ranges = DIRTY_BUFFERS.get(frame);
  if (ranges === undefined) {
    return;
  }
  let rangeIndex = 0;
  let runStart = -1;
  let runLength = 0;
  const flush = (): void => {
    if (runStart >= 0 && rangeIndex < MAX_DIRTY_RANGES) {
      const slot = ranges[rangeIndex];
      if (slot !== undefined) {
        slot.start = runStart;
        slot.count = runLength;
      }
      rangeIndex += 1;
    }
    runStart = -1;
    runLength = 0;
  };
  for (let seat = 0; seat < frame.size; seat += 1) {
    if (runtime.changed[seat] === 1) {
      runtime.changed[seat] = 0;
      if (runStart < 0) {
        runStart = seat;
        runLength = 1;
      } else {
        runLength += 1;
      }
    } else if (runStart >= 0) {
      flush();
    }
  }
  flush();
  for (let i = rangeIndex; i < MAX_DIRTY_RANGES; i += 1) {
    const slot = ranges[i];
    if (slot !== undefined) {
      slot.count = 0;
    }
  }
}

/**
 * 人浪扫过时的整区转化（1:4）。
 *
 * 该区每 4 个“还没变彩”的出席者里转化 1 个（灰与黑都算），并给全席热度 +1
 * （上限由 `heat-cap` 决定）。返回本区转化明细（`casts` 为空）。
 */
export function applyCrowdWave(run: RunState, zone: ZoneId, data: DataRegistry): ConvertDelta {
  const frame = run.audience;
  const runtime = runtimeOf(frame);
  const heatCap = run.build.cards.includes('heat-cap') ? 4 : 3;
  let converted = 0;
  let colored = 0;
  let black = 0;
  let index = 0;
  forEachZoneSeat(zone, data, (seat) => {
    const state = frame.state[seat] ?? 0;
    if (!isPresent(state)) {
      return;
    }
    const currentHeat = frame.heat[seat] ?? 0;
    if (currentHeat < heatCap) {
      frame.heat[seat] = nextHeat(currentHeat, heatCap);
      runtime.changed[seat] = 1;
    }
    if (state === 1 || state === 3) {
      index += 1;
      if (index % 4 === 0) {
        frame.state[seat] = 2;
        frame.phone[seat] = 1;
        frame.tint[seat] = 1;
        runtime.progress[seat] = 0;
        runtime.changed[seat] = 1;
        converted += 1;
        colored += 1;
        if (state === 3) {
          black += 1;
        }
      }
    }
  });
  publishDirty(frame, runtime);
  return { converted, colored, black, casts: [] };
}

/** 静态读取：某区当前出席人数（`zone = null` 时为全场）。 */
export function countPresent(frame: AudienceFrame, zone: ZoneId | null): number {
  const zoneIndex = zone === null ? -1 : zoneIndexOf(zone);
  let count = 0;
  for (let seat = 0; seat < frame.size; seat += 1) {
    if (zoneIndex >= 0 && (frame.zone[seat] ?? 0) !== zoneIndex) {
      continue;
    }
    if (isPresent(frame.state[seat] ?? 0)) {
      count += 1;
    }
  }
  return count;
}

/**
 * 白光（血量）比例：`0.85 × (1 − audience / capacity)`，clamp 0..0.85。
 *
 * 与 `HudSnapshot.whiteout` 同源（tech-spec §14.3）；不进后处理，只喂 DOM 遮罩与 uniform。
 */
export function computeWhiteout(audience: number, capacity: number): Ratio {
  if (capacity <= 0) {
    return 0.85;
  }
  const normalized = 1 - audience / capacity;
  const value = 0.85 * (normalized > 1 ? 1 : normalized);
  if (value <= 0) {
    return 0;
  }
  return value > 0.85 ? 0.85 : value;
}
