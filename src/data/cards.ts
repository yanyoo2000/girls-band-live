/**
 * 24 张卡 / 3 张互斥核心 / 3 个进化 / 3 条构筑 / 10 次选择的成长曲线。
 *
 * 依据：docs/gdd.md §10（卡池、进化、构筑）、§4（24 卡、10 选、3 核心、3 构筑、3 进化）；
 *       docs/tech-spec.md §7.1–§7.3（id 表、穷尽 Record、modifier 合成规则）。
 *
 * 数学（F1：假构筑已修复，不许改回）：
 * 24 = 3 核心 + 15 支援（3 × 5）+ 6 通用；单局 10 次选择；核心互斥。
 * 选定核心后永久移除另外 2 张核心与另两条构筑的 10 张支援 → 本局剩余 11 张，还剩 9 次选择，
 * 所以**一局必定至少 2 张卡没见过**（24 > 10，且 11 > 9）。
 *
 * modifier 约定（与 tech-spec §7.3 一致，dev-progression 的 collectModifiers 按此实现）：
 * 1. 同名 key **加算**；上限类（`heat-cap` / `shield-max` / `return-listener-cap`）取 `max()`；
 * 2. **所有 `-multiplier` 键一律存增量**（+35% → 0.35；×1.8 → +0.8；×2 → +1.0；−20% → −0.2），
 *    消费方统一按 `1 + Σ值` 求系数——这样"两张卡加同一个 key"才是正确的加算语义；
 * 3. 非百分比键（秒数 / 档位 / 人数 / 点数 / 开关 / 0..1 比例）存**绝对值**；
 * 4. **代价写成"更糟为正"**（人气自然衰减 +15% → `audience-decay-rate: 0.15`）；
 * 5. 每个 key 的单位与方向见 `MODIFIER_UNITS`（穷尽 Record，新增 key 不写说明就无法编译）。
 */

import type {
  BuildDef,
  CardDef,
  CardModifier,
  EvolutionDef,
  ModifierKey,
  ProgressionDef,
} from '../types/data';
import type { BuildId, CardId, CoreCardId, EvolutionId } from '../types/game';

/* ==========================================================================
 * 1. modifier 语义表（每个 key 的单位与方向；逻辑层按此解释数值）
 * ========================================================================== */

/**
 * key → 单位/方向说明。
 *
 * 这张表是**契约的一部分**：它不是注释，而是穷尽 Record——`ModifierKey` 里新增一个键
 * 却忘了写语义，`tsc` 会直接报错。dev-progression / dev-engine 实现消费逻辑时以此为准。
 */
