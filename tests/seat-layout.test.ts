/**
 * 座位坐标唯一真源回归测试（t103）。
 *
 * 覆盖：
 * 1. 768 席正反向 round-trip（data/seats 的 seatPositionAt / seatPositionOf / seatAtPoint）；
 * 2. 576 席（排 ≥ aisleRow 或列 ≥ aisleCol）精确位移 0.7m；
 * 3. 网格 x 中心 = 0（镜像后），z 跨度 = (rows−1)×0.9 + 0.7 = 21.4；
 * 4. 方向断言：front-left 在屏幕左/前（screenX = −x，screenY = z）；
 * 5. 走道两侧 zone 归属（game/audience 与 game/waves 两个入口一致）；
 * 6. 光覆盖跨走道命中正确座位（light.queryLitSeats）；
 * 7. `src/game/**`、`src/three/**` 不再出现 gap/fallback 字面量（唯一真源静态检查）。
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildDataRegistry } from '../src/data';
import {
  SEATS,
  nearestSeatColumn,
  nearestSeatRow,
  seatAtPoint,
  seatGridCenterX,
  seatPositionAt,
  seatPositionOf,
} from '../src/data/seats';
import { zoneAtPoint } from '../src/game/audience';
import { speakerStacksOf, stageAnchorOf, zoneAtPoint as wavesZoneAtPoint, zoneCenterOf } from '../src/game/waves';
import { queryLitSeats } from '../src/game/light';
import type { RunState, ZoneId } from '../src/types/game';
import type { DataRegistry } from '../src/types/data';

const data: DataRegistry = buildDataRegistry();
const grid = data.seats;

/** 屏幕坐标约定：相机在舞台后方朝 +z 看，screenX = −worldX，screenY = worldZ。 */
function screenX(worldX: number): number {
  return -worldX;
}
function screenY(worldZ: number): number {
  return worldZ;
}

describe('座位网格常量', () => {
  it('应有 24×32=768 席，走道边界 16/12，gap 0.7', () => {
    expect(grid.rows).toBe(24);
    expect(grid.cols).toBe(32);
    expect(grid.capacity).toBe(768);
    expect(grid.aisleCol).toBe(16);
    expect(grid.aisleRow).toBe(12);
    expect(grid.aisleGap).toBeCloseTo(0.7, 12);
    expect(SEATS.capacity).toBe(768);
  });

  it('网格 x 中心应为 0，z 起点 5.2、终点 26.6', () => {
    expect(seatGridCenterX(grid)).toBeCloseTo(0, 9);
    expect(seatPositionAt(grid, 0, 0).x).toBeCloseTo(9.96, 6);
    expect(seatPositionAt(grid, 0, grid.cols - 1).x).toBeCloseTo(-9.96, 6);
    expect(seatPositionAt(grid, 0, 0).z).toBeCloseTo(5.2, 6);
    expect(seatPositionAt(grid, grid.rows - 1, 0).z).toBeCloseTo(26.6, 6);
  });
});

describe('768 席正反向 round-trip', () => {
  it('每个座位索引的坐标与行/列一致，且能被 seatAtPoint 反查回自身', () => {
    let checked = 0;
    for (let row = 0; row < grid.rows; row += 1) {
      for (let col = 0; col < grid.cols; col += 1) {
        const seat = row * grid.cols + col;
        const at = seatPositionAt(grid, row, col);
        const of = seatPositionOf(grid, seat);
        expect(of.x).toBeCloseTo(at.x, 10);
        expect(of.z).toBeCloseTo(at.z, 10);
        expect(of.y).toBeCloseTo(at.y, 10);
        const back = seatAtPoint(grid, { x: at.x, z: at.z });
        expect(back).toEqual({ row, col });
        checked += 1;
      }
    }
    expect(checked).toBe(768);
  });

  it('走道正中央的点应映射到相邻座位之一（不返回 null）', () => {
    const gapCenterX = 0;
    const frontRowZ = seatPositionAt(grid, 0, 0).z;
    const seat = seatAtPoint(grid, { x: gapCenterX, z: frontRowZ });
    expect(seat).not.toBeNull();
    expect(seat?.row).toBe(0);
    expect(seat?.col === 15 || seat?.col === 16).toBe(true);
  });
});

