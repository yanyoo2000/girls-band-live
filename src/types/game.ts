/**
 * 游戏层共享类型契约（纯类型模块）。
 *
 * 约束：
 * - 本文件只允许 `export type` / `export interface`，不产生任何运行时代码；
 * - 不允许 import `react` / `three` / DOM / 实现模块；
 * - 逻辑时间单位统一为秒，坐标统一为 Three.js 世界坐标（y 向上），碰撞只在 XZ 平面。
 *
 * 依据：docs/gdd.md §22.1；docs/tech-spec.md §5。
 */

import type { DisplaySettings } from './save';

/* ==========================================================================
 * 1. 标量与几何
 * ========================================================================== */

/** 秒（逻辑时间、音频时钟统一单位）。 */
export type Seconds = number;
/** 米（世界坐标长度单位）。 */
export type Meters = number;
/** 0..1 的归一化比例。 */
export type Ratio = number;
/** 帧序号（固定步长 60Hz 累加）。 */
export type FrameIndex = number;

/** XZ 平面坐标（世界坐标）。 */
export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

/** 三维世界坐标（渲染层使用，逻辑层不产生 y）。 */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** 圆（XZ 平面，碰撞与光照判定共用）。 */
export interface Circle {
  readonly center: Vec2;
  readonly radius: Meters;
}

/** 闭区间数值范围。 */
export interface NumericRange {
  readonly min: number;
  readonly max: number;
}

/* ==========================================================================
 * 2. 标识（全局 kebab-case，唯一；数据层与逻辑层共用）
 * ========================================================================== */

/** 四个座区（同时是四个声部）。 */
export type ZoneId = 'front-left' | 'front-right' | 'back-left' | 'back-right';

/** 五个段落。 */
export type SegmentId = 'overture' | 'verse' | 'chorus' | 'bridge' | 'finale';

/** 四名乐队成员。 */
export type MemberId = 'jiangqi' | 'xuliao' | 'wensheng' | 'shaoyan';

/** 三条乐器线（吉他 / 贝斯 / 鼓）。 */
export type InstrumentLineId = 'guitar' | 'bass' | 'drums';

/** 噪音种类（3 常规 + 1 精英 + Boss）。 */
export type NoiseKind = 'floor-noise' | 'scream' | 'distortion' | 'return-listener' | 'silence';

/** 光的三种形态（"武器"等价物）。 */
export type LightMode = 'spread' | 'beam' | 'self';

/** 观众热度。3 为常态上限，4 仅由「热度上限」卡解锁。 */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

/** 观众个体状态（字符串形态，用于事件与结算；实例化数据用 AudienceStateCode）。 */
export type AudienceState = 'empty' | 'grey' | 'colored' | 'black' | 'left';

/**
 * 观众实例状态码（写进 typed array 的紧凑编码）。
 * 0 = 空座未出席，1 = 灰（尚未表态），2 = 彩（自己人），3 = 黑（被噪音覆盖），4 = 已离场。
 */
export type AudienceStateCode = 0 | 1 | 2 | 3 | 4;

/** 三条构筑。 */
export type BuildId = 'choir' | 'solo' | 'bait';

/** 三张互斥核心卡。 */
export type CoreCardId = 'choir-wall' | 'solo-return' | 'bait-line';

/** 24 张卡的 id（3 核心 + 15 支援 + 6 通用，见 docs/gdd.md §10.2）。 */
export type CardId =
  // 核心（互斥）
  | 'choir-wall'
  | 'solo-return'
  | 'bait-line'
  // 合唱流支援
  | 'four-part'
  | 'keep-them'
  | 'front-row'
  | 'sing-under-light'
  | 'heat-cap'
  // 独奏流支援
  | 'tight-beam'
  | 'shield'
  | 'solo-extend'
  | 'burn-chain'
  | 'self-hear'
  // 招灾流支援
  | 'return-bait'
  | 'distortion-feed'
  | 'black-tide'
  | 'louder-brighter'
  | 'reverse-light'
  // 通用
  | 'breathe'
  | 'pluck'
  | 'footwork'
  | 'beat-ignite'
  | 'second-row'
  | 'encore-insurance';

