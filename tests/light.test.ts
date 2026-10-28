/**
 * tech-spec §11 #5：光系统。
 *
 * 必测：惯性 / 半径 / 三形态代价；回照人气 −1/4 拍；扫场奖励。
 */
import { describe, expect, it } from 'vitest';
import { buildDataRegistry } from '../src/data';
import { seatPositionAt } from '../src/data/seats';
import { countPresent } from '../src/game/audience';
import { lightCoverageRatio, queryLitSeats, updateLight } from '../src/game/light';
import { createHarness, NEUTRAL_INPUT } from './helpers/store';
import type { InputFrame, RunState } from '../src/types/game';

const data = buildDataRegistry();
const playable = data.characters.find((character) => character.playable);
const STAGE = playable?.silhouette.stagePosition ?? { x: 0, z: 0 };
const FRONT_LEFT = seatPositionAt(data.seats, 0, 0);
const FRONT_RIGHT = seatPositionAt(data.seats, 0, data.seats.cols - 1);

function runOf(harness: ReturnType<typeof createHarness>): RunState {
  const run = harness.store.getRun();
  if (run === null) throw new Error('开局失败');
  // 直接调用 updateLight 的单测以“较晚的 run.time”开始，跳过开场 pointer 激活窗口；
  // 正式局由 store 从 0.016s 起跑，首次 pointermove 才激活。
  run.time = Math.max(run.time, 10);
  return run;
}

function inputAt(x: number, z: number, beamHeld = false): InputFrame {
  return { ...NEUTRAL_INPUT, pointerWorld: { x, z }, beamHeld };
}

describe('updateLight 形态与半径', () => {
  it('应让三种形态互斥并采用数据表半径', () => {
    const harness = createHarness();
    harness.start(21);
    const run = runOf(harness);

    updateLight(run, inputAt(FRONT_LEFT.x, FRONT_LEFT.z), data, 0.15);
    expect(run.light.mode).toBe('spread');
    expect(run.light.radius).toBeCloseTo(data.lightForms.spread.radius, 6);

    updateLight(run, inputAt(FRONT_LEFT.x, FRONT_LEFT.z, true), data, 0.15);
    expect(run.light.mode).toBe('beam');
    expect(run.light.radius).toBeCloseTo(data.lightForms.beam.radius, 6);

    updateLight(run, inputAt(STAGE.x, STAGE.z), data, 0.15);
    expect(run.light.mode).toBe('self');
    expect(run.light.radius).toBeCloseTo(data.lightForms.self.radius, 6);
    harness.dispose();
  });

  it('应让回照优先于束光（光收回脚下是明确意图）', () => {
    const harness = createHarness();
    harness.start(22);
    const run = runOf(harness);
    updateLight(run, inputAt(STAGE.x, STAGE.z, true), data, 0.15);
    expect(run.light.mode).toBe('self');
    harness.dispose();
  });

  it('应按 0.15s 惯性插值（半步到一半）', () => {
    const harness = createHarness();
    harness.start(23);
    const run = runOf(harness);
    run.light.position = { x: 0, z: 0 };
    updateLight(run, inputAt(10, 0), data, 0.075);
    expect(run.light.position.x).toBeCloseTo(5, 6);
    expect(run.light.position.z).toBeCloseTo(0, 6);
    harness.dispose();
  });

  it('应在 dt 达到惯性时长时直接到位', () => {
    const harness = createHarness();
    harness.start(24);
    const run = runOf(harness);
    run.light.position = { x: 0, z: 0 };
    updateLight(run, inputAt(10, 0), data, 0.15);
    expect(run.light.position.x).toBeCloseTo(10, 6);
    harness.dispose();
  });

  it('应在静默阶段 2 与返听锁定时收窄半径（连乘）', () => {
    const harness = createHarness();
    harness.start(25);
    const run = runOf(harness);
    const input = inputAt(FRONT_LEFT.x, FRONT_LEFT.z);
    const base = data.lightForms.spread.radius;

    run.boss.phase = 'light';
    updateLight(run, input, data, 0.15);
    expect(run.light.radius).toBeCloseTo(base * data.balance.boss.phase2LightScale, 6);

    run.returnListener.locked = true;
    updateLight(run, input, data, 0.15);
    expect(run.light.radius).toBeCloseTo(base * data.balance.boss.phase2LightScale * 0.7, 6);
    harness.dispose();
  });

  it('应对 dt<=0 不做任何推进', () => {
    const harness = createHarness();
    harness.start(26);
    const run = runOf(harness);
    const before = { ...run.light.position };
    const update = updateLight(run, inputAt(10, 0), data, 0);
    expect(update.movedDistance).toBe(0);
    expect(run.light.position).toEqual(before);
    harness.dispose();
  });
});

