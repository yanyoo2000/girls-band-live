/**
 * 玩法音乐时钟（单一权威实现；被 `platform/bootstrap` 的降级时钟与 `audio/engine` 的
 * 音频时钟共同复用）。
 *
 * 语义（与 store 的用法一致）：
 * - `time` 是**本局已演唱秒数**（run.time，0 起），不是 AudioContext 的绝对时间；
 * - 小节/拍由 BPM 与拍网格推导；段落由 `time` 落在 `data.segments` 的区间上取；
 * - 不访问 AudioContext / performance / DOM，可单测。
 *
 * 这样 store 只需要一个时钟对象，engine 与 fallback 不再各推一套段落。
 */
import type { BeatTick, MusicalPosition, Seconds } from '../types/game';
import type { DataRegistry } from '../types/data';

/** 玩法时钟的最小接口（engine 再补 `now()` / `isRunning()`）。 */
export interface RunMusicClock {
  readonly bpm: number;
  positionAt(time: Seconds): MusicalPosition;
  tickAt(time: Seconds): BeatTick;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** 由数据表创建玩法时钟（纯函数，无宿主依赖）。 */
export function createRunMusicClock(data: DataRegistry): RunMusicClock {
  const bpm = data.beatGrid.bpm > 0 ? data.beatGrid.bpm : 128;
  const beatsPerBar = Math.max(1, Math.floor(data.beatGrid.beatsPerBar));
  const barsPerPhrase = Math.max(1, Math.floor(data.beatGrid.barsPerPhrase));
  const beatSec = 60 / bpm;
  const barSec = beatSec * beatsPerBar;
  const segments = data.segments;

  const segmentAt = (time: Seconds): {
    id: (typeof segments)[number]['id'];
    startSec: Seconds;
    endSec: Seconds;
  } => {
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
  };
}
