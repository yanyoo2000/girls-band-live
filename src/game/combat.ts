/**
 * 战斗结算（dev-combat）。
 *
 * 职责：把「光」这一唯一武器翻译成伤害与唱化产出——持续烧穿、每小节一次的合唱波、
 * 点燃脉冲、唱化结算、进化窗口。光/观众/座区的状态由 dev-engine 拥有，本文件只读
 * `run.light` / `run.audience`，绝不写回（伤害只作用于 `run.noises` 与
 * `run.returnListener`，两者归 dev-combat）。
 *
 * 约束（docs/tech-spec.md §5.3）：
 * - 导出签名严格对齐：`resolveChoirWave(run, data, dt)`、`resolveIgniteDamage(run, zones, multiplier)`；
 * - 纯逻辑：不 import react/three，不触 DOM，不调用全局随机数与系统时钟；
 * - 无动态类型兜底、无编译指令屏蔽；内容与倍率全部读 DataRegistry（不硬编码卡效果）。
 *
 * 关于「伤害基数」：GDD 只锁定倍率（点燃 1.6/1.2/0.4、光形态 0.6/2.2/1.8、和弦 ±25%），
 * 未锁定基数，`BalanceConfig` 也没有对应字段（types 已冻结）。因此把一组「GDD 有、数据没有」
 * 的数值集中在本文件顶部，并在报告中列为待 tech-director 扩展 BalanceConfig 的项；
 * 这样调参只需改一处，且 `tests/combat.test.ts` 可以直接断言这些常量。
 */

import type { Meters, NoiseEntity, Ratio, RunState, Seconds, Vec2, ZoneId } from '../types/game';
import type { DataRegistry, EvolutionDef, ModifierKey } from '../types/data';
import { collectModifiers } from './progression';
import { countPresent } from './audience';
import { countActiveNoises, segmentAt, zoneAtPoint, zoneCenterOf } from './waves';

/** 一次结算的产出（由 store 落账到 RunStats / 观众）。 */
export interface DamageResult {
  /** 被烧死的噪音数（不产出观众，GDD §8.1）。 */
  readonly burned: number;
  /** 唱化完成的噪音数（精英算 1 只）。 */
  readonly sung: number;
  /** 唱化产出的人数（已经乘过进化/卡倍率）。 */
  readonly converted: number;
}

/* ==========================================================================
 * GDD 锁定、但 BalanceConfig 未覆盖的常量（待技术总监扩展 balance 后迁移）
 * ========================================================================== */

/**
 * 点燃/烧穿的伤害基数。GDD §6.1 只给倍率，这里取 6 使三档点燃对 12/18/90 HP
 * 形成可读差异：束光完美 6×2.2×1.6×1.25≈26（秒 12/18），错拍 6×2.2×0.4×0.75≈4（打不死）；
 * 散光完美 6×0.6×1.6×1.25≈7.2（要两下）——「束光救火、散光铺场」因此成立。
 */
export const IGNITE_BASE_DAMAGE = 6;

/** 合唱波射程（GDD §6.2「向 12m 内最近的噪音发一道波」）。 */
export const CHOIR_WAVE_RANGE: Meters = 12;

/** 四区同一小节都开火时的和弦波倍率（GDD §6.2「四区同时开火＝和弦波 ×1.5」）。 */
export const ALL_ZONE_WAVE_MULTIPLIER = 1.5;

/** 热度 4 档的该区输出加成（GDD §7.5「4 档该区输出 +25%」）。 */
export const HEAT_FOUR_OUTPUT_MULTIPLIER = 1.25;

/** 烧穿连锁的相邻半径（GDD §10.2「连锁相邻 1 只」；半径未锁定，取 6m）。 */
export const BURN_CHAIN_RADIUS: Meters = 6;

/** 烧死留下的黑烟时长（GDD §8.1「留下 0.5s 黑烟」）。 */
const BURN_SMOKE_SECONDS: Seconds = 0.5;

/** 进化窗口与一次性效果（按 run 键控；RunState 无进化计时字段）。 */
interface CombatLedger {
  lastChoirBar: number;
  evolution: string | null;
  evolutionStartedAt: Seconds;
  soloCleared: boolean;
}

const ledgers = new WeakMap<RunState, CombatLedger>();

