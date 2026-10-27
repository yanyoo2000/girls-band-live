/**
 * 确定性随机源（mulberry32）与字符串标签哈希（FNV-1a）。
 *
 * 用途：一局内所有随机（刷怪点、抽卡序、观众初始分布、Boss 抖动）都必须可复现，
 * 同一 `seed` 两次运行产生完全相同的序列；子流按标签分叉，互不串扰。
 *
 * 依赖：仅 `../types/game` 的 `Rng` 类型。
 * 约束：不调用宿主伪随机与系统时钟、不触 DOM（可机器检查的分层门禁 R13）。
 *
 * 导出：
 * - `createRng(seed)`：创建确定性随机源；
 * - `hashLabel(label, salt)`：字符串 → 32 位无符号整数（分叉种子）。
 */
import type { Rng } from '../types/game';

/** 2^32，用于把乘法结果还原成 0..1 的比例。 */
const UINT32_RANGE = 4_294_967_296;

function mulberry32Step(state: number): number {
  let a = state >>> 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return (t ^ (t >>> 14)) >>> 0;
}

/**
 * 创建确定性随机源。
 *
 * - `next()`：0..1（不含 1）；
 * - `range(min, max)`：`min` 到 `max` 的浮点；
 * - `int(maxExclusive)`：0..maxExclusive-1 的整数（`maxExclusive <= 0` 时返回 0）；
 * - `pick(items)`：空数组抛 `RangeError`（调用方必须先判空，不静默返回 undefined）；
 * - `shuffle(items)`：返回新数组，不修改入参；
 * - `fork(label)`：派生子流，父流状态同时前进一步，同标签多次分叉也不相同；
 * - `snapshot()`：当前 32 位状态（重放/单测断言用）。
 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = mulberry32Step(state);
    return state / UINT32_RANGE;
  };

  const range = (min: number, max: number): number => min + next() * (max - min);

  const int = (maxExclusive: number): number => {
    if (maxExclusive <= 0) {
      return 0;
    }
    const value = Math.floor(next() * maxExclusive);
    // `next()` 严格小于 1，仍防御浮点边界导致的越界。
    return value >= maxExclusive ? maxExclusive - 1 : value;
  };

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new RangeError('Rng.pick: 空数组没有可选项');
    }
    const item = items[int(items.length)];
    if (item === undefined) {
      throw new RangeError('Rng.pick: 索引越界（不应发生）');
    }
    return item;
  };

  const shuffle = <T>(items: readonly T[]): readonly T[] => {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = int(i + 1);
      const a = copy[i];
      const b = copy[j];
      // `noUncheckedIndexedAccess` 下索引是 `T | undefined`；长度已由循环保证，显式判空。
      if (a === undefined || b === undefined) {
        continue;
      }
      copy[i] = b;
      copy[j] = a;
    }
    return copy;
  };

  const fork = (label: string): Rng => {
    // 先消费一步父流：同一标签多次分叉得到不同子流。
    const salt = state;
    state = mulberry32Step(state);
    return createRng(hashLabel(label, salt));
  };

  const snapshot = (): number => state;

  return { next, range, int, pick, shuffle, fork, snapshot };
}

/**
 * 字符串标签 → 32 位无符号整数（FNV-1a，32 位，含 salt 混合）。
 *
 * 与 `SHA-256` 的同步简化版等价用途：把 `'spawn' | 'cards' | 'seats' | 'fx'` 之类
 * 的稳定标签变成可复现的整数，不依赖任何平台哈希实现。
 */
export function hashLabel(label: string, salt: number): number {
  let hash = (0x811c9dc5 ^ (salt >>> 0)) >>> 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash ^ label.charCodeAt(i)) >>> 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // 末尾再混一次 salt，避免空标签与纯 salt 前缀碰撞。
  hash = (hash ^ (salt >>> 0)) >>> 0;
  hash = Math.imul(hash, 0x01000193) >>> 0;
  return hash >>> 0;
}
