/**
 * tech-spec §11 #6：点燃判定。
 *
 * 必测：完美/良好/错拍倍率；和弦内/外 ±25%；错拍 ≤40%。
 */
import { describe, expect, it } from 'vitest';
import { buildDataRegistry } from '../src/data';
import { seatPositionAt } from '../src/data/seats';
import { evaluateIgnite } from '../src/game/light';
import { createHarness } from './helpers/store';
import type { MusicalPosition, RunState } from '../src/types/game';

const data = buildDataRegistry();
const FRONT_LEFT = seatPositionAt(data.seats, 0, 0);
const BACK_RIGHT = seatPositionAt(data.seats, data.seats.rows - 1, data.seats.cols - 1);
const BEAT_SEC = 60 / data.beatGrid.bpm;

function runOf(harness: ReturnType<typeof createHarness>): RunState {
  const run = harness.store.getRun();
  if (run === null) throw new Error('开局失败');
  return run;
}

/** 主歌第 0 小节（和弦 f，前左/前右/后左为内音，后右为外音）。 */
function musical(beatPhase: number): MusicalPosition {
  return {
    bar: 0,
    beat: 0,
    beatPhase,
    phraseBeat: 0,
    segment: 'verse',
    segmentProgress: 0,
    bpm: data.beatGrid.bpm,
  };
}

describe('evaluateIgnite 三档', () => {
  it('应在拍点正中判完美、倍率 1.6（含和弦内 ×1.25）', () => {
    const harness = createHarness();
    harness.start(41);
    const run = runOf(harness);
    run.light.position = { x: FRONT_LEFT.x, z: FRONT_LEFT.z };
    const result = evaluateIgnite(run, musical(0), data, 0);
    expect(result.quality).toBe('perfect');
    expect(result.inChord).toBe(true);
    expect(result.multiplier).toBeCloseTo(1.6 * 1.25, 6);
    harness.dispose();
  });

  it('应在 ±0.08s 内判完美、在 0.08–0.14s 判良好', () => {
    const harness = createHarness();
    harness.start(42);
    const run = runOf(harness);
    run.light.position = { x: FRONT_LEFT.x, z: FRONT_LEFT.z };

    const near = evaluateIgnite(run, musical(0.08 / BEAT_SEC), data, 0);
    expect(near.quality).toBe('perfect');

    const good = evaluateIgnite(run, musical(0.11 / BEAT_SEC), data, 0);
    expect(good.quality).toBe('good');
    expect(good.multiplier).toBeCloseTo(1.2 * 1.25, 6);
    harness.dispose();
  });

  it('应在窗口外判错拍且总倍率 ≤40% 基础伤害', () => {
    const harness = createHarness();
    harness.start(43);
    const run = runOf(harness);
    run.light.position = { x: FRONT_LEFT.x, z: FRONT_LEFT.z };

    const off = evaluateIgnite(run, musical(0.5), data, 0);
    expect(off.quality).toBe('off');
    // 错拍最差（和弦外）：0.4 × 0.75 = 0.3 ≤ 0.4。
    run.light.position = { x: BACK_RIGHT.x, z: BACK_RIGHT.z };
    const worst = evaluateIgnite(run, musical(0.5), data, 0);
    expect(worst.inChord).toBe(false);
    expect(worst.multiplier).toBeCloseTo(0.4 * 0.75, 6);
    expect(worst.multiplier).toBeLessThanOrEqual(0.4);
    harness.dispose();
  });

  it('应让错拍在 0.2s 附近（1/2 拍外）稳定判 off', () => {
    const harness = createHarness();
    harness.start(44);
    const run = runOf(harness);
    run.light.position = { x: FRONT_LEFT.x, z: FRONT_LEFT.z };
    expect(evaluateIgnite(run, musical(0.5), data, 0).quality).toBe('off');
    expect(evaluateIgnite(run, musical(1 - 0.5), data, 0).quality).toBe('off');
    harness.dispose();
  });
});

describe('和弦内/外', () => {
  it('应让前左在 f 和弦内、后右在 f 和弦外', () => {
    const harness = createHarness();
    harness.start(45);
    const run = runOf(harness);

    run.light.position = { x: FRONT_LEFT.x, z: FRONT_LEFT.z };
    expect(evaluateIgnite(run, musical(0), data, 0).inChord).toBe(true);

    run.light.position = { x: BACK_RIGHT.x, z: BACK_RIGHT.z };
    const out = evaluateIgnite(run, musical(0), data, 0);
    expect(out.inChord).toBe(false);
    expect(out.multiplier).toBeCloseTo(1.6 * 0.75, 6);
    harness.dispose();
  });

  it('应在七和弦小节让第四区变成内音', () => {
    const harness = createHarness();
    harness.start(46);
    const run = runOf(harness);
    run.light.position = { x: BACK_RIGHT.x, z: BACK_RIGHT.z };
    // 序曲第 3 小节是 g7（全部内音）。
    const seventhBar: MusicalPosition = {
      ...musical(0),
      bar: 3,
      segment: 'overture',
      segmentProgress: (3 * 1.875) / 90,
    };
    const result = evaluateIgnite(run, seventhBar, data, 0);
    expect(result.inChord).toBe(true);
    harness.dispose();
  });
});

describe('冷却与扫场奖励', () => {
  it('应写入 2 拍点燃冷却（breathe 卡减 1 拍）', () => {
    const harness = createHarness();
    harness.start(47);
    const run = runOf(harness);
    run.light.position = { x: FRONT_LEFT.x, z: FRONT_LEFT.z };

    evaluateIgnite(run, musical(0), data, 0);
    expect(run.light.igniteCooldown).toBeCloseTo(2 * BEAT_SEC, 6);
    expect(run.light.intensity).toBe(1);

    run.build.cards.push('breathe');
    evaluateIgnite(run, musical(0), data, 0);
    expect(run.light.igniteCooldown).toBeCloseTo(1 * BEAT_SEC, 6);
    harness.dispose();
  });

  it('应消耗扫场充能并让本次倍率 ×1.2，第二次不再加', () => {
    const harness = createHarness();
    harness.start(48);
    const run = runOf(harness);
    run.light.position = { x: FRONT_LEFT.x, z: FRONT_LEFT.z };
    run.light.sweepBonusCharges = 1;

    const first = evaluateIgnite(run, musical(0), data, 0.2);
    expect(first.sweepBonusApplied).toBe(true);
    expect(first.multiplier).toBeCloseTo(1.6 * 1.25 * 1.2, 6);
    expect(run.light.sweepBonusCharges).toBe(0);

    const second = evaluateIgnite(run, musical(0), data, 0.2);
    expect(second.sweepBonusApplied).toBe(false);
    expect(second.multiplier).toBeCloseTo(1.6 * 1.25, 6);
    harness.dispose();
  });

  it('应在没有充能时不消耗、即便传入 sweepBonus', () => {
    const harness = createHarness();
    harness.start(49);
    const run = runOf(harness);
    run.light.position = { x: FRONT_LEFT.x, z: FRONT_LEFT.z };
    run.light.sweepBonusCharges = 0;
    const result = evaluateIgnite(run, musical(0), data, 0.2);
    expect(result.sweepBonusApplied).toBe(false);
    expect(result.multiplier).toBeCloseTo(1.6 * 1.25, 6);
    harness.dispose();
  });
});
