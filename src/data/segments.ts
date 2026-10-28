/**
 * 单局结构：5 个段落（时间 / 音乐层 / 生成率 / 灯光态 / 和弦循环）、拍点网格、唯一曲目、场馆布局、
 * 以及音频规格与 12 个 SFX。
 *
 * 依据：docs/gdd.md §3（9:30 时间轴）、§8.1（按段生成率表）、§9（B2 旧货仓、5 段、3 灯光态）、
 *       §17（128BPM / 4/4 / A 小调 / 304 小节 / 5 层 / 12 声部 / 12 SFX）、
 *       docs/tech-spec.md §7.1（SegmentDef / BeatGridDef / AudioSpec / SfxDef）。
 *
 * 没有"波次编号"：本作按段落推进生成率（tech-spec §7.1 映射表：GDD 的"波次"= 段落 + 生成率 + 上限）。
 *
 * 段落边界与小节的对齐（供 dev-audio 换层时量化）：
 * 1 小节 @128BPM = 4 × 60/128 = 1.875s。段落起点落在 0 / 48 / 117.33 / 186.67 / 245.33 小节；
 * 只有序曲→主歌（48 小节 = 90.000s）是整小节。音频换层请**量化到下一小节起点**（最多滞后 1.875s），
 * 本节 `startSec` / `endSec` 仍是权威时间，与 GDD §3.1 逐秒一致。
 */

import type {
  AudioSpec,
  BeatGridDef,
  SegmentDef,
  SfxDef,
} from '../types/data';
import type { LayerId, Meters, Seconds, SegmentId, SfxId } from '../types/game';

/* ==========================================================================
 * 1. 拍点网格与曲目（唯一时间基准）
 * ========================================================================== */

/**
 * 拍点网格：唯一时间基准（逻辑与音频共用；渲染不读帧时钟）。
 *
 * 9:30 @128BPM = 570s × 128/60 = 1216 拍 = 304 小节（与 GDD §17.1 一致）。
 * 其中 293 小节之后是结算尾奏（9:10–9:30），所以 304 = 演奏 293 小节 + 尾奏 11 小节。
 */
export const BEAT_GRID: BeatGridDef = {
  bpm: 128,
  beatsPerBar: 4,
  barsPerPhrase: 8,
  subdivisionsPerBeat: 4,
  totalBars: 304,
};

/** 一拍秒数（= 60 / bpm；卡面"每 2 拍回 6"这类换算的唯一依据）。 */
export const SECONDS_PER_BEAT: Seconds = 60 / BEAT_GRID.bpm;

/** 一小节秒数（= 4 拍 = 1.875s）。 */
export const SECONDS_PER_BAR: Seconds = SECONDS_PER_BEAT * BEAT_GRID.beatsPerBar;

/**
 * 唯一曲目（GDD §4 锁定 1 首；没有选曲 UI、音频表只有一份）。
 * `durationLabel` 给 UI（结算"今晚的歌单"与主菜单），`bpm` / `key` 与切片同源。
 */
export const SONG = {
  id: 'song-encore-lights',
  title: '再亮一会儿',
  bpm: BEAT_GRID.bpm,
  key: 'A minor',
  timeSignature: '4/4',
  durationSec: 570,
  durationLabel: '9:30',
  /** 演奏段结束（9:10 最后一音），之后到 9:30 是结算尾奏。 */
  performanceEndSec: 550,
  segmentIds: ['overture', 'verse', 'chorus', 'bridge', 'finale'] as readonly SegmentId[],
} as const;

/* ==========================================================================
 * 2. 五个段落
 * ========================================================================== */

/**
 * 序曲（0:00–1:30）：只有鼓、贝斯、房间底噪；无敌人；30 名观众、无危险。
 * 这一段唯一的任务是让玩家自己发现"光在鼠标上"（90 秒门）。
 */
