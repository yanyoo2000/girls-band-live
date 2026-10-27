/**
 * 座位网格（24 排 × 32 座 = 768）与 4 个座区（同时是 4 个声部）。
 *
 * 依据：docs/gdd.md §4（768 席 = 4 区 × 192）、§6.2（四区 = 根/三/五/七；颜色与屏幕位置）、
 *       §9.1（观众席 24×32，四条走道把四区分开，出口在最后方两侧）、
 *       docs/tech-spec.md §7.4（区范围、实例索引 = row * 32 + col）。
 *
 * 坐标约定（世界坐标，米，y 向上，碰撞只在 XZ）：
 * - 舞台中心为原点，台唇在 z = +4（舞台 12×8）；观众席从 z ≈ 5.2 起向 +z 排开；
 * - 排 0 = 最靠近舞台的一排；座 0 = 从相机看的最左一列；
 * - 中央走道在列 15 / 16 之间（`aisleCol = 16`），主走道在排 11 / 12 之间（`aisleRow = 12`）。
 */

import type { SeatGridDef, ZoneDef } from '../types/data';
import type { ZoneId } from '../types/game';

/** 四区的确定性顺序（HUD 四角、实例 zone 编码、音频声部池都按这个顺序）。 */
export const ZONE_ORDER: readonly ZoneId[] = [
  'front-left',
  'front-right',
  'back-left',
  'back-right',
];

/**
 * 座位网格。768 = 24 × 32；每区 12 排 × 16 座 = 192。
 *
 * `origin` 是排 0 / 座 0（屏幕最左列）的中心点；`spacing` 是相邻座位中心距（0.62m × 0.9m）。
 * 走道间隙 0.7m 统一由本文件的 `seatPositionAt` 叠加：列 ≥ `aisleCol`、排 ≥ `aisleRow`
 * 的座位在对应轴上多出 `aisleGap`。**世界坐标只有这一份真源**：
 * 逻辑层（game）与渲染层（three）都必须调用 `seatPositionAt / seatPositionOf / seatAtPoint`。
 *
 * 镜像约定：相机在舞台后方朝 +z 看（screenRight = −x），因此列号增大对应世界 x 减小；
 * 这样 `front-left`（列 0–15）落在屏幕左侧，与 GDD §6.2 一致。
 */
export const SEATS: SeatGridDef = {
  rows: 24,
  cols: 32,
  capacity: 768,
  aisleCol: 16,
  aisleRow: 12,
  aisleGap: 0.7,
  origin: { x: 9.96, z: 5.2 },
  spacing: { x: 0.62, z: 0.9 },
  rowRise: 0.12,
};

/** 每排的实例跨度（渲染索引 = row * SEAT_ROW_STRIDE + col）。 */
export const SEAT_ROW_STRIDE = SEATS.cols;

/** 每区席位数（192；=`SEATS.capacity / ZONE_ORDER.length`）。 */
export const SEATS_PER_ZONE = SEATS.capacity / ZONE_ORDER.length;

/** 前左：根音区（HUD 左下）。 */
const FRONT_LEFT: ZoneDef = {
  id: 'front-left',
  voice: 'root',
  rowRange: [0, 11],
  colRange: [0, 15],
  colorToken: 'zone-root',
  corner: 'bottom-left',
};

/** 前右：三度区（HUD 右下）。 */
const FRONT_RIGHT: ZoneDef = {
  id: 'front-right',
  voice: 'third',
  rowRange: [0, 11],
  colRange: [16, 31],
  colorToken: 'zone-third',
  corner: 'bottom-right',
};

/** 后左：五度区（HUD 左上）。 */
const BACK_LEFT: ZoneDef = {
  id: 'back-left',
  voice: 'fifth',
  rowRange: [12, 23],
  colRange: [0, 15],
  colorToken: 'zone-fifth',
  corner: 'top-left',
};

/** 后右：七度区（HUD 右上；三和弦时是唯一的和弦外音区）。 */
const BACK_RIGHT: ZoneDef = {
  id: 'back-right',
  voice: 'seventh',
  rowRange: [12, 23],
  colRange: [16, 31],
  colorToken: 'zone-seventh',
  corner: 'top-right',
};

