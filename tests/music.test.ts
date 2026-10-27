/**
 * tech-spec §11 #18：5 层编曲与和弦。
 *
 * 必测：5 层段落掩码、段落切换目标增益、每第 4 小节七和弦。
 */
import { describe, expect, it } from 'vitest';
import { buildDataRegistry } from '../src/data';
import {
  BAND_LAYERS,
  attachMusicNodes,
  chordAtBar,
  chordVoices,
  createMusicLayers,
  setMusicSegment,
} from '../src/audio/music';
import { SECONDS_PER_BAR } from '../src/data/segments';
import type { LayerId, SegmentId } from '../src/types/game';

const data = buildDataRegistry();

describe('BAND_LAYERS', () => {
  it('应固定 5 层且顺序稳定', () => {
    expect(BAND_LAYERS).toEqual(['drums', 'bass', 'chords', 'lead', 'arp']);
    expect(new Set(BAND_LAYERS).size).toBe(5);
  });
});

describe('createMusicLayers / 段落掩码', () => {
  it('应按数据层给序曲 2 层、主歌 4 层、副歌 5 层', () => {
    const layers = createMusicLayers(data);
    const overture = layers.layers('overture');
    expect(overture.get('drums')).toBeGreaterThan(0);
    expect(overture.get('bass')).toBeGreaterThan(0);
    expect(overture.get('chords')).toBe(0);
    expect(overture.get('lead')).toBe(0);
    expect(overture.get('arp')).toBe(0);

    const verse = layers.layers('verse');
    expect(verse.get('chords')).toBeGreaterThan(0);
    expect(verse.get('lead')).toBeGreaterThan(0);
    expect(verse.get('arp')).toBe(0);

    const chorus = layers.layers('chorus');
    for (const layer of BAND_LAYERS) {
      expect(chorus.get(layer)).toBeGreaterThan(0);
    }
  });

  it('应让桥段抽走主旋律与琶音', () => {
    const bridge = createMusicLayers(data).layers('bridge');
    expect(bridge.get('lead')).toBe(0);
    expect(bridge.get('arp')).toBe(0);
    expect(bridge.get('drums')).toBeGreaterThan(0);
  });

  it('应对未知段落回退到 GDD 兜底编曲，不抛错', () => {
    const layers = createMusicLayers(data).layers('unknown' as SegmentId);
    expect(layers.size).toBe(BAND_LAYERS.length);
  });
});

describe('setMusicSegment', () => {
  it('应对 5 层设目标增益并把段落总线设为 1', () => {
    const layers = createMusicLayers(data);
    const calls: { time: number; target: number }[] = [];
    const nodes = new Map<LayerId, { gain: { setTargetAtTime: (v: number, t: number) => void } }>();
    for (const layer of BAND_LAYERS) {
      nodes.set(layer, {
        gain: { setTargetAtTime: (target: number, time: number) => calls.push({ target, time }) },
      });
    }
    // 只测 setMusicSegment 的“读目标 + 平滑写入”行为；节点用最小桩替代真实 GainNode。
    attachMusicNodes(layers, nodes as unknown as ReadonlyMap<LayerId, GainNode>);

    const busCalls: number[] = [];
    const ctx = { currentTime: 12.5 } as unknown as BaseAudioContext;
    const bus = { gain: { setTargetAtTime: (v: number) => busCalls.push(v) } } as unknown as GainNode;
    setMusicSegment('chorus', layers, ctx, bus);

    expect(calls).toHaveLength(5);
    // 副歌 5 层全开：每个目标 > 0；总线恒 1。
    for (const call of calls) expect(call.target).toBeGreaterThan(0);
    expect(busCalls).toEqual([1]);
  });

  it('应在没有 attach 节点时只设置总线（不抛错）', () => {
    const layers = createMusicLayers(data);
    const busCalls: number[] = [];
    const ctx = { currentTime: 0 } as unknown as BaseAudioContext;
    const bus = { gain: { setTargetAtTime: (v: number) => busCalls.push(v) } } as unknown as GainNode;
    expect(() => setMusicSegment('overture', layers, ctx, bus)).not.toThrow();
    expect(busCalls).toEqual([1]);
  });
});

describe('chordAtBar', () => {
  it('应按段落和弦表循环取和弦（主歌从 48 小节开始）', () => {
    const startBar = Math.floor(90 / SECONDS_PER_BAR);
    expect(startBar).toBe(48);
    expect(chordAtBar(48, 'verse', data)).toBe('f');
    expect(chordAtBar(49, 'verse', data)).toBe('g');
    expect(chordAtBar(50, 'verse', data)).toBe('am');
    expect(chordAtBar(52, 'verse', data)).toBe('f');
  });

  it('应把每第 4 小节的三和弦升级为七和弦', () => {
    // 终曲从 245 小节开始；247 % 4 === 3，且该位是 C → Cmaj7。
    const finaleStartBar = Math.floor(460 / SECONDS_PER_BAR);
    expect(finaleStartBar).toBe(245);
    expect(chordAtBar(247, 'finale', data)).toBe('cmaj7');
    // 序曲第 3 小节是该循环里的 g7（本身就是七和弦）。
    expect(chordAtBar(3, 'overture', data)).toBe('g7');
  });

  it('应对负小节号也能安全取模', () => {
    const chord = chordAtBar(-1, 'verse', data);
    expect(chord.length).toBeGreaterThan(0);
  });

  it('应让四个声部音高从低到高排列且互不相同', () => {
    for (const chord of ['am', 'f', 'c', 'g7', 'cmaj7'] as const) {
      const voices = chordVoices(chord);
      expect(voices).toHaveLength(4);
      for (let i = 1; i < voices.length; i += 1) {
        expect(voices[i] ?? 0).toBeGreaterThan(voices[i - 1] ?? 0);
      }
    }
  });
});