export const MODIFIER_UNITS: Readonly<Record<ModifierKey, string>> = {
  'wave-damage-multiplier': '合唱波伤害系数增量（+50% → 0.5；消费方按 1+Σ）',
  'wave-convert-count': '人浪中 1 只噪音转化的人数（绝对值；GDD 1:4 → 4）',
  'audience-decay-rate': '代价：人气自然衰减速率增量（更糟为正，+15% → 0.15）',
  'shield-max': '上限类：回照护盾上限点数（绝对值，加算后取上限）',
  'shield-regen': '护盾回复点数/秒（绝对值，加算；GDD 每 2 拍回 6 @128BPM ≈ 6.4/s）',
  'burn-multiplier': '烧穿伤害系数增量（×1.8 → 0.8）',
  'conversion-multiplier': '通用：全局转化系数增量（当前 24 卡未使用，保留给后续内容）',
  'bait-zone-multiplier': '诱饵区招灾倍率增量（×2 → +1.0）',
  'black-zone-heat-cap': '诱饵区热度上限（档位绝对值；降为 2）',
  'black-resing-multiplier': '黑观众二次唱化加成增量（+50% → 0.5）',
  'all-zone-damage-multiplier': '全队输出系数增量（+20% → 0.2）',
  'heat-decay-delay': '热度掉级延迟秒数（绝对值，加算）',
  'front-row-heat-floor': '最前排热度下限（档位绝对值；1 = 永不掉到 0 级）',
  'back-row-decay-extra': '代价：后排额外掉级延迟秒数（更快为正，+2s → 2）',
  'zone-damage-after-perfect': '完美点燃后该区输出系数增量（+30% → 0.3）',
  'heat-cap': '上限类：单区热度上限（档位绝对值；4 = 解锁和声档）',
  'zone-output-multiplier': '通用：单区输出系数增量（当前 24 卡未使用，保留给后续内容）',
  'beam-radius-multiplier': '束光半径增量（−20% → −0.2；消费方按 1+Σ）',
  'beam-damage-multiplier': '束光伤害系数增量（+35% → 0.35）',
  'self-duration': '回照持续秒数（绝对值，加算）',
  'self-cooldown': '代价：回照冷却秒数（绝对值，加算，更糟为正）',
  'burn-chain-chance': '烧死连锁概率（绝对值 0..1）',
  'self-wave-retain': '独奏时保留的合唱波比例（绝对值 0..1）',
  'return-listener-sing-multiplier': '返听锁定期间该区唱化加成增量（+40% → 0.4）',
  'return-listener-cap': '上限类：返听同时在场的只数加算',
  'distortion-feed-nodes': '失真吞光后留下的可唱化噪点数（绝对值）',
  'distortion-hp-multiplier': '代价：失真 HP 增量（+30% → 0.3，更糟为正）',
  'black-tide-bonus': '黑观众被唱化时额外人数（加算）',
  'black-burn-disabled': '开关：1 = 黑观众不可被烧',
  'damage-per-noise': '每只存活噪音的输出增量（+1% → 0.01；上限见 balance.CARD_RULES.louderBrighterCap）',
  'backlight-conversion': '光背面转化比例增量（+30% → 0.3）',
  'front-conversion-penalty': '代价：正面转化系数扣减（−10% → 0.1）',
  'ignite-cooldown-beats': '点燃冷却拍数（绝对值，加算；−1 拍 → −1）',
  'auto-convert-interval-beats': '自动转化间隔拍数（绝对值）',
  'move-speed-multiplier': '移速增量（+12% → 0.12）',
  'perfect-window-bonus': '完美窗口延长秒数（绝对值，加算；+40ms → 0.04）',
  'backstage-audience-per-30s': '每 30 秒后台返场人数（绝对值）',
  'encore-retain': '安可后保留的人气比例（绝对值 0..1，替代 balance.run.encoreRestoreRatio）',
};

/* ==========================================================================
 * 2. 24 张卡
 * ========================================================================== */

/** 核心卡：合唱墙（合唱流，与另两张核心互斥）。 */
const CARD_CHOIR_WALL: CardDef = {
  id: 'choir-wall',
  name: '合唱墙',
  description: '四区各 ≥40 人时，合唱波伤害 ×1.5；人浪中 1 只噪音 = 4 名观众。',
  cost: '人气自然衰减 +15%。',
  category: 'core',
  build: 'choir',
  modifiers: [
    { key: 'wave-damage-multiplier', value: 0.5 },
    { key: 'wave-convert-count', value: 4 },
    { key: 'audience-decay-rate', value: 0.15 },
  ],
  evolution: 'choir-hall',
};

/** 核心卡：回照（独奏流）。 */
const CARD_SOLO_RETURN: CardDef = {
  id: 'solo-return',
  name: '回照',
  description:
    '把光收回脚下＝独奏：3m 护盾圈 60 点（每 2 拍回 6、每次撞击 −12），每秒 30 伤害，烧穿 ×1.8。',
  cost: '独奏时无法转化；每 4 拍人气 −1；独奏时贝斯护盾失效。',
  category: 'core',
  build: 'solo',
  modifiers: [
    { key: 'shield-max', value: 60 },
    { key: 'shield-regen', value: 6.4 },
    { key: 'burn-multiplier', value: 0.8 },
  ],
  evolution: 'solo-show',
};

