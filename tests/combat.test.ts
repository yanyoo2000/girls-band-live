/**
 * t96 补充：伤害结算（任务书要求「伤害/无敌帧」）。
 *
 * 本作没有玩家生命值/无敌帧：失败条件是「人气流失 + 线断 + 空场」，伤害只作用于噪音与返听。
 * 因此这里覆盖伤害的机器可判定部分：点燃伤害、击杀（dying）、光外不中、座区过滤、返听击杀、
 * 合唱波伤害的热度/人数/和弦系数与每小节一次的节奏；「无敌帧」不适用，已在
 * `docs/qa/unit-report.md` §4 如实记录。
 */
import { describe, expect, it } from 'vitest';
import { buildDataRegistry } from '../src/data';
import { seatPositionAt } from '../src/data/seats';
import {
  choirDamageForZone,
  resolveChoirWave,
  resolveIgniteDamage,
} from '../src/game/combat';
import { spawnNoiseAt, zoneCenterOf } from '../src/game/waves';
import { createHarness } from './helpers/store';
import type { RunState } from '../src/types/game';

const data = buildDataRegistry();
const FRONT_LEFT = seatPositionAt(data.seats, 0, 0);
const FRONT_RIGHT = seatPositionAt(data.seats, 0, data.seats.cols - 1);
const BACK_RIGHT = seatPositionAt(data.seats, data.seats.rows - 1, data.seats.cols - 1);

function runOf(harness: ReturnType<typeof createHarness>): RunState {
  const run = harness.store.getRun();
  if (run === null) throw new Error('开局失败');
  return run;
}

function isolateLight(run: RunState, position: { x: number; z: number }): void {
  run.light.mode = 'spread';
  run.light.radius = data.lightForms.spread.radius;
  run.light.position = { x: position.x, z: position.z };
  run.light.lightingZone = 'front-left';
}

describe('resolveIgniteDamage', () => {
  it('应按 基数 6 × 形态燃烧 × 倍率 扣血', () => {
    const harness = createHarness();
    harness.start(61);
    const run = runOf(harness);
    isolateLight(run, FRONT_LEFT);
    const noise = spawnNoiseAt(run, data, 'floor-noise', { x: FRONT_LEFT.x, z: FRONT_LEFT.z });
    if (noise === null) throw new Error('生成噪音失败');

    const expected = 6 * data.lightForms.spread.burnMultiplier * 1.6;
    resolveIgniteDamage(run, data, ['front-left'], 1.6);
    expect(noise.hp).toBeCloseTo(data.noise['floor-noise'].maxHp - expected, 6);
    harness.dispose();
  });

  it('应在血量归零时进入 dying 并计 1 次烧死', () => {
    const harness = createHarness();
    harness.start(62);
    const run = runOf(harness);
    isolateLight(run, FRONT_LEFT);
    const noise = spawnNoiseAt(run, data, 'floor-noise', { x: FRONT_LEFT.x, z: FRONT_LEFT.z });
    if (noise === null) throw new Error('生成噪音失败');
    noise.hp = 1;

    const result = resolveIgniteDamage(run, data, ['front-left'], 1.6);
    expect(result.burned).toBe(1);
    expect(noise.state).toBe('dying');
    expect(noise.remaining).toBeCloseTo(0.5, 6);
    expect(noise.singProgress).toBe(0);
    harness.dispose();
  });

  it('应只命中光锥内、且属于命中座区的噪音', () => {
    const harness = createHarness();
    harness.start(63);
    const run = runOf(harness);
    isolateLight(run, FRONT_LEFT);
    const inLight = spawnNoiseAt(run, data, 'floor-noise', { x: FRONT_LEFT.x, z: FRONT_LEFT.z });
    const outOfLight = spawnNoiseAt(run, data, 'floor-noise', { x: BACK_RIGHT.x, z: BACK_RIGHT.z });
    const otherZone = spawnNoiseAt(run, data, 'floor-noise', { x: FRONT_RIGHT.x, z: FRONT_RIGHT.z });
    if (inLight === null || outOfLight === null || otherZone === null) throw new Error('生成失败');
    const beforeOut = outOfLight.hp;
    const beforeOther = otherZone.hp;
    const beforeIn = inLight.hp;

    resolveIgniteDamage(run, data, ['front-left'], 1.6);
    expect(inLight.hp).toBeLessThan(beforeIn);
    expect(outOfLight.hp).toBe(beforeOut);
    // 前右在光锥外时同样不中。
    expect(otherZone.hp).toBe(beforeOther);
    harness.dispose();
  });

  it('应对 multiplier<=0 或空 zones 直接返回 0', () => {
    const harness = createHarness();
    harness.start(64);
    const run = runOf(harness);
    isolateLight(run, FRONT_LEFT);
    spawnNoiseAt(run, data, 'floor-noise', { x: FRONT_LEFT.x, z: FRONT_LEFT.z });
    expect(resolveIgniteDamage(run, data, ['front-left'], 0)).toEqual({ burned: 0, sung: 0, converted: 0 });
    harness.dispose();
  });

  it('应在光锥内命中返听并可击杀（烧死不产出观众）', () => {
    const harness = createHarness();
    harness.start(65);
    const run = runOf(harness);
    isolateLight(run, FRONT_LEFT);
    run.returnListener.active = true;
    run.returnListener.locked = true;
    run.returnListener.anchor = { x: FRONT_LEFT.x, z: FRONT_LEFT.z };
    run.returnListener.hp = 1;

    const result = resolveIgniteDamage(run, data, ['front-left'], 1.6);
    expect(result.burned).toBe(1);
    expect(run.returnListener.active).toBe(false);
    expect(run.returnListener.locked).toBe(false);
    expect(result.converted).toBe(0);
    harness.dispose();
  });

  it('应跳过 dying 实体', () => {
    const harness = createHarness();
    harness.start(66);
    const run = runOf(harness);
    isolateLight(run, FRONT_LEFT);
    const noise = spawnNoiseAt(run, data, 'floor-noise', { x: FRONT_LEFT.x, z: FRONT_LEFT.z });
    if (noise === null) throw new Error('生成失败');
    noise.state = 'dying';
    const result = resolveIgniteDamage(run, data, ['front-left'], 1.6);
    expect(result.burned).toBe(0);
    harness.dispose();
  });
});

