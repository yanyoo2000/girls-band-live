/**
 * F3 反驻守 bot 回归（t105）。
 *
 * 目的：用**纯 game/store**驱动两种计算机玩家，验证「停住＝被咬住、移动才有收益」：
 * - camp（驻守）：光固定在一个区、±0.3m 微摆，45s 人气必须掉到 ≤18（开局 30，跌幅 ≥40%）；
 * - sweep（扫场）：每 3 秒换区、持续点燃，45s 人气必须 ≥36（净增 ≥20%），且不团灭。
 *
 * 口径：
 * - 从 1:30（主歌开始，`data.segments.verse.startSec`）起跑 45 秒：序曲 0:00–1:30 按 GDD 无噪音，
 *   在无噪音段测反驻守没有意义，因此统一从主歌起跑（与 t88 的 bot 实测同口径，便于对照）。
 * - 不依赖 DOM / three / WebGL / localStorage：AudioPort / MusicClock / SavePort 用测试内 fake，
 *   与 `src/game/store.ts` 的端口契约一致。
 * - 固定种子，结果可复现；失败时打印两条 45 秒人气曲线（每 5 秒一个采样点）。
 *
 * 关联验收：GDD §11.2 / A08 / AC-08；tech-spec §14.1（`dwellRewardRatio < 0.75` 由 telemetry 另测）。
 */
import { describe, expect, it } from 'vitest';
import { buildDataRegistry } from '../src/data/index';
import { createEventBus } from '../src/game/events';
import { createInputBuffer, createInputSampler } from '../src/game/input';
import { createRng } from '../src/game/rng';
import { createGameStore } from '../src/game/store';
import { createTelemetryRecorder } from '../src/game/telemetry';
import { countPresent } from '../src/game/audience';
import type {
  AudioPort,
  GameEvent,
  MusicalPosition,
  MusicClock,
  SegmentId,
} from '../src/types/game';
import type { SaveDataV1, SavePort } from '../src/types/save';

const data = buildDataRegistry();
const BPM = data.beatGrid.bpm;
const BEATS_PER_BAR = data.beatGrid.beatsPerBar;
const FIXED_STEP = 1 / 60;
const RUN_SECONDS = 45;
/** 主歌起点：无噪音的序曲不计入反驻守窗口。 */
const START_SECONDS = data.segments[1]?.startSec ?? 90;
/** 驻守通过线：30 → ≤18（跌幅 ≥40%）。 */
const CAMP_MAX = 18;
/** 扫场通过线：30 → ≥36（净增 ≥20%）。 */
const SWEEP_MIN = 36;

/* ==========================================================================
 * 0. 端口替身（纯数据；不触 DOM / three / WebGL / localStorage）
 * ========================================================================== */

function segmentAt(time: number): SegmentId {
  for (const segment of data.segments) {
    if (time >= segment.startSec && time < segment.endSec) return segment.id;
  }
  return data.segments[data.segments.length - 1]?.id ?? 'finale';
}

const clock: MusicClock = {
  bpm: BPM,
  now: () => 0,
  positionAt: (time: number): MusicalPosition => {
    const beatSec = 60 / BPM;
    const total = Math.max(0, time) / beatSec;
    const bar = Math.floor(total / BEATS_PER_BAR);
    const beat = Math.floor(total) % BEATS_PER_BAR;
    const beatPhase = total - Math.floor(total);
    const segment = segmentAt(time);
    const def = data.segments.find((item) => item.id === segment);
    const start = def?.startSec ?? 0;
    const end = def?.endSec ?? 570;
    return {
      bar,
      beat,
      beatPhase,
      phraseBeat: (bar % data.beatGrid.barsPerPhrase) * BEATS_PER_BAR + beat,
      segment,
      segmentProgress: Math.min(1, Math.max(0, (time - start) / Math.max(1, end - start))),
      bpm: BPM,
    };
  },
  tickAt: (time: number) => {
    const position = clock.positionAt(time);
    return {
      index: position.bar * BEATS_PER_BAR + position.beat,
      time,
      bar: position.bar,
      beat: position.beat,
      phrase: Math.floor(position.bar / data.beatGrid.barsPerPhrase),
      isBarStart: position.beat === 0,
      strength: position.beat % 2 === 0 ? 'strong' : 'weak',
    };
  },
  isRunning: () => true,
};

