/**
 * 存档纯逻辑（dev-progression）。
 *
 * 契约（docs/tech-spec.md §8、GDD §18、`src/types/save.ts`）：
 * - key 固定 `gbl.save.v1`，只存**设置 / 记录 / 解锁**，不存局内进度、不存货币与账号；
 * - 本文件是纯函数：不访问 DOM / localStorage / window，不做 I/O、不抛异常；
 *   真正的 `localStorage` 读写由 `src/platform/local-storage.ts` 的 `SavePort` 注入（§4.1 第 2 条）；
 * - 读取：`JSON.parse` 失败、根不是对象、`version !== 1` → 默认值 + `recovered`；
 *   字段缺失补默认、非法值回默认、音量 clamp 0..1、未知字段忽略；`unlocks` 只保留合法 id 并去重；
 * - 写入失败静默降级：本文件只产出字符串与读结果，写失败由 `SavePort` 吞掉（§8.3）。
 *
 * 损坏备份：`parseSave` 只负责报告 `status: 'recovered'` 与原因，备份到 `gbl.save.v1.bad`
 * 属于 `SavePort.backupCorrupted(raw)` 的职责（纯逻辑层不能直接写存储）。
 */

import type { CardId, MemberMomentId, RunResult } from '../types/game';
import type {
  LastRunRecord,
  RecordsV1,
  SaveDataV1,
  SaveLoadResult,
  SettingsPatch,
  SettingsV1,
  UnlocksV1,
} from '../types/save';
import type { QualityLevel } from '../types/save';

/* ==========================================================================
 * 1. 默认值与合法值表（GDD §18 / tech-spec §8.1）
 * ========================================================================== */

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

const DEFAULT_LAST_RUN: LastRunRecord = {
  date: '',
  audience: 0,
  converted: 0,
  burned: 0,
  rank: '-',
  segments: 0,
};

const DEFAULT_RECORDS: RecordsV1 = {
  bestAudience: 0,
  bestTime: 0,
  clears: 0,
  emptyHouse: 0,
  bestRank: '-',
  lastRun: DEFAULT_LAST_RUN,
};

const DEFAULT_UNLOCKS: UnlocksV1 = {
  cardsSeen: [],
  momentsSeen: [],
};

const VALID_RANKS: ReadonlySet<string> = new Set(['S', 'A', 'B', 'C', '-']);
const RANK_SCORE: Readonly<Record<string, number>> = { S: 4, A: 3, B: 2, C: 1, '-': 0 };

/** 24 个 CardId（tech-spec §7.2 锁定）。穷尽 Record：CardId 增删时编译期报错。 */
const CARD_ID_TABLE = {
  'choir-wall': true,
  'solo-return': true,
  'bait-line': true,
  'four-part': true,
  'keep-them': true,
  'front-row': true,
  'sing-under-light': true,
  'heat-cap': true,
  'tight-beam': true,
  shield: true,
  'solo-extend': true,
  'burn-chain': true,
  'self-hear': true,
  'return-bait': true,
  'distortion-feed': true,
  'black-tide': true,
  'louder-brighter': true,
  'reverse-light': true,
  breathe: true,
  pluck: true,
  'footwork': true,
  'beat-ignite': true,
  'second-row': true,
  'encore-insurance': true,
} as const satisfies Readonly<Record<CardId, true>>;

/** 4 个角色瞬间 id（GDD §5）。 */
const MOMENT_ID_TABLE = {
  breath: true,
  'echoed-phrase': true,
  'body-shield': true,
  'half-beat': true,
} as const satisfies Readonly<Record<MemberMomentId, true>>;

const KNOWN_CARD_IDS: ReadonlySet<string> = new Set(Object.keys(CARD_ID_TABLE));
const KNOWN_MOMENT_IDS: ReadonlySet<string> = new Set(Object.keys(MOMENT_ID_TABLE));

/** 座位容量与段落起点（GDD §7.1 / §3.1），用于校验与 `lastRun.segments` 推导。 */
const SEAT_CAPACITY = 768;
const SEGMENT_START_SECONDS: readonly number[] = [0, 90, 220, 350, 460];
const MAX_UNLOCK_CARDS = 64;
const MAX_UNLOCK_MOMENTS = 16;
const MAX_COUNT = 1_000_000;
const MAX_TIME_SECONDS = 86_400;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/* ==========================================================================
 * 2. 小工具
 * ========================================================================== */

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampCount(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return clamp(Math.floor(value), 0, max);
}

function createDefaultSave(): SaveDataV1 {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    records: { ...DEFAULT_RECORDS, lastRun: { ...DEFAULT_LAST_RUN } },
    unlocks: { cardsSeen: [...DEFAULT_UNLOCKS.cardsSeen], momentsSeen: [...DEFAULT_UNLOCKS.momentsSeen] },
  };
}

