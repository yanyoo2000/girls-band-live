/**
 * tech-spec §11 #12：存档纯逻辑。
 *
 * 必测：损坏回退；缺字段补默认；clamp；`.bad` 备份（属 platform/SavePort，M6 验证）；写失败静默。
 * 本文件只测 `src/game/save.ts`（纯函数，无 DOM）。`.bad` 备份与写失败吞掉由
 * `src/platform/local-storage.ts` 的 `SavePort` 负责，M6 候选版落地后由 AC-T12 实机验证。
 */
import { describe, expect, it } from 'vitest';
import { mergeSettings, parseSave, serializeSave, updateRecords } from '../src/game/save';
import { CARD_IDS } from '../src/data/cards';
import type { RunResult } from '../src/types/game';
import type { RecordsV1, SaveDataV1, SettingsV1 } from '../src/types/save';

const DEFAULT_SETTINGS: SettingsV1 = {
  master: 0.8,
  music: 0.7,
  sfx: 0.8,
  quality: 'high',
  reducedMotion: false,
  highContrast: false,
  beatPulse: true,
  lowFlash: false,
};

function makeResult(overrides: Partial<RunResult> = {}, stats: Partial<RunResult['stats']> = {}): RunResult {
  const base: RunResult = {
    seed: 1,
    ending: 'complete',
    grade: 'A',
    stats: {
      peakAudience: 500,
      finalAudience: 480,
      converted: 300,
      burned: 80,
      covered: 120,
      leftVenue: 10,
      ignitesPerfect: 40,
      ignitesGood: 30,
      ignitesOff: 12,
      crowdWaves: 3,
      cracks: 2,
      returnLocks: 2,
      encoreUsed: false,
      duration: 550,
    },
    zoneCounts: { 'front-left': 140, 'front-right': 130, 'back-left': 120, 'back-right': 90 },
    emptySeats: 288,
    secondRowEmpty: 6,
    failure: null,
  };
  return { ...base, ...overrides, stats: { ...base.stats, ...stats } };
}

const EMPTY_RECORDS: RecordsV1 = {
  bestAudience: 0,
  bestTime: 0,
  clears: 0,
  emptyHouse: 0,
  bestRank: '-',
  lastRun: { date: '', audience: 0, converted: 0, burned: 0, rank: '-', segments: 0 },
};

