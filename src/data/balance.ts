/**
 * 平衡表：全部可调数值的唯一来源（逻辑层禁止硬编码任何数值）。
 *
 * 依据：docs/gdd.md §4/§6/§7/§8/§11/§13/§16.3/§17；docs/tech-spec.md §9.1；
 *       docs/art-direction.md §10（性能预算与降级顺序）。
 *
 * 三层结构：
 * 1. `BALANCE`（类型 `BalanceConfig`，契约内、逻辑层从 `DataRegistry.balance` 读）；
 * 2. 契约外的规则常量（`LIGHT_FORMS` / `HEAT_LEVEL_RULES` / `GRADE_RULES` / `CHOIR_WAVE_RULES` /
 *    `MEMBER_RULES` / `LINE_RULES` / `CARD_RULES`）——`src/types/data.ts` 没有对应字段，
 *    它们以附加导出的形式集中在此，逻辑层直接 `import { … } from '../data'`（依赖矩阵允许 game → data）；
 * 3. `OPEN_TUNING`：GDD 没有锁死的实现基线，明确标注"可调、M5 第一周实机定"。
 *
 * 单位：时间＝秒，距离＝米，比例＝0..1 的小数，档位＝`HeatLevel`（0–4）。
 */

import type { BalanceConfig, LightFormDef } from '../types/data';
import type {
  Grade,
  HeatLevel,
  InstrumentLineId,
  LightMode,
  Ratio,
  Seconds,
} from '../types/game';

/* ==========================================================================
 * 1. 契约内的平衡表（BalanceConfig）
 * ========================================================================== */

/** Boss 退场时间（GDD §8.3：7:40 = 460s；同时是桥段→终曲的边界）。 */
export const BOSS_RETIRE_SEC: Seconds = 460;

/** Boss 退场时若人气低于该值，永久带走一个区（GDD §8.3：150）。 */
export const BOSS_STRIP_ZONE_THRESHOLD = 150;

/**
 * 主平衡表。
 *
 * 每一段的注释都标了 GDD 出处：改数值可以，改"为什么是这个数"不行——
 * 若推导链不成立，先改规则再改数值（GDD §4 的读法）。
 */
export const BALANCE: BalanceConfig = {
  /** 单局：9:30 = 570s（演奏到 9:10 = 550s，之后 20s 结算尾奏）。 */
  run: {
    durationSec: 570,
    startAudience: 30,
    capacity: 768,
    lowAudienceRatio: 0.08,
    lowAudienceBars: 8,
    encoreRestoreRatio: 0.4,
    encoreMinAudience: 60,
  },

  /** 光与点燃（GDD §6.1）：0.15s 惯性 + 0.15s 拉丝；完美 ±80ms、良好 ±140ms。 */
  light: {
    inertiaSec: 0.15,
    trailSec: 0.15,
    ignitePulseSec: 0.3,
    igniteCooldownBeats: 2,
    perfectWindow: 0.08,
    goodWindow: 0.14,
    perfectMultiplier: 1.6,
    goodMultiplier: 1.2,
    offMultiplier: 0.4,
    inChordBonus: 0.25,
    outChordPenalty: 0.25,
    outChordSpawnMultiplier: 2,
  },

  /** 转化两段到账（GDD §7.2）：0.4s 拉停 + 1.5s 入座，中断保留 50%。 */
  conversion: {
    stopSec: 0.4,
    seatSec: 1.5,
    interruptRetain: 0.5,
    noiseToAudience: 2,
    waveNoiseToAudience: 4,
    returnListenerToAudience: 20,
    bossPhaseAudience: 30,
    tintSec: 0.8,
  },

  /** 热度与流失（GDD §7.3/§7.5）：1.2s 升 1 级；离光 3s 起倒计时、12s 掉 1 级。 */
  heat: {
    riseSec: 1.2,
    decayDelay: 3,
    decaySec: 12,
    heat4DecayMultiplier: 1.5,
    overheatSeconds: 8,
    overheatDecayMultiplier: 2,
    overheatConversionPenalty: 0.2,
    peopleLostPerCover: 6,
  },

  /** 反驻守（GDD §11.1）：停住＝被咬住；移动本身有收益。 */
  antiCamp: {
    anchorRadius: 6,
    anchorSeconds: 4,
    sameZoneSeconds: 5,
    releaseDistance: 8,
    releaseSeconds: 1.5,
    sweepWindow: 4,
    sweepZones: 2,
    sweepBonus: 0.2,
    behindSpawnInterval: 20,
    behindSpawnChance: 0.3,
  },

  /** 人浪（GDD §7.4）：2:00 / 5:00 / 8:00，阈值 90 / 280 / 460，不足则只触发单区小浪。 */
  crowdWave: {
    times: [120, 300, 480],
    thresholds: [90, 280, 460],
    sweepSec: 3,
    convertRatio: 4,
    heatBonus: 1,
    warningSec: 10,
  },

  /** 噪音（GDD §8.1）：同屏 180（低画质 90）；从光锥边缘 3–8m 生成；每道裂缝生成率 +15%。 */
  noise: {
    cap: 180,
    capLow: 90,
    spawnMinDistance: 3,
    spawnMaxDistance: 8,
    crackSpawnMultiplier: 0.15,
    singHeatRequired: 2,
  },

  /** Boss「静默」（GDD §8.3）：6:30 抽总线 8 小节 → 6:45 吞光 → 7:15 冷却 → 7:40 退场。 */
  boss: {
    phases: [
      { phase: 'bus', startSec: 390, endSec: 405 },
      { phase: 'light', startSec: 405, endSec: 435 },
      { phase: 'people', startSec: 435, endSec: BOSS_RETIRE_SEC },
    ],
    silenceBars: 8,
    phase2LightScale: 0.5,
    phase3DecayMultiplier: 3,
  },

  /** 性能预算（GDD §16.3 / art-direction §10）：draw call ≤45（硬顶 60）、粒子 300、真光 ≤2。 */
  performance: {
    fixedStepHz: 60,
    entityCap: 180,
    particles: 300,
    particlesLow: 120,
    drawCalls: 45,
    drawCallsMax: 60,
    triangles: 80000,
    trianglesMax: 120000,
    coneOverdraw: 0.25,
    coneOverdrawMax: 0.3,
    totalOverdraw: 2,
    totalOverdrawMax: 2.5,
    dprHigh: 1.5,
    dprLow: 1,
    hudHz: 10,
  },
};

