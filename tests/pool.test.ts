/**
 * tech-spec §11 #4：固定容量对象池。
 *
 * 必测：复用、容量上限、reset 调用。
 * 注意：`Pool.acquire()` 契约返回 `T`，容量满时抛 `RangeError`（见 `src/game/pool.ts` 注释）。
 */
import { describe, expect, it } from 'vitest';
import { createPool } from '../src/game/pool';

interface Particle {
  id: number;
  alive: boolean;
}

describe('createPool', () => {
  it('应惰性创建对象并在归还后复用同一实例', () => {
    let created = 0;
    const reset: Particle[] = [];
    const pool = createPool<Particle>(
      () => {
        created += 1;
        return { id: created, alive: true };
      },
      3,
      (item) => {
        reset.push(item);
        item.alive = false;
      },
    );

    expect(created).toBe(0);
    const first = pool.acquire();
    expect(created).toBe(1);
    expect(first.alive).toBe(true);

    pool.release(first);
    expect(reset).toHaveLength(1);
    expect(first.alive).toBe(false);

    const second = pool.acquire();
    expect(second).toBe(first);
    expect(created).toBe(1);
    expect(pool.active).toEqual([second]);
  });

  it('应在容量上限时抛 RangeError 而不是静默扩容', () => {
    let created = 0;
    const pool = createPool<{ n: number }>(
      () => {
        created += 1;
        return { n: created };
      },
      2,
      () => {},
    );

    pool.acquire();
    pool.acquire();
    expect(pool.active).toHaveLength(2);
    expect(() => pool.acquire()).toThrow(RangeError);
    expect(created).toBe(2);
    expect(pool.capacity).toBe(2);
  });

  it('应在归还后重新腾出容量', () => {
    const pool = createPool<{ n: number }>(() => ({ n: 0 }), 1, () => {});
    const a = pool.acquire();
    expect(() => pool.acquire()).toThrow(RangeError);
    pool.release(a);
    expect(() => pool.acquire()).not.toThrow();
  });

  it('应忽略重复归还且不破坏活跃表', () => {
    const resetCalls: number[] = [];
    const pool = createPool<{ id: number }>(() => ({ id: resetCalls.length }), 2, (item) =>
      resetCalls.push(item.id),
    );
    const a = pool.acquire();
    const b = pool.acquire();
    pool.release(a);
    pool.release(a);
    expect(resetCalls).toEqual([0]);
    expect(pool.active).toEqual([b]);
  });

  it('应保持活跃表顺序稳定（splice 不移位其它元素）', () => {
    const pool = createPool<{ id: number }>(() => ({ id: 0 }), 4, () => {});
    const items = [pool.acquire(), pool.acquire(), pool.acquire()];
    const middle = items[1];
    if (middle === undefined) throw new Error('pool.acquire 返回不足');
    pool.release(middle);
    expect(pool.active).toEqual([items[0], items[2]]);
  });

  it('应对非法容量抛 RangeError', () => {
    expect(() => createPool(() => ({}), Number.NaN, () => {})).toThrow(RangeError);
    expect(() => createPool(() => ({}), -1, () => {})).toThrow(RangeError);
  });

  it('应支持容量 0（acquire 立即抛错）', () => {
    const pool = createPool(() => ({}), 0, () => {});
    expect(pool.capacity).toBe(0);
    expect(() => pool.acquire()).toThrow(RangeError);
  });
});
