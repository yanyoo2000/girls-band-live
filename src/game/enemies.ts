/**
 * 敌人行为（dev-combat）：三种常规噪音、精英「返听」与其召唤的啸叫。
 *
 * 术语对齐：本项目的「波次」= 段落生成率 + 裂缝/返听上限（tech-spec §7.1），没有离散波次编号；
 * 「敌人」= 3 常规 + 1 精英 + 1 Boss（Boss 在 boss.ts，不占噪音池）。
 *
 * 归属边界（docs/tech-spec.md §4.2、本任务契约）：
 * - 本文件写 `run.noises` 与 `run.returnListener`（dev-combat 拥有），
 *   只读 `run.light` / `run.audience` / `run.zones` / `run.lines`，**绝不回写**；
 * - 光被吞、光被灭、观众被覆盖等「光/观众侧后果」不在这里施加：
 *   本文件只提供只读查询（`lightEatRatio` / `stageBlackoutRemaining`），由 dev-engine 的
 *   light.ts 在自己的状态上落地；「覆盖座位」由 `audience.updateAudience` 直接读
 *   `run.noises` 结算（它已内建逐拍去重），本文件只负责把噪音推到座位上，不重复实现一份。
 *   这样「战斗消费快照、不反向修改光与观众」的契约可被机器检查（validate R12）。
 *
 * 确定性：不调用全局随机数与系统时钟；需要随机的路径都走入参 `Rng`（`updateSpawner`），
 * 没有 Rng 的路径（精英召怪）退化为固定角度与固定距离，同 seed 必复现。
 */

import type {
  NoiseEntity,
  Pool,
  Ratio,
  ReturnListenerState,
  Rng,
  RunState,
  Seconds,
  Vec2,
} from '../types/game';
import type { DataRegistry, NoiseDef } from '../types/data';
import { seatPositionOf } from '../data/seats';
import { combatModifier, returnListenerConversion } from './combat';
import {
  computeWaveBudget,
  countActiveNoises,
  nearestSpeakerStack,
  spawnNoiseAt,
  speakerStacksOf,
  stageAnchorOf,
  updateWavesWithPool,
  zoneAtPoint,
} from './waves';

/* ==========================================================================
 * GDD 锁定、但 BalanceConfig 未覆盖的常量（待技术总监扩展 balance 后迁移）
 * ========================================================================== */

/** 返听同时存在的上限（GDD §8.2「上限：同时 2 只」）。 */
export const RETURN_LISTENER_BASE_CAP = 2;

/** 每道裂缝让返听生成间隔缩短 20%（GDD §8.1 末条）。 */
export const RETURN_LISTENER_CRACK_INTERVAL_SCALE = 0.2;

/** 返听锁定时每 1.5s 在光锥边缘生 1 只啸叫（GDD §8.2）。 */
export const RETURN_LISTENER_SCREAM_INTERVAL: Seconds = 1.5;

/** 失真吞光：每只吞掉 30% 锥长（GDD §8.1）。 */
export const DISTORTION_LIGHT_EAT = 0.3;

/** 失真吞光上限 60%（两只叠满；再多也只让锥长剩 40%，保证可读）。 */
export const DISTORTION_LIGHT_EAT_CAP = 0.6;

/** 失真抵达舞台后光熄灭 1.5s（GDD §8.1）。 */
export const DISTORTION_STAGE_EXTINGUISH: Seconds = 1.5;

/** 啸叫命中后的击退/白闪窗口 0.4s（GDD §8.1）。 */
export const SCREAM_HIT_SECONDS: Seconds = 0.4;

/** 贝斯护盾：她所在侧翼的噪音移速 −30%（GDD §5.2）。 */
export const BASS_SHIELD_SPEED_SCALE = 0.7;

/** 返听的「视线」半角（断视线 1.5s 解除锁定；角度未锁定，取 60°）。 */
const LISTENER_SIGHT_HALF_ANGLE = Math.PI / 3;

/** 刷怪上下文（tech-spec §5.3）：由 store 每固定步长组装。 */
export interface SpawnContext {
  readonly run: RunState;
  readonly data: DataRegistry;
  readonly rng: Rng;
  readonly pool: Pool<NoiseEntity>;
  readonly dt: Seconds;
}

