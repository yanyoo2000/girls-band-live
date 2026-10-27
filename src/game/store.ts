/**
 * 局内唯一可变状态的持有者（外部 store，UI 用 `useSyncExternalStore` 订阅）。
 *
 * 用途：把 game 子系统装配成一局；所有写入经过 `dispatch` 或固定步长 `tick`，
 * UI / three / audio 只能读快照 + 发命令（tech-spec §3.4 / §6.1）。
 *
 * 依赖：`../types/game`、`../types/data`、`../types/save`；本层子系统
 * `./entities` `./light` `./audience` `./crowd-wave` `./lines` `./rng`；
 * 同层由其他人拥有的系统：`./combat` `./enemies` `./boss` `./progression` `./save`。
 * 分配策略：HUD 每拍重建（≤2Hz；UI 需要新引用才会重渲染）；RenderSnapshot 与
 * 噪声/粒子 TypedArray 一次性分配后复用；逐 tick 不新建数组。
 * 清理策略：`dispose()` 退订全部监听、归还实体池、解除观众运行时绑定；
 * 重开一局走 `startRun` 的清理分支（不重建 store 单例）。
 *
 * 导出：`StoreDeps`、`GameStore` 类型与 `createGameStore(deps)`。
 */
import type {
  AudienceFrame,
  AudioPort,
  BossState,
  CardId,
  ChoirZoneMix,
  CrowdWaveState,
  EndingKind,
  EventBus,
  FailureCard,
  FailureReason,
  FrameIndex,
  GameCommand,
  GameEvent,
  GameEventHandler,
  Grade,
  HeatLevel,
  HudSnapshot,
  InputFrame,
  IgniteQuality,
  InstrumentLineId,
  LineState,
  LightMode,
  MusicClock,
  NoiseKind,
  RenderSnapshot,
  ReturnListenerState,
  Rng,
  RunConfig,
  RunResult,
  RunState,
  RunStats,
  Seconds,
  SfxId,
  TelemetryRecorder,
  TelemetrySample,
  Vec2,
  ZoneHud,
  ZoneId,
  ZoneState,
} from '../types/game';
import type { DataRegistry } from '../types/data';
import type { SavePort } from '../types/save';
import { createRng } from './rng';
import { createEntityWorld, updateEntities } from './entities';
import { evaluateIgnite, queryLitSeats, updateLight } from './light';
import {
  computeWhiteout,
  countPresent,
  createAudience,
  disposeAudience,
  updateAudience,
} from './audience';
import { seatPositionAt } from '../data/seats';
import { updateCrowdWave } from './crowd-wave';
import { updateLines } from './lines';
import {
  lightEatRatio,
  stageBlackoutRemaining,
  updateNoise,
  updateReturnListener,
  updateSpawner,
} from './enemies';
import { resolveChoirWave, resolveIgniteDamage } from './combat';
import { updateBoss } from './boss';
import { addExperience, applyCard, createBuild } from './progression';
import { updateRecords } from './save';

export interface StoreDeps {
  readonly data: DataRegistry;
  readonly rng: Rng;
  readonly events: EventBus;
  readonly audio: AudioPort;
  readonly save: SavePort;
  readonly telemetry: TelemetryRecorder | null;
  /** 逻辑时钟后备实现（音频未就绪时用单调时钟）。 */
  readonly fallbackClock: MusicClock;
}

/** 局内唯一可变状态的持有者；所有写入经过 dispatch。 */
export interface GameStore {
  getRun(): RunState | null;
  getHud(): HudSnapshot;
  getRender(): RenderSnapshot;
  getResult(): RunResult | null;
  dispatch(command: GameCommand): void;
  subscribeHud(listener: () => void): () => void;
  subscribeEvents(handler: GameEventHandler): () => void;
  /** 固定步长 tick，由 loop 调用；禁止 UI 直接调用。 */
  tick(dt: Seconds, input: InputFrame): void;
  dispose(): void;
}

/* ==========================================================================
 * 常量（数据表未覆盖的几何/手感参数；见任务报告「歧义」）
 * ========================================================================== */

/** 舞台可走范围（GDD §9.1：舞台 12m × 8m）。 */
const STAGE_HALF_X = 6;
const STAGE_HALF_Z = 4;
/** 主唱移速（米/秒）：数据表 `balance` 没有该字段，取走位手感值。 */
const PLAYER_SPEED = 3.4;
/** 噪声渲染帧上限（180 + 余量）。 */
const NOISE_FRAME_CAP = 192;
/** 粒子渲染上限（300）。 */
const PARTICLE_CAP = 300;
/** 失败卡回放的光路采样数（5 秒 × 60Hz）。 */
const LIGHT_PATH_SAMPLES = 300;
/** 埋点采样间隔（秒）。 */
const TELEMETRY_INTERVAL = 0.5;
/** 终曲放下光的长按时长（秒）。 */
const FINALE_HOLD_SECONDS = 1.5;

/* ==========================================================================
 * 可变快照类型（以只读接口暴露，不引入 `as`）
 * ========================================================================== */

interface MutableVec2 {
  x: number;
  z: number;
}

interface MutableVec3 {
  x: number;
  y: number;
  z: number;
}

interface MutableCamera {
  target: MutableVec2;
  zoom: number;
  shake: number;
}

interface MutableLightFrame {
  position: MutableVec3;
  mode: LightMode;
  radius: number;
  intensity: number;
  pulse: number;
  visibility: number;
}

interface MutableRender {
  frame: FrameIndex;
  camera: MutableCamera;
  light: MutableLightFrame;
  audience: AudienceFrame;
  noise: MutableNoiseFrame;
  particles: MutableParticleFrame;
  venueLight: number;
  flash: number;
  silenced: boolean;
}

interface MutableDirtyRange {
  start: number;
  count: number;
}

interface MutableNoiseFrame {
  count: number;
  kind: Uint8Array;
  position: Float32Array;
  rotation: Float32Array;
  scale: Float32Array;
  dirty: MutableDirtyRange[];
}

interface MutableParticleFrame {
  count: number;
  position: Float32Array;
  color: Uint8Array;
  life: Float32Array;
  size: Float32Array;
}

interface MutableStats {
  peakAudience: number;
  finalAudience: number;
  converted: number;
  burned: number;
  covered: number;
  leftVenue: number;
  ignitesPerfect: number;
  ignitesGood: number;
  ignitesOff: number;
  crowdWaves: number;
  cracks: number;
  returnLocks: number;
  encoreUsed: boolean;
  duration: Seconds;
}

/* ==========================================================================
 * 纯工具
 * ========================================================================== */

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