describe('回照代价', () => {
  it('应每 4 拍赶走 1 名观众，且同一拍不重复结算', () => {
    const harness = createHarness();
    harness.start(27);
    const run = runOf(harness);
    run.musical = { ...run.musical, bar: 0, beat: 0 };
    const before = countPresent(run.audience, null);
    updateLight(run, inputAt(STAGE.x, STAGE.z), data, 0.15);
    expect(countPresent(run.audience, null)).toBe(before - 1);

    // 同一拍再次调用：不重复扣人。
    updateLight(run, inputAt(STAGE.x, STAGE.z), data, 0.15);
    expect(countPresent(run.audience, null)).toBe(before - 1);

    // 第 4 拍：再扣 1 人。
    run.musical = { ...run.musical, bar: 1, beat: 0 };
    updateLight(run, inputAt(STAGE.x, STAGE.z), data, 0.15);
    expect(countPresent(run.audience, null)).toBe(before - 2);
    harness.dispose();
  });

  it('应在散光/束光下不扣人', () => {
    const harness = createHarness();
    harness.start(28);
    const run = runOf(harness);
    run.musical = { ...run.musical, bar: 0, beat: 0 };
    const before = countPresent(run.audience, null);
    updateLight(run, inputAt(FRONT_LEFT.x, FRONT_LEFT.z), data, 0.15);
    updateLight(run, inputAt(FRONT_LEFT.x, FRONT_LEFT.z, true), data, 0.15);
    expect(countPresent(run.audience, null)).toBe(before);
    harness.dispose();
  });
});

describe('扫场奖励', () => {
  it('应在 4s 内跨 ≥2 区后给 1 次点燃奖励充能', () => {
    const harness = createHarness();
    harness.start(29);
    const run = runOf(harness);
    run.time = 10;
    updateLight(run, inputAt(FRONT_LEFT.x, FRONT_LEFT.z), data, 0.15);
    run.time = 10.2;
    const update = updateLight(run, inputAt(FRONT_RIGHT.x, FRONT_RIGHT.z), data, 0.15);
    expect(update.sweptZones).toBeGreaterThanOrEqual(2);
    expect(run.light.sweepBonusCharges).toBe(1);
    harness.dispose();
  });

  it('应在窗口外重置扫场计数（不累计）', () => {
    const harness = createHarness();
    harness.start(30);
    const run = runOf(harness);
    run.time = 10;
    updateLight(run, inputAt(FRONT_LEFT.x, FRONT_LEFT.z), data, 0.15);
    run.time = 10 + data.balance.antiCamp.sweepWindow + 0.5;
    const update = updateLight(run, inputAt(FRONT_RIGHT.x, FRONT_RIGHT.z), data, 0.15);
    expect(update.sweptZones).toBe(1);
    expect(run.light.sweepBonusCharges).toBe(0);
    harness.dispose();
  });
});

describe('queryLitSeats / lightCoverageRatio', () => {
  it('应命中光锥内座位并遵守 out 容量', () => {
    const harness = createHarness();
    harness.start(31);
    const run = runOf(harness);
    run.light.position = { x: FRONT_LEFT.x, z: FRONT_LEFT.z };
    run.light.radius = 3;
    const out = new Int32Array(768);
    const hits = queryLitSeats(run, data, out);
    expect(hits).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(hits, out.length); i += 1) {
      expect(out[i]).toBeGreaterThanOrEqual(0);
      expect(out[i] ?? -1).toBeLessThan(768);
    }

    const tiny = new Int32Array(2);
    expect(queryLitSeats(run, data, tiny)).toBe(hits);
  });

  it('应在无人出席时覆盖率为 0、有出席时 ≤1', () => {
    const harness = createHarness();
    harness.start(32);
    const run = runOf(harness);
    const scratch = new Int32Array(768);
    expect(lightCoverageRatio(run, data, scratch)).toBeGreaterThanOrEqual(0);
    expect(lightCoverageRatio(run, data, scratch)).toBeLessThanOrEqual(1);

    run.audience.state.fill(0);
    expect(lightCoverageRatio(run, data, scratch)).toBe(0);
    harness.dispose();
  });
});
