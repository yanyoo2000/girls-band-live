/**
 * 固定容量对象池（噪音实体复用的底座）。
 *
 * 用途：一局内噪音实体上限 180（低画质 90 只影响渲染，逻辑容量不变）。
 * 每帧生成/销毁实体时不做 `new`/`Array` 分配，`acquire` 只从空闲表取，
 * 池满时由调用方先看 `active` 长度再决定丢弃（不静默扩容，避免越界）。
 *
 * 依赖：仅 `../types/game` 的 `Pool` 类型。
 * 容量策略：预先不创建对象；`factory` 最多调用 `capacity` 次；
 * 归还时调用 `reset` 清洗字段，`active` 顺序稳定（渲染层按顺序读）。
 *
 * 约定：`Pool<T>.acquire()` 的契约返回 `T`，因此容量满时抛 `RangeError`
 * （见任务报告「与 tech-spec 的偏差」第 3 条：注释写“返回 null”与类型契约冲突）。
 * 调用方必须先用 `active.length < capacity` 判定。
 *
 * 导出：`createPool(factory, capacity, reset)`。
 */
import type { Pool } from '../types/game';

/**
 * 创建固定容量对象池。
 *
 * @param factory 创建新对象（只在池未满且无空闲对象时调用）
 * @param capacity 硬上限（同时活跃对象的最大数量）
 * @param reset 归还时的清洗函数（必须把对象恢复成可复用状态）
 */
export function createPool<T>(factory: () => T, capacity: number, reset: (item: T) => void): Pool<T> {
  if (!Number.isFinite(capacity) || capacity < 0) {
    throw new RangeError(`createPool: capacity 非法（${String(capacity)}）`);
  }
  const limit = Math.floor(capacity);
  /** 已创建的对象总数（含活跃与空闲），不超过 limit。 */
  let created = 0;
  /** 空闲表（LIFO，热点复用同一批对象，缓存友好）。 */
  const free: T[] = [];
  /** 活跃表（顺序稳定）。 */
  const active: T[] = [];

  const acquire = (): T => {
    const reused = free.pop();
    if (reused !== undefined) {
      active.push(reused);
      return reused;
    }
    if (created >= limit) {
      throw new RangeError(`createPool: 池已满（capacity=${limit}），调用方必须先判容量`);
    }
    created += 1;
    const item = factory();
    active.push(item);
    return item;
  };

  const release = (item: T): void => {
    const index = active.indexOf(item);
    if (index < 0) {
      // 重复归还属于调用方 bug；不抛错以免打断 tick，直接忽略。
      return;
    }
    // `splice` 保持活跃表的原始顺序（契约要求 `active` 顺序稳定，渲染层按索引读）。
    active.splice(index, 1);
    reset(item);
    free.push(item);
  };

  return {
    acquire,
    release,
    active,
    capacity: limit,
  };
}