/** 精英返听的一次更新结果。 */
export interface ReturnListenerResult {
  /** 同一个 state 引用（便于 store 直接读取 HP/锁定）。 */
  readonly state: ReturnListenerState;
  readonly spawned: boolean;
  readonly locked: boolean;
  readonly released: boolean;
  /** 唱化产生的观众数（烧死为 0）。 */
  readonly converted: number;
}

/** 敌人侧的计时状态（RunState 无对应字段，按 run 键控）。 */
interface EnemyLedger {
  /** 上一刻「看见光」的方向（弧度）。 */
  facing: number;
  /** 连续看不见光的秒数。 */
  losSeconds: Seconds;
  /** 返听被光照住的累计秒数（唱化进度）。 */
  singSeconds: Seconds;
  /** 锁定期间召唤啸叫的计时。 */
  screamTimer: Seconds;
  /** 召怪相位计数（无 Rng 时用它生成固定角）。 */
  screamPhase: number;
  /**
   * 本局实体池（由 `updateSpawner` 每次绑定）。
   * 精英召怪走的是没有 pool 入参的 `updateReturnListener`，必须借这里拿到池，
   * 否则它生成的啸叫/第二只返听会在下一拍被 `updateEntities` 的重建丢掉。
   */
  pool: Pool<NoiseEntity> | null;
}

const ledgers = new WeakMap<RunState, EnemyLedger>();

function ledgerFor(run: RunState): EnemyLedger {
  const existing = ledgers.get(run);
  if (existing) return existing;
  const created: EnemyLedger = {
    facing: 0,
    losSeconds: 0,
    singSeconds: 0,
    screamTimer: 0,
    screamPhase: 0,
    pool: null,
  };
  ledgers.set(run, created);
  return created;
}

/* ==========================================================================
 * 刷怪入口
 * ========================================================================== */

/**
 * 刷怪的池化入口（tech-spec §5.3）：与 `waves.updateWaves` 共用同一份按 run 键控的预算累加器，
 * 因此同帧重复调用不会重复生成。
 *
 * 实体必须来自 `ctx.pool`：`entities.updateEntities` 每步长用 `pool.active` 重建 `run.noises`，
 * 不走池的实体会在下一拍消失（见 entities.ts 头部「活跃表一致性」）。
 * 这里同时把池绑定进本局 ledger，供没有 pool 入参的精英召怪路径复用。
 */
export function updateSpawner(ctx: SpawnContext): number {
  if (ctx.dt <= 0) return 0;
  const ledger = ledgerFor(ctx.run);
  ledger.pool = ctx.pool;
  const budget = computeWaveBudget(ctx.run, ctx.data);
  const capacity = Math.max(0, Math.min(budget.cap, ctx.pool.capacity));
  const active = Math.max(countActiveNoises(ctx.run), ctx.pool.active.length);
  if (active >= capacity) return 0;
  return updateWavesWithPool(ctx.run, ctx.data, ctx.rng, ctx.dt, ctx.pool);
}

/* ==========================================================================
 * 常规噪音行为
 * ========================================================================== */

/**
 * 噪音行为（每固定步长）：
 * - 底噪：贴地爬向最近的出席座位（覆盖由 `audience.updateAudience` 读 `run.noises` 自行结算）；
 * - 啸叫：沿生成瞬间锁定的方向直线冲光（不追踪，逼玩家「移」而不是「盯」）；
 * - 失真：缓慢推向舞台，抵达后留下 1.5s 的「光灭」窗口；
 * - 返听实体（第二只）：站定在音箱堆，被光照满 `singSeconds` 即唱化。
 *
 * 唱化：被光照住且所在区热度 ≥ `balance.noise.singHeatRequired` 的常规噪音开始累计
 * `singProgress`，满 1 后由 `combat.resolveChoirWave` 结算成观众（GDD §8.1「2.5s → 1:2」）。
 * 空场（GDD §13.2）：没有观众可追，噪音失去目标，逐只渗进地板散去。
 */
