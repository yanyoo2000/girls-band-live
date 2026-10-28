/**
 * 光系统：三种形态（散光 / 束光 / 回照）、惯性、点燃跟拍、反驻守锚点、扫场奖励。
 *
 * 用途：光就是唯一的“武器”。它不消耗资源，代价只有“你只能看一个地方”；
 * 移动本身有收益（扫场 +20%），停住会被惩罚（返听锁定由 combat 结算，锚点由本模块提供）。
 *
 * 依赖：`../types/game`（RunState / InputFrame / MusicalPosition / IgniteQuality /
 * ZoneId / Vec2 / Seconds / Circle）、`../types/data`（DataRegistry 的 lightForms /
 * balance.light / balance.antiCamp / balance.boss / segments / chords / characters / seats）。
 * 分配策略：每步长只读写既有状态；`LightUpdate` / `IgniteResult` 是每步长返回的小对象，
 * 已用模块级复用对象（`updateLight` 与 `evaluateIgnite` 各一个，调用方不得跨帧持有）。
 * 清理策略：反驻守窗口状态放 `WeakMap<RunState>`，一局结束自动回收。
 *
 * 导出（§5.2 的 3 个 + 几何辅助）：
 * - `updateLight(run, input, data, dt)`；
 * - `evaluateIgnite(run, musical, data, sweepBonus)`；
 * - `queryLitSeats(run, data, out)`；
 * - `LightUpdate` / `IgniteResult` 类型。
 */
import type {
  Circle,
  IgniteQuality,
  InputFrame,
  LightMode,
  MusicalPosition,
  Ratio,
  RunState,
  Seconds,
  Vec2,
  ZoneId,
} from '../types/game';
import type { ChordKey, DataRegistry, SegmentDef } from '../types/data';
import { OPENING_GRACE_SEC } from '../data/segments';
import { zoneAtPoint } from './audience';
import { nearestSeatColumn, nearestSeatRow, seatPositionAt } from '../data/seats';

/** 光锥/座位判定的“人”半径（米）：座位是点，人的肩宽半径 0.35m（与座位网格无关）。 */
const PERSON_RADIUS = 0.35;

/** 回照的触发半径（米）：GDD §6.1 锁定“舞台中心 2m 内”，数据表无该字段。 */
const SELF_LIGHT_RADIUS = 2;

/** 主唱默认站位（数据表缺失时的回退；舞台中心）。 */
const STAGE_CENTER: Vec2 = { x: 0, z: 0 };

/** 扫场窗口状态（每局一份）。 */
interface LightRuntime {
  windowStart: Seconds;
  sweepMask: number;
  lastZone: ZoneId | null;
  lastBeatIndex: number;
  /** 首次 pointermove 前不把“开始演出”按钮位置当成光位（H1）。 */
  pointerSeeded: boolean;
  pointerStartNdc: Vec2;
  pointerActive: boolean;
}

const RUNTIMES = new WeakMap<RunState, LightRuntime>();

function runtimeOf(run: RunState): LightRuntime {
  const existing = RUNTIMES.get(run);
  if (existing !== undefined) {
    return existing;
  }
  const runtime: LightRuntime = {
    windowStart: -Number.POSITIVE_INFINITY,
    sweepMask: 0,
    lastZone: null,
    lastBeatIndex: -1,
    pointerSeeded: false,
    pointerStartNdc: { x: 0, z: 0 },
    pointerActive: false,
  };
  RUNTIMES.set(run, runtime);
  return runtime;
}

/** 玩家是否已经真正移动过指针（H1：按钮位置不算）。 */
export function hasPlayerMovedLight(run: RunState): boolean {
  return runtimeOf(run).pointerActive;
}

/** 推进光的位置/惯性/冷却/反驻守锚点（每固定步长调用一次）。 */
export interface LightUpdate {
  readonly movedDistance: number;
  readonly sweptZones: number;
  readonly enteredZone: ZoneId | null;
  readonly modeChanged: boolean;
}

/** 一次点燃的判定结果。 */
export interface IgniteResult {
  readonly quality: IgniteQuality;
  readonly multiplier: number;
  readonly inChord: boolean;
  readonly zone: ZoneId | null;
  readonly sweepBonusApplied: boolean;
}

/** 复用的返回对象（禁止调用方跨帧持有）。 */
const LIGHT_UPDATE: {
  movedDistance: number;
  sweptZones: number;
  enteredZone: ZoneId | null;
  modeChanged: boolean;
} = { movedDistance: 0, sweptZones: 0, enteredZone: null, modeChanged: false };



