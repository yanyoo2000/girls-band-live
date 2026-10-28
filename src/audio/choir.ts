/**
 * 12 声部观众合唱池：4 区 × 3 层（近 / 中 / 远），每声部 1 osc + 1 gain + 1 panner。
 *
 * 依据：docs/tech-spec.md §13.1、docs/gdd.md §17.1。
 * - 节点预算：12 × 3 = 36，加呼吸链 3、总线 4（含存在感提升），共 43（≤44）。
 * - 人数驱动的是“厚度”（逐层加入 + 总线补偿），不是单纯变响。
 */

import type { ChordKey, DataRegistry } from '../types/data';
import type { ChoirZoneMix, HeatLevel, ZoneId } from '../types/game';
import { chordVoices } from './music';

/** 四区固定顺序（与 ZoneId 定义一致）。 */
const ZONES: readonly ZoneId[] = ['front-left', 'front-right', 'back-left', 'back-right'];
/** 每区 3 层：近 / 中 / 远。 */
const LAYERS_PER_ZONE = 3;
/** 每层的人数上限（区容量 192 / 3）。 */
const SEATS_PER_LAYER = 64;
/** 层增益修剪（远层更轻）。 */
const LAYER_TRIM: readonly number[] = [1, 0.85, 0.7];
/** 层声像偏移（以区中心为 0，向两侧扇形展开）。 */
const LAYER_PAN: readonly number[] = [-0.35, 0, 0.35];
/** 单声部基础增益：常规 C 局（总人气 30–61）也要可闻（原 0.22 实测 −30~−45dB）。 */
export const CHOIR_VOICE_GAIN = 0.38;
/** 合唱存在感提升：1.4kHz +3dB，从 lead/arp 的 1–2kHz 里让出一块。 */
const PRESENCE_FREQ = 1400;
const PRESENCE_GAIN_DB = 3;

/**
 * 单声部目标增益（纯函数，供混音与测试共用）。
 *
 * 四档总人气 30/61/128/256（每区 7.5/15.25/32/64）对应约
 * −17.7 / −14.7 / −11.4 / −8.4 dB；逐层加入 + 总线 −3dB 补偿保持不变。
 */
export function choirVoiceGain(audience: number, layer: number, zoneGain: number): number {
  const layerAudience = Math.max(0, Math.min(SEATS_PER_LAYER, audience - layer * SEATS_PER_LAYER));
  const level = Math.sqrt(layerAudience / SEATS_PER_LAYER) * CHOIR_VOICE_GAIN;
  const trim = LAYER_TRIM[layer] ?? 0.7;
  const clampedZone = Math.max(0, Math.min(1, zoneGain));
  return Math.max(0, Math.min(1, clampedZone * level * trim));
}

/** 合唱池公开句柄（与 tech-spec §5.5 一致）。 */
export interface ChoirPool {
  setMix(mix: Readonly<Record<ZoneId, ChoirZoneMix>>): void;
  setSilenced(silenced: boolean): void;
  readonly bus: GainNode;
  dispose(): void;
}

/** 内部状态：12 个声部的节点与当前和弦。 */
interface ChoirState {
  readonly ctx: BaseAudioContext;
  readonly voices: {
    readonly zone: ZoneId;
    readonly layer: number;
    readonly osc: OscillatorNode;
    readonly gain: GainNode;
    readonly panner: StereoPannerNode;
  }[];
  readonly sum: GainNode;
  readonly bus: GainNode;
  readonly breath: AudioBufferSourceNode;
  readonly nodes: AudioNode[];
}

const STATES = new WeakMap<ChoirPool, ChoirState>();

/** 确定性噪声 buffer（呼吸底噪）。 */
function createBreathBuffer(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * 2));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let state = 0x1b0b_1e55;
  for (let i = 0; i < length; i += 1) {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    data[i] = (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  }
  return buffer;
}