function readVolume(
  value: unknown,
  fallback: number,
  field: string,
  reasons: string[],
): number {
  if (value === undefined) return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const clamped = clamp(value, 0, 1);
    if (clamped !== value) reasons.push(`${field}:clamped`);
    return clamped;
  }
  reasons.push(`${field}:invalid`);
  return fallback;
}

function readSwitch(
  value: unknown,
  fallback: boolean,
  field: string,
  reasons: string[],
): boolean {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  reasons.push(`${field}:invalid`);
  return fallback;
}

function readQuality(
  value: unknown,
  fallback: QualityLevel,
  field: string,
  reasons: string[],
): QualityLevel {
  if (value === undefined) return fallback;
  if (value === 'high' || value === 'low') return value;
  reasons.push(`${field}:invalid`);
  return fallback;
}

function readCount(
  value: unknown,
  fallback: number,
  max: number,
  field: string,
  reasons: string[],
): number {
  if (value === undefined) return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = clampCount(value, max);
    if (normalized !== value) reasons.push(`${field}:clamped`);
    return normalized;
  }
  reasons.push(`${field}:invalid`);
  return fallback;
}

function readRank(
  value: unknown,
  fallback: string,
  field: string,
  reasons: string[],
): string {
  if (value === undefined) return fallback;
  if (typeof value === 'string' && VALID_RANKS.has(value)) return value;
  reasons.push(`${field}:invalid`);
  return fallback;
}

function readDate(
  value: unknown,
  fallback: string,
  field: string,
  reasons: string[],
): string {
  if (value === undefined) return fallback;
  if (typeof value === 'string' && isValidDate(value)) return value;
  reasons.push(`${field}:invalid`);
  return fallback;
}

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function readUnlockList(
  value: unknown,
  allowed: ReadonlySet<string>,
  limit: number,
  field: string,
  reasons: string[],
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    reasons.push(`${field}:invalid`);
    return [];
  }

  const kept: string[] = [];
  let filtered = false;
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.has(item) || kept.includes(item)) {
      filtered = true;
      continue;
    }
    kept.push(item);
    if (kept.length >= limit) break;
  }
  if (filtered) reasons.push(`${field}:filtered`);
  return kept;
}

/* ==========================================================================
 * 3. 读取：parseSave
 * ========================================================================== */

function readSettings(value: unknown, reasons: string[]): SettingsV1 {
  const source: Readonly<Record<string, unknown>> = isRecord(value) ? value : {};
  if (value !== undefined && !isRecord(value)) reasons.push('settings:invalid');

  return {
    master: readVolume(source.master, DEFAULT_SETTINGS.master, 'settings.master', reasons),
    music: readVolume(source.music, DEFAULT_SETTINGS.music, 'settings.music', reasons),
    sfx: readVolume(source.sfx, DEFAULT_SETTINGS.sfx, 'settings.sfx', reasons),
    quality: readQuality(source.quality, DEFAULT_SETTINGS.quality, 'settings.quality', reasons),
    reducedMotion: readSwitch(
      source.reducedMotion,
      DEFAULT_SETTINGS.reducedMotion,
      'settings.reducedMotion',
      reasons,
    ),
    highContrast: readSwitch(
      source.highContrast,
      DEFAULT_SETTINGS.highContrast,
      'settings.highContrast',
      reasons,
    ),
    beatPulse: readSwitch(source.beatPulse, DEFAULT_SETTINGS.beatPulse, 'settings.beatPulse', reasons),
    lowFlash: readSwitch(source.lowFlash, DEFAULT_SETTINGS.lowFlash, 'settings.lowFlash', reasons),
  };
}

function readLastRun(value: unknown, reasons: string[]): LastRunRecord {
  const source: Readonly<Record<string, unknown>> = isRecord(value) ? value : {};
  if (value !== undefined && !isRecord(value)) reasons.push('records.lastRun:invalid');

  return {
    date: readDate(source.date, DEFAULT_LAST_RUN.date, 'records.lastRun.date', reasons),
    audience: readCount(
      source.audience,
      DEFAULT_LAST_RUN.audience,
      SEAT_CAPACITY,
      'records.lastRun.audience',
      reasons,
    ),
    converted: readCount(
      source.converted,
      DEFAULT_LAST_RUN.converted,
      MAX_COUNT,
      'records.lastRun.converted',
      reasons,
    ),
    burned: readCount(
      source.burned,
      DEFAULT_LAST_RUN.burned,
      MAX_COUNT,
      'records.lastRun.burned',
      reasons,
    ),
    rank: readRank(source.rank, DEFAULT_LAST_RUN.rank, 'records.lastRun.rank', reasons),
    segments: readCount(source.segments, DEFAULT_LAST_RUN.segments, 5, 'records.lastRun.segments', reasons),
  };
}

