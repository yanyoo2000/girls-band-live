/**
 * 成长与抽卡（dev-progression）。
 *
 * 职责（GDD §10、docs/tech-spec.md §5.2、§7.3）：
 * - 经验（“掌声”）→ 等级 → 三选一；推广 24 卡池的过滤、核心互斥、进化解析；
 * - 数值合成只有一处实现（`upgrades.modifierTotals`），本文件只做转发；
 * - 不持有光/座区/热度/观众状态：卡效果以 modifier 暴露，由 light / audience / combat 消费；
 * - 不创建武器系统（GDD 锁定“只有光”）；不 import react / react-dom / three；
 *   不访问 DOM / localStorage；不使用 any、不使用 @ts-ignore。
 *
 * 经验与等级的存放：
 * `RunState` 是固定形状的可变根对象（`src/types/game.ts`），契约里没有 xp/level 字段，
 * 而本任务的 inScope 不含 `src/types/**`。因此经验账本放在模块级 `WeakMap<BuildState, …>`：
 * - 键是 `run.build`（每局由 `createBuild()` 新建，重开即换对象 → 账本自动归零）；
 * - 纯单线程、确定性：账本只在 `addExperience` 里按调用顺序推进，不读时钟、不读随机源之外的东西；
 * - 不产生可观察的额外状态，同 seed 同调用序列 → 同结果。
 *
 * 抽卡与 DataRegistry：
 * `addExperience(run, amount, rng)` 的 §5 签名不含 `DataRegistry`，但三选一必须知道卡的类别/构筑。
 * 处理方式（不修改签名）：
 * 1) 第一次升级的三选一按 GDD 锁定为“三张核心”，只依赖 `CoreCardId` 联合类型，无需数据；
 * 2) `applyCard` / `buildOffer` 每次调用都会拿到 `DataRegistry`，顺手记进本局账本；
 *    第一次选完核心后账本已有数据，后续 9 次升级都能正常抽卡；
 * 3) 极端情况下（picks>0 且账本尚无数据）返回 null 且**不消耗**已获得的等级，等下一次带数据的
 *    调用补发，避免出现空三选一。
 */

import type {
  BuildId,
  BuildState,
  CardId,
  CardOffer,
  CoreCardId,
  EvolutionId,
  Rng,
  RunState,
} from '../types/game';
import type { CardDef, DataRegistry, EvolutionDef, ModifierKey } from '../types/data';
import { applyUpgrade, modifierTotals } from './upgrades';

/* ==========================================================================
 * 1. 锁定常量（GDD §10.1 的 10 级曲线；与技术方案 §7.3 的抽卡数学同源）
 * ========================================================================== */

/** 累计经验阈值：25 / 60 / 110 / 175 / 255 / 350 / 460 / 585 / 725 / 880 → 共 10 次。 */
const LEVEL_THRESHOLDS: readonly number[] = [
  25, 60, 110, 175, 255, 350, 460, 585, 725, 880,
];

/** 单局最多 10 次选择（`ProgressionDef.maxPicks` 的字面量同为 10）。 */
const MAX_PICKS = 10;

/** 三张互斥核心卡；顺序固定，保证三选一与测试快照稳定。 */
const CORE_CARD_TABLE = {
  'choir-wall': true,
  'solo-return': true,
  'bait-line': true,
} as const satisfies Readonly<Record<CoreCardId, true>>;

const CORE_CARD_IDS: readonly CoreCardId[] = Object.keys(CORE_CARD_TABLE) as readonly CoreCardId[];

/** 三个进化；穷尽 Record + 固定顺序，避免依赖数据表的插入顺序。 */
const EVOLUTION_TABLE = {
  'choir-hall': true,
  'solo-show': true,
  'black-tide-encore': true,
} as const satisfies Readonly<Record<EvolutionId, true>>;

const EVOLUTION_IDS: readonly EvolutionId[] = Object.keys(EVOLUTION_TABLE) as readonly EvolutionId[];

type CardIndex = Readonly<Partial<Record<CardId, CardDef>>>;

/* ==========================================================================
 * 2. 局内账本（经验 / 等级 / 已出现卡 / 三选一缓存 / 数据注册表）
 * ========================================================================== */

interface CachedOffer {
  readonly offerId: number;
  readonly cards: readonly CardId[];
}

