/**
 * 内容数据注册表：`DataRegistry` 的唯一装配点 + 数据自检。
 *
 * 依据：docs/tech-spec.md §6.4（启动第 3 步 `buildDataRegistry()`，dev 下跑 `validateData`）、
 *       §7.1（"数据自检 validateData(data)：卡池 24、核心 3、支援 15、通用 6、进化引用齐全、
 *       座位 768、段落 5、SFX 12、合唱声部 12"）、§7.3（穷尽 Record 是 F1 的编译期保险）。
 *
 * 使用方式：
 * - `src/main.tsx`：`const data = buildDataRegistry();`（dev 下再跑 `validateData(data)`，失败仅 console.warn）；
 * - 逻辑/渲染/音频层：从 `DataRegistry` 读表，或直接 `import { BALANCE, LIGHT_FORMS, … } from '../data'`
 *   （依赖矩阵允许 `game → data`）；
 * - 单测：`expect(validateData()).toEqual([])` 是最便宜的数据回归网（tech-spec T8）。
 *
 * 本文件**没有模块级副作用**（不 console、不抛错、不读环境），保证构建可重复。
 */

import type { ChordKey, DataRegistry } from '../types/data';
import type {
  HeatLevel,
  InstrumentLineId,
  LayerId,
  LightMode,
  SfxId,
  ZoneId,
} from '../types/game';

import { CHARACTERS, MOMENTS, MOMENT_NAMES } from './characters';
import { CARDS, BUILDS, EVOLUTIONS, PROGRESSION } from './cards';
import { NOISE, BOSS } from './noise';
import {
  SEGMENTS,
  BEAT_GRID,
  SFX,
  AUDIO,
  SONG,
  CLIMAX_EVENTS,
  OPENING_HOOKS,
  SEGMENT_CONTENT,
  STAGE_LAYOUT,
} from './segments';
import { CHORDS, CHORD_CONTENT, isSeventhChord } from './chords';
import { ZONES, SEATS, ZONE_ORDER, ZONE_CONTENT } from './seats';
import { COPY } from './copy';
import { PALETTE } from './palette';
import {
  BALANCE,
  CHOIR_WAVE_RULES,
  GRADE_RULES,
  HEAT_CAP_BASE,
  HEAT_LEVEL_RULES,
  LIGHT_FORMS,
  LINE_RULES,
  MAX_CRACKS,
} from './balance';

/** 数据版本（存档/日志/QA 报告引用；内容表结构变化时递增）。 */
export const DATA_VERSION = 'gbl.data.v1';

/* ==========================================================================
 * 1. 注册表装配
 * ========================================================================== */

const DATA: DataRegistry = {
  version: DATA_VERSION,
  characters: CHARACTERS,
  moments: MOMENTS,
  zones: ZONES,
  lightForms: LIGHT_FORMS,
  cards: CARDS,
  builds: BUILDS,
  evolutions: EVOLUTIONS,
  noise: NOISE,
  boss: BOSS,
  segments: SEGMENTS,
  beatGrid: BEAT_GRID,
  chords: CHORDS,
  seats: SEATS,
  progression: PROGRESSION,
  sfx: SFX,
  audio: AUDIO,
  palette: PALETTE,
  copy: COPY,
  balance: BALANCE,
};

/**
 * 构建数据注册表（tech-spec §6.4 第 3 步）。
 *
 * 单例：内容表是只读常量，重复调用返回同一对象（避免每局重建派生表）。
 */
export function buildDataRegistry(): DataRegistry {
  return DATA;
}

/** 便捷导出：`data` 与 `buildDataRegistry()` 是同一个对象。 */
export const data: DataRegistry = DATA;

/* ==========================================================================
 * 2. 数据自检（dev / 测试调用；返回空数组表示全部通过）
 * ========================================================================== */

/** kebab-case：`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`（tech-spec §7.1）。 */
const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** 三种灯光态（5 段里必须都出现过）。 */
const ALL_LIGHTING = ['warm', 'full', 'blackout'] as const;

/** 全部图层 id（LayerId 的 7 个值；段落里出现未知层即数据错误）。 */
const ALL_LAYERS: readonly LayerId[] = ['drums', 'bass', 'chords', 'lead', 'arp', 'choir', 'room'];

/** 三条乐器线（LineState 的三个键）。 */
const ALL_LINES: readonly InstrumentLineId[] = ['guitar', 'bass', 'drums'];

/** 三种常规噪音（每段的 spawnRates 必须覆盖这三个键）。 */
const REGULAR_KINDS = ['floor-noise', 'scream', 'distortion'] as const;

/** 5 个失败原因（失败卡的候选原因）。 */
const FAILURE_CODES = [
  'return-listener-lock',
  'zone-cooled',
  'audience-left',
  'no-ignite',
  'overheated-zone',
] as const;

/**
 * 数据自检。
 *
 * 只读、无副作用、不抛错：返回人类可读的问题列表（空数组 = 通过）。
 * 覆盖 tech-spec §7.1 的硬指标 + GDD §4/§10/§13 的数量与引用一致性 + id 规则。
 */
