/**
 * 5 层乐队编曲：段落 → 层增益、小节和弦、以及全部程序化音色。
 *
 * 依据：docs/tech-spec.md §5.5 / §13.3、docs/gdd.md §17.1。
 * - 只 import 类型；不访问 DOM、不加载外部音频。
 * - 所有音色由振荡器 / 噪声 / 滤波器合成；鼓点带写死的 groove 偏移与力度表。
 */

import type { ChordKey, DataRegistry, SegmentDef } from '../types/data';
import type { LayerId, Ratio, Seconds, SegmentId } from '../types/game';

/** 乐队层（合唱与房间底噪不在这 5 层里）。 */
export type BandLayerId = Extract<LayerId, 'drums' | 'bass' | 'chords' | 'lead' | 'arp'>;

/** 5 层固定顺序（与 GDD 一致）。 */
export const BAND_LAYERS: readonly BandLayerId[] = ['drums', 'bass', 'chords', 'lead', 'arp'];

/** 层基础增益（音频工程参数，不是玩法数值）。 */
const BASE_GAIN: Readonly<Record<BandLayerId, number>> = {
  drums: 1,
  bass: 0.9,
  chords: 0.85,
  lead: 0.8,
  arp: 0.7
};

/** 数据层缺段时的兜底编曲（GDD §17.1：序曲 2 → 主歌 4 → 副歌 5 → 终曲 5）。 */
const FALLBACK_SEGMENT_LAYERS: Readonly<Record<SegmentId, readonly BandLayerId[]>> = {
  overture: ['drums', 'bass'],
  verse: ['drums', 'bass', 'chords', 'lead'],
  chorus: ['drums', 'bass', 'chords', 'lead', 'arp'],
  bridge: ['drums', 'bass'],
  finale: ['drums', 'bass', 'chords', 'lead', 'arp']
};

/** 和弦 → 四区声部音高（MIDI，低八度；第 4 音是该和弦的七音）。 */
const CHORD_VOICES: Readonly<Record<ChordKey, readonly [number, number, number, number]>> = {
  am: [57, 60, 64, 67],
  f: [53, 57, 60, 64],
  c: [55, 60, 64, 67],
  g: [55, 59, 62, 65],
  dm: [50, 53, 57, 60],
  e: [52, 56, 59, 62],
  am7: [57, 60, 64, 67],
  fmaj7: [53, 57, 60, 64],
  cmaj7: [55, 60, 64, 71],
  g7: [55, 59, 62, 65]
};

/** 第 4 小节（bar % 4 === 3）把三和弦升级为七和弦。 */
const SEVENTH_OF: Readonly<Partial<Record<ChordKey, ChordKey>>> = {
  am: 'am7',
  f: 'fmaj7',
  c: 'cmaj7',
  g: 'g7'
};

/** 取某和弦的四个声部音高（低八度）。 */
export function chordVoices(chord: ChordKey): readonly [number, number, number, number] {
  return CHORD_VOICES[chord] ?? CHORD_VOICES.am;
}

/** 段落 → 各层目标增益（0..1），未列出的层为 0。 */
export interface MusicLayers {
  layers(segment: SegmentId): ReadonlyMap<LayerId, number>;
}

/** 运行时绑定：`attachMusicNodes` 之后 setMusicSegment 才能逐层设增益。 */
interface LayerBinding {
  readonly nodes: Map<LayerId, GainNode>;
}

const BINDINGS = new WeakMap<MusicLayers, LayerBinding>();

/** 找到段落定义（找不到返回 undefined）。 */
function findSegment(data: DataRegistry, segment: SegmentId): SegmentDef | undefined {
  return data.segments.find((candidate) => candidate.id === segment);
}

/**
 * 创建“段落 → 层增益”映射。
 *
 * 优先使用 `data.segments[].layers`；数据缺失时回退到 GDD §17.1 的编曲。
 */
export function createMusicLayers(data: DataRegistry): MusicLayers {
  const layers = (segment: SegmentId): ReadonlyMap<LayerId, number> => {
    const def = findSegment(data, segment);
    const enabled = new Set<LayerId>(def ? def.layers : FALLBACK_SEGMENT_LAYERS[segment]);
    const result = new Map<LayerId, number>();
    for (const layer of BAND_LAYERS) {
      result.set(layer, enabled.has(layer) ? (BASE_GAIN[layer] ?? 0) : 0);
    }
    return result;
  };
  const musicLayers: MusicLayers = { layers };
  BINDINGS.set(musicLayers, { nodes: new Map<LayerId, GainNode>() });
  return musicLayers;
}