/** 三个进化。 */
export type EvolutionId = 'choir-hall' | 'solo-show' | 'black-tide-encore';

/** 四个角色瞬间（不靠立绘/配音）。 */
export type MemberMomentId = 'breath' | 'echoed-phrase' | 'body-shield' | 'half-beat';

/** 结算评级。 */
export type Grade = 'S' | 'A' | 'B' | 'C';

/** 一局的三种收尾形状。 */
export type EndingKind = 'complete' | 'empty-house' | 'interrupted';

/** 音频层（5 条乐队层 + 合唱 + 房间底噪）。 */
export type LayerId = 'drums' | 'bass' | 'chords' | 'lead' | 'arp' | 'choir' | 'room';

/** 12 个 SFX（与 docs/gdd.md §17.2 一一对应）。 */
export type SfxId =
  | 'convert-chime'
  | 'ignite-hit'
  | 'burn-hiss'
  | 'choir-pulse'
  | 'return-lock'
  | 'line-snap'
  | 'crowd-wave'
  | 'silence-toggle'
  | 'encore'
  | 'drop-light'
  | 'fail'
  | 'ui';

/** 点燃命中档位。 */
export type IgniteQuality = 'perfect' | 'good' | 'off';

/* ==========================================================================
 * 3. 运行期状态
 * ========================================================================== */

/** 一局的流程相位（与 §13 状态机对应，空场是相位而不是结局）。 */
export type RunPhase = 'playing' | 'levelup' | 'paused' | 'empty-house' | 'finale-hold' | 'results';

/** 一局模式：normal 为正式局；gate-90s 为 90 秒门埋点局（仅 dev/QA 使用）。 */
export type RunMode = 'normal' | 'gate-90s';

/** 开局参数（种子决定噪音/卡序/观众分布，保证可复现）。 */
export interface RunConfig {
  readonly seed: number;
  readonly mode: RunMode;
}

/** 音乐位置（由音频时钟派生，不读帧时钟）。 */
export interface MusicalPosition {
  /** 全局小节号，0 起。 */
  readonly bar: number;
  /** 小节内的拍，0 起。 */
  readonly beat: number;
  /** 当前拍的 0..1 相位。 */
  readonly beatPhase: Ratio;
  /** 8 小节乐句内的拍序号。 */
  readonly phraseBeat: number;
  readonly segment: SegmentId;
  readonly segmentProgress: Ratio;
  readonly bpm: number;
}

/** 单个拍点（事件与视觉同步的原子单位）。 */
export interface BeatTick {
  readonly index: number;
  readonly time: Seconds;
  readonly bar: number;
  readonly beat: number;
  readonly phrase: number;
  readonly isBarStart: boolean;
  readonly strength: 'strong' | 'weak';
}

/** 光的状态（唯一"武器"）。 */
export interface LightState {
  /** 当前光心（带惯性后的实际位置）。 */
  position: Vec2;
  /** 目标位置（鼠标反投影结果）。 */
  target: Vec2;
  mode: LightMode;
  radius: Meters;
  intensity: Ratio;
  /** 点燃冷却剩余秒数。 */
  igniteCooldown: Seconds;
  /** 反驻守：最近一次移动的锚点与静止时长。 */
  anchor: Vec2;
  anchorAge: Seconds;
  /** 4 秒窗口内跨过的区数（扫场奖励）。 */
  sweptZones: number;
  /** 扫场奖励剩余点燃次数。 */
  sweepBonusCharges: number;
  /** 当前被照亮的区（无则 null）。 */
  lightingZone: ZoneId | null;
}

/** 玩家（主唱）本体。 */
export interface PlayerState {
  position: Vec2;
  facing: number;
  moveSpeed: Meters;
  /** 终曲长按的累计秒数。 */
  holdSeconds: Seconds;
}

/** 单个座区的运行期状态。 */
export interface ZoneState {
  readonly id: ZoneId;
  heat: HeatLevel;
  /** 连续被照亮的秒数（过热点判定）。 */
  litSeconds: Seconds;
  overheat: boolean;
  /** 该区当前亮着的人数（含黑观众之外的所有出席者）。 */
  litSeats: number;
  blackSeats: number;
  /** 该区合唱声部当前增益来源人数。 */
  choirDrivers: number;
}

