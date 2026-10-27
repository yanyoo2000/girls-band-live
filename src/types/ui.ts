/**
 * React UI 层类型契约（纯类型模块）。
 *
 * 依赖：`./game`、`./save`、`./data` 的类型；**不得 import react / three**。
 * UI 只消费只读快照与命令，不直接操作 Three 对象，也不每帧 setState。
 */

import type {
  BuildId,
  CardId,
  CardOffer,
  EndingKind,
  FailureCard,
  Grade,
  HudSnapshot,
  MemberId,
  RunStats,
  TelemetryRun,
} from './game';
import type { DisplaySettings, QualityLevel, SaveDataV1, SettingsV1 } from './save';
import type { CardDef, ChordKey, CopyLineDef, DataRegistry, PaletteToken } from './data';

/* ==========================================================================
 * 1. 屏幕与路由
 * ========================================================================== */

/** 全部屏幕（桌面 UI 全流程）。 */
export type ScreenId =
  | 'boot'
  | 'menu'
  | 'setlist'
  | 'rehearsal'
  | 'settings'
  | 'credits'
  | 'playing'
  | 'paused'
  | 'levelup'
  | 'results';

/** 覆盖层（可叠加在 playing 之上；同时只允许一个）。 */
export type OverlayKind = 'none' | 'pause' | 'levelup' | 'failure' | 'settings' | 'confirm-quit';

/** 当前路由。 */
export interface UiRoute {
  readonly screen: ScreenId;
  readonly overlay: OverlayKind;
  /** 返回目标（Esc 用）。 */
  readonly backTo: ScreenId | null;
}

/* ==========================================================================
 * 2. 各屏视图模型（全部只读；由 ui/bridge 生成，UI 不计算玩法）
 * ========================================================================== */

/** 主菜单。 */
export interface MenuView {
  readonly title: string;
  readonly band: string;
  readonly members: readonly {
    readonly id: MemberId;
    readonly name: string;
    readonly colorToken: PaletteToken;
  }[];
  readonly best: {
    readonly audience: number;
    readonly time: string;
    readonly rank: string;
    readonly clears: number;
  };
  readonly canStart: boolean;
}

/** 后台曲目单（上一局真实数据驱动的四句话）。 */
export interface SetlistView {
  readonly lines: readonly CopyLineDef[];
  readonly hasPreviousRun: boolean;
}

/** 排练室（三页玩法说明）。 */
export interface RehearsalView {
  readonly pages: readonly {
    readonly title: string;
    readonly body: readonly string[];
    readonly diagram: 'light' | 'burn-or-sing' | 'return-listener';
  }[];
  readonly current: 0 | 1 | 2;
}

/** 设置。 */
export interface SettingsView {
  readonly settings: SettingsV1;
  readonly audioUnlocked: boolean;
}

/** 升级三选一。 */
export interface LevelUpView {
  readonly offer: CardOffer;
  readonly cards: readonly CardDef[];
  /** 本局当前构筑摘要。 */
  readonly build: {
    readonly core: CardId | null;
    readonly coreName: string | null;
    readonly build: BuildId | null;
    readonly picks: number;
    readonly maxPicks: number;
    readonly evolutionName: string | null;
  };
}

/** 暂停面板。 */
export interface PauseView {
  readonly elapsed: string;
  readonly segmentName: string;
  readonly coreName: string | null;
  readonly cards: readonly CardDef[];
  readonly canRestart: boolean;
}

/** 结算页。 */
export interface ResultView {
  readonly ending: EndingKind;
  readonly grade: Grade | null;
  readonly stats: RunStats;
  readonly emptySeats: number;
  readonly secondRowEmpty: number;
  readonly zoneCounts: Readonly<Record<string, number>>;
  readonly backstageLines: readonly CopyLineDef[];
  /** 本局是否刷新最佳记录（UI 只展示，不写存档）。 */
  readonly newBestAudience: boolean;
  readonly newBestRank: boolean;
}

/** 失败卡（3 秒可读，三条原因 + 1 秒回放）。 */
export interface FailureView {
  readonly card: FailureCard;
  /** 三条已本地化的中文原因。 */
  readonly reasons: readonly [string, string, string];
  readonly where: string;
  readonly lastFiveSeconds: string;
  readonly skippable: boolean;
}

/** 曲目信息（结算与主菜单复用）。 */
export interface SongView {
  readonly title: string;
  readonly key: ChordKey;
  readonly durationLabel: string;
  readonly segments: readonly string[];
}

/** 制作名单。 */
export interface CreditsView {
  readonly roles: readonly { readonly role: string; readonly members: readonly string[] }[];
  readonly notice: string;
}

