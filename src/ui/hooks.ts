/**
 * React ↔ 外部 store 的 hooks（dev-ui）。
 *
 * 只使用 `useSyncExternalStore`，不在 rAF 中 setState，不复制快照内容。
 * HUD 的通知频率由 `ui/bridge.ts` 节流到 ≤10Hz。
 */

import { useCallback, useSyncExternalStore } from 'react';
import type { HudSnapshot } from '../types/game';
import type { UiBridge, UiState } from '../types/ui';
import type { RunUiFlags, RunUiStore } from './bridge';

/** 空 run 快照（bridge 尚未注入 runtime store 时的安全回退）。 */
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

/** 判断对象是否实现了 run 订阅面。 */
function readRunStore(bridge: UiBridge): RunUiStore | null {
  const candidate: unknown = (bridge as { readonly run?: unknown }).run;
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }
  if (!('getSnapshot' in candidate) || !('subscribe' in candidate)) {
    return null;
  }
  const maybe = candidate as { readonly getSnapshot?: unknown; readonly subscribe?: unknown };
  if (typeof maybe.getSnapshot !== 'function' || typeof maybe.subscribe !== 'function') {
    return null;
  }
  return candidate as RunUiStore;
}

/** 订阅 HUD 快照（≤10Hz）。 */
export function useHud(bridge: UiBridge): HudSnapshot {
  return useSyncExternalStore(bridge.hud.subscribe, bridge.hud.getSnapshot, bridge.hud.getSnapshot);
}

/** 订阅屏幕/覆盖层状态（低频）。 */
export function useUi(bridge: UiBridge): UiState {
  return useSyncExternalStore(bridge.ui.subscribe, bridge.ui.getSnapshot, bridge.ui.getSnapshot);
}

/**
 * 订阅 run 摘要（卡牌、空场、中断选择）。
 *
 * `UiBridge` 契约只含 HUD/UI 两个 store；bridge 实现额外暴露 `run`。
 * 这里做能力探测，保证即使 main 注入的是基础 UiBridge，HUD 仍可渲染。
 */
export function useRunFlags(bridge: UiBridge): RunUiFlags {
  const store = readRunStore(bridge);
  const subscribe = useCallback(
    (listener: () => void): (() => void) => (store === null ? () => undefined : store.subscribe(listener)),
    [store],
  );
  const getSnapshot = useCallback(
    (): RunUiFlags => (store === null ? IDLE_RUN : store.getSnapshot()),
    [store],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