const SEGMENT_OVERTURE: SegmentDef = {
  id: 'overture',
  index: 0,
  name: '序曲',
  startSec: 0,
  endSec: 90,
  layers: ['drums', 'bass', 'room'],
  spawnRates: { 'floor-noise': 0, scream: 0, distortion: 0 },
  lighting: 'warm',
  // i–VI–III–V7（GDD 骨架 Am–F–C–G，第 4 小节七和弦）
  chords: ['am', 'f', 'c', 'g7'],
};

/** 主歌（1:30–3:40）：第一次被噪音追；2:00 第一次人浪。 */
const SEGMENT_VERSE: SegmentDef = {
  id: 'verse',
  index: 1,
  name: '主歌',
  startSec: 90,
  endSec: 220,
  layers: ['drums', 'bass', 'chords', 'lead', 'room'],
  spawnRates: { 'floor-noise': 2, scream: 0.3, distortion: 0 },
  lighting: 'full',
  // VI–VII–i–i7：把"往前推"的和声放在最容易听清的位置，第 4 小节七和弦
  chords: ['f', 'g', 'am', 'am7'],
};

/** 副歌（3:40–5:50）：全编制；雪球、裂缝、第一次返听；5:00 第二次人浪。 */
const SEGMENT_CHORUS: SegmentDef = {
  id: 'chorus',
  index: 2,
  name: '副歌',
  startSec: 220,
  endSec: 350,
  layers: ['drums', 'bass', 'chords', 'lead', 'arp', 'room'],
  spawnRates: { 'floor-noise': 3, scream: 0.8, distortion: 0.3 },
  lighting: 'full',
  // 8 小节：Am–F–Dm–Am7 | Am–F–Cmaj7–G7（第 4 与第 8 小节都是七和弦，见 chords.ts 的权衡说明）
  chords: ['am', 'f', 'dm', 'am7', 'am', 'f', 'cmaj7', 'g7'],
};

/** 桥段 / 静默（5:50–7:40）：6:30 抽走总线 8 小节，之后只剩骨架；Boss 三阶段。 */
const SEGMENT_BRIDGE: SegmentDef = {
  id: 'bridge',
  index: 3,
  name: '桥段',
  startSec: 350,
  endSec: 460,
  layers: ['drums', 'bass', 'chords', 'room'],
  spawnRates: { 'floor-noise': 3.5, scream: 1, distortion: 0.6 },
  lighting: 'blackout',
  // i–iv–V–VI7：E（属和弦）落在这里；第 4 小节 Fmaj7 提供七度内音
  chords: ['am', 'dm', 'e', 'fmaj7'],
};

/** 终曲（7:40–9:10）：全编制 + 观众合唱；8:00 第三次人浪、8:50 放下光、9:10 最后一音。 */
const SEGMENT_FINALE: SegmentDef = {
  id: 'finale',
  index: 4,
  name: '终曲',
  startSec: 460,
  endSec: 550,
  layers: ['drums', 'bass', 'chords', 'lead', 'arp', 'choir', 'room'],
  spawnRates: { 'floor-noise': 4, scream: 1.2, distortion: 0.8 },
  lighting: 'full',
  // 回到骨架 Am–F–C–G7：终曲要把整场的和声收回来
  chords: ['am', 'f', 'c', 'g7'],
};

/**
 * 5 个段落（顺序 = 段落索引）。
 *
 * **这张表就是本作的"波次表"**：本作没有离散波次编号，刷怪按段落推进
 * （tech-spec §7.1 的映射表：GDD 的"波次"= 段落 + 生成率 + 同屏上限）。
 * 生成率单位：只/秒（`spawnRates`），已含段落差异，不含裂缝 +15% 与同屏上限截断（那两项在 balance.noise）。
 *
 * `layers` 含 `room`（房间底噪，不是乐队层）；GDD §17.1 的"序曲 2 层 / 主歌 4 层 / 副歌 5 层 /
 * 终曲 5 层 + 合唱"只数 5 条乐队层（drums / bass / chords / lead / arp）：
 * 序曲 drums+bass=2、主歌 +chords+lead=4、副歌 +arp=5、桥段抽走主旋律与琶音后剩 3、终曲 5 层 + choir。
 */
