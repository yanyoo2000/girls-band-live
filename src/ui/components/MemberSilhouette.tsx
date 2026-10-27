/** 四名成员的几何剪影（无外部素材；主菜单与结算后台复用）。 */

import type { ReactElement } from 'react';
import type { MemberId } from '../../types/game';
import type { PaletteToken } from '../../types/data';

export interface MemberSilhouetteProps {
  readonly id: MemberId;
  readonly colorToken: PaletteToken;
  readonly className?: string;
}

/** 40px 下也能靠「轮廓 + 乐器形状」区分的四段剪影。 */
function silhouette(id: MemberId): ReactElement {
  switch (id) {
    case 'jiangqi':
      return (
        <g>
          <circle cx="46" cy="26" r="12" />
          <path d="M30 34c2-8 7-12 12-13l8 13-4 7H34l-4-7Z" opacity="0.75" />
          <path d="M37 44h18l5 44-9 28H41l-9-28 5-44Z" />
          <path d="M55 52l24 58" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <circle cx="81" cy="112" r="5" />
        </g>
      );
    case 'xuliao':
      return (
        <g transform="rotate(-4 50 96)">
          <circle cx="42" cy="26" r="11" />
          <path d="M29 47h26l6 44-6 30H29l-6-30 6-44Z" />
          <path d="M48 56l32 22-18 28-30-18 16-32Z" opacity="0.55" />
          <path d="M54 58l30 22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case 'wensheng':
      return (
        <g>
          <circle cx="48" cy="26" r="11" />
          <path d="M27 45h42l4 46-7 30H30l-7-30 4-46Z" />
          <path d="M17 82h64" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
          <circle cx="82" cy="82" r="5" />
        </g>
      );
    case 'shaoyan':
      return (
        <g>
          <circle cx="50" cy="29" r="11" />
          <path d="M29 48h42l4 28-8 20H33l-8-20 4-28Z" />
          <path d="M22 104h56" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
          <path d="M18 64v46M82 64v46" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.65" />
          <ellipse cx="50" cy="102" rx="22" ry="7" opacity="0.45" />
        </g>
      );
    default:
      return <circle cx="50" cy="80" r="24" />;
  }
}

/** 成员剪影：主菜单四联、结算后台、暂停面板。 */
export function MemberSilhouette({ id, colorToken, className }: MemberSilhouetteProps): ReactElement {
  const classes = ['silhouette', className ?? ''].filter((value) => value.length > 0).join(' ');
  return (
    <svg
      className={classes}
      viewBox="0 0 100 160"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      style={{ color: `var(--gbl-color-${colorToken})` }}
    >
      <g fill="currentColor">{silhouette(id)}</g>
    </svg>
  );
}