/* ==========================================================================
 * 2. 光的三形态（武器等价物，GDD §6.1）
 * ========================================================================== */

/**
 * 三种光形态（没有独立武器系统；`weapons.ts` 不创建，见 tech-spec §4.1 第 3 条）。
 *
 * `audienceDeltaPer4Beats`：每 4 拍的人气变化（散光/束光 0，回照 −1）。
 * `shield`：护盾上限点数（只有回照有；上限类 modifier 与卡"护盾"叠加取 max+加算，见 MODIFIER_UNITS）。
 */
export const LIGHT_FORMS: Readonly<Record<LightMode, LightFormDef>> = {
  spread: {
    id: 'spread',
    name: '散光',
    description: '默认形态：铺场、读哪一区热；转化慢但看得宽。',
    radius: 4.2,
    conversionMultiplier: 1,
    burnMultiplier: 0.6,
    canConvert: true,
    audienceDeltaPer4Beats: 0,
    shield: 0,
  },
  beam: {
    id: 'beam',
    name: '束光',
    description: '按住左键：半径收到 1.6m，救火与烧穿的唯一手段；代价是看不见侧面来的噪音。',
    radius: 1.6,
    conversionMultiplier: 1.4,
    burnMultiplier: 2.2,
    canConvert: true,
    audienceDeltaPer4Beats: 0,
    shield: 0,
  },
  self: {
    id: 'self',
    name: '回照',
    description: '把光移到自己脚下（舞台中心 2m 内）：3m 护盾圈，自保但不能养人。',
    radius: 3,
    conversionMultiplier: 0,
    burnMultiplier: 1.8,
    canConvert: false,
    audienceDeltaPer4Beats: -1,
    shield: 60,
  },
};

/* ==========================================================================
 * 3. 热度 5 档（0–4，GDD §7.5）
 * ========================================================================== */

/** 单档热度规则（HUD、合唱波伤害、唱化阈值、Boss 冷却、人浪 +1 全读同一张表）。 */
export interface HeatLevelRule {
  readonly level: HeatLevel;
  /** 语义名（灰 / 抬头 / 举棒 / 合唱 / 和声）。 */
  readonly name: string;
  /** 该档的输出加成增量（0.25 = +25%）。 */
  readonly outputBonus: Ratio;
  /** 该档的掉级速度倍率。 */
  readonly decayMultiplier: number;
  /** 40px 下的视觉编码（不新增颜色）。 */
  readonly visual: string;
  /** 到达方式（秒数或卡）。 */
  readonly reach: string;
}

