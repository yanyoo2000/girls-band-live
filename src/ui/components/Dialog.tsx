/** 模态对话框：焦点陷阱、初始焦点、关闭后焦点归还。 */

import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent, ReactElement, ReactNode } from 'react';

export interface DialogProps {
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly describedBy?: string;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** 收集对话框内可见可聚焦元素。 */
function focusableInside(root: HTMLElement): readonly HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => {
    if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') {
      return false;
    }
    return element.getClientRects().length > 0;
  });
}

/** 模态层：同一时刻只渲染一个（由 App 保证）。 */
export function Dialog({ label, children, className, size = 'md', describedBy }: DialogProps): ReactElement {
  const labelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (root === null) {
      return;
    }
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const preferred = root.querySelector<HTMLElement>('[data-autofocus="true"]');
    const first = preferred ?? focusableInside(root)[0] ?? root;
    first.focus();
    return () => {
      if (previous !== null && previous.isConnected) {
        previous.focus();
      }
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Tab') {
      return;
    }
    const root = rootRef.current;
    if (root === null) {
      return;
    }
    const nodes = focusableInside(root);
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (first === undefined || last === undefined) {
      event.preventDefault();
      root.focus();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const classes = ['dialog', `dialog--${size}`, className ?? '']
    .filter((value) => value.length > 0)
    .join(' ');

  return (
    <div className="dialog-layer">
      <div className="dialog-layer__scrim" aria-hidden="true" />
      <div
        ref={rootRef}
        className={classes}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <h2 id={labelId} className="sr-only">
          {label}
        </h2>
        {children}
      </div>
    </div>
  );
}