/** 观众实例数据（768 席；渲染层只读）。 */
export interface AudienceFrame {
  /** 结构与状态版本号，渲染层据此判断是否整批上传。 */
  readonly revision: number;
  /** 实例总数（768；低画质仍为 768，仅减少可见实例的绘制）。 */
  readonly size: number;
  /** AudienceStateCode 编码。 */
  readonly state: Uint8Array;
  /** 热度 0..4。 */
  readonly heat: Uint8Array;
  /** 手机灯是否亮（0/1）。 */
  readonly phone: Uint8Array;
  /** 所属座区索引 0..3（ZoneId 顺序固定）。 */
  readonly zone: Uint8Array;
  /** 转彩进度 0..1（灰→彩 0.8s 动画，供渲染层插值）。 */
  readonly tint: Float32Array;
  /** 自上次帧以来发生变化的区间（脏区上传）。 */
  readonly dirty: readonly DirtyRange[];
}

/** InstancedMesh 脏区上传区间。 */
export interface DirtyRange {
  readonly start: number;
  readonly count: number;
}

/** 单个座位的人类可读视图（事件、失败卡、调试与 QA 用；热路径只读 typed array）。 */
export interface AudienceCell {
  readonly seat: number;
  readonly row: number;
  readonly col: number;
  readonly zone: ZoneId;
  readonly state: AudienceState;
  readonly heat: HeatLevel;
  readonly phone: boolean;
}

/** 一次音频提示（audio 端口与 AudioCueEvent 共用）。 */
export interface AudioCue {
  readonly id: SfxId;
  readonly variant: IgniteQuality | null;
  readonly at: Vec3;
  readonly gain: Ratio;
}


/** 噪音实体（对象池中的一个槽位；active=false 时不参与渲染与碰撞）。 */
export interface NoiseEntity {
  readonly id: number;
  kind: NoiseKind;
  active: boolean;
  position: Vec2;
  velocity: Vec2;
  radius: Meters;
  hp: number;
  maxHp: number;
  state: 'crawling' | 'singing' | 'dying';
  /** 追逐目标座位索引（无则 -1）。 */
  targetSeat: number;
  /** 唱化进度 0..1。 */
  singProgress: Ratio;
  /** 剩余存在秒数（dying 用）。 */
  remaining: Seconds;
}

/** 精英「返听」状态（反驻守核心）。 */
export interface ReturnListenerState {
  /** 场上是否存在。 */
  active: boolean;
  /** 生成点（音箱堆）。 */
  anchor: Vec2 | null;
  /** 是否咬住光。 */
  locked: boolean;
  lockSeconds: Seconds;
  hp: number;
  maxHp: number;
  /** 距离下一次可生成的冷却。 */
  spawnCooldown: Seconds;
  /** 场上实体数量（上限 2）。 */
  count: number;
}

/** Boss「静默」的三阶段。 */
export type BossPhase = 'bus' | 'light' | 'people' | 'retired';

/** Boss 状态（无血条，只有段落与时间）。 */
export interface BossState {
  phase: BossPhase;
  /** 本阶段开始时间。 */
  phaseStartedAt: Seconds;
  /** 是否已经在 7:40 退场。 */
  retired: boolean;
  /** 退场时若人气 <150，被永久带走的区。 */
  strippedZone: ZoneId | null;
}

/** 乐器线状态。 */
export interface LineState {
  readonly id: InstrumentLineId;
  member: MemberId;
  broken: boolean;
  /** 玩家按住 E 的插线进度 0..1（1.2s 满）。 */
  plugProgress: Ratio;
  /** 贝斯护盾是否生效。 */
  shieldActive: boolean;
}

/** 构筑状态（一局内）。 */
export interface BuildState {
  coreCard: CoreCardId | null;
  /** 本局已拿的支援/通用卡（按获取顺序）。 */
  cards: CardId[];
  evolution: EvolutionId | null;
  /** 是否已触发过进化（每局最多一次）。 */
  evolutionFired: boolean;
  /** 已拿卡数量（上限 10）。 */
  picks: number;
  /** 本局已被永久移除的卡（核心互斥后的另外 10 张支援 + 2 张核心）。 */
  removed: CardId[];
}