/** number → `HeatLevel`（0..4 收敛，避免在赋值处写 `as`）。 */
function toHeatLevel(value: number): HeatLevel {
  if (value <= 0) {
    return 0;
  }
  if (value === 1) {
    return 1;
  }
  if (value === 2) {
    return 2;
  }
  if (value === 3) {
    return 3;
  }
  return 4;
}

function createZeroStats(): MutableStats {
  return {
    peakAudience: 0,
    finalAudience: 0,
    converted: 0,
    burned: 0,
    covered: 0,
    leftVenue: 0,
    ignitesPerfect: 0,
    ignitesGood: 0,
    ignitesOff: 0,
    crowdWaves: 0,
    cracks: 0,
    returnLocks: 0,
    encoreUsed: false,
    duration: 0,
  };
}

function emptyAudience(): AudienceFrame {
  return {
    revision: 0,
    size: 0,
    state: new Uint8Array(0),
    heat: new Uint8Array(0),
    phone: new Uint8Array(0),
    zone: new Uint8Array(0),
    tint: new Float32Array(0),
    dirty: [],
  };
}

function emptyHud(): HudSnapshot {
  const zone = (id: ZoneId): ZoneHud => ({ id, heat: 0, waiting: false, blackened: false });
  return {
    revision: 0,
    whiteout: 0.85,
    critical: false,
    zones: [zone('front-left'), zone('front-right'), zone('back-left'), zone('back-right')],
    lightCoverage: 0,
    noisePressure: 0,
    beatPhase: 0,
    beatStrength: 'weak',
    segmentIndex: 0,
    silent: false,
    returnLocked: false,
    brokenLines: [],
    overheatedZone: null,
    holdProgress: 0,
    encoreAvailable: true,
    runSeconds: 0,
  };
}

function createZones(data: DataRegistry): Readonly<Record<ZoneId, ZoneState>> {
  const result: Record<ZoneId, ZoneState> = {
    'front-left': {
      id: 'front-left',
      heat: 0,
      litSeconds: 0,
      overheat: false,
      litSeats: 0,
      blackSeats: 0,
      choirDrivers: 0,
    },
    'front-right': {
      id: 'front-right',
      heat: 0,
      litSeconds: 0,
      overheat: false,
      litSeats: 0,
      blackSeats: 0,
      choirDrivers: 0,
    },
    'back-left': {
      id: 'back-left',
      heat: 0,
      litSeconds: 0,
      overheat: false,
      litSeats: 0,
      blackSeats: 0,
      choirDrivers: 0,
    },
    'back-right': {
      id: 'back-right',
      heat: 0,
      litSeconds: 0,
      overheat: false,
      litSeats: 0,
      blackSeats: 0,
      choirDrivers: 0,
    },
  };
  // 用数据层的 id 顺序校准（数据表缺失时保留上面的四区默认）。
  for (let i = 0; i < data.zones.length; i += 1) {
    const def = data.zones[i];
    if (def !== undefined) {
      result[def.id] = {
        id: def.id,
        heat: 0,
        litSeconds: 0,
        overheat: false,
        litSeats: 0,
        blackSeats: 0,
        choirDrivers: 0,
      };
    }
  }
  return result;
}

function createLines(): Readonly<Record<InstrumentLineId, LineState>> {
  return {
    guitar: { id: 'guitar', member: 'xuliao', broken: false, plugProgress: 0, shieldActive: false },
    bass: { id: 'bass', member: 'wensheng', broken: false, plugProgress: 0, shieldActive: true },
    drums: { id: 'drums', member: 'shaoyan', broken: false, plugProgress: 0, shieldActive: false },
  };
}

function createBoss(): BossState {
  return { phase: 'bus', phaseStartedAt: 0, retired: false, strippedZone: null };
}

function createReturnListener(data: DataRegistry): ReturnListenerState {
  const def = data.noise['return-listener'];
  return {
    active: false,
    anchor: null,
    locked: false,
    lockSeconds: 0,
    hp: def.maxHp,
    maxHp: def.maxHp,
    spawnCooldown: 0,
    count: 0,
  };
}

/** 主唱的初始站位（`characters` 中唯一 `playable` 的剪影站位）。 */
function playerStart(data: DataRegistry): Vec2 {
  for (let i = 0; i < data.characters.length; i += 1) {
    const character = data.characters[i];
    if (character !== undefined && character.playable) {
      return {
        x: character.silhouette.stagePosition.x,
        z: character.silhouette.stagePosition.z,
      };
    }
  }
  return { x: 0, z: -1 };
}

/** 初始光位置：观众席最前排中间（避免开局误入“回照”）。 */
function initialLightPosition(data: DataRegistry): Vec2 {
  const middleCol = Math.floor(data.seats.cols / 2);
  const seat = seatPositionAt(data.seats, 0, middleCol);
  return { x: seat.x, z: seat.z };
}

/** 座区列表（固定顺序，避免依赖数据表数组顺序）。 */
const ZONE_ORDER: readonly ZoneId[] = ['front-left', 'front-right', 'back-left', 'back-right'];

/** 结算评级（GDD §13.5；中断不评级）。 */
function gradeFor(ending: EndingKind, stats: RunStats, encoreUsed: boolean): Grade | null {
  if (ending === 'interrupted') {
    return null;
  }
  if (ending === 'empty-house') {
    return 'C';
  }
  const conversionRatio = stats.converted / Math.max(1, stats.converted + stats.burned);
  if (stats.finalAudience >= 600 && !encoreUsed && conversionRatio >= 0.7) {
    return 'S';
  }
  if (stats.finalAudience >= 450 && !encoreUsed) {
    return 'A';
  }
  if (stats.finalAudience >= 300) {
    return 'B';
  }
  return 'C';
}

/* ==========================================================================
 * store
 * ========================================================================== */

/**
 * 创建 store（内部创建全部 game 子系统）。
 *
 * 一局的生命周期：`start-run` → 固定步长 tick → `results`（完成/空场/中断）。
 * 同 seed 复现：每次 `start-run` 用 `config.seed` 新建根 RNG，再按
 * `'seats' | 'cards' | 'spawn'` 分叉（tech-spec §7.5）。
 */
