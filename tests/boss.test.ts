/**
 * tech-spec §11 #11：Boss「静默」三阶段。
 *
 * 必测：6:30/6:45/7:15/7:40 相位；静默 8 小节；退场带走区阈值。
 */
import { describe, expect, it } from 'vitest';
import { buildDataRegistry } from '../src/data';
import { BOSS_RETIRE_SEC, BOSS_STRIP_ZONE_THRESHOLD } from '../src/data/balance';
import { bossHeatDecayMultiplier, bossLightVisibilityScale, updateBoss } from '../src/game/boss';
import type { BossState, RunState } from '../src/types/game';

const data = buildDataRegistry();
const SIZE = data.seats.capacity;

interface AudiencePlan {
  /** 每个区一个出席人数（顺序：前左/前右/后左/后右）。 */
  readonly zoneCounts: readonly [number, number, number, number];
}

function makeRun(time: number, plan: AudiencePlan = { zoneCounts: [0, 0, 0, 0] }): RunState {
  const state = new Uint8Array(SIZE);
  const zone = new Uint8Array(SIZE);
  let cursor = 0;
  for (let z = 0; z < 4; z += 1) {
    for (let i = 0; i < (plan.zoneCounts[z] ?? 0); i += 1) {
      if (cursor >= SIZE) break;
      zone[cursor] = z;
      state[cursor] = 2;
      cursor += 1;
    }
  }
  const boss: BossState = { phase: 'bus', phaseStartedAt: 0, retired: false, strippedZone: null };
  return {
    time,
    silenceRemaining: 0,
    boss,
    audience: { state, zone },
  } as unknown as RunState;
}

describe('updateBoss 相位', () => {
  it('应在 6:30 之前不推进、也不写静默', () => {
    const run = makeRun(389.9);
    run.silenceRemaining = 3;
    const update = updateBoss(run, data, 1 / 60);
    expect(update.changed).toBe(false);
    expect(update.phase).toBe('bus');
    expect(run.silenceRemaining).toBe(3);
  });

  it('应在 390s 进入 bus 并把静默写到 8 小节（15s）', () => {
    const run = makeRun(390);
    const update = updateBoss(run, data, 1 / 60);
    expect(update.changed).toBe(true);
    expect(update.phase).toBe('bus');
    expect(update.returnedAudience).toBe(0); // 首次进入不返场
    expect(run.boss.phaseStartedAt).toBe(390);
    expect(run.silenceRemaining).toBeCloseTo(15, 6);
  });

  it('应在 405s 切到 light、清静默并返场 30 人', () => {
    const run = makeRun(390);
    updateBoss(run, data, 1 / 60);
    run.time = 405;
    const update = updateBoss(run, data, 1 / 60);
    expect(update.phase).toBe('light');
    expect(update.changed).toBe(true);
    expect(update.returnedAudience).toBe(30);
    expect(run.silenceRemaining).toBe(0);
    expect(run.boss.phaseStartedAt).toBe(405);
  });

  it('应在 435s 切到 people、并让褪色倍率为 3', () => {
    const run = makeRun(435);
    const update = updateBoss(run, data, 1 / 60);
    expect(update.phase).toBe('people');
    expect(update.changed).toBe(true);
    expect(bossHeatDecayMultiplier(run, data)).toBe(3);
    expect(bossLightVisibilityScale(run, data)).toBe(1);
  });

  it('应让 light 阶段光锥可见度 ×0.5、其它阶段为 1', () => {
    const light = makeRun(410);
    updateBoss(light, data, 1 / 60);
    expect(bossLightVisibilityScale(light, data)).toBe(0.5);
    expect(bossHeatDecayMultiplier(light, data)).toBe(1);

    const bus = makeRun(392);
    updateBoss(bus, data, 1 / 60);
    expect(bossLightVisibilityScale(bus, data)).toBe(1);
  });

  it('应只清一次静默，把后续写入权让给别的系统', () => {
    const run = makeRun(390);
    updateBoss(run, data, 1 / 60); // bus：写入 15s 静默
    run.time = 405;
    updateBoss(run, data, 1 / 60); // light：清掉 bus 的静默
    expect(run.silenceRemaining).toBe(0);
    run.silenceRemaining = 6; // 模拟独奏会写入的 6s 静默
    updateBoss(run, data, 1 / 60);
    expect(run.silenceRemaining).toBe(6);
  });
});

describe('退场与带走区', () => {
  it('应在 7:40 退场并返场 30 人（人气 ≥150 时不带走区）', () => {
    const run = makeRun(BOSS_RETIRE_SEC, { zoneCounts: [200, 0, 0, 0] });
    const update = updateBoss(run, data, 1 / 60);
    expect(update.phase).toBe('retired');
    expect(update.changed).toBe(true);
    expect(update.returnedAudience).toBe(30);
    expect(run.boss.retired).toBe(true);
    expect(run.boss.strippedZone).toBeNull();
    expect(update.strippedZone).toBeNull();
  });

  it('应在人气 <150 时带走人数最少的有人区', () => {
    const run = makeRun(BOSS_RETIRE_SEC, {
      zoneCounts: [40, 30, BOSS_STRIP_ZONE_THRESHOLD - 141, 0],
    });
    const update = updateBoss(run, data, 1 / 60);
    // 9 < 30 < 40，且后右区为空不该被带走。
    expect(update.strippedZone).toBe('back-left');
    expect(run.boss.strippedZone).toBe('back-left');
  });

  it('应在全场空场时不带走任何区', () => {
    const run = makeRun(BOSS_RETIRE_SEC);
    const update = updateBoss(run, data, 1 / 60);
    expect(update.strippedZone).toBeNull();
  });

  it('应在退场后只回报结果、不重复触发', () => {
    const run = makeRun(BOSS_RETIRE_SEC, { zoneCounts: [10, 0, 0, 0] });
    updateBoss(run, data, 1 / 60);
    const second = updateBoss(run, data, 1 / 60);
    expect(second.phase).toBe('retired');
    expect(second.changed).toBe(false);
    expect(second.strippedZone).toBe('front-left');
    expect(second.returnedAudience).toBe(0);
  });

  it('应对 dt<=0 直接返回当前相位', () => {
    const run = makeRun(400);
    const update = updateBoss(run, data, 0);
    expect(update.changed).toBe(false);
    expect(run.boss.phase).toBe('bus');
  });
});
