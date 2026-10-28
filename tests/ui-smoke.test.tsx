import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { App } from '../src/App';
import { createUiBridge } from '../src/ui/bridge';
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
});