/**
 * 把 engine 创建的 5 个层增益节点绑定到 MusicLayers。
 *
 * 不是技术方案 §5.5 的签名；因为 `setMusicSegment` 只拿到 `bus`，逐层设增益需要
 * 运行时绑定。engine 在构建音频图后立即调用一次。
 */
export function attachMusicNodes(layers: MusicLayers, nodes: ReadonlyMap<LayerId, GainNode>): void {
  const binding = BINDINGS.get(layers);
  if (!binding) return;
  binding.nodes.clear();
  for (const [layer, node] of nodes) binding.nodes.set(layer, node);
}

/**
 * 段落切换：对 5 层增益做 `setTargetAtTime(…, 0.12)`，不重建节点。
 *
 * `bus` 是段落总线（段落包络），不承载用户音量；用户音量在 engine 的 musicBus 上。
 */
export function setMusicSegment(
  segment: SegmentId,
  layers: MusicLayers,
  ctx: BaseAudioContext,
  bus: GainNode
): void {
  const targets = layers.layers(segment);
  const binding = BINDINGS.get(layers);
  const now = ctx.currentTime;
  if (binding) {
    for (const layer of BAND_LAYERS) {
      const node = binding.nodes.get(layer);
      if (node) node.gain.setTargetAtTime(targets.get(layer) ?? 0, now, 0.12);
    }
  }
  // 段落总线保持 1；用 0.12s 平滑避免段落切换时的瞬时跳变。
  bus.gain.setTargetAtTime(1, now, 0.12);
}

/** 小节 → 段内和弦序号；`bar` 为全局小节号。 */
export function chordAtBar(bar: number, segment: SegmentId, data: DataRegistry): ChordKey {
  const def = findSegment(data, segment);
  const chords = def && def.chords.length > 0 ? def.chords : (['am', 'f', 'c', 'g'] as const);
  const bpm = data.beatGrid.bpm > 0 ? data.beatGrid.bpm : data.audio.bpm;
  const beatsPerBar = data.beatGrid.beatsPerBar > 0 ? data.beatGrid.beatsPerBar : 4;
  const barSec = (60 / bpm) * beatsPerBar;
  const startBar = def ? Math.floor(def.startSec / barSec) : 0;
  const relative = bar - startBar;
  const length = chords.length;
  const index = ((relative % length) + length) % length;
  const base = chords[index] ?? chords[0] ?? 'am';
  if (bar % 4 === 3) {
    const seventh = SEVENTH_OF[base];
    if (seventh) return seventh;
  }
  return base;
}

/* ==========================================================================
 * 音色合成
 * ========================================================================== */

/** 节点跟踪器：engine 注入；释放函数必须幂等。 */
export interface AudioNodeTracker {
  track(nodes: readonly AudioNode[], sources: readonly AudioScheduledSourceNode[]): () => void;
}

/** 合成器选项。 */
export interface BandSynthOptions {
  /** 混响发送输入（Music 的 reverbSend）。 */
  readonly send: AudioNode;
  readonly tracker: AudioNodeTracker;
  /** kick 触发时的侧链回调（engine 用来压贝斯总线）。 */
  readonly onKick?: (when: Seconds) => void;
}

/** 一段音乐合成器的公开句柄。 */
export interface BandSynth {
  /** 调度一个 16 分步；`enabled` 为当前段实际发声的乐队层。 */
  playStep(
    step: number,
    when: Seconds,
    bar: number,
    segment: SegmentId,
    chord: ChordKey,
    intensity: Ratio,
    enabled: ReadonlySet<BandLayerId>
  ): void;
  /** 点燃 / 落光重音（与当前和弦同音）。 */
  accent(when: Seconds, chord: ChordKey, strength: Ratio): void;
  dispose(): void;
}

/** 16 分步的固定 groove 偏移（毫秒），修复“像鼓机”。 */
const GROOVE_OFFSET_MS: readonly number[] = [0, 3, -4, 6, -2, 4, -3, 5, 0, -5, 3, -2, 4, -4, 2, 0];
/** 16 分步的固定力度差（dB）。 */
const GROOVE_ACCENT_DB: readonly number[] = [0, -2, 1, -1, 0, -2, 1, -2, 0, -1, 1, -2, 0, -2, 1, -1];