/** 当前三选一（levelup 相位时非 null）。 */
export interface CardOffer {
  readonly offerId: number;
  readonly cards: readonly CardId[];
}

/** 人浪状态。 */
export interface CrowdWaveState {
  /** 已触发次数 0..3。 */
  readonly index: 0 | 1 | 2 | 3;
  /** 下一次计划触发时间；已触发或不足阈值时为 null。 */
  nextAt: Seconds | null;
  /** 正在进行的浪：0..1 进度；未进行为 null。 */
  progress: Ratio | null;
  /** 本次浪的起点区。 */
  origin: ZoneId | null;
}

/** 失败卡的第三行所需数据（最后 5 秒回放）。 */
export interface FailureReplay {
  readonly lightPath: readonly Vec2[];
  readonly ignites: number;
  readonly movedMeters: Meters;
}

/** 失败原因编码（文案由数据层模板渲染，逻辑层只给事实）。 */
export type FailureReasonCode =
  | 'return-listener-lock'
  | 'zone-cooled'
  | 'audience-left'
  | 'no-ignite'
  | 'overheated-zone';

/** 单条失败事实。 */
export interface FailureReason {
  readonly code: FailureReasonCode;
  readonly seconds: Seconds;
  readonly zone: ZoneId | null;
  /** 关联人数（离场/掉级人数等）。 */
  readonly people: number;
}

/** 失败卡（3 秒可读）。 */
export interface FailureCard {
  readonly at: Seconds;
  readonly segment: SegmentId;
  readonly reasons: readonly [FailureReason, FailureReason, FailureReason];
  readonly replay: FailureReplay;
}

/** 一局的统计（结算、失败卡、评级共用）。 */
export interface RunStats {
  readonly peakAudience: number;
  readonly finalAudience: number;
  /** 转化人数（灰→彩的累计）。 */
  readonly converted: number;
  /** 烧死噪音数（不产出观众）。 */
  readonly burned: number;
  /** 被噪音覆盖的人次（不是人数）。 */
  readonly covered: number;
  /** 离场人数。 */
  readonly leftVenue: number;
  readonly ignitesPerfect: number;
  readonly ignitesGood: number;
  readonly ignitesOff: number;
  readonly crowdWaves: number;
  readonly cracks: number;
  readonly returnLocks: number;
  readonly encoreUsed: boolean;
  /** 用掉的总时长。 */
  readonly duration: Seconds;
}

/** 一局结果（结算页与存档用的不可变快照）。 */
export interface RunResult {
  readonly seed: number;
  readonly ending: EndingKind;
  /** 空场完成固定为 C；中断为 null（没有评级）。 */
  readonly grade: Grade | null;
  readonly stats: RunStats;
  readonly zoneCounts: Readonly<Record<ZoneId, number>>;
  /** 768 − finalAudience。 */
  readonly emptySeats: number;
  /** 第二排空位数（结算叙事用）。 */
  readonly secondRowEmpty: number;
  readonly failure: FailureCard | null;
}

/** 完整运行状态（store 持有的唯一可变根对象；只有 game 层写入）。 */
export interface RunState {
  readonly config: RunConfig;
  phase: RunPhase;
  time: Seconds;
  musical: MusicalPosition;
  segment: SegmentId;
  light: LightState;
  player: PlayerState;
  zones: Readonly<Record<ZoneId, ZoneState>>;
  audience: AudienceFrame;
  noises: NoiseEntity[];
  returnListener: ReturnListenerState;
  boss: BossState;
  lines: Readonly<Record<InstrumentLineId, LineState>>;
  build: BuildState;
  offer: CardOffer | null;
  crowdWave: CrowdWaveState;
  /** 天花板裂缝数（0..3）。 */
  cracks: number;
  /** 安可是否已用。 */
  encoreUsed: boolean;
  /** 静默段剩余秒数（0 表示不在静默中）。 */
  silenceRemaining: Seconds;
  /** 人气低于峰值 8% 的连续小节数（中断倒计时）。 */
  lowAudienceBars: number;
  stats: RunStats;
  failure: FailureCard | null;
  ending: EndingKind | null;
  hudRevision: number;
}

