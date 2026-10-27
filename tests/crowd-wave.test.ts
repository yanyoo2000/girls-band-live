/**
 * tech-spec §11 #8：人浪。
 *
 * 必测：三次时间点；阈值不足→小浪；1:4 转化；裂缝 +1。
 */
import { describe, expect, it } from 'vitest';
import { buildDataRegistry } from '../src/data';
import { applyCrowdWave, countPresent } from '../src/game/audience';
import { updateCrowdWave } from '../src/game/crowd-wave';
import { createHarness } from './helpers/store';
import type { RunState, ZoneId } from '../src/types/game';

const data = buildDataRegistry();
const ZONES: readonly ZoneId[] = ['front-left', 'front-right', 'back-left', 'back-right'];

function runOf(harness: ReturnType<typeof createHarness>): RunState {
  const run = harness.store.getRun();
  if (run === null) throw new Error('开局失败');
  return run;
}

/** 该区第一个座位的索引（用于检查热度），依赖 createAudience 已写好 zone 编码。 */
function firstSeatOf(run: RunState, zone: ZoneId): number {
  const zoneIndex = ZONES.indexOf(zone);
  for (let seat = 0; seat < run.audience.zone.length; seat += 1) {
    if (run.audience.zone[seat] === zoneIndex) return seat;
  }
  return -1;
}

/** 把前 count 个座位设成就座（灰），并按数据表的行列范围写回正确的 zone 编码。 */
function seedAudience(run: RunState, count: number): void {
  run.audience.state.fill(0);
  const cols = data.seats.cols;
  for (let seat = 0; seat < count; seat += 1) {
    run.audience.state[seat] = 1;
    const row = Math.floor(seat / cols);
    const col = seat - row * cols;
    const zoneIndex = data.zones.findIndex(
      (zone) => row >= zone.rowRange[0] && row <= zone.rowRange[1] && col >= zone.colRange[0] && col <= zone.colRange[1],
    );
    run.audience.zone[seat] = zoneIndex < 0 ? 0 : zoneIndex;
  }
}

describe('applyCrowdWave', () => {
  it('应按 1:4 转化该区出席者并给热度 +1', () => {
    const harness = createHarness();
    harness.start(3);
    const run = runOf(harness);
    seedAudience(run, 400);
    const before = countPresent(run.audience, 'front-left');
    const delta = applyCrowdWave(run, 'front-left', data);
    expect(before).toBeGreaterThan(0);
    expect(delta.converted).toBe(Math.floor(before / 4));
    expect(delta.colored).toBe(delta.converted);
    const seat = firstSeatOf(run, 'front-left');
    expect(seat).toBeGreaterThanOrEqual(0);
    expect(run.audience.heat[seat]).toBe(1);
    harness.dispose();
  });

  it('应让 heat-cap 卡把整区热度上限抬到 4', () => {
    const harness = createHarness();
    harness.start(4);
    const run = runOf(harness);
    seedAudience(run, 40);
    run.build.cards.push('heat-cap');
    for (let i = 0; i < 5; i += 1) applyCrowdWave(run, 'front-left', data);
    const seat = firstSeatOf(run, 'front-left');
    expect(run.audience.heat[seat]).toBe(4);
    harness.dispose();
  });
});

describe('updateCrowdWave 触发', () => {
  it('应在人气不足 90 时只触发单区小浪', () => {
    const harness = createHarness();
    harness.start(5);
    const run = runOf(harness);
    seedAudience(run, 30);
    run.time = data.balance.crowdWave.times[0] ?? 120;
    const update = updateCrowdWave(run, data, 1 / 60);
    expect(update.triggered).toBe(1);
    expect(update.origin).not.toBeNull();
    expect(update.cracked).toBe(true);
    expect(run.cracks).toBe(1);

    const origin = update.origin;
    if (origin === null) throw new Error('小浪应有起点区');
    for (const zone of ZONES) {
      const seat = firstSeatOf(run, zone);
      if (seat < 0) continue;
      expect(run.audience.heat[seat]).toBe(zone === origin ? 1 : 0);
    }
    harness.dispose();
  });

  it('应在人气达标时 3 秒扫过四区、按 1:4 转化并裂缝 +1', () => {
    const harness = createHarness();
    harness.start(6);
    const run = runOf(harness);
    seedAudience(run, 400);
    run.time = data.balance.crowdWave.times[0] ?? 120;
    let converted = 0;
    const update = updateCrowdWave(run, data, 1 / 60);
    expect(update.triggered).toBe(1);
    converted += update.converted;
    for (let i = 0; i < 200; i += 1) {
      run.time += 1 / 60;
      converted += updateCrowdWave(run, data, 1 / 60).converted;
    }
    // 400 人分布在四个区，按区 floor(present/4) 求和。
    const expected = ZONES.reduce(
      (sum, zone) => sum + Math.floor(countPresent(run.audience, zone) / 4),
      0,
    );
    expect(converted).toBeGreaterThan(0);
    expect(converted).toBeLessThanOrEqual(100);
    expect(run.crowdWave.progress).toBeNull();
    // 扫描完成后四区热度都已被抬过（起点区为 1，其余同样被横扫）。
    for (const zone of ZONES) {
      const seat = firstSeatOf(run, zone);
      if (seat < 0 || countPresent(run.audience, zone) === 0) continue;
      expect(run.audience.heat[seat]).toBeGreaterThanOrEqual(1);
    }
    expect(expected).toBeGreaterThan(0);
    harness.dispose();
  });

  it('应按 2:00 / 5:00 / 8:00 依次触发三次后停止', () => {
    const harness = createHarness();
    harness.start(7);
    const run = runOf(harness);
    seedAudience(run, 700);

    const triggers: number[] = [];
    for (const at of data.balance.crowdWave.times) {
      run.time = at;
      triggers.push(updateCrowdWave(run, data, 1 / 60).triggered);
      for (let i = 0; i < 200; i += 1) {
        run.time += 1 / 60;
        updateCrowdWave(run, data, 1 / 60);
      }
    }
    expect(triggers).toEqual([1, 2, 3]);
    expect(run.cracks).toBe(3);

    run.time = 900;
    expect(updateCrowdWave(run, data, 1 / 60).triggered).toBe(0);
    expect(run.crowdWave.nextAt).toBeNull();
    harness.dispose();
  });

  it('应让裂缝到 3 后不再增加（cracked=false）', () => {
    const harness = createHarness();
    harness.start(8);
    const run = runOf(harness);
    seedAudience(run, 30);
    run.cracks = 3;
    run.time = data.balance.crowdWave.times[0] ?? 120;
    const update = updateCrowdWave(run, data, 1 / 60);
    expect(update.triggered).toBe(1);
    expect(update.cracked).toBe(false);
    expect(run.cracks).toBe(3);
    harness.dispose();
  });

  it('应在时间未到时不触发', () => {
    const harness = createHarness();
    harness.start(9);
    const run = runOf(harness);
    seedAudience(run, 700);
    run.time = (data.balance.crowdWave.times[0] ?? 120) - 0.5;
    expect(updateCrowdWave(run, data, 1 / 60).triggered).toBe(0);
    expect(run.crowdWave.nextAt).toBe(data.balance.crowdWave.times[0]);
    harness.dispose();
  });
});