const P_KICK: readonly number[] = [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0];
const P_SNARE: readonly number[] = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
const P_HAT: readonly number[] = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
const P_SHAKER: readonly number[] = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1];
const BASS_BASIC: readonly number[] = [0, 2, 4, 6, 8, 10, 12, 14];
const BASS_CHORUS: readonly number[] = [0, 2, 3, 4, 6, 8, 10, 11, 12, 14, 15];
const MELODY_STEPS: readonly number[] = [0, 6, 8, 12, 14];

/** MIDI → 频率。 */
function mtof(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** dB → 线性增益。 */
function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** 确定性噪声 buffer（2 秒，循环用）。 */
function createNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * 2));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let state = 0x51ce_1a3b;
  for (let i = 0; i < length; i += 1) {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    data[i] = value * 2 - 1;
  }
  return buffer;
}

/**
 * 创建 5 层乐队合成器。
 *
 * 与 60 秒切片同源：kick 正弦下扫、方波/锯齿贝斯、双 saw pad + off-beat stab、
 * 双 saw 主旋律、三角琶音；新增 8 分 shaker 与七和弦。
 */
export function createBandSynth(
  ctx: BaseAudioContext,
  buses: ReadonlyMap<LayerId, GainNode>,
  data: DataRegistry,
  options: BandSynthOptions
): BandSynth {
  const noise = createNoiseBuffer(ctx);
  const tracker = options.tracker;
  const send = options.send;
  const bpm = data.beatGrid.bpm > 0 ? data.beatGrid.bpm : data.audio.bpm;
  const beatSec = 60 / Math.max(1, bpm);
  const stepSec = beatSec / 4;

  /** 取层总线；缺失时返回 null（不崩）。 */
  function busOf(layer: BandLayerId): GainNode | null {
    return buses.get(layer) ?? null;
  }

  /** 注册一个声音的全部节点，source 结束后释放。 */
  function own(nodes: readonly AudioNode[], sources: readonly AudioScheduledSourceNode[]): void {
    const release = tracker.track(nodes, sources);
    for (const source of sources) source.onended = release;
  }

  function noiseBurst(
    when: Seconds,
    duration: Seconds,
    bus: GainNode,
    type: BiquadFilterType,
    frequency: number,
    q: number,
    peak: number,
    sendAmount = 0
  ): void {
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(peak, when + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    if (sendAmount > 0) {
      const sendGain = ctx.createGain();
      sendGain.gain.value = sendAmount;
      gain.connect(sendGain);
      sendGain.connect(send);
      own([source, filter, gain, sendGain], [source]);
    } else {
      own([source, filter, gain], [source]);
    }
    source.start(when);
    source.stop(when + duration + 0.02);
  }

  function kick(when: Seconds, velocity: number): void {
    const bus = busOf('drums');
    if (!bus) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(158, when);
    osc.frequency.exponentialRampToValueAtTime(44, when + 0.11);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(0.6 * velocity, when + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.42);
    osc.connect(gain);
    gain.connect(bus);
    own([osc, gain], [osc]);
    osc.start(when);
    osc.stop(when + 0.45);
    noiseBurst(when, 0.012, bus, 'highpass', 1900, 0.7, 0.13 * velocity);
    options.onKick?.(when);
  }

  function snare(when: Seconds, velocity: number): void {
    const bus = busOf('drums');
    if (!bus) return;
    noiseBurst(when, 0.17, bus, 'bandpass', 1900, 0.75, 0.3 * velocity, 0.12);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(186, when);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(0.16 * velocity, when + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.09);
    osc.connect(gain);
    gain.connect(bus);
    own([osc, gain], [osc]);
    osc.start(when);
    osc.stop(when + 0.11);
  }

  function hat(when: Seconds, velocity: number, open: boolean): void {
    const bus = busOf('drums');
    if (!bus) return;
    noiseBurst(when, open ? 0.22 : 0.035, bus, 'highpass', 8200, 0.7, (open ? 0.06 : 0.1) * velocity);
  }

  function shaker(when: Seconds, velocity: number): void {
    const bus = busOf('drums');
    if (!bus) return;
    noiseBurst(when, 0.06, bus, 'highpass', 6400, 0.9, 0.05 * velocity);
  }

  function crash(when: Seconds, velocity: number): void {
    const bus = busOf('drums');
    if (!bus) return;
    noiseBurst(when, 1.3, bus, 'highpass', 4800, 0.7, 0.1 * velocity, 0.3);
  }

  function bassNote(when: Seconds, midi: number, duration: Seconds, velocity: number): void {
    const bus = busOf('bass');
    if (!bus) return;
    const frequency = mtof(midi);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = frequency;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(620, when);
    filter.frequency.exponentialRampToValueAtTime(300, when + Math.max(0.08, duration * 0.9));
    filter.Q.value = 3;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(0.25 * velocity, when + 0.008);
    gain.gain.linearRampToValueAtTime(0.18 * velocity, when + 0.07);
    gain.gain.setValueAtTime(0.18 * velocity, when + Math.max(0.08, duration - 0.05));
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration + 0.09);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    own([osc, filter, gain], [osc]);
    osc.start(when);
    osc.stop(when + duration + 0.12);
  }

  function padChord(when: Seconds, voices: readonly number[], duration: Seconds, velocity: number): void {
    const bus = busOf('chords');
    if (!bus) return;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1500;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(0.28 * velocity, when + 0.16);
    gain.gain.setValueAtTime(0.28 * velocity, when + Math.max(0.2, duration * 0.82));
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration + 0.26);
    filter.connect(gain);
    gain.connect(bus);
    const sendGain = ctx.createGain();
    sendGain.gain.value = 0.34;
    gain.connect(sendGain);
    sendGain.connect(send);
    const nodes: AudioNode[] = [filter, gain, sendGain];
    const sources: AudioScheduledSourceNode[] = [];
    for (const voice of voices) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = mtof(voice);
      osc.detune.value = voice === voices[0] ? -7 : 7;
      osc.connect(filter);
      nodes.push(osc);
      sources.push(osc);
      osc.start(when);
      osc.stop(when + duration + 0.32);
    }
    own(nodes, sources);
  }

  function stab(when: Seconds, voices: readonly number[], velocity: number): void {
    const bus = busOf('chords');
    if (!bus) return;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2700;
    filter.Q.value = 1.1;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(0.115 * velocity, when + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.19);
    filter.connect(gain);
    gain.connect(bus);
    const sendGain = ctx.createGain();
    sendGain.gain.value = 0.24;
    gain.connect(sendGain);
    sendGain.connect(send);
    const nodes: AudioNode[] = [filter, gain, sendGain];
    const sources: AudioScheduledSourceNode[] = [];
    for (const voice of voices) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = mtof(voice + 12);
      osc.connect(filter);
      nodes.push(osc);
      sources.push(osc);
      osc.start(when);
      osc.stop(when + 0.21);
    }
    own(nodes, sources);
  }

  function leadNote(when: Seconds, midi: number, duration: Seconds, velocity: number): void {
    const bus = busOf('lead');
    if (!bus) return;
    const frequency = mtof(midi);
    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = frequency;
    const oscB = ctx.createOscillator();
    oscB.type = 'sawtooth';
    oscB.frequency.value = frequency;
    oscB.detune.value = 7;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(5200, when);
    filter.frequency.exponentialRampToValueAtTime(1900, when + Math.max(0.1, duration * 0.85));
    filter.Q.value = 1.1;
    const gain = ctx.createGain();
    const peak = 0.18 * velocity;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(peak, when + 0.014);
    gain.gain.linearRampToValueAtTime(peak * 0.78, when + 0.12);
    gain.gain.setValueAtTime(peak * 0.78, when + Math.max(0.14, duration - 0.06));
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration + 0.2);
    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    const sendGain = ctx.createGain();
    sendGain.gain.value = 0.2;
    gain.connect(sendGain);
    sendGain.connect(send);
    own([oscA, oscB, filter, gain, sendGain], [oscA, oscB]);
    oscA.start(when);
    oscB.start(when);
    oscA.stop(when + duration + 0.24);
    oscB.stop(when + duration + 0.24);
  }

  function arpNote(when: Seconds, midi: number, velocity: number, pan: number): void {
    const bus = busOf('arp');
    if (!bus) return;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = mtof(midi);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 5200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(0.16 * velocity, when + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(bus);
    const sendGain = ctx.createGain();
    sendGain.gain.value = 0.32;
    gain.connect(sendGain);
    sendGain.connect(send);
    own([osc, filter, gain, panner, sendGain], [osc]);
    osc.start(when);
    osc.stop(when + 0.16);
  }

  /** 段落强度：序曲 0.55 / 主歌 0.8 / 副歌 1 / 桥段 0.4 / 终曲 1.1。 */
  function intensityOf(segment: SegmentId): number {
    switch (segment) {
      case 'overture':
        return 0.55;
      case 'verse':
        return 0.8;
      case 'chorus':
        return 1;
      case 'bridge':
        return 0.4;
      case 'finale':
        return 1.1;
      default:
        return 0.8;
    }
  }

  return {
    playStep(step, when, bar, segment, chord, intensity, enabled): void {
      const strength = clamp01(intensity) * intensityOf(segment);
      const offset = (GROOVE_OFFSET_MS[step] ?? 0) / 1000;
      const at = when + offset;
      const accent = dbToGain(GROOVE_ACCENT_DB[step] ?? 0);
      const voices = chordVoices(chord);
      const full = segment === 'chorus' || segment === 'finale';

      if (enabled.has('drums')) {
        if ((P_KICK[step] ?? 0) === 1) kick(at, strength * accent);
        if ((P_SNARE[step] ?? 0) === 1) snare(at, strength * accent);
        if ((P_HAT[step] ?? 0) === 1) hat(at, strength * 0.9, false);
        if (full && step % 2 === 1) hat(at, strength * 0.55, false);
        if (full && (P_SHAKER[step] ?? 0) === 1) shaker(at, strength * 0.8);
        if (step === 14 && bar % 4 === 3) hat(at, strength * 0.7, true);
        if (step === 0 && bar % 8 === 0) crash(at, strength);
      }

      if (enabled.has('bass')) {
        const pattern = full ? BASS_CHORUS : BASS_BASIC;
        if (pattern.includes(step)) {
          const root = voices[0];
          let midi = root;
          if (step === 6 || step === 14) midi = root + 12;
          if (step === 15) midi = root + 7;
          const duration = (step === 15 ? 0.55 : 0.92) * stepSec;
          bassNote(at, midi, duration, strength);
        }
      }

      if (enabled.has('chords')) {
        if (step === 0) {
          padChord(when, [voices[0], voices[1], voices[2]], (60 / bpm) * 4 * 0.94, strength);
        }
        if (step === 6 || step === 14 || (full && step === 11)) {
          stab(at, [voices[0], voices[1], voices[2]], strength);
        }
      }

      if (enabled.has('lead') && stepSec > 0) {
        const melodyIndex = MELODY_STEPS.indexOf(step);
        if (melodyIndex >= 0) {
          const octave = full ? 12 : 0;
          const voiceOrder = [voices[0], voices[1], voices[2], voices[1], voices[0]];
          const midi = (voiceOrder[melodyIndex] ?? voices[0]) + 12 + octave;
          const duration = (step === 0 ? 6 : 2) * stepSec;
          leadNote(at, midi, duration, strength);
        }
      }

      if (enabled.has('arp') && step % 2 === 0) {
        const index = (step / 2) % 3;
        const midi = (voices[index] ?? voices[0]) + 24;
        arpNote(at, midi, strength * 0.9, step % 4 === 0 ? -0.35 : 0.35);
      }
    },

    accent(when, chord, strength): void {
      const voices = chordVoices(chord);
      kick(when, 0.95 * clamp01(strength));
      crash(when, 0.14 * clamp01(strength));
      stab(when, [voices[0], voices[1], voices[2]], 1.6 * clamp01(strength));
      const bus = busOf('bass');
      if (bus) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(110, when);
        osc.frequency.exponentialRampToValueAtTime(36, when + 0.55);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.linearRampToValueAtTime(0.34 * clamp01(strength), when + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.7);
        osc.connect(gain);
        gain.connect(bus);
        own([osc, gain], [osc]);
        osc.start(when);
        osc.stop(when + 0.72);
      }
    },

    dispose(): void {
      // 一次性音源由 engine 的 tracker 统一 stop；这里不再持有状态。
    }
  };
}