describe('走道间隙只影响 576 席，且精确 0.7m', () => {
  it('列 ≥16 的座位 x 偏移 −0.7，排 ≥12 的座位 z 偏移 +0.7，其余为 0', () => {
    let shifted = 0;
    for (let row = 0; row < grid.rows; row += 1) {
      for (let col = 0; col < grid.cols; col += 1) {
        const position = seatPositionAt(grid, row, col);
        const noGapX = grid.origin.x - col * grid.spacing.x;
        const noGapZ = grid.origin.z + row * grid.spacing.z;
        const expectedDx = col >= grid.aisleCol ? -grid.aisleGap : 0;
        const expectedDz = row >= grid.aisleRow ? grid.aisleGap : 0;
        expect(position.x - noGapX).toBeCloseTo(expectedDx, 10);
        expect(position.z - noGapZ).toBeCloseTo(expectedDz, 10);
        if (col >= grid.aisleCol || row >= grid.aisleRow) {
          shifted += 1;
        }
      }
    }
    expect(shifted).toBe(576);
  });

  it('跨中央走道的相邻两座间距应为 spacing + gap = 1.32m', () => {
    const left = seatPositionAt(grid, 0, grid.aisleCol - 1);
    const right = seatPositionAt(grid, 0, grid.aisleCol);
    expect(Math.abs(left.x - right.x)).toBeCloseTo(grid.spacing.x + grid.aisleGap, 10);
  });

  it('跨主走道的相邻两排间距应为 spacing + gap = 1.6m', () => {
    const front = seatPositionAt(grid, grid.aisleRow - 1, 0);
    const back = seatPositionAt(grid, grid.aisleRow, 0);
    expect(back.z - front.z).toBeCloseTo(grid.spacing.z + grid.aisleGap, 10);
  });
});

describe('方向：front-left 在屏幕左/前（GDD §6.2）', () => {
  const centers: Record<ZoneId, { x: number; z: number }> = {
    'front-left': seatPositionAt(grid, 5.5, 7.5),
    'front-right': seatPositionAt(grid, 5.5, 23.5),
    'back-left': seatPositionAt(grid, 17.5, 7.5),
    'back-right': seatPositionAt(grid, 17.5, 23.5),
  };

  it('左区 screenX < 0，右区 screenX > 0', () => {
    expect(screenX(centers['front-left'].x)).toBeLessThan(0);
    expect(screenX(centers['back-left'].x)).toBeLessThan(0);
    expect(screenX(centers['front-right'].x)).toBeGreaterThan(0);
    expect(screenX(centers['back-right'].x)).toBeGreaterThan(0);
  });

  it('前排 screenY 小于后排（前排在下）', () => {
    expect(screenY(centers['front-left'].z)).toBeLessThan(screenY(centers['back-left'].z));
    expect(screenY(centers['front-right'].z)).toBeLessThan(screenY(centers['back-right'].z));
  });

  it('列 0 在屏幕最左，列 31 在屏幕最右', () => {
    const first = seatPositionAt(grid, 0, 0);
    const last = seatPositionAt(grid, 0, grid.cols - 1);
    expect(screenX(first.x)).toBeLessThan(screenX(last.x));
  });
});

describe('走道两侧的座区归属（两个入口一致）', () => {
  it('四区中心反查回自身', () => {
    const cases: readonly { zone: ZoneId; row: number; col: number }[] = [
      { zone: 'front-left', row: 5, col: 7 },
      { zone: 'front-right', row: 5, col: 23 },
      { zone: 'back-left', row: 17, col: 7 },
      { zone: 'back-right', row: 17, col: 23 },
    ];
    for (const item of cases) {
      const point = seatPositionAt(grid, item.row, item.col);
      expect(zoneAtPoint(point, data)).toBe(item.zone);
      expect(wavesZoneAtPoint(data, point)).toBe(item.zone);
    }
  });

  it('中央走道两侧相邻座位分别属于左区 / 右区', () => {
    const leftPoint = seatPositionAt(grid, 0, 15);
    const rightPoint = seatPositionAt(grid, 0, 16);
    expect(zoneAtPoint(leftPoint, data)).toBe('front-left');
    expect(zoneAtPoint(rightPoint, data)).toBe('front-right');
    expect(wavesZoneAtPoint(data, leftPoint)).toBe('front-left');
    expect(wavesZoneAtPoint(data, rightPoint)).toBe('front-right');
  });

  it('主走道两侧相邻座位分别属于前排区 / 后排区', () => {
    const frontPoint = seatPositionAt(grid, 11, 0);
    const backPoint = seatPositionAt(grid, 12, 0);
    expect(zoneAtPoint(frontPoint, data)).toBe('front-left');
    expect(zoneAtPoint(backPoint, data)).toBe('back-left');
    expect(wavesZoneAtPoint(data, frontPoint)).toBe('front-left');
    expect(wavesZoneAtPoint(data, backPoint)).toBe('back-left');
  });

  it('观众席外接矩形之外返回 null', () => {
    expect(zoneAtPoint({ x: 999, z: 5 }, data)).toBeNull();
    expect(zoneAtPoint({ x: 0, z: -999 }, data)).toBeNull();
  });
});

