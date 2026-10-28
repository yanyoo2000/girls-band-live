/**
 * t108 集成回归：store → progression 的升级链路。
 *
 * 重点不是“单独调用 addExperience”，而是真实 tick：
 * 光照亮四个座区的代表座位 → 转化产生经验 → 第一次升级出三张互斥核心 →
 * 选择核心后回到 playing。防止 M6 再次出现“经验不累计 / 三选一不出卡”。
 */
import { describe, expect, it } from 'vitest';
import { buildDataRegistry } from '../src/data';
import { seatPositionAt } from '../src/data/seats';
import { createHarness } from './helpers/store';
import type { InputFrame } from '../src/types/game';

const data = buildDataRegistry();
const grid = data.seats;

/** 四区各取两个代表座位（覆盖 16 列宽度），3 秒换一次，避免返听锁定。 */
const SWEEP = [
  seatPositionAt(grid, 1, 4),
  seatPositionAt(grid, 1, 12),
  seatPositionAt(grid, 1, 20),
  seatPositionAt(grid, 1, 28),
  seatPositionAt(grid, 12, 4),
  seatPositionAt(grid, 12, 12),
  seatPositionAt(grid, 12, 20),
  seatPositionAt(grid, 12, 28),
] as const;

const DWELL_FRAMES = 180; // 3s @60Hz

describe('store 升级链路', () => {
  it('应在扫光转化后触发第一次升级，并给出三张互斥核心', () => {
    const harness = createHarness();
    harness.start(3);
    const base = {
      move: { x: 0, z: 0 },
      pointerNdc: { x: 0, z: 0 },
      pointerWorld: { x: SWEEP[0].x, z: SWEEP[0].z },
      beamHeld: false,
      ignitePressed: false,
      interactHeld: false,
      holdSeconds: 0,
      pausePressed: false,
    } satisfies InputFrame;
    const frameFor = (target: { x: number; z: number }): InputFrame => ({
      ...base,
      pointerNdc: { x: target.x / 10, z: target.z / 10 },
      pointerWorld: { x: target.x, z: target.z },
    });

    let leveledAt = -1;
    for (let i = 0; i < 7200; i += 1) {
      const target = SWEEP[Math.floor(i / DWELL_FRAMES) % SWEEP.length];
      if (target === undefined) throw new Error('SWEEP 为空');
      harness.tick(1, frameFor(target));
      const run = harness.store.getRun();
      if (run === null) break;
      if (run.phase === 'levelup') {
        leveledAt = i;
        break;
      }
    }

    const run = harness.store.getRun();
    expect(run).not.toBeNull();
    expect(leveledAt).toBeGreaterThan(0);
    expect(run?.phase).toBe('levelup');
    expect(run?.offer).not.toBeNull();
    const cards = run?.offer?.cards ?? [];
    expect(cards).toHaveLength(3);
    expect(new Set(cards)).toEqual(new Set(['choir-wall', 'solo-return', 'bait-line']));

    const chosen = cards[0];
    expect(chosen).toBeDefined();
    harness.store.dispatch({ type: 'choose-card', cardId: chosen! });
    const after = harness.store.getRun();
    expect(after?.phase).toBe('playing');
    expect(after?.build.coreCard).toBe(chosen);
    expect(after?.build.picks).toBe(1);
    harness.dispose();
  });
});
