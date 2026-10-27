/**
 * QA 测试辅助：无 DOM 的 GameStore 装配（t96 使用，不属于任何测试用例）。
 *
 * 只做三件事：提供可预测的 MusicClock / AudioPort / SavePort 桩，装配真实 store，
 * 以及一个中性输入。所有断言都在具体 `*.test.ts` 里。
 */
import { buildDataRegistry } from '../../src/data';
import { createEventBus } from '../../src/game/events';
import { createRng } from '../../src/game/rng';
import { createGameStore } from '../../src/game/store';
import type { GameStore, StoreDeps } from '../../src/game/store';
import type {
  AudioPort,
  BeatTick,
  ChoirZoneMix,
  InputFrame,
  LayerId,
  MusicalPosition,
  MusicClock,
  SegmentId,
  ZoneId,
} from '../../src/types/game';
import type { SaveDataV1, SaveLoadResult, SavePort } from '../../src/types/save';

/** 中性输入：站定、不点火、不插线。 */
export const NEUTRAL_INPUT: InputFrame = {
  move: { x: 0, z: 0 },
  pointerNdc: { x: 0, z: 0 },
  pointerWorld: { x: 0, z: 0 },
  beamHeld: false,
  ignitePressed: false,
  interactHeld: false,
  holdSeconds: 0,
  pausePressed: false,
};

/** 固定步长（与 loop 的固定步长一致）。 */
export const STEP = 1 / 60;

/** 无音频环境的时钟桩：固定 128BPM、从 0 起算、永远 running。 */
export function createStubClock(): MusicClock {
  const beatSec = 60 / 128;
  return {
    bpm: 128,
    now: () => 0,
    positionAt(time: number): MusicalPosition {
      const bar = Math.floor(time / (beatSec * 4));
      const inBar = time - bar * beatSec * 4;
      const beat = Math.floor(inBar / beatSec);
      return {
        bar,
        beat,
        beatPhase: inBar / beatSec - beat,
        phraseBeat: (bar % 8) * 4 + beat,
        segment: 'overture',
        segmentProgress: 0,
        bpm: 128,
      };
    },
    tickAt(time: number): BeatTick {
      const index = Math.floor(time / beatSec);
      const bar = Math.floor(index / 4);
      const beat = index % 4;
      return {
        index,
        time: index * beatSec,
        bar,
        beat,
        phrase: Math.floor(bar / 8),
        isBarStart: beat === 0,
        strength: beat % 2 === 0 ? 'strong' : 'weak',
      };
    },
    isRunning: () => true,
  };
}

/** 静默音频端口：记录 setSegment，保证 store 可完整 tick。 */
export function createStubAudio(): AudioPort & { readonly segments: SegmentId[] } {
  const segments: SegmentId[] = [];
  return {
    clock: createStubClock(),
    segments,
    start: async () => undefined,
    suspend: async () => undefined,
    resume: async () => undefined,
    setSegment: (segment: SegmentId) => segments.push(segment),
    setLayerGain: (_layer: LayerId, _gain: number) => undefined,
    setChoir: (_mix: Readonly<Record<ZoneId, ChoirZoneMix>>) => undefined,
    setSilenced: (_silenced: boolean) => undefined,
    playCue: () => undefined,
    dispose: () => undefined,
  };
}

/** 空存档端口：不写盘、不备份。 */
export function createStubSave(): SavePort {
  const data: SaveDataV1 = {
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
      lastRun: { date: '', audience: 0, converted: 0, burned: 0, rank: '-', segments: 0 },
    },
    unlocks: { cardsSeen: [], momentsSeen: [] },
  };
  return {
    load: (): SaveLoadResult => ({ data, status: 'fresh', reasons: [] }),
    save: () => true,
    backupCorrupted: () => undefined,
    clear: () => undefined,
  };
}

export interface Harness {
  readonly store: GameStore;
  readonly audio: ReturnType<typeof createStubAudio>;
  start(seed: number): void;
  /** 以固定步长推进 n 帧（输入恒定）。 */
  tick(n: number, input?: InputFrame): void;
  dispose(): void;
}

/** 装配真实 store 并返回控制句柄。 */
export function createHarness(): Harness {
  const data = buildDataRegistry();
  const audio = createStubAudio();
  const deps: StoreDeps = {
    data,
    rng: createRng(1),
    events: createEventBus(),
    audio,
    save: createStubSave(),
    telemetry: null,
    fallbackClock: createStubClock(),
  };
  const store = createGameStore(deps);
  return {
    store,
    audio,
    start(seed: number): void {
      store.dispatch({ type: 'start-run', config: { seed, mode: 'normal' } });
    },
    tick(n: number, input: InputFrame = NEUTRAL_INPUT): void {
      for (let i = 0; i < n; i += 1) {
        store.dispatch({ type: 'tick', dt: STEP, input });
      }
    },
    dispose(): void {
      store.dispose();
    },
  };
}
