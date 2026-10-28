/**
 * t117 M3：结算“第二排空位”按四区各自第二排统计（共 64 席），
 * 不再只数全场第 1 排（旧实现在 664 空位时仍可能报 0）。
 */
import { describe, expect, it } from 'vitest';
import { buildDataRegistry } from '../src/data';
import { countSecondRowEmpty } from '../src/game/store';
import type { AudienceFrame } from '../src/types/game';

const data = buildDataRegistry();

function emptyFrame(): AudienceFrame {
  const size = data.seats.capacity;
  return {
    size,
    revision: 0,
    state: new Uint8Array(size),
    heat: new Uint8Array(size),
    phone: new Uint8Array(size),
    zone: new Uint8Array(size),
    tint: new Float32Array(size),
    dirty: [],
  };
}

describe('第二排空位（四区）', () => {
  it('空场时应为 4 区 × 16 席 = 64', () => {
    expect(countSecondRowEmpty(data, emptyFrame())).toBe(64);
  });

  it('填满每区第二排后应为 0，填一半应为 32', () => {
    const frame = emptyFrame();
    let filled = 0;
    for (const zone of data.zones) {
      const row = Math.min(zone.rowRange[1], zone.rowRange[0] + 1);
      for (let col = zone.colRange[0]; col <= zone.colRange[1]; col += 1) {
        frame.state[row * data.seats.cols + col] = 2;
        filled += 1;
      }
    }
    expect(filled).toBe(64);
    expect(countSecondRowEmpty(data, frame)).toBe(0);

    const half = emptyFrame();
    for (const zone of data.zones) {
      const row = Math.min(zone.rowRange[1], zone.rowRange[0] + 1);
      for (let col = zone.colRange[0]; col < zone.colRange[0] + 8; col += 1) {
        half.state[row * data.seats.cols + col] = 2;
      }
    }
    expect(countSecondRowEmpty(data, half)).toBe(32);
  });
});
