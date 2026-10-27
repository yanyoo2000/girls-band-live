/**
 * 敌人：3 种常规噪音 + 1 个精英（返听）+ 1 个 Boss（静默，三阶段）。
 *
 * 依据：docs/gdd.md §8（三种行为、精英反驻守、Boss 三阶段）、§4（3+1+1）；
 *       docs/art-direction.md §5（剪影与尺寸）；docs/tech-spec.md §7.1（NoiseKind 固定 5 值）。
 *
 * 设计约束（必须保留）：
 * - 三种常规噪音对应光的三种失效方式：底噪＝贴地难扫、啸叫＝直线难躲、失真＝吞光难照；
 * - 噪音**从光锥边缘 3–8m 处生成**（因果可读性的核心：噪音从你看的地方来）；
 * - 烧死噪音**不产出观众、不给经验**（GDD §8.1：无经验、无观众、只留 0.5s 黑烟）；
 * - Boss 不被打死、没有血条：它的"进度"是时间与段落，不是数值。
 */

import type { BossDef, BossPhaseDef, NoiseDef } from '../types/data';
import type { NoiseKind } from '../types/game';
import {
  BALANCE,
  BOSS_RETIRE_SEC,
  BOSS_STRIP_ZONE_THRESHOLD,
  RETURN_LISTENER_RULES,
} from './balance';

/* ==========================================================================
 * 1. 渲染层编码（NoiseFrame.kind 是 Uint8Array，必须固定映射）
 * ========================================================================== */

/**
 * `NoiseKind` → 渲染编码（写进 `NoiseFrame.kind: Uint8Array`）。
 *
 * 固定映射，不随数据顺序变化：渲染层的 instancing 按这个码决定用哪个 InstancedMesh。
 */
export const NOISE_KIND_CODES: Readonly<Record<NoiseKind, 0 | 1 | 2 | 3 | 4>> = {
  'floor-noise': 0,
  scream: 1,
  distortion: 2,
  'return-listener': 3,
  silence: 4,
};

/** 渲染编码 → kind（反查；长度固定 5，下标即编码）。 */
export const NOISE_KIND_BY_CODE: readonly NoiseKind[] = [
  'floor-noise',
  'scream',
  'distortion',
  'return-listener',
  'silence',
];

/* ==========================================================================
 * 2. 5 个噪音定义
 * ========================================================================== */

/**
 * Boss 的"不可击杀"血量哨兵值。
 *
 * `NoiseDef.maxHp` 是必填数字，而 Boss 没有血条、只按时间退场；
 * 用一个明确的哨兵值而不是 0（0 会被 `hp <= 0` 判成已死），并在 validateData 里断言它 ≥ 1e6。
 */
export const BOSS_UNKILLABLE_HP = 1_000_000;

/** 底噪：贴地小点、成串，从光锥边缘爬向观众区，覆盖座位。 */
const NOISE_FLOOR: NoiseDef = {
  kind: 'floor-noise',
  name: '底噪',
  description: '贴地小点、成串爬行：从光锥边缘渗出来，爬向观众区覆盖座位。它逼你"扫"而不是"停"。',
  speed: 2.2,
  maxHp: 12,
  radius: 0.35,
  coverRadius: 0.9,
  consequence: 'cover-seat',
  singSeconds: 2.5,
  yieldsAudienceOnBurn: false,
};

/** 啸叫：尖三角，锁定光的位置直线冲刺。 */
const NOISE_SCREAM: NoiseDef = {
  kind: 'scream',
  name: '啸叫',
  description:
    '尖三角，锁定光心直线冲刺（5.0m/s）：命中会击退光 0.4s 并让光闪 0.2s。它逼你"移"而不是"盯"。',
  speed: 5,
  maxHp: 18,
  radius: 0.7,
  coverRadius: 1.2,
  consequence: 'knockback-light',
  singSeconds: 2.5,
  yieldsAudienceOnBurn: false,
};

/** 失真：块状、缓慢，进入光锥时吞掉锥长；到舞台则光灭 1.5s。 */
const NOISE_DISTORTION: NoiseDef = {
  kind: 'distortion',
  name: '失真',
  description:
    '块状、缓慢（1.2m/s）：进入光锥吞掉 30% 锥长，爬到舞台则光灭 1.5s。它逼你"收束"而不是"铺开"。',
  speed: 1.2,
  maxHp: 90,
  radius: 1.2,
  coverRadius: 1.6,
  consequence: 'eat-light',
  // 血厚、慢，唱化窗口比小怪长，但需要热度 ≥2 的区持续照
  singSeconds: 3.5,
  yieldsAudienceOnBurn: false,
};

/**
 * 精英「返听」：反驻守的核心。
 *
 * 它是唯一有"声音"的敌人（低频自激）；锁定规则与数值在
 * `RETURN_LISTENER_RULES`（maxSimultaneous / spawnCooldownSec / 锁定惩罚）。
 * 这里只描述它在渲染与碰撞里的形态：站音箱堆，2.2m 耳形，不会走路。
 */
