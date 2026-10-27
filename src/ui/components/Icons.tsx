/** 内联 SVG 图标（无外部资源；只用于 HUD 与少量按钮）。 */

import type { ReactElement } from 'react';

export interface IconProps {
  readonly className?: string;
}

function iconClass(className?: string): string {
  return className === undefined ? 'ui-icon' : `ui-icon ${className}`;
}

/** 返听锁定：一只耳朵。 */
export function EarIcon({ className }: IconProps): ReactElement {
  return (
    <svg className={iconClass(className)} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path
        d="M23.5 9.5c0 5-4.2 6.6-4.2 10.6 0 3-2.2 5.4-5.2 5.4-2.7 0-4.8-1.9-4.8-4.6 0-2.2 1.3-3.5 2.7-4.8 1.6-1.5 2.4-2.7 2.4-5.4 0-3.7 2.8-6.2 6.3-6.2 3.4 0 5.6 2.2 5.6 5.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M18 16.2c1.2-.4 2.1-1.2 2.5-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** 断线：插头。 */
export function PlugIcon({ className }: IconProps): ReactElement {
  return (
    <svg className={iconClass(className)} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M11 10V5M21 10V5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M8 10h16v5a8 8 0 0 1-8 8 8 8 0 0 1-8-8v-5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M16 23v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** 静默：斜杠。 */
export function SilenceIcon({ className }: IconProps): ReactElement {
  return (
    <svg className={iconClass(className)} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M5 13h5l6-5v16l-6-5H5v-6Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M23 11l6 10M29 11l-6 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** 安可：循环箭头。 */
export function EncoreIcon({ className }: IconProps): ReactElement {
  return (
    <svg className={iconClass(className)} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path
        d="M25 13a10 10 0 1 0 .4 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M25 6v7h-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 暂停。 */
export function PauseIcon({ className }: IconProps): ReactElement {
  return (
    <svg className={iconClass(className)} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="9" y="7" width="5" height="18" rx="1" fill="currentColor" />
      <rect x="18" y="7" width="5" height="18" rx="1" fill="currentColor" />
    </svg>
  );
}

/** 跳过。 */
export function SkipIcon({ className }: IconProps): ReactElement {
  return (
    <svg className={iconClass(className)} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M8 7l14 9-14 9V7Z" fill="currentColor" />
      <rect x="23" y="7" width="3" height="18" rx="1" fill="currentColor" />
    </svg>
  );
}
