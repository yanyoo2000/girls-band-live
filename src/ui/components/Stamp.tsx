/** 结算评级印章（8° 倾斜；无外部素材）。 */

import type { ReactElement } from 'react';
import type { Grade } from '../../types/game';
import { GRADE_LABELS } from '../copy';

export interface StampProps {
  readonly grade: Grade;
  readonly label?: string;
}

/** 评级印章。 */
export function Stamp({ grade, label }: StampProps): ReactElement {
  return (
    <div className={`stamp stamp--${grade.toLowerCase()}`} role="img" aria-label={`评级 ${grade}：${label ?? GRADE_LABELS[grade]}`}>
      <span className="stamp__letter" aria-hidden="true">
        {grade}
      </span>
      <span className="stamp__label" aria-hidden="true">
        {label ?? GRADE_LABELS[grade]}
      </span>
      <span className="stamp__rule" aria-hidden="true" />
    </div>
  );
}
