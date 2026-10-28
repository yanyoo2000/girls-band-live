/**
 * UI 根组件（dev-ui）。
 *
 * 只接 `bridge`：订阅低频 UI 状态，按 route 切屏幕与覆盖层；
 * 不创建单例、不碰 Three、不承载游戏循环、不在 rAF 中 setState。
 */

import type { ReactElement } from 'react';
import type { OverlayKind, ScreenId, UiBridge, UiState } from './types/ui';
import { useUi } from './ui/hooks';
import { Button } from './ui/components/Button';
import { ScreenShell } from './ui/components/ScreenShell';
import { Toast } from './ui/components/Toast';
import { ViewportGate } from './ui/components/ViewportGate';
import { OVERLAY_LABELS, SCREEN_LABELS } from './ui/copy';
import { BootScreen } from './ui/screens/BootScreen';
import { CreditsScreen } from './ui/screens/CreditsScreen';
import { MenuScreen } from './ui/screens/MenuScreen';
import { PlayingScreen } from './ui/screens/PlayingScreen';
import { RehearsalScreen } from './ui/screens/RehearsalScreen';
import { ResultsScreen } from './ui/screens/ResultsScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { SetlistScreen } from './ui/screens/SetlistScreen';
import { ConfirmQuitOverlay } from './ui/overlays/ConfirmQuitOverlay';
import { FailureOverlay } from './ui/overlays/FailureOverlay';
import { LevelUpOverlay } from './ui/overlays/LevelUpOverlay';
import { PauseOverlay } from './ui/overlays/PauseOverlay';
import { SettingsOverlay } from './ui/overlays/SettingsOverlay';

/** 屏幕渲染（纯函数，不订阅）。 */
function renderScreen(ui: UiState, bridge: UiBridge, overlay: OverlayKind): ReactElement {
  const navigate = (screen: ScreenId): void => bridge.dispatch({ type: 'navigate', screen });

  switch (ui.route.screen) {
    case 'boot':
      return <BootScreen audioUnlocked={ui.audioUnlocked} onStart={() => bridge.dispatch({ type: 'unlock-audio' })} />;
    case 'menu':
      return (
        <MenuScreen
          view={ui.menu}
          settingsView={ui.settings}
          onStart={() => bridge.dispatch({ type: 'start-run', seed: null })}
          onNavigate={navigate}
          onPatch={(values) => bridge.dispatch({ type: 'update-settings', patch: values })}
          onToggleFullscreen={() => bridge.dispatch({ type: 'toggle-fullscreen' })}
        />
      );
    case 'setlist':
      return <SetlistScreen view={ui.setlist} onBack={() => navigate('menu')} />;
    case 'rehearsal':
      return <RehearsalScreen view={ui.rehearsal} onBack={() => navigate('menu')} />;
    case 'settings':
      return (
        <SettingsScreen
          view={ui.settings}
          onPatch={(values) => bridge.dispatch({ type: 'update-settings', patch: values })}
          onBack={() => navigate(ui.route.backTo ?? 'menu')}
          onToggleFullscreen={() => bridge.dispatch({ type: 'toggle-fullscreen' })}
        />
      );
    case 'credits':
      return <CreditsScreen view={ui.credits} onBack={() => navigate('menu')} />;
    case 'playing':
    case 'paused':
    case 'levelup':
      return <PlayingScreen bridge={bridge} overlay={overlay} />;
    case 'results':
      if (ui.result === null) {
        return (
          <ScreenShell title="散场之后" eyebrow="还没有可看的结算" width="narrow">
            <p className="results__empty">这一场还没有结束。回主菜单，再开一场。</p>
            <Button variant="primary" onClick={() => navigate('menu')}>
              回主菜单
            </Button>
          </ScreenShell>
        );
      }
      return (
        <ResultsScreen
          view={ui.result}
          bridge={bridge}
          onRestart={() => bridge.dispatch({ type: 'restart-run', seed: null })}
          onMenu={() => navigate('menu')}
        />
      );
    default:
      return <MenuScreen
        view={ui.menu}
        settingsView={ui.settings}
        onStart={() => bridge.dispatch({ type: 'start-run', seed: null })}
        onNavigate={navigate}
        onPatch={(values) => bridge.dispatch({ type: 'update-settings', patch: values })}
        onToggleFullscreen={() => bridge.dispatch({ type: 'toggle-fullscreen' })}
      />;
  }
}