/** 核心卡：引线（招灾流）。 */
const CARD_BAIT_LINE: CardDef = {
  id: 'bait-line',
  name: '引线',
  description: '指定一区作诱饵：该区招灾 ×2；被覆盖的观众变黑观众，可被二次唱化 +50%。',
  cost: '该区热度上限降为 2。',
  category: 'core',
  build: 'bait',
  modifiers: [
    // ×2 招灾 ＝ +100%，按增量口径写 1.0（消费方 1 + 1.0 = 2）
    { key: 'bait-zone-multiplier', value: 1 },
    { key: 'black-resing-multiplier', value: 0.5 },
    { key: 'black-zone-heat-cap', value: 2 },
  ],
  evolution: 'black-tide-encore',
};

/** 支援卡：四部齐（合唱流）。 */
const CARD_FOUR_PART: CardDef = {
  id: 'four-part',
  name: '四部齐',
  description: '四区人数差 <15% 时，全队输出 +20%。',
  cost: '要维持均衡，单区难救。',
  category: 'support',
  build: 'choir',
  modifiers: [{ key: 'all-zone-damage-multiplier', value: 0.2 }],
  evolution: 'choir-hall',
};

/** 支援卡：留人（合唱流；无代价）。 */
const CARD_KEEP_THEM: CardDef = {
  id: 'keep-them',
  name: '留人',
  description: '热度掉级延迟 +4 秒。',
  cost: null,
  category: 'support',
  build: 'choir',
  modifiers: [{ key: 'heat-decay-delay', value: 4 }],
  evolution: null,
};

/** 支援卡：第一排（合唱流）。 */
const CARD_FRONT_ROW: CardDef = {
  id: 'front-row',
  name: '第一排',
  description: '最前 60 人永不掉到 0 级。',
  cost: '后排掉级再快 2 秒。',
  category: 'support',
  build: 'choir',
  modifiers: [
    { key: 'front-row-heat-floor', value: 1 },
    { key: 'back-row-decay-extra', value: 2 },
  ],
  evolution: 'choir-hall',
};

/** 支援卡：灯下合唱（合唱流）。 */
const CARD_SING_UNDER_LIGHT: CardDef = {
  id: 'sing-under-light',
  name: '灯下合唱',
  description: '完美点燃后 8 拍内，该区输出 +30%。',
  cost: '错拍没有加成。',
  category: 'support',
  build: 'choir',
  modifiers: [{ key: 'zone-damage-after-perfect', value: 0.3 }],
  evolution: 'choir-hall',
};

/**
 * 支援卡：热度上限（合唱流，`heat-cap`）。
 * 唯一的"第 5 档"来源：解锁后单区可达热度 4（输出 +25%、褪色 ×1.5，见 balance.HEAT_LEVEL_RULES）。
 */
const CARD_HEAT_CAP: CardDef = {
  id: 'heat-cap',
  name: '热度上限',
  description: '单区热度上限 3 → 4：第 5 档「和声」输出 +25%、HUD 每拍双闪 + 外环。',
  cost: '4 档褪色速度 ×1.5。',
  category: 'support',
  build: 'choir',
  modifiers: [{ key: 'heat-cap', value: 4 }],
  evolution: null,
};

/** 支援卡：收束（独奏流）。 */
const CARD_TIGHT_BEAM: CardDef = {
  id: 'tight-beam',
  name: '收束',
  description: '束光半径 ×0.8，束光伤害 +35%。',
  cost: '视野更窄。',
  category: 'support',
  build: 'solo',
  modifiers: [
    // 半径 −20%，按增量口径写 −0.2（消费方 1 − 0.2 = 0.8）
    { key: 'beam-radius-multiplier', value: -0.2 },
    { key: 'beam-damage-multiplier', value: 0.35 },
  ],
  evolution: null,
};

/** 支援卡：护盾（独奏流）。 */
const CARD_SHIELD: CardDef = {
  id: 'shield',
  name: '护盾',
  description: '回照护盾上限 +60（至 120），回复 +6/秒。',
  cost: '不与贝斯护盾叠加。',
  category: 'support',
  build: 'solo',
  modifiers: [
    { key: 'shield-max', value: 60 },
    { key: 'shield-regen', value: 6 },
  ],
  evolution: 'solo-show',
};