describe('光覆盖：跨走道命中正确座位', () => {
  it('光心在座 (0,16) 时命中 16、不命中隔走道的 15', () => {
    const target = seatPositionAt(grid, 0, 16);
    const run = {
      light: { position: { x: target.x, z: target.z }, radius: 0.1 },
    } as unknown as RunState;
    const out = new Int32Array(32);
    const count = queryLitSeats(run, data, out);
    const seats = Array.from(out.slice(0, count));
    expect(seats).toContain(16);
    expect(seats).not.toContain(15);
  });

  it('最近列/排反查：走道两侧各 1cm 处落在正确一侧', () => {
    const left = seatPositionAt(grid, 0, 15);
    const right = seatPositionAt(grid, 0, 16);
    expect(nearestSeatColumn(grid, left.x - 0.01)).toBe(15);
    expect(nearestSeatColumn(grid, right.x + 0.01)).toBe(16);
    const front = seatPositionAt(grid, 11, 0);
    const back = seatPositionAt(grid, 12, 0);
    expect(nearestSeatRow(grid, front.z + 0.01)).toBe(11);
    expect(nearestSeatRow(grid, back.z - 0.01)).toBe(12);
  });
});

describe('由座位网格派生的几何（敌人/返听/合唱共用）', () => {
  it('舞台锚点 x 为 0，z 在首排前一格', () => {
    const anchor = stageAnchorOf(data);
    expect(anchor.x).toBeCloseTo(0, 9);
    expect(anchor.z).toBeCloseTo(seatPositionAt(grid, 0, 0).z - grid.spacing.z, 9);
  });

  it('音箱堆在网格两端口（屏幕左 +9.96 / 右 −9.96）', () => {
    const stacks = speakerStacksOf(data);
    expect(stacks[0].x).toBeCloseTo(9.96, 6);
    expect(stacks[1].x).toBeCloseTo(-9.96, 6);
    expect(stacks[0].z).toBeCloseTo(stacks[1].z, 9);
  });

  it('四区中心同时满足 zoneCenterOf 与两个 zoneAtPoint 入口', () => {
    const cases: readonly { zone: ZoneId; row: number; col: number }[] = [
      { zone: 'front-left', row: 5.5, col: 7.5 },
      { zone: 'front-right', row: 5.5, col: 23.5 },
      { zone: 'back-left', row: 17.5, col: 7.5 },
      { zone: 'back-right', row: 17.5, col: 23.5 },
    ];
    for (const item of cases) {
      const center = zoneCenterOf(data, item.zone);
      const expected = seatPositionAt(grid, item.row, item.col);
      expect(center.x).toBeCloseTo(expected.x, 9);
      expect(center.z).toBeCloseTo(expected.z, 9);
      expect(zoneAtPoint(center, data)).toBe(item.zone);
      expect(wavesZoneAtPoint(data, center)).toBe(item.zone);
    }
  });
});

describe('唯一真源静态检查', () => {
  const root = new URL('../', import.meta.url);
  const read = (relative: string): string => readFileSync(fileURLToPath(new URL(relative, root)), 'utf8');

  it('渲染/逻辑层不再出现 gap/fallback 常量', () => {
    const files = [
      'src/game/audience.ts',
      'src/game/waves.ts',
      'src/game/light.ts',
      'src/game/store.ts',
      'src/game/enemies.ts',
      'src/three/instancing.ts',
      'src/three/models.ts',
    ];
    const banned = /SEAT_AISLE_GAP|AISLE_GAP|SEAT_SPACING_FALLBACK|SEAT_ROW_RISE_FALLBACK|SEAT_ORIGIN_FALLBACK|useFallbackOrigin/;
    for (const file of files) {
      expect(banned.test(read(file)), `${file} 不应包含 gap/fallback 常量`).toBe(false);
    }
  });

  it('坐标公式只允许出现在 data/seats.ts', () => {
    const files = [
      'src/game/audience.ts',
      'src/game/waves.ts',
      'src/game/light.ts',
      'src/game/store.ts',
      'src/game/enemies.ts',
      'src/three/instancing.ts',
      'src/three/models.ts',
    ];
    const formula = /origin\.[xz]\s*[+-]\s*(row|col)\s*\*|\*\s*(data\.)?seats\.spacing\.[xz]/;
    for (const file of files) {
      expect(formula.test(read(file)), `${file} 不应重复实现座位坐标公式`).toBe(false);
    }
  });
});
