/**
 * 实体容器：噪音对象池 + 精英/Boss 槽位（渲染与碰撞的唯一数据来源）。
 *
 * 用途：噪音实体上限 180（低画质不改变逻辑容量），生成/销毁全部走对象池，
 * id 单调递增且池化复用时保持不变（`byId` 与事件引用稳定）。
 *
 * 依赖：`../types/game`（NoiseEntity / Pool / RunState / Seconds）、
 * `../types/data`（DataRegistry 的 noise 表）、`./pool`（固定容量对象池）。
 * 分配策略：一局最多创建 180 个实体对象；之后全部复用，不再分配。
 * 清理策略：`dying` 结束或越出世界边界（±80m，防御性）即归还池；
 * `reset()` 在重开一局时归还全部活跃实体但保留池内存。
 *
 * 活跃表一致性（与 `enemies.updateSpawner` 的契约）：`world.noises` 就是
 * `RunState.noises` 的同一个数组引用；刷怪走池化入口 `updateSpawner`，实体由
 * `pool.acquire()` 产生。`updateEntities` 每个固定步长开头用 `pool.active` 重建
 * `world.noises`（同序、零分配、≤180 次 push），因此池是实体的唯一真源。
 * 若某个生成路径绕过池直接写 `run.noises`，会在下一拍被重建覆盖——正式装配下
 * `updateReturnListener` 也走 `context.pool`，不存在绕过路径。
 *
 * 导出：
 * - `EntityWorld`：容器接口；
 * - `createEntityWorld(data, capacity)`；
 * - `updateEntities(world, run, dt)`。
 */
import type { NoiseEntity, Pool, RunState, Seconds } from '../types/game';
import type { DataRegistry } from '../types/data';
import { createPool } from './pool';

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

/** 世界边界（米）：超出即视为已离场，回收防止泄漏。 */
const WORLD_BOUND = 80;

/** 创建实体世界（容量 = GDD 噪音上限 180；低画质不改变逻辑容量）。 */
export function createEntityWorld(data: DataRegistry, capacity: number): EntityWorld {
  const baseDef = data.noise['floor-noise'];
  /** 活跃实体（与 `pool.active` 同序，由 `updateEntities` 每步长对齐）。 */
  const noises: NoiseEntity[] = [];
  let nextId = 1;

  const factory = (): NoiseEntity => {
    const id = nextId;
    nextId += 1;
    return {
      id,
      kind: 'floor-noise',
      active: true,
      position: { x: 0, z: 0 },
      velocity: { x: 0, z: 0 },
      radius: baseDef.radius,
      hp: baseDef.maxHp,
      maxHp: baseDef.maxHp,
      state: 'crawling',
      targetSeat: -1,
      singProgress: 0,
      remaining: 0,
    };
  };

  const resetEntity = (entity: NoiseEntity): void => {
    entity.active = false;
    entity.kind = 'floor-noise';
    entity.position = { x: 0, z: 0 };
    entity.velocity = { x: 0, z: 0 };
    entity.radius = baseDef.radius;
    entity.hp = 0;
    entity.maxHp = baseDef.maxHp;
    entity.state = 'crawling';
    entity.targetSeat = -1;
    entity.singProgress = 0;
    entity.remaining = 0;
  };

  const pool = createPool<NoiseEntity>(factory, capacity, resetEntity);

  const byId = (id: number): NoiseEntity | null => {
    for (let i = 0; i < noises.length; i += 1) {
      const entity = noises[i];
      if (entity !== undefined && entity.id === id) {
        return entity;
      }
    }
    return null;
  };

  const reset = (): void => {
    // 先把池归还，再清空活跃表（两个数组保持同步）。
    for (let i = pool.active.length - 1; i >= 0; i -= 1) {
      const entity = pool.active[i];
      if (entity !== undefined) {
        pool.release(entity);
      }
    }
    noises.length = 0;
  };

  return {
    noises,
    pool,
    capacity,
    byId,
    activeCount: () => pool.active.length,
    reset,
  };
}

/**
 * 推进实体计时与回收（`dying` 结束或越界即归还池）。
 *
 * 不负责 AI 移动与伤害结算（见 `enemies.ts` / `combat.ts`）。
 */
export function updateEntities(world: EntityWorld, run: RunState, dt: Seconds): void {
  // 1) 用池的活跃表重建 `world.noises`（同序、零分配）。池是实体的唯一真源。
  const active = world.pool.active;
  const noises = world.noises;
  noises.length = 0;
  for (let i = 0; i < active.length; i += 1) {
    const pooled = active[i];
    if (pooled !== undefined) {
      noises.push(pooled);
    }
  }

  // 2) 逆序遍历：dying 结束、越界、非活跃都移除并归还池。
  for (let i = noises.length - 1; i >= 0; i -= 1) {
    const entity = noises[i];
    if (entity === undefined) {
      continue;
    }
    const outOfBounds =
      Math.abs(entity.position.x) > WORLD_BOUND || Math.abs(entity.position.z) > WORLD_BOUND;

    if (entity.state === 'dying') {
      entity.remaining -= dt;
      if (entity.remaining <= 0 || outOfBounds) {
        noises.splice(i, 1);
        world.pool.release(entity);
      }
      continue;
    }

    if (!entity.active || outOfBounds) {
      noises.splice(i, 1);
      world.pool.release(entity);
      continue;
    }

    // 唱化进度由 enemies 写入；这里只保证它落在 0..1（渲染层直接读）。
    if (entity.singProgress < 0) {
      entity.singProgress = 0;
    } else if (entity.singProgress > 1) {
      entity.singProgress = 1;
    }

    // 目标座位越界时清空，避免下游读到无效索引。
    if (entity.targetSeat >= run.audience.size) {
      entity.targetSeat = -1;
    }
  }
}
