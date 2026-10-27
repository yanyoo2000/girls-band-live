/**
 * 数据完整性（t96 补充；对应 GDD 锁定数量与 tech-spec §7.1）。
 *
 * 不只测 `validateData()` 返回空，还把「GDD §4 锁定的数量」逐项写成断言，
 * 让数据表被改动时第一时间失败，而不是等到 M6 人测。
 */
import { describe, expect, it } from 'vitest';
import { buildDataRegistry, validateData } from '../src/data';
import { isSeventhChord } from '../src/data/chords';
import { chordVoices } from '../src/audio/music';

const data = buildDataRegistry();

describe('validateData', () => {
  it('应对完整数据返回 0 个问题', () => {
    expect(validateData(data)).toEqual([]);
  });
});

describe('角色与瞬间', () => {
  it('应有 4 名成员、恰好 1 名可操作', () => {
    expect(data.characters).toHaveLength(4);
    expect(data.characters.filter((character) => character.playable)).toHaveLength(1);
    expect(new Set(data.characters.map((character) => character.id)).size).toBe(4);
  });

  it('应有 4 个角色瞬间且 id 唯一、与成员一一对应', () => {
    expect(data.moments).toHaveLength(4);
    expect(new Set(data.moments.map((moment) => moment.id)).size).toBe(4);
    const members = new Set(data.characters.map((character) => character.id));
    for (const moment of data.moments) {
      expect(members.has(moment.member)).toBe(true);
    }
    expect(new Set(data.moments.map((moment) => moment.member)).size).toBe(4);
  });
});

describe('光与座区', () => {
  it('应有 3 种光形态且参数与 GDD §6.1 一致', () => {
    expect(Object.keys(data.lightForms).sort()).toEqual(['beam', 'self', 'spread']);
    expect(data.lightForms.spread.radius).toBeCloseTo(4.2, 10);
    expect(data.lightForms.beam.radius).toBeCloseTo(1.6, 10);
    expect(data.lightForms.self.radius).toBeCloseTo(3, 10);
    expect(data.lightForms.self.audienceDeltaPer4Beats).toBe(-1);
    expect(data.lightForms.self.canConvert).toBe(false);
  });

  it('应有 4 区 × 192 席 = 768，且行列/走道/座位号自洽', () => {
    expect(data.zones).toHaveLength(4);
    expect(data.seats.rows).toBe(24);
    expect(data.seats.cols).toBe(32);
    expect(data.seats.capacity).toBe(768);
    expect(data.seats.rows * data.seats.cols).toBe(data.seats.capacity);
    expect(data.seats.aisleCol).toBe(16);
    expect(data.seats.aisleRow).toBe(12);
    let sum = 0;
    for (const zone of data.zones) {
      const rows = zone.rowRange[1] - zone.rowRange[0] + 1;
      const cols = zone.colRange[1] - zone.colRange[0] + 1;
      expect(rows * cols).toBe(192);
      sum += rows * cols;
    }
    expect(sum).toBe(768);
    expect(new Set(data.zones.map((zone) => zone.id)).size).toBe(4);
    expect(new Set(data.zones.map((zone) => zone.voice)).size).toBe(4);
  });
});

describe('卡池 / 构筑 / 进化', () => {
  it('应有 24 张卡：3 核心 + 15 支援 + 6 通用，且 key 与 id 一致', () => {
    const cards = Object.values(data.cards);
    expect(cards).toHaveLength(24);
    expect(cards.filter((card) => card.category === 'core')).toHaveLength(3);
    expect(cards.filter((card) => card.category === 'support')).toHaveLength(15);
    expect(cards.filter((card) => card.category === 'generic')).toHaveLength(6);
    for (const [key, card] of Object.entries(data.cards)) {
      expect(card.id).toBe(key);
      expect(card.modifiers.length).toBeGreaterThan(0);
    }
    expect(data.progression.maxPicks).toBe(10);
    expect(data.progression.offerSize).toBe(3);
    expect(data.progression.thresholds).toHaveLength(10);
  });

  it('应有 3 条构筑、3 个进化，且核心/支援/id 全部可解析', () => {
    expect(Object.keys(data.builds)).toHaveLength(3);
    expect(Object.keys(data.evolutions)).toHaveLength(3);
    for (const build of Object.values(data.builds)) {
      expect(data.cards[build.core]?.category).toBe('core');
      expect(build.supports).toHaveLength(5);
      for (const support of build.supports) {
        expect(data.cards[support]?.category).toBe('support');
      }
      expect(data.evolutions[build.evolution]?.core).toBe(build.core);
    }
    for (const evolution of Object.values(data.evolutions)) {
      expect(data.cards[evolution.core]?.category).toBe('core');
      expect(evolution.requires.length).toBeGreaterThanOrEqual(3);
      for (const required of evolution.requires) {
        expect(data.cards[required]).toBeDefined();
      }
    }
  });
});

