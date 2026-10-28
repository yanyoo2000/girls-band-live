/**
 * 合唱可闻性：四档总人气 30 / 61 / 128 / 256 的单声部目标增益。
 *
 * 验收依据：docs/feedback/playtester-05-audio.md P3（常规 C 局 −30~−45dB 不可闻）。
 */
import { describe, expect, it } from 'vitest';
import { CHOIR_VOICE_GAIN, choirVoiceGain } from '../src/audio/choir';

function toDb(gain: number): number {
  return 20 * Math.log10(Math.max(gain, 1e-9));
}

describe('choirVoiceGain', () => {
  it('四档总人气（每区 7.5 / 15.25 / 32 / 64）应单调递增且相邻差 ≥2dB', () => {
    const totals = [30, 61, 128, 256];
    const gains = totals.map((total) => choirVoiceGain(total / 4, 0, 1));
    for (let i = 1; i < gains.length; i += 1) {
      const previous = gains[i - 1] ?? 0;
      const current = gains[i] ?? 0;
      expect(current).toBeGreaterThan(previous);
      expect(toDb(current) - toDb(previous)).toBeGreaterThanOrEqual(2);
    }
    // 30 人约 −17.7dB、256 人约 −8.4dB；旧参数（0.22）在 30 人时约 −21.4dB。
    expect(gains[0] ?? 0).toBeCloseTo(0.13, 2);
    expect(gains[3] ?? 0).toBeCloseTo(CHOIR_VOICE_GAIN, 2);
  });

  it('0 人不发声；未满 64 人的中层/远层保持 0（逐层加入）', () => {
    expect(choirVoiceGain(0, 0, 1)).toBe(0);
    expect(choirVoiceGain(32, 1, 1)).toBe(0);
    expect(choirVoiceGain(32, 2, 1)).toBe(0);
    expect(choirVoiceGain(96, 1, 1)).toBeGreaterThan(0);
  });

  it('区增益 0 或负值应被钳到 0，且输出不超过 1', () => {
    expect(choirVoiceGain(192, 0, 0)).toBe(0);
    expect(choirVoiceGain(192, 0, -1)).toBe(0);
    expect(choirVoiceGain(192, 0, 1)).toBeLessThanOrEqual(1);
  });
});