export function updateNoise(run: RunState, data: DataRegistry, dt: Seconds): void {
  if (dt <= 0) return;
  const present = countPresent(run);
  const lightPoint = run.light.position;
  const stage = stageAnchorOf(data);

  for (const entity of run.noises) {
    if (!entity.active) continue;
    if (entity.state === 'dying') {
      // 倒计时与回收由 `entities.updateEntities` 统一处理（黑烟 0.5s、失真黑场 1.5s 都靠它），
      // 这里再减一次会让 GDD 锁定的时长减半，所以只跳过。
      continue;
    }
    const def = data.noise[entity.kind];
    if (!def) {
      entity.active = false;
      continue;
    }
    if (entity.kind === 'silence') {
      // Boss 不在噪音池里；误入时回收，避免它被当成普通敌人烧。
      entity.active = false;
      continue;
    }
    if (present === 0) {
      entity.state = 'dying';
      entity.remaining = Math.max(entity.remaining, 1);
      entity.velocity = { x: 0, z: 0 };
      continue;
    }

    const lit =
      distanceXZ(entity.position, lightPoint) <= run.light.radius + entity.radius;
    const zone = zoneAtPoint(data, entity.position);
    const heat = zone ? run.zones[zone].heat : 0;
    const elite = entity.kind === 'return-listener';
    // 精英不要求区热度（它在音箱堆上、没有座位）；常规噪音要求热度 ≥2（GDD §8.1）。
    const canSing = lit && (elite || heat >= data.balance.noise.singHeatRequired);
    if (canSing) {
      entity.state = 'singing';
      entity.singProgress = Math.min(1, entity.singProgress + dt / Math.max(def.singSeconds, 0.05));
      entity.velocity = { x: 0, z: 0 };
      continue;
    }

    entity.state = 'crawling';
    const speed = def.speed * bassShieldScale(run, data, entity.position);
    switch (entity.kind) {
      case 'floor-noise':
        moveFloorNoise(run, data, entity, speed * dt);
        break;
      case 'scream': {
        const hit = moveScream(run, entity, speed * dt);
        if (hit) {
          entity.state = 'dying';
          entity.remaining = SCREAM_HIT_SECONDS;
          entity.velocity = { x: 0, z: 0 };
        }
        break;
      }
      case 'distortion': {
        const reached = moveDistortion(entity, stage, speed * dt);
        if (reached) {
          entity.state = 'dying';
          entity.remaining = DISTORTION_STAGE_EXTINGUISH;
          entity.velocity = { x: 0, z: 0 };
        }
        break;
      }
      case 'return-listener':
        // 第二只返听站定在音箱堆，不移动。
        entity.velocity = { x: 0, z: 0 };
        break;
      default:
        break;
    }
  }
}

/** 底噪：爬向最近的出席座位；目标失效时用确定性步长重新挑选（无 Rng 也稳定）。 */
function moveFloorNoise(run: RunState, data: DataRegistry, entity: NoiseEntity, step: number): void {
  let seat = entity.targetSeat;
  if (seat < 0 || !isPresentCode(run.audience.state[seat] ?? 0)) {
    seat = pickTargetSeat(run, data, entity);
    entity.targetSeat = seat;
  }
  if (seat < 0) return;
  const target = seatPositionOf(data.seats, seat);
  const dx = target.x - entity.position.x;
  const dz = target.z - entity.position.z;
  const length = Math.sqrt(dx * dx + dz * dz);
  if (length <= step || length === 0) return;
  entity.position = {
    x: entity.position.x + (dx / length) * step,
    z: entity.position.z + (dz / length) * step,
  };
}

/**
 * 啸叫：沿首次更新时锁定的方向直线前进；返回是否撞到光。
 * 「命中：击退 0.4s + 光闪 0.2s」由引擎读取 `state === 'dying'` 且 `kind === 'scream'`
 * 的实体在光锥内的那 0.4s 来播放（logic 不写光状态）。
 */
function moveScream(run: RunState, entity: NoiseEntity, step: number): boolean {
  if (entity.velocity.x === 0 && entity.velocity.z === 0) {
    const dx = run.light.position.x - entity.position.x;
    const dz = run.light.position.z - entity.position.z;
    const length = Math.sqrt(dx * dx + dz * dz);
    entity.velocity = length === 0 ? { x: 1, z: 0 } : { x: dx / length, z: dz / length };
  }
  entity.position = {
    x: entity.position.x + entity.velocity.x * step,
    z: entity.position.z + entity.velocity.z * step,
  };
  const distance = distanceXZ(entity.position, run.light.position);
  return distance <= run.light.radius + entity.radius;
}

