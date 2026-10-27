/** 回主菜单确认：本场不写记录，避免误触丢失一局。 */

import type { ReactElement } from 'react';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';

export interface ConfirmQuitOverlayProps {
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

/** 放弃本场确认。 */
export function ConfirmQuitOverlay({ onCancel, onConfirm }: ConfirmQuitOverlayProps): ReactElement {
  return (
    <Dialog label="离开确认" size="sm">
      <header className="dialog__head">
        <p className="ui-eyebrow">回主菜单</p>
        <h2 className="dialog__title">放下今晚？</h2>
        <p className="dialog__sub">这一场不会写进记录。灯光会重新亮起，但人不会记得。</p>
      </header>
      <div className="dialog__actions dialog__actions--row">
        <Button variant="secondary" data-autofocus="true" onClick={onCancel}>
          继续演出
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          放弃并回主菜单
        </Button>
      </div>
    </Dialog>
  );
}
