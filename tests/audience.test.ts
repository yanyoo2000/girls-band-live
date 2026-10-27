/**
 * tech-spec §11 #7：观众转化与热度。
 *
 * 必测：0.4 / 1.5s 两段；中断保留 50%；12s 掉级；覆盖 −1 与离场。
 */
import { describe, expect, it } from 'vitest';
import { buildDataRegistry } from '../src/data';
import { seatPositionAt } from '../src/data/seats';
import {
  countPresent,
  createAudience,
  disposeAudience,
  updateAudience,
} from '../src/game/audience';
import { createRng } from '../src/game/rng';
import { spawnNoiseAt } from '../src/game/waves';
import { createHarness } from './helpers/store';
import type { RunState } from '../src/types/game';

const data = buildDataRegistry();
const SEAT = 0;
const SEAT_POSITION = seatPositionAt(data.seats, 0, 0);

function runOf(harness: ReturnType<typeof createHarness>): RunState {
  const run = harness.store.getRun();
  if (run === null) throw new Error('开局失败');
  return run;
}

/** 只保留一个前左区的灰观众，便于精确断言。 */
function isolateOneSeat(run: RunState): void {
  run.audience.state.fill(0);
  run.audience.heat.fill(0);
  run.audience.state[SEAT] = 1;
  run.audience.zone[SEAT] = 0;
  run.light.mode = 'spread';
  run.light.radius = data.lightForms.spread.radius;
  run.light.position = { x: SEAT_POSITION.x, z: SEAT_POSITION.z };
  run.light.lightingZone = 'front-left';
  run.time = 0;
}

function tick(run: RunState, seconds: number, dt = 0.1): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i += 1) {
    run.time += dt;
    updateAudience(run, data, dt);
  }
}

describe('createAudience / disposeAudience', () => {
  it('应创建 768 席、前两排 30 人出席、四区配额 8/8/7/7', () => {
    const frame = createAudience(data, createRng(1));
    expect(frame.size).toBe(768);
    expect(frame.state).toHaveLength(768);
    expect(frame.heat).toHaveLength(768);
    expect(countPresent(frame, null)).toBe(30);
    expect(countPresent(frame, 'front-left')).toBe(8);
    expect(countPresent(frame, 'front-right')).toBe(8);
    expect(countPresent(frame, 'back-left')).toBe(7);
    expect(countPresent(frame, 'back-right')).toBe(7);
    disposeAudience(frame);
  });

  it('应可重复 dispose（幂等、不抛错）', () => {
    const frame = createAudience(data, createRng(2));
    expect(() => {
      disposeAudience(frame);
      disposeAudience(frame);
    }).not.toThrow();
  });
});

describe('两段转化', () => {
  it('应在 0.4s 拉停 + 1.5s 入座（合计 1.9s）后才变彩', () => {
    const harness = createHarness();
    harness.start(51);
    const run = runOf(harness);
    isolateOneSeat(run);

    tick(run, 0.4);
    expect(run.audience.state[SEAT]).toBe(1);
    tick(run, 1.4);
    expect(run.audience.state[SEAT]).toBe(1);
    tick(run, 0.1);
    expect(run.audience.state[SEAT]).toBe(2);
    expect(run.audience.heat[SEAT]).toBe(1);
    expect(run.audience.phone[SEAT]).toBe(1);
    harness.dispose();
  });

  it('应让光圈移开后进度保留 50%，需要补足剩余一半', () => {
    const harness = createHarness();
    harness.start(52);
    const run = runOf(harness);
    isolateOneSeat(run);

    tick(run, 1.0); // 进度 1.0 / 1.9
    run.light.position = { x: 40, z: 40 }; // 移出座位网格
    tick(run, 0.1);
    run.light.position = { x: SEAT_POSITION.x, z: SEAT_POSITION.z };
    tick(run, 0.8); // 1.4 进度：仍不足 1.9
    expect(run.audience.state[SEAT]).toBe(1);
    tick(run, 0.6); // 2.0 进度：完成
    expect(run.audience.state[SEAT]).toBe(2);
    harness.dispose();
  });

  it('应在回照（canConvert=false）时不推进转化', () => {
    const harness = createHarness();
    harness.start(53);
    const run = runOf(harness);
    isolateOneSeat(run);
    run.light.mode = 'self';
    tick(run, 3);
    expect(run.audience.state[SEAT]).toBe(1);
    harness.dispose();
  });

  it('应让返听锁定把转化速度减半（同秒数进度减半）', () => {
    const harness = createHarness();
    harness.start(54);
    const run = runOf(harness);
    isolateOneSeat(run);
    run.returnListener.locked = true;
    tick(run, 1.0); // 0.5 倍速 → 进度 0.5
    // tint = 进度 / (0.4 + 1.5)：锁定下应为一半。
    expect(run.audience.tint[SEAT]).toBeCloseTo(0.5 / 1.9, 3);

    // 解锁后按正常速度补完（1.0 + 1.0 + 0.5 = 2.0 进度 > 1.9）。
    run.returnListener.locked = false;
    tick(run, 1.0);
    expect(run.audience.state[SEAT]).toBe(1);
    tick(run, 0.5);
    expect(run.audience.state[SEAT]).toBe(2);
    harness.dispose();
  });
});