function ledgerFor(run: RunState): CombatLedger {
  const existing = ledgers.get(run);
  if (existing) return existing;
  const created: CombatLedger = {
    lastChoirBar: -1,
    evolution: null,
    evolutionStartedAt: 0,
    soloCleared: false,
  };
  ledgers.set(run, created);
  return created;
}

/* ==========================================================================
 * 卡效果读取（战斗侧只读子集）
 * ========================================================================== */

/**
 * 读一张卡的合成效果（同名 key 累加、上限类取 max）。
 *
 * 合成规则只有一处实现：`progression.collectModifiers()`（tech-spec §7.3 / §5.2，内部复用
 * `upgrades.modifierTotals()` 的缓存与 `MODIFIER_FOLD` 白名单）。本函数是战斗侧的薄封装，
 * 让 `resolveChoirWave` 的固定签名（不含 runtime 参数）也能读到卡效果；
 * 同时给 enemies / 后续模块一个稳定接缝，换成注入式 runtime 时只需改这里。
 */
export function combatModifier(run: RunState, data: DataRegistry, key: ModifierKey): number {
  return collectModifiers(run.build, data).get(key) ?? 0;
}

/* ==========================================================================
 * 对外结算入口
 * ========================================================================== */

/**
 * 合唱波（每 4 拍 = 每小节一次）与烧穿结算；返回本帧产出。
 *
 * 一个固定步长内做四件事（顺序固定，避免同帧重复计数）：
 * 1) 唱化结算：`singProgress` 到 1 的噪音转成观众（GDD §7.2 / §8.1）；
 * 2) 进化一次性效果：独奏会触发瞬间清空光锥内噪音（GDD §10.3）；
 * 3) 持续烧穿：光锥内噪音按光形态 burnMultiplier × 基数/秒 掉血；
 * 4) 合唱波：小节切换时四区各向 12m 内最近噪音开火。
 *
 * 静默段（Boss 阶段 1）只抽走声音，不抽走自动攻击：观众仍在唱，波照常开火。
 */
export function resolveChoirWave(run: RunState, data: DataRegistry, dt: Seconds): DamageResult {
  if (dt <= 0) return EMPTY_DAMAGE;
  let burned = 0;
  let sung = 0;
  let converted = 0;

  const settled = settleSungNoises(run, data);
  sung += settled.sung;
  converted += settled.converted;

  burned += applyEvolutionBurst(run, data);
  burned += applyContinuousBurn(run, data, dt);

  const wave = fireChoirWave(run, data);
  burned += wave.burned;
  sung += wave.sung;
  converted += wave.converted;

  return { burned, sung, converted };
}

/**
 * 点燃脉冲对噪音的结算；`multiplier` 由 `light.evaluateIgnite` 给出
 * （已含完美/良好/错拍 × 和弦内/外 × 扫场奖励）。
 *
 * `zones` 为点燃命中的座区（通常 1 个）；空数组表示点燃落在走道/舞台（无座区归属），
 * 此时只按光锥范围结算。唱化只由 `resolveChoirWave` 结算，本函数 `sung` 恒为 0。
 */
export function resolveIgniteDamage(
  run: RunState,
  data: DataRegistry,
  zones: readonly ZoneId[],
  multiplier: number,
): DamageResult {
  if (multiplier <= 0) return EMPTY_DAMAGE;
  const form = data.lightForms[run.light.mode];
  const burnMultiplier =
    form.burnMultiplier * (1 + Math.max(0, combatModifier(run, data, 'burn-multiplier')));
  const amount = IGNITE_BASE_DAMAGE * burnMultiplier * multiplier;
  const hitZones = new Set<ZoneId>(zones);

  let burned = 0;
  for (const entity of run.noises) {
    if (!entity.active || entity.state === 'dying') continue;
    if (!isInLight(run, entity.position, entity.radius)) continue;
    if (hitZones.size > 0) {
      const zone = zoneAtPoint(data, entity.position);
      if (zone === null || !hitZones.has(zone)) continue;
    }
    burned += damageNoise(run, data, entity, amount, true);
  }
  burned += damageReturnListener(run, data, amount);
  return { burned, sung: 0, converted: 0 };
}

/* ==========================================================================
 * 合唱波
 * ========================================================================== */

