/**
 * 12 个关键 SFX：全部由振荡器 / 噪声 / 滤波器合成，按 minInterval + maxConcurrent 节流。
 *
 * 依据：docs/gdd.md §17.2、docs/tech-spec.md §5.5。
 * - 不加载外部音频，不使用音频标签。
 * - 与 60 秒切片同源：短包络 + 噪声 + 滑音；不做长采样。
 */

import type { IgniteQuality, SfxId } from '../types/game';

/** SFX 银行句柄（与 tech-spec §5.5 的结构一致）。 */
export interface SfxBank {
  play(id: SfxId, variant: IgniteQuality | null): void;
  dispose(): void;
}

/** 单个 SFX 的节流参数。 */
interface SfxLimit {
  readonly minInterval: number;
  readonly maxConcurrent: number;
}

/** 12 个 SFX 的节流表（数值写死，避免同帧叠加爆音）。 */
const LIMITS: Readonly<Record<SfxId, SfxLimit>> = {
  'convert-chime': { minInterval: 0.08, maxConcurrent: 2 },
  'ignite-hit': { minInterval: 0.05, maxConcurrent: 3 },
  'burn-hiss': { minInterval: 0.2, maxConcurrent: 1 },
  'choir-pulse': { minInterval: 0.25, maxConcurrent: 2 },
  'return-lock': { minInterval: 1.5, maxConcurrent: 1 },
  'line-snap': { minInterval: 0.12, maxConcurrent: 2 },
  'crowd-wave': { minInterval: 4, maxConcurrent: 1 },
  'silence-toggle': { minInterval: 1.5, maxConcurrent: 1 },
  encore: { minInterval: 2, maxConcurrent: 1 },
  'drop-light': { minInterval: 2, maxConcurrent: 1 },
  fail: { minInterval: 1, maxConcurrent: 1 },
  ui: { minInterval: 0.03, maxConcurrent: 4 }
};

/** 内部状态：活跃节点、每个 SFX 的上次播放时间与并发计数。 */
interface SfxState {
  readonly ctx: BaseAudioContext;
  readonly output: AudioNode;
  readonly noise: AudioBuffer;
  readonly activeNodes: Set<AudioNode>;
  readonly activeSources: Set<AudioScheduledSourceNode>;
  readonly activeCount: Map<SfxId, number>;
  readonly lastAt: Map<SfxId, number>;
  disposed: boolean;
}

const STATES = new WeakMap<SfxBank, SfxState>();

/** MIDI → 频率。 */
function mtof(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** 确定性噪声 buffer。 */
function createNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * 1.5));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let state = 0x2f6e_2b1d;
  for (let i = 0; i < length; i += 1) {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    data[i] = (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  }
  return buffer;
}

/**
 * 创建 12 个 SFX 的合成银行。
 *
 * @param ctx 实时或离线上下文
 * @param output 汇总输出（engine 的 sfxBus；不经过静默总线）
 */