export function validateData(registry: DataRegistry = DATA): readonly string[] {
  const problems: string[] = [];
  const fail = (message: string): void => {
    problems.push(message);
  };

  /* ---------- 0. 版本与全局 id ---------- */
  if (registry.version.trim().length === 0) fail('version 为空');

  const characterIds = new Set<string>(registry.characters.map((c) => c.id));
  const momentIds = new Set<string>(registry.moments.map((m) => m.id));
  const zoneIds = new Set<string>(registry.zones.map((z) => z.id));
  const segmentIds = new Set<string>(registry.segments.map((s) => s.id));
  const cardIds = new Set<string>(Object.keys(registry.cards));
  const buildIds = new Set<string>(Object.keys(registry.builds));
  const evolutionIds = new Set<string>(Object.keys(registry.evolutions));
  const noiseIds = new Set<string>(Object.keys(registry.noise));
  const lightFormIds = new Set<string>(Object.keys(registry.lightForms));
  const chordIds = new Set<string>(Object.keys(registry.chords));
  const sfxIds = new Set<string>(Object.keys(registry.sfx));
  const paletteTokenIds = new Set<string>(Object.keys(registry.palette.tokens));
  const gradeIds = new Set<string>(Object.keys(registry.copy.grades));

  const allIds: { id: string; owner: string }[] = [];
  const collect = (owner: string, ids: readonly string[]): void => {
    for (const id of ids) allIds.push({ id, owner });
  };
  collect('character', [...characterIds]);
  collect('moment', [...momentIds]);
  collect('zone', [...zoneIds]);
  collect('segment', [...segmentIds]);
  collect('card', [...cardIds]);
  collect('build', [...buildIds]);
  collect('evolution', [...evolutionIds]);
  collect('noise', [...noiseIds]);
  collect('lightForm', [...lightFormIds]);
  collect('chord', [...chordIds]);
  collect('sfx', [...sfxIds]);
  collect('copyLine', registry.copy.lines.map((l) => l.id));
  collect('song', [SONG.id]);

  for (const { id, owner } of allIds) {
    if (!KEBAB_CASE.test(id)) fail(`${owner} id 不是 kebab-case：${id}`);
  }
  const seen = new Map<string, string>();
  for (const { id, owner } of allIds) {
    const previous = seen.get(id);
    if (previous === undefined) {
      seen.set(id, owner);
      continue;
    }
    if (previous === owner) fail(`id 重复：${id}（${owner}）`);
    else fail(`id 全局冲突：${id}（${previous} 与 ${owner}）`);
  }

  /* ---------- 1. 角色与角色瞬间 ---------- */
  if (registry.characters.length !== 4) fail(`角色数应为 4，实际 ${registry.characters.length}`);
  const playableCount = registry.characters.filter((c) => c.playable).length;
  if (playableCount !== 1) fail(`可操作角色应恰好 1 名，实际 ${playableCount}`);
  for (const character of registry.characters) {
    if (character.name.trim().length === 0) fail(`角色 ${character.id} 缺 name`);
    if (character.who.trim().length === 0) fail(`角色 ${character.id} 缺 who`);
    if (character.how.trim().length === 0) fail(`角色 ${character.id} 缺 how`);
    if (character.fear.trim().length === 0) fail(`角色 ${character.id} 缺 fear`);
    if (!paletteTokenIds.has(character.silhouette.primary)) {
      fail(`角色 ${character.id} 的 primary 不在 palette 中`);
    }
    if (!paletteTokenIds.has(character.silhouette.secondary)) {
      fail(`角色 ${character.id} 的 secondary 不在 palette 中`);
    }
    if (!momentIds.has(character.moment)) {
      fail(`角色 ${character.id} 引用了不存在的角色瞬间 ${character.moment}`);
    }
    if (character.who.length > 60) fail(`角色 ${character.id} 的 who 超过 60 字`);
  }
  if (registry.moments.length !== 4) fail(`角色瞬间应为 4 个，实际 ${registry.moments.length}`);
  const momentTriggers = new Set(registry.moments.map((m) => m.trigger));
  for (const trigger of ['run-start', 'three-perfect-ignites', 'line-break', 'zone-cooling'] as const) {
    if (!momentTriggers.has(trigger)) fail(`角色瞬间缺少 trigger：${trigger}`);
  }
  for (const moment of registry.moments) {
    if (moment.duration <= 0) fail(`角色瞬间 ${moment.id} 的 duration 必须 > 0`);
    if (!characterIds.has(moment.member)) {
      fail(`角色瞬间 ${moment.id} 引用了不存在的成员 ${moment.member}`);
    }
  }

  /* ---------- 2. 座区与座位 ---------- */
  if (registry.zones.length !== 4) fail(`座区数应为 4，实际 ${registry.zones.length}`);
  if (registry.seats.rows * registry.seats.cols !== registry.seats.capacity) {
    fail(
      `座位网格与容量不一致：${registry.seats.rows}×${registry.seats.cols} ≠ ${registry.seats.capacity}`,
    );
  }
  if (registry.seats.capacity !== 768) fail(`座位容量应为 768，实际 ${registry.seats.capacity}`);
  if (registry.seats.aisleCol < 1 || registry.seats.aisleCol >= registry.seats.cols) {
    fail(`aisleCol 越界：${registry.seats.aisleCol}`);
  }
  if (registry.seats.aisleRow < 1 || registry.seats.aisleRow >= registry.seats.rows) {
    fail(`aisleRow 越界：${registry.seats.aisleRow}`);
  }

  const voices = new Set<string>();
  let seatSum = 0;
  for (const zone of ZONES) {
    const rows = zone.rowRange[1] - zone.rowRange[0] + 1;
    const cols = zone.colRange[1] - zone.colRange[0] + 1;
    const count = rows * cols;
    seatSum += count;
    if (count !== 192) fail(`座区 ${zone.id} 应为 192 席，实际 ${count}`);
    if (zone.rowRange[1] >= registry.seats.rows) fail(`座区 ${zone.id} 的 rowRange 越界`);
    if (zone.colRange[1] >= registry.seats.cols) fail(`座区 ${zone.id} 的 colRange 越界`);
    voices.add(zone.voice);
    if (!paletteTokenIds.has(zone.colorToken)) fail(`座区 ${zone.id} 的 colorToken 不在 palette 中`);
  }
  if (seatSum !== registry.seats.capacity) fail(`四区席位数之和 ${seatSum} ≠ ${registry.seats.capacity}`);
  if (voices.size !== 4) fail(`四区声部应互不相同，实际 ${voices.size} 个`);
  for (const zoneId of ZONE_ORDER) {
    if (!zoneIds.has(zoneId)) fail(`缺少座区 ${zoneId}`);
  }

  /* ---------- 3. 卡池 / 进化 / 构筑 / 成长 ---------- */
  const cardEntries = Object.entries(registry.cards);
  if (cardEntries.length !== 24) fail(`卡池应为 24 张，实际 ${cardEntries.length}`);
  const coreCards = cardEntries.filter(([, card]) => card.category === 'core');
  const supportCards = cardEntries.filter(([, card]) => card.category === 'support');
  const genericCards = cardEntries.filter(([, card]) => card.category === 'generic');
  if (coreCards.length !== 3) fail(`核心卡应为 3 张，实际 ${coreCards.length}`);
  if (supportCards.length !== 15) fail(`支援卡应为 15 张，实际 ${supportCards.length}`);
  if (genericCards.length !== 6) fail(`通用卡应为 6 张，实际 ${genericCards.length}`);

  for (const [id, card] of cardEntries) {
    if (card.id !== id) fail(`卡 ${id} 的 id 字段与键不一致：${card.id}`);
    if (card.name.trim().length === 0) fail(`卡 ${id} 缺 name`);
    if (card.description.trim().length === 0) fail(`卡 ${id} 缺 description`);
    if (card.description.length > 60) fail(`卡 ${id} 的 description 超过 60 字（UI 卡片放不下）`);
    if (card.modifiers.length === 0) fail(`卡 ${id} 没有任何 modifier`);
    for (const modifier of card.modifiers) {
      if (!Number.isFinite(modifier.value)) fail(`卡 ${id} 的 ${modifier.key} 不是有限数字`);
      if (modifier.value === 0) fail(`卡 ${id} 的 ${modifier.key} 为 0（无效果，属数据错误）`);
    }
    if (card.category === 'core') {
      if (card.build === null) fail(`核心卡 ${id} 必须属于某条构筑`);
      if (card.evolution === null) fail(`核心卡 ${id} 必须有进化`);
    } else if (card.category === 'support') {
      if (card.build === null) fail(`支援卡 ${id} 必须属于某条构筑`);
    } else if (card.build !== null) {
      fail(`通用卡 ${id} 不应属于任何构筑`);
    }
    if (card.build !== null && !buildIds.has(card.build)) {
      fail(`卡 ${id} 引用了不存在的构筑 ${card.build}`);
    }
    if (card.evolution !== null) {
      if (!evolutionIds.has(card.evolution)) {
        fail(`卡 ${id} 引用了不存在的进化 ${card.evolution}`);
      } else {
        const evolution = registry.evolutions[card.evolution];
        if (card.category === 'core' && evolution.core !== id) {
          fail(`进化 ${evolution.id} 的 core 应是 ${id}，实际 ${evolution.core}`);
        }
        if (card.category === 'support' && !evolution.requires.includes(card.id)) {
          fail(`支援卡 ${id} 标了进化 ${evolution.id}，但不在 requires 里`);
        }
      }
    }
  }

  const buildEntries = Object.entries(registry.builds);
  if (buildEntries.length !== 3) fail(`构筑应为 3 条，实际 ${buildEntries.length}`);
  for (const [id, build] of buildEntries) {
    if (build.id !== id) fail(`构筑 ${id} 的 id 字段与键不一致`);
    if (build.supports.length !== 5) fail(`构筑 ${id} 应有 5 张支援卡，实际 ${build.supports.length}`);
    if (!cardIds.has(build.core)) {
      fail(`构筑 ${id} 的核心卡 ${build.core} 不存在`);
    } else {
      const coreCard = registry.cards[build.core];
      if (coreCard.build !== id) fail(`构筑 ${id} 的核心卡 ${build.core} 属于构筑 ${String(coreCard.build)}`);
      if (coreCard.category !== 'core') fail(`构筑 ${id} 的核心卡 ${build.core} 不是核心卡`);
    }
    for (const supportId of build.supports) {
      if (!cardIds.has(supportId)) {
        fail(`构筑 ${id} 的支援卡 ${supportId} 不存在`);
        continue;
      }
      const support = registry.cards[supportId];
      if (support.category !== 'support') fail(`构筑 ${id} 的 ${supportId} 不是支援卡`);
      if (support.build !== id) fail(`构筑 ${id} 的 ${supportId} 属于构筑 ${String(support.build)}`);
    }
    if (!evolutionIds.has(build.evolution)) {
      fail(`构筑 ${id} 的进化 ${build.evolution} 不存在`);
    } else if (registry.evolutions[build.evolution].core !== build.core) {
      fail(`构筑 ${id} 的进化 ${build.evolution} 的核心与构筑核心不一致`);
    }
    if (build.approach.trim().length === 0) fail(`构筑 ${id} 缺 approach`);
  }

  const evolutionEntries = Object.entries(registry.evolutions);
  if (evolutionEntries.length !== 3) fail(`进化应为 3 个，实际 ${evolutionEntries.length}`);
  for (const [id, evolution] of evolutionEntries) {
    if (evolution.id !== id) fail(`进化 ${id} 的 id 字段与键不一致`);
    if (evolution.requires.length !== 3) {
      fail(`进化 ${id} 应要求 3 张支援卡，实际 ${evolution.requires.length}`);
    }
    if (evolution.duration <= 0) fail(`进化 ${id} 的 duration 必须 > 0`);
    for (const required of evolution.requires) {
      if (!cardIds.has(required)) fail(`进化 ${id} 要求的卡 ${required} 不存在`);
    }
    if (evolution.requires.includes(evolution.core)) {
      fail(`进化 ${id} 的 requires 不应包含核心卡本身`);
    }
  }

  const progression = registry.progression;
  if (progression.thresholds.length !== 10) {
    fail(`升级阈值应为 10 个，实际 ${progression.thresholds.length}`);
  }
  if (progression.maxPicks !== progression.thresholds.length) {
    fail(`maxPicks（${progression.maxPicks}）应等于阈值个数（${progression.thresholds.length}）`);
  }
  if (progression.offerSize !== 3) fail(`每次 offer 应为 3 张，实际 ${progression.offerSize}`);
  for (let i = 1; i < progression.thresholds.length; i += 1) {
    const previous = progression.thresholds[i - 1];
    const current = progression.thresholds[i];
    if (previous === undefined || current === undefined || current <= previous) {
      fail('升级阈值必须严格递增');
      break;
    }
  }
  if (cardEntries.length <= progression.maxPicks) {
    fail(`卡池（${cardEntries.length}）必须大于单局选择次数（${progression.maxPicks}），否则构筑是假的`);
  }
  {
    const supportPerBuild = supportCards.length / buildEntries.length;
    const remaining = supportPerBuild + genericCards.length;
    const picksLeft = progression.maxPicks - 1;
    if (remaining <= picksLeft) {
      fail(`选核心后剩余卡数（${remaining}）必须大于剩余选择次数（${picksLeft}）`);
    }
  }

  /* ---------- 4. 光形态 / 热度 / 评级 ---------- */
  for (const mode of ['spread', 'beam', 'self'] as readonly LightMode[]) {
    if (!lightFormIds.has(mode)) fail(`缺少光形态 ${mode}`);
  }
  const selfForm = registry.lightForms.self;
  if (selfForm.canConvert) fail('回照不应能转化（canConvert 必须为 false）');
  if (selfForm.audienceDeltaPer4Beats !== -1) fail('回照必须每 4 拍人气 −1');
  if (registry.lightForms.spread.radius <= registry.lightForms.beam.radius) {
    fail('散光半径必须大于束光半径');
  }

  if (HEAT_CAP_BASE !== 3) fail(`常态热度上限应为 3，实际 ${HEAT_CAP_BASE}`);
  const heatLevels = new Set<HeatLevel>(HEAT_LEVEL_RULES.map((rule) => rule.level));
  if (heatLevels.size !== 5) fail(`热度规则应覆盖 0–4 共 5 档，实际 ${heatLevels.size}`);
  if (!cardIds.has('heat-cap')) fail('缺少解锁第 5 档的卡 heat-cap');
  if (HEAT_LEVEL_RULES[4]?.outputBonus !== 0.25) fail('第 5 档热度的输出加成应为 +25%');
  if (CHOIR_WAVE_RULES.intervalBeats <= 0) fail('合唱波间隔必须 > 0');

  if (GRADE_RULES.length !== 4) fail(`评级应为 4 档，实际 ${GRADE_RULES.length}`);
  const gradeOrder = GRADE_RULES.map((rule) => rule.grade).join('');
  if (gradeOrder !== 'SABC') fail(`评级顺序应为 S/A/B/C，实际 ${gradeOrder}`);
  for (let i = 1; i < GRADE_RULES.length; i += 1) {
    const previous = GRADE_RULES[i - 1];
    const current = GRADE_RULES[i];
    if (previous !== undefined && current !== undefined && current.minAudience >= previous.minAudience) {
      fail('评级阈值必须严格递减（S > A > B > C）');
      break;
    }
  }

  /* ---------- 5. 噪音与 Boss ---------- */
  if (noiseIds.size !== 5) fail(`噪音种类应为 5，实际 ${noiseIds.size}`);
  for (const [kind, noise] of Object.entries(registry.noise)) {
    if (noise.kind !== kind) fail(`噪音 ${kind} 的 kind 字段与键不一致`);
    if (noise.name.trim().length === 0) fail(`噪音 ${kind} 缺 name`);
    if (noise.description.trim().length === 0) fail(`噪音 ${kind} 缺 description`);
    if (noise.speed < 0) fail(`噪音 ${kind} 的 speed 不能为负`);
    if (noise.yieldsAudienceOnBurn) fail(`噪音 ${kind} 烧死不应产出观众`);
  }
  if (registry.noise.silence.maxHp < 1_000_000) fail('Boss 的 maxHp 必须是不可击杀哨兵值（≥1e6）');

  if (registry.boss.phases.length !== 3) {
    fail(`Boss 阶段应为 3，实际 ${registry.boss.phases.length}`);
  }
  const phaseOrder = registry.boss.phases.map((phase) => phase.phase).join(',');
  if (phaseOrder !== 'bus,light,people') fail(`Boss 阶段顺序应为 bus,light,people，实际 ${phaseOrder}`);
  for (let i = 1; i < registry.boss.phases.length; i += 1) {
    const previous = registry.boss.phases[i - 1];
    const current = registry.boss.phases[i];
    if (previous === undefined || current === undefined) break;
    if (current.startSec !== previous.endSec) fail(`Boss 阶段 ${current.phase} 与上一阶段不连续`);
    if (current.endSec <= current.startSec) fail(`Boss 阶段 ${current.phase} 的时间区间无效`);
  }
  const lastPhase = registry.boss.phases[registry.boss.phases.length - 1];
  if (lastPhase !== undefined && registry.boss.retireSec !== lastPhase.endSec) {
    fail(`Boss 退场时间（${registry.boss.retireSec}）应等于第三阶段结束（${lastPhase.endSec}）`);
  }
  if (registry.boss.returnedAudiencePerPhase !== registry.balance.conversion.bossPhaseAudience) {
    fail('Boss 每阶段返场人数应与 balance.conversion.bossPhaseAudience 一致');
  }

  /* ---------- 6. 段落 / 拍点 / 和弦 ---------- */
  if (registry.segments.length !== 5) fail(`段落应为 5，实际 ${registry.segments.length}`);
  let expectedStart = 0;
  const lightingSeen = new Set<string>();
  for (const segment of registry.segments) {
    if (segment.startSec !== expectedStart) {
      fail(`段落 ${segment.id} 起点应为 ${expectedStart}s，实际 ${segment.startSec}s（段落必须首尾相接）`);
    }
    if (segment.endSec <= segment.startSec) fail(`段落 ${segment.id} 的时间区间无效`);
    expectedStart = segment.endSec;
    lightingSeen.add(segment.lighting);
    if (segment.chords.length === 0) fail(`段落 ${segment.id} 没有和弦序列`);
    for (const chord of segment.chords) {
      if (!chordIds.has(chord)) fail(`段落 ${segment.id} 引用了不存在的和弦 ${chord}`);
    }
    const fourth = segment.chords[3];
    if (fourth === undefined) {
      fail(`段落 ${segment.id} 的和弦循环不足 4 小节`);
    } else if (!isSeventhChord(fourth)) {
      fail(`段落 ${segment.id} 的第 4 小节必须是七和弦（GDD §6.2 / §17.1），实际 ${fourth}`);
    }
    for (const layer of segment.layers) {
      if (!ALL_LAYERS.includes(layer)) fail(`段落 ${segment.id} 引用了未知音乐层 ${layer}`);
    }
    for (const kind of REGULAR_KINDS) {
      const rate = segment.spawnRates[kind];
      if (!Number.isFinite(rate) || rate < 0) fail(`段落 ${segment.id} 的 ${kind} 生成率无效`);
    }
  }
  for (const lighting of ALL_LIGHTING) {
    if (!lightingSeen.has(lighting)) fail(`5 段里必须出现过灯光态 ${lighting}`);
  }
  if (SONG.performanceEndSec !== expectedStart) {
    fail(`最后一段结束（${expectedStart}s）应等于曲目的演奏结束（${SONG.performanceEndSec}s）`);
  }
  if (SONG.durationSec !== registry.balance.run.durationSec) {
    fail(`曲目时长（${SONG.durationSec}s）应与 balance.run.durationSec 一致`);
  }
  if (SONG.durationLabel !== '9:30') fail(`曲目时长标签应为 9:30，实际 ${SONG.durationLabel}`);
  if (registry.beatGrid.totalBars !== 304) {
    fail(`全曲小节数应为 304（9:30 @128BPM），实际 ${registry.beatGrid.totalBars}`);
  }
  if (registry.beatGrid.bpm !== SONG.bpm) fail('拍点网格 bpm 与曲目 bpm 不一致');
  if (registry.beatGrid.barsPerPhrase !== 8) fail('乐句长度应为 8 小节');

  if (chordIds.size !== 10) fail(`和弦应为 10 个，实际 ${chordIds.size}`);
  for (const [key, chord] of Object.entries(registry.chords)) {
    if (chord.id !== (key as ChordKey)) fail(`和弦 ${key} 的 id 字段与键不一致`);
    const zoneIdList: readonly ZoneId[] = ZONE_ORDER;
    for (const zoneId of zoneIdList) {
      if (typeof chord.zoneInChord[zoneId] !== 'boolean') {
        fail(`和弦 ${key} 缺少座区 ${zoneId} 的内音判定`);
      }
    }
    if (chord.zoneInChord['back-right'] !== isSeventhChord(key as ChordKey)) {
      fail(`和弦 ${key} 的七度区内音判定应与"是否七和弦"一致`);
    }
    if (!chord.zoneInChord['front-left'] || !chord.zoneInChord['front-right'] || !chord.zoneInChord['back-left']) {
      fail(`和弦 ${key} 的 1–3 区必须始终为内音`);
    }
  }

  /* ---------- 6.1 高潮事件与开场时间轴 ---------- */
  if (CLIMAX_EVENTS.length !== 3) fail(`高潮事件应为 3 个，实际 ${CLIMAX_EVENTS.length}`);
  for (let i = 1; i < CLIMAX_EVENTS.length; i += 1) {
    const previous = CLIMAX_EVENTS[i - 1];
    const current = CLIMAX_EVENTS[i];
    if (previous !== undefined && current !== undefined && current.atSec <= previous.atSec) {
      fail('高潮事件必须按时间递增');
    }
  }
  for (const climax of CLIMAX_EVENTS) {
    if (!segmentIds.has(climax.segment)) fail(`高潮事件 ${climax.id} 引用了不存在的段落 ${climax.segment}`);
    if (climax.atSec < 0 || climax.atSec > SONG.performanceEndSec) {
      fail(`高潮事件 ${climax.id} 的时间 ${climax.atSec}s 不在演奏区间内`);
    }
  }
  const firstWaveTime = registry.balance.crowdWave.times[0];
  const firstCrowdWave = CLIMAX_EVENTS.filter((event) => event.id === 'first-crowd-wave')[0];
  if (firstCrowdWave === undefined) fail('缺少高潮事件 first-crowd-wave');
  else if (firstWaveTime !== undefined && firstCrowdWave.atSec !== firstWaveTime) {
    fail(`第一次人浪时间（${firstCrowdWave.atSec}s）应与 balance.crowdWave.times[0]（${firstWaveTime}s）一致`);
  }
  const silenceClimax = CLIMAX_EVENTS.filter((event) => event.id === 'silence')[0];
  const firstBossPhase = registry.balance.boss.phases[0];
  if (silenceClimax === undefined) fail('缺少高潮事件 silence');
  else if (firstBossPhase !== undefined && silenceClimax.atSec !== firstBossPhase.startSec) {
    fail(`静默高潮时间（${silenceClimax.atSec}s）应与 Boss 第一阶段开始（${firstBossPhase.startSec}s）一致`);
  }
  const dropLight = CLIMAX_EVENTS.filter((event) => event.id === 'drop-light')[0];
  const finaleSegment = registry.segments.filter((segment) => segment.id === 'finale')[0];
  if (dropLight === undefined) fail('缺少高潮事件 drop-light');
  else if (
    finaleSegment !== undefined &&
    (dropLight.atSec < finaleSegment.startSec || dropLight.atSec > finaleSegment.endSec)
  ) {
    fail('放下光必须发生在终曲段内');
  }

  if (OPENING_HOOKS.length < 8) fail(`开场时间轴至少 8 个节点，实际 ${OPENING_HOOKS.length}`);
  if (OPENING_HOOKS[0]?.atSec !== 0) fail('开场时间轴的第一节点必须在 0s');
  for (let i = 1; i < OPENING_HOOKS.length; i += 1) {
    const previous = OPENING_HOOKS[i - 1];
    const current = OPENING_HOOKS[i];
    if (previous !== undefined && current !== undefined && current.atSec <= previous.atSec) {
      fail('开场时间轴必须按时间严格递增');
      break;
    }
  }
  if (!OPENING_HOOKS.some((hook) => hook.atSec === 72)) {
    fail('开场时间轴缺少 1:12 的"最后一排荧光棒"（90 秒门的核心节点）');
  }
  if (!OPENING_HOOKS.some((hook) => hook.atSec === 18)) {
    fail('开场时间轴缺少 0:18 的灯海钩子（A13 的 20 秒钩子）');
  }

  /* ---------- 7. 音频 / 配色 / 文案 ---------- */
  if (sfxIds.size !== 12) fail(`SFX 应为 12 个，实际 ${sfxIds.size}`);
  for (const [id, sfx] of Object.entries(registry.sfx)) {
    if (sfx.id !== (id as SfxId)) fail(`SFX ${id} 的 id 字段与键不一致`);
    if (sfx.name.trim().length === 0) fail(`SFX ${id} 缺 name`);
    if (sfx.recipe.trim().length === 0) fail(`SFX ${id} 缺 recipe`);
    if (sfx.minInterval <= 0) fail(`SFX ${id} 的 minInterval 必须 > 0`);
    if (sfx.maxConcurrent < 1) fail(`SFX ${id} 的 maxConcurrent 必须 ≥ 1`);
  }
  const audio = registry.audio;
  if (audio.choirVoices !== audio.choirZones * audio.choirLayersPerZone) {
    fail('合唱声部数应等于 区数 × 每区层数');
  }
  if (audio.choirVoices !== 12) fail(`合唱声部应为 12，实际 ${audio.choirVoices}`);
  if (audio.bandLayers.length !== 5) fail(`乐队层应为 5，实际 ${audio.bandLayers.length}`);
  if (audio.bpm !== registry.beatGrid.bpm) fail('音频 bpm 与拍点网格不一致');

  if (paletteTokenIds.size !== 17) fail(`配色 token 应为 17 个，实际 ${paletteTokenIds.size}`);
  for (const [token, hex] of Object.entries(registry.palette.tokens)) {
    if (!HEX_COLOR.test(hex)) fail(`配色 ${token} 的色值不是 #RRGGBB：${hex}`);
  }
  for (const state of ['grey', 'colored', 'black'] as const) {
    const token = registry.palette.audienceStates[state];
    if (!paletteTokenIds.has(token)) fail(`观众状态 ${state} 映射到不存在的 token ${token}`);
  }
  for (const line of ALL_LINES) {
    if (!LINE_RULES.lineIds.includes(line)) fail(`LINE_RULES 缺少乐器线 ${line}`);
  }

  const copyTriggers = new Set(registry.copy.lines.map((line) => line.trigger));
  const expectedCopyTriggers = [
    'run-start',
    'first-convert',
    'first-crowd-wave',
    'return-lock',
    'line-break',
    'silence',
    'finale-drop',
    'empty-house',
    'failure',
    'results-backstage',
  ] as const;
  for (const trigger of expectedCopyTriggers) {
    if (!copyTriggers.has(trigger)) fail(`文案缺少触发点：${trigger}`);
  }
  const backstage = registry.copy.lines.filter((line) => line.trigger === 'results-backstage');
  if (backstage.length < 4) fail(`结算后台至少 4 句（四名成员各一句），实际 ${backstage.length}`);
  for (const line of registry.copy.lines) {
    if (!KEBAB_CASE.test(line.id)) fail(`文案行 id 不是 kebab-case：${line.id}`);
    if (typeof line.render !== 'function') fail(`文案行 ${line.id} 缺 render 函数`);
  }
  for (const code of FAILURE_CODES) {
    if (registry.copy.failureReasons[code] === undefined) fail(`失败原因缺模板：${code}`);
  }
  for (const grade of ['S', 'A', 'B', 'C'] as const) {
    if (!gradeIds.has(grade)) fail(`评级缺文案：${grade}`);
  }

  /* ---------- 8. 平衡表 ---------- */
  const balance = registry.balance;
  if (balance.run.capacity !== registry.seats.capacity) {
    fail(`balance.run.capacity（${balance.run.capacity}）应等于座位容量（${registry.seats.capacity}）`);
  }
  if (balance.run.startAudience <= 0 || balance.run.startAudience > balance.run.capacity) {
    fail(`开局人数越界：${balance.run.startAudience}`);
  }
  if (balance.run.durationSec !== SONG.durationSec) fail('balance.run.durationSec 与曲目时长不一致');
  if (balance.light.offMultiplier >= balance.light.goodMultiplier) fail('错拍倍率必须小于良好倍率');
  if (balance.light.goodMultiplier >= balance.light.perfectMultiplier) {
    fail('良好倍率必须小于完美倍率');
  }
  if (balance.light.perfectMultiplier < 1.5) fail('完美倍率必须 ≥1.5（验收 AC-F05 ≥1.6×）');
  if (balance.light.offMultiplier > 0.4) fail('错拍倍率必须 ≤0.4（验收 AC-F05）');
  if (balance.crowdWave.times.length !== balance.crowdWave.thresholds.length) {
    fail('人浪的时间点与阈值数量必须一致');
  }
  if (balance.crowdWave.times.length !== 3) fail('人浪应为 3 次');
  for (let i = 1; i < balance.crowdWave.times.length; i += 1) {
    const previousTime = balance.crowdWave.times[i - 1];
    const currentTime = balance.crowdWave.times[i];
    const previousThreshold = balance.crowdWave.thresholds[i - 1];
    const currentThreshold = balance.crowdWave.thresholds[i];
    if (previousTime !== undefined && currentTime !== undefined && currentTime <= previousTime) {
      fail('人浪时间点必须递增');
    }
    if (
      previousThreshold !== undefined &&
      currentThreshold !== undefined &&
      currentThreshold <= previousThreshold
    ) {
      fail('人浪阈值必须递增');
    }
  }
  if (balance.noise.cap < balance.noise.capLow) fail('同屏噪音上限（高画质）不能低于低画质');
  if (balance.noise.spawnMinDistance >= balance.noise.spawnMaxDistance) {
    fail('噪音生成距离区间无效');
  }
  if (balance.boss.phases.length !== registry.boss.phases.length) {
    fail('balance.boss.phases 与 Boss 定义的阶段数不一致');
  }
  for (let i = 0; i < balance.boss.phases.length; i += 1) {
    const fromBalance = balance.boss.phases[i];
    const fromBoss = registry.boss.phases[i];
    if (fromBalance === undefined || fromBoss === undefined) break;
    if (fromBalance.phase !== fromBoss.phase) fail(`Boss 第 ${i + 1} 阶段 id 不一致`);
    if (fromBalance.startSec !== fromBoss.startSec || fromBalance.endSec !== fromBoss.endSec) {
      fail(`Boss 第 ${i + 1} 阶段时间与 balance.boss.phases 不一致`);
    }
  }
  if (MAX_CRACKS !== 3) fail(`裂缝上限应为 3，实际 ${MAX_CRACKS}`);
  if (balance.performance.hudHz > 10) fail('HUD 刷新频率不得高于 10Hz');

  /* ---------- 9. 展示文案完整性（每项内容都要有 name + description + id） ---------- */
  for (const zoneId of ZONE_ORDER) {
    const content = ZONE_CONTENT[zoneId];
    if (content.id !== zoneId) fail(`ZONE_CONTENT 的 ${zoneId} id 不一致`);
    if (content.name.trim().length === 0) fail(`区 ${zoneId} 缺展示名`);
    if (content.description.trim().length === 0) fail(`区 ${zoneId} 缺一句话说明`);
  }
  for (const key of Object.keys(registry.chords) as ChordKey[]) {
    const content = CHORD_CONTENT[key];
    if (content.id !== key) fail(`CHORD_CONTENT 的 ${key} id 不一致`);
    if (content.name.trim().length === 0) fail(`和弦 ${key} 缺展示名`);
    if (content.description.trim().length === 0) fail(`和弦 ${key} 缺一句话说明`);
  }
  for (const segment of registry.segments) {
    const content = SEGMENT_CONTENT[segment.id];
    if (content.id !== segment.id) fail(`SEGMENT_CONTENT 的 ${segment.id} id 不一致`);
    if (content.name.trim().length === 0) fail(`段落 ${segment.id} 缺展示名`);
    if (content.description.trim().length === 0) fail(`段落 ${segment.id} 缺一句话说明`);
  }
  for (const moment of registry.moments) {
    const name = MOMENT_NAMES[moment.id];
    if (name === undefined || name.trim().length === 0) fail(`角色瞬间 ${moment.id} 缺展示名`);
    if (moment.description.trim().length === 0) fail(`角色瞬间 ${moment.id} 缺说明`);
  }
  if (SONG.title.trim().length === 0) fail('曲目缺标题');
  if (STAGE_LAYOUT.venue.trim().length === 0) fail('场馆缺名称');
  if (STAGE_LAYOUT.description.trim().length === 0) fail('场馆缺说明');
  if (registry.boss.name.trim().length === 0) fail('Boss 缺名称');
  for (const build of Object.values(registry.builds)) {
    if (build.name.trim().length === 0) fail(`构筑 ${build.id} 缺名称`);
  }
  for (const evolution of Object.values(registry.evolutions)) {
    if (evolution.name.trim().length === 0) fail(`进化 ${evolution.id} 缺名称`);
    if (evolution.description.trim().length === 0) fail(`进化 ${evolution.id} 缺说明`);
  }
  for (const form of Object.values(registry.lightForms)) {
    if (form.name.trim().length === 0) fail(`光形态 ${form.id} 缺名称`);
    if (form.description.trim().length === 0) fail(`光形态 ${form.id} 缺说明`);
  }
  for (const line of ALL_LINES) {
    const label = LINE_RULES.lineLabels[line];
    if (label === undefined || label.trim().length === 0) fail(`乐器线 ${line} 缺展示名`);
  }

  return problems;
}

/* ==========================================================================
 * 3. 全量再导出（逻辑/渲染/音频层可以直接按表名 import）
 * ========================================================================== */

export * from './characters';
export * from './cards';
export * from './noise';
export * from './segments';
export * from './chords';
export * from './seats';
export * from './copy';
export * from './palette';
export * from './balance';
