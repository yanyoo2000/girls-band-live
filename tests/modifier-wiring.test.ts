/**
 * t139：卡效果接线 / 统计回写 / 锁定可解 / 安可窗口 的行为测试。
 * 只测公开消费点，不复制实现。
 */
import { describe, expect, it } from 'vitest';
import { buildDataRegistry } from '../src/data';
import { countPresent } from '../src/game/audience';
import { noiseConversionValue } from '../src/game/combat';
import { applyCard, collectModifiers } from '../src/game/progression';
import { MAX_RETURN_LOCK_SECONDS, updateReturnListener } from '../src/game/enemies';
import { baitZoneWeight } from '../src/game/waves';
import { createHarness } from './helpers/store';
import type { InputFrame } from '../src/types/game';

const data = buildDataRegistry();

function input(pointer: { x: number; z: number }, ndc = 0.6): InputFrame {
  return {
    move: { x: 0, z: 0 },
    pointerNdc: { x: ndc, z: ndc },
    pointerWorld: pointer,
    beamHeld: false,
    ignitePressed: false,
    interactHeld: false,
    holdSeconds: 0,
    pausePressed: false,
  };
}

describe('t139 卡效果接线', () => {
  it('第二排：每 30s 后台 +5 人（与无卡基线对照）', () => {
    const base = createHarness();
    base.start(11);
    const baseRun = base.store.getRun()!;
    applyCard(baseRun, 'choir-wall', data);
    const withCard = createHarness();
    withCard.start(11);
    const cardRun = withCard.store.getRun()!;
    applyCard(cardRun, 'choir-wall', data);
    applyCard(cardRun, 'second-row', data);

    for (let i = 0; i < 31 * 60; i += 1) {
      for (const h of [base, withCard]) {
        h.tick(1);
        const cur = h.store.getRun()!;
        if (cur.phase === 'levelup' && cur.offer?.cards?.[0]) {
          h.store.dispatch({ type: 'choose-card', cardId: cur.offer.cards[0] });
        }
      }
    }
    const basePresent = countPresent(baseRun.audience, null);
    const cardPresent = countPresent(cardRun.audience, null);
    expect(cardPresent).toBeGreaterThanOrEqual(basePresent + 5);
    base.dispose();
    withCard.dispose();
  });

  it('合唱墙：wave-convert-count 接到唱化产出（1 只 = 4 人）', () => {
    const h = createHarness();
    h.start(12);
    const run = h.store.getRun()!;
    applyCard(run, 'choir-wall', data);
    expect(noiseConversionValue(run, data)).toBe(4);
    h.dispose();
  });

  it('引线：bait-zone-multiplier 接到招灾权重（×2）', () => {
    const h = createHarness();
    h.start(13);
    const run = h.store.getRun()!;
    applyCard(run, 'bait-line', data);
    run.light.lightingZone = 'front-left';
    expect(baitZoneWeight(run, data)).toBe(2);
    h.dispose();
  });

  it('回照：盾值在 self 形态下初始化并可读', () => {
    const h = createHarness();
    h.start(14);
    const run = h.store.getRun()!;
    applyCard(run, 'solo-return', data);
    expect(collectModifiers(run.build, data).get('shield-max')).toBe(60);
    const player = run.player.position;
    h.tick(1, input({ x: 0, z: 0 }, 0));
    h.tick(30, input(player, 0.8));
    const hud = h.store.getHud();
    expect(run.light.mode).toBe('self');
    expect(run.light.soloShield).toBeGreaterThan(0);
    expect(hud.soloShield ?? 0).toBeGreaterThan(0);
    h.dispose();
  });

  it('局内统计：HUD 构建后 run.stats 回写，与结算同源', () => {
    const h = createHarness();
    h.start(15);
    h.tick(12 * 60);
    const run = h.store.getRun()!;
    h.store.getHud();
    expect(run.stats.converted).toBeGreaterThan(0);
    expect(run.stats.converted).toBeGreaterThanOrEqual(run.stats.covered);
    h.dispose();
  });

  it('两局不串：restart 后 build/core/cards 清空', () => {
    const h = createHarness();
    h.start(16);
    const first = h.store.getRun()!;
    applyCard(first, 'choir-wall', data);
    applyCard(first, 'second-row', data);
    expect(first.build.cards.length).toBeGreaterThan(0);
    h.start(17);
    const second = h.store.getRun()!;
    expect(second.build.coreCard).toBeNull();
    expect(second.build.cards).toEqual([]);
    expect(second.build.picks).toBe(0);
    h.dispose();
  });
});

describe('t139 反驻守/安可', () => {
  it('返听：光心累计位移 ≥8m 或 7s 兜底可解除', () => {
    const h = createHarness();
    h.start(18);
    const run = h.store.getRun()!;
    const listener = run.returnListener;
    listener.active = true;
    listener.locked = true;
    listener.anchor = { x: 0, z: 0 };
    listener.lockOrigin = { x: 0, z: 0 };
    run.light.position = { x: 9, z: 0 };
    listener.lockSeconds = 0;
    const moved = updateReturnListener(run, data, 1 / 60);
    expect(moved.released).toBe(true);
    expect(listener.locked).toBe(false);

    listener.active = true;
    listener.locked = true;
    listener.anchor = { x: 0, z: 0 };
    listener.lockOrigin = { x: 0, z: 0 };
    run.light.position = { x: 0, z: 0 };
    listener.lockSeconds = MAX_RETURN_LOCK_SECONDS;
    const timeout = updateReturnListener(run, data, 1 / 60);
    expect(timeout.released).toBe(true);
    h.dispose();
  });

  it('安可窗口：人气归零先进入 paused/安可，而不是直接 empty-house', () => {
    const h = createHarness();
    h.start(19);
    const run = h.store.getRun()!;
    run.audience.state.fill(0);
    h.tick(2);
    expect(run.phase).toBe('paused');
    expect(run.lowAudienceBars).toBeGreaterThanOrEqual(data.balance.run.lowAudienceBars);
    h.store.dispatch({ type: 'encore' });
    const after = h.store.getRun()!;
    expect(after.phase).toBe('playing');
    expect(after.encoreUsed).toBe(true);
    expect(countPresent(after.audience, null)).toBeGreaterThan(0);
    h.dispose();
  });
});
