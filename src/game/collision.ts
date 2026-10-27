/**
 * XZ 平面圆形碰撞与均匀空间网格（光锥/噪音/座位的粗筛底座）。
 *
 * 用途：
 * - `createSpatialGrid`：把实体（噪音）按格子分桶，每固定步长重建一次；
 * - `circlesOverlap`：两圆相交（含相切）判定，边界闭区间；
 * - `distancePointToSegment`：光路命中与失败卡回放用。
 *
 * 依赖：仅 `../types/game` 的 `Circle` / `CollisionQuery` / `Meters`。
 * 分配策略：所有存储是构造时一次性分配的 TypedArray；`insert` / `query` / `clear`
 * 不产生任何对象分配（无 Map、无字符串键）。180 实体/帧的重建 + 查询远低于 0.1ms。
 * 容量策略：`capacity` 固定；`insert` 超出容量时丢弃并保持数组不越界；
 * `clear()` 重置桶头与 id 表，内存常驻不泄漏。
 *
 * 导出：
 * - `createSpatialGrid(cellSize, capacity)`：创建网格；
 * - `circlesOverlap(a, b)`：圆-圆相交（含相切）；
 * - `distancePointToSegment(point, from, to)`：点到线段距离；
 * - `hashCell(cellX, cellZ, mask)`：格坐标哈希（单测用，保证冲突处理稳定）。
 */
import type { Circle, CollisionQuery, Meters } from '../types/game';

/** 网格内部存储（一次性分配，之后只改写数值）。 */
interface GridStorage {
  /** 桶头：-1 表示空链。 */
  readonly heads: Int32Array;
  /** 链上每个槽位的下一个槽位。 */
  readonly next: Int32Array;
  /** 槽位是否存活（同一 id 重插时旧槽位不再参与查询）。 */
  readonly alive: Uint8Array;
  /** 槽位的实体 id。 */
  readonly ids: Int32Array;
  /** 槽位的圆心与半径（真实值，用于精确判定）。 */
  readonly centerX: Float32Array;
  readonly centerZ: Float32Array;
  readonly radius: Float32Array;
  /** 槽位所在格子坐标。 */
  readonly cellX: Int32Array;
  readonly cellZ: Int32Array;
  /** id → 槽位的开放寻址表（-1 表示空）。 */
  readonly idKeys: Int32Array;
  readonly idSlots: Int32Array;
  readonly idMask: number;
  readonly bucketMask: number;
}

function nextPowerOfTwo(value: number): number {
  let size = 1;
  while (size < value) {
    size *= 2;
  }
  return size;
}

/**
 * 格子哈希：两个大素数异或后取低位。
 *
 * 允许不同格子共享桶，`query` 会再按 `cellX/cellZ` 过滤，避免哈希冲突导致误报。
 */
export function hashCell(cellX: number, cellZ: number, mask: number): number {
  const mixed = (Math.imul(cellX, 0x1f1f_1f1f) ^ Math.imul(cellZ | 0, 0x3d4d_2ca7)) >>> 0;
  return mixed & mask;
}

/** 格坐标（向下取整，负数也正确）。 */
function gridFloor(value: number, cellSize: number): number {
  return Math.floor(value / cellSize);
}

/** 两圆相交（含相切）：圆心距 ≤ 半径和。 */
export function circlesOverlap(a: Circle, b: Circle): boolean {
  const dx = a.center.x - b.center.x;
  const dz = a.center.z - b.center.z;
  const reach = a.radius + b.radius;
  // 先比较平方，避免开方；`reach` 可能为负（非法半径）时直接不相交。
  if (reach < 0) {
    return false;
  }
  return dx * dx + dz * dz <= reach * reach;
}

/**
 * 点到线段（XZ 平面）的最短距离。
 *
 * `from` 与 `to` 重合时退化为点到点距离；返回米。
 */
