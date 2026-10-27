/** 基础按钮（React 19 函数组件；无 UI 库）。 */

import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react';

/** 按钮语气。 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly block?: boolean;
  readonly children: ReactNode;
}

/** 通用按钮：44px 高、可见焦点、键盘原生激活。 */
export function Button({
  variant = 'secondary',
  block = false,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps): ReactElement {
  const classes = [
    'ui-btn',
    `ui-btn--${variant}`,
    block ? 'ui-btn--block' : '',
    className ?? '',
  ]
    .filter((value) => value.length > 0)
    .join(' ');
  return (
    <button {...rest} type={type} className={classes}>
      {children}
    </button>
  );
}
