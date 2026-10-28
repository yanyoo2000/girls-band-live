import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { App } from '../src/App';
import { Hud } from '../src/ui/components/Hud';
import { attachDomInput } from '../src/ui/input-dom';
import { createInputBuffer, createInputSampler } from '../src/game/input';
import { createUiBridge } from '../src/ui/bridge';
import type { RunUiFlags } from '../src/ui/bridge';
import { buildDataRegistry } from '../src/data';
import type { GameEvent, HudSnapshot, RunResult, RunStats } from '../src/types/game';
import type { SaveDataV1, SaveLoadResult, SavePort } from '../src/types/save';
import type { GameCommand } from '../src/types/game';
import type { GameStore } from '../src/game/store';

const data = buildDataRegistry();

const hud: HudSnapshot = {
  revision: 3,
  whiteout: 0.4,
  critical: false,
  zones: [
    { id: 'front-left', heat: 2, waiting: false, blackened: false },
    { id: 'front-right', heat: 3, waiting: true, blackened: false },
    { id: 'back-left', heat: 0, waiting: false, blackened: true },
    { id: 'back-right', heat: 4, waiting: false, blackened: false },
  ],
  lightCoverage: 0.6,
  noisePressure: 0.25,
  beatPhase: 0.3,
  beatStrength: 'strong',
  segmentIndex: 4,
  silent: false,
  returnLocked: true,
  brokenLines: ['bass'],
  overheatedZone: null,
  holdProgress: 0.5,
  encoreAvailable: true,
  runSeconds: 530,
  lightMode: 'beam',
  igniteCooldown: 0.35,
  soloShield: 0.4,
  returnLockRemaining: 3,
  maxLock: 7,
  lockRemaining: 3,
  zoneLightRatios: [0.2, 0.5, 0.1, 0.8],
  zoneOccupancy: [0.4, 0.5, 0.2, 0.6],
  audienceTrend: -1,
  audienceLow: false,
  emptySeats: 300,
  secondRowEmpty: 20,
  level: 3,
  xp: 40,
  nextLevelXp: 110,
};

const runFlags: RunUiFlags = {
  phase: 'playing',
  emptyHouse: false,
  interruptPending: false,
  encoreAvailable: true,
  canPause: true,
  cards: [],
  core: null,
  picks: 0,
  maxPicks: 10,
  converted: 20,
  burned: 5,
  covered: 2,
};

const initialSave: SaveDataV1 = {
  version: 1,
  settings: {
    master: 0.8,
    music: 0.7,
    sfx: 0.8,
    quality: 'high',
    reducedMotion: false,
    highContrast: false,
    beatPulse: true,
    lowFlash: false,
  },
  records: {
    bestAudience: 0,
    bestTime: 0,
    clears: 0,
    emptyHouse: 0,
    bestRank: '-',
    lastRun: { date: '', audience: 0, converted: 0, burned: 0, rank: '-', segments: 0 },
  },
  unlocks: { cardsSeen: [], momentsSeen: [] },
};

const saves: { data: SaveDataV1; reason: string }[] = [];
const save: SavePort = {
  load: (): SaveLoadResult => ({ data: initialSave, status: 'fresh', reasons: [] }),
  save: (data, reason) => {
    saves.push({ data, reason });
    return true;
  },
  backupCorrupted: () => undefined,
  clear: () => undefined,
};

let eventHandler: ((event: GameEvent) => void) | null = null;
const commands: GameCommand[] = [];
const store = {
  getRun: () => null,
  getHud: () => hud,
  getRender: () => ({} as never),
  getResult: () => null,
  dispatch: (command: GameCommand) => {
    commands.push(command);
  },
  subscribeHud: () => () => undefined,
  subscribeEvents: (handler: (event: GameEvent) => void) => {
    eventHandler = handler;
    return () => {
      eventHandler = null;
    };
  },
  tick: () => undefined,
  dispose: () => undefined,
} as unknown as GameStore;

// node 环境只给 bridge 的全局监听器一个最小 document。
if (typeof document === 'undefined') {
  const doc = {
    fullscreenElement: null,
    documentElement: { requestFullscreen: async () => undefined },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    exitFullscreen: async () => undefined,
  };
  Object.defineProperty(globalThis, 'document', { value: doc, configurable: true });
}

const bridge = createUiBridge({
  store,
  data,
  save,
  initialSave,
  song: { title: '再亮一会儿', key: 'am', durationLabel: '9:30', segments: ['序曲', '主歌', '副歌', '桥段', '终曲'] },
});

function textOf(markup: string): string {
  return markup.replace(/<[^>]*>/g, '');
}