function createAudio(): AudioPort {
  return {
    clock,
    start: async () => undefined,
    suspend: async () => undefined,
    resume: async () => undefined,
    setSegment: () => undefined,
    setLayerGain: () => undefined,
    setChoir: () => undefined,
    setSilenced: () => undefined,
    playCue: () => undefined,
    dispose: () => undefined,
  };
}

const SAVE_DATA: SaveDataV1 = {
  version: 1,
  settings: {
    master: 0.8,
    music: 0.7,
    sfx: 0.8,
    quality: 'high',
    reducedMotion: false,
    highContrast: false,
    beatPulse: true,
    lowFlash: false,
  },
  records: {
    bestAudience: 0,
    bestTime: 0,
    clears: 0,
    emptyHouse: 0,
    bestRank: '-',
    lastRun: { date: '2026-01-01', audience: 0, converted: 0, burned: 0, rank: '-', segments: 0 },
  },
  unlocks: { cardsSeen: [], momentsSeen: [] },
};

function createSave(): SavePort {
  let stored: SaveDataV1 = SAVE_DATA;
  return {
    load: () => ({ data: stored, status: 'fresh', reasons: [] }),
    save: (next: SaveDataV1) => {
      stored = next;
      return true;
    },
    backupCorrupted: () => undefined,
    clear: () => undefined,
  };
}

/* ==========================================================================
 * 1. bot 驱动
 * ========================================================================== */

type BotMode = 'camp' | 'sweep';

interface BotSample {
  readonly t: number;
  readonly audience: number;
  readonly locked: boolean;
  readonly noises: number;
  readonly lightZone: string | null;
  readonly light: string;
  readonly mode: string;
  readonly radius: number;
  readonly litSeats: number;
  readonly litSeconds: number;
  readonly oh: boolean;
}

interface BotResult {
  readonly mode: BotMode;
  readonly seed: number;
  readonly startAudience: number;
  readonly endAudience: number;
  readonly minAudience: number;
  readonly peakAudience: number;
  readonly samples: readonly BotSample[];
  readonly curve: readonly number[];
  readonly coverEvents: number;
  readonly castOutEvents: number;
  readonly cooledCasts: number;
  readonly overheatCasts: number;
  readonly coveredCasts: number;
  readonly convertedEvents: number;
  readonly lockSeconds: number;
  readonly loocks: number;
  readonly phase: string;
  readonly leftVenue: number;
  readonly convertedStat: number;
  readonly burned: number;
  readonly noises: number;
  readonly zones: string;
}

/** 四区“有人”中心（前两排中点）：bot 瞄准人所在的位置，而不是空座区中心。 */
const ZONE_AIMS = data.zones.map((zone) => {
  const row = zone.rowRange[0] + 0.5;
  const col = (zone.colRange[0] + zone.colRange[1]) / 2;
  const stepX = data.seats.spacing.x;
  const stepZ = data.seats.spacing.z;
  const gapX = col >= data.seats.aisleCol ? data.seats.aisleGap : 0;
  const gapZ = row >= data.seats.aisleRow ? data.seats.aisleGap : 0;
  return {
    x: data.seats.origin.x - col * stepX - gapX,
    z: data.seats.origin.z + row * stepZ + gapZ,
  };
});