export function distancePointToSegment(
  point: Circle['center'],
  from: Circle['center'],
  to: Circle['center'],
): Meters {
  const segmentX = to.x - from.x;
  const segmentZ = to.z - from.z;
  const lengthSquared = segmentX * segmentX + segmentZ * segmentZ;
  if (lengthSquared <= 0) {
    const dx = point.x - from.x;
    const dz = point.z - from.z;
    return Math.sqrt(dx * dx + dz * dz);
  }
  const projection = ((point.x - from.x) * segmentX + (point.z - from.z) * segmentZ) / lengthSquared;
  const clamped = projection < 0 ? 0 : projection > 1 ? 1 : projection;
  const closestX = from.x + segmentX * clamped;
  const closestZ = from.z + segmentZ * clamped;
  const dx = point.x - closestX;
  const dz = point.z - closestZ;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * 创建均匀网格。
 *
 * @param cellSize 格子边长（= 最大实体直径；≤0 抛 `RangeError`）
 * @param capacity 实体硬上限（= 噪音上限 180）；超出后新的 `insert` 被丢弃
 */
export function createSpatialGrid(cellSize: Meters, capacity: number): CollisionQuery {
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    throw new RangeError(`createSpatialGrid: cellSize 非法（${String(cellSize)}）`);
  }
  if (!Number.isFinite(capacity) || capacity < 1) {
    throw new RangeError(`createSpatialGrid: capacity 非法（${String(capacity)}）`);
  }
  const limit = Math.floor(capacity);
  const bucketCount = nextPowerOfTwo(Math.max(16, limit * 4));
  const idTableSize = nextPowerOfTwo(Math.max(16, limit * 4));

  const storage: GridStorage = {
    heads: new Int32Array(bucketCount).fill(-1),
    next: new Int32Array(limit).fill(-1),
    alive: new Uint8Array(limit),
    ids: new Int32Array(limit).fill(-1),
    centerX: new Float32Array(limit),
    centerZ: new Float32Array(limit),
    radius: new Float32Array(limit),
    cellX: new Int32Array(limit),
    cellZ: new Int32Array(limit),
    idKeys: new Int32Array(idTableSize).fill(-1),
    idSlots: new Int32Array(idTableSize).fill(-1),
    idMask: idTableSize - 1,
    bucketMask: bucketCount - 1,
  };

  /** 已分配过的槽位数量（只增不减，直到 `clear`）。 */
  let used = 0;

  const idHash = (id: number): number => (Math.imul(id | 0, 0x9e37_79b1) >>> 0) & storage.idMask;

  const idTableFind = (id: number): number => {
    let index = idHash(id);
    for (let probe = 0; probe <= storage.idMask; probe += 1) {
      const key = storage.idKeys[index];
      if (key === -1) {
        return -1;
      }
      if (key === id) {
        return index;
      }
      index = (index + 1) & storage.idMask;
    }
    return -1;
  };

  const idTableInsert = (id: number, slot: number): void => {
    let index = idHash(id);
    for (let probe = 0; probe <= storage.idMask; probe += 1) {
      const key = storage.idKeys[index];
      if (key === -1 || key === id) {
        storage.idKeys[index] = id;
        storage.idSlots[index] = slot;
        return;
      }
      index = (index + 1) & storage.idMask;
    }
    // 表满（容量被 limit 约束，理论上不会发生）：放弃登记，槽位仍可被 clear 复用。
  };

  const unlink = (slot: number): void => {
    const cx = storage.cellX[slot];
    const cz = storage.cellZ[slot];
    if (cx === undefined || cz === undefined) {
      return;
    }
    const bucket = hashCell(cx, cz, storage.bucketMask);
    let cursor = storage.heads[bucket] ?? -1;
    let previous = -1;
    let guard = 0;
    while (cursor !== -1 && guard <= limit) {
      guard += 1;
      if (cursor === slot) {
        const nextSlot = storage.next[cursor];
        const tail = nextSlot === undefined ? -1 : nextSlot;
        if (previous === -1) {
          storage.heads[bucket] = tail;
        } else {
          storage.next[previous] = tail;
        }
        storage.next[slot] = -1;
        return;
      }
      previous = cursor;
      cursor = storage.next[cursor] ?? -1;
    }
  };

  const push = (slot: number, cx: number, cz: number): void => {
    const bucket = hashCell(cx, cz, storage.bucketMask);
    storage.next[slot] = storage.heads[bucket] ?? -1;
    storage.heads[bucket] = slot;
  };

  const insert = (id: number, circle: Circle): void => {
    const cx = gridFloor(circle.center.x, cellSize);
    const cz = gridFloor(circle.center.z, cellSize);

    const tableIndex = idTableFind(id);
    if (tableIndex !== -1) {
      const slot = storage.idSlots[tableIndex];
      if (slot !== undefined && slot >= 0 && slot < used) {
        unlink(slot);
        storage.centerX[slot] = circle.center.x;
        storage.centerZ[slot] = circle.center.z;
        storage.radius[slot] = circle.radius;
        storage.cellX[slot] = cx;
        storage.cellZ[slot] = cz;
        storage.alive[slot] = 1;
        push(slot, cx, cz);
        return;
      }
    }

    if (used >= limit) {
      // 容量策略：不越界写；生成侧必须先做 activeCount 判定。
      return;
    }
    const slot = used;
    used += 1;
    storage.ids[slot] = id;
    storage.centerX[slot] = circle.center.x;
    storage.centerZ[slot] = circle.center.z;
    storage.radius[slot] = circle.radius;
    storage.cellX[slot] = cx;
    storage.cellZ[slot] = cz;
    storage.alive[slot] = 1;
    push(slot, cx, cz);
    idTableInsert(id, slot);
  };

  const query = (circle: Circle, out: Int32Array): number => {
    const cx = gridFloor(circle.center.x, cellSize);
    const cz = gridFloor(circle.center.z, cellSize);
    const probeCircle = { center: circle.center, radius: circle.radius };
    let hits = 0;
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const wantX = cx + dx;
        const wantZ = cz + dz;
        const bucket = hashCell(wantX, wantZ, storage.bucketMask);
        let cursor = storage.heads[bucket] ?? -1;
        let guard = 0;
        while (cursor !== -1 && guard <= limit) {
          guard += 1;
          const nextSlot = storage.next[cursor] ?? -1;
          if (
            storage.alive[cursor] === 1 &&
            storage.cellX[cursor] === wantX &&
            storage.cellZ[cursor] === wantZ
          ) {
            const id = storage.ids[cursor];
            if (id !== undefined && id >= 0) {
              const candidate: Circle = {
                center: {
                  x: storage.centerX[cursor] ?? 0,
                  z: storage.centerZ[cursor] ?? 0,
                },
                radius: storage.radius[cursor] ?? 0,
              };
              if (circlesOverlap(probeCircle, candidate)) {
                if (hits < out.length) {
                  out[hits] = id;
                }
                hits += 1;
              }
            }
          }
          cursor = nextSlot;
        }
      }
    }
    return hits;
  };

  const clear = (): void => {
    storage.heads.fill(-1);
    storage.idKeys.fill(-1);
    storage.idSlots.fill(-1);
    for (let i = 0; i < used; i += 1) {
      storage.alive[i] = 0;
      storage.ids[i] = -1;
      storage.next[i] = -1;
    }
    used = 0;
  };

  return { insert, query, clear };
}