describe('UI smoke', () => {
  it('renders v1.0.1 HUD affordances without digits', () => {
    const earlyHud: HudSnapshot = {
      ...hud,
      runSeconds: 5,
      whiteout: 0,
      lightCoverage: 0,
      lightMode: 'spread',
      soloShield: 0,
      returnLocked: false,
      brokenLines: [],
      audienceTrend: 0,
      emptySeats: 0,
      secondRowEmpty: 0,
      returnLockRemaining: 0,
      lockRemaining: 0,
      zoneLightRatios: [0.1, 0.2, 0.1, 0.2],
    };
    const tutorialPages = [5, 12, 25].map((runSeconds) =>
      renderToStaticMarkup(
        createElement(Hud, {
          hud: { ...earlyHud, runSeconds },
          run: runFlags,
          onPause: () => undefined,
          onSkipEmptyHouse: () => undefined,
        }),
      ),
    );
    expect(tutorialPages[0]).toContain('散光养人');
    expect(tutorialPages[1]).toContain('束光烧人');
    expect(tutorialPages[2]).toContain('点击点燃');
    const early = tutorialPages[0] ?? '';
    expect(early).toContain('IJKL');
    expect((early.match(/light-state__cell/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(early).toContain('audience-gauge');
    expect((early.match(/zone-dot__light/g) ?? []).length).toBe(4);
    expect(textOf(early)).not.toMatch(/[0-9]/);

    const rich = renderToStaticMarkup(
      createElement(Hud, {
        hud,
        run: runFlags,
        onPause: () => undefined,
        onSkipEmptyHouse: () => undefined,
      }),
    );
    expect(rich).toContain('lock-callout');
    expect(rich).toContain('返听锁定');
    expect(rich).toContain('broken-notice');
    expect(rich).toContain('靠近队友按 E 插线');
    expect(rich).toContain('beam-burn');
    expect(rich).toContain('束光正在烧人');
    expect(rich).toContain('hud--burning');
    expect(textOf(rich)).not.toMatch(/[0-9]/);
  });
  it('boots, navigates and renders every major screen', () => {
    expect(bridge.ui.getSnapshot().route.screen).toBe('boot');
    expect(bridge.ui.getSnapshot().menu.members).toHaveLength(4);
    expect(bridge.ui.getSnapshot().setlist.lines).toHaveLength(4);

    bridge.dispatch({ type: 'unlock-audio' });
    expect(bridge.ui.getSnapshot().route.screen).toBe('menu');
    const menu = renderToStaticMarkup(createElement(App, { bridge }));
    expect(menu).toContain('开始演出');
    expect(menu).toContain('今晚的曲目单');
    expect(menu).toContain('江栖');

    const screens: readonly { screen: 'setlist' | 'rehearsal' | 'settings' | 'credits'; title: string }[] = [
      { screen: 'setlist', title: '今晚的曲目单' },
      { screen: 'rehearsal', title: '排练室' },
      { screen: 'settings', title: '设置' },
      { screen: 'credits', title: '制作名单' },
    ];
    for (const entry of screens) {
      bridge.dispatch({ type: 'navigate', screen: entry.screen });
      expect(renderToStaticMarkup(createElement(App, { bridge }))).toContain(entry.title);
    }
    bridge.dispatch({ type: 'navigate', screen: 'menu' });

    bridge.dispatch({ type: 'start-run', seed: 42 });
    expect(bridge.ui.getSnapshot().route.screen).toBe('playing');
    const playing = renderToStaticMarkup(createElement(App, { bridge }));
    const hudText = textOf(playing);
    expect(hudText).not.toMatch(/[0-9]/);
    expect(playing).toContain('zone-dot--front-left');
    expect(playing).toContain('danger__bar');
    expect(playing).toContain('beat-ring');
    expect(playing).toContain('build-strip');
    expect(playing).toContain('finale');
    expect(playing).toContain('长按 Space 放下光');
    // COMPAT-2：whiteout=0.4 时 HUD 进入高对比模式（暗底衬）。
    expect(playing).toContain('hud--whiteout');
    // 跳过导航落点：main 可程序化聚焦，且无覆盖层时不应 inert。
    expect(playing).toMatch(/id="ui-stage"[^>]*tabindex="-1"/);
    expect(playing).not.toContain('inert=""');
  });

  it('renders level up, failure and results from events', () => {
    eventHandler?.({
      kind: 'levelup',
      time: 60,
      beatIndex: 10,
      offer: { offerId: 1, cards: ['choir-wall', 'four-part', 'keep-them'] },
    });
    const levelup = renderToStaticMarkup(createElement(App, { bridge }));
    expect(levelup).toContain('选一张');
    expect((levelup.match(/card-pedal/g) ?? []).length).toBeGreaterThanOrEqual(3);
    // 升级对话框打开时，背景主区域 inert + aria-hidden，焦点不应落到 HUD。
    expect(levelup).toContain('inert=""');
    expect(levelup).toContain('aria-hidden="true"');

    const stats: RunStats = {
      peakAudience: 480,
      finalAudience: 360,
      converted: 300,
      burned: 40,
      covered: 12,
      leftVenue: 80,
      ignitesPerfect: 50,
      ignitesGood: 20,
      ignitesOff: 10,
      crowdWaves: 2,
      cracks: 2,
      returnLocks: 1,
      encoreUsed: false,
      duration: 570,
    };
    const result: RunResult = {
      seed: 42,
      ending: 'interrupted',
      grade: null,
      stats,
      zoneCounts: { 'front-left': 100, 'front-right': 90, 'back-left': 80, 'back-right': 70 },
      emptySeats: 428,
      secondRowEmpty: 20,
      failure: {
        at: 402,
        segment: 'bridge',
        reasons: [
          { code: 'return-listener-lock', seconds: 11, zone: null, people: 0 },
          { code: 'zone-cooled', seconds: 402, zone: 'back-left', people: 62 },
          { code: 'no-ignite', seconds: 402, zone: null, people: 0 },
        ],
        replay: { lightPath: [{ x: 0, z: 0 }, { x: 1, z: 0.4 }], ignites: 0, movedMeters: 1.1 },
      },
    };
    eventHandler?.({
      kind: 'failure',
      time: 402,
      beatIndex: 99,
      card: result.failure!,
    });
    const failure = renderToStaticMarkup(createElement(App, { bridge }));
    expect(failure).toContain('这一场，停在这里');
    expect((failure.match(/failure__reason/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(failure).toContain('第 3 区');
    expect(failure).toContain('最后 5 秒');

    // M2：断线事件应进入结算后台文案，而不是恒 0。
    eventHandler?.({ kind: 'line', time: 380, beatIndex: 90, action: 'break', line: 'guitar' });
    eventHandler?.({ kind: 'line', time: 381, beatIndex: 90, action: 'break', line: 'bass' });

    eventHandler?.({ kind: 'run-end', time: 402, beatIndex: 99, result });
    const stillFailure = renderToStaticMarkup(createElement(App, { bridge }));
    expect(stillFailure).toContain('这一场，停在这里');

    bridge.dispatch({ type: 'navigate', screen: 'results' });
    expect(bridge.ui.getSnapshot().route.screen).toBe('results');
    const results = renderToStaticMarkup(createElement(App, { bridge }));
    expect(results).toContain('散场之后');
    expect(results).toContain('峰值人气');
    expect(results).toContain('中断 · 没有评级');
    expect(results).toContain('再演一场');
    expect(results).toContain('这一场为什么停在这里');
    expect((results.match(/results__reason/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(results).toContain('断线 2 次');
    expect(results).toContain('吉他断了 1 次');
    expect(results).toContain('贝斯断了 1 次');
  });

  it('persists settings and rebuilds hud only when snapshot changes', async () => {
    bridge.dispatch({ type: 'update-settings', patch: { master: 0.25, reducedMotion: true } });
    expect(bridge.ui.getSnapshot().display.reducedMotion).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 320));
    expect(saves.some((entry) => entry.reason === 'settings')).toBe(true);

    let notifications = 0;
    const unsubscribe = bridge.hud.subscribe(() => {
      notifications += 1;
    });
    bridge.publishHud();
    bridge.publishHud();
    expect(notifications).toBe(0);
    unsubscribe();
    bridge.dispose();
  });

  it('maps IJKL / Shift / Enter to the light input buffer', async () => {
    const listeners = new Map<string, Set<(event: Event) => void>>();
    const fakeWindow = {
      innerWidth: 1600,
      innerHeight: 900,
      addEventListener: (type: string, listener: (event: Event) => void) => {
        const set = listeners.get(type) ?? new Set();
        set.add(listener);
        listeners.set(type, set);
      },
      removeEventListener: (type: string, listener: (event: Event) => void) => {
        listeners.get(type)?.delete(listener);
      },
    };
    Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true });
    class FakeElement {}
    Object.defineProperty(globalThis, 'Element', { value: FakeElement, configurable: true });
    const target = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 600 }),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as HTMLElement;
    const buffer = createInputBuffer();
    const sampler = createInputSampler(buffer, 1);
    const detach = attachDomInput(buffer, { target, ignoreWhenTyping: true });
    const fire = (type: string, code: string): void => {
      const event = {
        code,
        key: code,
        repeat: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        target: null,
        preventDefault: () => undefined,
      } as unknown as KeyboardEvent;
      for (const listener of listeners.get(type) ?? []) {
        listener(event);
      }
    };

    fire('keydown', 'KeyL');
    await new Promise((resolve) => setTimeout(resolve, 140));
    fire('keyup', 'KeyL');
    fire('keydown', 'ShiftLeft');
    fire('keydown', 'Enter');
    const frame = sampler.sample({ toStage: (ndc) => ({ x: ndc.x, z: ndc.z }) });
    expect(frame.pointerNdc.x).toBeGreaterThan(0);
    expect(frame.beamHeld).toBe(true);
    expect(frame.ignitePressed).toBe(true);
    fire('keyup', 'ShiftLeft');
    detach();
  });
});