/** 支援卡：独奏延长（独奏流）。 */
const CARD_SOLO_EXTEND: CardDef = {
  id: 'solo-extend',
  name: '独奏延长',
  description: '回照持续 +2 秒。',
  cost: '回照冷却 +1 秒。',
  category: 'support',
  build: 'solo',
  modifiers: [
    { key: 'self-duration', value: 2 },
    { key: 'self-cooldown', value: 1 },
  ],
  evolution: 'solo-show',
};

/** 支援卡：烧穿（独奏流）。 */
const CARD_BURN_CHAIN: CardDef = {
  id: 'burn-chain',
  name: '烧穿',
  description: '烧死噪音时 30% 概率连锁烧掉相邻 1 只。',
  cost: '连锁烧死不产出观众。',
  category: 'support',
  build: 'solo',
  modifiers: [{ key: 'burn-chain-chance', value: 0.3 }],
  evolution: 'solo-show',
};

/** 支援卡：自听（独奏流）。 */
const CARD_SELF_HEAR: CardDef = {
  id: 'self-hear',
  name: '自听',
  description: '独奏时保留 30% 的合唱波。',
  cost: '转化仍为 0。',
  category: 'support',
  build: 'solo',
  modifiers: [{ key: 'self-wave-retain', value: 0.3 }],
  evolution: null,
};

/** 支援卡：返听诱饵（招灾流）。 */
const CARD_RETURN_BAIT: CardDef = {
  id: 'return-bait',
  name: '返听诱饵',
  description: '返听锁定期间，被你照亮的那个区唱化 +40%。',
  cost: '返听同时在场上限 +1 只。',
  category: 'support',
  build: 'bait',
  modifiers: [
    { key: 'return-listener-sing-multiplier', value: 0.4 },
    { key: 'return-listener-cap', value: 1 },
  ],
  evolution: 'black-tide-encore',
};

/** 支援卡：失真饲料（招灾流）。 */
const CARD_DISTORTION_FEED: CardDef = {
  id: 'distortion-feed',
  name: '失真饲料',
  description: '失真吞光后留下 3 个可唱化噪点。',
  cost: '失真 HP +30%。',
  category: 'support',
  build: 'bait',
  modifiers: [
    { key: 'distortion-feed-nodes', value: 3 },
    // 代价：HP +30%，更糟为正
    { key: 'distortion-hp-multiplier', value: 0.3 },
  ],
  evolution: null,
};

/** 支援卡：黑潮（招灾流）。 */
const CARD_BLACK_TIDE: CardDef = {
  id: 'black-tide',
  name: '黑潮',
  description: '黑观众被唱化时额外 +4 人。',
  cost: '黑观众不可被烧。',
  category: 'support',
  build: 'bait',
  modifiers: [
    { key: 'black-tide-bonus', value: 4 },
    { key: 'black-burn-disabled', value: 1 },
  ],
  evolution: 'black-tide-encore',
};

/** 支援卡：越吵越亮（招灾流）。 */
const CARD_LOUDER_BRIGHTER: CardDef = {
  id: 'louder-brighter',
  name: '越吵越亮',
  description: '每只存活噪音 +1% 输出（上限 +30%）。',
  cost: '噪音越多你越亮，也越危险。',
  category: 'support',
  build: 'bait',
  modifiers: [{ key: 'damage-per-noise', value: 0.01 }],
  evolution: 'black-tide-encore',
};

/** 支援卡：反向灯（招灾流）。 */
const CARD_REVERSE_LIGHT: CardDef = {
  id: 'reverse-light',
  name: '反向灯',
  description: '光背面也转化 30%。',
  cost: '正面转化 −10%。',
  category: 'support',
  build: 'bait',
  modifiers: [
    { key: 'backlight-conversion', value: 0.3 },
    { key: 'front-conversion-penalty', value: 0.1 },
  ],
  evolution: null,
};

