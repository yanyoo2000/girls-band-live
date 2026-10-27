/**
 * 音频引擎：首次手势创建 AudioContext、5 层乐队 + 12 声部合唱 + 程序化混响 + 12 SFX。
 *
 * 依据：docs/tech-spec.md §5.5 / §13、docs/gdd.md §17、docs/agent-handbook.md §3.8。
 * - 只 import 类型与同目录模块；不 import react/three/game 实现；不直接访问 DOM。
 * - 页面隐藏/失焦由集成层调用 `setAudioHostHidden`；音量由 `applyAudioMix` 注入。
 * - 所有节点由 tracker 计数，`nodeCount()` 含长期节点、音乐活跃节点、合唱池与 SFX 活跃节点。
 */

import type { DataRegistry } from '../types/data';
import type {
  AudioPort,
  ChoirZoneMix,
  IgniteQuality,
  LayerId,
  MusicClock,
  Ratio,
  Seconds,
  SegmentId,
  SfxId,
  ZoneId
} from '../types/game';
import type { SettingsV1 } from '../types/save';
import { choirVoiceCount, createChoirPool, readChoirBusGain, setChoirChord } from './choir';
import type { ChoirPool } from './choir';
import { createFallbackReverb, renderImpulseResponse } from './ir';
import type { FallbackReverb } from './ir';
import {
  BAND_LAYERS,
  attachMusicNodes,
  chordAtBar,
  createBandSynth,
  createMusicLayers,
  setMusicSegment
} from './music';
import type { AudioNodeTracker, BandLayerId, BandSynth, MusicLayers } from './music';
import { createSfxBank, readSfxActiveNodes } from './sfx';
import type { SfxBank } from './sfx';

/** 音频引擎公开句柄（与 tech-spec §5.5 一致）。 */
export interface AudioEngine extends AudioPort {
  /** 当前仍存活的 WebAudio 节点数（长期 + 音乐活跃 + 合唱池 + SFX 活跃）。 */
  nodeCount(): number;
  /** 当前绝对拍号（视觉节拍的唯一来源）。 */
  beatIndex(): number;
  dispose(): void;
}

/** 用户音量设置（来自 SettingsV1 的三个 0..1 字段）。 */
export type AudioMixSettings = Pick<SettingsV1, 'master' | 'music' | 'sfx'>;

/** 默认音量（GDD §18 存档默认值）。 */
const DEFAULT_MIX: AudioMixSettings = { master: 0.8, music: 0.7, sfx: 0.8 };

/** 失焦/隐藏时的总音量衰减（不是 0；保留拍点连续性）。 */
const HIDDEN_DUCK = 0.12;
/** 静默段/恢复的淡入淡出时间。 */
const SILENCE_FADE = 0.03;
/** 调度前瞻（秒）与 tick 间隔（毫秒）。 */
const LOOKAHEAD = 0.18;
const TICK_MS = 25;
/** 合唱池固定节点数：12 声部 × 3 + 求和/压缩/总线 3 + 呼吸链 3。 */
const CHOIR_FIXED_NODES = 6;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** 节点跟踪器实现：长期节点 + 一次性音源；释放幂等。 */
interface Tracker extends AudioNodeTracker {
  add(nodes: readonly AudioNode[]): void;
  size(): number;
  stopAll(): void;
  dispose(): void;
}

function createTracker(): Tracker {
  const nodes = new Set<AudioNode>();
  const sources = new Set<AudioScheduledSourceNode>();
  return {
    track(trackedNodes, trackedSources): () => void {
      for (const node of trackedNodes) nodes.add(node);
      for (const source of trackedSources) sources.add(source);
      let released = false;
      return (): void => {
        if (released) return;
        released = true;
        for (const node of trackedNodes) nodes.delete(node);
        for (const source of trackedSources) sources.delete(source);
      };
    },
    add(trackedNodes): void {
      for (const node of trackedNodes) nodes.add(node);
    },
    size(): number {
      return nodes.size;
    },
    stopAll(): void {
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          // 已经停止的源。
        }
      }
    },
    dispose(): void {
      this.stopAll();
      nodes.clear();
      sources.clear();
    }
  };
}