export function createSfxBank(ctx: BaseAudioContext, output: AudioNode): SfxBank {
  const state: SfxState = {
    ctx,
    output,
    noise: createNoiseBuffer(ctx),
    activeNodes: new Set<AudioNode>(),
    activeSources: new Set<AudioScheduledSourceNode>(),
    activeCount: new Map<SfxId, number>(),
    lastAt: new Map<SfxId, number>(),
    disposed: false
  };

  /** 注册一个声音；任一音源结束时释放全部节点（幂等）。 */
  function own(id: SfxId, nodes: readonly AudioNode[], sources: readonly AudioScheduledSourceNode[]): void {
    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      for (const node of nodes) {
        state.activeNodes.delete(node);
        try {
          node.disconnect();
        } catch {
          // 已断开。
        }
      }
      for (const source of sources) state.activeSources.delete(source);
      const current = state.activeCount.get(id) ?? 1;
      state.activeCount.set(id, Math.max(0, current - 1));
    };
    for (const node of nodes) state.activeNodes.add(node);
    for (const source of sources) {
      state.activeSources.add(source);
      source.onended = release;
    }
  }

  /** 短正弦/三角音，带线性 attack 与指数 release。 */
  function tone(
    when: number,
    frequency: number,
    duration: number,
    peak: number,
    type: OscillatorType,
    detune = 0,
    sweepTo: number | null = null
  ): { readonly osc: OscillatorNode; readonly gain: GainNode } {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, frequency), when);
    if (sweepTo !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), when + duration);
    }
    osc.detune.value = detune;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(peak, when + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(gain);
    gain.connect(output);
    osc.start(when);
    osc.stop(when + duration + 0.02);
    return { osc, gain };
  }

  /** 一段噪声：类型 + 频率 + 包络。 */
  function noise(
    when: number,
    duration: number,
    type: BiquadFilterType,
    frequency: number,
    peak: number,
    sweepTo: number | null = null
  ): { readonly source: AudioBufferSourceNode; readonly filter: BiquadFilterNode; readonly gain: GainNode } {
    const source = ctx.createBufferSource();
    source.buffer = state.noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, when);
    if (sweepTo !== null) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), when + duration);
    }
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(peak, when + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(output);
    source.start(when);
    source.stop(when + duration + 0.02);
    return { source, filter, gain };
  }

  /** 转化铃：4 个音，音高按档位变化。 */
  function convertChime(when: number, variant: IgniteQuality | null): void {
    const shift = variant === 'perfect' ? 0 : variant === 'good' ? -2 : -5;
    const notes = [72, 76, 79, 84].map((note) => note + shift);
    const nodes: AudioNode[] = [];
    const sources: AudioScheduledSourceNode[] = [];
    for (let i = 0; i < notes.length; i += 1) {
      const voice = tone(when + i * 0.045, mtof(notes[i] ?? 72), 0.5, 0.08, 'triangle');
      nodes.push(voice.osc, voice.gain);
      sources.push(voice.osc);
    }
    own('convert-chime', nodes, sources);
  }

  /** 点燃：完美 = 双音 + click；良好 = 单音；错拍 = 低闷音。 */
  function igniteHit(when: number, variant: IgniteQuality | null): void {
    const perfect = variant === 'perfect';
    const good = variant === 'good';
    const root = perfect ? 84 : good ? 79 : 65;
    const nodes: AudioNode[] = [];
    const sources: AudioScheduledSourceNode[] = [];
    const main = tone(when, mtof(root), perfect ? 0.3 : 0.18, perfect ? 0.16 : 0.11, 'triangle', 0, mtof(root) * 0.75);
    nodes.push(main.osc, main.gain);
    sources.push(main.osc);
    if (perfect) {
      const fifth = tone(when, mtof(root + 7), 0.22, 0.09, 'sine');
      nodes.push(fifth.osc, fifth.gain);
      sources.push(fifth.osc);
    }
    if (!perfect) {
      const click = noise(when, 0.04, 'highpass', 2400, good ? 0.06 : 0.1);
      nodes.push(click.source, click.filter, click.gain);
      sources.push(click.source);
    }
    own('ignite-hit', nodes, sources);
  }

  /** 烧穿嘶声：噪声 + 低通下扫。 */
  function burnHiss(when: number): void {
    const hiss = noise(when, 1.2, 'lowpass', 4200, 0.13, 320);
    own('burn-hiss', [hiss.source, hiss.filter, hiss.gain], [hiss.source]);
  }

  /** 合唱波：与和弦同音（A3/C4/E4），短促。 */
  function choirPulse(when: number): void {
    const notes = [57, 60, 64];
    const nodes: AudioNode[] = [];
    const sources: AudioScheduledSourceNode[] = [];
    for (const note of notes) {
      const voice = tone(when, mtof(note + 12), 0.22, 0.06, 'sine');
      nodes.push(voice.osc, voice.gain);
      sources.push(voice.osc);
    }
    own('choir-pulse', nodes, sources);
  }

  /** 返听锁定：低频自激 + 耳鸣。 */
  function returnLock(when: number): void {
    const low = tone(when, 62, 1.4, 0.16, 'sine', 0, 74);
    const ring = tone(when + 0.08, 3200, 0.9, 0.03, 'sine');
    own(
      'return-lock',
      [low.osc, low.gain, ring.osc, ring.gain],
      [low.osc, ring.osc]
    );
  }

  /** 断线/插线：短 click + 低频 thud。 */
  function lineSnap(when: number): void {
    const click = noise(when, 0.035, 'highpass', 1800, 0.16);
    const thud = tone(when, 90, 0.14, 0.12, 'sine', 0, 60);
    own(
      'line-snap',
      [click.source, click.filter, click.gain, thud.osc, thud.gain],
      [click.source, thud.osc]
    );
  }

  /** 人浪：5 秒渐强掌声噪声 + 低频涌动。 */
  function crowdWave(when: number): void {
    const applause = noise(when, 5, 'bandpass', 1200, 0.16, 1900);
    const rumble = tone(when, 110, 5, 0.04, 'sine', 0, 140);
    own(
      'crowd-wave',
      [applause.source, applause.filter, applause.gain, rumble.osc, rumble.gain],
      [applause.source, rumble.osc]
    );
  }

  /** 静默切换：数字零 + 两次心跳。 */
  function silenceToggle(when: number): void {
    const first = tone(when + 0.18, 54, 0.16, 0.2, 'sine', 0, 40);
    const second = tone(when + 0.62, 54, 0.16, 0.16, 'sine', 0, 40);
    own(
      'silence-toggle',
      [first.osc, first.gain, second.osc, second.gain],
      [first.osc, second.osc]
    );
  }

  /** 安可：观众呼喊 + 和声回升。 */
  function encore(when: number): void {
    const shout = noise(when, 1.6, 'bandpass', 800, 0.12, 1400);
    const nodes: AudioNode[] = [shout.source, shout.filter, shout.gain];
    const sources: AudioScheduledSourceNode[] = [shout.source];
    for (const note of [57, 64, 69]) {
      const voice = tone(when + 0.1, mtof(note), 1.8, 0.05, 'sine');
      nodes.push(voice.osc, voice.gain);
      sources.push(voice.osc);
    }
    own('encore', nodes, sources);
  }

  /** 放下光：麦克风回授 + 长尾。 */
  function dropLight(when: number): void {
    const feedback = tone(when, 780, 1.8, 0.1, 'sine', 0, 820);
    const harmonic = tone(when + 0.05, 1560, 1.6, 0.05, 'sine', 0, 1640);
    const tail = noise(when + 0.2, 1.4, 'bandpass', 2000, 0.05, 900);
    own(
      'drop-light',
      [feedback.osc, feedback.gain, harmonic.osc, harmonic.gain, tail.source, tail.filter, tail.gain],
      [feedback.osc, harmonic.osc, tail.source]
    );
  }

  /** 失败：低频下坠 + 椅子声。 */
  function fail(when: number): void {
    const fall = tone(when, 140, 1.2, 0.18, 'sine', 0, 35);
    const chair = noise(when + 0.05, 0.18, 'bandpass', 700, 0.07, 500);
    own(
      'fail',
      [fall.osc, fall.gain, chair.source, chair.filter, chair.gain],
      [fall.osc, chair.source]
    );
  }

  /** UI：短促木鱼/拨弦。 */
  function ui(when: number): void {
    const click = tone(when, 1200, 0.045, 0.06, 'triangle', 0, 900);
    own('ui', [click.osc, click.gain], [click.osc]);
  }

  const recipes: Readonly<Record<SfxId, (when: number, variant: IgniteQuality | null) => void>> = {
    'convert-chime': convertChime,
    'ignite-hit': igniteHit,
    'burn-hiss': (when): void => burnHiss(when),
    'choir-pulse': (when): void => choirPulse(when),
    'return-lock': (when): void => returnLock(when),
    'line-snap': (when): void => lineSnap(when),
    'crowd-wave': (when): void => crowdWave(when),
    'silence-toggle': (when): void => silenceToggle(when),
    encore: (when): void => encore(when),
    'drop-light': (when): void => dropLight(when),
    fail: (when): void => fail(when),
    ui: (when): void => ui(when)
  };

  const bank: SfxBank = {
    play(id, variant): void {
      if (state.disposed) return;
      const limit = LIMITS[id];
      const now = ctx.currentTime;
      const last = state.lastAt.get(id) ?? -Infinity;
      if (now - last < limit.minInterval) return;
      const active = state.activeCount.get(id) ?? 0;
      if (active >= limit.maxConcurrent) return;
      state.lastAt.set(id, now);
      state.activeCount.set(id, active + 1);
      const recipe = recipes[id];
      try {
        recipe(now, variant);
      } catch {
        // 合成失败不能拖垮游戏：回退为静默，并把并发计数还回去。
        state.activeCount.set(id, Math.max(0, (state.activeCount.get(id) ?? 1) - 1));
      }
    },

    dispose(): void {
      state.disposed = true;
      for (const source of state.activeSources) {
        try {
          source.stop();
        } catch {
          // 已停止。
        }
      }
      for (const node of state.activeNodes) {
        try {
          node.disconnect();
        } catch {
          // 已断开。
        }
      }
      state.activeNodes.clear();
      state.activeSources.clear();
      state.activeCount.clear();
      state.lastAt.clear();
    }
  };

  STATES.set(bank, state);
  return bank;
}

/**
 * 当前仍存活的 SFX 节点数（供 AudioEngine.nodeCount 汇总）。
 *
 * 不是技术方案 §5.5 的签名：`createSfxBank` 只返回 play/dispose，节点计数需要旁路读取。
 */
export function readSfxActiveNodes(bank: SfxBank): number {
  return STATES.get(bank)?.activeNodes.size ?? 0;
}
