/**
 * tech-spec §11 #13：HUD 快照。
 *
 * 必测：白光公式以「本局峰值人气」为满血基准（t108 修正：开局 30/768 不再 0.82 洗白）；
 * 四区 waiting；0 数字（字段无 number 展示项）。
 */
import { describe, expect, it } from 'vitest';
import { computeWhiteout, countPresent } from '../src/game/audience';
import { createHarness } from './helpers/store';

describe('computeWhiteout', () => {
  it('应在满场时为 0、空场时为 0.85', () => {
    expect(computeWhiteout(768, 768)).toBe(0);
    expect(computeWhiteout(0, 768)).toBeCloseTo(0.85, 10);
  });

  it('应在线性中点给出 0.425', () => {
    expect(computeWhiteout(384, 768)).toBeCloseTo(0.425, 10);
  });

  it('应单调递减且永不超过 0.85', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let audience = 0; audience <= 768; audience += 24) {
      const value = computeWhiteout(audience, 768);
      expect(value).toBeLessThanOrEqual(0.85);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(previous);
      previous = value;
    }
  });

  it('应以峰值人气为满血基准（开局 30 人时为 0，不是 0.82）', () => {
    // t108 修复：旧公式 0.85×(1−30/768)=0.8168 会把前 90 秒洗白。
    expect(computeWhiteout(30, 768)).toBeCloseTo(0.816796875, 9);
    expect(computeWhiteout(30, 768, 30)).toBe(0);
    expect(computeWhiteout(15, 768, 30)).toBeCloseTo(0.425, 10);
    expect(computeWhiteout(0, 768, 30)).toBeCloseTo(0.85, 10);
    // 峰值 300 时掉到 150：掉一半 → 0.425。
    expect(computeWhiteout(150, 768, 300)).toBeCloseTo(0.425, 10);
    // 观众超过峰值（成长中）也不会出现负值。
    expect(computeWhiteout(400, 768, 300)).toBe(0);
  });

  it('应对越界输入 clamp（负观众、超容量、容量 0）', () => {
    expect(computeWhiteout(-10, 768)).toBeCloseTo(0.85, 10);
    expect(computeWhiteout(9999, 768)).toBe(0);
    expect(computeWhiteout(100, 0)).toBeCloseTo(0.85, 10);
  });
});

describe('HudSnapshot 形状', () => {
  it('应在开局前返回空快照（4 区、无数字展示项）', () => {
    const harness = createHarness();
    const hud = harness.store.getHud();
    expect(hud.zones).toHaveLength(4);
    expect(hud.whiteout).toBeCloseTo(0.85, 10);
    expect(hud.runSeconds).toBe(0);
    harness.dispose();
  });

  it('应在开局后按峰值人气给出白光比例（开局为 0）', () => {
    const harness = createHarness();
    harness.start(42);
    const run = harness.store.getRun();
    expect(run).not.toBeNull();
    const present = run === null ? 0 : countPresent(run.audience, null);
    expect(present).toBeGreaterThan(0);
    const peak = Math.max(present, run?.stats.peakAudience ?? present);
    const hud = harness.store.getHud();
    expect(hud.whiteout).toBeCloseTo(computeWhiteout(present, 768, peak), 10);
    // 开局满血：白光必须为 0，不能因“空座多”把前 90 秒洗白。
    expect(hud.whiteout).toBeCloseTo(0, 10);
    harness.dispose();
  });

  it('应让四区 id 顺序固定为前左/前右/后左/后右', () => {
    const harness = createHarness();
    harness.start(7);
    const hud = harness.store.getHud();
    expect(hud.zones.map((zone) => zone.id)).toEqual([
      'front-left',
      'front-right',
      'back-left',
      'back-right',
    ]);
    for (const zone of hud.zones) {
      expect(zone.heat).toBeGreaterThanOrEqual(0);
      expect(zone.heat).toBeLessThanOrEqual(4);
      expect(typeof zone.waiting).toBe('boolean');
      expect(typeof zone.blackened).toBe('boolean');
    }
    harness.dispose();
  });

  it('应让 waiting 表示「热度 0 + 有人 + 光没照到」', () => {
    const harness = createHarness();
    harness.start(11);
    const run = harness.store.getRun();
    if (run === null) throw new Error('开局失败');
    const hud = harness.store.getHud();
    for (const zoneHud of hud.zones) {
      const zoneState = run.zones[zoneHud.id];
      const present = countPresent(run.audience, zoneHud.id);
      const expected = zoneState.heat === 0 && present > 0 && zoneState.litSeats === 0;
      expect(zoneHud.waiting).toBe(expected);
    }
    harness.dispose();
  });

  it('应让快照不含「人数/击杀/伤害/血量」这类展示数字字段', () => {
    const harness = createHarness();
    harness.start(13);
    const hud = harness.store.getHud() as unknown as Record<string, unknown>;
    for (const forbidden of ['audience', 'kills', 'damage', 'hp', 'health', 'score', 'count']) {
      expect(hud).not.toHaveProperty(forbidden);
    }
    // 所有比例字段都在 0..1。
    for (const key of ['whiteout', 'lightCoverage', 'noisePressure', 'beatPhase', 'holdProgress']) {
      const value = hud[key];
      expect(typeof value).toBe('number');
      expect(value as number).toBeGreaterThanOrEqual(0);
      expect(value as number).toBeLessThanOrEqual(1);
    }
    harness.dispose();
  });

  it('应在 tick 后推进 runSeconds 并保持 revision 单调', () => {
    const harness = createHarness();
    harness.start(17);
    const before = harness.store.getHud();
    harness.tick(60);
    const after = harness.store.getHud();
    expect(after.runSeconds).toBeGreaterThan(before.runSeconds);
    expect(after.revision).toBeGreaterThanOrEqual(before.revision);
    harness.dispose();
  });
});
