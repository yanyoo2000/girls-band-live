/**
 * tech-spec §11 #3：碰撞与空间网格。
 *
 * 必测：网格查询与暴力解一致（200 随机圆）；边界接触。
 */
import { describe, expect, it } from 'vitest';
import {
  circlesOverlap,
  createSpatialGrid,
  distancePointToSegment,
  hashCell,
} from '../src/game/collision';
import { createRng } from '../src/game/rng';
import type { Circle } from '../src/types/game';

describe('circlesOverlap', () => {
  it('应在相切（圆心距 = 半径和）时判定相交', () => {
    const a: Circle = { center: { x: 0, z: 0 }, radius: 1 };
    const b: Circle = { center: { x: 2, z: 0 }, radius: 1 };
    expect(circlesOverlap(a, b)).toBe(true);
  });

  it('应在圆心距略大于半径和时判定不相交', () => {
    const a: Circle = { center: { x: 0, z: 0 }, radius: 1 };
    const b: Circle = { center: { x: 2.0001, z: 0 }, radius: 1 };
    expect(circlesOverlap(a, b)).toBe(false);
  });

  it('应对负半径判定不相交（非法输入不误报）', () => {
    const a: Circle = { center: { x: 0, z: 0 }, radius: -3 };
    const b: Circle = { center: { x: 0, z: 0 }, radius: 1 };
    expect(circlesOverlap(a, b)).toBe(false);
  });
});

describe('distancePointToSegment', () => {
  it('应返回点到线段的垂直距离', () => {
    const distance = distancePointToSegment({ x: 0, z: 3 }, { x: -2, z: 0 }, { x: 2, z: 0 });
    expect(distance).toBeCloseTo(3, 6);
  });

  it('应在投影落在端点外时取端点距离', () => {
    expect(distancePointToSegment({ x: 5, z: 0 }, { x: 0, z: 0 }, { x: 2, z: 0 })).toBeCloseTo(3, 6);
    expect(distancePointToSegment({ x: -5, z: 0 }, { x: 0, z: 0 }, { x: 2, z: 0 })).toBeCloseTo(5, 6);
  });

  it('应在 from 与 to 重合时退化为点距', () => {
    expect(distancePointToSegment({ x: 3, z: 4 }, { x: 0, z: 0 }, { x: 0, z: 0 })).toBeCloseTo(5, 6);
  });
});

describe('hashCell', () => {
  it('应把结果限制在 mask 内且对同一格稳定', () => {
    const mask = 63;
    expect(hashCell(3, -7, mask)).toBe(hashCell(3, -7, mask));
    for (const [x, z] of [
      [0, 0],
      [100, -100],
      [-3, 250],
    ] as const) {
      const hash = hashCell(x, z, mask);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThanOrEqual(mask);
    }
  });
});

describe('createSpatialGrid', () => {
  it('应对非法 cellSize / capacity 抛 RangeError', () => {
    expect(() => createSpatialGrid(0, 10)).toThrow(RangeError);
    expect(() => createSpatialGrid(Number.NaN, 10)).toThrow(RangeError);
    expect(() => createSpatialGrid(2, 0)).toThrow(RangeError);
  });

  it('应在 200 个随机圆上与暴力解完全一致', () => {
    const rng = createRng(0x5eed);
    const grid = createSpatialGrid(4, 256);
    const circles: { id: number; circle: Circle }[] = [];

    for (let i = 0; i < 200; i += 1) {
      const circle: Circle = {
        center: { x: rng.range(-40, 40), z: rng.range(-40, 40) },
        radius: rng.range(0.2, 1.4),
      };
      circles.push({ id: i, circle });
      grid.insert(i, circle);
    }

    const out = new Int32Array(256);
    for (let probeIndex = 0; probeIndex < 200; probeIndex += 1) {
      const probe: Circle = {
        center: { x: rng.range(-40, 40), z: rng.range(-40, 40) },
        radius: rng.range(0.2, 3),
      };
      const expected = circles
        .filter(({ circle }) => circlesOverlap(probe, circle))
        .map(({ id }) => id)
        .sort((a, b) => a - b);

      const hits = grid.query(probe, out);
      const actual = Array.from(out.subarray(0, Math.min(hits, out.length))).sort((a, b) => a - b);
      expect(hits).toBe(expected.length);
      expect(actual).toEqual(expected);
    }
  });

  it('应在同一 id 重复 insert 时更新位置而非重复计数', () => {
    const grid = createSpatialGrid(4, 16);
    grid.insert(7, { center: { x: 0, z: 0 }, radius: 1 });
    grid.insert(7, { center: { x: 20, z: 20 }, radius: 1 });

    const out = new Int32Array(8);
    expect(grid.query({ center: { x: 0, z: 0 }, radius: 0.5 }, out)).toBe(0);
    const hits = grid.query({ center: { x: 20, z: 20 }, radius: 0.5 }, out);
    expect(hits).toBe(1);
    expect(out[0]).toBe(7);
  });

  it('应在容量上限时丢弃新 insert 而不越界', () => {
    const grid = createSpatialGrid(8, 3);
    for (let i = 0; i < 10; i += 1) {
      grid.insert(i, { center: { x: i * 0.1, z: 0 }, radius: 0.4 });
    }
    const out = new Int32Array(32);
    const hits = grid.query({ center: { x: 0, z: 0 }, radius: 50 }, out);
    expect(hits).toBe(3);
    expect(Array.from(out.subarray(0, hits)).sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it('应在 clear 后清空全部查询结果', () => {
    const grid = createSpatialGrid(4, 16);
    grid.insert(1, { center: { x: 0, z: 0 }, radius: 1 });
    grid.clear();
    const out = new Int32Array(4);
    expect(grid.query({ center: { x: 0, z: 0 }, radius: 5 }, out)).toBe(0);
    // clear 后仍可继续 insert。
    grid.insert(2, { center: { x: 0, z: 0 }, radius: 1 });
    expect(grid.query({ center: { x: 0, z: 0 }, radius: 5 }, out)).toBe(1);
  });

  it('应支持负数坐标的格坐标（floor 而非截断）', () => {
    const grid = createSpatialGrid(4, 16);
    grid.insert(9, { center: { x: -0.5, z: -0.5 }, radius: 1 });
    const out = new Int32Array(4);
    const hits = grid.query({ center: { x: -0.5, z: -0.5 }, radius: 0.1 }, out);
    expect(hits).toBe(1);
    expect(out[0]).toBe(9);
  });
});
