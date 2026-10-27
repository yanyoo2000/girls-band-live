/**
 * tech-spec §11 #10：成长与抽卡。
 *
 * 必测：24/10/3 互斥；offer 不含已移除卡；进化条件；`picks ≤ 10`。
 */
import { describe, expect, it } from 'vitest';
import { buildDataRegistry } from '../src/data';
import {
  CARD_IDS,
  CARD_POOL_FACTS,
  CORE_CARD_IDS,
  EVOLUTIONS,
  GENERIC_CARD_IDS,
  PROGRESSION,
} from '../src/data/cards';
import {
  addExperience,
  applyCard,
  buildOffer,
  collectModifiers,
  createBuild,
  resolveEvolution,
} from '../src/game/progression';
import { createRng } from '../src/game/rng';
import type { BuildState, CardId, RunState } from '../src/types/game';

const data = buildDataRegistry();

function makeRun(build: BuildState = createBuild()): RunState {
  return { build } as unknown as RunState;
}

describe('卡池事实（GDD §10）', () => {
  it('应有 24 张卡：3 核心 + 15 支援 + 6 通用', () => {
    expect(CARD_IDS).toHaveLength(24);
    expect(CORE_CARD_IDS).toHaveLength(3);
    expect(CARD_POOL_FACTS.support).toBe(15);
    expect(GENERIC_CARD_IDS).toHaveLength(6);
    expect(new Set(CARD_IDS).size).toBe(24);
  });

  it('应锁定 10 次选择与 3 张 offer', () => {
    expect(PROGRESSION.maxPicks).toBe(10);
    expect(PROGRESSION.offerSize).toBe(3);
    expect(PROGRESSION.thresholds).toHaveLength(10);
    expect(CARD_POOL_FACTS.remainingAfterCore).toBe(11);
    expect(CARD_POOL_FACTS.neverSeenAtLeast).toBeGreaterThanOrEqual(2);
  });
});

describe('createBuild / buildOffer', () => {
  it('应从未定核心的构筑给出三张核心', () => {
    const run = makeRun();
    const offer = buildOffer(run, data, createRng(1));
    expect(offer.offerId).toBe(1);
    expect(offer.cards).toHaveLength(3);
    expect(new Set(offer.cards)).toEqual(new Set(CORE_CARD_IDS));
  });

  it('应对同一 offerId 重复请求返回同一批卡（不可重抽）', () => {
    const run = makeRun();
    const first = buildOffer(run, data, createRng(1));
    const second = buildOffer(run, data, createRng(999));
    expect(second.cards).toEqual(first.cards);
  });

  it('应在核心落定后只从剩余 11 张里抽，且不含被移除卡', () => {
    const run = makeRun();
    applyCard(run, 'choir-wall', data);
    const build = run.build;
    expect(build.coreCard).toBe('choir-wall');
    expect(build.picks).toBe(1);
    // 另外 2 张核心 + 另外 2 条构筑的 10 张支援 = 12 张永久移除。
    expect(build.removed).toHaveLength(12);
    expect(build.removed).toContain('solo-return');
    expect(build.removed).toContain('bait-line');
    expect(build.removed).toContain('shield');

    const offer = buildOffer(run, data, createRng(5));
    expect(offer.offerId).toBe(2);
    for (const card of offer.cards) {
      expect(build.removed).not.toContain(card);
      expect(CORE_CARD_IDS).not.toContain(card);
    }
  });

  it('应在 picks 达到 10 后返回空 offer', () => {
    const run = makeRun();
    const build = run.build;
    build.coreCard = 'choir-wall';
    build.picks = PROGRESSION.maxPicks;
    const offer = buildOffer(run, data, createRng(3));
    expect(offer.cards).toEqual([]);
  });
});

describe('addExperience', () => {
  it('应在达到首个阈值（25）时给出核心三选一', () => {
    const run = makeRun();
    const rng = createRng(11);
    expect(addExperience(run, 24, rng)).toBeNull();
    const offer = addExperience(run, 1, rng);
    expect(offer).not.toBeNull();
    expect(offer?.offerId).toBe(1);
    expect(offer?.cards).toHaveLength(3);
  });

  it('应在未处理当前三选一时不再连发（返回 null）', () => {
    const run = makeRun();
    const rng = createRng(13);
    expect(addExperience(run, 25, rng)).not.toBeNull();
    expect(addExperience(run, 100, rng)).toBeNull();
  });

  it('应在选卡后按下一档阈值继续给 offer，且多出的经验保留', () => {
    const run = makeRun();
    const rng = createRng(17);
    expect(addExperience(run, 70, rng)).not.toBeNull();
    applyCard(run, 'choir-wall', data);
    // 70 经验已跨过 60 档：下一次调用（amount=0）应直接再给一张。
    const second = addExperience(run, 0, rng);
    expect(second).not.toBeNull();
    expect(second?.offerId).toBe(2);
  });

  it('应让 picks 永不超过 maxPicks', () => {
    const run = makeRun();
    const rng = createRng(19);
    applyCard(run, 'choir-wall', data);
    let guard = 0;
    while (run.build.picks < PROGRESSION.maxPicks && guard < 30) {
      const offer = buildOffer(run, data, rng);
      const next = offer.cards.find((card) => !run.build.cards.includes(card));
      if (next === undefined) break;
      applyCard(run, next, data);
      guard += 1;
    }
    expect(run.build.picks).toBe(PROGRESSION.maxPicks);
    expect(addExperience(run, 10_000, rng)).toBeNull();
  });
});

describe('进化条件', () => {
  it('应在核心 + 3 张指定支援齐备时解析出对应进化', () => {
    const build = createBuild();
    build.coreCard = 'choir-wall';
    build.cards = ['four-part', 'sing-under-light', 'front-row'];
    expect(resolveEvolution(build, data)).toBe('choir-hall');
    expect(EVOLUTIONS['choir-hall'].requires).toEqual(['four-part', 'sing-under-light', 'front-row']);
  });

  it('应在缺一张时保持未进化，并让 applyCard 写入 evolution', () => {
    const run = makeRun();
    applyCard(run, 'solo-return', data);
    applyCard(run, 'shield', data);
    applyCard(run, 'solo-extend', data);
    expect(run.build.evolution).toBeNull();
    applyCard(run, 'burn-chain', data);
    expect(run.build.evolution).toBe('solo-show');
    expect(run.build.evolutionFired).toBe(false);
  });

  it('应在核心为 null 时返回 null', () => {
    const build = createBuild();
    build.cards = ['four-part', 'sing-under-light', 'front-row'];
    expect(resolveEvolution(build, data)).toBeNull();
  });
});

describe('collectModifiers', () => {
  it('应与 upgrades.modifierTotals 同源（核心 + 支援的 key 生效）', () => {
    const build = createBuild();
    build.coreCard = 'choir-wall';
    build.cards = ['heat-cap' as CardId];
    const totals = collectModifiers(build, data);
    expect((totals.get('heat-cap') ?? 0)).toBeGreaterThan(0);
  });
});
