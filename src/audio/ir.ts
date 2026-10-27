/**
 * 程序化混响：Convolver 主路 IR 与无 Convolver 时的 FDN 降级。
 *
 * 依据：docs/tech-spec.md §13.2、docs/gdd.md §17.1。
 * - 只用 WebAudio 与类型；不访问 DOM，不加载外部音频。
 * - IR 由确定性 RNG 生成（同一 seed 字节一致），可在 Node/浏览器外预演。
 */

import type { Seconds } from '../types/game';

/** 早期反射抽头：[延迟秒, 幅度, 左声道偏置]。 */
const EARLY_TAPS: readonly (readonly [Seconds, number, number])[] = [
  [0.008, 0.35, 1],
  [0.013, 0.3, -1],
  [0.021, 0.24, 0.6],
  [0.029, 0.19, -0.6],
  [0.041, 0.15, 0.3],
  [0.059, 0.12, -0.3]
];

/** 一阶低通系数（模拟高频吸收）。 */
const ABSORB = 0.55;

/** 归一化峰值（技术方案：0.7）。 */
const PEAK = 0.7;

/** mulberry32：32 位确定性伪随机，返回 [0,1)。 */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 渲染一段程序化混响脉冲：指数衰减噪声 + 6 个早期反射 + 一阶低通，峰值归一化到 0.7。
 *
 * @param ctx 任意 BaseAudioContext（实时或离线）
 * @param seconds 衰减到 −60dB 的时长（技术方案取 1.2 / 1.8 / 2.4）
 * @param seed 确定性种子（同一 seed 生成同一 IR）
 */
export function renderImpulseResponse(
  ctx: BaseAudioContext,
  seconds: Seconds,
  seed: number
): AudioBuffer {
  const safeSeconds = Math.max(0.1, seconds);
  const length = Math.max(1, Math.floor(ctx.sampleRate * safeSeconds));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const rngL = createRng(seed);
  const rngR = createRng((seed ^ 0x9e3779b9) >>> 0);
  const decayPerSample = 6.9 / safeSeconds;

  let peak = 0;
  for (let i = 0; i < length; i += 1) {
    const time = i / ctx.sampleRate;
    const decay = Math.exp(-time * decayPerSample);
    const sampleL = (rngL() * 2 - 1) * decay;
    const sampleR = (rngR() * 2 - 1) * decay;
    left[i] = sampleL;
    right[i] = sampleR;
    const absL = Math.abs(sampleL);
    if (absL > peak) peak = absL;
    const absR = Math.abs(sampleR);
    if (absR > peak) peak = absR;
  }

  // 早期反射：左右不同延迟与幅度，避免单声道化的“糊”。
  for (const tap of EARLY_TAPS) {
    const [delay, amplitude, bias] = tap;
    const offset = Math.floor(delay * ctx.sampleRate);
    if (offset >= length) continue;
    const index = offset + Math.floor((1 - bias) * 2);
    if (index < length) {
      left[index] = (left[index] ?? 0) + amplitude * (1 - bias * 0.2);
      right[index] = (right[index] ?? 0) + amplitude * (1 + bias * 0.2);
    }
  }

  // 一阶低通：吸收高频，让尾巴更像房间而不是白噪。
  let lowL = 0;
  let lowR = 0;
  for (let i = 0; i < length; i += 1) {
    lowL = ABSORB * (left[i] ?? 0) + (1 - ABSORB) * lowL;
    lowR = ABSORB * (right[i] ?? 0) + (1 - ABSORB) * lowR;
    left[i] = lowL;
    right[i] = lowR;
  }

  // 归一化（不是软削波；保留脉冲形状）。
  const scale = peak > 1e-6 ? PEAK / peak : 0;
  for (let i = 0; i < length; i += 1) {
    left[i] = (left[i] ?? 0) * scale;
    right[i] = (right[i] ?? 0) * scale;
  }
  return buffer;
}

/** FDN 降级混响的返回句柄。 */
export interface FallbackReverb {
  readonly input: AudioNode;
  readonly output: AudioNode;
  /** 内部节点数（engine 的 nodeCount 汇总用）。 */
  readonly nodeCount: number;
  dispose(): void;
}

/** 4 个 comb 的延迟（互质，避免周期性“金属声”）。 */
const COMB_DELAYS: readonly Seconds[] = [0.0297, 0.0371, 0.0411, 0.0437];
/** 2 个 allpass 的延迟与系数。 */
const ALLPASS_DELAYS: readonly Seconds[] = [0.005, 0.0017];
const ALLPASS_GAIN = 0.5;

/**
 * 无 Convolver 或 CPU 超预算时的 FDN 降级（4 comb + 2 allpass）。
 *
 * 听感更“房间”、成本约 0.3ms；输入输出均为 AudioNode，可直接替换 Convolver 链路。
 */
export function createFallbackReverb(ctx: BaseAudioContext): FallbackReverb {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const nodes: AudioNode[] = [input, output];

  const merger = ctx.createGain();
  merger.gain.value = 0.25;
  nodes.push(merger);
  merger.connect(output);

  for (let i = 0; i < COMB_DELAYS.length; i += 1) {
    const delay = ctx.createDelay(0.2);
    delay.delayTime.value = COMB_DELAYS[i] ?? 0.03;
    const feedback = ctx.createGain();
    feedback.gain.value = i % 2 === 0 ? 0.7 : 0.62;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2600;
    input.connect(delay);
    delay.connect(damp);
    damp.connect(feedback);
    feedback.connect(delay);
    delay.connect(merger);
    nodes.push(delay, feedback, damp);
  }

  // 2 级 allpass：Y = -g*X + X[n-D] + g*Y[n-D]（差分方程），用前馈/反馈近似。
  let stageInput: AudioNode = merger;
  for (let i = 0; i < ALLPASS_DELAYS.length; i += 1) {
    const delay = ctx.createDelay(0.05);
    delay.delayTime.value = ALLPASS_DELAYS[i] ?? 0.005;
    const feedForward = ctx.createGain();
    feedForward.gain.value = -ALLPASS_GAIN;
    const feedBack = ctx.createGain();
    feedBack.gain.value = ALLPASS_GAIN;
    const sum = ctx.createGain();
    stageInput.connect(delay);
    delay.connect(feedBack);
    feedBack.connect(delay);
    stageInput.connect(feedForward);
    feedForward.connect(sum);
    delay.connect(sum);
    nodes.push(delay, feedForward, feedBack, sum);
    stageInput = sum;
  }
  stageInput.connect(output);

  return {
    input,
    output,
    nodeCount: nodes.length,
    dispose(): void {
      for (const node of nodes) {
        try {
          node.disconnect();
        } catch {
          // 重复 disconnect 是安全的，但某些实现会抛错。
        }
      }
      nodes.length = 0;
    }
  };
}
