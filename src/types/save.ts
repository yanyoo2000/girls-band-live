/**
 * 存档类型契约（纯类型模块）。
 *
 * - 本文件不 import 任何模块；`game.ts` / `data.ts` / `ui.ts` 只单向依赖本文件；
 * - 存档 key 固定为 `gbl.save.v1`；只存设置、记录、解锁，不存局内进度；
 * - 任何读取失败都必须回退默认值且不阻塞启动（见 docs/tech-spec.md §9）。
 */

/* ==========================================================================
 * 1. 设置
 * ========================================================================== */

/** 画质档：高（DPR 1.5）/低（DPR 1.0，实例与粒子减半）。 */
export type QualityLevel = 'high' | 'low';

/** 持久化设置（写入 `gbl.save.v1.settings`）。 */
export interface SettingsV1 {
  /** 主音量 0..1。 */
  master: number;
  /** 音乐音量 0..1。 */
  music: number;
  /** 音效音量 0..1。 */
  sfx: number;
  quality: QualityLevel;
  /** 减少动态：关屏震、光锥脉动、人浪起伏减半、闪白 1 帧。 */
  reducedMotion: boolean;
  /** 高对比：描边 2px、背景再暗 10%、四区加形状编码。 */
  highContrast: boolean;
  /** 节拍脉冲：舞台脚下拍点是否脉动（关声可玩仍保留视觉节拍环）。 */
  beatPulse: boolean;
  /** 低闪：全屏白闪 ≤1 帧、≤3Hz。 */
  lowFlash: boolean;
}

/** 显示相关设置的只读视图（渲染层与 UI 共用）。 */
export interface DisplaySettings {
  readonly quality: QualityLevel;
  readonly reducedMotion: boolean;
  readonly highContrast: boolean;
  readonly beatPulse: boolean;
  readonly lowFlash: boolean;
}

/* ==========================================================================
 * 2. 记录
 * ========================================================================== */

/** 最近一局的摘要（结算后可回看；不含局内进度）。 */
export interface LastRunRecord {
  /** ISO 日期（YYYY-MM-DD）。 */
  date: string;
  audience: number;
  converted: number;
  burned: number;
  rank: string;
  /** 到达的段落数 0..5。 */
  segments: number;
}

/** 最佳记录（写入 `gbl.save.v1.records`）。 */
export interface RecordsV1 {
  bestAudience: number;
  /** 最长存活秒数。 */
  bestTime: number;
  /** 完成终曲次数。 */
  clears: number;
  /** 空场完成次数。 */
  emptyHouse: number;
  /** S/A/B/C 中的最高评级；无记录为 "-"。 */
  bestRank: string;
  lastRun: LastRunRecord;
}

/* ==========================================================================
 * 3. 解锁（卡牌图鉴 / 角色瞬间已见标记；不含养成数值）
 * ========================================================================== */

/** 解锁记录（写入 `gbl.save.v1.unlocks`）。 */
export interface UnlocksV1 {
  /** 见过的卡 id（CardId 的字符串形式，避免跨文件依赖）。 */
  cardsSeen: string[];
  /** 见过的角色瞬间 id。 */
  momentsSeen: string[];
}

/* ==========================================================================
 * 4. 根对象与读写结果
 * ========================================================================== */

/** 存档根对象（版本固定为 1）。 */
export interface SaveDataV1 {
  version: 1;
  settings: SettingsV1;
  records: RecordsV1;
  unlocks: UnlocksV1;
}

/** 读取结果的三种情形：全新、成功、损坏回退。 */
export type SaveLoadStatus = 'fresh' | 'loaded' | 'recovered';

/** 读取结果（永远返回可用存档；`reasons` 只用于诊断）。 */
export interface SaveLoadResult {
  readonly data: SaveDataV1;
  readonly status: SaveLoadStatus;
  readonly reasons: readonly string[];
}

/** 存档写入端（实现于 src/platform/local-storage.ts，注入给 game）。 */
export interface SavePort {
  load(): SaveLoadResult;
  /** 写入失败静默降级；返回是否真的写成功（仅用于测试断言）。 */
  save(data: SaveDataV1, reason: 'settings' | 'run-end' | 'unlock'): boolean;
  /** 备份损坏内容到 `gbl.save.v1.bad`（只读诊断，不进 UI）。 */
  backupCorrupted(raw: string): void;
  /** 清空（仅 QA 与「重置设置」使用）。 */
  clear(): void;
}

/** 最小存储接口（避免依赖 DOM lib；localStorage 由适配器包装）。 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 设置合并结果（缺字段 → 默认值；非法值 → 默认值）。 */
export interface SettingsPatch {
  readonly settings: SettingsV1;
  readonly changed: readonly (keyof SettingsV1)[];
}