function readRecords(value: unknown, reasons: string[]): RecordsV1 {
  const source: Readonly<Record<string, unknown>> = isRecord(value) ? value : {};
  if (value !== undefined && !isRecord(value)) reasons.push('records:invalid');

  return {
    bestAudience: readCount(
      source.bestAudience,
      DEFAULT_RECORDS.bestAudience,
      SEAT_CAPACITY,
      'records.bestAudience',
      reasons,
    ),
    bestTime: readCount(
      source.bestTime,
      DEFAULT_RECORDS.bestTime,
      MAX_TIME_SECONDS,
      'records.bestTime',
      reasons,
    ),
    clears: readCount(source.clears, DEFAULT_RECORDS.clears, MAX_COUNT, 'records.clears', reasons),
    emptyHouse: readCount(
      source.emptyHouse,
      DEFAULT_RECORDS.emptyHouse,
      MAX_COUNT,
      'records.emptyHouse',
      reasons,
    ),
    bestRank: readRank(source.bestRank, DEFAULT_RECORDS.bestRank, 'records.bestRank', reasons),
    lastRun: readLastRun(source.lastRun, reasons),
  };
}

function readUnlocks(value: unknown, reasons: string[]): UnlocksV1 {
  const source: Readonly<Record<string, unknown>> = isRecord(value) ? value : {};
  if (value !== undefined && !isRecord(value)) reasons.push('unlocks:invalid');

  return {
    cardsSeen: readUnlockList(
      source.cardsSeen,
      KNOWN_CARD_IDS,
      MAX_UNLOCK_CARDS,
      'unlocks.cardsSeen',
      reasons,
    ),
    momentsSeen: readUnlockList(
      source.momentsSeen,
      KNOWN_MOMENT_IDS,
      MAX_UNLOCK_MOMENTS,
      'unlocks.momentsSeen',
      reasons,
    ),
  };
}

/**
 * 解析存档字符串：永不抛异常；损坏返回 recovered + 默认值。
 * `raw === null` 表示“没有存档”（首次启动）→ `fresh`。
 * 字段级修复（缺失/非法/clamp）保留 `loaded`，原因写进 `reasons` 供诊断。
 */
