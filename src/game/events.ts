/**
 * 同步事件总线（game → audio / three / ui / telemetry 的单向广播）。
 *
 * 用途：所有跨层通信用同一份 `GameEvent` 可辨识联合；事件在发生当拍同步分发，
 * 不做异步队列（拍点即玩法，延迟一帧就会失手）。
 *
 * 依赖：仅 `../types/game` 的 `EventBus` / `GameEvent` / `GameEventHandler`。
 * 分发语义：订阅顺序分发；订阅者可在回调内退订（用 `active` 标记，惰性清理）；
 * 处理器抛出的异常向上冒泡——集成层必须在自己的 handler 内防御，
 * 否则会中断当前固定步长（宁可暴露 bug，也不静默吞掉）。
 *
 * 导出：
 * - `createEventBus()`：创建总线；
 * - `describeEvent(event)`：稳定字符串（单测断言用）；
 * - `EventBus` / `GameEventHandler` 类型再导出。
 */
import type { EventBus, GameEvent, GameEventHandler } from '../types/game';

interface Subscription {
  handler: GameEventHandler;
  active: boolean;
}

/** 浮点格式化：固定 3 位，保证 `describeEvent` 输出稳定、可 diff。 */
function fixed(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : 'NaN';
}

/**
 * 创建事件总线。
 *
 * - `emit(event)`：同步分发给当前全部订阅者；
 * - `subscribe(handler)`：返回退订函数（可重复调用，幂等）。
 */
export function createEventBus(): EventBus {
  const subscriptions: Subscription[] = [];

  const compact = (): void => {
    let write = 0;
    for (let read = 0; read < subscriptions.length; read += 1) {
      const sub = subscriptions[read];
      if (sub !== undefined && sub.active) {
        subscriptions[write] = sub;
        write += 1;
      }
    }
    subscriptions.length = write;
  };

  const emit = (event: GameEvent): void => {
    // 先清理上一轮退订，避免数组无限增长。
    compact();
    const length = subscriptions.length;
    for (let i = 0; i < length; i += 1) {
      const sub = subscriptions[i];
      if (sub !== undefined && sub.active) {
        sub.handler(event);
      }
    }
  };

  const subscribe = (handler: GameEventHandler): (() => void) => {
    const sub: Subscription = { handler, active: true };
    subscriptions.push(sub);
    return () => {
      sub.active = false;
    };
  };

  return { emit, subscribe };
}

/**
 * 把事件序列化为稳定字符串（仅测试与日志断言使用，不参与游戏逻辑）。
 *
 * 输出形如 `ignite#12|perfect|front-left|chord`，字段顺序固定。
 */
export function describeEvent(event: GameEvent): string {
  const head = `t=${fixed(event.time)} beat=${String(event.beatIndex)}`;
  switch (event.kind) {
    case 'ignite':
      return `${head} ignite|${event.quality}|${event.zone ?? '-'}|${event.inChord ? 'chord' : 'free'}|x${fixed(event.position.x)},z${fixed(event.position.z)}`;
    case 'convert':
      return `${head} convert|seat=${String(event.seat)}|${event.zone}|+${String(event.amount)}|${event.source}`;
    case 'cast-out':
      return `${head} cast-out|seat=${String(event.seat)}|${event.zone}|-${String(event.amount)}|${event.cause}`;
    case 'cover':
      return `${head} cover|seat=${String(event.seat)}|${event.zone}`;
    case 'crowd-wave':
      return `${head} crowd-wave|${String(event.index)}|origin=${event.origin}`;
    case 'return-listener':
      return `${head} return-listener|${event.action}`;
    case 'line':
      return `${head} line|${event.action}|${event.line}`;
    case 'member-moment':
      return `${head} member-moment|${event.member}|${event.moment}`;
    case 'segment':
      return `${head} segment|${event.from}->${event.to}`;
    case 'boss':
      return `${head} boss|${event.phase}|${event.action}|${event.zone ?? '-'}`;
    case 'silence':
      return `${head} silence|${event.active ? 'on' : 'off'}|${fixed(event.remaining)}`;
    case 'crack':
      return `${head} crack|total=${String(event.total)}`;
    case 'levelup':
      return `${head} levelup|${String(event.offer.offerId)}|${event.offer.cards.join(',')}`;
    case 'evolution':
      return `${head} evolution|${event.evolution}`;
    case 'encore':
      return `${head} encore|+${String(event.restoredAudience)}`;
    case 'failure':
      return `${head} failure|${event.card.reasons.map((reason) => reason.code).join(',')}`;
    case 'run-end':
      return `${head} run-end|${event.result.ending}|${event.result.grade ?? '-'}`;
    case 'audio-cue':
      return `${head} audio-cue|${event.cue}|${event.variant ?? '-'}`;
    case 'hud':
      return `${head} hud|rev=${String(event.revision)}`;
    default: {
      // 穷尽性检查：新增事件类型时这里会编译失败。
      const never: never = event;
      return `${head} unknown|${String(never)}`;
    }
  }
}

export type { EventBus, GameEventHandler };