/* ==========================================================================
 * 4. 输入与命令（DOM 事件在 ui 层，game 只接收纯数据）
 * ========================================================================== */

/** 一帧输入（由 loop 组装，game 直接消费）。 */
export interface InputFrame {
  /** 移动轴，长度 ≤1。 */
  readonly move: Vec2;
  /** 鼠标位置的画布归一化坐标（-1..1）。 */
  readonly pointerNdc: Vec2;
  /** 已反投影到舞台平面的光目标（XZ）。 */
  readonly pointerWorld: Vec2;
  /** 左键按住（束光）。 */
  readonly beamHeld: boolean;
  /** 左键本帧按下（点燃，边沿触发）。 */
  readonly ignitePressed: boolean;
  /** E 键按住（插线）。 */
  readonly interactHeld: boolean;
  /** Space 按住时长（终曲放下光）。 */
  readonly holdSeconds: Seconds;
  /** Esc 本帧按下。 */
  readonly pausePressed: boolean;
}

/** 玩家/系统命令（UI 与 main 只通过它与 game 交互）。 */
export type GameCommand =
  | { readonly type: 'start-run'; readonly config: RunConfig }
  | { readonly type: 'pause' }
  | { readonly type: 'resume' }
  | { readonly type: 'restart-run'; readonly seed: number }
  | { readonly type: 'quit-run' }
  | { readonly type: 'choose-card'; readonly cardId: CardId }
  | { readonly type: 'encore' }
  | { readonly type: 'continue-solo' }
  | { readonly type: 'skip-empty-house' }
  | { readonly type: 'tick'; readonly dt: Seconds; readonly input: InputFrame };

/* ==========================================================================
 * 5. 事件（game → audio / three / ui / telemetry 的单向广播）
 * ========================================================================== */

interface GameEventBase {
  readonly time: Seconds;
  /** 事件发生时的拍号（无拍点语义时为 -1）。 */
  readonly beatIndex: number;
}

export interface IgniteEvent extends GameEventBase {
  readonly kind: 'ignite';
  readonly quality: IgniteQuality;
  readonly position: Vec2;
  readonly zone: ZoneId | null;
  readonly inChord: boolean;
}

export interface ConvertEvent extends GameEventBase {
  readonly kind: 'convert';
  readonly seat: number;
  readonly zone: ZoneId;
  readonly amount: number;
  readonly source: 'light' | 'ignite' | 'crowd-wave' | 'sing-noise';
}

export interface CastOutEvent extends GameEventBase {
  readonly kind: 'cast-out';
  readonly seat: number;
  readonly zone: ZoneId;
  readonly amount: number;
  readonly cause: 'covered' | 'cooled' | 'overheat';
}

export interface CoverEvent extends GameEventBase {
  readonly kind: 'cover';
  readonly seat: number;
  readonly zone: ZoneId;
}

export interface CrowdWaveEvent extends GameEventBase {
  readonly kind: 'crowd-wave';
  readonly index: 0 | 1 | 2 | 3;
  readonly origin: ZoneId;
}

export interface ReturnListenerEvent extends GameEventBase {
  readonly kind: 'return-listener';
  readonly action: 'spawn' | 'lock' | 'unlock' | 'burn' | 'sing';
}

export interface LineEvent extends GameEventBase {
  readonly kind: 'line';
  readonly action: 'break' | 'plug-start' | 'plugged';
  readonly line: InstrumentLineId;
}

export interface MemberMomentEvent extends GameEventBase {
  readonly kind: 'member-moment';
  readonly member: MemberId;
  readonly moment: MemberMomentId;
}

export interface SegmentEvent extends GameEventBase {
  readonly kind: 'segment';
  readonly from: SegmentId;
  readonly to: SegmentId;
}

export interface BossEvent extends GameEventBase {
  readonly kind: 'boss';
  readonly phase: BossPhase;
  readonly action: 'enter' | 'advance' | 'retire' | 'strip-zone';
  readonly zone: ZoneId | null;
}

