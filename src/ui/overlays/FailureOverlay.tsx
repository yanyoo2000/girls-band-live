/** 失败卡：3 秒可读的三条原因 + 1 秒回放 + 跳过（F7）。 */

import type { ReactElement } from 'react';
import type { FailureView } from '../../types/ui';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { FailureReplay } from '../components/FailureReplay';

export interface FailureOverlayProps {
  readonly view: FailureView;
  readonly onSkip: () => void;
}

/** 中断失败的唯一演出。 */
export function FailureOverlay({ view, onSkip }: FailureOverlayProps): ReactElement {
  return (
    <Dialog label="失败卡" size="md" describedBy="failure-summary">
      <header className="dialog__head">
        <p className="ui-eyebrow">这一场，停在这里</p>
        <h2 className="dialog__title">{view.where}</h2>
        <p id="failure-summary" className="dialog__sub">
          三条原因。读完就可以走。
        </p>
      </header>

      <ol className="failure__reasons">
        {view.reasons.map((reason) => (
          <li key={reason} className="failure__reason">
            {reason}
          </li>
        ))}
      </ol>

      <p className="failure__last">{view.lastFiveSeconds}</p>
      <FailureReplay replay={view.card.replay} />

      <div className="dialog__actions">
        <Button variant="primary" data-autofocus="true" onClick={onSkip}>
          跳过（Esc）
        </Button>
      </div>
      <p className="dialog__hint">失败不会写进最佳记录；失败卡会在几秒后自动进入结算。</p>
    </Dialog>
  );
}