const NOISE_RETURN_LISTENER: NoiseDef = {
  kind: 'return-listener',
  name: '返听',
  description:
    '音箱堆上长出一只耳朵形状的黑影：它把光"咬住"（锥长 −30%、转化 −50%），并每 1.5s 在锥边生一只啸叫。移动 >8m 或断视线 1.5s 才松口。',
  speed: 0,
  maxHp: RETURN_LISTENER_RULES.maxHp,
  radius: 2.2,
  coverRadius: 0,
  consequence: 'eat-light',
  // 唱化一只 = 20 名观众（balance.conversion.returnListenerToAudience）
  singSeconds: 2.5,
  yieldsAudienceOnBurn: false,
};

/**
 * Boss「静默」：形态与存在感。
 *
 * 它没有血条、不会被打死（`maxHp` 用哨兵值），7:40 自己退场；
 * 三阶段的时间与规则见 `BOSS`（时段来自 `BALANCE.boss.phases`，单一来源）。
 */
const NOISE_SILENCE: NoiseDef = {
  kind: 'silence',
  name: '静默',
  description:
    '悬在桁架下的 6m 黑幕——它是"没有光"本身：依次关掉 16 个灯头、伸黑锥硬切你的锥长、四区落"耳种"。不可击杀，7:40 自己退场。',
  speed: 0,
  maxHp: BOSS_UNKILLABLE_HP,
  radius: 6,
  coverRadius: 0,
  consequence: 'eat-light',
  // Boss 不可被唱化：0 表示"永远唱不完"，不是"立即唱化"
  singSeconds: 0,
  yieldsAudienceOnBurn: false,
};

/**
 * 噪音表（5 个，穷尽 Record：`NoiseKind` 有 5 个值，少一个 tsc 直接报错）。
 *
 * 生成率不在这里——按段落定义（segments.ts 的 `spawnRates`），
 * 同屏上限/生成距离/裂缝加成在 `BALANCE.noise`。
 */
export const NOISE: Readonly<Record<NoiseKind, NoiseDef>> = {
  'floor-noise': NOISE_FLOOR,
  scream: NOISE_SCREAM,
  distortion: NOISE_DISTORTION,
  'return-listener': NOISE_RETURN_LISTENER,
  silence: NOISE_SILENCE,
};

/** 三种常规噪音的 id（波次/生成率只遍历这三个；精英与 Boss 单独调度）。 */
export const REGULAR_NOISE_KINDS: readonly NoiseKind[] = [
  'floor-noise',
  'scream',
  'distortion',
];

/* ==========================================================================
 * 3. Boss「静默」：三阶段
 * ========================================================================== */

/** Boss 阶段名（时间与阶段划分的唯一来源是 `BALANCE.boss.phases`）。 */
type BossPhaseName = 'bus' | 'light' | 'people';

/** 每阶段的文案与"拿走什么"（时间字段由 BALANCE 注入，避免两处手改）。 */
const BOSS_PHASE_TEXT: Readonly<
  Record<BossPhaseName, Omit<BossPhaseDef, 'phase' | 'startSec' | 'endSec'>>
> = {
  bus: {
    name: '抽总线',
    takesAway: 'sound',
    rule: '主总线 gain→0（数字零，不是变小）；只剩视觉节拍、四色点与波形，噪音继续。靠盲奏保住四区热度。',
  },
  light: {
    name: '吞光',
    takesAway: 'sight',
    rule: '光锥长度 −50%、颜色抽灰；失真成对出现。收束光、点燃、靠近舞台自保。',
  },
  people: {
    name: '冷却',
    takesAway: 'people',
    rule: '四区热度衰减 ×3，返听出现。不停扫场，接受掉人。',
  },
};

/** Boss 阶段（按时间排序，从 `BALANCE.boss.phases` 组装）。 */
export const BOSS_PHASES: readonly BossPhaseDef[] = BALANCE.boss.phases.map((phase) => ({
  phase: phase.phase,
  startSec: phase.startSec,
  endSec: phase.endSec,
  ...BOSS_PHASE_TEXT[phase.phase],
}));

/**
 * Boss 定义（无血条）。
 *
 * - `retireSec`：7:40 退场（= 桥段结束、终曲开始）；
 * - `stripZoneThreshold`：退场时人气 <150 → 永久带走一个区（该区热度上限降为 1）；
 * - `returnedAudiencePerPhase`：每撑过一个阶段返场 +30 人（与 balance.conversion 同源）。
 */
export const BOSS: BossDef = {
  name: NOISE_SILENCE.name,
  phases: BOSS_PHASES,
  retireSec: BOSS_RETIRE_SEC,
  stripZoneThreshold: BOSS_STRIP_ZONE_THRESHOLD,
  returnedAudiencePerPhase: BALANCE.conversion.bossPhaseAudience,
};