/** 通用卡：换气（无代价）。 */
const CARD_BREATHE: CardDef = {
  id: 'breathe',
  name: '换气',
  description: '点燃冷却 −1 拍。',
  cost: null,
  category: 'generic',
  build: null,
  modifiers: [{ key: 'ignite-cooldown-beats', value: -1 }],
  evolution: null,
};

/** 通用卡：擦弦。 */
const CARD_PLUCK: CardDef = {
  id: 'pluck',
  name: '擦弦',
  description: '每 8 拍自动转化 1 名观众。',
  cost: '需要该区有热度（≥1）。',
  category: 'generic',
  build: null,
  modifiers: [{ key: 'auto-convert-interval-beats', value: 8 }],
  evolution: null,
};

/** 通用卡：走位（无代价）。 */
const CARD_FOOTWORK: CardDef = {
  id: 'footwork',
  name: '走位',
  description: '移速 ×1.12。',
  cost: null,
  category: 'generic',
  build: null,
  modifiers: [{ key: 'move-speed-multiplier', value: 0.12 }],
  evolution: null,
};

/** 通用卡：节拍点燃。 */
const CARD_BEAT_IGNITE: CardDef = {
  id: 'beat-ignite',
  name: '节拍点燃',
  description: '完美窗口 +40ms（80ms → 120ms）。',
  cost: '良好窗口不变。',
  category: 'generic',
  build: null,
  modifiers: [{ key: 'perfect-window-bonus', value: 0.04 }],
  evolution: null,
};

/** 通用卡：第二排。 */
const CARD_SECOND_ROW: CardDef = {
  id: 'second-row',
  name: '第二排',
  description: '每 30 秒后台返场 +5 名观众。',
  cost: '上限受座位限制（768）。',
  category: 'generic',
  build: null,
  modifiers: [{ key: 'backstage-audience-per-30s', value: 5 }],
  evolution: null,
};

/** 通用卡：安可保险。 */
const CARD_ENCORE_INSURANCE: CardDef = {
  id: 'encore-insurance',
  name: '安可保险',
  description: '安可后保留 50% 人气（原本 40%）。',
  cost: '安可仍然只能用一次。',
  category: 'generic',
  build: null,
  modifiers: [{ key: 'encore-retain', value: 0.5 }],
  evolution: null,
};

/**
 * 卡池：24 张（穷尽 Record——少一张/多一张 id，`tsc` 直接报错，这是 F1 的编译期保险）。
 */
export const CARDS: Readonly<Record<CardId, CardDef>> = {
  // 核心（3，第一次升级三选一，互斥）
  'choir-wall': CARD_CHOIR_WALL,
  'solo-return': CARD_SOLO_RETURN,
  'bait-line': CARD_BAIT_LINE,
  // 合唱流支援（5）
  'four-part': CARD_FOUR_PART,
  'keep-them': CARD_KEEP_THEM,
  'front-row': CARD_FRONT_ROW,
  'sing-under-light': CARD_SING_UNDER_LIGHT,
  'heat-cap': CARD_HEAT_CAP,
  // 独奏流支援（5）
  'tight-beam': CARD_TIGHT_BEAM,
  shield: CARD_SHIELD,
  'solo-extend': CARD_SOLO_EXTEND,
  'burn-chain': CARD_BURN_CHAIN,
  'self-hear': CARD_SELF_HEAR,
  // 招灾流支援（5）
  'return-bait': CARD_RETURN_BAIT,
  'distortion-feed': CARD_DISTORTION_FEED,
  'black-tide': CARD_BLACK_TIDE,
  'louder-brighter': CARD_LOUDER_BRIGHTER,
  'reverse-light': CARD_REVERSE_LIGHT,
  // 通用（6）
  breathe: CARD_BREATHE,
  pluck: CARD_PLUCK,
  footwork: CARD_FOOTWORK,
  'beat-ignite': CARD_BEAT_IGNITE,
  'second-row': CARD_SECOND_ROW,
  'encore-insurance': CARD_ENCORE_INSURANCE,
};

