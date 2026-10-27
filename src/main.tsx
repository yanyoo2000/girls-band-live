/**
 * 装配入口（tech-spec §6.4；集成层，tech-director 所有）。
 *
 * 启动顺序（不可交换）：
 *   WebGL2 探测 → 存档 → 数据 → renderer → scene → camera → instancing → fx
 *   → audio → store → UI bridge → React 挂载 → 输入 → loop.start()
 *
 * 销毁顺序：loop.stop → 输入/订阅解绑 → bridge → store → audio → fx/实例/camera/scene → renderer → React。
 *
 * 约束：
 * - 单例全部在模块级创建一次，React 只拿 `bridge`；
 * - 每帧只走 loop → store.tick → renderer.draw，React 不在 rAF 中 setState；
 * - 音频引擎的 `clock` 与玩法时钟分离：玩法使用 `createFallbackClock`（段落按 run.time 推进），
 *   音频只负责发声；这是 M5 音频时钟语义未对齐前的装配层适配（见 t106 报告）。
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/base.css';
import './styles/ui.css';
import { App } from './App';
import { buildDataRegistry } from './data';
import { applyAudioMix, createAudioEngine, setAudioHostHidden, type AudioEngine } from './audio/engine';
import { createEventBus } from './game/events';
import { createInputBuffer, createInputSampler } from './game/input';
import { createLoop } from './game/loop';
import { createRng } from './game/rng';
import { createGameStore } from './game/store';
import { createBootContext, createFallbackClock } from './platform/bootstrap';
import { createLocalStorageSavePort } from './platform/local-storage';
import { createCameraRig } from './three/camera';
import { createFxSystem } from './three/fx';
import { createAudienceInstances, createNoiseInstances, createParticleInstances } from './three/instancing';
import { createRenderer } from './three/renderer';
import { createScene } from './three/scene';
import { createUiBridge } from './ui/bridge';
import { formatTime, SONG_TITLE } from './ui/copy';
import { attachDomInput } from './ui/input-dom';
import type { AudioPort, MusicClock } from './types/game';
import type { DataRegistry } from './types/data';
import type { SongView } from './types/ui';

/** 首屏/致命错误的中文提示（不依赖 React，保证 WebGL 失败也有页面）。 */
function renderFatal(root: HTMLElement, title: string, detail: string): void {
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:32px;' +
    'background:#0b0d12;color:#edeff2;font:16px/1.7 "PingFang SC","Microsoft YaHei",system-ui,sans-serif;';
  const card = document.createElement('div');
  card.style.cssText =
    'max-width:640px;padding:28px 32px;border:1px solid rgb(255 255 255 / 14%);border-radius:12px;' +
    'background:rgb(20 23 30 / 92%);box-shadow:0 24px 80px rgb(0 0 0 / 55%);';
  const heading = document.createElement('h1');
  heading.style.cssText = 'margin:0 0 12px;font-size:20px;letter-spacing:.04em;';
  heading.textContent = title;
  const body = document.createElement('p');
  body.style.cssText = 'margin:0;color:#c9ced8;white-space:pre-wrap;';
  body.textContent = detail;
  card.append(heading, body);
  panel.append(card);
  root.replaceChildren(panel);
}

/** 页面级布局：canvas 在底层，React 在上层；`.app` 透明以露出 3D 舞台。 */
function injectLayoutStyle(): void {
  if (document.querySelector('style[data-gbl="layout"]') !== null) return;
  const style = document.createElement('style');
  style.dataset.gbl = 'layout';
  style.textContent = [
    '#game-canvas{position:fixed;inset:0;width:100%;height:100%;display:block;z-index:0;background:#0b0d12;outline:none;touch-action:none;}',
    '#root{position:fixed;inset:0;z-index:1;}',
    '.app{background:transparent;}',
  ].join('\n');
  document.head.append(style);
}

/** 音频端口的装配层代理：玩法时钟用 fallback，发声交给真正的引擎。 */
function createAudioHost(engine: AudioEngine | null, clock: MusicClock): AudioPort {
  const guarded = async (action: () => Promise<void>): Promise<void> => {
    try {
      await action();
    } catch (error) {
      console.warn('[gbl/audio] 音频调用失败，静默继续', error);
    }
  };
  return {
    clock,
    start: () => (engine === null ? Promise.resolve() : guarded(() => engine.start())),
    suspend: () => (engine === null ? Promise.resolve() : guarded(() => engine.suspend())),
    resume: () => (engine === null ? Promise.resolve() : guarded(() => engine.resume())),
    setSegment: (segment) => engine?.setSegment(segment),
    setLayerGain: (layer, gain) => engine?.setLayerGain(layer, gain),
    setChoir: (mix) => engine?.setChoir(mix),
    setSilenced: (silenced) => engine?.setSilenced(silenced),
    playCue: (cue, variant) => engine?.playCue(cue, variant),
    dispose: () => engine?.dispose(),
  };
}

/** 曲目信息（主菜单/结算/后台曲目单共用）。 */
function buildSongView(data: DataRegistry): SongView {
  return {
    title: SONG_TITLE,
    key: 'am',
    durationLabel: formatTime(data.balance.run.durationSec),
    segments: data.segments.map((segment) => segment.name),
  };
}