/** 覆盖层渲染（同一时刻只有一个）。 */
function renderOverlay(ui: UiState, bridge: UiBridge): ReactElement | null {
  switch (ui.route.overlay) {
    case 'none':
      return null;
    case 'pause':
      if (ui.pause === null) {
        return null;
      }
      return (
        <PauseOverlay
          view={ui.pause}
          bridge={bridge}
          onResume={() => bridge.dispatch({ type: 'close-overlay' })}
          onRestart={() => bridge.dispatch({ type: 'restart-run', seed: null })}
          onSettings={() => bridge.dispatch({ type: 'open-overlay', overlay: 'settings' })}
          onQuit={() => bridge.dispatch({ type: 'open-overlay', overlay: 'confirm-quit' })}
        />
      );
    case 'levelup':
      if (ui.levelUp === null) {
        return null;
      }
      return (
        <LevelUpOverlay
          view={ui.levelUp}
          bridge={bridge}
          onChoose={(cardId) => bridge.dispatch({ type: 'choose-card', cardId })}
        />
      );
    case 'failure':
      if (ui.failure === null) {
        return null;
      }
      return (
        <FailureOverlay
          view={ui.failure}
          onSkip={() => bridge.dispatch({ type: 'navigate', screen: 'results' })}
        />
      );
    case 'settings':
      return (
        <SettingsOverlay
          view={ui.settings}
          onPatch={(values) => bridge.dispatch({ type: 'update-settings', patch: values })}
          onBack={() => bridge.dispatch({ type: 'close-overlay' })}
          onToggleFullscreen={() => bridge.dispatch({ type: 'toggle-fullscreen' })}
        />
      );
    case 'confirm-quit':
      return (
        <ConfirmQuitOverlay
          onCancel={() => bridge.dispatch({ type: 'close-overlay' })}
          onConfirm={() => bridge.dispatch({ type: 'quit-run' })}
        />
      );
    default:
      return null;
  }
}

/** UI 根组件。 */
export function App({ bridge }: { readonly bridge: UiBridge }): ReactElement {
  const ui = useUi(bridge);
  const overlay = ui.route.overlay;
  const display = ui.display;
  const announcement =
    overlay === 'none' ? SCREEN_LABELS[ui.route.screen] : OVERLAY_LABELS[overlay];

  const classes = [
    'app',
    `app--${ui.route.screen}`,
    display.reducedMotion ? 'is-reduced-motion' : '',
    display.highContrast ? 'is-high-contrast' : '',
    display.lowFlash ? 'is-low-flash' : '',
    display.quality === 'low' ? 'is-low-quality' : '',
  ]
    .filter((value) => value.length > 0)
    .join(' ');

  return (
    <div
      className={classes}
      data-screen={ui.route.screen}
      data-overlay={overlay}
      data-quality={display.quality}
      data-reduced-motion={display.reducedMotion ? 'true' : 'false'}
      data-high-contrast={display.highContrast ? 'true' : 'false'}
      data-low-flash={display.lowFlash ? 'true' : 'false'}
      data-beat-pulse={display.beatPulse ? 'true' : 'false'}
    >
      <a
        className="skip-link"
        href="#ui-stage"
        onClick={(event) => {
          // 跳过导航必须把焦点真正移到主区域；仅靠 hash + tabindex=-1 在部分浏览器
          // 只移动滚动位置，键盘用户下一次 Tab 仍从文档开头开始。
          event.preventDefault();
          document.getElementById('ui-stage')?.focus();
        }}
      >
        跳到主要内容
      </a>
      <main
        id="ui-stage"
        className="app__screen"
        tabIndex={-1}
        aria-hidden={overlay === 'none' ? undefined : true}
        inert={overlay === 'none' ? undefined : true}
      >
        {renderScreen(ui, bridge, overlay)}
      </main>
      <div className="app__overlays">
        {renderOverlay(ui, bridge)}
        <ViewportGate onMenu={() => bridge.dispatch({ type: 'navigate', screen: 'menu' })} />
      </div>
      {ui.toast === null ? null : (
        <Toast toast={ui.toast} onDismiss={() => bridge.dispatch({ type: 'dismiss-toast' })} />
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