/** 合唱波的单区伤害（纯函数，可单测；公式见 GDD §6.2 + §7.5 + §10.2）。 */
export function choirDamageForZone(run: RunState, data: DataRegistry, zone: ZoneId): number {
  const zoneState = run.zones[zone];
  const singers = countZoneColored(run, data, zone);
  const heatFactor = 0.5 + 0.5 * zoneState.heat;
  const chord = chordFactor(run, data, zone);
  const allZones40 = data.zones.every((zone) => countPresent(run.audience, zone.id) >= 40);
  const waveCard = Math.max(0, combatModifier(run, data, 'wave-damage-multiplier'));
  const cardBonus =
    1 +
    (allZones40 ? waveCard : 0) +
    Math.max(0, combatModifier(run, data, 'all-zone-damage-multiplier')) +
    Math.max(0, combatModifier(run, data, 'zone-output-multiplier'));
  const perNoise = Math.max(0, combatModifier(run, data, 'damage-per-noise'));
  const noiseBonus = Math.min(0.3, perNoise * countActiveNoises(run));
  const heatFour = zoneState.heat >= 4 ? HEAT_FOUR_OUTPUT_MULTIPLIER : 1;
  const evolution = evolutionDamageMultiplier(run, data);
  return singers * heatFactor * chord * cardBonus * (1 + noiseBonus) * heatFour * evolution;
}

/** 合唱波：小节切换时开火一次；返回产出。 */
function fireChoirWave(run: RunState, data: DataRegistry): DamageResult {
  const ledger = ledgerFor(run);
  const bar = run.musical.bar;
  if (ledger.lastChoirBar === bar) return EMPTY_DAMAGE;
  ledger.lastChoirBar = bar;

  const targets: { target: WaveTarget; zone: ZoneId }[] = [];
  for (const zoneDef of data.zones) {
    const target = findWaveTarget(run, data, zoneDef.id);
    if (target) targets.push({ target, zone: zoneDef.id });
  }
  if (targets.length === 0) return EMPTY_DAMAGE;

  // 四区同时开火 → 和弦波 ×1.5（GDD §6.2）。
  const chordWave = targets.length === data.zones.length ? ALL_ZONE_WAVE_MULTIPLIER : 1;
  let burned = 0;
  for (const entry of targets) {
    const damage = choirDamageForZone(run, data, entry.zone) * chordWave;
    if (damage <= 0) continue;
    burned += damageWaveTarget(run, data, entry.target, damage);
  }
  return { burned, sung: 0, converted: 0 };
}

/** 波的落点：普通噪音或场上的返听。 */
interface WaveTarget {
  readonly entity: NoiseEntity | null;
  readonly position: Vec2;
  readonly listener: boolean;
}

/** 某区 12m 内最近的噪音（含返听）；没有则 null。 */
function findWaveTarget(run: RunState, data: DataRegistry, zone: ZoneId): WaveTarget | null {
  const center = zoneCenterOf(data, zone);
  let best: WaveTarget | null = null;
  let bestDistance = CHOIR_WAVE_RANGE;
  for (const entity of run.noises) {
    if (!entity.active || entity.state === 'dying') continue;
    const distance = distanceXZ(center, entity.position);
    if (distance <= bestDistance) {
      best = { entity, position: entity.position, listener: false };
      bestDistance = distance;
    }
  }
  const listener = run.returnListener;
  if (listener.active && listener.anchor) {
    const distance = distanceXZ(center, listener.anchor);
    if (distance <= bestDistance) {
      best = { entity: null, position: listener.anchor, listener: true };
    }
  }
  return best;
}

function damageWaveTarget(
  run: RunState,
  data: DataRegistry,
  target: WaveTarget,
  amount: number,
): number {
  if (target.listener) return damageReturnListener(run, data, amount);
  if (!target.entity) return 0;
  return damageNoise(run, data, target.entity, amount, false);
}

/* ==========================================================================
 * 伤害、烧穿、连锁
 * ========================================================================== */

/** 光锥内的持续烧穿（每秒）；倍率取当前光形态的 burnMultiplier。 */
function applyContinuousBurn(run: RunState, data: DataRegistry, dt: Seconds): number {
  const form = data.lightForms[run.light.mode];
  const perSecond =
    IGNITE_BASE_DAMAGE *
    form.burnMultiplier *
    (1 + Math.max(0, combatModifier(run, data, 'burn-multiplier')));
  const amount = perSecond * dt;
  let burned = 0;
  for (const entity of run.noises) {
    if (!entity.active || entity.state === 'dying') continue;
    if (!isInLight(run, entity.position, entity.radius)) continue;
    burned += damageNoise(run, data, entity, amount, false);
  }
  burned += damageReturnListener(run, data, amount);
  return burned;
}

