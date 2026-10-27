/** 中断选择：安可（回到峰值 40%）或继续独奏（进入空场）。 */

import type { ReactElement } from 'react';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';

export interface InterruptOverlayProps {
  readonly onEncore: () => void;
  readonly onContinueSolo: () => void;
}

/** 人气连续 8 小节低于峰值 8% 时的唯一选择。 */
export function InterruptOverlay({ onEncore, onContinueSolo }: InterruptOverlayProps): ReactElement {
  return (
    <Dialog label="人气告急" size="sm">
      <header className="dialog__head">
        <p className="ui-eyebrow">还有最后一次</p>
        <h2 className="dialog__title">他们快听不见了</h2>
        <p className="dialog__sub">
          安可会把人气拉回峰值的一部分，四区热度各加一级；继续独奏则进入空场，把剩下的段落一个人弹完。
        </p>
      </header>
      <div className="dialog__actions dialog__actions--row">
        <Button variant="primary" data-autofocus="true" onClick={onEncore}>
          安可
        </Button>
        <Button variant="secondary" onClick={onContinueSolo}>
          继续独奏
        </Button>
      </div>
      <p className="dialog__hint">安可只能用一次。选完之前，游戏是冻结的。</p>
    </Dialog>
  );
}
