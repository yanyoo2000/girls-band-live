/**
 * tech-spec §11 #1：确定性随机源。
 *
 * 必测：同 seed 序列一致；fork 互不串扰；shuffle 保持元素集合。
 */
import { describe, expect, it } from 'vitest';
import { createRng, hashLabel } from '../src/game/rng';

describe('createRng', () => {
  it('应让同一 seed 产生完全相同的序列', () => {
    const a = createRng(20261028);
    const b = createRng(20261028);
    for (let i = 0; i < 64; i += 1) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('应让不同 seed 产生不同序列（前 8 个值至少一处不同）', () => {
    const a = createRng(1);
    const b = createRng(2);
    const left = Array.from({ length: 8 }, () => a.next());
    const right = Array.from({ length: 8 }, () => b.next());
    expect(left).not.toEqual(right);
  });

  it('应把 next() 恒定落在 [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('应把 range() 夹在 [min, max)', () => {
    const rng = createRng(11);
    for (let i = 0; i < 500; i += 1) {
      const value = rng.range(-3.5, 2.5);
      expect(value).toBeGreaterThanOrEqual(-3.5);
      expect(value).toBeLessThan(2.5);
    }
  });

  it('应让 int(max) 覆盖 0..max-1 且不越界', () => {
    const rng = createRng(13);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) {
      const value = rng.int(6);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(6);
      seen.add(value);
    }
    expect(seen.size).toBe(6);
  });

  it('应在 int(maxExclusive<=0) 时返回 0', () => {
    const rng = createRng(17);
    expect(rng.int(0)).toBe(0);
    expect(rng.int(-4)).toBe(0);
  });

  it('应让 pick 对空数组抛 RangeError', () => {
    const rng = createRng(19);
    expect(() => rng.pick([])).toThrow(RangeError);
  });

  it('应让 pick 只返回数组内元素', () => {
    const rng = createRng(23);
    const items = ['a', 'b', 'c', 'd'] as const;
    for (let i = 0; i < 200; i += 1) {
      expect(items).toContain(rng.pick(items));
    }
  });

  it('应让 shuffle 保持元素集合与长度，且不修改入参', () => {
    const rng = createRng(29);
    const original = Array.from({ length: 32 }, (_, i) => i);
    const frozen = original.slice();
    const shuffled = rng.shuffle(original);
    expect(shuffled).toHaveLength(original.length);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(frozen);
    expect(original).toEqual(frozen);
  });

  it('应让同 seed 的 shuffle 结果可复现', () => {
    const first = createRng(31).shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
    const second = createRng(31).shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(first).toEqual(second);
  });

  it('应让 fork 出的子流与父流互不串扰', () => {
    const parent = createRng(37);
    const spawn = parent.fork('spawn');
    const cards = parent.fork('cards');
    const spawnValues = Array.from({ length: 16 }, () => spawn.next());
    const cardsValues = Array.from({ length: 16 }, () => cards.next());
    expect(spawnValues).not.toEqual(cardsValues);

    // 子流抽取不应影响父流的后续序列：同一父 seed 下，先抽子流再取父流值，
    // 与只按 fork 顺序推进父流的序列一致。
    const replay = createRng(37);
    replay.fork('spawn');
    replay.fork('cards');
    expect(parent.next()).toBe(replay.next());
  });

  it('应对同一标签的连续两次 fork 得到不同子流', () => {
    const parent = createRng(41);
    const a = parent.fork('seats');
    const b = parent.fork('seats');
    const aValues = Array.from({ length: 8 }, () => a.next());
    const bValues = Array.from({ length: 8 }, () => b.next());
    expect(aValues).not.toEqual(bValues);
  });

  it('应让 snapshot 反映当前状态并随 next 前移', () => {
    const rng = createRng(43);
    const before = rng.snapshot();
    rng.next();
    expect(rng.snapshot()).not.toBe(before);
  });
});

describe('hashLabel', () => {
  it('应对同一标签与 salt 返回同一整数', () => {
    expect(hashLabel('spawn', 123)).toBe(hashLabel('spawn', 123));
  });

  it('应返回 32 位无符号整数', () => {
    for (const label of ['spawn', 'cards', 'seats', 'fx', '']) {
      const value = hashLabel(label, 0x1234_5678);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(2 ** 32);
    }
  });

  it('应让不同标签或不同 salt 产生不同哈希', () => {
    expect(hashLabel('spawn', 1)).not.toBe(hashLabel('cards', 1));
    expect(hashLabel('spawn', 1)).not.toBe(hashLabel('spawn', 2));
  });
});
