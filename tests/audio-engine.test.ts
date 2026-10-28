/**
 * 音频引擎验收：空场不永久静音、Boss 静默为 0、三路音量、失焦与销毁。
 *
 * 用 `tests/helpers/fake-audio.ts` 的最小 WebAudio 替身，不需要浏览器。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDataRegistry } from '../src/data';
import {
  applyAudioMix,
  createAudioEngine,
  readEngineChoirGain,
  readEngineMasterGain,
  readEngineMusicGain,
  readEngineSilenceGain,
  readEngineSilenceKind,
  readEngineSilenceTarget,
  setAudioHostHidden,
} from '../src/audio/engine';
import type { AudioEngine } from '../src/audio/engine';
import { installFakeAudio, readFakeNow, setFakeNow } from './helpers/fake-audio';

const data = buildDataRegistry();
let restore: (() => void) | null = null;
let engine: AudioEngine | null = null;

function requireEngine(): AudioEngine {
  if (engine === null) throw new Error('createAudioEngine 未返回引擎');
  return engine;
}

beforeEach(async () => {
  restore = installFakeAudio();
  engine = await createAudioEngine(data);
});

afterEach(() => {
  engine?.dispose();
  engine = null;
  restore?.();
  restore = null;
});

describe('空场不永久静音', () => {
  it('非 Boss 窗口的 setSilenced(true) 目标应为 0.22，而不是 0', async () => {
    const audio = requireEngine();
    await audio.start();
    audio.setSilenced(true);
    expect(readEngineSilenceKind(audio)).toBe('empty-house');
    expect(readEngineSilenceTarget(audio)).toBeCloseTo(0.22, 5);
    expect(readEngineSilenceGain(audio)).toBeCloseTo(0.22, 5);
    audio.setSilenced(false);
    expect(readEngineSilenceTarget(audio)).toBe(1);
  });

  it('Boss 窗口（6:30–6:45）的 setSilenced(true) 目标为 0，恢复后为 1', async () => {
    const audio = requireEngine();
    await audio.start();
    setFakeNow(390);
    audio.setSilenced(true);
    expect(readEngineSilenceKind(audio)).toBe('boss');
    expect(readEngineSilenceTarget(audio)).toBe(0);
    expect(readEngineSilenceGain(audio)).toBe(0);
    audio.setSilenced(false);
    expect(readEngineSilenceTarget(audio)).toBe(1);
  });

  it('Boss 静默超过 16s 未恢复时按空场兜底，不得永久静音', async () => {
    vi.useFakeTimers();
    try {
      const audio = requireEngine();
      await audio.start();
      setFakeNow(390);
      audio.setSilenced(true);
      expect(readEngineSilenceKind(audio)).toBe('boss');
      // 推进 17s：每 50ms 推进假时钟 + 定时器，触发 watchdog。
      for (let i = 0; i < 340; i += 1) {
        setFakeNow(readFakeNow() + 0.05);
        vi.advanceTimersByTime(50);
      }
      expect(readEngineSilenceKind(audio)).toBe('empty-house');
      expect(readEngineSilenceTarget(audio)).toBeCloseTo(0.22, 5);
    } finally {
      vi.useRealTimers();
    }
  });

  it('空场后 setSilenced(false) 必须能恢复（对应 store 的 Boss 结束路径）', async () => {
    const audio = requireEngine();
    await audio.start();
    setFakeNow(480);
    audio.setSilenced(true);
    expect(readEngineSilenceKind(audio)).toBe('empty-house');
    audio.setSilenced(false);
    expect(readEngineSilenceTarget(audio)).toBe(1);
  });
});

describe('三路音量与失焦', () => {
  it('applyAudioMix 应分别设置 master / music / sfx', async () => {
    const audio = requireEngine();
    await audio.start();
    applyAudioMix(audio, { master: 0.4, music: 0.2, sfx: 1 });
    expect(readEngineMusicGain(audio)).toBeCloseTo(0.2, 5);
    expect(readEngineMasterGain(audio)).toBeCloseTo(0.4, 5);
  });

  it('隐藏时应把 master 降到 12%，恢复回原值', async () => {
    const audio = requireEngine();
    await audio.start();
    applyAudioMix(audio, { master: 0.8, music: 0.7, sfx: 0.8 });
    setAudioHostHidden(audio, true);
    expect(readEngineMasterGain(audio)).toBeCloseTo(0.096, 5);
    setAudioHostHidden(audio, false);
    expect(readEngineMasterGain(audio)).toBeCloseTo(0.8, 5);
  });
});

describe('升级三选一 duck（不中断）', () => {
  it('setChoir 超过 2.6s 未更新时音乐降到 22%，再次 setChoir 恢复', async () => {
    vi.useFakeTimers();
    try {
      const audio = requireEngine();
      await audio.start();
      const mix = {
        'front-left': { audience: 8, heat: 1 as const, gain: 0.5, pan: -0.55 },
        'front-right': { audience: 8, heat: 1 as const, gain: 0.5, pan: 0.55 },
        'back-left': { audience: 4, heat: 1 as const, gain: 0.4, pan: -0.25 },
        'back-right': { audience: 4, heat: 1 as const, gain: 0.4, pan: 0.25 }
      };
      audio.setChoir(mix);
      // 推进 3.2s：每 50ms 推进假时钟 + 定时器，让 tick 触发 duck 判定。
      for (let i = 0; i < 64; i += 1) {
        setFakeNow(readFakeNow() + 0.05);
        vi.advanceTimersByTime(50);
      }
      expect(readEngineMusicGain(audio)).toBeCloseTo(0.7 * 0.22, 4);
      audio.setChoir(mix);
      expect(readEngineMusicGain(audio)).toBeCloseTo(0.7, 4);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('节点清理', () => {
  it('start 后节点数 >40，dispose 后归零', async () => {
    const audio = requireEngine();
    await audio.start();
    expect(audio.nodeCount()).toBeGreaterThan(40);
    expect(readEngineChoirGain(audio)).toBeGreaterThan(0);
    audio.dispose();
    expect(audio.nodeCount()).toBe(0);
    engine = null;
  });
});