describe('parseSave', () => {
  it('应对无存档（null）返回 fresh + 默认设置', () => {
    const result = parseSave(null);
    expect(result.status).toBe('fresh');
    expect(result.reasons).toEqual([]);
    expect(result.data.version).toBe(1);
    expect(result.data.settings).toEqual(DEFAULT_SETTINGS);
    expect(result.data.records.clears).toBe(0);
  });

  it('应对非法 JSON 回退默认值且报告 recovered', () => {
    const result = parseSave('{not json');
    expect(result.status).toBe('recovered');
    expect(result.reasons).toContain('json-parse');
    expect(result.data.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('应对根不是对象 / 版本不符回退默认值', () => {
    expect(parseSave('[]').status).toBe('recovered');
    expect(parseSave('[]').reasons).toContain('root-not-object');
    expect(parseSave('"text"').status).toBe('recovered');

    const future = parseSave(JSON.stringify({ version: 2, settings: {} }));
    expect(future.status).toBe('recovered');
    expect(future.reasons).toContain('version-mismatch');
  });

  it('应对缺字段补默认值并保持 loaded', () => {
    const result = parseSave(JSON.stringify({ version: 1 }));
    expect(result.status).toBe('loaded');
    expect(result.data.settings).toEqual(DEFAULT_SETTINGS);
    expect(result.data.records.bestRank).toBe('-');
    expect(result.data.unlocks.cardsSeen).toEqual([]);
  });

  it('应把音量 clamp 到 0..1、非法值回默认、未知字段忽略', () => {
    const result = parseSave(
      JSON.stringify({
        version: 1,
        settings: {
          master: 5,
          music: -3,
          sfx: 0.25,
          quality: 'ultra',
          reducedMotion: 'yes',
          highContrast: true,
          beatPulse: 1,
          lowFlash: false,
          unknownField: 'ignored',
        },
      }),
    );
    expect(result.data.settings.master).toBe(1);
    expect(result.data.settings.music).toBe(0);
    expect(result.data.settings.sfx).toBe(0.25);
    expect(result.data.settings.quality).toBe(DEFAULT_SETTINGS.quality);
    expect(result.data.settings.reducedMotion).toBe(DEFAULT_SETTINGS.reducedMotion);
    expect(result.data.settings.highContrast).toBe(true);
    expect(result.data.settings.beatPulse).toBe(DEFAULT_SETTINGS.beatPulse);
    expect(result.data.settings).not.toHaveProperty('unknownField');
  });

  it('应只保留合法解锁 id 并去重', () => {
    const known = CARD_IDS[0];
    const result = parseSave(
      JSON.stringify({
        version: 1,
        unlocks: { cardsSeen: [known, known, 'not-a-real-card'], momentsSeen: [] },
      }),
    );
    expect(result.data.unlocks.cardsSeen).toEqual([known]);
  });
});

describe('serializeSave', () => {
  it('应产出可被 parseSave 还原的稳定字符串', () => {
    const data: SaveDataV1 = {
      version: 1,
      settings: DEFAULT_SETTINGS,
      records: {
        ...EMPTY_RECORDS,
        bestAudience: 640,
        bestRank: 'S',
        lastRun: { date: '2026-10-28', audience: 620, converted: 400, burned: 60, rank: 'S', segments: 5 },
      },
      unlocks: { cardsSeen: [CARD_IDS[0] ?? 'x'], momentsSeen: [] },
    };
    const raw = serializeSave(data);
    expect(JSON.parse(raw)).toEqual(data);
    const roundTrip = parseSave(raw);
    expect(roundTrip.status).toBe('loaded');
    expect(roundTrip.reasons).toEqual([]);
    expect(roundTrip.data).toEqual(data);
    expect(serializeSave(data)).toBe(raw);
  });
});

describe('mergeSettings', () => {
  it('应保留未提供的字段并只报告实际变化', () => {
    const { settings, changed } = mergeSettings(DEFAULT_SETTINGS, { master: 0.3 });
    expect(settings.master).toBe(0.3);
    expect(settings.music).toBe(DEFAULT_SETTINGS.music);
    expect(changed).toEqual(['master']);
  });

  it('应 clamp 音量并对非法值回默认（不是回当前值）', () => {
    const current: SettingsV1 = { ...DEFAULT_SETTINGS, master: 0.4, music: 0.4 };
    const { settings } = mergeSettings(current, {
      master: 9,
      music: Number.NaN,
    });
    expect(settings.master).toBe(1);
    expect(settings.music).toBe(DEFAULT_SETTINGS.music);
  });

  it('应让空 patch 原样返回且 changed 为空', () => {
    const result = mergeSettings(DEFAULT_SETTINGS, {});
    expect(result.settings).toEqual(DEFAULT_SETTINGS);
    expect(result.changed).toEqual([]);
  });
});

describe('updateRecords', () => {
  it('应刷新 best 值并累加 clears（完成终曲）', () => {
    const next = updateRecords(EMPTY_RECORDS, makeResult(), '2026-10-28');
    expect(next.bestAudience).toBe(500);
    expect(next.bestTime).toBe(550);
    expect(next.clears).toBe(1);
    expect(next.emptyHouse).toBe(0);
    expect(next.bestRank).toBe('A');
    expect(next.lastRun.date).toBe('2026-10-28');
    expect(next.lastRun.segments).toBe(5);
  });

  it('应只累加 emptyHouse（空场完成不记 clears）', () => {
    const next = updateRecords(
      EMPTY_RECORDS,
      makeResult({ ending: 'empty-house', grade: 'C' }),
      '2026-10-28',
    );
    expect(next.clears).toBe(0);
    expect(next.emptyHouse).toBe(1);
    expect(next.bestRank).toBe('C');
  });

  it('应让中断不写评级、lastRun.rank 记 "-"', () => {
    const next = updateRecords(
      { ...EMPTY_RECORDS, bestRank: 'B' },
      makeResult({ ending: 'interrupted', grade: null, failure: null }, { duration: 200 }),
      '2026-10-28',
    );
    expect(next.bestRank).toBe('B');
    expect(next.lastRun.rank).toBe('-');
    expect(next.clears).toBe(0);
    expect(next.bestAudience).toBe(500);
  });

  it('应让 best 只增不减并 clamp 到容量/时长上限', () => {
    const records: RecordsV1 = {
      ...EMPTY_RECORDS,
      bestAudience: 700,
      bestTime: 500,
      bestRank: 'S',
    };
    const next = updateRecords(records, makeResult(), '2026-10-28');
    expect(next.bestAudience).toBe(700);
    expect(next.bestTime).toBe(550);
    expect(next.bestRank).toBe('S');

    const overloaded = updateRecords(
      records,
      makeResult({}, { peakAudience: 99999, duration: 99999 }),
      '2026-10-28',
    );
    expect(overloaded.bestAudience).toBeLessThanOrEqual(768);
    // 时长上限是防御性上限（24h），不是单局时长 570s：脏输入不得写爆记录。
    expect(overloaded.bestTime).toBeLessThanOrEqual(86_400);
  });

  it('应对非法日期回退为空日期', () => {
    const next = updateRecords(EMPTY_RECORDS, makeResult(), 'not-a-date');
    expect(next.lastRun.date).toBe('');
  });
});
