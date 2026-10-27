/**
 * 卡效果运行时（dev-progression）。
 *
 * 边界（docs/tech-spec.md §5.2、§7.3；GDD §10）：
 * - 只做两件事：把一张卡写进 `BuildState`，以及读出派生数值；
 * - 不做抽卡（经验/三选一/进化在 `progression.ts`）；
 * - 不持有光、座区、热度、观众或敌人状态，也不创建任何“武器”系统：卡效果一律以
 *   `ModifierKey → number` 暴露，由 `light.ts` / `audience.ts` / `combat.ts` 消费；
 * - 不 import react / react-dom / three；不访问 DOM / localStorage；不使用 any。
 *
 * modifier 合成规则（§7.3）：
 * - 同名 key 默认**加法**；上限/覆盖类 key 取 **max**（见 `MODIFIER_FOLD`，穷尽 Record，
 *   新增 ModifierKey 时 TypeScript 会强制补齐）；
 * - 百分比统一存小数（`0.2` = +20%），代价写负值（人气衰减 +15% = `audience-decay-rate: 0.15`）；
 * - 结果按 “核心 + 已选卡 + picks” 指纹缓存，`applyUpgrade` 写卡时失效；缓存只避免每帧重算，
 *   不改变任何语义。
 *
 * 与 §5 的唯一补充导出：`modifierTotals`。`progression.collectModifiers()` 与
 * `UpgradeRuntime.value()` 必须共用同一套合成规则，而 §5 把 `collectModifiers` 放在
 * `progression.ts`；若 `upgrades.ts` 反向 import 会形成 game 层循环依赖（§3.2 第 7 条禁止）。
 * 因此把纯聚合函数放在本文件导出、由 `progression.ts` 单向复用。
 */

import type {
  BuildId,
  BuildState,
  CardId,
  CoreCardId,
  EvolutionId,
  HeatLevel,
} from '../types/game';
import type { CardDef, DataRegistry, ModifierKey } from '../types/data';

/* ==========================================================================
 * 1. 常量：核心卡、合成方式白名单
 * ========================================================================== */

/**
 * 三张互斥核心卡（GDD §10.2 / tech-spec §7.2 锁定）。
 * 用穷尽 Record 而不是裸数组：CardId 若增删核心，这里编译期报错。
 */
const CORE_CARD_TABLE = {
  'choir-wall': true,
  'solo-return': true,
  'bait-line': true,
} as const satisfies Readonly<Record<CoreCardId, true>>;

const CORE_CARD_IDS: readonly CoreCardId[] = Object.keys(CORE_CARD_TABLE) as readonly CoreCardId[];

/**
 * 每个 ModifierKey 的合成方式。
 * - `add`：同名 key 累加（默认；百分比与时长、计数都走这里）；
 * - `max`：上限 / 覆盖类，取最大值（热度上限、诱饵区上限、返听数量上限、
 *   第一排热度地板、安可保留比例）。
 */
const MODIFIER_FOLD: Readonly<Record<ModifierKey, 'add' | 'max'>> = {
  'wave-damage-multiplier': 'add',
  'wave-convert-count': 'add',
  'audience-decay-rate': 'add',
  'shield-max': 'add',
  'shield-regen': 'add',
  'burn-multiplier': 'add',
  'conversion-multiplier': 'add',
  'bait-zone-multiplier': 'add',
  'black-zone-heat-cap': 'max',
  'black-resing-multiplier': 'add',
  'all-zone-damage-multiplier': 'add',
  'heat-decay-delay': 'add',
  'front-row-heat-floor': 'max',
  'back-row-decay-extra': 'add',
  'zone-damage-after-perfect': 'add',
  'heat-cap': 'max',
  'zone-output-multiplier': 'add',
  'beam-radius-multiplier': 'add',
  'beam-damage-multiplier': 'add',
  'self-duration': 'add',
  'self-cooldown': 'add',
  'burn-chain-chance': 'add',
  'self-wave-retain': 'add',
  'return-listener-sing-multiplier': 'add',
  'return-listener-cap': 'max',
  'distortion-feed-nodes': 'add',
  'distortion-hp-multiplier': 'add',
  'black-tide-bonus': 'add',
  'black-burn-disabled': 'add',
  'damage-per-noise': 'add',
  'backlight-conversion': 'add',
  'front-conversion-penalty': 'add',
  'ignite-cooldown-beats': 'add',
  'auto-convert-interval-beats': 'add',
  'move-speed-multiplier': 'add',
  'perfect-window-bonus': 'add',
  'backstage-audience-per-30s': 'add',
  'encore-retain': 'max',
};