/**
 * 热度 0–4 的统一口径。
 *
 * 常态上限 3；第 5 档 4 只能由 `heat-cap` 卡解锁（`heatCapFor()` 返回 3 或 4）。
 * 第 4 档不新增颜色：只用"每拍双闪 + 外环"编码。
 */
export const HEAT_LEVEL_RULES: readonly HeatLevelRule[] = [
  {
    level: 0,
    name: '灰',
    outputBonus: 0,
    decayMultiplier: 1,
    visual: '熄灭',
    reach: '默认 / 掉级',
  },
  {
    level: 1,
    name: '抬头',
    outputBonus: 0,
    decayMultiplier: 1,
    visual: '低亮（单音）',
    reach: '被照亮 1.2s',
  },
  {
    level: 2,
    name: '举棒',
    outputBonus: 0,
    decayMultiplier: 1,
    visual: '中亮（声部加入）',
    reach: '再 1.2s；也是唱化噪音的门槛',
  },
  {
    level: 3,
    name: '合唱',
    outputBonus: 0,
    decayMultiplier: 1,
    visual: '高亮（声部满）',
    reach: '再 1.2s（常态上限）',
  },
  {
    level: 4,
    name: '和声',
    outputBonus: 0.25,
    decayMultiplier: 1.5,
    visual: '高亮 + 每拍双闪 + 外环',
    reach: '仅「热度上限」卡，再 1.2s',
  },
];

/** 常态热度上限（无 `heat-cap` 卡时）。 */
export const HEAT_CAP_BASE: HeatLevel = 3;

/* ==========================================================================
 * 4. 结算评级（GDD §13.5）
 * ========================================================================== */

/** 单档评级规则（阈值逐项写死，边界 599/600、449/450、299/300 由 acceptance AC-25 复测）。 */
export interface GradeRule {
  readonly grade: Grade;
  /** 终场人气下限。 */
  readonly minAudience: number;
  /** 是否要求"未使用安可"。 */
  readonly requiresEncoreUnused: boolean;
  /** 转化率下限（转化 /（转化 + 烧死））；null 表示不要求。 */
  readonly minConvertRatio: Ratio | null;
  readonly note: string;
}

/**
 * 评级阈值（不含隐藏分；"胜利＝完成终曲"，满场/普通/空场都算完成）。
 *
 * 空场完成固定 C；中断失败不评级（`RunResult.grade = null`）。
 */
export const GRADE_RULES: readonly GradeRule[] = [
  {
    grade: 'S',
    minAudience: 600,
    requiresEncoreUnused: true,
    minConvertRatio: 0.7,
    note: '满场：完成终曲 + 终场 ≥600 + 未用安可 + 转化比 ≥70%',
  },
  {
    grade: 'A',
    minAudience: 450,
    requiresEncoreUnused: true,
    minConvertRatio: null,
    note: '完成终曲 + 终场 ≥450 + 未用安可',
  },
  {
    grade: 'B',
    minAudience: 300,
    requiresEncoreUnused: false,
    minConvertRatio: null,
    note: '完成终曲 + 终场 ≥300',
  },
  {
    grade: 'C',
    minAudience: 0,
    requiresEncoreUnused: false,
    minConvertRatio: null,
    note: '完成终曲但 <300，或空场完成',
  },
];

/* ==========================================================================
 * 5. 合唱波（GDD §6.2）
 * ========================================================================== */

/**
 * 合唱波：每 4 拍（每小节一次），每个区自动向 12m 内最近的噪音发一道波。
 *
 * 伤害 = 该区人数 ×（baseFactor + heatFactor × 热度）× 和弦系数；
 * 四区同时开火 = 和弦波 ×1.5（不额外消耗任何资源——它是奖励，不是技能）。
 */
export const CHOIR_WAVE_RULES = {
  /** 开火间隔（拍）。 */
  intervalBeats: 4,
  /** 射程（米）。 */
  rangeMeters: 12,
  /** 伤害基数。 */
  baseFactor: 0.5,
  /** 每档热度追加系数。 */
  heatFactor: 0.5,
  /** 四区同时开火的倍率。 */
  fourZoneMultiplier: 1.5,
  /** 该区和弦内音时的伤害增量（与点燃的 ±25% 同源，但独立读取）。 */
  inChordBonus: 0.25,
} as const;