export const SEGMENTS: readonly SegmentDef[] = [
  SEGMENT_OVERTURE,
  SEGMENT_VERSE,
  SEGMENT_CHORUS,
  SEGMENT_BRIDGE,
  SEGMENT_FINALE,
];

/** 单局波次表（由 `SEGMENTS` 直接派生，避免两处手改；QA/平衡评审只看这张表）。 */
export const WAVE_TABLE: readonly {
  readonly segment: SegmentId;
  readonly name: string;
  readonly startSec: Seconds;
  readonly endSec: Seconds;
  readonly floorNoise: number;
  readonly scream: number;
  readonly distortion: number;
}[] = SEGMENTS.map((segment) => ({
  segment: segment.id,
  name: segment.name,
  startSec: segment.startSec,
  endSec: segment.endSec,
  floorNoise: segment.spawnRates['floor-noise'],
  scream: segment.spawnRates.scream,
  distortion: segment.spawnRates.distortion,
}));

/** 段落 id 的确定性顺序（HUD 段位点 5 格、事件 from/to 校验都用它）。 */
export const SEGMENT_ORDER: readonly SegmentId[] = [
  'overture',
  'verse',
  'chorus',
  'bridge',
  'finale',
];

/** id → 段落（穷尽 Record，缺段 tsc 直接报错）。 */
export const SEGMENT_BY_ID: Readonly<Record<SegmentId, SegmentDef>> = {
  overture: SEGMENT_OVERTURE,
  verse: SEGMENT_VERSE,
  chorus: SEGMENT_CHORUS,
  bridge: SEGMENT_BRIDGE,
  finale: SEGMENT_FINALE,
};

/* ==========================================================================
 * 2.1 三个高潮事件（GDD §3.5）
 * ========================================================================== */

/** 一个高潮事件：什么时候发生、玩家付什么、事后能复述什么。 */
export interface ClimaxEventDef {
  readonly id: string;
  readonly name: string;
  /** 发生时间（秒）。 */
  readonly atSec: Seconds;
  /** 所属段落（HUD 段位点与事件日志用）。 */
  readonly segment: SegmentId;
  /** 发生什么。 */
  readonly what: string;
  /** 玩家付什么代价。 */
  readonly cost: string;
  /** 玩家事后会复述的那句话（验收："玩家能说出"）。 */
  readonly chant: string;
}

/**
 * 三个高潮（GDD §3.5）。
 *
 * 它们不是三套系统，而是三条既有规则的"最响的一刻"：
 * 人浪（balance.crowdWave）/ 静默（Boss 阶段 1）/ 放下光（FINALE_HOLD_SEC 长按）。
 * 数据放在这里，是为了让 UI、埋点与 QA 时间轴读同一组时间点，而不是各自写死 120/390/530。
 */
export const CLIMAX_EVENTS: readonly ClimaxEventDef[] = [
  {
    id: 'first-crowd-wave',
    name: '第一次人浪',
    atSec: 120,
    segment: 'verse',
    what: '一片观众站起来，越过台沿撞进噪音，把整片噪音唱成人；天花板裂第一道缝。',
    cost: '人气暴露、裂缝 +1。',
    chant: '原来这一屋子人是我养出来的。',
  },
  {
    id: 'silence',
    name: '静默',
    atSec: 390,
    segment: 'bridge',
    what: 'Boss 抽走总总线 8 小节：全黑、只剩视觉节拍与波形；撑过三阶段。',
    cost: '声音、视野、人口。',
    chant: '系统把我的声音拿走了，我用眼睛弹完。',
  },
  {
    id: 'drop-light',
    name: '放下光',
    atSec: 530,
    segment: 'finale',
    what: '长按 Space 把光交出去：人够＝观众的光照回台上；不够＝空场，一个人弹完。',
    cost: '控制权、人气。',
    chant: '最后是我把麦克风交出去的。',
  },
];

/* ==========================================================================
 * 2.2 前 90 秒的开场时间轴（GDD §14.1，A13 / R1 的验收依据）
 * ========================================================================== */

