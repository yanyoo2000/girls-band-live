/**
 * 音频测试替身：最小 WebAudio 实现，只覆盖 `src/audio/**` 用到的 API。
 *
 * 用途：在 Node/Vitest 中构造并启动 `AudioEngine`，验证静默目标、duck、音量与销毁。
 * 不模拟采样精度；`AudioParam` 的 ramp 立即落到目标值，便于断言“目标增益”。
 */

/** 共享的假音频时钟（秒），测试可手动设置。 */
let fakeNow = 0;

/** 设置假时钟当前时间（秒）。 */
export function setFakeNow(seconds: number): void {
  fakeNow = Math.max(0, seconds);
}

/** 读取假时钟当前时间（秒）。 */
export function readFakeNow(): number {
  return fakeNow;
}

/** 最小 AudioParam：记录值并立即应用 ramp。 */
class FakeParam {
  value: number;
  constructor(value: number) {
    this.value = value;
  }
  setValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
  exponentialRampToValueAtTime(value: number): this {
    this.value = Math.max(0.0001, value);
    return this;
  }
  setTargetAtTime(value: number): this {
    this.value = value;
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
}

/** 最小音频节点：只维护连接关系。 */
class FakeNode {
  readonly outputs: FakeNode[] = [];
  connected = false;
  connect<T extends FakeNode>(destination: T): T {
    this.connected = true;
    this.outputs.push(destination);
    return destination;
  }
  disconnect(): void {
    this.outputs.length = 0;
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);
}

class FakeBiquad extends FakeNode {
  type = 'lowpass';
  readonly frequency = new FakeParam(350);
  readonly Q = new FakeParam(1);
  readonly gain = new FakeParam(0);
}

class FakeCompressor extends FakeNode {
  readonly threshold = new FakeParam(-24);
  readonly knee = new FakeParam(30);
  readonly ratio = new FakeParam(12);
  readonly attack = new FakeParam(0.003);
  readonly release = new FakeParam(0.25);
}

class FakeShaper extends FakeNode {
  curve: Float32Array | null = null;
  oversample = 'none';
}

class FakeConvolver extends FakeNode {
  buffer: FakeAudioBuffer | null = null;
  normalize = true;
}

class FakeDelay extends FakeNode {
  readonly delayTime = new FakeParam(0);
}

class FakePanner extends FakeNode {
  readonly pan = new FakeParam(0);
}

class FakeOsc extends FakeNode {
  type = 'sine';
  readonly frequency = new FakeParam(440);
  readonly detune = new FakeParam(0);
  onended: (() => void) | null = null;
  private stopped = false;
  setPeriodicWave(): void {
    // 不需要波形内容。
  }
  start(): void {
    // 立即开始。
  }
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.onended?.();
  }
}

class FakeBufferSource extends FakeNode {
  buffer: FakeAudioBuffer | null = null;
  loop = false;
  onended: (() => void) | null = null;
  private stopped = false;
  start(): void {
    // 立即开始。
  }
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.onended?.();
  }
}

/** 最小 AudioBuffer。 */
class FakeAudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly duration: number;
  private readonly data: Float32Array[];
  constructor(channels: number, length: number, sampleRate: number) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.data = [];
    for (let i = 0; i < channels; i += 1) this.data.push(new Float32Array(length));
  }
  getChannelData(channel: number): Float32Array {
    return this.data[channel] ?? this.data[0] ?? new Float32Array(this.length);
  }
}

/** 最小 AudioContext。 */
export class FakeAudioContext {
  readonly sampleRate = 44100;
  state: 'running' | 'suspended' | 'closed' = 'running';
  readonly destination = new FakeGain();
  closed = false;
  get currentTime(): number {
    return fakeNow;
  }
  createGain(): FakeGain {
    return new FakeGain();
  }
  createBiquadFilter(): FakeBiquad {
    return new FakeBiquad();
  }
  createDynamicsCompressor(): FakeCompressor {
    return new FakeCompressor();
  }
  createWaveShaper(): FakeShaper {
    return new FakeShaper();
  }
  createConvolver(): FakeConvolver {
    return new FakeConvolver();
  }
  createDelay(): FakeDelay {
    return new FakeDelay();
  }
  createStereoPanner(): FakePanner {
    return new FakePanner();
  }
  createOscillator(): FakeOsc {
    return new FakeOsc();
  }
  createBufferSource(): FakeBufferSource {
    return new FakeBufferSource();
  }
  createBuffer(channels: number, length: number, sampleRate: number): FakeAudioBuffer {
    return new FakeAudioBuffer(channels, length, sampleRate);
  }
  createPeriodicWave(): object {
    return {};
  }
  async resume(): Promise<void> {
    this.state = 'running';
  }
  async suspend(): Promise<void> {
    this.state = 'suspended';
  }
  async close(): Promise<void> {
    this.state = 'closed';
    this.closed = true;
  }
}

/**
 * 安装假 `AudioContext`（并重置假时钟到 0）。
 *
 * @returns 恢复原全局的清理函数
 */
export function installFakeAudio(): () => void {
  const hadAudio = 'AudioContext' in globalThis;
  const previous = (globalThis as unknown as { AudioContext?: unknown }).AudioContext;
  (globalThis as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  setFakeNow(0);
  return (): void => {
    if (hadAudio) {
      (globalThis as unknown as { AudioContext?: unknown }).AudioContext = previous;
    } else {
      delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext;
    }
  };
}