/** 失真：缓慢推向舞台；返回是否抵达舞台前沿。 */
function moveDistortion(entity: NoiseEntity, stage: Vec2, step: number): boolean {
  const dx = stage.x - entity.position.x;
  const dz = stage.z - entity.position.z;
  const length = Math.sqrt(dx * dx + dz * dz);
  if (length <= 0.5) return true;
  const travel = Math.min(step, length);
  entity.position = {
    x: entity.position.x + (dx / length) * travel,
    z: entity.position.z + (dz / length) * travel,
  };
  return length - travel <= 0.5;
}

/** 底噪目标座位：优先当前被照亮区的出席者；确定性步长（与 id 相关）避免同帧全挤一座。 */
function pickTargetSeat(run: RunState, data: DataRegistry, entity: NoiseEntity): number {
  const def = run.light.lightingZone
    ? data.zones.find((zone) => zone.id === run.light.lightingZone) ?? null
    : null;
  const rowStart = def ? def.rowRange[0] : 0;
  const rowEnd = def ? def.rowRange[1] : data.seats.rows - 1;
  const colStart = def ? def.colRange[0] : 0;
  const colEnd = def ? def.colRange[1] : data.seats.cols - 1;
  const width = colEnd - colStart + 1;
  const height = rowEnd - rowStart + 1;
  const span = width * height;
  if (span <= 0) return -1;
  const offset = (entity.id * 37) % span;
  for (let step = 0; step < span; step += 1) {
    const index = (offset + step * 7) % span;
    const row = rowStart + Math.floor(index / width);
    const col = colStart + (index % width);
    const seat = row * data.seats.cols + col;
    if (isPresentCode(run.audience.state[seat] ?? 0)) return seat;
  }
  return -1;
}

/* ==========================================================================
 * 精英「返听」
 * ========================================================================== */

/**
 * 精英返听：4s 驻光判定 → 生成并锁定 → 解除（移光 >8m 或断视线 1.5s）→ 烧/唱结算。
 *
 * 反驻守三段（GDD §11.1、tech-spec §14.1）：
 * 1) 触发：`run.light.anchorAge ≥ 4s`（6m 圆内停留）或某区 `litSeconds ≥ 5s`；
 *     Boss 阶段 3 额外强制叫一只（GDD §8.3）。
 * 2) 锁定效果（光锥半径 −30%、转化 −50%）由 light/audience 读 `state.locked` 落地；
 *    本函数每 1.5s 在光锥边缘召一只啸叫。
 * 3) 解除：光心离开音箱堆 >8m 立即解除；或光连续 1.5s 不在返听的 60° 视线内解除。
 *    解除后返听仍留在场上（HP 300），被光照满 `singSeconds` 唱化 20 人，烧死为 0。
 *
 * 召怪（第二只返听 / 锁定期间的啸叫）用 `updateSpawner` 绑定的本局对象池生成；
 * 若本帧尚未绑定池（例如单测直接调用本函数），退化为直接写入 `run.noises`——
 * 正式装配每帧先调 `updateSpawner` 即可保证走池（`entities.updateEntities` 只认 `pool.active`）。
 */