/** 开场时间轴上的一个节点。 */
export interface OpeningHookDef {
  readonly id: string;
  /** 时间（秒）。 */
  readonly atSec: Seconds;
  /** 这一刻必须发生什么（可验收）。 */
  readonly event: string;
}

/**
 * 前 90 秒的开场钩子（GDD §14.1）。
 *
 * 这张表存在的唯一理由：90 秒门（≥7/10 新玩家主动把光移向观众席）是本作最致命的风险，
 * 而它依赖的是**具体秒数上的具体事件**——这些秒数不能散落在 loop/light 的代码里。
 */
export const OPENING_HOOKS: readonly OpeningHookDef[] = [
  { id: 'blackout-breath', atSec: 0, event: '黑屏，只有一盏工作灯与台上一个剪影；WASD 呼吸式提示 0.8s 后消失，不拦操作。' },
  { id: 'control-unlock', atSec: 4, event: '控制解锁；没有敌人。' },
  { id: 'lamp-bar', atSec: 6, event: '场馆灯条亮起；鼠标移动，光跟着走。' },
  { id: 'first-sweep', atSec: 10, event: '第一次扫过观众席（玩家自发）；若此前没动鼠标，光沿默认弧线 0.45m/s 扫过前两排，一动鼠标就让位。' },
  { id: 'first-seat', atSec: 12, event: '第一个人被点亮（0.4s 拉停 + 1.5s 入座）：颜色爬升、手机灯亮、声音变宽。' },
  { id: 'lamp-sea-start', atSec: 18, event: '开场灯海开始：场馆顶光自动扫过后排，40 盏手机灯同时亮；此时没有噪音。' },
  { id: 'lamp-sea-end', atSec: 48, event: '灯海结束；玩家的光仍在前排。' },
  { id: 'first-zone-blink', atSec: 60, event: '四色点第一次闪，教会"谁在等你"。' },
  { id: 'last-row-invite', atSec: 72, event: '最后一排最右，一根荧光棒亮起——唯一邀请，玩家必须自己把光移过去（90 秒门的核心）。' },
  { id: 'first-noise', atSec: 90, event: '第一只底噪从光锥边缘渗出：第一次危险，同时进入主歌段。' },
];

/**
 * 开场宽限（秒）：这段时间里不累计反驻守锚点、不触发过热，也不因“没动鼠标”被锁。
 * H1 修复：旧逻辑用按钮位置覆盖光位，开局 4s 必锁、8s 过热；宽限 + 首次 pointermove
 * 激活共同保证序曲不是惩罚段（t110）。
 */
export const OPENING_GRACE_SEC = 5;

/* ==========================================================================
 * 3. 场馆：B2 旧货仓（1 场馆 × 5 段 × 3 灯光态）
 * ========================================================================== */

/**
 * 场馆与舞台布局（GDD §9.1 / art-direction §6 的 L0–L8 分层）。
 *
 * 说明：`DataRegistry` 没有 StageDef 字段，本常量是**附加导出**（不改类型契约），
 * 供 dev-three（渲染）与 art-director 的 models.ts 取用，避免同一组尺寸在渲染层再硬编码一份。
 * 成员站位不在此重复——见 characters.ts 的 `SilhouetteDef.stagePosition`。
 */
export interface StageLayoutDef {
  readonly venue: string;
  /** 场馆的一句话说明（UI 与验收用）。 */
  readonly description: string;
  readonly stage: {
    readonly width: Meters;
    readonly depth: Meters;
    readonly height: Meters;
    readonly lipDepth: Meters;
  };
  readonly drumRiser: { readonly height: Meters; readonly z: Meters };
  readonly speakerStacks: readonly { readonly x: Meters; readonly z: Meters; readonly height: Meters }[];
  readonly truss: { readonly height: Meters; readonly lampCount: number; readonly realSpotlights: number };
  readonly guardRail: { readonly z: Meters; readonly posts: number };
  readonly exits: readonly { readonly x: Meters; readonly z: Meters }[];
  readonly camera: { readonly pitchDeg: number; readonly fovDeg: number; readonly leadMeters: Meters };
}