export interface SilenceEvent extends GameEventBase {
  readonly kind: 'silence';
  readonly active: boolean;
  readonly remaining: Seconds;
}

export interface CrackEvent extends GameEventBase {
  readonly kind: 'crack';
  readonly total: number;
}

export interface LevelUpEvent extends GameEventBase {
  readonly kind: 'levelup';
  readonly offer: CardOffer;
}

export interface EvolutionEvent extends GameEventBase {
  readonly kind: 'evolution';
  readonly evolution: EvolutionId;
}

export interface EncoreEvent extends GameEventBase {
  readonly kind: 'encore';
  readonly restoredAudience: number;
}

export interface FailureEvent extends GameEventBase {
  readonly kind: 'failure';
  readonly card: FailureCard;
}

export interface RunEndEvent extends GameEventBase {
  readonly kind: 'run-end';
  readonly result: RunResult;
}

export interface AudioCueEvent extends GameEventBase {
  readonly kind: 'audio-cue';
  readonly cue: SfxId;
  readonly variant: IgniteQuality | null;
}

export interface HudDirtyEvent extends GameEventBase {
  readonly kind: 'hud';
  readonly revision: number;
}

/** 所有事件的可辨识联合。 */
export type GameEvent =
  | IgniteEvent
  | ConvertEvent
  | CastOutEvent
  | CoverEvent
  | CrowdWaveEvent
  | ReturnListenerEvent
  | LineEvent
  | MemberMomentEvent
  | SegmentEvent
  | BossEvent
  | SilenceEvent
  | CrackEvent
  | LevelUpEvent
  | EvolutionEvent
  | EncoreEvent
  | FailureEvent
  | RunEndEvent
  | AudioCueEvent
  | HudDirtyEvent;

/** 事件处理器（audio / three / ui / telemetry 各订阅一份）。 */
export type GameEventHandler = (event: GameEvent) => void;

/* ==========================================================================
 * 6. HUD 快照（game 产出、UI 消费；≤10Hz，禁止每帧发布）
 * ========================================================================== */

/** 单区 HUD 读数（不含任何数字）。 */
export interface ZoneHud {
  readonly id: ZoneId;
  readonly heat: HeatLevel;
  /** 该区是否需要救援（谁在等你谁闪）。 */
  readonly waiting: boolean;
  readonly blackened: boolean;
}

/** HUD 快照（局内 0 个数字；只表达比例、形状、状态）。 */
export interface HudSnapshot {
  readonly revision: number;
  /** 血量表达：白光侵占比例 0..0.85。 */
  readonly whiteout: Ratio;
  /** 人气是否低于 30%（脉动提示）。 */
  readonly critical: boolean;
  readonly zones: readonly [ZoneHud, ZoneHud, ZoneHud, ZoneHud];
  /** 光当前罩住的人数占全部出席者的比例（不是总人气）。 */
  readonly lightCoverage: Ratio;
  /** 循光噪音量（危险条右端）0..1。 */
  readonly noisePressure: Ratio;
  /** 当前拍的相位 0..1 与强弱。 */
  readonly beatPhase: Ratio;
  readonly beatStrength: 'strong' | 'weak';
  /** 段落索引 0..4。 */
  readonly segmentIndex: 0 | 1 | 2 | 3 | 4;
  readonly silent: boolean;
  readonly returnLocked: boolean;
  readonly brokenLines: readonly InstrumentLineId[];
  readonly overheatedZone: ZoneId | null;
  /** 终曲长按进度 0..1；不在终曲为 0。 */
  readonly holdProgress: Ratio;
  /** 安可是否可用（未用）。 */
  readonly encoreAvailable: boolean;
  /** 供测试断言的时间（不展示）。 */
  readonly runSeconds: Seconds;
}

/* ==========================================================================
 * 7. 渲染快照（game → three 的唯一通道；three 只读）
 * ========================================================================== */

/** 光锥渲染参数。 */
export interface LightFrame {
  readonly position: Vec3;
  readonly mode: LightMode;
  readonly radius: Meters;
  readonly intensity: Ratio;
  /** 点燃脉冲 0..1（1 → 衰减到 0）。 */
  readonly pulse: Ratio;
  /** 被「静默」阶段 2 抽走视野时 <1。 */
  readonly visibility: Ratio;
}

