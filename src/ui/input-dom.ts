/**
 * DOM 输入适配（dev-ui）。
 *
 * 只做「浏览器事件 → InputBuffer 纯数据」：
 * - 不读游戏状态，不写 React state，不创建循环；
 * - Esc / Tab 留给 `ui/bridge.ts`（UI 路由），这里只负责玩法输入；
 * - 仅在页面可见、焦点不在表单控件内时接管键盘。
 */

import type { InputBuffer, InputKey } from '../game/input';

/** 绑定选项（tech-spec §5.6）。 */
export interface DomInputOptions {
  /** 接收指针事件的元素（通常是 WebGL canvas）。 */
  readonly target: HTMLElement;
  /** 焦点在输入框/对话框内时不接管键盘。 */
  readonly ignoreWhenTyping: boolean;
}

/** 键位映射：WASD / 方向键 / E / Space。 */
const KEY_MAP: Readonly<Record<string, InputKey>> = {
  KeyW: 'move-up',
  ArrowUp: 'move-up',
  KeyS: 'move-down',
  ArrowDown: 'move-down',
  KeyA: 'move-left',
  ArrowLeft: 'move-left',
  KeyD: 'move-right',
  ArrowRight: 'move-right',
  KeyE: 'interact',
};

const MOVE_KEYS: readonly InputKey[] = [
  'move-up',
  'move-down',
  'move-left',
  'move-right',
  'interact',
];

/** 指针是否落在可交互 UI 上（避免点按钮时点燃）。 */
function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return target.closest('button, a, input, select, textarea, [role="dialog"], [contenteditable="true"]') !== null;
}

/** 焦点是否在可编辑控件里（设置页滑块/文本）。 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return target.closest('input, textarea, select, [contenteditable="true"]') !== null;
}

/**
 * 绑定 pointer 与 keyboard；返回卸载函数。
 *
 * 注意：Esc/Tab 不在这里处理。Esc 由 bridge 统一换算成 `pause/resume/back`，
 * 避免「game 的 pausePressed 与 UI 的 pause 命令」双触发。
 */
export function attachDomInput(buffer: InputBuffer, options: DomInputOptions): () => void {
  const { target, ignoreWhenTyping } = options;
  let holdStartedAt: number | null = null;
  let holdTimer: ReturnType<typeof setInterval> | null = null;
  let holdResetTimer: ReturnType<typeof setTimeout> | null = null;

  const setKey = (key: InputKey, down: boolean): void => {
    buffer.setKey(key, down);
  };

  const updateHold = (): void => {
    if (holdStartedAt === null) {
      return;
    }
    buffer.setHoldSeconds(Math.max(0, (performance.now() - holdStartedAt) / 1000));
  };

  const stopHold = (): void => {
    if (holdStartedAt === null) {
      return;
    }
    updateHold();
    holdStartedAt = null;
    if (holdTimer !== null) {
      clearInterval(holdTimer);
      holdTimer = null;
    }
    if (holdResetTimer !== null) {
      clearTimeout(holdResetTimer);
    }
    // 给固定步长循环留一拍，读到「松开前」的最终时长，再归零。
    holdResetTimer = setTimeout(() => {
      holdResetTimer = null;
      buffer.setHoldSeconds(0);
    }, 120);
  };

  const startHold = (): void => {
    if (holdStartedAt !== null) {
      return;
    }
    holdStartedAt = performance.now();
    buffer.setHoldSeconds(0);
    if (holdTimer !== null) {
      clearInterval(holdTimer);
    }
    holdTimer = setInterval(updateHold, 50);
  };

  const clearAll = (): void => {
    for (const key of MOVE_KEYS) {
      setKey(key, false);
    }
    stopHold();
    buffer.setKey('beam', false);
    buffer.setHoldSeconds(0);
  };

  const updatePointer = (event: PointerEvent): void => {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    // 契约里的 Vec2 是 XZ 平面（x, z）；NDC 的 y 存到 z，由 PointerProjector 解释。
    buffer.setPointerNdc({
      x: Math.max(-1, Math.min(1, x)),
      z: Math.max(-1, Math.min(1, y)),
    });
  };

  const onPointerMove = (event: PointerEvent): void => {
    updatePointer(event);
  };

  const onPointerDown = (event: PointerEvent): void => {
    updatePointer(event);
    if (event.button !== 0 || isInteractiveTarget(event.target)) {
      return;
    }
    event.preventDefault();
    buffer.setKey('beam', true);
    buffer.press('ignite');
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }
    buffer.setKey('beam', false);
  };

  const onPointerCancel = (): void => {
    buffer.setKey('beam', false);
  };

  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (ignoreWhenTyping && isTypingTarget(event.target)) {
      return;
    }
    // 焦点在按钮上时，Space/Enter 属于「激活」，不抢。
    if ((event.code === 'Space' || event.code === 'Enter') && isInteractiveTarget(event.target)) {
      return;
    }

    const mapped = KEY_MAP[event.code];
    if (mapped !== undefined) {
      event.preventDefault();
      setKey(mapped, true);
      return;
    }

    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) {
        startHold();
      }
    }
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    const mapped = KEY_MAP[event.code];
    if (mapped !== undefined) {
      setKey(mapped, false);
      return;
    }
    if (event.code === 'Space') {
      stopHold();
    }
  };

  const onBlur = (): void => {
    clearAll();
  };

  const onVisibilityChange = (): void => {
    if (document.hidden) {
      clearAll();
    }
  };

  target.addEventListener('pointermove', onPointerMove);
  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    target.removeEventListener('pointermove', onPointerMove);
    target.removeEventListener('pointerdown', onPointerDown);
    target.removeEventListener('contextmenu', onContextMenu);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (holdTimer !== null) {
      clearInterval(holdTimer);
      holdTimer = null;
    }
    if (holdResetTimer !== null) {
      clearTimeout(holdResetTimer);
      holdResetTimer = null;
    }
  };
}