/** 场馆布局（数值全部来自 GDD §9.1 与 art-direction §6/§10）。 */
export const STAGE_LAYOUT: StageLayoutDef = {
  venue: 'B2 旧货仓',
  description:
    '一晚、一间房：12m×8m 的台、两只音箱堆、16 个假灯头与 2 盏真追光；台下 24 排 32 座，四条走道把四区分开，出口在最后方两侧。',
  stage: { width: 12, depth: 8, height: 0.8, lipDepth: 1.2 },
  drumRiser: { height: 0.6, z: -2.4 },
  speakerStacks: [
    { x: -5.2, z: -1.4, height: 2.4 },
    { x: 5.2, z: -1.4, height: 2.4 },
  ],
  truss: { height: 5.6, lampCount: 16, realSpotlights: 2 },
  guardRail: { z: 4.4, posts: 6 },
  exits: [
    { x: -9.6, z: 26.4 },
    { x: 9.6, z: 26.4 },
  ],
  camera: { pitchDeg: 22, fovDeg: 45, leadMeters: 6 },
};

/* ==========================================================================
 * 4. 音频规格与 12 个 SFX（全部 WebAudio 合成，零素材）
 * ========================================================================== */

/**
 * 音频规格（与 60 秒切片同源；GDD §17.1）。
 *
 * 12 声部 = 4 区 × 3 层（近/中/远），落进技术评审给的 8–12 声部区间；
 * 人数每 +8 人加一层、总增益 −3dB 补偿——必须是"变厚"而不是"变响"。
 */
export const AUDIO: AudioSpec = {
  bpm: BEAT_GRID.bpm,
  key: 'A minor',
  bandLayers: ['drums', 'bass', 'chords', 'lead', 'arp'] as readonly LayerId[],
  choirVoices: 12,
  choirZones: 4,
  choirLayersPerZone: 3,
  irPresets: [1.2, 2.4],
  compressor: {
    thresholdDb: -18,
    ratio: 3.5,
    attack: 0.004,
    release: 0.22,
  },
  highShelf: { frequency: 6000, gainDb: 2.5 },
  ducking: { amount: 0.52, attack: 0.014, release: 0.1 },
};

/**
 * 12 个 SFX（GDD §17.2 一一对应）。
 *
 * `recipe` 是合成配方的一句话描述（实现细节在 src/audio/sfx.ts；本表只锁"它是什么声音"）。
 * `minInterval` 防同帧叠加爆音；`maxConcurrent` 防 768 人同时转化时音轨被塞满。
 */