/** 噪音渲染数据（池化，count 为有效实例数）。 */
export interface NoiseFrame {
  readonly count: number;
  readonly kind: Uint8Array;
  /** 交错存储 x, z。 */
  readonly position: Float32Array;
  /** 朝向弧度。 */
  readonly rotation: Float32Array;
  /** 0..1 缩放（dying 时收缩）。 */
  readonly scale: Float32Array;
  readonly dirty: readonly DirtyRange[];
}

/** 粒子/飘字渲染数据。 */
export interface ParticleFrame {
  readonly count: number;
  readonly position: Float32Array;
  readonly color: Uint8Array;
  readonly life: Float32Array;
  readonly size: Float32Array;
}

/** 摄像机跟随目标。 */
export interface CameraFrame {
  readonly target: Vec2;
  readonly zoom: number;
  /** 屏震由减少动态设置决定，逻辑层只给建议强度。 */
  readonly shake: Ratio;
}

/** 全场渲染快照（每帧一份，复用对象）。 */
export interface RenderSnapshot {
  readonly frame: FrameIndex;
  readonly camera: CameraFrame;
  readonly light: LightFrame;
  readonly audience: AudienceFrame;
  readonly noise: NoiseFrame;
  readonly particles: ParticleFrame;
  /** 观众席整体亮度（0..1，静默段压到 0.25）。 */
  readonly venueLight: Ratio;
  /** 舞台过曝（白闪）强度 0..1。 */
  readonly flash: Ratio;
  /** 是否处于「静默」段（渲染层关掉自发光观众的手机灯）。 */
  readonly silenced: boolean;
  /**
   * 白光（血量）比例 0..0.85，与 `HudSnapshot.whiteout` 同源（峰值基准，见 §14.3）。
   * 渲染层与 DOM 遮罩共用这一个值，禁止各自推导。
   */
  readonly whiteout: Ratio;
}

/** 渲染器信息（GL 能力，供 QA 面板与降级判断）。 */
export interface RendererInfo {
  readonly webglVersion: 2;
  readonly maxTextureSize: number;
  readonly gpu: string;
}

/** 单帧渲染统计（`renderer.info` + overdraw 解析估算，§9.3）。 */
export interface RenderStats {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly programs: number;
  readonly textures: number;
  readonly geometries: number;
  /** 半透明层叠的解析估算（§9.3），≤2.5。 */
  readonly overdrawEstimate: number;
  readonly dpr: number;
}

/**
 * 渲染入口契约（tech-spec §5.4）。
 *
 * 放在 `types/game.ts` 的原因：`game/loop` 需要引用它，而 game 层不得 import three（§3.2）。
 * 实现由 `three/renderer.ts` 提供，main 在装配时注入 loop。
 */
export interface FrameRenderer {
  readonly info: RendererInfo;
  resize(width: number, height: number, dpr: number): void;
  draw(snapshot: RenderSnapshot, settings: DisplaySettings): void;
  stats(): RenderStats;
  dispose(): void;
}

/* ==========================================================================
 * 8. 端口（依赖倒置：game 只声明接口，实现由 main 注入）
 * ========================================================================== */

/** 音乐时钟（唯一时间基准；实现来自 src/audio，降级实现来自 src/game）。 */
export interface MusicClock {
  readonly bpm: number;
  /** 音频时钟当前秒数（AudioContext.currentTime 派生）。 */
  now(): Seconds;
  /** 指定时刻的音乐位置。 */
  positionAt(time: Seconds): MusicalPosition;
  /** 指定时刻所在拍点。 */
  tickAt(time: Seconds): BeatTick;
  isRunning(): boolean;
}

/** 青唱混音参数（按区驱动 12 声部池）。 */
export interface ChoirZoneMix {
  readonly audience: number;
  readonly heat: HeatLevel;
  readonly gain: Ratio;
  readonly pan: number;
}

