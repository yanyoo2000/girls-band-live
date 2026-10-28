/**
 * 启动参数与降级时钟（tech-spec §5.7 / §6.4；集成层，tech-director 所有）。
 *
 * - `createBootContext(search)` 解析 `?dev / ?seed / ?quality / ?scene / ?run` 并探测 WebGL2；
 * - `createFallbackClock(data)` 是音频未就绪时的时钟；**玩法时间语义与 engine 时钟同源**，
 *   两者都复用 `src/data/music-clock.ts` 的 `createRunMusicClock`，段落不再由两套逻辑各自推进。
 *
 * 注意：本文件不得 import react/three；只做纯计算与探测。
 */
import type { MusicClock, Seconds } from '../types/game';
import type { DataRegistry } from '../types/data';
import type { QualityLevel } from '../types/save';
import type { DevFlags } from '../types/ui';
import { createRunMusicClock } from '../data/music-clock';
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

/**
 * 降级音乐时钟：音频未就绪（无 AudioContext / 尚未解锁）时仍能驱动 store。
 *
 * `positionAt(time)` 的 `time` 是**本局已演唱秒数**（run.time），段落按 `data.segments`
 * 推导；与 `audio/engine` 的时钟共用 `createRunMusicClock`，因此两者切换不会卡段落。
 */
export function createFallbackClock(data: DataRegistry): MusicClock {
  const runClock = createRunMusicClock(data);
  const originMs = typeof performance !== 'undefined' ? performance.now() : 0;
  return {
    bpm: runClock.bpm,
    now(): Seconds {
      return typeof performance !== 'undefined' ? (performance.now() - originMs) / 1000 : 0;
    },
    positionAt(time) {
      return runClock.positionAt(time);
    },
    tickAt(time) {
      return runClock.tickAt(time);
    },
    isRunning(): boolean {
      return true;
    },
  };
}
