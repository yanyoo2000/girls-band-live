/**
 * 内容与数据 schema 类型契约（纯类型模块）。
 *
 * 依赖方向：本文件只 import `./game` 的类型，不 import 实现/React/Three；
 * 运行时数据（`src/data/*.ts`）由 dev-content 按本契约实现，逻辑层只读。
 *
 * id 规则：全部 kebab-case、全局唯一；卡 id 见 `CardId`，进化用 `EvolutionId`
 * 并通过 `EvolutionDef.core` / `EvolutionDef.requires` 反向解析到卡。
 */

import type {
  BuildId,
  CardId,
  CoreCardId,
  EndingKind,
  EvolutionId,
  Grade,
  HeatLevel,
  InstrumentLineId,
  LayerId,
  LightMode,
  MemberId,
  MemberMomentId,
  Meters,
  NoiseKind,
  Ratio,
  Seconds,
  SegmentId,
  SfxId,
  ZoneId,
} from './game';

/* ==========================================================================
 * 1. 角色与剪影
 * ========================================================================== */

/** 40px 下可读的三重辨识（轮廓 / 主色 / 乐器形状）。 */
export interface SilhouetteDef {
  /** 轮廓关键词（文档用，便于美术对齐）。 */
  readonly outline: string;
  /** 主色 token。 */
  readonly primary: PaletteToken;
  /** 次色 token。 */
  readonly secondary: PaletteToken;
  /** 乐器在 6–8px 下的形状描述。 */
  readonly instrumentShape: string;
  /** 舞台站位（世界坐标）。 */
  readonly stagePosition: { readonly x: Meters; readonly z: Meters };
}

/** 角色定义。 */
export interface CharacterDef {
  readonly id: MemberId;
  readonly name: string;
  /** 一句话：她是谁。 */
  readonly who: string;
  /** 一句话：她怎么打（系统）。 */
  readonly how: string;
  /** 一句话：她怕什么。 */
  readonly fear: string;
  readonly silhouette: SilhouetteDef;
  /** 她负责的乐器线；主唱为 null。 */
  readonly line: InstrumentLineId | null;
  /** 她的角色瞬间。 */
  readonly moment: MemberMomentId;
  /** 是否可操作（只有主唱为 true）。 */
  readonly playable: boolean;
}

/** 角色瞬间定义（由数据驱动文本，由 combat 触发）。 */
export interface MemberMomentDef {
  readonly id: MemberMomentId;
  readonly member: MemberId;
  readonly trigger: 'run-start' | 'three-perfect-ignites' | 'line-break' | 'zone-cooling';
  readonly duration: Seconds;
  readonly description: string;
}

/* ==========================================================================
 * 2. 座区、光形态、座位网格
 * ========================================================================== */