export function parseSave(raw: string | null): SaveLoadResult {
  if (raw === null) {
    return { data: createDefaultSave(), status: 'fresh', reasons: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { data: createDefaultSave(), status: 'recovered', reasons: ['json-parse'] };
  }

  if (!isRecord(parsed)) {
    return { data: createDefaultSave(), status: 'recovered', reasons: ['root-not-object'] };
  }
  // v1 是首个版本：不迁移，直接丢弃（tech-spec §8.2 第 3 条）。
  if (parsed.version !== 1) {
    return { data: createDefaultSave(), status: 'recovered', reasons: ['version-mismatch'] };
  }

  const reasons: string[] = [];
  const data: SaveDataV1 = {
    version: 1,
    settings: readSettings(parsed.settings, reasons),
    records: readRecords(parsed.records, reasons),
    unlocks: readUnlocks(parsed.unlocks, reasons),
  };
  return { data, status: 'loaded', reasons };
}

/* ==========================================================================
 * 4. 设置合并：mergeSettings
 * ========================================================================== */

function resolveVolume(value: unknown, current: number, fallback: number): number {
  if (value === undefined) return current;
  if (typeof value === 'number' && Number.isFinite(value)) return clamp(value, 0, 1);
  return fallback;
}

function resolveSwitch(value: unknown, current: boolean, fallback: boolean): boolean {
  if (value === undefined) return current;
  if (typeof value === 'boolean') return value;
  return fallback;
}

function resolveQuality(
  value: unknown,
  current: QualityLevel,
  fallback: QualityLevel,
): QualityLevel {
  if (value === undefined) return current;
  if (value === 'high' || value === 'low') return value;
  return fallback;
}

const SETTINGS_KEYS: readonly (keyof SettingsV1)[] = [
  'master',
  'music',
  'sfx',
  'quality',
  'reducedMotion',
  'highContrast',
  'beatPulse',
  'lowFlash',
];

/** 设置合并：缺字段补默认、非法值回默认、音量 clamp 0..1。 */
export function mergeSettings(current: SettingsV1, patch: Partial<SettingsV1>): SettingsPatch {
  // 运行期可能拿到脏输入：统一收窄成 unknown 再逐个校验，避免把非法值写进设置。
  const raw: Readonly<Partial<Record<keyof SettingsV1, unknown>>> = patch;

  const settings: SettingsV1 = {
    master: resolveVolume(raw.master, current.master, DEFAULT_SETTINGS.master),
    music: resolveVolume(raw.music, current.music, DEFAULT_SETTINGS.music),
    sfx: resolveVolume(raw.sfx, current.sfx, DEFAULT_SETTINGS.sfx),
    quality: resolveQuality(raw.quality, current.quality, DEFAULT_SETTINGS.quality),
    reducedMotion: resolveSwitch(
      raw.reducedMotion,
      current.reducedMotion,
      DEFAULT_SETTINGS.reducedMotion,
    ),
    highContrast: resolveSwitch(
      raw.highContrast,
      current.highContrast,
      DEFAULT_SETTINGS.highContrast,
    ),
    beatPulse: resolveSwitch(raw.beatPulse, current.beatPulse, DEFAULT_SETTINGS.beatPulse),
    lowFlash: resolveSwitch(raw.lowFlash, current.lowFlash, DEFAULT_SETTINGS.lowFlash),
  };

  const changed: (keyof SettingsV1)[] = [];
  for (const key of SETTINGS_KEYS) {
    if (settings[key] !== current[key]) changed.push(key);
  }
  return { settings, changed };
}

/* ==========================================================================
 * 5. 记录：updateRecords
 * ========================================================================== */

function rankScore(rank: string): number {
  return RANK_SCORE[rank] ?? 0;
}

function higherRank(current: string, candidate: string): string {
  return rankScore(candidate) > rankScore(current) ? candidate : current;
}

/** 到达的段落数 0..5（按 GDD §3.1 的段落起点推导，如 8:00 中断 → 5）。 */
function segmentsReached(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  let reached = 0;
  for (const start of SEGMENT_START_SECONDS) {
    if (duration >= start) reached += 1;
  }
  return Math.min(reached, SEGMENT_START_SECONDS.length);
}

/**
 * 结算写记录：best 比较、lastRun、clears/emptyHouse（不写局内进度）。
 * - 中断没有评级：`bestRank` 保持原值，`lastRun.rank` 记 `-`；
 * - 空场是完成的一种（`empty-house`），计入 `emptyHouse` 而不计 `clears`；
 * - 纯函数：不修改入参，返回新对象。
 */
export function updateRecords(records: RecordsV1, result: RunResult, date: string): RecordsV1 {
  const stats = result.stats;
  const grade = result.grade;
  const duration = Number.isFinite(stats.duration) ? stats.duration : 0;

  return {
    bestAudience: Math.max(
      clampCount(records.bestAudience, SEAT_CAPACITY),
      clampCount(stats.peakAudience, SEAT_CAPACITY),
    ),
    bestTime: Math.max(
      clampCount(records.bestTime, MAX_TIME_SECONDS),
      clampCount(duration, MAX_TIME_SECONDS),
    ),
    clears: clampCount(records.clears, MAX_COUNT) + (result.ending === 'complete' ? 1 : 0),
    emptyHouse: clampCount(records.emptyHouse, MAX_COUNT) + (result.ending === 'empty-house' ? 1 : 0),
    bestRank: grade === null ? records.bestRank : higherRank(records.bestRank, grade),
    lastRun: {
      date: isValidDate(date) ? date : DEFAULT_LAST_RUN.date,
      audience: clampCount(stats.finalAudience, SEAT_CAPACITY),
      converted: clampCount(stats.converted, MAX_COUNT),
      burned: clampCount(stats.burned, MAX_COUNT),
      rank: grade ?? DEFAULT_LAST_RUN.rank,
      segments: segmentsReached(duration),
    },
  };
}

/* ==========================================================================
 * 6. 序列化：serializeSave
 * ========================================================================== */

/**
 * 序列化为稳定字符串（字段顺序固定，供测试与 diff）。
 * 顺序与 tech-spec §8.1 的 schema 完全一致；不写未知字段、不写空白。
 */
export function serializeSave(data: SaveDataV1): string {
  const lastRun = data.records.lastRun;
  return JSON.stringify({
    version: 1,
    settings: {
      master: data.settings.master,
      music: data.settings.music,
      sfx: data.settings.sfx,
      quality: data.settings.quality,
      reducedMotion: data.settings.reducedMotion,
      highContrast: data.settings.highContrast,
      beatPulse: data.settings.beatPulse,
      lowFlash: data.settings.lowFlash,
    },
    records: {
      bestAudience: data.records.bestAudience,
      bestTime: data.records.bestTime,
      clears: data.records.clears,
      emptyHouse: data.records.emptyHouse,
      bestRank: data.records.bestRank,
      lastRun: {
        date: lastRun.date,
        audience: lastRun.audience,
        converted: lastRun.converted,
        burned: lastRun.burned,
        rank: lastRun.rank,
        segments: lastRun.segments,
      },
    },
    unlocks: {
      cardsSeen: [...data.unlocks.cardsSeen],
      momentsSeen: [...data.unlocks.momentsSeen],
    },
  });
}
