/** 失败卡的 1 秒俯视回放：最后 5 秒光路 + 四区轮廓。 */

import type { ReactElement } from 'react';
import type { FailureReplay as FailureReplayData } from '../../types/game';

export interface FailureReplayProps {
  readonly replay: FailureReplayData;
}

const WIDTH = 220;
const HEIGHT = 132;

/** 把世界坐标裁到座位区域，映射到 SVG 视口。 */
function project(points: readonly { readonly x: number; readonly z: number }[]): readonly { x: number; y: number }[] {
  if (points.length === 0) {
    return [];
  }
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  const spanX = maxX - minX < 0.001 ? 1 : maxX - minX;
  const spanZ = maxZ - minZ < 0.001 ? 1 : maxZ - minZ;
  return points.map((point) => ({
    x: 18 + ((point.x - minX) / spanX) * (WIDTH - 36),
    y: 122 - ((point.z - minZ) / spanZ) * 96,
  }));
}

/** 俯视回放图（不依赖 Three，可直接在 DOM 中渲染）。 */
export function FailureReplay({ replay }: FailureReplayProps): ReactElement {
  const placed = project(replay.lightPath);
  const path = placed.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const last = placed[placed.length - 1];
  return (
    <figure className="replay">
      <svg
        className="replay__svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="最后五秒的俯视光路与四区位置"
      >
        <rect className="replay__stage" x="6" y="4" width={WIDTH - 12} height="12" rx="2" />
        <rect className="replay__zone replay__zone--front-left" x="6" y="22" width={(WIDTH - 12) / 2 - 3} height="48" />
        <rect className="replay__zone replay__zone--front-right" x={WIDTH / 2 + 3} y="22" width={(WIDTH - 12) / 2 - 3} height="48" />
        <rect className="replay__zone replay__zone--back-left" x="6" y="74" width={(WIDTH - 12) / 2 - 3} height="48" />
        <rect className="replay__zone replay__zone--back-right" x={WIDTH / 2 + 3} y="74" width={(WIDTH - 12) / 2 - 3} height="48" />
        <line className="replay__aisle" x1={WIDTH / 2} y1="20" x2={WIDTH / 2} y2={HEIGHT - 6} />
        {path.length > 0 ? <path className="replay__path" d={path} /> : null}
        {placed[0] !== undefined ? (
          <circle className="replay__start" cx={placed[0].x} cy={placed[0].y} r="2.4" />
        ) : null}
        {last !== undefined ? <circle className="replay__end" cx={last.x} cy={last.y} r="3.4" /> : null}
      </svg>
      <figcaption className="replay__caption">
        最后 5 秒光路 · 点燃 {replay.ignites} 次 · 移动 {replay.movedMeters.toFixed(1)} 米
      </figcaption>
    </figure>
  );
}