/** MIDI → 频率。 */
function mtof(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** 人声 “aah” 的谐波表（基频 + 2..8 次谐波，幅度递减）。 */
function createAahWave(ctx: BaseAudioContext): PeriodicWave {
  const real = new Float32Array(9);
  const imag = new Float32Array(9);
  const harmonics = [0, 1, 0.5, 0.3, 0.18, 0.1, 0.06, 0.035, 0.02];
  for (let i = 0; i < imag.length; i += 1) imag[i] = harmonics[i] ?? 0;
  return ctx.createPeriodicWave(real, imag);
}

/**
 * 创建 12 声部固定合唱池。
 *
 * @param ctx 实时或离线上下文
 * @param data 数据注册表（读取区数与每区层数；缺失时回退 4 × 3）
 */
export function createChoirPool(ctx: BaseAudioContext, data: DataRegistry): ChoirPool {
  const zoneCount = Math.max(1, Math.min(4, data.audio.choirZones || ZONES.length));
  const layerCount = Math.max(1, Math.min(3, data.audio.choirLayersPerZone || LAYERS_PER_ZONE));
  const wave = createAahWave(ctx);
  const sum = ctx.createGain();
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.knee.value = 8;
  compressor.ratio.value = 2.5;
  compressor.attack.value = 0.02;
  compressor.release.value = 0.3;
  const bus = ctx.createGain();
  bus.gain.value = 1;

  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = PRESENCE_FREQ;
  presence.Q.value = 1.2;
  presence.gain.value = PRESENCE_GAIN_DB;
  sum.connect(presence);
  presence.connect(compressor);
  compressor.connect(bus);

  const nodes: AudioNode[] = [sum, presence, compressor, bus];
  const voices: ChoirState['voices'] = [];
  const now = ctx.currentTime;

  for (let zoneIndex = 0; zoneIndex < zoneCount; zoneIndex += 1) {
    const zone = ZONES[zoneIndex];
    if (!zone) continue;
    for (let layer = 0; layer < layerCount; layer += 1) {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(wave);
      osc.frequency.value = mtof(69);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const panner = ctx.createStereoPanner();
      panner.pan.value = LAYER_PAN[layer] ?? 0;
      osc.connect(gain);
      gain.connect(panner);
      panner.connect(sum);
      nodes.push(osc, gain, panner);
      try {
        osc.start(now);
      } catch {
        // 离线上下文在 startRendering 前 start 是合法的；重复 start 才抛错。
      }
      voices.push({ zone, layer, osc, gain, panner });
    }
  }

  // 呼吸底噪：一条共享噪声链，让合唱“像人”而不是纯正弦。
  const breath = ctx.createBufferSource();
  breath.buffer = createBreathBuffer(ctx);
  breath.loop = true;
  const breathFilter = ctx.createBiquadFilter();
  breathFilter.type = 'bandpass';
  breathFilter.frequency.value = 620;
  breathFilter.Q.value = 0.55;
  const breathGain = ctx.createGain();
  breathGain.gain.value = 0.018;
  breath.connect(breathFilter);
  breathFilter.connect(breathGain);
  breathGain.connect(sum);
  nodes.push(breath, breathFilter, breathGain);
  try {
    breath.start(now);
  } catch {
    // 同上。
  }

  const state: ChoirState = {
    ctx,
    voices,
    sum,
    bus,
    breath,
    nodes
  };

  const pool: ChoirPool = {
    setMix(mix): void {
      const at = ctx.currentTime;
      const effectiveLayerCount = Math.min(layerCount, LAYERS_PER_ZONE);
      let totalAudience = 0;
      for (const zone of ZONES) {
        const zoneMix = mix[zone];
        if (zoneMix) totalAudience += Math.max(0, zoneMix.audience);
      }
      // 逐层加入：0–64 近层、64–128 中层、128–192 远层。
      // 总线补偿：每多一层 −3dB，保证“变厚”而不是“变响”。
      const activeLayers = Math.max(1, Math.min(effectiveLayerCount, 1 + Math.floor(totalAudience / SEATS_PER_LAYER)));
      const compensation = Math.pow(0.707, activeLayers - 1);
      state.sum.gain.setTargetAtTime(compensation, at, 0.08);

      for (const voice of state.voices) {
        const zoneMix = mix[voice.zone];
        if (!zoneMix) continue;
        const audience = Math.max(0, zoneMix.audience);
        const target = choirVoiceGain(audience, voice.layer, zoneMix.gain);
        voice.gain.gain.setTargetAtTime(target, at, 0.08);
        const pan = Math.max(-1, Math.min(1, zoneMix.pan + (LAYER_PAN[voice.layer] ?? 0)));
        voice.panner.pan.setTargetAtTime(pan, at, 0.08);
        const heat: HeatLevel = zoneMix.heat;
        const detune = (heat / 4) * 15 * (voice.layer === 0 ? -1 : 1);
        voice.osc.detune.setTargetAtTime(detune, at, 0.08);
      }
    },

    setSilenced(silenced): void {
      const at = ctx.currentTime;
      bus.gain.cancelScheduledValues(at);
      if (silenced) {
        bus.gain.setValueAtTime(Math.max(0, bus.gain.value), at);
        bus.gain.linearRampToValueAtTime(0, at + 0.03);
      } else {
        bus.gain.setValueAtTime(0, at);
        bus.gain.linearRampToValueAtTime(1, at + 0.03);
      }
    },

    get bus(): GainNode {
      return state.bus;
    },

    dispose(): void {
      for (const voice of state.voices) {
        try {
          voice.osc.stop();
        } catch {
          // 已经停止。
        }
      }
      try {
        state.breath.stop();
      } catch {
        // 已经停止。
      }
      for (const node of state.nodes) {
        try {
          node.disconnect();
        } catch {
          // 重复 disconnect。
        }
      }
      state.nodes.length = 0;
      state.voices.length = 0;
    }
  };

  STATES.set(pool, state);
  return pool;
}

/**
 * 设置合唱当前和弦（engine 每 4 拍调用一次）。
 *
 * 不是技术方案 §5.5 的签名：`ChoirPool.setMix` 只带人数/热度/声像，音高需要另一个入口。
 */
export function setChoirChord(pool: ChoirPool, chord: ChordKey): void {
  const state = STATES.get(pool);
  if (!state) return;
  const voices = chordVoices(chord);
  const at = state.ctx.currentTime;
  for (const voice of state.voices) {
    const zoneIndex = ZONES.indexOf(voice.zone);
    const midi = (voices[zoneIndex] ?? voices[0]) + 12;
    // 近层高八度，远层低八度：同一和弦在三个高度上铺开。
    const octave = voice.layer === 0 ? 12 : voice.layer === 1 ? 0 : -12;
    voice.osc.frequency.setTargetAtTime(mtof(midi + octave), at, 0.06);
  }
}

/** 测试/验收用的声部数量与呼吸底噪增益（不改变公开契约）。 */
export function choirVoiceCount(data: DataRegistry): number {
  const zones = Math.max(1, Math.min(4, data.audio.choirZones || ZONES.length));
  const layers = Math.max(1, Math.min(3, data.audio.choirLayersPerZone || LAYERS_PER_ZONE));
  return zones * layers;
}

/** 供测试读取当前总线增益（0 表示静默段）。 */
export function readChoirBusGain(pool: ChoirPool): number {
  return STATES.get(pool)?.bus.gain.value ?? 0;
}