describe('噪音与 Boss', () => {
  it('应有 5 种噪音（3 常规 + 返听 + 静默 Boss）且 kind 唯一', () => {
    const kinds = Object.keys(data.noise);
    expect(kinds).toHaveLength(5);
    const noises = Object.values(data.noise);
    expect(new Set(noises.map((definition) => definition.kind)).size).toBe(5);
    const regular = (['floor-noise', 'scream', 'distortion'] as const).every(
      (kind) => data.noise[kind] !== undefined,
    );
    expect(regular).toBe(true);
    for (const kind of ['floor-noise', 'scream', 'distortion'] as const) {
      expect(data.noise[kind]?.radius).toBeGreaterThan(0);
      expect(data.noise[kind]?.maxHp).toBeGreaterThan(0);
    }
    expect(data.noise['return-listener']).toBeDefined();
    expect(data.noise.silence).toBeDefined();
  });

  it('应有 Boss 三阶段 390/405/435/460 与 8 小节静默', () => {
    expect(data.boss.phases).toHaveLength(3);
    expect(data.boss.phases.map((phase) => phase.phase)).toEqual(['bus', 'light', 'people']);
    expect(data.boss.phases.map((phase) => phase.startSec)).toEqual([390, 405, 435]);
    expect(data.boss.phases[2]?.endSec).toBe(460);
    expect(data.boss.retireSec).toBe(460);
    expect(data.boss.stripZoneThreshold).toBe(150);
    expect(data.balance.boss.silenceBars).toBe(8);
  });
});

describe('段落 / 拍点 / 曲目', () => {
  it('应有 5 段首尾相接，0 → 550s，并覆盖 5 个段落 id', () => {
    expect(data.segments).toHaveLength(5);
    expect(data.segments[0]?.startSec).toBe(0);
    for (let i = 0; i < data.segments.length - 1; i += 1) {
      expect(data.segments[i]?.endSec).toBe(data.segments[i + 1]?.startSec);
    }
    expect(data.segments[4]?.endSec).toBe(550);
    expect(data.segments.map((segment) => segment.id)).toEqual([
      'overture',
      'verse',
      'chorus',
      'bridge',
      'finale',
    ]);
  });

  it('应为 128BPM / 4/4 / 304 小节 / 8 拍乐句 / 12 声部合唱', () => {
    expect(data.beatGrid.bpm).toBe(128);
    expect(data.beatGrid.beatsPerBar).toBe(4);
    expect(data.beatGrid.barsPerPhrase).toBe(8);
    expect(data.beatGrid.totalBars).toBe(304);
    expect(data.audio.bpm).toBe(128);
    expect(data.audio.choirVoices).toBe(12);
    expect(data.audio.choirZones * data.audio.choirLayersPerZone).toBe(12);
    expect(data.audio.irPresets.length).toBeGreaterThanOrEqual(1);
  });

  it('应让每段第 4 小节为七和弦、且每段和弦表非空', () => {
    for (const segment of data.segments) {
      expect(segment.chords.length).toBeGreaterThanOrEqual(4);
      const fourth = segment.chords[3];
      expect(fourth).toBeDefined();
      expect(isSeventhChord(fourth ?? 'am')).toBe(true);
    }
  });
});

describe('和弦 / 文案 / 音效 / 配色', () => {
  it('应有 10 个和弦且四区声部映射齐全', () => {
    const chords = Object.values(data.chords);
    expect(chords).toHaveLength(10);
    for (const chord of chords) {
      expect(Object.keys(chord.zoneInChord)).toHaveLength(4);
      expect(chordVoices(chord.id)).toHaveLength(4);
    }
  });

  it('应有 16 行文案覆盖 10 个触发点、5 条失败原因、4 档评级', () => {
    expect(data.copy.lines).toHaveLength(16);
    expect(new Set(data.copy.lines.map((line) => line.trigger)).size).toBe(10);
    expect(Object.keys(data.copy.failureReasons)).toHaveLength(5);
    expect(Object.keys(data.copy.grades)).toHaveLength(4);
    expect(new Set(data.copy.lines.map((line) => line.id)).size).toBe(16);
  });

  it('应有 12 个 SFX 且 id 唯一', () => {
    const sfx = Object.values(data.sfx);
    expect(sfx).toHaveLength(12);
    expect(new Set(sfx.map((effect) => effect.id)).size).toBe(12);
  });

  it('应有 17 个配色 token、格式合法，且三色规则可解析', () => {
    const tokens = Object.entries(data.palette.tokens);
    expect(tokens).toHaveLength(17);
    for (const [, hex] of tokens) {
      expect(hex).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
    for (const state of Object.values(data.palette.audienceStates)) {
      expect(data.palette.tokens[state]).toBeDefined();
    }
  });
});

describe('全局 id 与台词约束', () => {
  it('应让跨类 id 全局唯一（角色/瞬间/区/段/卡/构筑/进化/噪音/光形态/SFX/文案/和弦）', () => {
    const ids: string[] = [
      ...data.characters.map((item) => item.id),
      ...data.moments.map((item) => item.id),
      ...data.zones.map((item) => item.id),
      ...data.segments.map((item) => item.id),
      ...Object.keys(data.cards),
      ...Object.keys(data.builds),
      ...Object.keys(data.evolutions),
      ...Object.keys(data.noise),
      ...Object.keys(data.lightForms),
      ...Object.keys(data.sfx),
      ...data.copy.lines.map((item) => item.id),
      ...Object.keys(data.chords),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('应让局内触发台词不含数字（局内 0 数字口径）', () => {
    for (const line of data.copy.lines) {
      if (line.trigger === 'results-backstage') continue;
      const text = line.render({
        ending: 'complete',
        grade: 'S',
        converted: 600,
        burned: 10,
        covered: 20,
        cracks: 1,
        breakout: { 'front-left': 0, 'front-right': 0, 'back-left': 0, 'back-right': 0 },
        emptySeats: 168,
        secondRowEmpty: 0,
        lineBreaks: { guitar: 0, bass: 0, drums: 0 },
        returnLocks: 0,
      });
      expect(text).not.toMatch(/\d/);
    }
  });
});
