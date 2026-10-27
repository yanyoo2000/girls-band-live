/**
 * tech-spec §11 #15：实体容器与对象池。
 *
 * 必测：池化复用、id 稳定、dying 回收、容量上限不越界。
 */
import { describe, expect, it } from 'vitest';
import { buildDataRegistry } from '../src/data';
import { createEntityWorld, updateEntities } from '../src/game/entities';
import type { NoiseEntity, RunState } from '../src/types/game';

const data = buildDataRegistry();

/** 测试用最小 RunState：`updateEntities` 只读 `audience.size`。 */
function makeRun(audienceSize = 768): RunState {
  return { audience: { size: audienceSize } } as unknown as RunState;
}

function makeWorld(capacity = 4) {
  return createEntityWorld(data, capacity);
}

describe('createEntityWorld', () => {
  it('应惰性分配实体且容量与参数一致', () => {
    const world = makeWorld(3);
    expect(world.capacity).toBe(3);
    expect(world.activeCount()).toBe(0);
    expect(world.noises).toEqual([]);
  });

  it('应在容量上限后拒绝继续 acquire（不越界扩容）', () => {
    const world = makeWorld(2);
    world.pool.acquire();
    world.pool.acquire();
    expect(world.activeCount()).toBe(2);
    expect(() => world.pool.acquire()).toThrow(RangeError);
  });

  it('应让 id 单调递增且在池化复用时保持不变', () => {
    const world = makeWorld(2);
    const first = world.pool.acquire();
    const second = world.pool.acquire();
    expect(first.id).toBe(1);
    expect(second.id).toBe(2);

    world.pool.release(first);
    const reused = world.pool.acquire();
    expect(reused).toBe(first);
    expect(reused.id).toBe(1);
  });

  it('应在 reset 后清空活跃实体但保留池内存', () => {
    const world = makeWorld(2);
    world.pool.acquire();
    world.pool.acquire();
    updateEntities(world, makeRun(), 1 / 60);
    expect(world.noises).toHaveLength(2);
    world.reset();
    expect(world.activeCount()).toBe(0);
    expect(world.noises).toHaveLength(0);
    // 池仍可用，且复用同一个对象（不再新建）。
    const acquired = world.pool.acquire();
    expect(acquired.id).toBeLessThan(3);
  });
});

describe('updateEntities', () => {
  it('应用 pool.active 重建 noises（同序）', () => {
    const world = makeWorld(3);
    const a = world.pool.acquire();
    const b = world.pool.acquire();
    updateEntities(world, makeRun(), 1 / 60);
    expect(world.noises).toEqual([a, b]);
  });

  it('应在 dying 计时结束后回收实体并调用 reset', () => {
    const world = makeWorld(2);
    const entity = world.pool.acquire();
    entity.state = 'dying';
    entity.remaining = 0.05;
    updateEntities(world, makeRun(), 1 / 60);
    expect(world.activeCount()).toBe(1);
    updateEntities(world, makeRun(), 0.1);
    expect(world.activeCount()).toBe(0);
    expect(world.noises).toHaveLength(0);
    expect(entity.active).toBe(false);
  });

  it('应回收越出世界边界的实体（防御性清场）', () => {
    const world = makeWorld(2);
    const entity = world.pool.acquire();
    entity.position = { x: 81, z: 0 };
    updateEntities(world, makeRun(), 1 / 60);
    expect(world.activeCount()).toBe(0);
  });

  it('应回收 active=false 的实体', () => {
    const world = makeWorld(2);
    const entity = world.pool.acquire();
    entity.active = false;
    updateEntities(world, makeRun(), 1 / 60);
    expect(world.activeCount()).toBe(0);
  });

  it('应把 singProgress 夹在 0..1，并清空越界 targetSeat', () => {
    const world = makeWorld(2);
    const entity: NoiseEntity = world.pool.acquire();
    entity.singProgress = 1.7;
    entity.targetSeat = 9999;
    updateEntities(world, makeRun(768), 1 / 60);
    expect(entity.singProgress).toBe(1);
    expect(entity.targetSeat).toBe(-1);

    entity.singProgress = -0.4;
    entity.targetSeat = 12;
    updateEntities(world, makeRun(768), 1 / 60);
    expect(entity.singProgress).toBe(0);
    expect(entity.targetSeat).toBe(12);
  });

  it('应在 byId 中按 id 找到实体、找不到返回 null', () => {
    const world = makeWorld(2);
    const entity = world.pool.acquire();
    updateEntities(world, makeRun(), 1 / 60);
    expect(world.byId(entity.id)).toBe(entity);
    expect(world.byId(999)).toBeNull();
  });
});
