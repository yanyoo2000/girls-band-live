/**
 * 静默/空场/duck 的纯函数：窗口判定、目标增益、小节量化、冻结判定。
 *
 * 验收依据：docs/feedback/playtester-05-audio.md P1/P2/P5 与 docs/reports/feedback-bug-audit.md。
 */
import { describe, expect, it } from 'vitest';
import {
  isBossSilenceWindow,
  nextBarTime,
  shouldDuckMusic,
  silenceTargetFor,
} from '../src/audio/engine';
import { buildDataRegistry } from '../src/data';

const data = buildDataRegistry();

describe('isBossSilenceWindow', () => {
  it('只把 6:30–6:45 的 8 小节判为 Boss 静默', () => {
    expect(isBossSilenceWindow(389, data)).toBe(false);
    expect(isBossSilenceWindow(390, data)).toBe(true);
    expect(isBossSilenceWindow(404.9, data)).toBe(true);
    expect(isBossSilenceWindow(406, data)).toBe(false);
    expect(isBossSilenceWindow(500, data)).toBe(false);
  });

  it('空场发生在终曲（7:40 后）时不应判为 Boss', () => {
    expect(isBossSilenceWindow(480, data)).toBe(false);
  });
});

describe('silenceTargetFor', () => {
  it('Boss 静默为数字零，空场保留 0.22', () => {
    expect(silenceTargetFor('boss')).toBe(0);
    expect(silenceTargetFor('empty-house')).toBeCloseTo(0.22, 5);
  });
});

describe('nextBarTime', () => {
  it('应量化到下一小节开始（128BPM/4/4 = 1.875s）', () => {
    // startTime 0.1，now 1.9 → 已过 0.96 小节 → 下一小节 1.975。
    expect(nextBarTime(0.1, 1.9, 1.875)).toBeCloseTo(1.975, 6);
    // 正好在小节边界时不应跳到再下一小节。
    expect(nextBarTime(0, 1.875, 1.875)).toBeCloseTo(1.875, 6);
    expect(nextBarTime(0, 0.2, 1.875)).toBeCloseTo(1.875, 6);
  });
});

describe('shouldDuckMusic', () => {
  it('有合唱混音且超过 2.6s 未更新才 duck', () => {
    expect(shouldDuckMusic(10, 7, true)).toBe(true);
    expect(shouldDuckMusic(10, 8.5, true)).toBe(false);
    expect(shouldDuckMusic(10, 0, false)).toBe(false);
  });
});
