/**
 * t117 H1 回归：开场宽限 + 首次 pointermove 前不覆盖光位。
 *
 * 旧行为：store 用“开始演出”按钮位置初始化目标，4s 返听锁定、8s 过热。
 * 新行为：初始光位留在 data 的初始点；未动指针不累计锚点；5s 宽限内不触发区过热。
 */
import { describe, expect, it } from 'vitest';
import { OPENING_GRACE_SEC } from '../src/data/segments';
import { createHarness } from './helpers/store';
import type { InputFrame } from '../src/types/game';

function input(pointer: { x: number; z: number }): InputFrame {
  return {
    move: { x: 0, z: 0 },
    pointerNdc: { x: pointer.x / 10, z: pointer.z / 10 },
    pointerWorld: pointer,
    beamHeld: false,
    ignitePressed: false,
    interactHeld: false,
    holdSeconds: 0,
    pausePressed: false,
  };
}

describe('开场宽限（H1）', () => {
  it('未动指针时：光停在 data 初始位，不 4s 锁定 / 8s 过热', () => {
    const harness = createHarness();
    harness.start(3);
    const run = harness.store.getRun();
    expect(run).not.toBeNull();
    const start = { ...run!.light.position };

    // 指针在 (0,0)（舞台中心）；旧实现会切 self 并立即进入驻守计时。
    harness.tick(Math.ceil(OPENING_GRACE_SEC * 60) + 180, input({ x: 0, z: 0 }));
    const after = harness.store.getRun()!;
    expect(after.returnListener.active).toBe(false);
    expect(after.returnListener.locked).toBe(false);
    expect(after.zones['front-left'].overheat).toBe(false);
    expect(after.zones['front-right'].overheat).toBe(false);
    expect(after.light.anchorAge).toBe(0);
    // 光仍在 data 初始位附近，不是按钮处 (0,0)。
    expect(Math.hypot(after.light.position.x - start.x, after.light.position.z - start.z)).toBeLessThan(0.2);
    expect(Math.hypot(after.light.position.x, after.light.position.z)).toBeGreaterThan(2);
    harness.dispose();
  });

  it('首次 pointermove 后光会跟手，宽限结束后才累计锚点', () => {
    const harness = createHarness();
    harness.start(4);
    // 第一帧指针在按钮位置 (0,0)，随后移动一次。
    harness.tick(1, input({ x: 0, z: 0 }));
    const target = { x: 4, z: 8 };
    harness.tick(Math.ceil(OPENING_GRACE_SEC * 60) + 60, input(target));
    const after = harness.store.getRun()!;
    expect(Math.hypot(after.light.position.x - target.x, after.light.position.z - target.z)).toBeLessThan(1);
    expect(after.light.anchorAge).toBeGreaterThan(0);
    harness.dispose();
  });
});