/** 音频端口（game 只发命令，不持有 AudioContext）。 */
export interface AudioPort {
  readonly clock: MusicClock;
  /** 首次用户手势后调用；失败时降级为静默，不阻塞游戏。 */
  start(): Promise<void>;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  setSegment(segment: SegmentId): void;
  setLayerGain(layer: LayerId, gain: Ratio): void;
  setChoir(mix: Readonly<Record<ZoneId, ChoirZoneMix>>): void;
  setSilenced(silenced: boolean): void;
  playCue(cue: SfxId, variant: IgniteQuality | null): void;
  dispose(): void;
}

/** 屏幕坐标 → 舞台平面坐标（实现来自 three/camera）。 */
export interface PointerProjector {
  /** 输入 NDC（-1..1），返回舞台 XZ 坐标；失败回退到舞台中心。 */
  toStage(ndc: Vec2): Vec2;
}

/** 确定性随机源（同一 seed 必须复现同一局）。 */
export interface Rng {
  next(): Ratio;
  range(min: number, max: number): number;
  int(maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): readonly T[];
  /** 派生子流（生成器/抽卡/观众分布互相不串扰）。 */
  fork(label: string): Rng;
  /** 当前状态快照（用于重放与单测）。 */
  snapshot(): number;
}

/** 事件总线（单向下发，同步分发；不做异步队列）。 */
export interface EventBus {
  emit(event: GameEvent): void;
  subscribe(handler: GameEventHandler): () => void;
}

/** 空间网格（碰撞粗筛；实现由 game/collision.ts 提供）。 */
export interface CollisionQuery {
  insert(id: number, circle: Circle): void;
  /** 返回命中 id 数，id 写入 out（容量不足时截断并计数）。 */
  query(circle: Circle, out: Int32Array): number;
  clear(): void;
}

/** 可复用的对象池（噪音 / 粒子 / 飘字）。 */
export interface Pool<T> {
  acquire(): T;
  release(item: T): void;
  /** 当前活跃对象（只读视图，顺序稳定）。 */
  readonly active: readonly T[];
  /** 硬上限。 */
  readonly capacity: number;
}

/* ==========================================================================
 * 9. 埋点（90 秒门与驻守 bot 的证据来源；仅内存，不联网）
 * ========================================================================== */

/** 0.5 秒一次的采样。 */
export interface TelemetrySample {
  readonly t: Seconds;
  /** 光心。 */
  readonly light: Vec2;
  /** 玩家位置。 */
  readonly player: Vec2;
  readonly audience: number;
  readonly litSeats: number;
  readonly noiseCount: number;
  readonly returnLocked: boolean;
  readonly zoneHeat: readonly [HeatLevel, HeatLevel, HeatLevel, HeatLevel];
  /** 该采样窗口内的点燃次数（perfect/good/off）。 */
  readonly ignites: readonly [number, number, number];
}

/** 一次 90 秒门的汇总指标（定义见 docs/tech-spec.md §12）。 */
export interface TelemetryRun {
  readonly seed: number;
  readonly mode: RunMode;
  readonly startedAt: string;
  readonly samples: readonly TelemetrySample[];
  /** 首次"主动移光"的时间；未发生为 null。 */
  readonly firstActiveLightMoveAt: Seconds | null;
  /** 每分钟主动移光次数。 */
  readonly lightMovesPerMinute: number;
  /** 驻光时长分位数。 */
  readonly dwellP50: Seconds;
  readonly dwellP90: Seconds;
  /** 各区转化率（点亮数 / 被照人数）。 */
  readonly zoneConversionRate: Readonly<Record<ZoneId, Ratio>>;
  /** 点燃跟拍命中率（perfect+good / 全部）。 */
  readonly igniteOnBeatRate: Ratio;
  /** 驻光收益比（驻光期人气净变化 / 巡游期人气净变化）。 */
  readonly dwellRewardRatio: number;
  readonly endedAt: Seconds;
  readonly ending: EndingKind | null;
}

/** 埋点记录器（dev/QA 构建启用；正式构建不挂载）。 */
export interface TelemetryRecorder {
  begin(seed: number, mode: RunMode): void;
  sample(sample: TelemetrySample): void;
  event(event: GameEvent): void;
  finish(ending: EndingKind | null): TelemetryRun;
}