/** 座区定义（同时是声部）。 */
export interface ZoneDef {
  readonly id: ZoneId;
  /** 该区演唱的和弦音级。 */
  readonly voice: 'root' | 'third' | 'fifth' | 'seventh';
  readonly rowRange: readonly [number, number];
  readonly colRange: readonly [number, number];
  readonly colorToken: PaletteToken;
  /** HUD 四角的位置。 */
  readonly corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

/** 光形态（武器等价物）。 */
export interface LightFormDef {
  readonly id: LightMode;
  readonly name: string;
  readonly description: string;
  readonly radius: Meters;
  readonly conversionMultiplier: number;
  readonly burnMultiplier: number;
  readonly canConvert: boolean;
  /** 每 4 拍人气变化（回照为负）。 */
  readonly audienceDeltaPer4Beats: number;
  /** 护盾上限（仅回照）。 */
  readonly shield: number;
}

/** 座位网格（768 = 24 × 32）。 */
export interface SeatGridDef {
  readonly rows: number;
  readonly cols: number;
  readonly capacity: number;
  /** 中央走道所在的列边界；主走道所在的行边界。 */
  readonly aisleCol: number;
  readonly aisleRow: number;
  /** 走道额外间隙（米）：列 ≥ aisleCol 或排 ≥ aisleRow 的座位在该轴上加出的距离。 */
  readonly aisleGap: Meters;
  /** 座位在世界坐标中的原点与间距。 */
  readonly origin: { readonly x: Meters; readonly z: Meters };
  readonly spacing: { readonly x: Meters; readonly z: Meters };
  /** 排高（后排更高，用于剪影可读）。 */
  readonly rowRise: Meters;
}

/* ==========================================================================
 * 3. 敌人与 Boss
 * ========================================================================== */

/** 常规噪音 + 精英定义。 */
export interface NoiseDef {
  readonly kind: NoiseKind;
  readonly name: string;
  readonly description: string;
  readonly speed: Meters;
  readonly maxHp: number;
  readonly radius: Meters;
  /** 接触观众时的覆盖半径。 */
  readonly coverRadius: Meters;
  /** 命中/覆盖后果。 */
  readonly consequence: 'cover-seat' | 'knockback-light' | 'eat-light';
  /** 唱化所需秒数（热量 ≥2 的区内）。 */
  readonly singSeconds: Seconds;
  /** 烧死是否产出观众（恒为 false，仅文档化）。 */
  readonly yieldsAudienceOnBurn: boolean;
}

/** Boss 单阶段定义。 */
export interface BossPhaseDef {
  readonly phase: 'bus' | 'light' | 'people';
  readonly startSec: Seconds;
  readonly endSec: Seconds;
  readonly name: string;
  readonly takesAway: 'sound' | 'sight' | 'people';
  readonly rule: string;
}

/** Boss 定义（无血条）。 */
export interface BossDef {
  readonly name: string;
  readonly phases: readonly BossPhaseDef[];
  readonly retireSec: Seconds;
  /** 退场时人气低于该值则永久带走一个区。 */
  readonly stripZoneThreshold: number;
  /** 每阶段完成的返场观众数。 */
  readonly returnedAudiencePerPhase: number;
}

/* ==========================================================================
 * 4. 段落、拍点、和弦
 * ========================================================================== */

/** 拍点网格（唯一时间基准）。 */
export interface BeatGridDef {
  readonly bpm: number;
  readonly beatsPerBar: number;
  readonly barsPerPhrase: number;
  /** 16 分音符细分数。 */
  readonly subdivisionsPerBeat: number;
  /** 全曲小节数（9:30 @128BPM = 304 小节）。 */
  readonly totalBars: number;
}

/** 和弦 id（由数据层枚举）。 */
export type ChordKey =
  | 'am'
  | 'f'
  | 'c'
  | 'g'
  | 'dm'
  | 'e'
  | 'am7'
  | 'fmaj7'
  | 'cmaj7'
  | 'g7';

/** 和弦定义：四区各自是否落在和弦内音。 */
export interface ChordDef {
  readonly id: ChordKey;
  readonly root: string;
  readonly quality: 'minor' | 'major' | 'dominant7' | 'major7' | 'minor7';
  /** 该和弦下四区是否为内音（第 4 区在七和弦时才是内音）。 */
  readonly zoneInChord: Readonly<Record<ZoneId, boolean>>;
}

/** 段落定义。 */
export interface SegmentDef {
  readonly id: SegmentId;
  readonly index: 0 | 1 | 2 | 3 | 4;
  readonly name: string;
  readonly startSec: Seconds;
  readonly endSec: Seconds;
  /** 该段启用的音乐层。 */
  readonly layers: readonly LayerId[];
  /** 该段三种常规噪音的生成率（只/秒）。 */
  readonly spawnRates: Readonly<Record<'floor-noise' | 'scream' | 'distortion', number>>;
  /** 该段的灯光态。 */
  readonly lighting: 'warm' | 'full' | 'blackout';
  /** 该段使用的小节和弦序列（循环）。 */
  readonly chords: readonly ChordKey[];
}

/* ==========================================================================
 * 5. 卡池、进化、构筑
 * ========================================================================== */

/** 卡效果键（逻辑层按 key 查表，不写 if-else 链）。 */
export type ModifierKey =
  | 'wave-damage-multiplier'
  | 'wave-convert-count'
  | 'audience-decay-rate'
  | 'shield-max'
  | 'shield-regen'
  | 'burn-multiplier'
  | 'conversion-multiplier'
  | 'bait-zone-multiplier'
  | 'black-zone-heat-cap'
  | 'black-resing-multiplier'
  | 'all-zone-damage-multiplier'
  | 'heat-decay-delay'
  | 'front-row-heat-floor'
  | 'back-row-decay-extra'
  | 'zone-damage-after-perfect'
  | 'heat-cap'
  | 'zone-output-multiplier'
  | 'beam-radius-multiplier'
  | 'beam-damage-multiplier'
  | 'self-duration'
  | 'self-cooldown'
  | 'burn-chain-chance'
  | 'self-wave-retain'
  | 'return-listener-sing-multiplier'
  | 'return-listener-cap'
  | 'distortion-feed-nodes'
  | 'distortion-hp-multiplier'
  | 'black-tide-bonus'
  | 'black-burn-disabled'
  | 'damage-per-noise'
  | 'backlight-conversion'
  | 'front-conversion-penalty'
  | 'ignite-cooldown-beats'
  | 'auto-convert-interval-beats'
  | 'move-speed-multiplier'
  | 'perfect-window-bonus'
  | 'backstage-audience-per-30s'
  | 'encore-retain';

/** 单条卡效果（数值单位由 key 决定，见 tech-spec §8.3）。 */
export interface CardModifier {
  readonly key: ModifierKey;
  readonly value: number;
}

/** 卡定义（24 张）。 */
export interface CardDef {
  readonly id: CardId;
  readonly name: string;
  /** 一句话效果（UI 展示）。 */
  readonly description: string;
  /** 一句话代价（UI 展示；无代价为 null）。 */
  readonly cost: string | null;
  readonly category: 'core' | 'support' | 'generic';
  /** 所属构筑；通用卡为 null。 */
  readonly build: BuildId | null;
  readonly modifiers: readonly CardModifier[];
  /** 进化所需卡（仅核心卡与支援卡用于进化匹配）。 */
  readonly evolution: EvolutionId | null;
}

/** 进化定义（3 个）。 */
export interface EvolutionDef {
  readonly id: EvolutionId;
  readonly name: string;
  readonly description: string;
  readonly core: CoreCardId;
  /** 除核心外还需要持有的支援卡（3 张）。 */
  readonly requires: readonly CardId[];
  /** 触发持续时间。 */
  readonly duration: Seconds;
  readonly effect:
    | { readonly kind: 'choir-hall'; readonly damageMultiplier: number; readonly convertRatio: 6 }
    | { readonly kind: 'solo-show'; readonly damageMultiplier: number; readonly silenceSeconds: Seconds }
    | { readonly kind: 'black-tide-encore'; readonly waveConvertRatio: 4; readonly autoPullSeconds: Seconds };
}

/** 构筑路线定义（3 条）。 */
export interface BuildDef {
  readonly id: BuildId;
  readonly name: string;
  readonly core: CoreCardId;
  readonly supports: readonly CardId[];
  readonly evolution: EvolutionId;
  /** 一句话打法。 */
  readonly approach: string;
}

/** 升级曲线与抽卡限制。 */
export interface ProgressionDef {
  /** 10 个累计经验阈值。 */
  readonly thresholds: readonly number[];
  /** 每次 offer 的卡数。 */
  readonly offerSize: 3;
  /** 单局最多选择次数。 */
  readonly maxPicks: 10;
  /** 经验来源。 */
  readonly experience: {
    readonly convert: number;
    readonly perfectIgnite: number;
    readonly crowdWave: number;
  };
}

/* ==========================================================================
 * 6. 音频、配色、文案
 * ========================================================================== */

/** SFX 定义（12 个，全部 WebAudio 合成）。 */
export interface SfxDef {
  readonly id: SfxId;
  readonly name: string;
  /** 合成配方的一句话描述（实现细节在 src/audio）。 */
  readonly recipe: string;
  /** 最短间隔（防止同帧叠加爆音）。 */
  readonly minInterval: Seconds;
  readonly maxConcurrent: number;
}

/** 音频规格（与 60 秒切片同源）。 */
export interface AudioSpec {
  readonly bpm: number;
  readonly key: 'A minor';
  readonly bandLayers: readonly LayerId[];
  /** 12 = 4 区 × 3 层。 */
  readonly choirVoices: number;
  readonly choirZones: number;
  readonly choirLayersPerZone: number;
  /** 程序化 IR 预设（秒）。 */
  readonly irPresets: readonly Seconds[];
  readonly compressor: {
    readonly thresholdDb: number;
    readonly ratio: number;
    readonly attack: Seconds;
    readonly release: Seconds;
  };
  readonly highShelf: { readonly frequency: number; readonly gainDb: number };
  readonly ducking: { readonly amount: number; readonly attack: Seconds; readonly release: Seconds };
}

/** 色彩 token（只允许全项目使用这些；第四种高饱和色 = bug）。 */
export type PaletteToken =
  | 'ink'
  | 'stage-warm'
  | 'stage-full'
  | 'stage-black'
  | 'audience-grey'
  | 'audience-colored'
  | 'audience-black'
  | 'zone-root'
  | 'zone-third'
  | 'zone-fifth'
  | 'zone-seventh'
  | 'member-jiangqi'
  | 'member-xuliao'
  | 'member-wensheng'
  | 'member-shaoyan'
  | 'whiteout'
  | 'danger';

/** 配色表（CSS 变量与 Three 材质共用同一份）。 */
export interface PaletteDef {
  readonly tokens: Readonly<Record<PaletteToken, string>>;
  /** 三色规则：灰/彩/黑。 */
  readonly audienceStates: Readonly<Record<'grey' | 'colored' | 'black', PaletteToken>>;
}

/** 文案触发点。 */
export type CopyTrigger =
  | 'run-start'
  | 'first-convert'
  | 'first-crowd-wave'
  | 'return-lock'
  | 'line-break'
  | 'silence'
  | 'finale-drop'
  | 'empty-house'
  | 'failure'
  | 'results-backstage';

/** 结算短句的上下文（由本局真实数据构成）。 */
export interface CopyContext {
  readonly ending: EndingKind;
  readonly grade: Grade | null;
  readonly converted: number;
  readonly burned: number;
  readonly covered: number;
  readonly cracks: number;
  readonly breakout: Readonly<Record<ZoneId, number>>;
  readonly emptySeats: number;
  readonly secondRowEmpty: number;
  readonly lineBreaks: Readonly<Record<InstrumentLineId, number>>;
  readonly returnLocks: number;
}

/** 文案行（后台曲目单 / 失败卡 / 结算后台）。 */
export interface CopyLineDef {
  readonly id: string;
  readonly trigger: CopyTrigger;
  readonly speaker: MemberId | 'narrator';
  /** 纯文本模板；不含 HTML。 */
  readonly render: (ctx: CopyContext) => string;
}

/** 文案库。 */
export interface CopyBank {
  readonly lines: readonly CopyLineDef[];
  /** 失败卡三条原因的中文模板。 */
  readonly failureReasons: Readonly<Record<string, (value: number) => string>>;
  /** 评级文案。 */
  readonly grades: Readonly<Record<Grade, string>>;
}

/* ==========================================================================
 * 7. 平衡表（全部可调数值集中在此，逻辑层不得硬编码）
 * ========================================================================== */

/** 平衡参数（分组）。 */
export interface BalanceConfig {
  readonly run: {
    readonly durationSec: Seconds;
    readonly startAudience: number;
    readonly capacity: number;
    readonly lowAudienceRatio: Ratio;
    readonly lowAudienceBars: number;
    readonly encoreRestoreRatio: Ratio;
    readonly encoreMinAudience: number;
  };
  readonly light: {
    readonly inertiaSec: Seconds;
    readonly trailSec: Seconds;
    readonly ignitePulseSec: Seconds;
    readonly igniteCooldownBeats: number;
    readonly perfectWindow: Seconds;
    readonly goodWindow: Seconds;
    readonly perfectMultiplier: number;
    readonly goodMultiplier: number;
    readonly offMultiplier: number;
    readonly inChordBonus: Ratio;
    readonly outChordPenalty: Ratio;
    readonly outChordSpawnMultiplier: number;
  };
  readonly conversion: {
    readonly stopSec: Seconds;
    readonly seatSec: Seconds;
    readonly interruptRetain: Ratio;
    readonly noiseToAudience: number;
    readonly waveNoiseToAudience: number;
    readonly returnListenerToAudience: number;
    readonly bossPhaseAudience: number;
    readonly tintSec: Seconds;
  };
  readonly heat: {
    readonly riseSec: Seconds;
    readonly decayDelay: Seconds;
    readonly decaySec: Seconds;
    readonly heat4DecayMultiplier: number;
    readonly overheatSeconds: Seconds;
    readonly overheatDecayMultiplier: number;
    readonly overheatConversionPenalty: Ratio;
    readonly peopleLostPerCover: number;
  };
  readonly antiCamp: {
    readonly anchorRadius: Meters;
    readonly anchorSeconds: Seconds;
    readonly sameZoneSeconds: Seconds;
    readonly releaseDistance: Meters;
    readonly releaseSeconds: Seconds;
    readonly sweepWindow: Seconds;
    readonly sweepZones: number;
    readonly sweepBonus: Ratio;
    readonly behindSpawnInterval: Seconds;
    readonly behindSpawnChance: Ratio;
  };
  readonly crowdWave: {
    readonly times: readonly Seconds[];
    readonly thresholds: readonly number[];
    readonly sweepSec: Seconds;
    readonly convertRatio: number;
    readonly heatBonus: HeatLevel;
    readonly warningSec: Seconds;
  };
  readonly noise: {
    readonly cap: number;
    readonly capLow: number;
    readonly spawnMinDistance: Meters;
    readonly spawnMaxDistance: Meters;
    readonly crackSpawnMultiplier: number;
    readonly singHeatRequired: HeatLevel;
  };
  readonly boss: {
    readonly phases: readonly {
      readonly phase: 'bus' | 'light' | 'people';
      readonly startSec: Seconds;
      readonly endSec: Seconds;
    }[];
    readonly silenceBars: number;
    readonly phase2LightScale: Ratio;
    readonly phase3DecayMultiplier: number;
  };
  readonly performance: {
    readonly fixedStepHz: number;
    readonly entityCap: number;
    readonly particles: number;
    readonly particlesLow: number;
    readonly drawCalls: number;
    readonly drawCallsMax: number;
    readonly triangles: number;
    readonly trianglesMax: number;
    readonly coneOverdraw: Ratio;
    readonly coneOverdrawMax: Ratio;
    readonly totalOverdraw: number;
    readonly totalOverdrawMax: number;
    readonly dprHigh: number;
    readonly dprLow: number;
    readonly hudHz: number;
  };
}

/* ==========================================================================
 * 8. 数据注册表（逻辑层的唯一内容入口）
 * ========================================================================== */

/** 数据注册表（不是运行期状态；只读）。 */
export interface DataRegistry {
  readonly version: string;
  readonly characters: readonly CharacterDef[];
  readonly moments: readonly MemberMomentDef[];
  readonly zones: readonly ZoneDef[];
  readonly lightForms: Readonly<Record<LightMode, LightFormDef>>;
  readonly cards: Readonly<Record<CardId, CardDef>>;
  readonly builds: Readonly<Record<BuildId, BuildDef>>;
  readonly evolutions: Readonly<Record<EvolutionId, EvolutionDef>>;
  readonly noise: Readonly<Record<NoiseKind, NoiseDef>>;
  readonly boss: BossDef;
  readonly segments: readonly SegmentDef[];
  readonly beatGrid: BeatGridDef;
  readonly chords: Readonly<Record<ChordKey, ChordDef>>;
  readonly seats: SeatGridDef;
  readonly progression: ProgressionDef;
  readonly sfx: Readonly<Record<SfxId, SfxDef>>;
  readonly audio: AudioSpec;
  readonly palette: PaletteDef;
  readonly copy: CopyBank;
  readonly balance: BalanceConfig;
}
