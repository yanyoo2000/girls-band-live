/**
 * tech-spec §11 #16：波次与生成率。
 *
 * 必测：段落生成率、裂缝 +15%、同屏上限截断、背后生成概率 30%。
 */
import { describe, expect, it } from 'vitest';
import { buildDataRegistry } from '../src/data';
import { createEntityWorld } from '../src/game/entities';
import { createRng } from '../src/game/rng';
import {
  computeWaveBudget,
  countActiveNoises,
  crowdWaveSchedule,
  segmentAt,
  spawnNoise,
  spawnNoiseAt,
  updateWaves,
  updateWavesWithPool,
} from '../src/game/waves';
import type { BossState, NoiseEntity, RunState } from '../src/types/game';

const data = buildDataRegistry();

function makeRun(overrides: Partial<RunState> = {}): RunState {
  const boss: BossState = { phase: 'bus', phaseStartedAt: 0, retired: false, strippedZone: null };
  const base = {
    time: 100,
    segment: 'verse',
    cracks: 0,
    noises: [] as NoiseEntity[],
    boss,
    light: { position: { x: 0, z: 0 }, radius: 4 },
    player: { position: { x: 0, z: 0 }, facing: 0 },
  } as unknown as RunState;
  return Object.assign(base, overrides) as RunState;
}

describe('crowdWaveSchedule', () => {
  it('应给出 2:00 / 5:00 / 8:00 与 90 / 280 / 460 门槛', () => {
    const schedule = crowdWaveSchedule(data);
    expect(schedule.map((item) => item.at)).toEqual([120, 300, 480]);
    expect(schedule.map((item) => item.threshold)).toEqual([90, 280, 460]);
  });
});

describe('segmentAt / computeWaveBudget', () => {
  it('应按 run.segment 取段落，缺失时按时间回退', () => {
    expect(segmentAt(makeRun(), data)?.id).toBe('verse');
    expect(segmentAt(makeRun({ time: 0, segment: 'unknown' as never }), data)?.id).toBe('overture');
    expect(segmentAt(makeRun({ time: 400, segment: 'unknown' as never }), data)?.id).toBe('bridge');
    expect(segmentAt(makeRun({ time: 999, segment: 'unknown' as never }), data)?.id).toBe('finale');
  });

  it('应按段落生成率给出预算，并让每道裂缝 +15%', () => {
    const verse = data.segments.find((segment) => segment.id === 'verse');
    expect(verse).toBeDefined();
    const base = computeWaveBudget(makeRun(), data);
    expect(base.floorNoise).toBeCloseTo(verse?.spawnRates['floor-noise'] ?? -1, 10);
    expect(base.scream).toBeCloseTo(verse?.spawnRates.scream ?? -1, 10);
    expect(base.cap).toBe(data.balance.noise.cap);

    const cracked = computeWaveBudget(makeRun({ cracks: 2 }), data);
    expect(cracked.floorNoise).toBeCloseTo(base.floorNoise * 1.3, 10);
    expect(cracked.scream).toBeCloseTo(base.scream * 1.3, 10);
    expect(cracked.distortion).toBeCloseTo(base.distortion * 1.3, 10);
  });

  it('应把背后生成概率固定为 30%', () => {
    expect(computeWaveBudget(makeRun(), data).fromBehindChance).toBe(0.3);
  });

  it('应让序曲不生成噪音', () => {
    const budget = computeWaveBudget(makeRun({ time: 10, segment: 'overture' }), data);
    expect(budget.floorNoise).toBe(0);
    expect(budget.scream).toBe(0);
    expect(budget.distortion).toBe(0);
  });
});

describe('updateWaves（纯函数入口）', () => {
  it('应按秒数累积生成，且生成位置在光锥外环', () => {
    const run = makeRun();
    const spawned = updateWaves(run, data, createRng(1), 1);
    expect(spawned).toBe(2); // 主歌底噪 2 只/秒
    expect(run.noises).toHaveLength(2);
    for (const noise of run.noises) {
      const dx = noise.position.x - run.light.position.x;
      const dz = noise.position.z - run.light.position.z;
      const distance = Math.hypot(dx, dz);
      expect(distance).toBeGreaterThanOrEqual(data.balance.noise.spawnMinDistance);
      expect(distance).toBeLessThanOrEqual(data.balance.noise.spawnMaxDistance + run.light.radius);
      expect(noise.kind).toBe('floor-noise');
    }
  });

  it('应让 id 单调递增（从 -1 起算）', () => {
    const run = makeRun();
    updateWaves(run, data, createRng(2), 1);
    const ids = run.noises.map((noise) => noise.id).sort((a, b) => a - b);
    expect(ids).toEqual([0, 1]);
  });

  it('应在同屏达到上限时停止生成并保留 1 个额度', () => {
    const run = makeRun();
    for (let i = 0; i < data.balance.noise.cap; i += 1) {
      spawnNoise(run, data, 'floor-noise', 'ring', null);
    }
    expect(countActiveNoises(run)).toBe(data.balance.noise.cap);
    const spawned = updateWaves(run, data, createRng(3), 1);
    expect(spawned).toBe(0);
    expect(run.noises).toHaveLength(data.balance.noise.cap);

    // 腾出一只后，保留额度会立刻补上。
    run.noises.pop();
    const refill = updateWaves(run, data, createRng(4), 1 / 60);
    expect(refill).toBe(1);
  });

  it('应在桥段让失真成对出现', () => {
    const run = makeRun({ time: 360, segment: 'bridge' });
    updateWaves(run, data, createRng(5), 10);
    const distortion = run.noises.filter((noise) => noise.kind === 'distortion');
    expect(distortion.length).toBeGreaterThanOrEqual(2);
    expect(distortion.length % 2).toBe(0);
  });

  it('应对 dt<=0 不生成', () => {
    expect(updateWaves(makeRun(), data, createRng(6), 0)).toBe(0);
  });
});

describe('spawnNoise / spawnNoiseAt', () => {
  it('应让 behind 放置在玩家朝向反方向 3–8m', () => {
    const run = makeRun({ player: { position: { x: 5, z: 5 }, facing: 0 } as RunState['player'] });
    const entity = spawnNoise(run, data, 'scream', 'behind', null);
    expect(entity).not.toBeNull();
    expect(entity?.position.x).toBeCloseTo(5 - 5.5, 6);
    expect(entity?.position.z).toBeCloseTo(5, 6);
  });

  it('应让无 rng 的 ring 放置取 5.5m 中点与固定角', () => {
    const run = makeRun();
    const entity = spawnNoise(run, data, 'distortion', 'ring', null);
    expect(entity?.position.x).toBeCloseTo(0, 6);
    expect(entity?.position.z).toBeCloseTo(5.5, 6);
  });

  it('应让池满时 spawnNoiseAt 返回 null 且不抛错', () => {
    const run = makeRun();
    const world = createEntityWorld(data, 1);
    expect(spawnNoiseAt(run, data, 'floor-noise', { x: 0, z: 0 }, world.pool)).not.toBeNull();
    expect(spawnNoiseAt(run, data, 'floor-noise', { x: 0, z: 0 }, world.pool)).toBeNull();
  });
});

describe('updateWavesWithPool', () => {
  it('应走对象池、不提前 push 进 run.noises', () => {
    const run = makeRun();
    const world = createEntityWorld(data, 8);
    const spawned = updateWavesWithPool(run, data, createRng(7), 1, world.pool);
    expect(spawned).toBe(2);
    expect(world.pool.active).toHaveLength(2);
    expect(run.noises).toHaveLength(0); // 由下一拍 updateEntities 统一重建
  });
});