/* ==========================================================================
 * 6. 四名成员的被动数值（GDD §5.2）
 * ========================================================================== */

/**
 * 成员规则（数值化"她怎么打"）。
 *
 * 说明：成员没有独立技能/冷却，这些值全部是**常驻被动**；
 * 唯一的"大招"是各自的角色瞬间（见 characters.ts 的 `MOMENTS`）。
 */
export interface MemberRules {
  readonly jiangqi: {
    /** 序曲第几秒出现呼吸声（角色瞬间 breath 的触发点）。 */
    readonly breathAtSec: Seconds;
    /** 空场时呼吸声是否最响（叙事标记，供音频层读）。 */
    readonly loudestWhenAlone: boolean;
  };
  readonly xuliao: {
    /** 连续几次同区完美点燃后触发"把句子弹回来"。 */
    readonly perfectChainForEcho: number;
    /** 回声延迟（小节）。 */
    readonly echoDelayBars: number;
    /** 照到"和弦外音区"时对远处/空中噪音的额外穿透。 */
    readonly outOfChordPierceBonus: Ratio;
  };
  readonly wensheng: {
    /** 她那一侧噪音的移速削减（0.3 = −30%）。 */
    readonly bassShieldSlowdown: Ratio;
    /** 线断时用身体挡接口的秒数（= 可插线窗口）。 */
    readonly bodyShieldSec: Seconds;
  };
  readonly shaoyan: {
    /** 某区开始冷却后留给玩家的救援窗口（= 角色瞬间 duration）。 */
    readonly coolGraceSec: Seconds;
    /** 保住的那一小节数（热度不掉）。 */
    readonly heatHoldBars: number;
  };
}

/** 成员被动数值（`Record<MemberId, …>` 展开写，便于逐条加注释）。 */
export const MEMBER_RULES: MemberRules = {
  jiangqi: {
    breathAtSec: 4,
    loudestWhenAlone: true,
  },
  xuliao: {
    perfectChainForEcho: 3,
    echoDelayBars: 8,
    outOfChordPierceBonus: 0.2,
  },
  wensheng: {
    bassShieldSlowdown: 0.3,
    bodyShieldSec: 1.5,
  },
  shaoyan: {
    coolGraceSec: 8,
    heatHoldBars: 1,
  },
};

/* ==========================================================================
 * 7. 三条乐器线（GDD §5.2 / tech-spec §5.2 LineState）
 * ========================================================================== */

/**
 * 乐器线规则：三条线（吉他 / 贝斯 / 鼓）对应三名队友。
 *
 * 线断 → 该线对应的被动失效；玩家按住 `E` 1.2s 插回（闻笙会替你挡 1.5s）。
 * 独奏（回照）时贝斯护盾失效（卡"回照"的代价）。
 */
export const LINE_RULES = {
  /** 三条线的固定顺序（HUD 图标与事件顺序）。 */
  lineIds: ['guitar', 'bass', 'drums'] as readonly InstrumentLineId[],
  /** 三条线的展示名（HUD 图标 tooltip、暂停面板、结算"断线"统计）。 */
  lineLabels: {
    guitar: '吉他 · 许燎',
    bass: '贝斯 · 闻笙',
    drums: '鼓 · 邵砚',
  } as Readonly<Record<InstrumentLineId, string>>,
  /** 按住 E 的插线时长（秒）。 */
  plugSec: 1.2,
  /** 线断后重新可插线的冷却（秒）：给"挡接口 1.5s"留出窗口。 */
  reclaimCooldownSec: 0.4,
  /** 贝斯护盾对噪音移速的削减（与 MEMBER_RULES.wensheng 同源，此处供 combat 读取）。 */
  bassShieldSlowdownRatio: 0.3,
} as const;

/* ==========================================================================
 * 8. 卡片规则里"不能用 modifier 表达"的常量
 * ========================================================================== */

/**
 * 卡牌的条件/上限常量。
 *
 * 只有"不是单个数值 modifier"的规则才放这里（其余的百分比与开关都在 cards.ts 的 `modifiers`）：
 * - `fourPartGapRatio`：四部齐的"人数差 <15%"条件；
 * - `choirWallMinPerZone`：合唱墙的"四区各 ≥40 人"条件；
 * - `frontRowSeats`：第一排的"最前 60 人"范围；
 * - `louderBrighterCap`：越吵越亮的输出上限；
 * - `singUnderLightBeats`：灯下合唱的 8 拍窗口；
 * - `distortionFeedSingSec`：失真饲料留下的噪点可唱化秒数。
 */
