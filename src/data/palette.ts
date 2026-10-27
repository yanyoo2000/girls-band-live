/**
 * 调色板：全项目唯一色源（CSS 变量 / Three 材质 / DOM 遮罩 / CanvasTexture 共用）。
 *
 * 依据：docs/art-direction.md §3；docs/gdd.md §12.1（全场三色：灰 / 彩 / 黑）。
 *
 * 硬规则（验收口径）：
 * - 世界着色只允许 `ink` / `stage-*` / `audience-*` / `zone-*` / `member-*` / `whiteout`；
 * - `danger` 只用于 UI 失败态与危险条极值，**不上 3D 世界**——世界里出现第四种高饱和色＝bug；
 * - 人色（member-*）只出现在舞台上（y > 0.8m、面积 ≤2%）；
 * - 区色（zone-*）只出现在座位与地面纹样。
 */

import type { PaletteDef, PaletteToken } from '../types/data';

/** 全部色彩 token（顺序即 UI 面板与调试色板的展示顺序）。 */
export const PALETTE_TOKENS: readonly PaletteToken[] = [
  'ink',
  'stage-warm',
  'stage-full',
  'stage-black',
  'audience-grey',
  'audience-colored',
  'audience-black',
  'zone-root',
  'zone-third',
  'zone-fifth',
  'zone-seventh',
  'member-jiangqi',
  'member-xuliao',
  'member-wensheng',
  'member-shaoyan',
  'whiteout',
  'danger',
];

/**
 * token → 十六进制色值。
 *
 * 每个值都抄自 art-direction.md §3 / §4 的实测色板，不新造颜色：
 * 对比度（正文 15.1:1、次文本 6.85:1、区 2 玫红 5.17:1）由 art-direction 实测，本表不重复计算。
 */
export const PALETTE_HEX: Readonly<Record<PaletteToken, string>> = {
  /** 场馆黑 / 面板底色（世界底色、DOM 面板）。 */
  ink: '#0B0D12',
  /** 舞台暖白：顶灯、台唇（4200K 侧）。 */
  'stage-warm': '#FFF1D6',
  /** 满灯冷白：追光、光锥内缘（6200K 侧）。 */
  'stage-full': '#D8ECFF',
  /** 静默态：只剩工作灯与安全灯时压到的黑。 */
  'stage-black': '#07080A',
  /** 观众灰：尚未表态的坐姿（≈45% 亮度）。 */
  'audience-grey': '#6E7480',
  /**
   * 观众彩：自己人。
   * 注意：实例渲染色由所在区（zone-*）决定，本 token 只作 UI 图例与降级回退色。
   */
  'audience-colored': '#EDEFF2',
  /** 观众黑：被噪音覆盖（RGB ≤ 8，永远比背景黑）。 */
  'audience-black': '#07080A',
  /** 区 1（前左，根音）冷白。 */
  'zone-root': '#BFD6E8',
  /** 区 2（前右，三度）玫红；限 16px 以上使用。 */
  'zone-third': '#FF3D7F',
  /** 区 3（后左，五度）青。 */
  'zone-fifth': '#35E0D0',
  /** 区 4（后右，七度）琥珀。 */
  'zone-seventh': '#FFB03A',
  /** 江栖：白（发侧外扩轮廓）。 */
  'member-jiangqi': '#EDEFF2',
  /** 许燎：红（窄肩前倾轮廓）。 */
  'member-xuliao': '#D8384F',
  /** 闻笙：深蓝（宽肩站直轮廓）。 */
  'member-wensheng': '#22314F',
  /** 邵砚：琥珀（横向最宽、坐姿轮廓）。 */
  'member-shaoyan': '#C98A3A',
  /** 纯白：血量表达的极值（白光遮罩、白闪）。 */
  whiteout: '#FFFFFF',
  /** UI 危险态：失败卡强调、危险条极值。**不进世界**。 */
  danger: '#FF5A3C',
};

/**
 * 三色状态到 token 的映射（全世界只有这三种观众状态）。
 * 灰 → 灰；彩 → 彩；黑 → 黑。第四种状态不存在。
 */
export const PALETTE: PaletteDef = {
  tokens: PALETTE_HEX,
  audienceStates: {
    grey: 'audience-grey',
    colored: 'audience-colored',
    black: 'audience-black',
  },
};

/** 区色 → token 的便捷查询（与 seats.ts 的 ZoneDef.colorToken 保持同源）。 */
export const ZONE_COLOR_TOKENS = {
  'front-left': 'zone-root',
  'front-right': 'zone-third',
  'back-left': 'zone-fifth',
  'back-right': 'zone-seventh',
} as const satisfies Readonly<Record<string, PaletteToken>>;

/** 人色 → token 的便捷查询（与 characters.ts 的 SilhouetteDef.primary 保持同源）。 */
export const MEMBER_COLOR_TOKENS = {
  jiangqi: 'member-jiangqi',
  xuliao: 'member-xuliao',
  wensheng: 'member-wensheng',
  shaoyan: 'member-shaoyan',
} as const satisfies Readonly<Record<string, PaletteToken>>;
