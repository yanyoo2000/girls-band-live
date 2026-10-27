/** 非阻塞轻提示（≤1 条，自动消失）。 */

import type { ReactElement } from 'react';
import type { ToastView } from '../../types/ui';

export interface ToastProps {
  readonly toast: ToastView;
  readonly onDismiss: () => void;
}

/** 轻提示：不抢焦点，role=status 播报。 */
export function Toast({ toast, onDismiss }: ToastProps): ReactElement {
  return (
    <div className={`toast toast--${toast.tone}`} role="status" aria-live="polite">
      <span className="toast__mark" aria-hidden="true" />
      <span className="toast__text">{toast.text}</span>
      <button type="button" className="toast__close" onClick={onDismiss} aria-label="关闭提示">
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