describe('热度升降', () => {
  it('应在被照 1.2s 后热度 +1', () => {
    const harness = createHarness();
    harness.start(55);
    const run = runOf(harness);
    run.audience.state.fill(0);
    run.audience.state[SEAT] = 2;
    run.audience.heat[SEAT] = 1;
    run.light.position = { x: SEAT_POSITION.x, z: SEAT_POSITION.z };
    run.light.mode = 'spread';
    run.light.radius = data.lightForms.spread.radius;

    tick(run, 1.1);
    expect(run.audience.heat[SEAT]).toBe(1);
    tick(run, 0.2);
    expect(run.audience.heat[SEAT]).toBe(2);
    harness.dispose();
  });

  it('应在离光 3s 后开始倒计时、12s 掉 1 级', () => {
    const harness = createHarness();
    harness.start(56);
    const run = runOf(harness);
    run.audience.state.fill(0);
    run.audience.state[SEAT] = 2;
    run.audience.heat[SEAT] = 3;
    run.light.position = { x: 40, z: 40 };

    tick(run, 3.0);
    expect(run.audience.heat[SEAT]).toBe(3);
    tick(run, 11.8); // 3 + 11.8 = 14.8 < 15
    expect(run.audience.heat[SEAT]).toBe(3);
    tick(run, 0.4); // 15.2 ≥ 15
    expect(run.audience.heat[SEAT]).toBe(2);
    harness.dispose();
  });
});

describe('噪音覆盖', () => {
  it('应让覆盖 −1 热度并把彩观众打黑', () => {
    const harness = createHarness();
    harness.start(57);
    const run = runOf(harness);
    isolateOneSeat(run);
    run.audience.state[SEAT] = 2;
    run.audience.heat[SEAT] = 1;
    spawnNoiseAt(run, data, 'floor-noise', { x: SEAT_POSITION.x, z: SEAT_POSITION.z });
    const delta = updateAudience(run, data, 0.1);
    expect(run.audience.heat[SEAT]).toBe(0);
    expect(run.audience.state[SEAT]).toBe(3);
    expect(delta.black).toBe(1);
    harness.dispose();
  });

  it('应在非锁定、非过热区只扣热度、不带走人', () => {
    const harness = createHarness();
    harness.start(58);
    const run = runOf(harness);
    isolateOneSeat(run);
    run.audience.state[SEAT] = 2;
    run.audience.heat[SEAT] = 0;
    spawnNoiseAt(run, data, 'floor-noise', { x: SEAT_POSITION.x, z: SEAT_POSITION.z });
    const before = countPresent(run.audience, null);
    updateAudience(run, data, 0.1);
    expect(countPresent(run.audience, null)).toBe(before);
    harness.dispose();
  });

  it('应在锁定区覆盖时带走 1 人', () => {
    const harness = createHarness();
    harness.start(59);
    const run = runOf(harness);
    isolateOneSeat(run);
    run.audience.state[SEAT] = 2;
    run.audience.heat[SEAT] = 0;
    run.returnListener.locked = true;
    spawnNoiseAt(run, data, 'floor-noise', { x: SEAT_POSITION.x, z: SEAT_POSITION.z });
    const before = countPresent(run.audience, null);
    updateAudience(run, data, 0.1);
    expect(countPresent(run.audience, null)).toBe(before - 1);
    expect(run.audience.state[SEAT]).toBe(4);
    harness.dispose();
  });
});