/** 24 个卡 id（确定性遍历顺序：核心 → 合唱 → 独奏 → 招灾 → 通用）。 */
export const CARD_IDS: readonly CardId[] = [
  'choir-wall',
  'solo-return',
  'bait-line',
  'four-part',
  'keep-them',
  'front-row',
  'sing-under-light',
  'heat-cap',
  'tight-beam',
  'shield',
  'solo-extend',
  'burn-chain',
  'self-hear',
  'return-bait',
  'distortion-feed',
  'black-tide',
  'louder-brighter',
  'reverse-light',
  'breathe',
  'pluck',
  'footwork',
  'beat-ignite',
  'second-row',
  'encore-insurance',
];

/** 3 张核心卡（互斥：选一张后另外两张永久移出本局）。 */
export const CORE_CARD_IDS: readonly CoreCardId[] = ['choir-wall', 'solo-return', 'bait-line'];

/** 15 张支援卡（3 条构筑 × 5）。 */
export const SUPPORT_CARD_IDS: readonly CardId[] = CARD_IDS.filter(
  (id) => CARDS[id].category === 'support',
);

/** 6 张通用卡（不属任何构筑，选核心后仍留在池中）。 */
export const GENERIC_CARD_IDS: readonly CardId[] = CARD_IDS.filter(
  (id) => CARDS[id].category === 'generic',
);

/* ==========================================================================
 * 3. 进化（3）
 * ========================================================================== */

/** 合唱场：四区齐时全场站起 10 秒。 */
const EVOLUTION_CHOIR_HALL: EvolutionDef = {
  id: 'choir-hall',
  name: '合唱场',
  description:
    '四区同时亮着时，全场观众站起 10 秒：输出 ×2、裂缝暂停增长、转化 1:6。',
  core: 'choir-wall',
  requires: ['four-part', 'sing-under-light', 'front-row'],
  duration: 10,
  effect: { kind: 'choir-hall', damageMultiplier: 2, convertRatio: 6 },
};

/** 独奏会：独奏时全场静音 6 秒。 */
const EVOLUTION_SOLO_SHOW: EvolutionDef = {
  id: 'solo-show',
  name: '独奏会',
  description:
    '独奏时全场静音 6 秒：伤害 ×2、观众停止流失、光锥内噪音全灭。',
  core: 'solo-return',
  requires: ['shield', 'solo-extend', 'burn-chain'],
  duration: 6,
  effect: { kind: 'solo-show', damageMultiplier: 2, silenceSeconds: 6 },
};

/** 黑潮返场：诱饵区每 10 秒自动吸一次噪音。 */
const EVOLUTION_BLACK_TIDE_ENCORE: EvolutionDef = {
  id: 'black-tide-encore',
  name: '黑潮返场',
  description:
    '诱饵区每 10 秒自动吸一次噪音；唱化 1:4；黑观众不占热度。',
  core: 'bait-line',
  requires: ['return-bait', 'black-tide', 'louder-brighter'],
  duration: 10,
  effect: { kind: 'black-tide-encore', waveConvertRatio: 4, autoPullSeconds: 10 },
};

/**
 * 进化表（3 个，穷尽 Record）。
 *
 * 解析规则（tech-spec §7.3）：`build.coreCard === evolution.core` 且
 * `evolution.requires.every(id => build.cards.includes(id))` → 触发本构筑的进化，每局最多 1 次。
 */
export const EVOLUTIONS: Readonly<Record<EvolutionId, EvolutionDef>> = {
  'choir-hall': EVOLUTION_CHOIR_HALL,
  'solo-show': EVOLUTION_SOLO_SHOW,
  'black-tide-encore': EVOLUTION_BLACK_TIDE_ENCORE,
};

/* ==========================================================================
 * 4. 三条构筑（验收要求 ≥3）
 * ========================================================================== */