/** 卡表按 `CardId → CardDef` 定义，这里放宽成可能缺项，便于运行时防御坏数据。 */
type CardIndex = Readonly<Partial<Record<CardId, CardDef>>>;

/* ==========================================================================
 * 2. 公共类型（与 docs/tech-spec.md §5.2 一致）
 * ========================================================================== */

/** 卡效果运行时：只负责“应用一张卡”和“读派生数值”，抽卡在 progression.ts。 */
export interface UpgradeRuntime {
  /** 派生数值（同名 key 加法合成，上限类取 max）；未配置返回 0。 */
  value(key: ModifierKey): number;
  has(cardId: CardId): boolean;
  matchesEvolution(evolution: EvolutionId): boolean;
}

/* ==========================================================================
 * 3. 纯聚合：modifier 表
 * ========================================================================== */

interface ModifierCacheEntry {
  readonly fingerprint: string;
  readonly values: ReadonlyMap<ModifierKey, number>;
}

const modifierCache = new WeakMap<BuildState, ModifierCacheEntry>();

function cardIndexOf(data: DataRegistry): CardIndex {
  return data.cards;
}

function isCoreCardId(id: CardId): id is CoreCardId {
  return (CORE_CARD_IDS as readonly CardId[]).includes(id);
}

/** 核心卡所属构筑（走 `CardDef.build`；核心一定非 null）。 */
function buildOfCore(core: CoreCardId, data: DataRegistry): BuildId | null {
  const index = cardIndexOf(data);
  return index[core]?.build ?? null;
}

function compareId(a: CardId, b: CardId): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** 缓存指纹：核心、picks 与已选卡序列任一变化即失效。 */
function buildFingerprint(build: BuildState): string {
  return `${build.coreCard ?? '-'}|${build.picks}|${build.cards.join(',')}`;
}

function isHeld(build: BuildState, cardId: CardId): boolean {
  return build.coreCard === cardId || build.cards.includes(cardId);
}

/**
 * 汇总当前 modifier（key → 数值）。纯函数；同名 key 按 `MODIFIER_FOLD` 加法或取 max。
 * 这是 §7.3 “合成规则集中在一处”的唯一实现，`progression.collectModifiers()` 直接复用。
 */
export function modifierTotals(
  build: BuildState,
  data: DataRegistry,
): ReadonlyMap<ModifierKey, number> {
  const fingerprint = buildFingerprint(build);
  const cached = modifierCache.get(build);
  if (cached !== undefined && cached.fingerprint === fingerprint) {
    return cached.values;
  }

  const values = new Map<ModifierKey, number>();
  const index = cardIndexOf(data);
  const held: readonly CardId[] =
    build.coreCard === null ? build.cards : [build.coreCard, ...build.cards];

  for (const id of held) {
    const card = index[id];
    if (card === undefined) continue;
    for (const modifier of card.modifiers) {
      const previous = values.get(modifier.key);
      if (previous === undefined) {
        values.set(modifier.key, modifier.value);
        continue;
      }
      values.set(
        modifier.key,
        MODIFIER_FOLD[modifier.key] === 'max'
          ? Math.max(previous, modifier.value)
          : previous + modifier.value,
      );
    }
  }

  modifierCache.set(build, { fingerprint, values });
  return values;
}

