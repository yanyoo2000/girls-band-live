/**
 * 启动参数与降级时钟（tech-spec §5.7 / §6.4；集成层，tech-director 所有）。
 *
 * - `createBootContext(search)` 解析 `?dev / ?seed / ?quality / ?scene / ?run` 并探测 WebGL2；
 * - `createFallbackClock(data)` 是音频未就绪时的唯一时间基准：按 BPM/拍点/段落从
 *   `run.time` 推导音乐位置（不依赖 AudioContext，也不读帧时钟）。
 *
 * 注意：本文件不得 import react/three；只做纯计算与探测。
 */
import type { BeatTick, MusicalPosition, MusicClock, Seconds } from '../types/game';
import type { DataRegistry } from '../types/data';
import type { QualityLevel } from '../types/save';
import type { DevFlags } from '../types/ui';
import { detectWebGL2, type WebGL2Support } from './webgl-support';

/** 启动上下文（tech-spec §5.7 的 BootContext，追加可选的 dev 参数）。 */
export interface BootContext {
  readonly dev: DevFlags;
  readonly webgl2: WebGL2Support;
  readonly supported: boolean;
  /** 固定种子（仅 `?seed=N` 时非空；正式局由 store 随机）。 */
  readonly seed: number | null;
  /** 强制画质（仅 `?quality=low|high`）。 */
  readonly quality: QualityLevel | null;
  /** 直入场景（仅 dev：`?scene=results` 等；正式构建由 UI 忽略）。 */
  readonly scene: string | null;
}

/** 解析 URL 查询参数并探测 WebGL2（纯函数，可单测）。 */
export function createBootContext(search: string): BootContext {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const devFlag = params.get('dev');
  const devEnabled = devFlag === '1' || devFlag === 'true';
  const runMode: DevFlags['runMode'] = params.get('run') === 'gate-90s' ? 'gate-90s' : 'normal';

  const seedRaw = params.get('seed');
  const seed =
    seedRaw !== null && /^\d+$/.test(seedRaw) ? Number.parseInt(seedRaw, 10) >>> 0 : null;

  const qualityRaw = params.get('quality');
  const quality: QualityLevel | null =
    qualityRaw === 'low' ? 'low' : qualityRaw === 'high' ? 'high' : null;

  const webgl2 = detectWebGL2();
  return {
    dev: { devTools: devEnabled, telemetry: devEnabled, runMode },
    webgl2,
    supported: webgl2.ok,
    seed,
    quality,
    scene: params.get('scene'),
  };
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * 降级音乐时钟：`positionAt(time)` 以开局 0 秒为基准推导小节/拍/段落。
 *
 * 与 `src/audio/engine.ts` 的时钟区别：不依赖 AudioContext，段落按 `time` 落在
 * `data.segments` 的区间上取，因此可以独立驱动 store 的段落推进。
 */
export function createFallbackClock(data: DataRegistry): MusicClock {
  const bpm = data.beatGrid.bpm > 0 ? data.beatGrid.bpm : 128;
  const beatsPerBar = Math.max(1, Math.floor(data.beatGrid.beatsPerBar));
  const barsPerPhrase = Math.max(1, Math.floor(data.beatGrid.barsPerPhrase));
  const beatSec = 60 / bpm;
  const barSec = beatSec * beatsPerBar;
  const originMs = typeof performance !== 'undefined' ? performance.now() : 0;
  const segments = data.segments;

  const segmentAt = (time: Seconds): { id: (typeof segments)[number]['id']; startSec: Seconds; endSec: Seconds } => {
    for (const segment of segments) {
      if (time >= segment.startSec && time < segment.endSec) {
        return { id: segment.id, startSec: segment.startSec, endSec: segment.endSec };
      }
    }
    const first = segments[0];
    const last = segments[segments.length - 1];
    if (time < (first?.startSec ?? 0)) {
      return {
        id: first?.id ?? 'overture',
        startSec: first?.startSec ?? 0,
        endSec: first?.endSec ?? barSec * 4,
      };
    }
    return {
      id: last?.id ?? 'finale',
      startSec: last?.startSec ?? 0,
      endSec: last?.endSec ?? barSec * 4,
    };
  };

  return {
    bpm,
    now(): Seconds {
      return typeof performance !== 'undefined' ? (performance.now() - originMs) / 1000 : 0;
    },
    positionAt(time: Seconds): MusicalPosition {
      const elapsed = Math.max(0, time);
      const bar = Math.floor(elapsed / barSec);
      const inBar = elapsed - bar * barSec;
      const beat = Math.floor(inBar / beatSec);
      const beatPhase = clamp01(inBar / beatSec - beat);
      const phraseBeat = (bar % barsPerPhrase) * beatsPerBar + beat;
      const segment = segmentAt(elapsed);
      const span = Math.max(0.001, segment.endSec - segment.startSec);
      return {
        bar,
        beat,
        beatPhase,
        phraseBeat,
        segment: segment.id,
        segmentProgress: clamp01((elapsed - segment.startSec) / span),
        bpm,
      };
    },
    tickAt(time: Seconds): BeatTick {
      const elapsed = Math.max(0, time);
      const index = Math.floor(elapsed / beatSec);
      const bar = Math.floor(index / beatsPerBar);
      const beat = index % beatsPerBar;
      return {
        index,
        time: index * beatSec,
        bar,
        beat,
        phrase: Math.floor(bar / barsPerPhrase),
        isBarStart: beat === 0,
        strength: beat % 2 === 0 ? 'strong' : 'weak',
      };
    },
    isRunning(): boolean {
      return true;
    },
  };
}
