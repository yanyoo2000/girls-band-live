/** 屏幕外壳：统一标题、返回、焦点落点与桌面安全边。 */

import { useEffect, useId, useRef } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Button } from './Button';

export interface ScreenShellProps {
  readonly title: string;
  readonly eyebrow?: string;
  readonly children: ReactNode;
  readonly onBack?: () => void;
  readonly backLabel?: string;
  readonly actions?: ReactNode;
  readonly footer?: ReactNode;
  readonly className?: string;
  readonly width?: 'default' | 'wide' | 'narrow';
}

/** 屏幕容器：挂载时把焦点放到标题（Tab 从标题之后开始）。 */
export function ScreenShell({
  title,
  eyebrow,
  children,
  onBack,
  backLabel = '返回',
  actions,
  footer,
  className,
  width = 'default',
}: ScreenShellProps): ReactElement {
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const classes = ['screen', `screen--${width}`, className ?? '']
    .filter((value) => value.length > 0)
    .join(' ');

  return (
    <section className={classes} aria-labelledby={titleId}>
      <header className="screen__head">
        <div className="screen__heading">
          {onBack !== undefined ? (
            <Button variant="ghost" className="screen__back" onClick={onBack}>
              <span aria-hidden="true">←</span> {backLabel}
            </Button>
          ) : null}
          {eyebrow !== undefined ? <p className="ui-eyebrow">{eyebrow}</p> : null}
          <h1 id={titleId} ref={headingRef} className="screen__title" tabIndex={-1}>
            {title}
          </h1>
        </div>
        {actions !== undefined ? <div className="screen__actions">{actions}</div> : null}
      </header>
      <div className="screen__body">{children}</div>
      {footer !== undefined ? <footer className="screen__foot">{footer}</footer> : null}
    </section>
  );
}
