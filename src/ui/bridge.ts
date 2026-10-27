/**
 * UI 桥（dev-ui）。
 *
 * 职责边界（tech-spec §5.6 / §6）：
 * - 把 `GameStore` 的只读快照翻译成 `UiState` / `HudSnapshot`；
 * - 把 UI 命令翻译成 `GameCommand`，屏幕路由只在这里改；
 * - HUD 通知节流到 ≤10Hz，UI 状态变化低频通知；
 * - 设置 250ms 防抖写存档；结算写一次 records；
 * - 不 import three，不直接改游戏状态，不创建渲染/音频单例。
 */

import type { CardDef, CopyContext, DataRegistry } from '../types/data';
import type {
  CardId,
  CardOffer,
  FailureCard,
  GameEvent,
  Grade,
  HudSnapshot,
  RunPhase,
  RunResult,
  RunState,
  SegmentId,
  Vec2,
  ZoneId,
} from '../types/game';
import type { RecordsV1, SaveDataV1, SavePort, SettingsV1 } from '../types/save';
import type {
  CreditsView,
  FailureView,
  HudStore,
  LevelUpView,
  MenuView,
  OverlayKind,
  PauseView,
  ResultView,
  RehearsalView,
  ScreenId,
  SetlistView,
  SettingsView,
  SongView,
  UiBridge,
  UiCommand,
  UiRoute,
  UiState,
  UiStore,
} from '../types/ui';
import type { GameStore } from '../game/store';
import {
  BAND_NAME,
  CREDITS_NOTICE,
  CREDITS_ROLES,
  GAME_TITLE,
  REHEARSAL_PAGES,
  SEGMENT_ORDER,
  ZERO_LINE_BREAKS,
  bindCopyLines,
  createCopyRenderer,
  describeLastFiveSeconds,
  emptyCopyContext,
  formatTime,
  segmentLabel,
} from './copy';

/* ==========================================================================
 * 1. 依赖与快照类型
 * ========================================================================== */

/** UI 桥依赖（tech-spec §5.6）。 */
export interface BridgeDeps {
  readonly store: GameStore;
  readonly data: DataRegistry;
  readonly save: SavePort;
  readonly initialSave: SaveDataV1;
  readonly song: SongView;
}

/** 战斗 HUD 之外的 run 摘要（补充 `HudSnapshot` 没有的构筑/空场/中断信息）。 */
export interface RunUiFlags {
  readonly phase: RunPhase | 'idle';
  readonly emptyHouse: boolean;
  /** 连续 8 小节低于峰值 8%，且还有安可：UI 显示「安可 / 继续独奏」。 */
  readonly interruptPending: boolean;
  readonly encoreAvailable: boolean;
  /** 只在 playing/paused 相位允许暂停（空场/终曲放下光后不再暂停）。 */
  readonly canPause: boolean;
  readonly cards: readonly CardDef[];
  readonly core: CardDef | null;
  readonly picks: number;
  readonly maxPicks: number;
  readonly converted: number;
  readonly burned: number;
  readonly covered: number;
}

/** run 摘要订阅面（bridge 的附加能力，向后兼容基础 `UiBridge`）。 */
export interface RunUiStore {
  getSnapshot(): RunUiFlags;
  subscribe(listener: () => void): () => void;
}

/** 带 run 摘要的 bridge 实现类型。 */
export interface UiBridgeRuntime extends UiBridge {
  readonly run: RunUiStore;
}

/* ==========================================================================
 * 2. 常量
 * ========================================================================== */

const HUD_INTERVAL_MS = 100;
const TOAST_MS = 2800;
const FAILURE_AUTO_MS = 5000;
const SAVE_DEBOUNCE_MS = 250;
const AUDIENCE_CAPACITY_FALLBACK = 768;

const FALLBACK_HUD: HudSnapshot = {
  revision: 0,
  whiteout: 0,
  critical: false,
  zones: [
    { id: 'front-left', heat: 0, waiting: false, blackened: false },
    { id: 'front-right', heat: 0, waiting: false, blackened: false },
    { id: 'back-left', heat: 0, waiting: false, blackened: false },
    { id: 'back-right', heat: 0, waiting: false, blackened: false },
  ],
  lightCoverage: 0,
  noisePressure: 0,
  beatPhase: 0,
  beatStrength: 'weak',
  segmentIndex: 0,
  silent: false,
  returnLocked: false,
  brokenLines: [],
  overheatedZone: null,
  holdProgress: 0,
  encoreAvailable: false,
  runSeconds: 0,
};

