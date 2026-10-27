/**
 * tech-spec §11 #17：卡效果运行时。
 *
 * 必测：单卡应用一次、核心互斥、`heatCapFor` 3/4、modifier 加法与上限取 max。
 */
import { describe, expect, it } from 'vitest';
import { buildDataRegistry } from '../src/data';
import {
  applyUpgrade,
  createUpgradeRuntime,
  heatCapFor,
  modifierTotals,
} from '../src/game/upgrades';
import { createBuild } from '../src/game/progression';
import type { BuildState } from '../src/types/game';

const data = buildDataRegistry();

describe('applyUpgrade', () => {
  it('应让核心卡落定并永久移除另外两张核心与其它构筑支援', () => {
    const build = createBuild();
    expect(applyUpgrade(build, 'bait-line', data)).toBe(true);
    expect(build.coreCard).toBe('bait-line');
    expect(build.picks).toBe(1);
    expect(build.removed).toHaveLength(12);
    expect(build.removed).toContain('choir-wall');
    expect(build.removed).toContain('solo-return');
    expect(build.removed).toContain('four-part');
  });

  it('应拒绝第二次核心（核心互斥）', () => {
    const build = createBuild();
    applyUpgrade(build, 'choir-wall', data);
    expect(applyUpgrade(build, 'solo-return', data)).toBe(false);
    expect(build.coreCard).toBe('choir-wall');
  });

  it('应拒绝核心落定前的支援/通用卡', () => {
    const build = createBuild();
    expect(applyUpgrade(build, 'four-part', data)).toBe(false);
    expect(applyUpgrade(build, 'breathe', data)).toBe(false);
    expect(build.picks).toBe(0);
  });

  it('应拒绝其它构筑的支援卡', () => {
    const build = createBuild();
    applyUpgrade(build, 'choir-wall', data);
    expect(applyUpgrade(build, 'shield', data)).toBe(false);
    expect(build.cards).toEqual([]);
  });

  it('应允许同构筑支援与通用卡，且每张只能拿一次', () => {
    const build = createBuild();
    applyUpgrade(build, 'choir-wall', data);
    expect(applyUpgrade(build, 'four-part', data)).toBe(true);
    expect(applyUpgrade(build, 'four-part', data)).toBe(false);
    expect(applyUpgrade(build, 'breathe', data)).toBe(true);
    expect(build.picks).toBe(3);
    expect(build.cards).toEqual(['four-part', 'breathe']);
  });

  it('应拒绝已永久移除的卡', () => {
    const build = createBuild();
    applyUpgrade(build, 'choir-wall', data);
    expect(build.removed).toContain('shield');
    expect(applyUpgrade(build, 'shield', data)).toBe(false);
  });

  it('应在 picks 达到 maxPicks 后拒绝写入', () => {
    const build: BuildState = createBuild();
    build.coreCard = 'choir-wall';
    build.picks = data.progression.maxPicks;
    expect(applyUpgrade(build, 'four-part', data)).toBe(false);
  });

  it('应对未知卡 id 返回 false 且不写状态', () => {
    const build = createBuild();
    // 运行期脏数据：非法 CardId 不应写入。
    expect(applyUpgrade(build, 'not-a-card' as never, data)).toBe(false);
    expect(build.picks).toBe(0);
  });
});

describe('modifierTotals', () => {
  it('应对同名 key 做加法、对上限类 key 取 max', () => {
    const build = createBuild();
    build.coreCard = 'choir-wall';
    // 手工构造重复 key：heat-cap 属 max 折叠（4 而非 8），all-zone 属 add 折叠（0.2+0.2）。
    build.cards = ['heat-cap', 'heat-cap', 'four-part', 'four-part'];
    const totals = modifierTotals(build, data);
    expect(totals.get('heat-cap')).toBe(4);
    expect(totals.get('all-zone-damage-multiplier')).toBeCloseTo(0.4, 10);
    expect(totals.get('audience-decay-rate')).toBeCloseTo(0.15, 10);
    expect(totals.size).toBeGreaterThan(0);
  });

  it('应在 applyUpgrade 后失效缓存并反映新数值', () => {
    const build = createBuild();
    applyUpgrade(build, 'choir-wall', data);
    const before = modifierTotals(build, data).size;
    applyUpgrade(build, 'four-part', data);
    const after = modifierTotals(build, data);
    expect(after.size).toBeGreaterThanOrEqual(before);
    expect(after.get('wave-damage-multiplier') ?? 0).toBeGreaterThan(0);
  });

  it('应对空构筑返回空表', () => {
    expect(modifierTotals(createBuild(), data).size).toBe(0);
  });
});

describe('createUpgradeRuntime / heatCapFor', () => {
  it('应让 heatCapFor 在无卡时返回 3、持有 heat-cap 时返回 4', () => {
    const without = createUpgradeRuntime(createBuild(), data);
    expect(heatCapFor(without)).toBe(3);

    const build = createBuild();
    build.coreCard = 'choir-wall';
    build.cards = ['heat-cap'];
    const withCard = createUpgradeRuntime(build, data);
    expect(heatCapFor(withCard)).toBe(4);
    expect(withCard.has('heat-cap')).toBe(true);
    expect(withCard.has('four-part')).toBe(false);
  });

  it('应让 value() 对未配置 key 返回 0', () => {
    const runtime = createUpgradeRuntime(createBuild(), data);
    expect(runtime.value('heat-cap')).toBe(0);
    expect(runtime.value('return-listener-cap')).toBe(0);
  });

  it('应让 matchesEvolution() 只匹配当前进化', () => {
    const build = createBuild();
    build.coreCard = 'solo-return';
    build.cards = ['shield', 'solo-extend', 'burn-chain'];
    build.evolution = 'solo-show';
    const runtime = createUpgradeRuntime(build, data);
    expect(runtime.matchesEvolution('solo-show')).toBe(true);
    expect(runtime.matchesEvolution('choir-hall')).toBe(false);
  });
});