/** 主唱的舞台站位（回照中心）。 */
function selfCenter(data: DataRegistry): Vec2 {
  for (let i = 0; i < data.characters.length; i += 1) {
    const character = data.characters[i];
    if (character !== undefined && character.playable) {
      return {
        x: character.silhouette.stagePosition.x,
        z: character.silhouette.stagePosition.z,
      };
    }
  }
  return STAGE_CENTER;
}

function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/** 一阶惯性插值：`alpha = dt / inertiaSec`（0.15s 内基本到位，不跟手）。 */
function approach(current: Vec2, target: Vec2, alpha: number): Vec2 {
  return {
    x: current.x + (target.x - current.x) * alpha,
    z: current.z + (target.z - current.z) * alpha,
  };
}

/** 区索引 → 位掩码。 */
function zoneBit(zone: ZoneId): number {
  switch (zone) {
    case 'front-left':
      return 1;
    case 'front-right':
      return 2;
    case 'back-left':
      return 4;
    case 'back-right':
      return 8;
    default:
      return 0;
  }
}

/** 热度已经为 0 的出席者中赶走 1 人（回照的“每 4 拍人气 −1”）。 */
function drainOneAudience(run: RunState): boolean {
  const frame = run.audience;
  for (let seat = 0; seat < frame.size; seat += 1) {
    const state = frame.state[seat] ?? 0;
    const heat = frame.heat[seat] ?? 0;
    if (heat === 0 && (state === 1 || state === 2 || state === 3)) {
      frame.state[seat] = 4;
      frame.phone[seat] = 0;
      frame.tint[seat] = 0;
      return true;
    }
  }
  return false;
}

/**
 * 推进光的位置/惯性/冷却/反驻守锚点（每固定步长调用一次）。
 *
 * - 形态互斥：鼠标在舞台中心 2m 内 → 回照；按住左键 → 束光；否则散光；
 * - 0.15s 惯性（不跟手），半径与倍率来自 `DataRegistry.lightForms`；
 * - 反驻守：锚点 6m / 4s、扫场窗口 4s / ≥2 区 → 下一次点燃 +20%；
 * - 回照代价：每 4 拍人气 −1（数据表 `audienceDeltaPer4Beats`）。
 */