/* ==========================================================================
 * 4. 写入：applyUpgrade
 * ========================================================================== */

/**
 * 核心卡落定后，永久移出本局卡池：另外两张核心 + 另外两条构筑的 10 张支援。
 * 24 − 1 核心 − 12 = 11 张（5 支援 + 6 通用），而选完核心还剩 9 次选择 → 一局不可能拿完。
 */
function removeRivalCards(build: BuildState, chosen: CoreCardId, data: DataRegistry): void {
  const chosenBuild = buildOfCore(chosen, data);
  const index = cardIndexOf(data);
  const rivals: CardId[] = [];

  for (const key of Object.keys(index)) {
    const id = key as CardId;
    if (id === chosen) continue;
    const card = index[id];
    if (card === undefined) continue;
    const rivalCore = card.category === 'core';
    const rivalSupport = card.category === 'support' && card.build !== chosenBuild;
    if ((rivalCore || rivalSupport) && !build.removed.includes(id) && !rivals.includes(id)) {
      rivals.push(id);
    }
  }

  // 顺序固定（按 id 字典序），避免数据表插入顺序影响 BuildState 的快照与测试 diff。
  rivals.sort(compareId);
  for (const id of rivals) build.removed.push(id);
}

/**
 * 写入一张卡（去重、核心互斥移除、picks + 1）；返回是否真的写入。
 *
 * 规则（GDD §10.1 / §10.2）：
 * - 单局最多 `data.progression.maxPicks`（=10）次，核心也占 1 次；
 * - 第一次升级只能选 3 张核心之一；核心一旦落定，本局不允许再拿其他核心；
 * - 核心落定前不收支援/通用卡（第一次升级的三选一只有核心）；
 * - 支援卡必须属于当前核心的构筑；通用卡无构筑限制；
 * - 被移除（`build.removed`）或已持有的卡不能再次写入。
 *
 * 注意：本函数只写 `BuildState`，不写 `run.offer`、不判定进化（由 `progression.ts` 负责）。
 */
export function applyUpgrade(build: BuildState, cardId: CardId, data: DataRegistry): boolean {
  const card = cardIndexOf(data)[cardId];
  if (card === undefined) return false;
  if (build.picks >= data.progression.maxPicks) return false;
  if (isHeld(build, cardId)) return false;

  if (card.category === 'core') {
    if (build.coreCard !== null) return false;
    if (!isCoreCardId(card.id)) return false;
    build.coreCard = card.id;
    removeRivalCards(build, card.id, data);
  } else {
    // 第一次升级必须先定核心：核心之前不存在支援/通用卡的合法来源。
    if (build.coreCard === null) return false;
    if (build.removed.includes(cardId)) return false;
    if (card.category === 'support' && card.build !== buildOfCore(build.coreCard, data)) {
      return false;
    }
    build.cards.push(cardId);
  }

  build.picks += 1;
  modifierCache.delete(build);
  return true;
}

/* ==========================================================================
 * 5. 读派生值
 * ========================================================================== */

/** 创建轻量运行时：`value()` 读聚合表，`has()` 看核心 + 已选卡，`matchesEvolution()` 看已触发的进化。 */
export function createUpgradeRuntime(build: BuildState, data: DataRegistry): UpgradeRuntime {
  return {
    value(key: ModifierKey): number {
      return modifierTotals(build, data).get(key) ?? 0;
    },
    has(cardId: CardId): boolean {
      return isHeld(build, cardId);
    },
    matchesEvolution(evolution: EvolutionId): boolean {
      return build.evolution === evolution;
    },
  };
}

/**
 * 热度上限的唯一入口：持有 `heat-cap` 返回 4，否则 3（GDD §7.5 / acceptance §0 第 7 条）。
 * 4 档的“输出 +25%、褪色 ×1.5”由数值层读 `heat-cap` 外的独立 key，不在这里分支。
 */
export function heatCapFor(runtime: UpgradeRuntime): HeatLevel {
  return runtime.has('heat-cap') ? 4 : 3;
}