/** 合唱流：四区轮转，靠人浪滚雪球。 */
const BUILD_CHOIR: BuildDef = {
  id: 'choir',
  name: '合唱流',
  core: 'choir-wall',
  supports: ['four-part', 'keep-them', 'front-row', 'sing-under-light', 'heat-cap'],
  evolution: 'choir-hall',
  approach: '四区轮转、每区保持 ≥2 级，靠人浪滚雪球；最小/最大区人数差是这局的成绩单。',
};

/** 独奏流：少养人、保三线，靠独奏清场。 */
const BUILD_SOLO: BuildDef = {
  id: 'solo',
  name: '独奏流',
  core: 'solo-return',
  supports: ['tight-beam', 'shield', 'solo-extend', 'burn-chain', 'self-hear'],
  evolution: 'solo-show',
  approach: '少养人、保三线、靠独奏烧穿清场，终曲前再拉回一波；血最少，收益最险。',
};

/** 招灾流：故意把噪音引到第 4 区，二次唱化滚大。 */
const BUILD_BAIT: BuildDef = {
  id: 'bait',
  name: '招灾流',
  core: 'bait-line',
  supports: ['return-bait', 'distortion-feed', 'black-tide', 'louder-brighter', 'reverse-light'],
  evolution: 'black-tide-encore',
  approach: '把噪音往诱饵区引，让黑观众被二次唱化；裂缝最快、返听最多，也最容易在 7:15 崩。',
};

/** 构筑表（3 条，穷尽 Record）。 */
export const BUILDS: Readonly<Record<BuildId, BuildDef>> = {
  choir: BUILD_CHOIR,
  solo: BUILD_SOLO,
  bait: BUILD_BAIT,
};

/* ==========================================================================
 * 5. 成长曲线（经验 = 掌声；9:30 内 10 次升级）
 * ========================================================================== */

/**
 * 升级与抽卡限制（GDD §10.1）。
 *
 * - 10 个阈值即 10 次选择，末次约在 8:10（终曲前），保证终曲前成型；
 * - `offerSize` 固定 3，不可重抽（P0），本局不重复发同一张卡；
 * - 经验：转化 1 人 +1、完美点燃 +2、人浪 +10，烧死噪音 0——"烧 vs 唱化"的取舍在这里。
 */
export const PROGRESSION: ProgressionDef = {
  thresholds: [25, 60, 110, 175, 255, 350, 460, 585, 725, 880],
  offerSize: 3,
  maxPicks: 10,
  experience: {
    convert: 1,
    perfectIgnite: 2,
    crowdWave: 10,
  },
};

/* ==========================================================================
 * 6. 卡池的派生约束（逻辑层直接引用，避免在代码里写死 24 / 10 / 3）
 * ========================================================================== */

/**
 * 卡池派生数与"一局最多能拿多少"的一致性断言（模块加载时常量，不参与运行期逻辑）。
 *
 * 说明：这里只用常量运算，不做校验副作用——真正的校验在 index.ts 的 `validateData()`。
 */
export const CARD_POOL_FACTS = {
  total: CARD_IDS.length,
  core: CORE_CARD_IDS.length,
  support: SUPPORT_CARD_IDS.length,
  generic: GENERIC_CARD_IDS.length,
  maxPicks: PROGRESSION.maxPicks,
  /** 选核心后本局剩余可选卡数 = 本构筑 5 支援 + 6 通用 − 已选核心 0 = 11。 */
  remainingAfterCore: 5 + GENERIC_CARD_IDS.length,
  /** 选核心后还剩的选择次数。 */
  picksLeftAfterCore: PROGRESSION.maxPicks - 1,
  /** 因此一局必定看不到的卡数（≥2，F1 的数学证据）。 */
  neverSeenAtLeast: 5 + GENERIC_CARD_IDS.length - (PROGRESSION.maxPicks - 1),
} as const;

/** 便捷：取某张卡的 modifier 列表（缺卡返回空数组，供 UI/测试安全使用）。 */
export function cardModifiers(cardId: CardId): readonly CardModifier[] {
  return CARDS[cardId].modifiers;
}