export function updateLight(run: RunState, input: InputFrame, data: DataRegistry, dt: Seconds): LightUpdate {
  if (dt <= 0) {
    LIGHT_UPDATE.movedDistance = 0;
    LIGHT_UPDATE.sweptZones = 0;
    LIGHT_UPDATE.enteredZone = null;
    LIGHT_UPDATE.modeChanged = false;
    return LIGHT_UPDATE;
  }
  const runtime = runtimeOf(run);
  const balance = data.balance;
  const light = run.light;
  const previousMode = light.mode;
  const previousZone = light.lightingZone;

  // H1：开局先用 data 初始光位；第一次 pointermove 之前，按钮位置/初始指针一律不算。
  // 用 NDC 判断“玩家是否动过鼠标”，避免键盘移动带动相机后 pointerWorld 漂移造成误激活。
  if (!runtime.pointerSeeded) {
    runtime.pointerSeeded = true;
    runtime.pointerStartNdc = { x: input.pointerNdc.x, z: input.pointerNdc.z };
    // 直接以较晚的 run.time 调用（单测/读档恢复）时不再等 pointermove；
    // 正式局第一 tick 的 run.time 约 0.016，因此不会命中。
    if (run.time > OPENING_GRACE_SEC) runtime.pointerActive = true;
  } else if (distance(input.pointerNdc, runtime.pointerStartNdc) > 0.01) {
    // 只认真实 NDC 变化；pointerWorld 会随相机缓动漂移，不能作为“玩家动过”的证据。
    runtime.pointerActive = true;
  }
  const usePointer = runtime.pointerActive;
  const pointer: Vec2 = usePointer ? input.pointerWorld : light.target;

  // 1) 形态判定（三种互斥；回照优先于束光，因为“把光收回脚下”是明确的意图）。
  // 独奏冷却期间强制散光（self-cooldown 的消费点）。
  light.selfCooldown = Math.max(0, light.selfCooldown - dt);
  const center = selfCenter(data);
  const wantsSelf = distance(pointer, center) <= SELF_LIGHT_RADIUS;
  let nextMode: LightMode = wantsSelf ? 'self' : input.beamHeld ? 'beam' : 'spread';
  if (nextMode === 'self' && light.selfCooldown > 0) nextMode = 'spread';
  light.mode = nextMode;
  const form = data.lightForms[nextMode];
  light.radius = form.radius;
  // 静默阶段 2「吞光」：锥长 −50%（表现层参数，逻辑半径同步收窄）。
  if (run.boss.phase === 'light') {
    light.radius *= balance.boss.phase2LightScale;
  }
  if (run.returnListener.locked) {
    light.radius *= 0.7;
  }
  const modeChanged = previousMode !== nextMode;

  // 2) 目标与惯性。
  if (usePointer) {
    light.target = { x: pointer.x, z: pointer.z };
  }
  const inertia = balance.light.inertiaSec > 0 ? balance.light.inertiaSec : dt;
  const alpha = dt / inertia > 1 ? 1 : dt / inertia;
  const before = light.position;
  light.position = approach(before, light.target, alpha);
  const moved = distance(before, light.position);

  // 3) 冷却与点燃脉冲衰减。
  light.igniteCooldown = light.igniteCooldown > 0 ? Math.max(0, light.igniteCooldown - dt) : 0;
  if (light.intensity > 0) {
    const pulse = balance.light.ignitePulseSec;
    light.intensity = pulse > 0 ? Math.max(0, light.intensity - dt / pulse) : 0;
  }

  // 4) 反驻守锚点：开场宽限 + 未动指针时不计时；离开 6m 才重置，否则累计静止时长。
  if (run.time < OPENING_GRACE_SEC || !usePointer) {
    light.anchor = { x: light.position.x, z: light.position.z };
    light.anchorAge = 0;
  } else {
    const anchorDistance = distance(light.position, light.anchor);
    if (anchorDistance > balance.antiCamp.anchorRadius || modeChanged) {
      light.anchor = { x: light.position.x, z: light.position.z };
      light.anchorAge = 0;
    } else {
      light.anchorAge += dt;
    }
  }

  // 5) 区读数与扫场窗口。
  const zone = zoneAtPoint(light.position, data);
  light.lightingZone = zone;
  const now = run.time;
  if (now - runtime.windowStart > balance.antiCamp.sweepWindow) {
    runtime.windowStart = now;
    runtime.sweepMask = 0;
  }
  if (zone !== null && zone !== runtime.lastZone) {
    runtime.sweepMask |= zoneBit(zone);
  }
  runtime.lastZone = zone;
  let sweptZones = 0;
  for (let bit = 0; bit < 4; bit += 1) {
    if ((runtime.sweepMask & (1 << bit)) !== 0) {
      sweptZones += 1;
    }
  }
  light.sweptZones = sweptZones;
  if (sweptZones >= balance.antiCamp.sweepZones && light.sweepBonusCharges <= 0) {
    light.sweepBonusCharges = 1;
    // 奖励只在一次点燃内有效；窗口从本次跨区重新计时。
    runtime.windowStart = now;
    runtime.sweepMask = 0;
    runtime.lastZone = null;
  }

  // 6) 回照的人气代价（每 4 拍 −1；只在拍序号推进时结算一次）。
  const beatIndex = run.musical.bar * 4 + run.musical.beat;
  if (nextMode === 'self' && beatIndex !== runtime.lastBeatIndex && beatIndex % 4 === 0) {
    const delta = form.audienceDeltaPer4Beats;
    if (delta < 0) {
      const steps = Math.min(-delta, 8);
      for (let i = 0; i < steps; i += 1) {
        drainOneAudience(run);
      }
    }
  }
  runtime.lastBeatIndex = beatIndex;

  LIGHT_UPDATE.movedDistance = moved;
  LIGHT_UPDATE.sweptZones = sweptZones;
  LIGHT_UPDATE.enteredZone = zone !== null && zone !== previousZone ? zone : null;
  LIGHT_UPDATE.modeChanged = modeChanged;
  return LIGHT_UPDATE;
}

/** 当前小节的和弦（段内小节序号 → 段落和弦序列，循环）。 */
function currentChordKey(musical: MusicalPosition, data: DataRegistry): ChordKey | null {
  let segmentDef: SegmentDef | undefined;
  for (let i = 0; i < data.segments.length; i += 1) {
    const candidate = data.segments[i];
    if (candidate !== undefined && candidate.id === musical.segment) {
      segmentDef = candidate;
      break;
    }
  }
  if (segmentDef === undefined) {
    return null;
  }
  const barSec = (60 / data.beatGrid.bpm) * data.beatGrid.beatsPerBar;
  const segmentBars = Math.max(1, Math.round((segmentDef.endSec - segmentDef.startSec) / barSec));
  const rawIndex = Math.floor(musical.segmentProgress * segmentBars);
  const index = rawIndex < 0 ? 0 : rawIndex;
  if (segmentDef.chords.length === 0) {
    return null;
  }
  const chord = segmentDef.chords[index % segmentDef.chords.length];
  return chord ?? null;
}

/**
 * 判定一次点燃（窗口由 `MusicClock` 提供）。
 *
 * 倍率：完美 1.6 / 良好 1.2 / 错拍 0.4；和弦内 ×1.25、外 ×0.75；扫场奖励 ×1.2。
 * 同时写入点燃冷却、脉冲强度并消耗扫场充能。
 */