/**
 * 对一只噪音施加伤害；返回本次造成的烧死数（0 或 1）。
 * 烧死：无经验、无观众，留 0.5s 黑烟（GDD §8.1）；「烧穿」卡按确定性掷骰连锁相邻 1 只。
 */
function damageNoise(
  run: RunState,
  data: DataRegistry,
  entity: NoiseEntity,
  amount: number,
  allowChain: boolean,
): number {
  if (!entity.active || entity.state === 'dying' || amount <= 0) return 0;
  entity.hp -= amount;
  if (entity.hp > 0) return 0;
  entity.hp = 0;
  entity.state = 'dying';
  entity.remaining = BURN_SMOKE_SECONDS;
  entity.velocity = { x: 0, z: 0 };
  entity.singProgress = 0;

  let burned = 1;
  if (allowChain) {
    const chance = Math.max(0, Math.min(1, combatModifier(run, data, 'burn-chain-chance')));
    if (chance > 0 && deterministicRoll(entity.id, entity.kind) < chance) {
      const neighbor = nearestNoise(run, entity.position, entity.id, BURN_CHAIN_RADIUS);
      if (neighbor) burned += damageNoise(run, data, neighbor, amount, false);
    }
  }
  return burned;
}

/** 对场上的返听施加伤害；烧死不产出观众（GDD §8.2）。 */
function damageReturnListener(run: RunState, data: DataRegistry, amount: number): number {
  const listener = run.returnListener;
  if (!listener.active || !listener.anchor || amount <= 0) return 0;
  if (!isInLight(run, listener.anchor, data.noise['return-listener'].radius)) return 0;
  listener.hp -= amount;
  if (listener.hp > 0) return 0;
  listener.hp = 0;
  listener.active = false;
  listener.locked = false;
  listener.lockSeconds = 0;
  return 1;
}

/** 最近的另一只噪音（连锁用）；没有则 null。 */
function nearestNoise(
  run: RunState,
  position: Vec2,
  excludeId: number,
  maxDistance: Meters,
): NoiseEntity | null {
  let best: NoiseEntity | null = null;
  let bestDistance = maxDistance;
  for (const entity of run.noises) {
    if (!entity.active || entity.state === 'dying' || entity.id === excludeId) continue;
    const distance = distanceXZ(position, entity.position);
    if (distance <= bestDistance) {
      best = entity;
      bestDistance = distance;
    }
  }
  return best;
}

/* ==========================================================================
 * 唱化、进化
 * ========================================================================== */

/** 唱化结算：`singProgress ≥ 1` 的噪音转成观众（GDD §7.2「1 只噪音＝2 名观众」）。 */
function settleSungNoises(
  run: RunState,
  data: DataRegistry,
): { readonly sung: number; readonly converted: number } {
  let sung = 0;
  let converted = 0;
  const normalRatio = noiseConversionValue(run, data);
  for (const entity of run.noises) {
    if (!entity.active || entity.state !== 'singing') continue;
    if (entity.singProgress < 1) continue;
    entity.state = 'dying';
    entity.remaining = BURN_SMOKE_SECONDS;
    entity.velocity = { x: 0, z: 0 };
    entity.singProgress = 1;
    sung += 1;
    converted +=
      entity.kind === 'return-listener' ? returnListenerConversion(run, data) : normalRatio;
  }
  return { sung, converted };
}

/** 唱化产出人数：默认 `balance.conversion.noiseToAudience`，黑潮返场时 1:4（GDD §10.3）。 */
export function noiseConversionValue(run: RunState, data: DataRegistry): number {
  const evolution = activeEvolution(run, data);
  if (evolution && evolution.effect.kind === 'black-tide-encore') {
    return evolution.effect.waveConvertRatio;
  }
  const waveConvert = Math.max(0, combatModifier(run, data, 'wave-convert-count'));
  return Math.max(data.balance.conversion.noiseToAudience, waveConvert);
}