const IDLE_RUN: RunUiFlags = {
  phase: 'idle',
  emptyHouse: false,
  interruptPending: false,
  encoreAvailable: false,
  canPause: false,
  cards: [],
  core: null,
  picks: 0,
  maxPicks: 10,
  converted: 0,
  burned: 0,
  covered: 0,
};

/* ==========================================================================
 * 3. 小工具
 * ========================================================================== */

/** 0..1 截断。 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** 生成正式局种子（?seed= 由 main 注入；UI 只在「开始/再演」时生成）。 */
function resolveSeed(seed: number | null): number {
  if (seed !== null && Number.isFinite(seed)) {
    return Math.floor(seed) >>> 0;
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

/** 评级比较（S > A > B > C > -）。 */
function rankScore(rank: string): number {
  switch (rank) {
    case 'S':
      return 4;
    case 'A':
      return 3;
    case 'B':
      return 2;
    case 'C':
      return 1;
    default:
      return 0;
  }
}

/** 今日日期（存档 lastRun.date）。 */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 焦点是否在表单控件内。 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return target.closest('input, textarea, select, [contenteditable="true"]') !== null;
}

/* ==========================================================================
 * 4. 创建桥
 * ========================================================================== */

/** 创建 UI 桥（主入口；返回 `UiBridgeRuntime`，可赋给 `UiBridge`）。 */
export function createUiBridge(deps: BridgeDeps): UiBridgeRuntime {
  const copy = createCopyRenderer(deps.data.copy);
  let saveData: SaveDataV1 = deps.initialSave;
  let audioUnlocked = false;
  let runSnapshot: RunUiFlags = IDLE_RUN;
  let hudSnapshot: HudSnapshot = FALLBACK_HUD;
  let lastResult: RunResult | null = null;
  let lastHudAt = Number.NEGATIVE_INFINITY;
  let toastId = 0;
  let overlayReturn: OverlayKind | null = null;
  let pendingResults = false;
  let failureTimer: ReturnType<typeof setTimeout> | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let recordsSaveTimer: ReturnType<typeof setTimeout> | null = null;
  const uiListeners = new Set<() => void>();
  const hudListeners = new Set<() => void>();
  const runListeners = new Set<() => void>();

  const notify = (listeners: ReadonlySet<() => void>): void => {
    for (const listener of [...listeners]) {
      listener();
    }
  };

  const readRun = (): RunState | null => {
    try {
      return deps.store.getRun();
    } catch {
      return null;
    }
  };

  const readHud = (): HudSnapshot => {
    try {
      return deps.store.getHud();
    } catch {
      return FALLBACK_HUD;
    }
  };

  /** 是否处于「安可 / 继续独奏」的冻结选择。 */
  const isWaitingEncore = (run: RunState | null): boolean =>
    run !== null &&
    (run.phase === 'playing' || run.phase === 'paused') &&
    run.lowAudienceBars >= deps.data.balance.run.lowAudienceBars &&
    !run.encoreUsed;

  /* ------------------------------------------------------------------------
   * 4.1 视图构建
   * ---------------------------------------------------------------------- */

  const toDisplay = (settings: SettingsV1) => ({
    quality: settings.quality,
    reducedMotion: settings.reducedMotion,
    highContrast: settings.highContrast,
    beatPulse: settings.beatPulse,
    lowFlash: settings.lowFlash,
  }) as const;

  const buildMenu = (): MenuView => {
    const records = saveData.records;
    return {
      title: GAME_TITLE,
      band: BAND_NAME,
      members: deps.data.characters.map((character) => ({
        id: character.id,
        name: character.name,
        colorToken: character.silhouette.primary,
      })),
      best: {
        audience: records.bestAudience,
        time: formatTime(records.bestTime),
        rank: records.bestRank,
        clears: records.clears,
      },
      canStart: true,
    };
  };

  const setlistContext = (): CopyContext => {
    const last = saveData.records.lastRun;
    const ctx = emptyCopyContext();
    return {
      ...ctx,
      ending: last.rank === '-' ? 'interrupted' : 'complete',
      converted: last.converted,
      burned: last.burned,
      emptySeats: Math.max(0, deps.data.seats.capacity - last.audience),
    };
  };

  const buildSetlist = (): SetlistView => {
    const records = saveData.records;
    const hasPreviousRun =
      records.clears > 0 || records.emptyHouse > 0 || records.lastRun.audience > 0;
    const ctx = setlistContext();
    return {
      lines: bindCopyLines(copy.backstageLines(ctx), ctx),
      hasPreviousRun,
    };
  };

  const buildRehearsal = (current: RehearsalView['current'] = 0): RehearsalView => ({
    pages: REHEARSAL_PAGES,
    current,
  });

  const buildSettings = (): SettingsView => ({
    settings: saveData.settings,
    audioUnlocked,
  });

  const segmentName = (segment: SegmentId): string => {
    const found = deps.data.segments.find((candidate) => candidate.id === segment);
    return found?.name ?? segmentLabel(segment);
  };

  const zoneAtWorld = (point: Vec2 | null): ZoneId | null => {
    if (point === null) {
      return null;
    }
    const seats = deps.data.seats;
    const spacingX = seats.spacing.x === 0 ? 1 : seats.spacing.x;
    const spacingZ = seats.spacing.z === 0 ? 1 : seats.spacing.z;
    const col = Math.max(0, Math.min(seats.cols - 1, Math.floor((point.x - seats.origin.x) / spacingX)));
    const row = Math.max(0, Math.min(seats.rows - 1, Math.floor((point.z - seats.origin.z) / spacingZ)));
    const zone = deps.data.zones.find(
      (candidate) =>
        row >= candidate.rowRange[0] &&
        row < candidate.rowRange[1] &&
        col >= candidate.colRange[0] &&
        col < candidate.colRange[1],
    );
    return zone?.id ?? null;
  };

  const buildFailure = (card: FailureCard): FailureView => {
    const lastPoint = card.replay.lightPath[card.replay.lightPath.length - 1] ?? null;
    return {
      card,
      reasons: [
        copy.failureLine(card.reasons[0]),
        copy.failureLine(card.reasons[1]),
        copy.failureLine(card.reasons[2]),
      ],
      where: `${formatTime(card.at)}，${segmentName(card.segment)}。`,
      lastFiveSeconds: describeLastFiveSeconds(card.replay, zoneAtWorld(lastPoint)),
      skippable: true,
    };
  };

  const buildPause = (): PauseView => {
    const run = readRun();
    const coreCard = run?.build.coreCard === null ? null : run?.build.coreCard;
    const core = coreCard === null || coreCard === undefined ? null : deps.data.cards[coreCard];
    return {
      elapsed: formatTime(run?.time ?? lastResult?.stats.duration ?? 0),
      segmentName: segmentName(run?.segment ?? 'overture'),
      coreName: core?.name ?? null,
      cards: run === null ? [] : run.build.cards.map((id) => deps.data.cards[id]),
      canRestart: true,
    };
  };

  const buildLevelUp = (offer: CardOffer): LevelUpView => {
    const run = readRun();
    const coreId = run?.build.coreCard ?? null;
    const core = coreId === null ? null : deps.data.cards[coreId];
    const evolutionId = run?.build.evolution ?? null;
    return {
      offer,
      cards: offer.cards.map((id) => deps.data.cards[id]),
      build: {
        core: coreId,
        coreName: core?.name ?? null,
        build: core?.build ?? null,
        picks: run?.build.picks ?? 0,
        maxPicks: deps.data.progression.maxPicks,
        evolutionName: evolutionId === null ? null : deps.data.evolutions[evolutionId].name,
      },
    };
  };

  const buildResult = (
    result: RunResult,
    newBestAudience: boolean,
    newBestRank: boolean,
  ): ResultView => {
    const ctx: CopyContext = {
      ending: result.ending,
      grade: result.grade,
      converted: result.stats.converted,
      burned: result.stats.burned,
      covered: result.stats.covered,
      cracks: result.stats.cracks,
      breakout: result.zoneCounts,
      emptySeats: result.emptySeats,
      secondRowEmpty: result.secondRowEmpty,
      lineBreaks: ZERO_LINE_BREAKS,
      returnLocks: result.stats.returnLocks,
    };
    return {
      ending: result.ending,
      grade: result.grade,
      stats: result.stats,
      emptySeats: result.emptySeats,
      secondRowEmpty: result.secondRowEmpty,
      zoneCounts: result.zoneCounts,
      backstageLines: bindCopyLines(copy.backstageLines(ctx), ctx),
      newBestAudience,
      newBestRank,
    };
  };

  const buildRunFlags = (run: RunState | null): RunUiFlags => {
    if (run === null) {
      return IDLE_RUN;
    }
    const cards = run.build.cards.map((id) => deps.data.cards[id]);
    const core = run.build.coreCard === null ? null : deps.data.cards[run.build.coreCard];
    return {
      phase: run.phase,
      emptyHouse: run.phase === 'empty-house',
      interruptPending: isWaitingEncore(run),
      encoreAvailable: !run.encoreUsed,
      canPause: run.phase === 'playing' || run.phase === 'paused',
      cards,
      core,
      picks: run.build.picks,
      maxPicks: deps.data.progression.maxPicks,
      converted: run.stats.converted,
      burned: run.stats.burned,
      covered: run.stats.covered,
    };
  };

  const sameRunFlags = (a: RunUiFlags, b: RunUiFlags): boolean => {
    if (
      a.phase !== b.phase ||
      a.emptyHouse !== b.emptyHouse ||
      a.interruptPending !== b.interruptPending ||
      a.encoreAvailable !== b.encoreAvailable ||
      a.canPause !== b.canPause ||
      a.picks !== b.picks ||
      a.maxPicks !== b.maxPicks ||
      a.converted !== b.converted ||
      a.burned !== b.burned ||
      a.covered !== b.covered ||
      a.cards.length !== b.cards.length
    ) {
      return false;
    }
    if ((a.core?.id ?? null) !== (b.core?.id ?? null)) {
      return false;
    }
    for (let index = 0; index < a.cards.length; index += 1) {
      if (a.cards[index]?.id !== b.cards[index]?.id) {
        return false;
      }
    }
    return true;
  };

  const refreshRun = (shouldNotify: boolean): void => {
    const next = buildRunFlags(readRun());
    if (sameRunFlags(runSnapshot, next)) {
      return;
    }
    runSnapshot = next;
    if (shouldNotify) {
      notify(runListeners);
    }
  };

  /* ------------------------------------------------------------------------
   * 4.2 UI 状态提交
   * ---------------------------------------------------------------------- */

  const initialMenu = buildMenu();
  const initialSetlist = buildSetlist();

  let state: UiState = {
    revision: 0,
    route: { screen: 'boot', overlay: 'none', backTo: null },
    menu: initialMenu,
    setlist: initialSetlist,
    rehearsal: buildRehearsal(),
    settings: buildSettings(),
    song: deps.song,
    credits: { roles: CREDITS_ROLES, notice: CREDITS_NOTICE } satisfies CreditsView,
    levelUp: null,
    pause: null,
    result: null,
    failure: null,
    toast: null,
    display: toDisplay(saveData.settings),
    audioUnlocked: false,
  };

  const publishUi = (): void => {
    notify(uiListeners);
  };

  const commit = (patch: Partial<UiState>): void => {
    state = { ...state, ...patch, revision: state.revision + 1 };
    publishUi();
  };

  const setRoute = (screen: ScreenId, overlay: OverlayKind, backTo: ScreenId | null = null): void => {
    const route: UiRoute = { screen, overlay, backTo };
    commit({ route });
  };

  const clearToast = (): void => {
    if (toastTimer !== null) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    if (state.toast !== null) {
      commit({ toast: null });
    }
  };

  const pushToast = (text: string, tone: 'info' | 'warn'): void => {
    toastId += 1;
    if (toastTimer !== null) {
      clearTimeout(toastTimer);
    }
    const id = toastId;
    commit({ toast: { id, text, tone } });
    toastTimer = setTimeout(() => {
      toastTimer = null;
      if (state.toast?.id === id) {
        commit({ toast: null });
      }
    }, TOAST_MS);
  };

  const clearFailureTimer = (): void => {
    if (failureTimer !== null) {
      clearTimeout(failureTimer);
      failureTimer = null;
    }
  };

  /* ------------------------------------------------------------------------
   * 4.3 路由与命令
   * ---------------------------------------------------------------------- */

  const advanceToResults = (): void => {
    clearFailureTimer();
    if (state.result === null) {
      pendingResults = true;
      return;
    }
    overlayReturn = null;
    pendingResults = false;
    commit({
      route: { screen: 'results', overlay: 'none', backTo: null },
      failure: null,
      levelUp: null,
      pause: null,
      toast: null,
    });
  };

  const showPause = (dispatchPause: boolean): void => {
    const run = readRun();
    if (run === null) {
      return;
    }
    // 空场与终曲放下光后不再允许暂停（game 层也不会接受 pause）。
    if (run.phase !== 'playing' && run.phase !== 'paused') {
      return;
    }
    // 中断选择处于冻结中：Esc/Tab 不能绕过「安可 / 继续独奏」。
    if (isWaitingEncore(run)) {
      return;
    }
    if (dispatchPause) {
      try {
        deps.store.dispatch({ type: 'pause' });
      } catch {
        // 游戏尚未开始/已结束：UI 仍可显示暂停面板，不抛给 React。
      }
    }
    overlayReturn = null;
    commit({
      route: { screen: 'playing', overlay: 'pause', backTo: null },
      pause: buildPause(),
      levelUp: null,
    });
  };

  const startRun = (seed: number | null, restart: boolean): void => {
    const resolved = resolveSeed(seed);
    clearFailureTimer();
    overlayReturn = null;
    pendingResults = false;
    lastResult = null;
    runSnapshot = IDLE_RUN;
    try {
      if (restart) {
        deps.store.dispatch({ type: 'restart-run', seed: resolved });
      } else {
        deps.store.dispatch({ type: 'start-run', config: { seed: resolved, mode: 'normal' } });
      }
    } catch {
      pushToast('这一场没能开始。请回到主菜单再试。', 'warn');
      return;
    }
    refreshRun(false);
    hudSnapshot = readHud();
    commit({
      route: { screen: 'playing', overlay: 'none', backTo: null },
      result: null,
      failure: null,
      levelUp: null,
      pause: null,
      toast: null,
    });
    notify(hudListeners);
    notify(runListeners);
  };

  const quitRun = (): void => {
    clearFailureTimer();
    overlayReturn = null;
    pendingResults = false;
    lastResult = null;
    runSnapshot = IDLE_RUN;
    hudSnapshot = FALLBACK_HUD;
    try {
      deps.store.dispatch({ type: 'quit-run' });
    } catch {
      // 没有进行中的一局时，quit 是幂等的。
    }
    commit({
      route: { screen: 'menu', overlay: 'none', backTo: null },
      menu: buildMenu(),
      setlist: buildSetlist(),
      result: null,
      failure: null,
      levelUp: null,
      pause: null,
      toast: null,
    });
    notify(hudListeners);
    notify(runListeners);
  };

  const navigateTo = (screen: ScreenId): void => {
    if (screen === 'boot') {
      return;
    }
    if (screen === 'results') {
      advanceToResults();
      return;
    }
    if (screen === 'playing' || screen === 'paused' || screen === 'levelup') {
      return;
    }
    if (screen === 'menu') {
      const inRun =
        state.route.screen === 'playing' ||
        state.route.screen === 'paused' ||
        state.route.screen === 'levelup' ||
        state.route.screen === 'results';
      if (inRun) {
        quitRun();
        return;
      }
    }
    const backTo: ScreenId | null =
      screen === 'setlist' || screen === 'rehearsal' || screen === 'settings' || screen === 'credits'
        ? 'menu'
        : null;
    overlayReturn = null;
    const patch: { -readonly [K in keyof UiState]?: UiState[K] } = {
      route: { screen, overlay: 'none', backTo },
      result: null,
      failure: null,
      levelUp: null,
      pause: null,
    };
    if (screen === 'menu') {
      patch.menu = buildMenu();
      patch.setlist = buildSetlist();
    }
    if (screen === 'rehearsal') {
      patch.rehearsal = buildRehearsal();
    }
    if (screen === 'settings') {
      patch.settings = buildSettings();
    }
    commit(patch);
  };

  const openOverlay = (overlay: OverlayKind): void => {
    switch (overlay) {
      case 'none':
        closeOverlay();
        return;
      case 'pause':
        if (state.route.screen === 'playing' || state.route.screen === 'paused') {
          showPause(true);
        }
        return;
      case 'levelup':
        if (state.levelUp !== null) {
          setRoute('playing', 'levelup');
        }
        return;
      case 'failure':
        if (state.failure !== null) {
          setRoute('playing', 'failure');
        }
        return;
      case 'settings':
        if (state.route.overlay === 'none' && state.route.screen === 'playing') {
          const run = readRun();
          if (run !== null && run.phase === 'playing' && !isWaitingEncore(run)) {
            try {
              deps.store.dispatch({ type: 'pause' });
            } catch {
              // 已在暂停/结束：设置仍可打开。
            }
          }
          overlayReturn = 'pause';
        } else {
          overlayReturn =
            state.route.overlay === 'pause' || state.route.overlay === 'confirm-quit'
              ? state.route.overlay
              : null;
        }
        commit({
          route: { screen: 'playing', overlay: 'settings', backTo: null },
          settings: buildSettings(),
        });
        return;
      case 'confirm-quit':
        overlayReturn = 'pause';
        commit({
          route: { screen: 'playing', overlay: 'confirm-quit', backTo: null },
          pause: buildPause(),
        });
        return;
      default:
        return;
    }
  };

  const closeOverlay = (): void => {
    const current = state.route.overlay;
    if (current === 'settings' || current === 'confirm-quit') {
      const target = overlayReturn;
      overlayReturn = null;
      if (target === 'pause') {
        commit({
          route: { screen: 'playing', overlay: 'pause', backTo: null },
          pause: buildPause(),
        });
      } else {
        setRoute('playing', 'none');
      }
      return;
    }
    if (current === 'pause') {
      try {
        deps.store.dispatch({ type: 'resume' });
      } catch {
        // 已结束的一局：resume 无意义，UI 仍回到演出屏。
      }
      commit({
        route: { screen: 'playing', overlay: 'none', backTo: null },
        pause: null,
      });
      return;
    }
    if (current === 'failure') {
      advanceToResults();
      return;
    }
    if (current === 'levelup') {
      return;
    }
  };

  const chooseCard = (cardId: CardId): void => {
    try {
      deps.store.dispatch({ type: 'choose-card', cardId });
    } catch {
      pushToast('这张卡没能生效。请再选一次。', 'warn');
      return;
    }
    commit({
      route: { screen: 'playing', overlay: 'none', backTo: null },
      levelUp: null,
      pause: null,
    });
    refreshRun(true);
  };

  const updateSettings = (patch: Partial<SettingsV1>): void => {
    const next: SettingsV1 = {
      master: patch.master === undefined ? saveData.settings.master : clamp01(patch.master),
      music: patch.music === undefined ? saveData.settings.music : clamp01(patch.music),
      sfx: patch.sfx === undefined ? saveData.settings.sfx : clamp01(patch.sfx),
      quality:
        patch.quality === undefined
          ? saveData.settings.quality
          : patch.quality === 'low'
            ? 'low'
            : 'high',
      reducedMotion: patch.reducedMotion ?? saveData.settings.reducedMotion,
      highContrast: patch.highContrast ?? saveData.settings.highContrast,
      beatPulse: patch.beatPulse ?? saveData.settings.beatPulse,
      lowFlash: patch.lowFlash ?? saveData.settings.lowFlash,
    };
    saveData = { ...saveData, settings: next };
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      saveTimer = null;
      deps.save.save(saveData, 'settings');
    }, SAVE_DEBOUNCE_MS);
    commit({
      settings: { settings: next, audioUnlocked },
      display: toDisplay(next),
    });
  };

  const markAudioUnlocked = (): void => {
    if (audioUnlocked) {
      return;
    }
    audioUnlocked = true;
    commit({
      audioUnlocked: true,
      settings: { settings: saveData.settings, audioUnlocked: true },
    });
  };

  const toggleFullscreen = (): void => {
    const doc = document;
    if (doc.fullscreenElement !== null) {
      void doc.exitFullscreen().catch(() => undefined);
      return;
    }
    if (typeof doc.documentElement.requestFullscreen !== 'function') {
      pushToast('当前浏览器不支持全屏。', 'warn');
      return;
    }
    void doc.documentElement.requestFullscreen().catch(() => undefined);
  };

  const handleEscape = (): void => {
    const { screen, overlay } = state.route;
    if (overlay === 'settings' || overlay === 'confirm-quit' || overlay === 'pause') {
      closeOverlay();
      return;
    }
    if (overlay === 'failure') {
      advanceToResults();
      return;
    }
    if (overlay === 'levelup') {
      return;
    }
    if (screen === 'playing') {
      if (isWaitingEncore(readRun())) {
        return;
      }
      openOverlay('pause');
      return;
    }
    if (screen === 'settings') {
      navigateTo(state.route.backTo ?? 'menu');
      return;
    }
    if (screen === 'setlist' || screen === 'rehearsal' || screen === 'credits') {
      navigateTo('menu');
      return;
    }
    if (screen === 'results') {
      navigateTo('menu');
    }
  };

  /* ------------------------------------------------------------------------
   * 4.4 游戏事件
   * ---------------------------------------------------------------------- */

  const onLevelUp = (offer: CardOffer): void => {
    commit({
      route: { screen: 'playing', overlay: 'levelup', backTo: null },
      levelUp: buildLevelUp(offer),
      pause: null,
      failure: null,
    });
  };

  const onFailure = (card: FailureCard): void => {
    clearFailureTimer();
    const failure = buildFailure(card);
    commit({
      route: { screen: 'playing', overlay: 'failure', backTo: null },
      failure,
      levelUp: null,
      pause: null,
    });
    failureTimer = setTimeout(() => {
      failureTimer = null;
      advanceToResults();
    }, FAILURE_AUTO_MS);
  };

  const onRunEnd = (result: RunResult): void => {
    lastResult = result;
    const previous = saveData.records;
    const newBestAudience = result.stats.peakAudience > previous.bestAudience;
    const newBestRank = result.grade !== null && rankScore(result.grade) > rankScore(previous.bestRank);
    const run = readRun();
    const segmentCount = run === null ? 5 : Math.max(1, SEGMENT_ORDER.indexOf(run.segment) + 1);
    const nextRecords: RecordsV1 = {
      ...previous,
      bestAudience: Math.max(previous.bestAudience, result.stats.peakAudience),
      bestTime: Math.max(previous.bestTime, Math.round(result.stats.duration)),
      clears: previous.clears + (result.ending === 'interrupted' ? 0 : 1),
      emptyHouse: previous.emptyHouse + (result.ending === 'empty-house' ? 1 : 0),
      bestRank: newBestRank ? (result.grade ?? previous.bestRank) : previous.bestRank,
      lastRun: {
        date: today(),
        audience: result.stats.finalAudience,
        converted: result.stats.converted,
        burned: result.stats.burned,
        rank: result.grade ?? '-',
        segments: segmentCount,
      },
    };
    saveData = { ...saveData, records: nextRecords };
    try {
      deps.save.save(saveData, 'run-end');
    } catch {
      // 存档写入失败静默降级，不影响结算。
    }
    // Store 的 finishRun 也可能写一次 records；延迟一帧再写，保证 UI 计算出的
    // lastRun.date / segments 与「空场也计完成」的口径不会被先写覆盖。
    if (recordsSaveTimer !== null) {
      clearTimeout(recordsSaveTimer);
    }
    recordsSaveTimer = setTimeout(() => {
      recordsSaveTimer = null;
      deps.save.save(saveData, 'run-end');
    }, 0);

    const resultView = buildResult(result, newBestAudience, newBestRank);
    const shouldAdvance = pendingResults || state.route.overlay !== 'failure';
    runSnapshot = IDLE_RUN;
    notify(runListeners);

    if (shouldAdvance) {
      clearFailureTimer();
      pendingResults = false;
      overlayReturn = null;
      state = {
        ...state,
        menu: buildMenu(),
        setlist: buildSetlist(),
        result: resultView,
        route: { screen: 'results', overlay: 'none', backTo: null },
        failure: null,
        levelUp: null,
        pause: null,
        toast: null,
        revision: state.revision + 1,
      };
      publishUi();
      return;
    }

    commit({
      menu: buildMenu(),
      setlist: buildSetlist(),
      result: resultView,
    });
  };

  const handleGameEvent = (event: GameEvent): void => {
    switch (event.kind) {
      case 'levelup':
        onLevelUp(event.offer);
        return;
      case 'failure':
        onFailure(event.card);
        return;
      case 'run-end':
        onRunEnd(event.result);
        return;
      case 'evolution':
        pushToast(`进化：${deps.data.evolutions[event.evolution].name}`, 'info');
        return;
      case 'encore':
        pushToast('安可：他们又抬头了。', 'info');
        return;
      case 'line':
        if (event.action === 'break') {
          pushToast('线断了。靠近队友，按 E 插线。', 'warn');
        }
        return;
      case 'return-listener':
        if (event.action === 'lock') {
          pushToast('返听锁定了你的光。移光，或者烧掉它。', 'warn');
        }
        return;
      case 'silence':
        if (event.active) {
          pushToast('静默：声音被抽走了。看节拍环。', 'warn');
        }
        return;
      case 'boss':
        if (event.action === 'retire') {
          pushToast('静默退场了。', 'info');
        }
        return;
      default:
        return;
    }
  };

  /* ------------------------------------------------------------------------
   * 4.5 订阅与生命周期
   * ---------------------------------------------------------------------- */

  const unsubscribeEvents = deps.store.subscribeEvents(handleGameEvent);

  const onGlobalKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) {
      return;
    }
    if (event.key === 'Escape') {
      handleEscape();
      return;
    }
    if (event.key === 'Tab' && !isEditableTarget(event.target)) {
      if (state.route.screen === 'playing' && state.route.overlay === 'none') {
        if (isWaitingEncore(readRun())) {
          return;
        }
        event.preventDefault();
        openOverlay('pause');
      }
    }
  };
  document.addEventListener('keydown', onGlobalKeyDown);

  const onFirstGesture = (): void => {
    markAudioUnlocked();
    document.removeEventListener('pointerdown', onFirstGesture, true);
    document.removeEventListener('keydown', onFirstGesture, true);
  };
  document.addEventListener('pointerdown', onFirstGesture, true);
  document.addEventListener('keydown', onFirstGesture, true);

  const subscribe = (listeners: Set<() => void>, listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const uiStore: UiStore = {
    getSnapshot: () => state,
    subscribe: (listener) => subscribe(uiListeners, listener),
  };

  const hudStore: HudStore = {
    getSnapshot: () => hudSnapshot,
    subscribe: (listener) => subscribe(hudListeners, listener),
  };

  const runStore: RunUiStore = {
    getSnapshot: () => runSnapshot,
    subscribe: (listener) => subscribe(runListeners, listener),
  };

  const publishHud = (): void => {
    const now = performance.now();
    if (now - lastHudAt < HUD_INTERVAL_MS) {
      return;
    }
    lastHudAt = now;
    const next = readHud();
    if (next !== hudSnapshot) {
      hudSnapshot = next;
      notify(hudListeners);
    }
    refreshRun(true);
  };

  const dispatch = (command: UiCommand): void => {
    switch (command.type) {
      case 'start-run':
        startRun(command.seed, false);
        return;
      case 'restart-run':
        startRun(command.seed, true);
        return;
      case 'quit-run':
        quitRun();
        return;
      case 'pause':
        openOverlay('pause');
        return;
      case 'resume':
        closeOverlay();
        return;
      case 'choose-card':
        chooseCard(command.cardId);
        return;
      case 'encore':
        try {
          deps.store.dispatch({ type: 'encore' });
        } catch {
          pushToast('安可没能发生。', 'warn');
          return;
        }
        commit({
          route: { screen: 'playing', overlay: 'none', backTo: null },
          failure: null,
          levelUp: null,
        });
        refreshRun(true);
        return;
      case 'continue-solo':
        try {
          deps.store.dispatch({ type: 'continue-solo' });
        } catch {
          pushToast('没能继续。', 'warn');
          return;
        }
        commit({
          route: { screen: 'playing', overlay: 'none', backTo: null },
          failure: null,
          levelUp: null,
        });
        refreshRun(true);
        return;
      case 'skip-empty-house':
        try {
          deps.store.dispatch({ type: 'skip-empty-house' });
        } catch {
          // 空场结束时，skip 是幂等的。
        }
        return;
      case 'navigate':
        navigateTo(command.screen);
        return;
      case 'open-overlay':
        openOverlay(command.overlay);
        return;
      case 'close-overlay':
        closeOverlay();
        return;
      case 'update-settings':
        updateSettings(command.patch);
        return;
      case 'set-quality':
        updateSettings({ quality: command.quality });
        return;
      case 'unlock-audio':
        markAudioUnlocked();
        if (state.route.screen === 'boot') {
          navigateTo('menu');
        }
        return;
      case 'dismiss-toast':
        clearToast();
        return;
      case 'toggle-fullscreen':
        toggleFullscreen();
        return;
      default:
        return;
    }
  };

  const dispose = (): void => {
    unsubscribeEvents();
    clearFailureTimer();
    if (toastTimer !== null) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (recordsSaveTimer !== null) {
      clearTimeout(recordsSaveTimer);
      recordsSaveTimer = null;
    }
    document.removeEventListener('keydown', onGlobalKeyDown);
    document.removeEventListener('pointerdown', onFirstGesture, true);
    document.removeEventListener('keydown', onFirstGesture, true);
    uiListeners.clear();
    hudListeners.clear();
    runListeners.clear();
  };

  return {
    ui: uiStore,
    hud: hudStore,
    run: runStore,
    dispatch,
    publishHud,
    publishUi,
    dispose,
  };
}

/** 视觉容量（供 UI 文案/空位计算使用；与数据层 768 一致）。 */
export const AUDIENCE_CAPACITY = AUDIENCE_CAPACITY_FALLBACK;

/** 评级排序（UI 与存档比较共用；S 最高）。 */
export function compareRank(a: Grade | '-', b: Grade | '-'): number {
  return rankScore(a) - rankScore(b);
}