export function updateReturnListener(
  run: RunState,
  data: DataRegistry,
  dt: Seconds,
): ReturnListenerResult {
  const state = run.returnListener;
  const def: NoiseDef | undefined = data.noise['return-listener'];
  if (dt <= 0 || !def) {
    return { state, spawned: false, locked: state.locked, released: false, converted: 0 };
  }
  const ledger = ledgerFor(run);
  state.spawnCooldown = Math.max(0, state.spawnCooldown - dt);

  let spawned = false;
  let released = false;
  let converted = 0;

  // 计数：可交互槽位（state）+ 以实体形式存在的额外返听（return-listener-cap 卡）。
  const extras = countExtraListeners(run);
  state.count = (state.active ? 1 : 0) + extras;
  const cap = eliteCap(run, data);
  const camp = isCamping(run, data) || run.boss.phase === 'people';

  if (camp && state.spawnCooldown <= 0 && state.count < cap) {
    const interval = returnListenerInterval(run, data);
    if (!state.active) {
      state.active = true;
      state.anchor = nearestSpeakerStack(data, run.light.position);
      state.locked = true;
      state.lockSeconds = 0;
      state.hp = def.maxHp;
      state.maxHp = def.maxHp;
      state.spawnCooldown = interval;
      state.count += 1;
      ledger.facing = angleFrom(state.anchor, run.light.position);
      ledger.losSeconds = 0;
      ledger.singSeconds = 0;
      ledger.screamTimer = 0;
      spawned = true;
    } else if (extras < cap - 1) {
      const anchor = state.anchor;
      const stacks = speakerStacksOf(data);
      const useSecond = anchor
        ? Math.abs(stacks[0].x - anchor.x) <= Math.abs(stacks[1].x - anchor.x)
        : true;
      const spot = useSecond ? stacks[1] : stacks[0];
      if (spawnNoiseAt(run, data, 'return-listener', spot, ledger.pool)) {
        state.spawnCooldown = interval;
        state.count += 1;
        spawned = true;
      }
    }
  }

  if (state.active && state.anchor) {
    const anchor = state.anchor;
    const lightPoint = run.light.position;
    const distance = distanceXZ(lightPoint, anchor);

    if (distance > data.balance.antiCamp.releaseDistance) {
      released = state.locked;
      state.locked = false;
      state.lockSeconds = 0;
      ledger.losSeconds = 0;
    } else {
      const facing = angleFrom(anchor, lightPoint);
      const delta = Math.abs(angleDelta(facing, ledger.facing));
      if (delta <= LISTENER_SIGHT_HALF_ANGLE) {
        ledger.facing = facing;
        ledger.losSeconds = 0;
      } else {
        ledger.losSeconds += dt;
        if (ledger.losSeconds >= data.balance.antiCamp.releaseSeconds) {
          released = state.locked;
          state.locked = false;
          state.lockSeconds = 0;
          ledger.losSeconds = 0;
        }
      }
    }
    if (state.locked) state.lockSeconds += dt;

    // 锁定期间召啸叫：光锥边缘、固定角步进（无 Rng 也确定）。
    if (state.locked) {
      ledger.screamTimer += dt;
      while (ledger.screamTimer >= RETURN_LISTENER_SCREAM_INTERVAL) {
        ledger.screamTimer -= RETURN_LISTENER_SCREAM_INTERVAL;
        if (countActiveNoises(run) < data.balance.noise.cap) {
          ledger.screamPhase += 1;
          const angle = ledger.screamPhase * 2.399963;
          const radius = run.light.radius + 0.5;
          spawnNoiseAt(run, data, 'scream', {
            x: lightPoint.x + Math.cos(angle) * radius,
            z: lightPoint.z + Math.sin(angle) * radius,
          }, ledger.pool);
        }
      }
    } else {
      ledger.screamTimer = 0;
    }

    // 唱化：被光持续照住即累计；满 def.singSeconds 产出 20 人（GDD §8.2）。
    const lit = distanceXZ(lightPoint, anchor) <= run.light.radius + def.radius;
    if (lit) {
      ledger.singSeconds += dt;
      if (ledger.singSeconds >= def.singSeconds) {
        converted += returnListenerConversion(run, data);
        state.active = false;
        state.locked = false;
        state.lockSeconds = 0;
        state.hp = 0;
        state.spawnCooldown = returnListenerInterval(run, data);
        state.count = Math.max(0, state.count - 1);
        ledger.singSeconds = 0;
        ledger.screamTimer = 0;
      }
    } else {
      // 光移开：唱化进度保留（与观众两段转化的「中断保留」同口径），不清零。
      ledger.singSeconds = Math.min(ledger.singSeconds, def.singSeconds);
    }
  } else {
    ledger.singSeconds = 0;
    ledger.screamTimer = 0;
  }

  return { state, spawned, locked: state.locked, released, converted };
}

/* ==========================================================================
 * 只读查询（供 dev-engine 的 light.ts / audience.ts 消费；不修改光/观众）
 * ========================================================================== */

/**
 * 光锥当前被「失真」吞掉的比例 0..1（每只 30%，上限 60%）。
 * light.ts 用它计算有效锥长：`radius × (1 − lightEatRatio())`。
 */
export function lightEatRatio(run: RunState): Ratio {
  let eat = 0;
  for (const entity of run.noises) {
    if (!entity.active || entity.kind !== 'distortion') continue;
    if (!isInLight(run, entity.position, entity.radius)) continue;
    eat += DISTORTION_LIGHT_EAT;
  }
  return Math.min(DISTORTION_LIGHT_EAT_CAP, eat);
}