export function evaluateIgnite(
  run: RunState,
  musical: MusicalPosition,
  data: DataRegistry,
  sweepBonus: number,
): IgniteResult {
  const light = run.light;
  const balance = data.balance;
  const beatSec = 60 / Math.max(1, musical.bpm);
  const phase = musical.beatPhase < 0 ? 0 : musical.beatPhase > 1 ? 1 : musical.beatPhase;
  const distanceToBeat = Math.min(phase, 1 - phase) * beatSec;

  let quality: IgniteQuality;
  let base: number;
  if (distanceToBeat <= balance.light.perfectWindow) {
    quality = 'perfect';
    base = balance.light.perfectMultiplier;
  } else if (distanceToBeat <= balance.light.goodWindow) {
    quality = 'good';
    base = balance.light.goodMultiplier;
  } else {
    quality = 'off';
    base = balance.light.offMultiplier;
  }

  const zone = zoneAtPoint(light.position, data);
  let inChord = false;
  if (zone !== null) {
    const chordKey = currentChordKey(musical, data);
    if (chordKey !== null) {
      inChord = data.chords[chordKey].zoneInChord[zone];
    }
  }
  const chordMultiplier = inChord ? 1 + balance.light.inChordBonus : 1 - balance.light.outChordPenalty;

  // 扫场奖励：调用方传入当前可用的奖励（0 或 0.2），并在此消耗一次充能。
  const bonusAvailable = sweepBonus > 0 && light.sweepBonusCharges > 0;
  if (bonusAvailable) {
    light.sweepBonusCharges -= 1;
  }
  const multiplier = base * chordMultiplier * (bonusAvailable ? 1 + sweepBonus : 1);

  // 冷却与脉冲（`breathe` 卡减少 1 拍，属上限/冷却类、由本系统直接读构筑）。
  const cooldownBeats = Math.max(
    0,
    balance.light.igniteCooldownBeats - (run.build.cards.includes('breathe') ? 1 : 0),
  );
  light.igniteCooldown = (cooldownBeats * 60) / Math.max(1, musical.bpm);
  light.intensity = 1;

  // 点燃是低频操作（≤2 拍一次），每次返回新对象：调用方可以同时比较两次判定。
  return {
    quality,
    multiplier,
    inChord,
    zone,
    sweepBonusApplied: bonusAvailable,
  };
}

/**
 * 光锥覆盖的座位范围（桶查询，O(格子数)）。
 *
 * 把命中的座位索引写入 `out`，返回写入数量（`out` 不足时截断，不越界）。
 */
export function queryLitSeats(run: RunState, data: DataRegistry, out: Int32Array): number {
  const light = run.light;
  const seats = data.seats;
  const reach = light.radius + PERSON_RADIUS;
  if (reach <= 0) {
    return 0;
  }
  const centerCol = nearestSeatColumn(seats, light.position.x);
  const centerRow = nearestSeatRow(seats, light.position.z);
  const reachCol = Math.ceil(reach / Math.max(0.0001, seats.spacing.x)) + 1;
  const reachRow = Math.ceil(reach / Math.max(0.0001, seats.spacing.z)) + 1;
  const colMin = Math.max(0, centerCol - reachCol);
  const colMax = Math.min(seats.cols - 1, centerCol + reachCol);
  const rowMin = Math.max(0, centerRow - reachRow);
  const rowMax = Math.min(seats.rows - 1, centerRow + reachRow);
  const center: Circle['center'] = { x: light.position.x, z: light.position.z };
  let hits = 0;
  for (let row = rowMin; row <= rowMax; row += 1) {
    for (let col = colMin; col <= colMax; col += 1) {
      const seat = row * seats.cols + col;
      const position = seatPositionAt(seats, row, col);
      const dx = position.x - center.x;
      const dz = position.z - center.z;
      if (dx * dx + dz * dz > reach * reach) {
        continue;
      }
      if (hits < out.length) {
        out[hits] = seat;
      }
      hits += 1;
    }
  }
  return hits;
}

/** 供 store 构建光照覆盖读数（不复用 `out` 数组之外的分配）。 */
export function lightCoverageRatio(run: RunState, data: DataRegistry, scratch: Int32Array): Ratio {
  const lit = queryLitSeats(run, data, scratch);
  const frame = run.audience;
  let present = 0;
  for (let seat = 0; seat < frame.size; seat += 1) {
    const state = frame.state[seat] ?? 0;
    if (state === 1 || state === 2 || state === 3) {
      present += 1;
    }
  }
  if (present === 0) {
    return 0;
  }
  const capped = lit > present ? present : lit;
  return capped / present;
}