/**
 * 4 个座区 / 4 个声部。
 *
 * `rowRange` / `colRange` 均为**闭区间**；`corner` 是该区在 HUD 四角的位置（GDD §6.2 屏幕位置）。
 * 声部固定：前左=根音、前右=三度、后左=五度、后右=七度。
 */
export const ZONES: readonly ZoneDef[] = [FRONT_LEFT, FRONT_RIGHT, BACK_LEFT, BACK_RIGHT];

/** id → 区定义（穷尽 Record，缺区 tsc 直接报错）。 */
export const ZONE_BY_ID: Readonly<Record<ZoneId, ZoneDef>> = {
  'front-left': FRONT_LEFT,
  'front-right': FRONT_RIGHT,
  'back-left': BACK_LEFT,
  'back-right': BACK_RIGHT,
};

/**
 * 四区的地面纹样 / HUD 同形点（art-direction §3：●▲■◆）。
 * 形状不是装饰：高对比模式下四色不可辨时，形状是唯一区分手段。
 */
export const ZONE_MARKS = {
  'front-left': 'circle',
  'front-right': 'triangle',
  'back-left': 'square',
  'back-right': 'diamond',
} as const satisfies Readonly<Record<ZoneId, 'circle' | 'triangle' | 'square' | 'diamond'>>;

/** 闭区间席位数（排数 × 座数）。 */
function zoneSeatCount(zone: ZoneDef): number {
  const rows = zone.rowRange[1] - zone.rowRange[0] + 1;
  const cols = zone.colRange[1] - zone.colRange[0] + 1;
  return rows * cols;
}

/** 每区席位数（由闭区间算出，供 validateData 与 HUD 断言；不写死 192）。 */
export const ZONE_SEAT_COUNTS: Readonly<Record<ZoneId, number>> = {
  'front-left': zoneSeatCount(FRONT_LEFT),
  'front-right': zoneSeatCount(FRONT_RIGHT),
  'back-left': zoneSeatCount(BACK_LEFT),
  'back-right': zoneSeatCount(BACK_RIGHT),
};

/**
 * 座位索引：`row * cols + col`（与 `AudienceFrame.state/heat/phone/zone` 的数组下标同序）。
 * 越界返回 -1（调用方必须自己处理，不做静默截断）。
 */
export function seatIndex(row: number, col: number): number {
  if (row < 0 || row >= SEATS.rows || col < 0 || col >= SEATS.cols) return -1;
  return row * SEATS.cols + col;
}

/** 座位 → 区；越界返回 null。 */
export function zoneOfSeat(row: number, col: number): ZoneId | null {
  if (row < 0 || row >= SEATS.rows || col < 0 || col >= SEATS.cols) return null;
  const isBack = row >= BACK_LEFT.rowRange[0];
  const isRight = col >= FRONT_RIGHT.colRange[0];
  if (!isBack && !isRight) return 'front-left';
  if (!isBack && isRight) return 'front-right';
  if (isBack && !isRight) return 'back-left';
  return 'back-right';
}

/** 座位中心的世界坐标（唯一真源；含走道间隙与 x 镜像）。 */
export interface SeatPosition {
  readonly x: number;
  readonly z: number;
  readonly y: number;
}

/**
 * 排/列 → 世界坐标。
 *
 * - x 随列号递减（相机朝 +z 看，屏幕右 = −x），列 ≥ aisleCol 时再减去走道间隙；
 * - z 随排号递增，排 ≥ aisleRow 时再加走道间隙；
 * - y = 排高（后排更高，供剪影可读）。
 */
export function seatPositionAt(grid: SeatGridDef, row: number, col: number): SeatPosition {
  const gapAtCol = col >= grid.aisleCol ? grid.aisleGap : 0;
  const gapAtRow = row >= grid.aisleRow ? grid.aisleGap : 0;
  return {
    x: grid.origin.x - col * grid.spacing.x - gapAtCol,
    z: grid.origin.z + row * grid.spacing.z + gapAtRow,
    y: row * grid.rowRise,
  };
}

/** 座位索引 → 世界坐标（实例索引 = row * cols + col）。 */
export function seatPositionOf(grid: SeatGridDef, seat: number): SeatPosition {
  const cols = grid.cols > 0 ? grid.cols : 1;
  const row = Math.floor(seat / cols);
  const col = seat - row * cols;
  return seatPositionAt(grid, row, col);
}