describe('choirDamageForZone', () => {
  function seedColored(run: RunState, zoneSeats: readonly number[], heat: number): void {
    run.audience.state.fill(0);
    for (const seat of zoneSeats) run.audience.state[seat] = 2;
    run.zones['front-left'].heat = heat as 0 | 1 | 2 | 3 | 4;
  }

  function zoneSeats(): number[] {
    const seats: number[] = [];
    const cols = data.seats.cols;
    for (let row = 0; row <= 11; row += 1) {
      for (let col = 0; col <= 15; col += 1) seats.push(row * cols + col);
    }
    return seats;
  }

  it('应随区内彩观众人数与热度上升', () => {
    const harness = createHarness();
    harness.start(67);
    const run = runOf(harness);
    const seats = zoneSeats();

    seedColored(run, seats.slice(0, 10), 0);
    const low = choirDamageForZone(run, data, 'front-left');
    seedColored(run, seats.slice(0, 20), 0);
    const more = choirDamageForZone(run, data, 'front-left');
    expect(more).toBeGreaterThan(low);

    seedColored(run, seats.slice(0, 20), 3);
    const hot = choirDamageForZone(run, data, 'front-left');
    // 热度 0 → 0.5 倍；热度 3 → 2.0 倍：同一人数下应为 4 倍。
    expect(hot / more).toBeCloseTo(4, 6);
    harness.dispose();
  });

  it('应让热度 4 同时抬高热度系数与第 5 档输出（×1.5625）', () => {
    const harness = createHarness();
    harness.start(68);
    const run = runOf(harness);
    const seats = zoneSeats();
    seedColored(run, seats.slice(0, 20), 3);
    const heat3 = choirDamageForZone(run, data, 'front-left');
    run.zones['front-left'].heat = 4;
    const heat4 = choirDamageForZone(run, data, 'front-left');
    // 热度系数 (0.5+0.5×4)/(0.5+0.5×3)=1.25，再乘第 5 档 HEAT_FOUR_OUTPUT_MULTIPLIER=1.25。
    expect(heat4 / heat3).toBeCloseTo(1.25 * 1.25, 6);
    harness.dispose();
  });

  it('应在无彩观众时为 0', () => {
    const harness = createHarness();
    harness.start(69);
    const run = runOf(harness);
    run.audience.state.fill(0);
    expect(choirDamageForZone(run, data, 'front-left')).toBe(0);
    harness.dispose();
  });
});

describe('resolveChoirWave', () => {
  it('应对 dt<=0 返回空结果', () => {
    const harness = createHarness();
    harness.start(70);
    expect(resolveChoirWave(runOf(harness), data, 0)).toEqual({ burned: 0, sung: 0, converted: 0 });
    harness.dispose();
  });

  it('应每个小节只开火一次（同一小节第二次返回空）', () => {
    const harness = createHarness();
    harness.start(71);
    const run = runOf(harness);
    run.audience.state.fill(0);
    run.audience.state[0] = 2;
    run.zones['front-left'].heat = 3;
    // 放在前左区中心，确保在合唱波 12m 射程内。
    const center = zoneCenterOf(data, 'front-left');
    const noise = spawnNoiseAt(run, data, 'floor-noise', center);
    if (noise === null) throw new Error('生成失败');

    run.musical = { ...run.musical, bar: 2, beat: 0 };
    const first = resolveChoirWave(run, data, 1 / 60);
    const second = resolveChoirWave(run, data, 1 / 60);
    expect(first.burned).toBeGreaterThanOrEqual(0);
    expect(second).toEqual({ burned: 0, sung: 0, converted: 0 });

    // 下一小节重新开火：即使已烧死也至少说明本帧不再被同 bar 拦截。
    run.musical = { ...run.musical, bar: 3, beat: 0 };
    const hpBefore = noise.hp;
    const third = resolveChoirWave(run, data, 1 / 60);
    expect(third.burned + (noise.hp < hpBefore ? 1 : 0)).toBeGreaterThan(0);
    harness.dispose();
  });
});