interface ProgressionLedger {
  /** 累计经验（可超过当前阈值，多出的部分留给下一次升级）。 */
  xp: number;
  /** 已升级次数 0..10。 */
  level: number;
  /** 本局出现过的卡（用于优先给出没见过的卡，减少重复观感）。 */
  readonly offered: Set<CardId>;
  /** 当前尚未处理的三选一：同一 offerId 再次请求返回同一批卡（不可重抽）。 */
  offer: CachedOffer | null;
  /** 本局最近一次拿到的数据注册表（供无 data 参数的 addExperience 使用）。 */
  data: DataRegistry | null;
}

const ledgers = new WeakMap<BuildState, ProgressionLedger>();

function ledgerFor(build: BuildState): ProgressionLedger {
  let ledger = ledgers.get(build);
  if (ledger === undefined) {
    ledger = { xp: 0, level: 0, offered: new Set<CardId>(), offer: null, data: null };
    ledgers.set(build, ledger);
  }
  return ledger;
}

/* ==========================================================================
 * 3. 构筑构造与查询
 * ========================================================================== */

/** 空构筑（核心为 null）。 */
export function createBuild(): BuildState {
  return {
    coreCard: null,
    cards: [],
    evolution: null,
    evolutionFired: false,
    picks: 0,
    removed: [],
  };
}

/** 核心卡所属构筑（核心卡的 `CardDef.build` 必非 null）。 */
function buildOfCore(core: CoreCardId, data: DataRegistry): BuildId | null {
  const index: CardIndex = data.cards;
  return index[core]?.build ?? null;
}

function offerIdFor(build: BuildState): number {
  return Math.min(build.picks + 1, MAX_PICKS);
}

/* ==========================================================================
 * 4. 三选一
 * ========================================================================== */

/**
 * 核心落定后本局可再出现的卡：本构筑 5 张支援 + 6 张通用，排除已拿与被永久移除的卡。
 * 拿完核心后池子恒为 11 张，而还剩 9 次选择 → 一局不可能拿完（F1）。
 */
function eligibleCards(build: BuildState, data: DataRegistry): CardId[] {
  const index: CardIndex = data.cards;
  const coreBuild = build.coreCard === null ? null : buildOfCore(build.coreCard, data);
  const pool: CardId[] = [];

  for (const key of Object.keys(index)) {
    const id = key as CardId;
    const card = index[id];
    if (card === undefined) continue;
    if (card.category === 'core') continue;
    if (build.cards.includes(id) || build.removed.includes(id)) continue;
    if (card.category === 'support' && card.build !== coreBuild) continue;
    pool.push(id);
  }

  return pool;
}

/**
 * 从候选里抽 3 张：优先“本局没出现过”的卡，不够再用已出现过但未被拿走的卡补位。
 * 全部走注入的 `Rng`（store 传 `rng.fork('cards')`），不使用 Math.random，保证同 seed 复现。
 */
function pickOffer(
  candidates: readonly CardId[],
  size: number,
  rng: Rng,
  offered: ReadonlySet<CardId>,
): readonly CardId[] {
  const unseen: CardId[] = [];
  const seen: CardId[] = [];
  for (const id of candidates) {
    if (offered.has(id)) seen.push(id);
    else unseen.push(id);
  }

  const chosen: CardId[] = [];
  for (const id of rng.shuffle(unseen)) {
    if (chosen.length >= size) break;
    chosen.push(id);
  }
  if (chosen.length < size) {
    for (const id of rng.shuffle(seen)) {
      if (chosen.length >= size) break;
      chosen.push(id);
    }
  }
  return chosen;
}

/**
 * 生成（或复用）本局当前 offerId 对应的三张卡。
 * `data === null` 只允许在“第一次升级（picks === 0）”时使用：那一次固定是三张核心。
 */
function composeOffer(
  build: BuildState,
  data: DataRegistry | null,
  rng: Rng,
  ledger: ProgressionLedger,
): readonly CardId[] {
  if (build.picks >= MAX_PICKS) return [];

  const offerId = offerIdFor(build);
  if (ledger.offer !== null && ledger.offer.offerId === offerId) {
    return ledger.offer.cards;
  }

  let candidates: readonly CardId[];
  if (build.coreCard === null) {
    // 第一次升级：三张核心互斥三选一（GDD §10.1）。此时还没选核心，非零 picks 属于非法状态。
    if (build.picks !== 0) return [];
    candidates = CORE_CARD_IDS;
  } else {
    if (data === null) return [];
    candidates = eligibleCards(build, data);
  }
  if (candidates.length === 0) return [];

  const size = data === null ? CORE_CARD_IDS.length : data.progression.offerSize;
  const cards = pickOffer(candidates, size, rng, ledger.offered);

  ledger.offer = { offerId, cards };
  for (const id of cards) ledger.offered.add(id);
  return cards;
}