/** 把世界坐标反解成投影器可用的 NDC（投影器是测试内的线性替身）。 */
const PROJECTOR_CENTER = { x: 0, z: 24 };
const PROJECTOR_SCALE = { x: 12, z: 14 };
const projector = {
  toStage: (ndc: { x: number; z: number }) => ({
    x: PROJECTOR_CENTER.x + ndc.x * PROJECTOR_SCALE.x,
    z: PROJECTOR_CENTER.z + ndc.z * PROJECTOR_SCALE.z,
  }),
};

function ndcFor(world: { x: number; z: number }): { x: number; z: number } {
  return {
    x: (world.x - PROJECTOR_CENTER.x) / PROJECTOR_SCALE.x,
    z: (world.z - PROJECTOR_CENTER.z) / PROJECTOR_SCALE.z,
  };
}

function runBot(mode: BotMode, seed: number): BotResult {
  const events = createEventBus();
  const store = createGameStore({
    data,
    rng: createRng(seed),
    events,
    audio: createAudio(),
    save: createSave(),
    telemetry: null,
    fallbackClock: clock,
  });
  store.dispatch({ type: 'start-run', config: { seed, mode: 'normal' } });
  const run = store.getRun();
  if (run === null) throw new Error('bot: start-run 没有产生 RunState');
  // 从主歌起点起跑（序曲无噪音，不计入反驻守窗口）。
  run.time = START_SECONDS;

  let coverEvents = 0;
  let castOutEvents = 0;
  let cooledCasts = 0;
  let overheatCasts = 0;
  let coveredCasts = 0;
  let convertedEvents = 0;
  let lockSeconds = 0;
  let locks = 0;
  store.subscribeEvents((event: GameEvent) => {
    if (event.kind === 'cover') coverEvents += 1;
    else if (event.kind === 'cast-out') {
      castOutEvents += 1;
      if (event.cause === 'cooled') cooledCasts += 1;
      else if (event.cause === 'overheat') overheatCasts += 1;
      else coveredCasts += 1;
    }
    else if (event.kind === 'convert') convertedEvents += 1;
    else if (event.kind === 'return-listener' && event.action === 'lock') locks += 1;
  });

  const buffer = createInputBuffer();
  const sampler = createInputSampler(buffer, run.player.moveSpeed);
  const startAudience = countPresent(run.audience, null);
  const samples: BotSample[] = [];
  const curve: number[] = [];
  let minAudience = startAudience;
  let peakAudience = startAudience;
  let sweepIndex = 0;
  const totalSteps = Math.round(RUN_SECONDS * 60);

  for (let step = 0; step < totalSteps; step += 1) {
    if (mode === 'camp') {
      // 驻守：光固定在一个区，±0.3m 微摆（GDD §14.1 的“驻守 bot”定义）。
      const aim = ZONE_AIMS[0] ?? { x: 0, z: 24 };
      const wobble = Math.sin(step * 0.05) * 0.3;
      buffer.setPointerNdc(ndcFor({ x: aim.x + wobble, z: aim.z }));
    } else if (step % 180 === 0) {
      // 扫场：每 3 秒换一个区（GDD §14.1 的“扫场 bot”定义）。
      const aim = ZONE_AIMS[sweepIndex % ZONE_AIMS.length] ?? { x: 0, z: 24 };
      sweepIndex += 1;
      buffer.setPointerNdc(ndcFor(aim));
    }
    // 两类 bot 的按键密度相同：每 0.5 秒点燃一次（冷却 2 拍 ≈0.94s，部分会被冷却吞掉）。
    if (step % 30 === 0) buffer.press('ignite');

    store.tick(FIXED_STEP, sampler.sample(projector));
    buffer.clearFrameEdges();

    const current = store.getRun();
    if (current === null) break;
    const locked = current.returnListener.locked;
    if (locked) lockSeconds += FIXED_STEP;

    // 升级冻结：自动选第一张卡，让 bot 继续跑（与真人首次升级一致）。
    if (current.phase === 'levelup' && current.offer !== null) {
      const card = current.offer.cards[0];
      if (card !== undefined) store.dispatch({ type: 'choose-card', cardId: card });
    } else if (current.phase === 'paused') {
      // 中断等待：测试里选择「继续独奏」（空场也要把 45 秒跑完）。
      store.dispatch({ type: 'continue-solo' });
    }

    const audience = countPresent(current.audience, null);
    if (audience < minAudience) minAudience = audience;
    if (audience > peakAudience) peakAudience = audience;
    if (step % 60 === 0) {
      // 每 1 秒一个采样点（共 45 点）；曲线用每 5 秒的值。
      if (step % 300 === 0) {
        curve.push(audience);
        samples.push({
          t: Number(current.time.toFixed(2)),
          audience,
          locked,
          noises: current.noises.length,
          lightZone: current.light.lightingZone,
          light: `${current.light.position.x.toFixed(1)},${current.light.position.z.toFixed(1)}`,
          mode: current.light.mode,
          radius: current.light.radius,
          litSeats: current.zones['front-left'].litSeats,
          litSeconds: Number(current.zones['front-left'].litSeconds.toFixed(2)),
          oh: current.zones['front-left'].overheat,
        });
      }
    }
  }

  const finalRun = store.getRun();
  const result: BotResult = {
    mode,
    seed,
    startAudience,
    endAudience: finalRun === null ? 0 : countPresent(finalRun.audience, null),
    minAudience,
    peakAudience,
    samples,
    curve,
    coverEvents,
    castOutEvents,
    cooledCasts,
    overheatCasts,
    coveredCasts,
    convertedEvents,
    lockSeconds: Number(lockSeconds.toFixed(1)),
    loocks: locks,
    phase: finalRun?.phase ?? 'null',
    leftVenue: finalRun?.stats.leftVenue ?? 0,
    convertedStat: finalRun?.stats.converted ?? 0,
    burned: finalRun?.stats.burned ?? 0,
    noises: finalRun?.noises.length ?? 0,
    zones:
      finalRun === null
        ? '-'
        : data.zones
            .map((zone) => {
              const state = finalRun.zones[zone.id];
              return `${zone.id}:h${state.heat}/lit${state.litSeconds.toFixed(1)}/oh${state.overheat ? '1' : '0'}/p${countPresent(finalRun.audience, zone.id)}`;
            })
            .join(' '),
  };
  store.dispose();
  return result;
}