/**
 * 舞台被失真抵达后的「光灭」剩余秒数（0 表示不灭）。
 * light.ts 在 >0 期间把光强压到 0（GDD §8.1「到舞台：光灭 1.5s」）。
 */
export function stageBlackoutRemaining(run: RunState): Seconds {
  let remaining = 0;
  for (const entity of run.noises) {
    if (!entity.active || entity.kind !== 'distortion' || entity.state !== 'dying') continue;
    if (entity.remaining > remaining) remaining = entity.remaining;
  }
  return Math.min(remaining, DISTORTION_STAGE_EXTINGUISH);
}


/* ==========================================================================
 * 小工具
 * ========================================================================== */

/** 精英上限：基础 2 + 「返听诱饵」的额外 1 只（GDD §10.2）。 */
function eliteCap(run: RunState, data: DataRegistry): number {
  const bonus = Math.max(0, combatModifier(run, data, 'return-listener-cap'));
  return Math.max(1, Math.round(RETURN_LISTENER_BASE_CAP + bonus));
}

/**
 * 返听生成间隔：反驻守的 20s 节拍（GDD §8.2「每 20 秒最多 1 只」；`balance` 中唯一的 20s
 * 字段是 `antiCamp.behindSpawnInterval`，两处同为反驻守节拍，故同源），每道裂缝 −20%。
 */
function returnListenerInterval(run: RunState, data: DataRegistry): Seconds {
  const cracks = Math.max(0, run.cracks);
  const base = Math.max(1, data.balance.antiCamp.behindSpawnInterval);
  return Math.max(1, base * (1 - RETURN_LISTENER_CRACK_INTERVAL_SCALE * cracks));
}

/** 驻光判定：6m 圆内停留 ≥4s，或同区连续被照 ≥5s（GDD §8.2 / §11.1）。 */
function isCamping(run: RunState, data: DataRegistry): boolean {
  if (run.light.anchorAge >= data.balance.antiCamp.anchorSeconds) return true;
  const threshold = data.balance.antiCamp.sameZoneSeconds;
  for (const zone of data.zones) {
    if (run.zones[zone.id].litSeconds >= threshold) return true;
  }
  return false;
}

/** 场上以实体形式存在的额外返听数。 */
function countExtraListeners(run: RunState): number {
  let count = 0;
  for (const entity of run.noises) {
    if (entity.active && entity.kind === 'return-listener') count += 1;
  }
  return count;
}

/** 贝斯护盾：她所在侧翼的噪音移速 ×0.7；线断则失效（`shieldActive` 由 lines.ts 维护）。 */
function bassShieldScale(run: RunState, data: DataRegistry, point: Vec2): Ratio {
  if (!run.lines.bass.shieldActive) return 1;
  const bass = data.characters.find((character) => character.line === 'bass');
  if (!bass) return 1;
  const stage = stageAnchorOf(data);
  const bassSide = Math.sign(bass.silhouette.stagePosition.x - stage.x);
  const pointSide = Math.sign(point.x - stage.x);
  return bassSide !== 0 && bassSide === pointSide ? BASS_SHIELD_SPEED_SCALE : 1;
}

/** 出席人数（state 1/2/3）；空场判定用。 */
function countPresent(run: RunState): number {
  let count = 0;
  const state = run.audience.state;
  for (let seat = 0; seat < state.length; seat += 1) {
    if (isPresentCode(state[seat] ?? 0)) count += 1;
  }
  return count;
}

/** 0=空座未出席，1=灰，2=彩，3=黑，4=已离场。 */
function isPresentCode(code: number): boolean {
  return code === 1 || code === 2 || code === 3;
}

/** 点是否在光锥内（含实体半径）。 */
function isInLight(run: RunState, point: Vec2, radius: number): boolean {
  return distanceXZ(point, run.light.position) <= run.light.radius + radius;
}

function distanceXZ(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function angleFrom(from: Vec2, to: Vec2): number {
  return Math.atan2(to.z - from.z, to.x - from.x);
}

/** 角度差归一化到 (−π, π]。 */
function angleDelta(a: number, b: number): number {
  let delta = a - b;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  return delta;
}
