/**
 * tech-spec §11 #2：音乐时钟（唯一时间基准）。
 *
 * 必测：128BPM / 4/4 / 304 小节；tick ↔ 秒映射；乐句边界。
 *
 * 说明：时钟由 `createAudioEngine` 内部创建并通过 `AudioPort.clock` 暴露。
 * `createAudioEngine` 在没有 `AudioContext` 的环境返回 null（静默降级），
 * 因此本文件注入一个最小 stub 让引擎完成构造（不调用 start，不建音频图）。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAudioEngine } from '../src/audio/engine';
import type { AudioEngine } from '../src/audio/engine';
import { buildDataRegistry } from '../src/data';
import { BEAT_GRID, SECONDS_PER_BAR, SECONDS_PER_BEAT } from '../src/data/segments';

const data = buildDataRegistry();
let createdEngine: AudioEngine | null = null;
const hadAudioContext = 'AudioContext' in globalThis;

beforeAll(async () => {
  if (!hadAudioContext) {
    (globalThis as unknown as { AudioContext: unknown }).AudioContext = class {};
  }
  createdEngine = await createAudioEngine(data);
});

afterAll(() => {
  createdEngine?.dispose();
  if (!hadAudioContext) {
    delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext;
  }
});

function clock() {
  const engine = createdEngine;
  if (engine === null) throw new Error('createAudioEngine 未返回引擎（stub AudioContext 注入失败）');
  return engine.clock;
}

describe('拍点常量', () => {
  it('应为 128BPM / 4/4 / 304 小节 / 每小节 8 拍乐句', () => {
    expect(BEAT_GRID.bpm).toBe(128);
    expect(BEAT_GRID.beatsPerBar).toBe(4);
    expect(BEAT_GRID.barsPerPhrase).toBe(8);
    expect(BEAT_GRID.totalBars).toBe(304);
    expect(SECONDS_PER_BEAT).toBeCloseTo(0.46875, 10);
    expect(SECONDS_PER_BAR).toBeCloseTo(1.875, 10);
    expect(SECONDS_PER_BAR * BEAT_GRID.totalBars).toBeCloseTo(570, 10);
  });
});

describe('positionAt', () => {
  it('应把 0s 映射到第 0 小节第 0 拍', () => {
    const position = clock().positionAt(0);
    expect(position.bar).toBe(0);
    expect(position.beat).toBe(0);
    expect(position.beatPhase).toBe(0);
    expect(position.phraseBeat).toBe(0);
    expect(position.bpm).toBe(128);
  });

  it('应把 1 拍 / 1 小节 / 2 小节映射到正确位置', () => {
    const beat1 = clock().positionAt(SECONDS_PER_BEAT);
    expect(beat1.bar).toBe(0);
    expect(beat1.beat).toBe(1);
    expect(beat1.beatPhase).toBeCloseTo(0, 6);

    const bar1 = clock().positionAt(SECONDS_PER_BAR);
    expect(bar1.bar).toBe(1);
    expect(bar1.beat).toBe(0);

    const bar2 = clock().positionAt(SECONDS_PER_BAR * 2 + SECONDS_PER_BEAT * 2);
    expect(bar2.bar).toBe(2);
    expect(bar2.beat).toBe(2);
  });

  it('应把 beatPhase 夹在 0..1（拍中间为 0.5）', () => {
    const position = clock().positionAt(SECONDS_PER_BEAT * 0.5);
    expect(position.beat).toBe(0);
    expect(position.beatPhase).toBeCloseTo(0.5, 6);
  });

  it('应对负数时间钳到 0', () => {
    const position = clock().positionAt(-10);
    expect(position.bar).toBe(0);
    expect(position.beat).toBe(0);
  });

  it('应让 9:30 之前落在第 303 小节内，9:30 之后为 304', () => {
    const last = clock().positionAt(569.9);
    expect(last.bar).toBe(303);
    const end = clock().positionAt(570);
    expect(end.bar).toBe(304);
  });

  it('应把 segmentProgress 夹在 0..1', () => {
    const start = clock().positionAt(0);
    expect(start.segmentProgress).toBe(0);
    const later = clock().positionAt(SECONDS_PER_BAR * 100);
    expect(later.segmentProgress).toBeGreaterThanOrEqual(0);
    expect(later.segmentProgress).toBeLessThanOrEqual(1);
  });
});

describe('tickAt', () => {
  it('应给出从 0 起的拍序号与对应秒数', () => {
    const tick0 = clock().tickAt(0);
    expect(tick0.index).toBe(0);
    expect(tick0.time).toBeCloseTo(0, 10);
    expect(tick0.bar).toBe(0);
    expect(tick0.beat).toBe(0);
    expect(tick0.isBarStart).toBe(true);
    expect(tick0.strength).toBe('strong');

    const tick5 = clock().tickAt(SECONDS_PER_BEAT * 5 + 0.01);
    expect(tick5.index).toBe(5);
    expect(tick5.bar).toBe(1);
    expect(tick5.beat).toBe(1);
    expect(tick5.time).toBeCloseTo(SECONDS_PER_BEAT * 5, 10);
    expect(tick5.strength).toBe('weak');
  });

  it('应让 tick.time 与 index × 每拍秒数严格对应', () => {
    for (const index of [0, 1, 4, 31, 1215]) {
      const tick = clock().tickAt(SECONDS_PER_BEAT * index + 0.001);
      expect(tick.index).toBe(index);
      expect(tick.time).toBeCloseTo(SECONDS_PER_BEAT * index, 6);
    }
  });

  it('应让第 8 小节成为下一个乐句（phrase 1、phraseBeat 0）', () => {
    const tick = clock().tickAt(SECONDS_PER_BAR * 8);
    expect(tick.bar).toBe(8);
    expect(tick.beat).toBe(0);
    expect(tick.phrase).toBe(1);
    expect(tick.isBarStart).toBe(true);

    const before = clock().tickAt(SECONDS_PER_BAR * 8 - 0.001);
    expect(before.bar).toBe(7);
    expect(before.phrase).toBe(0);
  });

  it('应让最后一个小节（303）仍在全曲内', () => {
    const tick = clock().tickAt(SECONDS_PER_BAR * 303);
    expect(tick.bar).toBe(303);
    expect(tick.index).toBe(303 * 4);
  });
});

describe('降级与运行状态', () => {
  it('应在无 AudioContext 环境返回 null（静默降级）', async () => {
    const saved = (globalThis as unknown as { AudioContext?: unknown }).AudioContext;
    delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext;
    await expect(createAudioEngine(data)).resolves.toBeNull();
    if (saved !== undefined) {
      (globalThis as unknown as { AudioContext: unknown }).AudioContext = saved;
    }
  });

  it('应在未 start 时 isRunning() 为 false', () => {
    expect(clock().isRunning()).toBe(false);
  });
});