/** 音频图（只在 start 后存在）。 */
interface AudioGraph {
  readonly ctx: AudioContext;
  readonly layers: Map<LayerId, GainNode>;
  readonly bassDuck: GainNode;
  readonly segmentBus: GainNode;
  readonly musicBus: GainNode;
  readonly choirUserGain: GainNode;
  readonly silenceGain: GainNode;
  readonly sfxBus: GainNode;
  readonly masterMix: GainNode;
  readonly compressor: DynamicsCompressorNode;
  readonly highShelf: BiquadFilterNode;
  readonly masterGain: GainNode;
  readonly shaper: WaveShaperNode;
  readonly reverbSend: GainNode;
  readonly reverbWet: GainNode;
  readonly reverb: ConvolverNode | null;
  readonly fallback: FallbackReverb | null;
  readonly roomSource: AudioBufferSourceNode;
  readonly roomGain: GainNode;
  readonly choir: ChoirPool;
  readonly sfx: SfxBank;
  readonly synth: BandSynth;
  readonly tracker: Tracker;
  readonly nodes: readonly AudioNode[];
}

/** 内部可变状态。 */
interface EngineState {
  readonly data: DataRegistry;
  ctx: AudioContext | null;
  graph: AudioGraph | null;
  started: boolean;
  disposed: boolean;
  startTime: number;
  segment: SegmentId;
  targets: ReadonlyMap<LayerId, number> | null;
  userGain: Readonly<Record<LayerId, number>>;
  mix: AudioMixSettings;
  hidden: boolean;
  silenced: boolean;
  pendingChoir: Readonly<Record<ZoneId, ChoirZoneMix>> | null;
  timer: ReturnType<typeof setInterval> | null;
  nextStepTime: number;
  stepIndex: number;
  readonly layers: MusicLayers;
  readonly tracker: Tracker;
}

/** 读档/设置变更时应用的内部 API（不进 AudioEngine 契约）。 */
interface EngineInternal {
  applyMix(mix: AudioMixSettings): void;
  setHidden(hidden: boolean): void;
  readChoirGain(): number;
  nodeCount(): number;
}

const INTERNALS = new WeakMap<AudioEngine, EngineInternal>();

/** 确定性房间底噪 buffer（3 秒）。 */
function createRoomNoise(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * 3));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let state = 0x7a11_0c0d;
  for (let i = 0; i < length; i += 1) {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    data[i] = (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  }
  return buffer;
}

/** 软削波曲线（tanh）。 */
function softClipCurve(amount: number): Float32Array<ArrayBuffer> {
  const size = 2048;
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    const x = (i * 2) / (size - 1) - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}