export const CARD_RULES = {
  fourPartGapRatio: 0.15,
  choirWallMinPerZone: 40,
  frontRowSeats: 60,
  louderBrighterCap: 0.3,
  singUnderLightBeats: 8,
  distortionFeedSingSec: 2.5,
} as const;

/* ==========================================================================
 * 9. GDD 未锁死的实现基线（可调，M5 第一周实机定）
 * ========================================================================== */

/**
 * 实现基线：GDD 给了倍率链与效果，但没有给"绝对伤害"这类实现量。
 *
 * 集中在此，**禁止**散落到 src/game 里硬编码。验收只锁倍率链
 * （完美 ≥1.6×、错拍 ≤40% 基础；AC-F05），不锁绝对值，所以这些数可以自由调。
 */
export const OPEN_TUNING = {
  /** 点燃的基础伤害（再乘 完美/良好/错拍 与 和弦内/外 系数）。 */
  igniteBaseDamage: 40,
  /** 点燃脉冲半径 = 当前光半径 × 该系数。 */
  ignitePulseRadiusScale: 1.2,
  /** 回照（独奏）的基础持续时长；卡"独奏延长"在它之上 +2s。 */
  selfBaseDurationSec: 4,
  /** 回照的基础冷却；卡"独奏延长"的代价在它之上 +1s。 */
  selfCooldownSec: 2,
  /** 独奏每秒对锥内噪音造成的伤害（GDD §10.2 的"每秒 30 伤害"，此处作为基线）。 */
  selfDamagePerSecond: 30,
  /** 独奏护盾被噪音撞击一次扣掉的点数（GDD §10.2："每次噪音撞击 −12"）。 */
  selfShieldHitCost: 12,
  /** 啸叫命中时击退光心的时长（GDD §8.1：击退 0.4s + 光闪 0.2s）。 */
  screamKnockbackSec: 0.4,
  /** 失真到舞台后光灭的时长（GDD §8.1：光灭 1.5s）。 */
  distortionLightOutSec: 1.5,
  /** 失真进入光锥时吞掉的锥长比例（GDD §8.1：30%）。 */
  distortionConeEatRatio: 0.3,
  /** 开局 0:10 前玩家没动鼠标时，光沿默认弧线扫过前两排的速度（m/s，GDD §14.1：0.45）。 */
  defaultSweepSpeed: 0.45,
} as const;

/* ==========================================================================
 * 10. 散落的单值常量
 * ========================================================================== */

/** 终曲"放下光"需要长按的秒数（GDD §13/A15：长按 1.5s）。 */
export const FINALE_HOLD_SEC: Seconds = 1.5;

/** 天花板裂缝上限（三次人浪各 +1；GDD §7.4）。 */
export const MAX_CRACKS = 3;

/** 开局观众占据的排数（GDD §7.1：30 人均匀分在前两排的四个区）。 */
export const START_AUDIENCE_ROWS = 2;

/** 回照"脚下"的判定半径（GDD §6.1：舞台中心 2m 内）。 */
export const SELF_LIGHT_RADIUS: number = 2;

/** 安可后四区热度 +1（GDD §13.3）。 */
export const ENCORE_HEAT_BONUS: HeatLevel = 1;

/** 返听（精英）规则：GDD §8.2，字段不属于 BalanceConfig，集中在此供 combat 读取。 */
export const RETURN_LISTENER_RULES = {
  /** 同时在场上限（默认 2；卡"返听诱饵"在它之上 +1）。 */
  maxSimultaneous: 2,
  /** 两次生成之间的最短间隔（秒；每道裂缝 −20%）。 */
  spawnCooldownSec: 20,
  /** 锁定后光锥半径削减（0.3 = −30%）。 */
  lockedRadiusPenalty: 0.3,
  /** 锁定后转化削减（0.5 = −50%）。 */
  lockedConversionPenalty: 0.5,
  /** 锁定时每多少秒在光锥边缘生成 1 只啸叫。 */
  screamSpawnIntervalSec: 1.5,
  /** 每道天花板裂缝让生成间隔缩短的比例（GDD §8.1："每道裂缝返听生成间隔 −20%"）。 */
  crackCooldownReduction: 0.2,
  /** 精英 HP（可烧死；烧死不产出观众，唱化产出 20 人）。 */
  maxHp: 300,
} as const;