export function createGameStore(deps: StoreDeps): GameStore {
  const data = deps.data;
  const capacity = data.seats.capacity;

  // —— 可变状态 ——
  let run: RunState | null = null;
  let result: RunResult | null = null;
  let world = createEntityWorld(data, data.balance.noise.cap);
  let stats = createZeroStats();
  let prevState = new Uint8Array(0);
  let activeClock: MusicClock = deps.fallbackClock;
  let cardsRng: Rng = createRng(1);
  let spawnRng: Rng = createRng(2);
  let disposed = false;
  let waitEncore = false;
  let wasLocked = false;
  let stageBlackout = 0;
  let lowBarMark = -1;
  let hudBar = -1;
  let hudBeat = -1;
  let silencePrev = false;
  let choirBeat = -1;
  let telemetryTimer = 0;
  let windowIgnites: [number, number, number] = [0, 0, 0];
  let simFrame = 0;
  const hudListeners: (() => void)[] = [];
  const unsubscribeEvents: (() => void)[] = [];

  // 最近点燃时间（失败卡“最后 5 秒点燃次数”）。
  const igniteTimes = new Float32Array(64).fill(-1);
  let igniteTimeCursor = 0;

  // 失败卡回放用的光路环形缓冲。
  const lightPath = new Float32Array(LIGHT_PATH_SAMPLES * 2);
  let lightPathCount = 0;
  let lightPathCursor = 0;

  // 光覆盖查询缓冲（一次分配）。
  const litSeats = new Int32Array(capacity);

  // —— 渲染快照（一次性分配，逐帧覆写） ——
  const camera: MutableCamera = { target: { x: 0, z: 0 }, zoom: 1, shake: 0 };
  const lightFrame: MutableLightFrame = {
    position: { x: 0, y: 0.25, z: 0 },
    mode: 'spread',
    radius: 4.2,
    intensity: 0,
    pulse: 0,
    visibility: 1,
  };
  const noiseDirty: MutableDirtyRange[] = [
    { start: 0, count: 0 },
    { start: 0, count: 0 },
    { start: 0, count: 0 },
    { start: 0, count: 0 },
    { start: 0, count: 0 },
    { start: 0, count: 0 },
    { start: 0, count: 0 },
    { start: 0, count: 0 },
  ];
  const noiseFrame: MutableNoiseFrame = {
    count: 0,
    kind: new Uint8Array(NOISE_FRAME_CAP),
    position: new Float32Array(NOISE_FRAME_CAP * 2),
    rotation: new Float32Array(NOISE_FRAME_CAP),
    scale: new Float32Array(NOISE_FRAME_CAP),
    dirty: noiseDirty,
  };
  const particleFrame: MutableParticleFrame = {
    count: 0,
    position: new Float32Array(PARTICLE_CAP * 3),
    color: new Uint8Array(PARTICLE_CAP * 3),
    life: new Float32Array(PARTICLE_CAP),
    size: new Float32Array(PARTICLE_CAP),
  };
  const render: MutableRender = {
    frame: 0,
    camera,
    light: lightFrame,
    audience: emptyAudience(),
    noise: noiseFrame,
    particles: particleFrame,
    venueLight: 1,
    flash: 0,
    silenced: false,
  };

  let hud: HudSnapshot = emptyHud();

  /* ---------------------------------------------------------------- 发射器 */

  const emit = (event: GameEvent): void => {
    deps.events.emit(event);
  };

  const beatIndexAt = (): number => {
    if (run === null) {
      return -1;
    }
    return run.musical.bar * data.beatGrid.beatsPerBar + run.musical.beat;
  };

  const cue = (id: SfxId, variant: IgniteQuality | null): void => {
    emit({
      kind: 'audio-cue',
      time: run?.time ?? 0,
      beatIndex: beatIndexAt(),
      cue: id,
      variant,
    });
  };

  /* -------------------------------------------------------- 观众写入助手 */

  /** 战斗/返场产生的“净增观众”落到离场或空座（优先填离场的人）。 */
  const addColoredAudience = (count: number): number => {
    if (run === null || count <= 0) {
      return 0;
    }
    const frame = run.audience;
    let remaining = count;
    let added = 0;
    for (let pass = 0; pass < 2 && remaining > 0; pass += 1) {
      const wanted = pass === 0 ? 4 : 0;
      for (let seat = 0; seat < frame.size && remaining > 0; seat += 1) {
        if ((frame.state[seat] ?? 0) !== wanted) {
          continue;
        }
        frame.state[seat] = 2;
        frame.heat[seat] = 1;
        frame.phone[seat] = 1;
        frame.tint[seat] = 1;
        remaining -= 1;
        added += 1;
      }
    }
    return added;
  };

  /** 安可：把人气恢复到目标值（优先复活离场观众，其次填空座）。 */
  const restoreAudience = (target: number): number => {
    if (run === null) {
      return 0;
    }
    const present = countPresent(run.audience, null);
    if (present >= target) {
      return 0;
    }
    return addColoredAudience(target - present);
  };

  /** 空场：所有出席者离场（不删除数据，保留“空座”视觉）。 */
  const clearAudience = (): void => {
    if (run === null) {
      return;
    }
    const frame = run.audience;
    for (let seat = 0; seat < frame.size; seat += 1) {
      const state = frame.state[seat] ?? 0;
      if (state === 1 || state === 2 || state === 3) {
        frame.state[seat] = 4;
        frame.phone[seat] = 0;
        frame.tint[seat] = 0;
        frame.heat[seat] = 0;
      }
    }
  };

  /* -------------------------------------------------------------- 快照构建 */

  const buildHud = (): HudSnapshot => {
    if (run === null) {
      return emptyHud();
    }
    const present = countPresent(run.audience, null);
    const whiteout = computeWhiteout(present, capacity);
    const lit = queryLitSeats(run, data, litSeats);
    const coverage = present > 0 ? Math.min(1, lit / present) : 0;
    let noiseActive = 0;
    for (let i = 0; i < run.noises.length; i += 1) {
      const entity = run.noises[i];
      if (entity !== undefined && entity.active && entity.state !== 'dying') {
        noiseActive += 1;
      }
    }
    const zoneHud: ZoneHud[] = [];
    let overheated: ZoneId | null = null;
    for (let i = 0; i < ZONE_ORDER.length; i += 1) {
      const zoneId = ZONE_ORDER[i];
      if (zoneId === undefined) {
        continue;
      }
      const zoneState = run.zones[zoneId];
      const zonePresent = countPresent(run.audience, zoneId);
      const waiting = zoneState.heat === 0 && zonePresent > 0 && zoneState.litSeats === 0;
      zoneHud.push({
        id: zoneId,
        heat: zoneState.heat,
        waiting,
        blackened: zoneState.blackSeats > 0,
      });
      if (zoneState.overheat && overheated === null) {
        overheated = zoneId;
      }
    }
    const broken: InstrumentLineId[] = [];
    const lineIds: readonly InstrumentLineId[] = ['guitar', 'bass', 'drums'];
    for (let i = 0; i < lineIds.length; i += 1) {
      const lineId = lineIds[i];
      if (lineId !== undefined && run.lines[lineId].broken) {
        broken.push(lineId);
      }
    }
    const segmentIndex = data.segments.findIndex((segment) => segment.id === run?.segment);
    const holdProgress = clamp(run.player.holdSeconds / FINALE_HOLD_SECONDS, 0, 1);
    return {
      revision: run.hudRevision,
      whiteout,
      critical: present > 0 && present <= stats.peakAudience * data.balance.run.lowAudienceRatio,
      zones: [zoneHud[0] ?? emptyZone('front-left'), zoneHud[1] ?? emptyZone('front-right'), zoneHud[2] ?? emptyZone('back-left'), zoneHud[3] ?? emptyZone('back-right')],
      lightCoverage: coverage,
      noisePressure: clamp(noiseActive / Math.max(1, data.balance.noise.cap), 0, 1),
      beatPhase: clamp(run.musical.beatPhase, 0, 1),
      beatStrength: run.musical.beat % 2 === 0 ? 'strong' : 'weak',
      segmentIndex: (segmentIndex < 0 ? 0 : segmentIndex) as 0 | 1 | 2 | 3 | 4,
      silent: run.silenceRemaining > 0,
      returnLocked: run.returnListener.locked,
      brokenLines: broken,
      overheatedZone: overheated,
      holdProgress,
      encoreAvailable: !run.encoreUsed,
      runSeconds: run.time,
    };
  };

  function emptyZone(id: ZoneId): ZoneHud {
    return { id, heat: 0, waiting: false, blackened: false };
  }

  const publishHud = (force: boolean): void => {
    if (!force && run !== null && hudBar === run.musical.bar && hudBeat === run.musical.beat) {
      return;
    }
    if (run !== null) {
      run.hudRevision += 1;
      hudBar = run.musical.bar;
      hudBeat = run.musical.beat;
    }
    hud = buildHud();
    for (let i = 0; i < hudListeners.length; i += 1) {
      const listener = hudListeners[i];
      if (listener !== undefined) {
        listener();
      }
    }
  };

  const updateRender = (): void => {
    if (run === null) {
      render.audience = emptyAudience();
      render.noise.count = 0;
      render.frame = 0;
      return;
    }
    simFrame += 1;
    render.frame = simFrame;
    render.audience = run.audience;
    camera.target.x = run.player.position.x;
    camera.target.z = run.player.position.z;
    camera.zoom = 1;
    camera.shake = run.light.intensity * 0.15;
    lightFrame.position.x = run.light.position.x;
    lightFrame.position.y = 0.25;
    lightFrame.position.z = run.light.position.z;
    lightFrame.mode = run.light.mode;
    lightFrame.radius = run.light.radius;
    lightFrame.intensity = run.light.intensity;
    lightFrame.pulse = run.light.intensity;
    // 失真抵达舞台时完全熄灭；Boss「吞光」阶段按相位缩放；其余保持可见。
    lightFrame.visibility =
      stageBlackout > 0 ? 0 : run.boss.phase === 'light' ? data.balance.boss.phase2LightScale : 1;

    // 噪声帧：只填活跃实体，其余由 count 截断。
    const frame = noiseFrame;
    let count = 0;
    for (let i = 0; i < run.noises.length && count < NOISE_FRAME_CAP; i += 1) {
      const entity = run.noises[i];
      if (entity === undefined || !entity.active) {
        continue;
      }
      frame.kind[count] = noiseKindCode(entity.kind);
      frame.position[count * 2] = entity.position.x;
      frame.position[count * 2 + 1] = entity.position.z;
      frame.rotation[count] = Math.atan2(entity.velocity.z, entity.velocity.x);
      frame.scale[count] = entity.state === 'dying' ? clamp(entity.remaining / 0.5, 0, 1) : 1;
      count += 1;
    }
    frame.count = count;
    const firstRange = noiseDirty[0];
    if (firstRange !== undefined) {
      firstRange.start = 0;
      firstRange.count = count;
    }
    for (let i = 1; i < noiseDirty.length; i += 1) {
      const range = noiseDirty[i];
      if (range !== undefined) {
        range.start = 0;
        range.count = 0;
      }
    }
    particleFrame.count = 0;

    // 场馆亮度：按段落的灯光态；静默段压到 0.25（GDD §9.1）。
    let venue = 1;
    for (let i = 0; i < data.segments.length; i += 1) {
      const segment = data.segments[i];
      if (segment !== undefined && segment.id === run.segment) {
        venue = segment.lighting === 'blackout' ? 0.25 : segment.lighting === 'warm' ? 0.6 : 1;
        break;
      }
    }
    render.venueLight = run.silenceRemaining > 0 ? 0.25 : venue;
    render.flash = run.light.intensity;
    render.silenced = run.silenceRemaining > 0;
  };

  /* ---------------------------------------------------------------- 一局 */

  const startRun = (config: RunConfig): void => {
    if (run !== null) {
      disposeAudience(run.audience);
      world.reset();
    }
    world = createEntityWorld(data, data.balance.noise.cap);
    const root = createRng(config.seed);
    const seatsRng = root.fork('seats');
    cardsRng = root.fork('cards');
    spawnRng = root.fork('spawn');
    const audience = createAudience(data, seatsRng);
    const musical = deps.fallbackClock.positionAt(0);
    const lightStart = initialLightPosition(data);
    const playerPosition = playerStart(data);
    const crowdWave: CrowdWaveState = {
      index: 0,
      nextAt: data.balance.crowdWave.times[0] ?? null,
      progress: null,
      origin: null,
    };
    run = {
      config,
      phase: 'playing',
      time: 0,
      musical,
      segment: musical.segment,
      light: {
        position: { x: lightStart.x, z: lightStart.z },
        target: { x: lightStart.x, z: lightStart.z },
        mode: 'spread',
        radius: data.lightForms.spread.radius,
        intensity: 0,
        igniteCooldown: 0,
        anchor: { x: lightStart.x, z: lightStart.z },
        anchorAge: 0,
        sweptZones: 0,
        sweepBonusCharges: 0,
        lightingZone: null,
      },
      player: {
        position: { x: playerPosition.x, z: playerPosition.z },
        facing: 0,
        moveSpeed: PLAYER_SPEED,
        holdSeconds: 0,
      },
      zones: createZones(data),
      audience,
      noises: world.noises,
      returnListener: createReturnListener(data),
      boss: createBoss(),
      lines: createLines(),
      build: createBuild(),
      offer: null,
      crowdWave,
      cracks: 0,
      encoreUsed: false,
      silenceRemaining: 0,
      lowAudienceBars: 0,
      stats: statsSnapshot(createZeroStats(), 0),
      failure: null,
      ending: null,
      hudRevision: 0,
    };

    stats = createZeroStats();
    stats.peakAudience = countPresent(audience, null);
    prevState = new Uint8Array(audience.size);
    prevState.set(audience.state);
    lightPathCount = 0;
    lightPathCursor = 0;
    igniteTimes.fill(-1);
    igniteTimeCursor = 0;
    waitEncore = false;
    wasLocked = false;
    stageBlackout = 0;
    lowBarMark = -1;
    hudBar = -1;
    hudBeat = -1;
    silencePrev = false;
    choirBeat = -1;
    telemetryTimer = 0;
    windowIgnites = [0, 0, 0];
    simFrame = 0;
    result = null;
    activeClock = deps.audio.clock.isRunning() ? deps.audio.clock : deps.fallbackClock;

    deps.telemetry?.begin(config.seed, config.mode);
    deps.audio.setSegment(run.segment);
    deps.audio.setSilenced(false);
    publishHud(true);
    updateRender();
  };

  const statsSnapshot = (source: MutableStats, duration: Seconds): RunStats => {
    return {
      peakAudience: source.peakAudience,
      finalAudience: source.finalAudience,
      converted: source.converted,
      burned: source.burned,
      covered: source.covered,
      leftVenue: source.leftVenue,
      ignitesPerfect: source.ignitesPerfect,
      ignitesGood: source.ignitesGood,
      ignitesOff: source.ignitesOff,
      crowdWaves: source.crowdWaves,
      cracks: source.cracks,
      returnLocks: source.returnLocks,
      encoreUsed: source.encoreUsed,
      duration,
    };
  };

  const countSecondRowEmpty = (): number => {
    if (run === null) {
      return 0;
    }
    const frame = run.audience;
    const row = 1;
    let empty = 0;
    for (let col = 0; col < data.seats.cols; col += 1) {
      const seat = row * data.seats.cols + col;
      const state = frame.state[seat] ?? 0;
      if (state !== 1 && state !== 2 && state !== 3) {
        empty += 1;
      }
    }
    return empty;
  };

  const zoneCounts = (): Readonly<Record<ZoneId, number>> => {
    return {
      'front-left': run === null ? 0 : countPresent(run.audience, 'front-left'),
      'front-right': run === null ? 0 : countPresent(run.audience, 'front-right'),
      'back-left': run === null ? 0 : countPresent(run.audience, 'back-left'),
      'back-right': run === null ? 0 : countPresent(run.audience, 'back-right'),
    };
  };

  const readLightPath = (): readonly Vec2[] => {
    const points: Vec2[] = [];
    const total = lightPathCount;
    for (let i = 0; i < total; i += 1) {
      const index = (lightPathCursor - total + i + LIGHT_PATH_SAMPLES) % LIGHT_PATH_SAMPLES;
      const x = lightPath[index * 2] ?? 0;
      const z = lightPath[index * 2 + 1] ?? 0;
      points.push({ x, z });
    }
    return points;
  };

  const buildFailureCard = (): FailureCard => {
    if (run === null) {
      throw new Error('buildFailureCard: 没有进行中的一局');
    }
    const lockSeconds = run.returnListener.lockSeconds;
    const weakest = weakestZone();
    const weakestCount = run === null ? 0 : countPresent(run.audience, weakest);
    const recentIgnites = countRecentIgnites(5);
    const reasons: [FailureReason, FailureReason, FailureReason] = [
      { code: 'return-listener-lock', seconds: lockSeconds, zone: null, people: 0 },
      { code: 'zone-cooled', seconds: run.time, zone: weakest, people: weakestCount },
      { code: 'no-ignite', seconds: run.time, zone: null, people: recentIgnites },
    ];
    const path = readLightPath();
    let moved = 0;
    for (let i = 1; i < path.length; i += 1) {
      const previous = path[i - 1];
      const current = path[i];
      if (previous === undefined || current === undefined) {
        continue;
      }
      const dx = current.x - previous.x;
      const dz = current.z - previous.z;
      moved += Math.sqrt(dx * dx + dz * dz);
    }
    return {
      at: run.time,
      segment: run.segment,
      reasons,
      replay: { lightPath: path, ignites: recentIgnites, movedMeters: moved },
    };
  };

  const weakestZone = (): ZoneId => {
    if (run === null) {
      return 'front-left';
    }
    let weakest: ZoneId = 'front-left';
    let fewest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < ZONE_ORDER.length; i += 1) {
      const zoneId = ZONE_ORDER[i];
      if (zoneId === undefined) {
        continue;
      }
      const present = countPresent(run.audience, zoneId);
      if (present < fewest) {
        fewest = present;
        weakest = zoneId;
      }
    }
    return weakest;
  };

  const countRecentIgnites = (window: Seconds): number => {
    if (run === null) {
      return 0;
    }
    let count = 0;
    for (let i = 0; i < igniteTimes.length; i += 1) {
      const time = igniteTimes[i] ?? -1;
      if (time >= 0 && run.time - time <= window) {
        count += 1;
      }
    }
    return count;
  };

  const finishRun = (ending: EndingKind): void => {
    if (run === null || run.phase === 'results') {
      return;
    }
    const present = countPresent(run.audience, null);
    stats.finalAudience = present;
    stats.peakAudience = Math.max(stats.peakAudience, present);
    stats.cracks = run.cracks;
    stats.encoreUsed = run.encoreUsed;
    stats.duration = run.time;
    const snapshot = statsSnapshot(stats, run.time);
    const failure = ending === 'interrupted' ? buildFailureCard() : null;
    const grade = gradeFor(ending, snapshot, run.encoreUsed);
    const finalResult: RunResult = {
      seed: run.config.seed,
      ending,
      grade,
      stats: snapshot,
      zoneCounts: zoneCounts(),
      emptySeats: Math.max(0, capacity - present),
      secondRowEmpty: countSecondRowEmpty(),
      failure,
    };
    run.stats = snapshot;
    run.failure = failure;
    run.ending = ending;
    run.phase = 'results';
    result = finalResult;

    if (failure !== null) {
      emit({ kind: 'failure', time: run.time, beatIndex: beatIndexAt(), card: failure });
      deps.audio.playCue('fail', null);
    }
    emit({ kind: 'run-end', time: run.time, beatIndex: beatIndexAt(), result: finalResult });

    // 结算写记录（只写设置/记录，不写局内进度；失败静默）。
    try {
      const loaded = deps.save.load();
      const records = updateRecords(loaded.data.records, finalResult, '');
      deps.save.save(
        {
          version: 1,
          settings: loaded.data.settings,
          records,
          unlocks: loaded.data.unlocks,
        },
        'run-end',
      );
    } catch {
      // 存档失败不影响结算（GDD §18）。
    }

    publishHud(true);
    updateRender();
  };

  /* -------------------------------------------------------------- 主 tick */

  const tick = (dt: Seconds, input: InputFrame): void => {
    if (run === null || dt <= 0) {
      return;
    }
    const phase = run.phase;
    if (phase === 'paused' || phase === 'levelup' || phase === 'results') {
      return;
    }

    activeClock = deps.audio.clock.isRunning() ? deps.audio.clock : deps.fallbackClock;
    run.time += dt;
    const musical = activeClock.positionAt(run.time);
    run.musical = musical;
    const beatIndex = musical.bar * data.beatGrid.beatsPerBar + musical.beat;

    // 段落切换（事件 + 音频层）。
    if (musical.segment !== run.segment) {
      const from = run.segment;
      run.segment = musical.segment;
      emit({ kind: 'segment', time: run.time, beatIndex, from, to: musical.segment });
      deps.audio.setSegment(musical.segment);
    }

    // 1) 玩家移动（舞台范围限制）。
    const move = input.move;
    if (move.x !== 0 || move.z !== 0) {
      run.player.position = {
        x: clamp(run.player.position.x + move.x * run.player.moveSpeed * dt, -STAGE_HALF_X, STAGE_HALF_X),
        z: clamp(run.player.position.z + move.z * run.player.moveSpeed * dt, -STAGE_HALF_Z, STAGE_HALF_Z),
      };
      run.player.facing = Math.atan2(move.z, move.x);
    }
    run.player.holdSeconds = input.holdSeconds;

    // 2) 光（形态/惯性/锚点/扫场）。
    updateLight(run, input, data, dt);
    // 失真「吞光」：锥长按被吞比例收窄（GDD §8.1，每只 30%、上限 60%）。
    const eaten = lightEatRatio(run);
    if (eaten > 0) {
      run.light.radius *= 1 - eaten;
    }
    // 失真抵达舞台：光灭 1.5s（逻辑半径归零，audience 因此停止转化）。
    stageBlackout = stageBlackoutRemaining(run);
    if (stageBlackout > 0) {
      run.light.radius = 0;
      run.light.intensity = 0;
    }

    // 3) 点燃（冷却 + 跟拍 + 和弦 + 扫场加成）。
    if (input.ignitePressed && run.light.igniteCooldown <= 0) {
      const sweepBonus =
        run.light.sweepBonusCharges > 0 ? data.balance.antiCamp.sweepBonus : 0;
      const ignite = evaluateIgnite(run, musical, data, sweepBonus);
      const zone = ignite.zone;
      emit({
        kind: 'ignite',
        time: run.time,
        beatIndex,
        quality: ignite.quality,
        position: { x: run.light.position.x, z: run.light.position.z },
        zone,
        inChord: ignite.inChord,
      });
      deps.audio.playCue('ignite-hit', ignite.quality);
      cue('ignite-hit', ignite.quality);
      if (ignite.quality === 'perfect') {
        stats.ignitesPerfect += 1;
        windowIgnites[0] += 1;
      } else if (ignite.quality === 'good') {
        stats.ignitesGood += 1;
        windowIgnites[1] += 1;
      } else {
        stats.ignitesOff += 1;
        windowIgnites[2] += 1;
      }
      igniteTimes[igniteTimeCursor] = run.time;
      igniteTimeCursor = (igniteTimeCursor + 1) % igniteTimes.length;

      const zones = zone === null ? [] : [zone];
      const damage = resolveIgniteDamage(run, data, zones, ignite.multiplier);
      stats.burned += damage.burned;
      if (damage.converted > 0) {
        stats.converted += damage.converted;
        addColoredAudience(damage.converted);
      }
    }

    // 4) 三条线（噪音拽线 / 按 E 插线 / 贝斯护盾）。
    const lines = updateLines(run, dt, input.interactHeld);
    for (let i = 0; i < lines.broken.length; i += 1) {
      const lineId = lines.broken[i];
      if (lineId === undefined) {
        continue;
      }
      emit({ kind: 'line', time: run.time, beatIndex, action: 'break', line: lineId });
      deps.audio.playCue('line-snap', null);
      cue('line-snap', null);
    }
    for (let i = 0; i < lines.plugged.length; i += 1) {
      const lineId = lines.plugged[i];
      if (lineId === undefined) {
        continue;
      }
      emit({ kind: 'line', time: run.time, beatIndex, action: 'plugged', line: lineId });
      deps.audio.playCue('ui', null);
    }

    // 5) 实体回收（dying 结束、越界、非活跃）。
    updateEntities(world, run, dt);

    // 6) 噪音 AI、刷怪、返听。
    updateNoise(run, data, dt);
    updateSpawner({ run, data, rng: spawnRng, pool: world.pool, dt });
    const listener = updateReturnListener(run, data, dt);
    if (listener.spawned) {
      emit({ kind: 'return-listener', time: run.time, beatIndex, action: 'spawn' });
      deps.audio.playCue('return-lock', null);
      cue('return-lock', null);
    }
    const lockedNow = run.returnListener.locked;
    if (lockedNow !== wasLocked) {
      wasLocked = lockedNow;
      if (lockedNow) {
        emit({ kind: 'return-listener', time: run.time, beatIndex, action: 'lock' });
        stats.returnLocks += 1;
      } else {
        emit({ kind: 'return-listener', time: run.time, beatIndex, action: 'unlock' });
      }
    }
    void listener.released;
    if (listener.converted > 0) {
      stats.converted += listener.converted;
      addColoredAudience(listener.converted);
    }

    // 7) Boss（静默/吞光/冷却；退场带走区）。
    const boss = updateBoss(run, data, dt);
    if (boss.changed) {
      const action = boss.phase === 'bus' ? 'enter' : boss.phase === 'retired' ? 'retire' : 'advance';
      emit({ kind: 'boss', time: run.time, beatIndex, phase: boss.phase, action, zone: null });
      if (boss.strippedZone !== null) {
        emit({
          kind: 'boss',
          time: run.time,
          beatIndex,
          phase: boss.phase,
          action: 'strip-zone',
          zone: boss.strippedZone,
        });
      }
      if (boss.returnedAudience > 0) {
        const restored = restoreAudience(countPresent(run.audience, null) + boss.returnedAudience);
        stats.converted += restored;
      }
    }
    const silentNow = run.silenceRemaining > 0;
    if (silentNow !== silencePrev) {
      emit({ kind: 'silence', time: run.time, beatIndex, active: silentNow, remaining: run.silenceRemaining });
      deps.audio.setSilenced(silentNow);
      cue('silence-toggle', null);
      silencePrev = silentNow;
    }

    // 8) 人浪（2:00/5:00/8:00，阈值不足退化为单区小浪）。
    const wave = updateCrowdWave(run, data, dt);
    if (wave.triggered > 0) {
      emit({
        kind: 'crowd-wave',
        time: run.time,
        beatIndex,
        index: wave.triggered,
        origin: wave.origin ?? 'front-left',
      });
      deps.audio.playCue('crowd-wave', null);
      cue('crowd-wave', null);
      stats.crowdWaves += 1;
      if (wave.cracked) {
        emit({ kind: 'crack', time: run.time, beatIndex, total: run.cracks });
        cue('drop-light', null);
      }
    }
    if (wave.converted > 0) {
      stats.converted += wave.converted;
    }

    // 9) 合唱波（每 4 拍自动开火；烧穿/唱化产出）。
    const choir = resolveChoirWave(run, data, dt);
    stats.burned += choir.burned;
    if (choir.converted > 0) {
      stats.converted += choir.converted;
      addColoredAudience(choir.converted);
    }

    // 10) 观众（两段转化/热度/覆盖/离场）。
    const delta = updateAudience(run, data, dt);
    stats.converted += delta.converted;
    stats.covered += delta.black;

    // 11) 状态差分 → 事件（转化 / 覆盖 / 离场）。逐席比较，成本 768 次/tick。
    if (prevState.length === run.audience.size) {
      for (let seat = 0; seat < run.audience.size; seat += 1) {
        const before = prevState[seat] ?? 0;
        const after = run.audience.state[seat] ?? 0;
        if (before === after) {
          continue;
        }
        prevState[seat] = after;
        const zoneId =
          run.zones[ZONE_ORDER[run.audience.zone[seat] ?? 0] ?? 'front-left']?.id ?? 'front-left';
        if ((before === 1 || before === 3) && after === 2) {
          emit({ kind: 'convert', time: run.time, beatIndex, seat, zone: zoneId, amount: 1, source: 'light' });
        } else if (before !== 3 && after === 3) {
          emit({ kind: 'cover', time: run.time, beatIndex, seat, zone: zoneId });
        } else if (before !== 4 && after === 4) {
          stats.leftVenue += 1;
          emit({
            kind: 'cast-out',
            time: run.time,
            beatIndex,
            seat,
            zone: zoneId,
            amount: 1,
            cause: 'covered',
          });
        }
      }
    } else if (prevState.length === 0) {
      prevState = new Uint8Array(run.audience.size);
      prevState.set(run.audience.state);
    }

    // 12) 经验与升级（冻结由 phase 处理）。
    const crowdWaveXp = data.progression.experience.crowdWave;
    let experience = delta.converted;
    if (wave.triggered > 0) {
      experience += crowdWaveXp;
    }
    if (experience > 0) {
      const offer = addExperience(run, experience, cardsRng);
      if (offer !== null) {
        run.offer = offer;
        run.phase = 'levelup';
        emit({ kind: 'levelup', time: run.time, beatIndex, offer });
        publishHud(true);
        updateRender();
        return;
      }
    }

    // 13) 中断 / 空场 / 终曲。
    const present = countPresent(run.audience, null);
    stats.peakAudience = Math.max(stats.peakAudience, present);
    if (present === 0 && run.phase !== 'empty-house') {
      run.phase = 'empty-house';
      deps.audio.setSilenced(true);
    }
    if (run.phase !== 'empty-house' && present > 0 && stats.peakAudience > 0) {
      if (present <= stats.peakAudience * data.balance.run.lowAudienceRatio) {
        // 每个小节只记一次（低人气连续小节计数）。
        if (musical.bar !== lowBarMark) {
          lowBarMark = musical.bar;
          run.lowAudienceBars += 1;
        }
      } else {
        run.lowAudienceBars = 0;
        lowBarMark = musical.bar;
      }
    }
    if (run.lowAudienceBars >= data.balance.run.lowAudienceBars && run.phase === 'playing') {
      if (run.encoreUsed) {
        finishRun('interrupted');
        return;
      }
      run.phase = 'paused';
      waitEncore = true;
      publishHud(true);
      updateRender();
      return;
    }

    // 终曲长按：放下光（finish-hold 只做标记，不改变流量）。
    if (
      run.phase === 'playing' &&
      run.segment === 'finale' &&
      input.holdSeconds >= FINALE_HOLD_SECONDS
    ) {
      run.phase = 'finale-hold';
      deps.audio.playCue('drop-light', null);
      cue('drop-light', null);
    }

    // 时间结束：完成（空场也算完成，评级 C）。
    if (run.time >= data.balance.run.durationSec) {
      finishRun(run.phase === 'empty-house' ? 'empty-house' : 'complete');
      return;
    }

    // 14) 音频合唱混音（每 4 拍一次，不每帧建节点）。
    if (musical.bar * data.beatGrid.beatsPerBar + musical.beat !== choirBeat) {
      const isFourBeat = (musical.beat + 1) % 4 === 0;
      if (isFourBeat) {
        choirBeat = musical.bar * data.beatGrid.beatsPerBar + musical.beat;
        const mix = buildChoirMix();
        deps.audio.setChoir(mix);
      }
    }

    // 15) 光路采样（失败卡最后 5 秒回放）。
    lightPath[lightPathCursor * 2] = run.light.position.x;
    lightPath[lightPathCursor * 2 + 1] = run.light.position.z;
    lightPathCursor = (lightPathCursor + 1) % LIGHT_PATH_SAMPLES;
    if (lightPathCount < LIGHT_PATH_SAMPLES) {
      lightPathCount += 1;
    }

    // 16) 埋点（0.5s 一次）。
    if (deps.telemetry !== null) {
      telemetryTimer += dt;
      if (telemetryTimer >= TELEMETRY_INTERVAL) {
        telemetryTimer -= TELEMETRY_INTERVAL;
        deps.telemetry.sample(sampleTelemetry());
        windowIgnites = [0, 0, 0];
      }
    }

    // 17) 快照。
    publishHud(false);
    updateRender();
  };

  const buildChoirMix = (): Record<ZoneId, ChoirZoneMix> => {
    const mix: Record<ZoneId, ChoirZoneMix> = {
      'front-left': zoneMix('front-left', -0.55),
      'front-right': zoneMix('front-right', 0.55),
      'back-left': zoneMix('back-left', -0.25),
      'back-right': zoneMix('back-right', 0.25),
    };
    return mix;
  };

  const zoneMix = (zone: ZoneId, pan: number): ChoirZoneMix => {
    const audience = run === null ? 0 : countPresent(run.audience, zone);
    const heat = run === null ? 0 : run.zones[zone].heat;
    const gain = Math.min(1, Math.sqrt(audience / 192) * 0.9 + heat * 0.03);
    return { audience, heat, gain, pan };
  };

  const sampleTelemetry = (): TelemetrySample => {
    if (run === null) {
      throw new Error('sampleTelemetry: 没有进行中的一局');
    }
    const present = countPresent(run.audience, null);
    const lit = queryLitSeats(run, data, litSeats);
    let noiseActive = 0;
    for (let i = 0; i < run.noises.length; i += 1) {
      const entity = run.noises[i];
      if (entity !== undefined && entity.active) {
        noiseActive += 1;
      }
    }
    const heat: [HeatLevel, HeatLevel, HeatLevel, HeatLevel] = [
      run.zones['front-left'].heat,
      run.zones['front-right'].heat,
      run.zones['back-left'].heat,
      run.zones['back-right'].heat,
    ];
    return {
      t: run.time,
      light: { x: run.light.position.x, z: run.light.position.z },
      player: { x: run.player.position.x, z: run.player.position.z },
      audience: present,
      litSeats: lit,
      noiseCount: noiseActive,
      returnLocked: run.returnListener.locked,
      zoneHeat: heat,
      ignites: [windowIgnites[0], windowIgnites[1], windowIgnites[2]],
    };
  };

  const noiseKindCode = (kind: NoiseKind): number => {
    switch (kind) {
      case 'floor-noise':
        return 0;
      case 'scream':
        return 1;
      case 'distortion':
        return 2;
      case 'return-listener':
        return 3;
      case 'silence':
        return 4;
      default:
        return 0;
    }
  };

  /* -------------------------------------------------------------- 命令 */

  const dispatch = (command: GameCommand): void => {
    switch (command.type) {
      case 'start-run':
        startRun(command.config);
        return;
      case 'restart-run':
        startRun({ seed: command.seed, mode: 'normal' });
        return;
      case 'quit-run':
        if (run !== null) {
          disposeAudience(run.audience);
          world.reset();
        }
        run = null;
        result = null;
        hud = emptyHud();
        for (let i = 0; i < hudListeners.length; i += 1) {
          hudListeners[i]?.();
        }
        return;
      case 'pause':
        if (run !== null && run.phase === 'playing' && !waitEncore) {
          run.phase = 'paused';
          void deps.audio.suspend();
          publishHud(true);
        }
        return;
      case 'resume':
        if (run !== null && run.phase === 'paused' && !waitEncore) {
          run.phase = 'playing';
          void deps.audio.resume();
          publishHud(true);
        }
        return;
      case 'choose-card':
        chooseCard(command.cardId);
        return;
      case 'encore':
        if (run !== null && waitEncore) {
          useEncore();
        }
        return;
      case 'continue-solo':
        if (run !== null && waitEncore) {
          continueSolo();
        }
        return;
      case 'skip-empty-house':
        if (run !== null && (run.phase === 'empty-house' || run.phase === 'finale-hold')) {
          finishRun('empty-house');
        }
        return;
      case 'tick':
        tick(command.dt, command.input);
        return;
      default: {
        const never: never = command;
        void never;
      }
    }
  };

  const chooseCard = (cardId: CardId): void => {
    if (run === null || run.phase !== 'levelup' || run.offer === null) {
      return;
    }
    if (!run.offer.cards.includes(cardId)) {
      return;
    }
    applyCard(run, cardId, data);
    run.offer = null;
    if (run.phase === 'levelup') {
      run.phase = 'playing';
    }
    const evolution = run.build.evolution;
    if (evolution !== null && !run.build.evolutionFired) {
      run.build.evolutionFired = true;
      emit({ kind: 'evolution', time: run.time, beatIndex: beatIndexAt(), evolution });
      deps.audio.playCue('encore', null);
    }
    publishHud(true);
    updateRender();
  };

  const useEncore = (): void => {
    if (run === null) {
      return;
    }
    const target = Math.max(
      data.balance.run.encoreMinAudience,
      Math.round(stats.peakAudience * data.balance.run.encoreRestoreRatio),
    );
    const restored = restoreAudience(target);
    run.encoreUsed = true;
    stats.encoreUsed = true;
    run.lowAudienceBars = 0;
    run.phase = 'playing';
    waitEncore = false;
    for (let i = 0; i < ZONE_ORDER.length; i += 1) {
      const zoneId = ZONE_ORDER[i];
      if (zoneId === undefined) {
        continue;
      }
      const zoneState = run.zones[zoneId];
      zoneState.heat = toHeatLevel(zoneState.heat + 1);
    }
    emit({ kind: 'encore', time: run.time, beatIndex: beatIndexAt(), restoredAudience: restored });
    deps.audio.playCue('encore', null);
    publishHud(true);
    updateRender();
  };

  const continueSolo = (): void => {
    if (run === null) {
      return;
    }
    clearAudience();
    run.lowAudienceBars = 0;
    run.phase = 'empty-house';
    waitEncore = false;
    publishHud(true);
    updateRender();
  };

  /* ------------------------------------------------------ 订阅与生命周期 */

  const subscribeHud = (listener: () => void): (() => void) => {
    hudListeners.push(listener);
    return () => {
      const index = hudListeners.indexOf(listener);
      if (index >= 0) {
        hudListeners.splice(index, 1);
      }
    };
  };

  const subscribeEvents = (handler: GameEventHandler): (() => void) => {
    return deps.events.subscribe(handler);
  };

  // telemetry 逐条记录事件（仅 dev/QA 构建会传入 recorder）。
  if (deps.telemetry !== null) {
    unsubscribeEvents.push(deps.events.subscribe((event) => deps.telemetry?.event(event)));
  }

  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    for (let i = 0; i < unsubscribeEvents.length; i += 1) {
      unsubscribeEvents[i]?.();
    }
    unsubscribeEvents.length = 0;
    hudListeners.length = 0;
    if (run !== null) {
      disposeAudience(run.audience);
    }
    world.reset();
    run = null;
    result = null;
  };

  return {
    getRun: () => run,
    getHud: () => hud,
    getRender: () => render,
    getResult: () => result,
    dispatch,
    subscribeHud,
    subscribeEvents,
    tick,
    dispose,
  };
}