/**
 * 生成三选一：核心互斥、移除规则、不可重抽。
 *
 * 同一 `offerId`（= `picks + 1`）重复调用返回同一批卡，即使传入的 `rng` 状态不同也不会重抽；
 * `picks` 已达 10 次时返回空 `cards`（正常流程不应发生，store 应已进入结算）。
 */
export function buildOffer(run: RunState, data: DataRegistry, rng: Rng): CardOffer {
  const ledger = ledgerFor(run.build);
  ledger.data = data;
  const cards = composeOffer(run.build, data, rng, ledger);
  return { offerId: offerIdFor(run.build), cards };
}

/* ==========================================================================
 * 5. 经验与升级
 * ========================================================================== */

/**
 * 经验与升级：返回触发的 offer（无则 null）；升级冻结由 store 处理。
 *
 * - 第一次升级的三张核心只依赖 `CoreCardId`，因此即使 store 还没给过 `DataRegistry` 也能出卡；
 * - 每次调用最多升 1 级。单次经验来源最大为 +10（人浪），而最小阈值间隔为 25，
 *   正常玩法下一次调用不可能跨两级；若调用方一次给入大量经验，多出的经验保留在账本里，
 *   结算完当前三选一后再次调用（可传 `amount = 0`）即可继续升级。
 * - 三选一未处理（`run.offer` 尚未被 `applyCard` 消费）时返回 null，避免连发多个三选一。
 */
export function addExperience(run: RunState, amount: number, rng: Rng): CardOffer | null {
  const build = run.build;
  const ledger = ledgerFor(build);

  if (Number.isFinite(amount) && amount > 0) ledger.xp += amount;

  if (build.picks >= MAX_PICKS) return null;
  if (ledger.level >= LEVEL_THRESHOLDS.length) return null;
  if (ledger.offer !== null && ledger.offer.offerId === offerIdFor(build)) return null;

  const threshold = LEVEL_THRESHOLDS[ledger.level];
  if (threshold === undefined || ledger.xp < threshold) return null;

  const cards = composeOffer(build, ledger.data, rng, ledger);
  if (cards.length === 0) return null; // 没有数据可用时不消耗等级，等下一次带 data 的调用补发

  ledger.level += 1;
  return { offerId: offerIdFor(build), cards };
}

/* ==========================================================================
 * 6. 应用卡与进化
 * ========================================================================== */

/**
 * 应用一张卡（写入 build、移除同构筑外的卡、刷新 modifiers 缓存）。
 * 进化条件满足时把 `evolution` 置为对应 id；`evolutionFired` 由 store 在真正触发效果后置 true。
 */
export function applyCard(run: RunState, cardId: CardId, data: DataRegistry): void {
  const build = run.build;
  const ledger = ledgerFor(build);
  ledger.data = data;

  const written = applyUpgrade(build, cardId, data);
  if (!written) return;

  ledger.offer = null;
  ledger.offered.add(cardId);

  if (build.evolutionFired || build.evolution !== null) return;
  const evolution = resolveEvolution(build, data);
  if (evolution !== null) build.evolution = evolution;
}

/**
 * 进化判定（核心 + 3 支援齐 → 进化 id）。纯函数，不修改 build。
 * “每局最多一次”由 `evolutionFired` 在触发侧（`applyCard` / store）保证。
 */
export function resolveEvolution(build: BuildState, data: DataRegistry): EvolutionId | null {
  if (build.coreCard === null) return null;
  const index: Readonly<Partial<Record<EvolutionId, EvolutionDef>>> = data.evolutions;

  for (const id of EVOLUTION_IDS) {
    const evolution = index[id];
    if (evolution === undefined) continue;
    if (evolution.core !== build.coreCard) continue;
    if (!evolution.requires.every((required) => build.cards.includes(required))) continue;
    return id;
  }
  return null;
}

/* ==========================================================================
 * 7. 派生数值（转发到 upgrades.ts 的唯一聚合实现）
 * ========================================================================== */

/** 汇总当前 modifier（key → 数值，累加/覆盖规则见 §7.3）。 */
export function collectModifiers(
  build: BuildState,
  data: DataRegistry,
): ReadonlyMap<ModifierKey, number> {
  return modifierTotals(build, data);
}