/* ==========================================================================
 * 2. 断言与曲线输出
 * ========================================================================== */

const SEED = 777;

function format(result: BotResult): string {
  return JSON.stringify(
    {
      mode: result.mode,
      seed: result.seed,
      audience: `${result.startAudience} → ${result.endAudience}（min ${result.minAudience} / peak ${result.peakAudience}）`,
      curve45s: result.curve,
      samples: result.samples,
      coverEvents: result.coverEvents,
      castOutEvents: result.castOutEvents,
      castsByCause: `cooled=${result.cooledCasts} overheat=${result.overheatCasts} covered=${result.coveredCasts}`,
      convertEvents: result.convertedEvents,
      lockedSeconds: result.lockSeconds,
      lockEvents: result.loocks,
      phase: result.phase,
      leftVenue: result.leftVenue,
      converted: result.convertedStat,
      burned: result.burned,
      activeNoises: result.noises,
      zones: result.zones,
    },
    null,
    2,
  );
}

describe('F3 反驻守：驻守 vs 扫场（固定种子，纯 game/store）', () => {
  it('驻守 bot：45s 人气从 30 掉到 ≤18（跌幅 ≥40%）', () => {
    const result = runBot('camp', SEED);
    console.info(`\n[camp] ${format(result)}`);
    expect(result.startAudience).toBe(data.balance.run.startAudience);
    expect(result.endAudience).toBeLessThanOrEqual(CAMP_MAX);
  });

  it('扫场 bot：45s 人气从 30 净增到 ≥36（≥20%）且不团灭', () => {
    const result = runBot('sweep', SEED);
    console.info(`\n[sweep] ${format(result)}`);
    expect(result.startAudience).toBe(data.balance.run.startAudience);
    expect(result.endAudience).toBeGreaterThanOrEqual(SWEEP_MIN);
    expect(result.phase).not.toBe('empty-house');
  });

  it('90 秒门埋点可导出（gate-90s，6 项指标打印）', () => {
    const recorder = createTelemetryRecorder('2026-10-28T00:00:00Z');
    const events = createEventBus();
    const store = createGameStore({
      data,
      rng: createRng(90),
      events,
      audio: createAudio(),
      save: createSave(),
      telemetry: recorder,
      fallbackClock: clock,
    });
    store.dispatch({ type: 'start-run', config: { seed: 90, mode: 'gate-90s' } });
    const run = store.getRun();
    if (run === null) throw new Error('90 秒门：start-run 没有产生 RunState');
    const buffer = createInputBuffer();
    const sampler = createInputSampler(buffer, run.player.moveSpeed);
    // 人类式行为：前 10 秒不动光，之后每 4 秒主动换区，每 0.75 秒点燃一次。
    for (let step = 0; step < 90 * 60; step += 1) {
      if (step > 600 && step % 240 === 0) {
        const aim = ZONE_AIMS[(step / 240) % ZONE_AIMS.length] ?? { x: 0, z: 24 };
        buffer.setPointerNdc(ndcFor(aim));
      }
      if (step > 300 && step % 45 === 0) buffer.press('ignite');
      store.tick(FIXED_STEP, sampler.sample(projector));
      buffer.clearFrameEdges();
      const current = store.getRun();
      if (current !== null && current.phase === 'levelup' && current.offer !== null) {
        const card = current.offer.cards[0];
        if (card !== undefined) store.dispatch({ type: 'choose-card', cardId: card });
      }
    }
    const metrics = recorder.finish(store.getRun()?.ending ?? null);
    console.info(
      `
[gate-90s] ${JSON.stringify(
        {
          samples: metrics.samples.length,
          firstActiveLightMoveAt: metrics.firstActiveLightMoveAt,
          lightMovesPerMinute: Number(metrics.lightMovesPerMinute.toFixed(2)),
          dwellP50: Number(metrics.dwellP50.toFixed(2)),
          dwellP90: Number(metrics.dwellP90.toFixed(2)),
          zoneConversionRate: metrics.zoneConversionRate,
          igniteOnBeatRate: Number(metrics.igniteOnBeatRate.toFixed(3)),
          dwellRewardRatio: Number(metrics.dwellRewardRatio.toFixed(3)),
          endedAt: Number(metrics.endedAt.toFixed(1)),
        },
        null,
        2,
      )}`,
    );
    expect(metrics.samples.length).toBeGreaterThanOrEqual(150);
    expect(metrics.endedAt).toBeGreaterThan(80);
    expect(metrics.igniteOnBeatRate).toBeGreaterThanOrEqual(0);
    expect(metrics.igniteOnBeatRate).toBeLessThanOrEqual(1);
    store.dispose();
  });

  it('两条曲线同屏可读（打印 45s 采样 JSON）', () => {
    const camp = runBot('camp', SEED);
    const sweep = runBot('sweep', SEED);
    const report = {
      scenario: 'verse 1:30 → 2:15（45s，固定种子）',
      seed: SEED,
      camp: { end: camp.endAudience, curve45s: camp.curve },
      sweep: { end: sweep.endAudience, curve45s: sweep.curve },
    };
    console.info(`\n[f3-bot] ${JSON.stringify(report)}`);
    expect(camp.curve.length).toBeGreaterThanOrEqual(8);
    expect(sweep.curve.length).toBeGreaterThanOrEqual(8);
    // 反驻守的方向性：驻守终值必须显著低于扫场终值。
    expect(camp.endAudience).toBeLessThan(sweep.endAudience);
  });
});