/** 世界 x → 最近的列号（含走道；x 随列号单调递减，二分查找）。 */
export function nearestSeatColumn(grid: SeatGridDef, worldX: number): number {
  const cols = Math.max(1, grid.cols);
  let lo = 0;
  let hi = cols - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const midX = seatPositionAt(grid, 0, mid).x;
    if (midX > worldX) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  const before = Math.max(0, lo - 1);
  const beforeX = seatPositionAt(grid, 0, before).x;
  const hereX = seatPositionAt(grid, 0, lo).x;
  return Math.abs(beforeX - worldX) <= Math.abs(hereX - worldX) ? before : lo;
}

/** 世界 z → 最近的排号（含走道；z 随排号单调递增，二分查找）。 */
export function nearestSeatRow(grid: SeatGridDef, worldZ: number): number {
  const rows = Math.max(1, grid.rows);
  let lo = 0;
  let hi = rows - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const midZ = seatPositionAt(grid, mid, 0).z;
    if (midZ < worldZ) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  const before = Math.max(0, lo - 1);
  const beforeZ = seatPositionAt(grid, before, 0).z;
  const hereZ = seatPositionAt(grid, lo, 0).z;
  return Math.abs(beforeZ - worldZ) <= Math.abs(hereZ - worldZ) ? before : lo;
}

/** 网格 x 中心（镜像后应为 0；供舞台锚点与测试断言）。 */
export function seatGridCenterX(grid: SeatGridDef): number {
  const cols = Math.max(1, grid.cols);
  return (seatPositionAt(grid, 0, 0).x + seatPositionAt(grid, 0, cols - 1).x) / 2;
}

/**
 * 世界坐标 → 最近的座位（行/列）。
 *
 * 落在观众席外接矩形外（各边放宽半个座距）返回 null；走道内部映射到最近的一侧。
 */
export function seatAtPoint(
  grid: SeatGridDef,
  point: { readonly x: number; readonly z: number },
): { readonly row: number; readonly col: number } | null {
  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  const first = seatPositionAt(grid, 0, 0);
  const lastCol = seatPositionAt(grid, 0, cols - 1);
  const lastRow = seatPositionAt(grid, rows - 1, 0);
  const halfX = grid.spacing.x / 2;
  const halfZ = grid.spacing.z / 2;
  const minX = lastCol.x - halfX;
  const maxX = first.x + halfX;
  const minZ = first.z - halfZ;
  const maxZ = lastRow.z + halfZ;
  if (point.x < minX || point.x > maxX || point.z < minZ || point.z > maxZ) {
    return null;
  }
  return { row: nearestSeatRow(grid, point.z), col: nearestSeatColumn(grid, point.x) };
}

/* ==========================================================================
 * 展示文案（out-of-schema content，供 UI 与验收使用）
 * ========================================================================== */

/**
 * 座区的展示名与一句话说明。
 *
 * `ZoneDef` 只有玩法字段（id / voice / 行列范围 / 色 token / 角落），
 * 而验收要求"每项内容都有 name、description、id"——这两项单独成表，不污染 schema。
 */
export interface ZoneContent {
  readonly id: ZoneId;
  readonly name: string;
  readonly description: string;
}

/** 四个座区的展示名与一句话说明（HUD 图例、排练室、结算分区都用这一份）。 */
export const ZONE_CONTENT: Readonly<Record<ZoneId, ZoneContent>> = {
  'front-left': {
    id: 'front-left',
    name: '前左 · 根音',
    description: '离台最近的一区：最容易被照到，也最先被底噪爬上；根音一断，整首歌会塌。',
  },
  'front-right': {
    id: 'front-right',
    name: '前右 · 三度',
    description: '决定和弦"是大调还是小调"的一区：你把它照亮，歌就往前推。',
  },
  'back-left': {
    id: 'back-left',
    name: '后左 · 五度',
    description: '最远的一区：转化慢、掉级也慢，人浪常常从这里起。',
  },
  'back-right': {
    id: 'back-right',
    name: '后右 · 七度',
    description: '三和弦时唯一不在和弦内的区：照它有风险（招灾 ×2），七和弦小节才变成内音。',
  },
};