/** 取数据里的数值，缺失时用兜底值。 */
function pick(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** 音乐时钟：AudioContext.currentTime 是唯一时间基准。 */
function createClock(state: EngineState, data: DataRegistry): MusicClock {
  const bpm = pick(data.beatGrid.bpm, pick(data.audio.bpm, 128));
  const beatsPerBar = Math.max(1, pick(data.beatGrid.beatsPerBar, 4));
  const barsPerPhrase = Math.max(1, pick(data.beatGrid.barsPerPhrase, 8));
  const beatSec = 60 / Math.max(1, bpm);
  const barSec = beatSec * beatsPerBar;

  return {
    bpm,
    now(): Seconds {
      return state.ctx ? state.ctx.currentTime : 0;
    },
    positionAt(time): {
      bar: number;
      beat: number;
      beatPhase: number;
      phraseBeat: number;
      segment: SegmentId;
      segmentProgress: number;
      bpm: number;
    } {
      const elapsed = Math.max(0, time - state.startTime);
      const bar = Math.floor(elapsed / barSec);
      const inBar = elapsed - bar * barSec;
      const beat = Math.floor(inBar / beatSec);
      const beatPhase = Math.max(0, Math.min(1, inBar / beatSec - beat));
      const phraseBeat = (bar % barsPerPhrase) * beatsPerBar + beat;
      const segment = state.segment;
      const def = data.segments.find((candidate) => candidate.id === segment);
      const start = def ? def.startSec : 0;
      const end = def ? def.endSec : barSec * 4;
      const span = Math.max(0.001, end - start);
      const segmentProgress = clamp01((elapsed - start) / span);
      return { bar, beat, beatPhase, phraseBeat, segment, segmentProgress, bpm };
    },
    tickAt(time): {
      index: number;
      time: Seconds;
      bar: number;
      beat: number;
      phrase: number;
      isBarStart: boolean;
      strength: 'strong' | 'weak';
    } {
      const elapsed = Math.max(0, time - state.startTime);
      const index = Math.floor(elapsed / beatSec);
      const bar = Math.floor(index / beatsPerBar);
      const beat = index % beatsPerBar;
      return {
        index,
        time: state.startTime + index * beatSec,
        bar,
        beat,
        phrase: Math.floor(bar / barsPerPhrase),
        isBarStart: beat === 0,
        strength: beat % 2 === 0 ? 'strong' : 'weak'
      };
    },
    isRunning(): boolean {
      return state.ctx !== null && state.ctx.state === 'running' && state.started;
    }
  };
}

/** 构建音频图。 */
function buildGraph(state: EngineState, data: DataRegistry): AudioGraph {
  const ctx = state.ctx;
  if (!ctx) throw new Error('AudioContext 未创建');
  const tracker = state.tracker;
  const nodes: AudioNode[] = [];

  const layerGains = new Map<LayerId, GainNode>();
  for (const layer of BAND_LAYERS) {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    layerGains.set(layer, gain);
    nodes.push(gain);
  }
  const bassDuck = ctx.createGain();
  bassDuck.gain.value = 1;
  const choirUserGain = ctx.createGain();
  choirUserGain.gain.value = 1;
  const roomGain = ctx.createGain();
  roomGain.gain.value = 0.06;
  nodes.push(bassDuck, choirUserGain, roomGain);

  const segmentBus = ctx.createGain();
  segmentBus.gain.value = 1;
  const musicBus = ctx.createGain();
  musicBus.gain.value = state.mix.music;
  const silenceGain = ctx.createGain();
  silenceGain.gain.value = state.silenced ? 0 : 1;
  const sfxBus = ctx.createGain();
  sfxBus.gain.value = state.mix.sfx;
  const masterMix = ctx.createGain();
  masterMix.gain.value = 1;
  nodes.push(segmentBus, musicBus, silenceGain, sfxBus, masterMix);

  const compressor = ctx.createDynamicsCompressor();
  const compressorSpec = data.audio.compressor;
  compressor.threshold.value = pick(compressorSpec.thresholdDb, -18);
  compressor.knee.value = 10;
  compressor.ratio.value = pick(compressorSpec.ratio, 3.5);
  compressor.attack.value = pick(compressorSpec.attack, 0.004);
  compressor.release.value = pick(compressorSpec.release, 0.22);
  const highShelf = ctx.createBiquadFilter();
  highShelf.type = 'highshelf';
  highShelf.frequency.value = pick(data.audio.highShelf.frequency, 6000);
  highShelf.gain.value = pick(data.audio.highShelf.gainDb, 2.5);
  const masterGain = ctx.createGain();
  masterGain.gain.value = state.mix.master * (state.hidden ? HIDDEN_DUCK : 1);
  const shaper = ctx.createWaveShaper();
  shaper.curve = softClipCurve(1.15);
  shaper.oversample = '2x';
  nodes.push(compressor, highShelf, masterGain, shaper);

  // 5 层 → 段落总线；贝斯先经过侧链 duck；合唱与房间底噪也进音乐总线。
  for (const layer of BAND_LAYERS) {
    const gain = layerGains.get(layer);
    if (!gain) continue;
    if (layer === 'bass') {
      gain.connect(bassDuck);
      bassDuck.connect(segmentBus);
    } else {
      gain.connect(segmentBus);
    }
  }
  segmentBus.connect(musicBus);
  const choir = createChoirPool(ctx, data);
  choir.bus.connect(choirUserGain);
  choirUserGain.connect(musicBus);

  const roomFilter = ctx.createBiquadFilter();
  roomFilter.type = 'lowpass';
  roomFilter.frequency.value = 420;
  const roomSource = ctx.createBufferSource();
  roomSource.buffer = createRoomNoise(ctx);
  roomSource.loop = true;
  roomSource.connect(roomFilter);
  roomFilter.connect(roomGain);
  roomGain.connect(musicBus);
  nodes.push(roomFilter);
  try {
    roomSource.start();
  } catch {
    // 已经启动。
  }

  musicBus.connect(silenceGain);
  silenceGain.connect(masterMix);
  sfxBus.connect(masterMix);

  // 混响：Convolver 主路；失败时 FDN 降级。
  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.55;
  const reverbWet = ctx.createGain();
  reverbWet.gain.value = 0.28;
  let reverb: ConvolverNode | null = null;
  let fallback: FallbackReverb | null = null;
  const irPreset = pick(data.audio.irPresets[0], 2.4);
  try {
    const convolver = ctx.createConvolver();
    convolver.normalize = true;
    convolver.buffer = renderImpulseResponse(ctx, irPreset, 0x9e3779b9);
    reverbSend.connect(convolver);
    convolver.connect(reverbWet);
    reverb = convolver;
  } catch {
    try {
      const fdn = createFallbackReverb(ctx);
      reverbSend.connect(fdn.input);
      fdn.output.connect(reverbWet);
      fallback = fdn;
    } catch {
      reverbSend.disconnect();
    }
  }
  reverbWet.connect(masterMix);
  nodes.push(reverbSend, reverbWet);
  if (reverb) nodes.push(reverb);

  masterMix.connect(compressor);
  compressor.connect(highShelf);
  highShelf.connect(masterGain);
  masterGain.connect(shaper);
  shaper.connect(ctx.destination);

  // 侧链：kick 把贝斯总线压到 0.52，14ms 起、100ms 回。
  const duckAmount = clamp01(pick(data.audio.ducking.amount, 0.52));
  const duckAttack = Math.max(0.005, pick(data.audio.ducking.attack, 0.014));
  const duckRelease = Math.max(0.02, pick(data.audio.ducking.release, 0.1));
  const onKick = (when: number): void => {
    const gain = bassDuck.gain;
    gain.cancelScheduledValues(when);
    gain.setValueAtTime(1, when);
    gain.linearRampToValueAtTime(duckAmount, when + duckAttack);
    gain.setTargetAtTime(1, when + duckAttack + 0.02, duckRelease);
  };

  const synth = createBandSynth(ctx, layerGains, data, {
    send: reverbSend,
    tracker,
    onKick
  });
  const sfx = createSfxBank(ctx, sfxBus);

  tracker.add(nodes);
  attachMusicNodes(state.layers, layerGains);

  return {
    ctx,
    layers: layerGains,
    bassDuck,
    segmentBus,
    musicBus,
    choirUserGain,
    silenceGain,
    sfxBus,
    masterMix,
    compressor,
    highShelf,
    masterGain,
    shaper,
    reverbSend,
    reverbWet,
    reverb,
    fallback,
    roomSource,
    roomGain,
    choir,
    sfx,
    synth,
    tracker,
    nodes
  };
}

/** 当前存活节点数：tracker + 合唱池 + SFX + FDN 降级内部节点。 */
function computeNodeCount(state: EngineState): number {
  const graph = state.graph;
  if (!graph) return 0;
  const choir = choirVoiceCount(state.data) * 3 + CHOIR_FIXED_NODES;
  return state.tracker.size() + choir + readSfxActiveNodes(graph.sfx) + (graph.fallback?.nodeCount ?? 0);
}

/** 当前段的层目标增益（缓存，避免每步分配 Map）。 */
function currentTargets(state: EngineState): ReadonlyMap<LayerId, number> {
  return state.targets ?? state.layers.layers(state.segment);
}

/** 把用户层增益乘到段目标上（5 层 + 合唱 + 房间）。 */
function applyLayerGains(state: EngineState): void {
  const graph = state.graph;
  const ctx = state.ctx;
  if (!graph || !ctx) return;
  const targets = currentTargets(state);
  const at = ctx.currentTime;
  for (const layer of BAND_LAYERS) {
    const node = graph.layers.get(layer);
    if (!node) continue;
    const base = targets.get(layer) ?? 0;
    node.gain.setTargetAtTime(base * state.userGain[layer], at, 0.08);
  }
  graph.choirUserGain.gain.setTargetAtTime(state.userGain.choir, at, 0.08);
  graph.roomGain.gain.setTargetAtTime(0.06 * state.userGain.room, at, 0.08);
}

/** 应用用户音量（master / music / sfx），含失焦衰减。 */
function applyVolumes(state: EngineState): void {
  const graph = state.graph;
  const ctx = state.ctx;
  if (!graph || !ctx) return;
  const at = ctx.currentTime;
  graph.masterGain.gain.setTargetAtTime(state.mix.master * (state.hidden ? HIDDEN_DUCK : 1), at, 0.05);
  graph.musicBus.gain.setTargetAtTime(state.mix.music, at, 0.05);
  graph.sfxBus.gain.setTargetAtTime(state.mix.sfx, at, 0.05);
}

/** 应用静默段（音乐 + 合唱 + 房间底噪；SFX 保留心跳）。 */
function applySilence(state: EngineState): void {
  const graph = state.graph;
  const ctx = state.ctx;
  if (!graph || !ctx) return;
  const at = ctx.currentTime;
  const gain = graph.silenceGain.gain;
  if (!state.silenced && gain.value >= 0.999) return;
  gain.cancelScheduledValues(at);
  if (state.silenced) {
    gain.setValueAtTime(Math.max(0, gain.value), at);
    gain.linearRampToValueAtTime(0, at + SILENCE_FADE);
  } else {
    gain.setValueAtTime(0, at);
    gain.linearRampToValueAtTime(1, at + SILENCE_FADE);
  }
  graph.choir.setSilenced(state.silenced);
}

/** 绝对 16 分步号（用于落后时对齐）。 */
function stepAt(state: EngineState, clock: MusicClock, time: number): number {
  const stepSec = 60 / Math.max(1, clock.bpm) / 4;
  return Math.max(0, Math.floor((time - state.startTime) / stepSec));
}

/** 调度一个 16 分步。 */
function scheduleStep(state: EngineState, step: number, when: number): void {
  const graph = state.graph;
  if (!graph) return;
  const bar = Math.floor(step / 16);
  const sub = step % 16;
  const targets = currentTargets(state);
  const enabled = new Set<BandLayerId>();
  for (const layer of BAND_LAYERS) {
    if ((targets.get(layer) ?? 0) > 0 && state.userGain[layer] > 0) enabled.add(layer);
  }
  const chord = chordAtBar(bar, state.segment, state.data);
  graph.synth.playStep(sub, when, bar, state.segment, chord, 1, enabled);

  // 每 4 拍（1 小节）更新合唱音高与混音；不每帧建节点。
  if (sub === 0) {
    setChoirChord(graph.choir, chord);
    const mix = state.pendingChoir;
    if (mix) {
      graph.choir.setMix(mix);
      let audience = 0;
      for (const zone of Object.values(mix)) audience += Math.max(0, zone.audience);
      graph.reverbWet.gain.setTargetAtTime(0.18 + 0.24 * clamp01(audience / 768), when, 0.2);
    }
  }
}

/** 创建引擎对象（闭包持有 state）。 */
function createEngineObject(state: EngineState, clock: MusicClock): AudioEngine {
  function startTimer(): void {
    if (state.timer !== null) clearInterval(state.timer);
    state.timer = setInterval(() => {
      if (!state.ctx || !state.graph || !state.started || state.silenced) return;
      const now = state.ctx.currentTime;
      const stepSec = 60 / Math.max(1, clock.bpm) / 4;
      if (state.nextStepTime < now - 0.04) {
        state.nextStepTime = now + 0.02;
        state.stepIndex = stepAt(state, clock, now);
      }
      const horizon = now + LOOKAHEAD;
      let guard = 0;
      while (state.nextStepTime < horizon && guard < 64) {
        scheduleStep(state, state.stepIndex, state.nextStepTime);
        state.stepIndex += 1;
        state.nextStepTime += stepSec;
        guard += 1;
      }
    }, TICK_MS);
  }

  return {
    clock,

    async start(): Promise<void> {
      if (state.disposed || state.started) return;
      const Ctor = globalThis.AudioContext;
      if (!Ctor) return;
      try {
        const ctx = new Ctor({ latencyHint: 'interactive' });
        state.ctx = ctx;
        const graph = buildGraph(state, state.data);
        state.graph = graph;
        state.startTime = ctx.currentTime + 0.1;
        state.nextStepTime = state.startTime;
        state.stepIndex = 0;
        state.started = true;
        applyVolumes(state);
        setMusicSegment(state.segment, state.layers, ctx, graph.segmentBus);
        applyLayerGains(state);
        applySilence(state);
        const resumePromise = ctx.resume();
        if (resumePromise) await resumePromise;
        startTimer();
      } catch {
        // 创建失败：静默降级，game 继续。
        state.started = false;
        state.graph = null;
        state.tracker.dispose();
        if (state.timer !== null) {
          clearInterval(state.timer);
          state.timer = null;
        }
        try {
          state.ctx?.close();
        } catch {
          // 关闭失败不影响退出。
        }
        state.ctx = null;
      }
    },

    async suspend(): Promise<void> {
      if (state.ctx && state.ctx.state === 'running') await state.ctx.suspend();
    },

    async resume(): Promise<void> {
      if (!state.ctx) return;
      if (state.ctx.state === 'suspended') await state.ctx.resume();
      state.nextStepTime = state.ctx.currentTime + 0.05;
      state.stepIndex = stepAt(state, clock, state.ctx.currentTime);
    },

    setSegment(segment: SegmentId): void {
      if (state.segment === segment) return;
      state.segment = segment;
      state.targets = state.layers.layers(segment);
      if (state.ctx && state.graph) {
        setMusicSegment(segment, state.layers, state.ctx, state.graph.segmentBus);
        applyLayerGains(state);
      }
    },

    setLayerGain(layer: LayerId, gain: Ratio): void {
      const value = clamp01(gain);
      state.userGain = { ...state.userGain, [layer]: value };
      if (!state.ctx || !state.graph) return;
      const at = state.ctx.currentTime;
      if (layer === 'choir') {
        state.graph.choirUserGain.gain.setTargetAtTime(value, at, 0.08);
        return;
      }
      if (layer === 'room') {
        state.graph.roomGain.gain.setTargetAtTime(0.06 * value, at, 0.08);
        return;
      }
      const node = state.graph.layers.get(layer);
      if (!node) return;
      const base = currentTargets(state).get(layer) ?? 0;
      node.gain.setTargetAtTime(base * value, at, 0.08);
    },

    setChoir(mix: Readonly<Record<ZoneId, ChoirZoneMix>>): void {
      state.pendingChoir = mix;
      // 静默段由下一小节恢复时应用，避免在 0 总线上做无意义的调度。
    },

    setSilenced(silenced: boolean): void {
      if (state.silenced === silenced) return;
      state.silenced = silenced;
      applySilence(state);
      if (silenced) {
        state.graph?.sfx.play('silence-toggle', null);
        state.nextStepTime = state.ctx ? state.ctx.currentTime + 0.05 : 0;
      } else if (state.ctx) {
        state.nextStepTime = state.ctx.currentTime + 0.05;
        state.stepIndex = stepAt(state, clock, state.ctx.currentTime);
      }
    },

    playCue(cue: SfxId, variant: IgniteQuality | null): void {
      state.graph?.sfx.play(cue, variant);
    },

    nodeCount(): number {
      return computeNodeCount(state);
    },

    beatIndex(): number {
      if (!state.ctx || !state.started) return 0;
      const beatSec = 60 / Math.max(1, clock.bpm);
      return Math.max(0, Math.floor((state.ctx.currentTime - state.startTime) / beatSec));
    },

    dispose(): void {
      if (state.disposed) return;
      state.disposed = true;
      state.started = false;
      if (state.timer !== null) {
        clearInterval(state.timer);
        state.timer = null;
      }
      const graph = state.graph;
      if (graph) {
        state.tracker.stopAll();
        graph.sfx.dispose();
        graph.choir.dispose();
        graph.fallback?.dispose();
        try {
          graph.roomSource.stop();
        } catch {
          // 已停止。
        }
        for (const node of graph.nodes) {
          try {
            node.disconnect();
          } catch {
            // 已断开。
          }
        }
        const extra: readonly AudioNode[] = [
          graph.musicBus,
          graph.silenceGain,
          graph.masterMix,
          graph.compressor,
          graph.highShelf,
          graph.masterGain,
          graph.shaper,
          graph.reverbSend,
          graph.reverbWet,
          graph.sfxBus,
          graph.choirUserGain,
          graph.roomGain,
          graph.bassDuck,
          graph.segmentBus
        ];
        for (const node of extra) {
          try {
            node.disconnect();
          } catch {
            // 已断开。
          }
        }
        if (graph.reverb) {
          try {
            graph.reverb.disconnect();
          } catch {
            // 已断开。
          }
        }
        for (const gain of graph.layers.values()) {
          try {
            gain.disconnect();
          } catch {
            // 已断开。
          }
        }
      }
      state.tracker.dispose();
      state.graph = null;
      if (state.ctx) {
        const ctx = state.ctx;
        ctx.close().catch(() => {
          // 关闭失败不影响退出。
        });
      }
      state.ctx = null;
    }
  };
}

/**
 * 创建音频引擎（不创建 AudioContext，等待首次用户手势）。
 *
 * 无 WebAudio 环境时返回 null；game 应以静默降级继续。
 */
export async function createAudioEngine(data: DataRegistry): Promise<AudioEngine | null> {
  if (typeof globalThis.AudioContext === 'undefined') return null;

  const layers = createMusicLayers(data);
  const state: EngineState = {
    data,
    ctx: null,
    graph: null,
    started: false,
    disposed: false,
    startTime: 0,
    segment: 'overture',
    targets: layers.layers('overture'),
    userGain: {
      drums: 1,
      bass: 1,
      chords: 1,
      lead: 1,
      arp: 1,
      choir: 1,
      room: 1
    },
    mix: { ...DEFAULT_MIX },
    hidden: false,
    silenced: false,
    pendingChoir: null,
    timer: null,
    nextStepTime: 0,
    stepIndex: 0,
    layers,
    tracker: createTracker()
  };
  const clock = createClock(state, data);
  const engine = createEngineObject(state, clock);
  INTERNALS.set(engine, {
    applyMix(mix): void {
      state.mix = {
        master: clamp01(mix.master),
        music: clamp01(mix.music),
        sfx: clamp01(mix.sfx)
      };
      applyVolumes(state);
    },
    setHidden(hidden): void {
      state.hidden = hidden;
      applyVolumes(state);
    },
    readChoirGain(): number {
      return state.graph ? readChoirBusGain(state.graph.choir) : 0;
    },
    nodeCount(): number {
      return computeNodeCount(state);
    }
  });
  return engine;
}

/**
 * 应用用户音量设置（来自 SettingsV1 的 master / music / sfx）。
 *
 * 不是技术方案 §5.5 的签名：`AudioPort` 没有音量入口，但 handbook §3.8 要求
 * “静音/音量持久化 + 总 gain 可控”。集成层在启动与设置变更时调用此函数；
 * master = 0 即用户静音。
 */
export function applyAudioMix(engine: AudioEngine, mix: AudioMixSettings): void {
  INTERNALS.get(engine)?.applyMix(mix);
}

/**
 * 页面隐藏/失焦时把总音量降到 12%（不断音，保持拍点连续）。
 *
 * 不是技术方案 §5.5 的签名：audio 不直接监听 DOM，由集成层调用。
 */
export function setAudioHostHidden(engine: AudioEngine, hidden: boolean): void {
  INTERNALS.get(engine)?.setHidden(hidden);
}

/** 测试/验收辅助：当前合唱总线增益（静默段应为 0）。 */
export function readEngineChoirGain(engine: AudioEngine): number {
  return INTERNALS.get(engine)?.readChoirGain() ?? 0;
}