export const SFX: Readonly<Record<SfxId, SfxDef>> = {
  'convert-chime': {
    id: 'convert-chime',
    name: '转化铃',
    recipe: '4 个按区声部音高排好的正弦铃（A/C/E/G），0.8s 指数衰减 + 一档短延迟；人数越多触发越密，同帧只发一档',
    minInterval: 0.08,
    maxConcurrent: 6,
  },
  'ignite-hit': {
    id: 'ignite-hit',
    name: '点燃',
    recipe: '三档制：完美＝白噪声爆点 + 1.6kHz 短促正弦；良好＝同源但音量 −6dB；错拍＝低通后的闷响（无高频）',
    minInterval: 0.06,
    maxConcurrent: 4,
  },
  'burn-hiss': {
    id: 'burn-hiss',
    name: '烧穿嘶声',
    recipe: '白噪声过 600–2400Hz 带通，0.5s 指数衰减；连锁时叠一条延迟 60ms 的同源',
    minInterval: 0.1,
    maxConcurrent: 3,
  },
  'choir-pulse': {
    id: 'choir-pulse',
    name: '合唱波',
    recipe: '与当前和弦同音的三层锯齿（detune ±15 cents）+ 0.25s 包络；四区同发时加一层八度',
    minInterval: 0.4,
    maxConcurrent: 4,
  },
  'return-lock': {
    id: 'return-lock',
    name: '返听锁定',
    recipe: '48Hz 低频自激缓慢上滑（0.9s）+ 一条被压缩的反馈啸叫；全场唯一带"声音"的敌人',
    minInterval: 1,
    maxConcurrent: 1,
  },
  'line-snap': {
    id: 'line-snap',
    name: '断线 / 插线',
    recipe: '断线＝短促方波下坠 + 一点谐波失真；插上＝中频"咔"（20ms 噪声门）+ 低频回归的半音上行',
    minInterval: 0.3,
    maxConcurrent: 2,
  },
  'crowd-wave': {
    id: 'crowd-wave',
    name: '人浪',
    recipe: '5s 渐强的掌声噪声（多段带通叠加）+ 人群呼喊的低频包络；从左到右扫声像',
    minInterval: 3,
    maxConcurrent: 1,
  },
  'silence-toggle': {
    id: 'silence-toggle',
    name: '静默切换',
    recipe: '数字零（主总线 gain→0）瞬间的"抽走"感 + 两下心跳（60Hz 正弦，间隔 0.9s）',
    minInterval: 1,
    maxConcurrent: 1,
  },
  encore: {
    id: 'encore',
    name: '安可',
    recipe: '观众呼喊（带通噪声 + 共振峰）+ 和声从三度回升到五度的两小节渐强',
    minInterval: 2,
    maxConcurrent: 1,
  },
  'drop-light': {
    id: 'drop-light',
    name: '放下光',
    recipe: '麦克风回授（纯音上滑到 1.2kHz）+ 大厅混响尾 2.4s，随后全静 0.3s',
    minInterval: 2,
    maxConcurrent: 1,
  },
  fail: {
    id: 'fail',
    name: '失败',
    recipe: '低频从 110Hz 下坠到 40Hz（1.2s）+ 椅子挪动噪声；不加音乐，不加旋律',
    minInterval: 3,
    maxConcurrent: 1,
  },
  ui: {
    id: 'ui',
    name: '界面',
    recipe: '短促木鱼 / 拨弦：一次 4ms 噪声爆点 + 一档 800Hz 正弦，0.08s 衰减',
    minInterval: 0.08,
    maxConcurrent: 2,
  },
};

/** 12 个 SFX id 的确定性顺序（预热与调试面板按此顺序）。 */
export const SFX_ORDER: readonly SfxId[] = [
  'convert-chime',
  'ignite-hit',
  'burn-hiss',
  'choir-pulse',
  'return-lock',
  'line-snap',
  'crowd-wave',
  'silence-toggle',
  'encore',
  'drop-light',
  'fail',
  'ui',
];

/* ==========================================================================
 * 2.3 段落的展示文案（out-of-schema content）
 * ========================================================================== */

/** 段落的展示名与一句话说明（`SegmentDef` 有 name 与音乐字段，说明单独成表）。 */
export interface SegmentContent {
  readonly id: SegmentId;
  readonly name: string;
  readonly description: string;
}

/** 5 个段落的展示名与一句话说明（暂停面板、结算回顾、排练室用）。 */
export const SEGMENT_CONTENT: Readonly<Record<SegmentId, SegmentContent>> = {
  overture: {
    id: 'overture',
    name: '序曲 · 0:00–1:30',
    description: '只有鼓、贝斯与房间底噪，没有敌人：这一段的唯一任务是让你自己发现"光在鼠标上"。',
  },
  verse: {
    id: 'verse',
    name: '主歌 · 1:30–3:40',
    description: '第一次被噪音追，第一次人浪（2:00）：你会明白"他们是因为我才被追的"。',
  },
  chorus: {
    id: 'chorus',
    name: '副歌 · 3:40–5:50',
    description: '全编制：雪球、第二道裂缝、第一次返听；5:00 第二次人浪。',
  },
  bridge: {
    id: 'bridge',
    name: '桥段 · 5:50–7:40',
    description: '6:30 抽走总线 8 小节，之后只剩骨架；Boss 三阶段全在这里。',
  },
  finale: {
    id: 'finale',
    name: '终曲 · 7:40–9:10',
    description: '全编制 + 观众合唱：8:00 第三次人浪、8:50 放下光、9:10 最后一个和弦。',
  },
};