/**
 * 唯一启动入口：创建单例、挂载 React、启动循环；返回卸载函数。
 */
export async function bootstrap(root: HTMLElement, canvas: HTMLCanvasElement): Promise<() => void> {
  injectLayoutStyle();

  const boot = createBootContext(window.location.search);
  if (!boot.supported) {
    renderFatal(root, '无法开演', boot.webgl2.reason ?? '当前环境不支持 WebGL2。');
    return () => undefined;
  }

  const savePort = (() => {
    try {
      return createLocalStorageSavePort(window.localStorage);
    } catch {
      return createLocalStorageSavePort(null);
    }
  })();
  const loaded = savePort.load();
  const data = buildDataRegistry();

  let renderer;
  try {
    renderer = createRenderer(canvas);
  } catch (error) {
    renderFatal(root, '无法开演', error instanceof Error ? error.message : String(error));
    return () => undefined;
  }

  const scene = createScene(data, data.palette);
  const camera = createCameraRig(canvas);
  const audience = createAudienceInstances(data);
  const noise = createNoiseInstances(data.balance.noise.cap);
  const particles = createParticleInstances(data.balance.performance.particles);
  const fx = createFxSystem(scene.scene);

  let engine: AudioEngine | null = null;
  try {
    engine = await createAudioEngine(data);
  } catch (error) {
    console.warn('[gbl/audio] 引擎创建失败，本局静默继续', error);
  }
  const fallbackClock = createFallbackClock(data);
  const audio = createAudioHost(engine, fallbackClock);

  const events = createEventBus();
  const seed = boot.seed ?? Date.now() >>> 0;
  const store = createGameStore({
    data,
    rng: createRng(seed),
    events,
    audio,
    save: savePort,
    telemetry: null,
    fallbackClock,
  });
  const bridge = createUiBridge({
    store,
    data,
    save: savePort,
    initialSave: loaded.data,
    song: buildSongView(data),
  });
  if (boot.quality !== null) {
    bridge.dispatch({ type: 'set-quality', quality: boot.quality });
  }

  const reactRoot = createRoot(root);
  reactRoot.render(
    <StrictMode>
      <App bridge={bridge} />
    </StrictMode>,
  );

  const buffer = createInputBuffer();
  const input = createInputSampler(buffer, 1);
  const detachInput = attachDomInput(buffer, { target: root, ignoreWhenTyping: true });

  const resize = (): void => {
    const width = Math.max(1, Math.floor(canvas.clientWidth || window.innerWidth));
    const height = Math.max(1, Math.floor(canvas.clientHeight || window.innerHeight));
    renderer.resize(width, height, Math.min(2, Math.max(1, window.devicePixelRatio || 1)));
  };
  resize();
  window.addEventListener('resize', resize);

  const loop = createLoop({
    store,
    input,
    projector: camera,
    audio,
    renderer,
    display: () => bridge.ui.getSnapshot().display,
  });

  // HUD 节流到 10Hz：bridge.publishHud 内部还有 100ms 闸门。
  const hudTimer = window.setInterval(() => bridge.publishHud(), 100);

  const syncAudioMix = (): void => {
    if (engine === null) return;
    applyAudioMix(engine, bridge.ui.getSnapshot().settings.settings);
  };
  syncAudioMix();
  const unsubscribeUi = bridge.ui.subscribe(syncAudioMix);

  const onVisibilityChange = (): void => {
    if (engine !== null) setAudioHostHidden(engine, document.hidden);
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  const startAudioOnce = (): void => {
    window.removeEventListener('pointerdown', startAudioOnce);
    window.removeEventListener('keydown', startAudioOnce);
    void audio.start();
  };
  window.addEventListener('pointerdown', startAudioOnce);
  window.addEventListener('keydown', startAudioOnce);

  if (boot.dev.devTools) {
    (globalThis as { __gbl?: unknown }).__gbl = { store, bridge, data, renderer, boot };
  }

  loop.start();

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    loop.stop();
    window.clearInterval(hudTimer);
    detachInput();
    window.removeEventListener('resize', resize);
    unsubscribeUi();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pointerdown', startAudioOnce);
    window.removeEventListener('keydown', startAudioOnce);
    bridge.dispose();
    store.dispose();
    audio.dispose();
    fx.dispose();
    particles.dispose();
    noise.dispose();
    audience.dispose();
    camera.dispose();
    scene.dispose();
    renderer.dispose();
    reactRoot.unmount();
    const globalRef = globalThis as { __gbl?: unknown };
    if (globalRef.__gbl !== undefined) delete globalRef.__gbl;
  };
}

/* ---------------------------------------------------------------- 自动启动 */

let disposeAssembly: (() => void) | null = null;

const rootElement = document.getElementById('root');
const canvasElement = document.getElementById('game-canvas');

if (rootElement !== null && canvasElement instanceof HTMLCanvasElement) {
  bootstrap(rootElement, canvasElement)
    .then((dispose) => {
      disposeAssembly = dispose;
    })
    .catch((error: unknown) => {
      console.error('[gbl] 启动失败', error);
      renderFatal(rootElement, '启动失败', error instanceof Error ? error.message : String(error));
    });
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      disposeAssembly?.();
      disposeAssembly = null;
    });
  }
} else {
  throw new Error('启动失败：src/index.html 必须包含 #root 与 #game-canvas');
}