/** 返听唱化产出（20 人，GDD §8.2）再乘「返听诱饵」；enemies 唱化结算与本文件共用同一公式。 */
export function returnListenerConversion(run: RunState, data: DataRegistry): number {
  const multiplier = 1 + Math.max(0, combatModifier(run, data, 'return-listener-sing-multiplier'));
  return data.balance.conversion.returnListenerToAudience * multiplier;
}

/** 进化窗口（每局一次；窗口时长读 `EvolutionDef.duration`）。 */
function activeEvolution(run: RunState, data: DataRegistry): EvolutionDef | null {
  const id = run.build.evolution;
  if (!id) return null;
  const ledger = ledgerFor(run);
  if (ledger.evolution !== id) {
    ledger.evolution = id;
    ledger.evolutionStartedAt = run.time;
    ledger.soloCleared = false;
  }
  const def = data.evolutions[id];
  const elapsed = run.time - ledger.evolutionStartedAt;
  return elapsed <= def.duration ? def : null;
}

/** 进化伤害倍率（合唱场 ×2 / 独奏会 ×2 / 黑潮返场不直接加伤）。 */
function evolutionDamageMultiplier(run: RunState, data: DataRegistry): number {
  const evolution = activeEvolution(run, data);
  if (!evolution) return 1;
  return evolution.effect.kind === 'black-tide-encore' ? 1 : evolution.effect.damageMultiplier;
}

/** 独奏会触发瞬间：光锥内噪音全灭（GDD §10.3）；返回烧死数。 */
function applyEvolutionBurst(run: RunState, data: DataRegistry): number {
  const evolution = activeEvolution(run, data);
  const ledger = ledgerFor(run);
  if (!evolution || evolution.effect.kind !== 'solo-show' || ledger.soloCleared) return 0;
  ledger.soloCleared = true;
  let burned = 0;
  for (const entity of run.noises) {
    if (!entity.active || entity.state === 'dying') continue;
    if (!isInLight(run, entity.position, entity.radius)) continue;
    entity.hp = 0;
    entity.state = 'dying';
    entity.remaining = BURN_SMOKE_SECONDS;
    entity.velocity = { x: 0, z: 0 };
    burned += 1;
  }
  burned += damageReturnListener(run, data, Number.POSITIVE_INFINITY);
  return burned;
}

/* ==========================================================================
 * 几何与计数
 * ========================================================================== */

/** 点是否在光锥内（含实体半径）。 */
function isInLight(run: RunState, point: Vec2, radius: Meters): boolean {
  return distanceXZ(point, run.light.position) <= run.light.radius + radius;
}

function distanceXZ(a: Vec2, b: Vec2): Meters {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/** 某区「已转彩」人数（合唱波只由自己人唱，灰/黑不发声）。 */
function countZoneColored(run: RunState, data: DataRegistry, zone: ZoneId): number {
  const def = data.zones.find((item) => item.id === zone);
  if (!def) return 0;
  const cols = data.seats.cols;
  const state = run.audience.state;
  let count = 0;
  for (let row = def.rowRange[0]; row <= def.rowRange[1]; row += 1) {
    for (let col = def.colRange[0]; col <= def.colRange[1]; col += 1) {
      if ((state[row * cols + col] ?? 0) === 2) count += 1;
    }
  }
  return count;
}

/** 当前小节的和弦系数：内音 +25% / 外音 −25%（复用 GDD §6.1 的和弦窗口）。 */
function chordFactor(run: RunState, data: DataRegistry, zone: ZoneId): number {
  const segment = segmentAt(run, data);
  const chords = segment ? segment.chords : [];
  if (chords.length === 0) return 1;
  const key = chords[run.musical.bar % chords.length];
  if (!key) return 1;
  const chord = data.chords[key];
  const inChord = chord.zoneInChord[zone];
  return inChord
    ? 1 + data.balance.light.inChordBonus
    : 1 - data.balance.light.outChordPenalty;
}

/** 确定性掷骰（0..1）：不引入 Rng 入参也不破坏可复现性。 */
function deterministicRoll(a: number, b: string): Ratio {
  let hash = (a ^ 0x9e3779b9) >>> 0;
  for (let index = 0; index < b.length; index += 1) {
    hash = Math.imul(hash ^ b.charCodeAt(index), 0x85ebca6b) >>> 0;
    hash ^= hash >>> 13;
  }
  return (hash >>> 8) / 0xffffff;
}

const EMPTY_DAMAGE: DamageResult = { burned: 0, sung: 0, converted: 0 };
