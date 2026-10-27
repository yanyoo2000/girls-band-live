/** 排练室示意图（Canvas/SVG 程序化，无外部素材）。 */

import type { ReactElement } from 'react';

export interface DiagramProps {
  readonly kind: 'light' | 'burn-or-sing' | 'return-listener';
}

/** 三页玩法说明的示意图。 */
export function Diagram({ kind }: DiagramProps): ReactElement {
  switch (kind) {
    case 'light':
      return (
        <svg className="rehearsal-diagram" viewBox="0 0 320 180" role="img" aria-label="舞台上一束光扫向四个座区">
          <rect className="dg-stage" x="10" y="8" width="300" height="24" rx="3" />
          <path className="dg-cone" d="M122 32L42 168h156L136 32Z" />
          <path className="dg-light" d="M129 32L112 168" />
          <g className="dg-zones">
            <rect x="18" y="52" width="64" height="46" rx="3" />
            <rect x="18" y="108" width="64" height="46" rx="3" />
            <rect x="238" y="52" width="64" height="46" rx="3" />
            <rect x="238" y="108" width="64" height="46" rx="3" />
          </g>
          <circle className="dg-member" cx="129" cy="26" r="6" />
          <path className="dg-arrow" d="M87 94L143 106" />
          <text className="dg-label" x="18" y="46">
            前
          </text>
          <text className="dg-label" x="238" y="46">
            前
          </text>
        </svg>
      );
    case 'burn-or-sing':
      return (
        <svg className="rehearsal-diagram" viewBox="0 0 320 180" role="img" aria-label="同一束光：烧掉噪音，或把被覆盖的人唱回来">
          <rect className="dg-stage" x="10" y="8" width="300" height="24" rx="3" />
          <path className="dg-cone" d="M84 32L18 168h132L98 32Z" />
          <g className="dg-noise">
            <path d="M74 100l18 10-18 10Z" />
            <path d="M76 132l18 10-18 10Z" />
          </g>
          <path className="dg-burn" d="M60 106l-18 12M88 138l16 12" />
          <g className="dg-people">
            <circle cx="186" cy="110" r="7" />
            <circle cx="210" cy="118" r="7" />
            <circle cx="234" cy="106" r="7" />
          </g>
          <path className="dg-convert" d="M160 116h58" />
          <text className="dg-label" x="38" y="86">
            烧穿
          </text>
          <text className="dg-label" x="182" y="86">
            唱化
          </text>
        </svg>
      );
    case 'return-listener':
      return (
        <svg className="rehearsal-diagram" viewBox="0 0 320 180" role="img" aria-label="返听锁住光：移光、绕后或烧掉">
          <rect className="dg-stage" x="10" y="8" width="300" height="24" rx="3" />
          <path className="dg-cone" d="M150 32L70 168h160L164 32Z" />
          <g className="dg-speaker">
            <rect x="250" y="56" width="48" height="76" rx="4" />
            <circle cx="274" cy="82" r="10" />
            <circle cx="274" cy="112" r="13" />
          </g>
          <path className="dg-ear" d="M202 44c26 0 34 20 34 34 0 12-8 18-8 28 0 8-7 14-16 14" />
          <path className="dg-arrow" d="M104 110L178 66" />
          <text className="dg-label" x="94" y="132">
            移光
          </text>
          <text className="dg-label" x="246" y="44">
            返听
          </text>
        </svg>
      );
    default:
      return <svg className="rehearsal-diagram" viewBox="0 0 320 180" role="presentation" />;
  }
}
