/**
 * 键盘/鼠标输入的纯数据抽象（不触 DOM）。
 *
 * 用途：`ui/input-dom.ts` 把 DOM 事件翻译成 `setKey` / `press` / `setPointerNdc`，
 * 引擎在固定步长里把缓冲合成为一帧 `InputFrame`；game 层永远看不到 KeyboardEvent。
 *
 * 依赖：仅 `../types/game` 的 `InputFrame` / `PointerProjector` / `Seconds` / `Vec2`。
 * 分配策略：采样器复用一个可变的帧对象（每步长零分配）；`sample` 不清理边沿，
 * 由调用方在整帧结束后调用 `clearFrameEdges()`（一次 DOM 帧可能跑多个固定步长，
 * 边沿只在第一个 step 生效，符合“点击一次 = 一次点燃”）。
 *
 * 导出：
 * - `createInputBuffer()`：输入缓冲；
 * - `createInputSampler(buffer, moveSpeed)`：合帧采样器；
 * - `InputKey` / `InputBuffer` / `InputSampler` 类型。
 */
import type { InputFrame, PointerProjector, Seconds, Vec2 } from '../types/game';

/** 引擎关心的全部键位（桌面键鼠，无触屏）。 */
export type InputKey =
  | 'move-left'
  | 'move-right'
  | 'move-up'
  | 'move-down'
  | 'beam'
  | 'ignite'
  | 'interact'
  | 'pause';

/** 纯输入缓冲：只存数据，不触 DOM。 */
export interface InputBuffer {
  setKey(key: InputKey, down: boolean): void;
  press(key: InputKey): void;
  setPointerNdc(ndc: Vec2): void;
  setHoldSeconds(seconds: Seconds): void;
  clearFrameEdges(): void;
}

/** 输入采样器：把缓冲 + 投影器合成一帧 InputFrame。 */
export interface InputSampler {
  readonly buffer: InputBuffer;
  sample(projector: PointerProjector): InputFrame;
}

/** 按键状态表（显式字段，避免 `Record<InputKey, boolean>` 索引产生 undefined）。 */
interface KeyState {
  'move-left': boolean;
  'move-right': boolean;
  'move-up': boolean;
  'move-down': boolean;
  beam: boolean;
  ignite: boolean;
  interact: boolean;
  pause: boolean;
}

const KEY_NAMES: readonly InputKey[] = [
  'move-left',
  'move-right',
  'move-up',
  'move-down',
  'beam',
  'ignite',
  'interact',
  'pause',
];

function createKeyState(): KeyState {
  return {
    'move-left': false,
    'move-right': false,
    'move-up': false,
    'move-down': false,
    beam: false,
    ignite: false,
    interact: false,
    pause: false,
  };
}

/** 缓冲的内部可变状态（不进入公开签名）。 */
interface BufferState {
  readonly keys: KeyState;
  readonly edges: KeyState;
  pointerNdc: Vec2;
  holdSeconds: Seconds;
}

/** 公开 `InputBuffer` 与内部状态的绑定表（只在本模块写入/读取）。 */
const BUFFER_STATES = new WeakMap<InputBuffer, BufferState>();

/** 采样器内部复用的可变帧（以 `InputFrame` 只读视图返回）。 */
interface MutableFrame {
  move: Vec2;
  pointerNdc: Vec2;
  pointerWorld: Vec2;
  beamHeld: boolean;
  ignitePressed: boolean;
  interactHeld: boolean;
  holdSeconds: Seconds;
  pausePressed: boolean;
}

/**
 * 创建输入缓冲（按住态 + 本帧边沿 + 指针 NDC + Space 长按秒数）。
 *
 * 边沿（`press`）只在 `clearFrameEdges()` 之前有效；`setKey` 是“按住”。
 */
export function createInputBuffer(): InputBuffer {
  const state: BufferState = {
    keys: createKeyState(),
    edges: createKeyState(),
    pointerNdc: { x: 0, z: 0 },
    holdSeconds: 0,
  };

  const setKey = (key: InputKey, down: boolean): void => {
    state.keys[key] = down;
  };

  const press = (key: InputKey): void => {
    state.edges[key] = true;
  };

  const setPointerNdc = (ndc: Vec2): void => {
    state.pointerNdc = { x: ndc.x, z: ndc.z };
  };

  const setHoldSeconds = (seconds: Seconds): void => {
    state.holdSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  };

  const clearFrameEdges = (): void => {
    for (let i = 0; i < KEY_NAMES.length; i += 1) {
      const name = KEY_NAMES[i];
      if (name !== undefined) {
        state.edges[name] = false;
      }
    }
  };

  const buffer: InputBuffer = { setKey, press, setPointerNdc, setHoldSeconds, clearFrameEdges };
  BUFFER_STATES.set(buffer, state);
  return buffer;
}

/**
 * 创建输入采样器。
 *
 * @param buffer 由 `ui/input-dom.ts` 写入的输入缓冲
 * @param moveSpeed 主唱移速（米/秒）；≤0 时移动轴强制为 0（过场/结算锁定操作）
 */
export function createInputSampler(buffer: InputBuffer, moveSpeed: number): InputSampler {
  const frame: MutableFrame = {
    move: { x: 0, z: 0 },
    pointerNdc: { x: 0, z: 0 },
    pointerWorld: { x: 0, z: 0 },
    beamHeld: false,
    ignitePressed: false,
    interactHeld: false,
    holdSeconds: 0,
    pausePressed: false,
  };
  const moveEnabled = Number.isFinite(moveSpeed) && moveSpeed > 0;

  const sample = (projector: PointerProjector): InputFrame => {
    const state = BUFFER_STATES.get(buffer);
    const keys = state?.keys;
    const edges = state?.edges;

    let x = (keys?.['move-right'] === true ? 1 : 0) - (keys?.['move-left'] === true ? 1 : 0);
    let z = (keys?.['move-down'] === true ? 1 : 0) - (keys?.['move-up'] === true ? 1 : 0);
    if (moveEnabled) {
      const lengthSquared = x * x + z * z;
      if (lengthSquared > 0) {
        const length = Math.sqrt(lengthSquared);
        x /= length;
        z /= length;
      }
    } else {
      x = 0;
      z = 0;
    }
    frame.move = { x, z };

    const ndc = state?.pointerNdc ?? { x: 0, z: 0 };
    frame.pointerNdc = { x: ndc.x, z: ndc.z };
    const world = projector.toStage(ndc);
    frame.pointerWorld = { x: world.x, z: world.z };

    frame.beamHeld = keys?.beam === true;
    frame.ignitePressed = edges?.ignite === true;
    frame.interactHeld = keys?.interact === true;
    frame.holdSeconds = state?.holdSeconds ?? 0;
    frame.pausePressed = edges?.pause === true;
    return frame;
  };

  return { buffer, sample };
}