/** 轻提示（非阻塞，例如「已静音」）。 */
export interface ToastView {
  readonly id: number;
  readonly text: string;
  readonly tone: 'info' | 'warn';
}

/** 整个 UI 的只读状态（useSyncExternalStore 的快照）。 */
export interface UiState {
  readonly revision: number;
  readonly route: UiRoute;
  readonly menu: MenuView;
  readonly setlist: SetlistView;
  readonly rehearsal: RehearsalView;
  readonly settings: SettingsView;
  readonly song: SongView;
  readonly credits: CreditsView;
  readonly levelUp: LevelUpView | null;
  readonly pause: PauseView | null;
  readonly result: ResultView | null;
  readonly failure: FailureView | null;
  readonly toast: ToastView | null;
  readonly display: DisplaySettings;
  readonly audioUnlocked: boolean;
}

/* ==========================================================================
 * 3. HUD 绑定（≤10Hz，禁止每帧 setState）
 * ========================================================================== */

/** HUD 订阅面：React 用 `useSyncExternalStore` 绑定这两个方法。 */
export interface HudStore {
  /** 返回稳定引用的快照；内容变化时才产生新对象。 */
  getSnapshot(): HudSnapshot;
  subscribe(listener: () => void): () => void;
}

/** UI 状态订阅面。 */
export interface UiStore {
  getSnapshot(): UiState;
  subscribe(listener: () => void): () => void;
}

/** HUD 的渲染配置（由设置派生，不进快照以免每拍变引用）。 */
export interface HudStyle {
  readonly reducedMotion: boolean;
  readonly highContrast: boolean;
  readonly lowFlash: boolean;
  readonly beatPulse: boolean;
  readonly palette: Readonly<Record<PaletteToken, string>>;
}

/* ==========================================================================
 * 4. UI → game / 平台 的命令
 * ========================================================================== */

/** UI 可以发出的全部命令（单一入口，便于审计）。 */
export type UiCommand =
  | { readonly type: 'start-run'; readonly seed: number | null }
  | { readonly type: 'restart-run'; readonly seed: number | null }
  | { readonly type: 'quit-run' }
  | { readonly type: 'pause' }
  | { readonly type: 'resume' }
  | { readonly type: 'choose-card'; readonly cardId: CardId }
  | { readonly type: 'encore' }
  | { readonly type: 'continue-solo' }
  | { readonly type: 'skip-empty-house' }
  | { readonly type: 'navigate'; readonly screen: ScreenId }
  | { readonly type: 'open-overlay'; readonly overlay: OverlayKind }
  | { readonly type: 'close-overlay' }
  | { readonly type: 'update-settings'; readonly patch: Partial<SettingsV1> }
  | { readonly type: 'set-quality'; readonly quality: QualityLevel }
  | { readonly type: 'unlock-audio' }
  | { readonly type: 'dismiss-toast' }
  | { readonly type: 'toggle-fullscreen' };

/** UI 桥（实现于 src/ui/bridge.ts；main 创建并注入 React）。 */
export interface UiBridge {
  readonly ui: UiStore;
  readonly hud: HudStore;
  dispatch(command: UiCommand): void;
  /** 每帧由 loop 调用一次，由桥内部节流到 ≤10Hz 后才通知订阅者。 */
  publishHud(): void;
  /** 屏幕/覆盖层状态变化时调用（低频）。 */
  publishUi(): void;
  /** 卸载（移除订阅、清空 toast 计时器）。 */
  dispose(): void;
}

/* ==========================================================================
 * 5. QA / 埋点面板（仅 dev 构建启用）
 * ========================================================================== */

/** 90 秒门埋点面板。 */
export interface TelemetryPanelView {
  readonly enabled: boolean;
  readonly run: TelemetryRun | null;
  readonly lastExportName: string | null;
}

/** 开发模式能力开关（由 main 通过 `?dev=1` 或构建常量注入，UI 只读）。 */
export interface DevFlags {
  readonly devTools: boolean;
  readonly telemetry: boolean;
  readonly runMode: 'normal' | 'gate-90s';
}

/** 帧率采样（QA 面板展示，不进入战斗 HUD）。 */
export interface PerfSample {
  readonly fps: number;
  readonly frameMs: number;
  readonly simMs: number;
  readonly renderMs: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly dpr: number;
}

/** UI 启动依赖（main 注入；避免 UI 直接 import 实现）。 */
export interface UiBootstrap {
  readonly data: DataRegistry;
  readonly save: SaveDataV1;
  readonly song: SongView;
  readonly dev: DevFlags;
}
