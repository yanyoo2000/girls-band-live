/**
 * 和弦表（10 个）+ 四声部"内音"判定。
 *
 * 依据：docs/gdd.md §6.2（四区声部：根 / 三 / 五 / 七；三和弦时第 4 区不在和弦内）、
 *       §17.1（Am–F–C–G 骨架；副歌 Am–F–Dm–E；每第 4 小节用七和弦，与四区七度音联动）、
 *       docs/tech-spec.md §7.4（ChordDef.zoneInChord）。
 *
 * 声部口径（关键）：
 * - 四个座区固定唱当前和弦的 根 / 三 / 五 / 七，所以 **1–3 区在三和弦与七和弦里都是内音**；
 * - 只有第 4 区（七度声部）在三和弦下唱的是"和弦外音"（张力音），七和弦小节才成为内音。
 *   这就是 `zoneInChord` 唯一的差异来源，也是"第 4 区不是永久诱饵区"的机制保障。
 *
 * 与 GDD 的一处显式权衡（已在 docs/reports 里登记，供审阅）：
 * GDD §17.1 写"副歌 Am–F–Dm–E"，同时又写"每第 4 小节用七和弦（Am7/Fmaj7/Cmaj7/G7）"。
 * 锁定和弦表内没有 E7，两条规则在第 4 小节上冲突。本数据选择**保住"每 4 小节一个七和弦"**
 * （它同时被 §6.2 的玩法规则和 tests/music.test.ts 依赖），把 E 放到桥段第 3 小节：
 * 副歌 8 小节循环为 Am–F–Dm–Am7 | Am–F–Cmaj7–G7（前四小节仍是副歌的 Am–F–Dm）。
 */

import type { ChordDef, ChordKey } from '../types/data';
import type { ZoneId } from '../types/game';

/** 十个和弦的确定性顺序（段落和弦序列从这里取，UI 与测试用同一顺序）。 */
export const CHORD_KEY_ORDER: readonly ChordKey[] = [
  'am',
  'f',
  'c',
  'g',
  'dm',
  'e',
  'am7',
  'fmaj7',
  'cmaj7',
  'g7',
];

/** 三和弦：第 4 区（七度声部）不在和弦内。 */
const TRIAD_ZONES: Readonly<Record<ZoneId, boolean>> = {
  'front-left': true,
  'front-right': true,
  'back-left': true,
  'back-right': false,
};

/** 七和弦：四个声部全是内音。 */
const SEVENTH_ZONES: Readonly<Record<ZoneId, boolean>> = {
  'front-left': true,
  'front-right': true,
  'back-left': true,
  'back-right': true,
};

/**
 * 和弦表（穷尽 Record：ChordKey 有 10 个值，少一个 `tsc` 直接报错）。
 *
 * `quality` 只描述和弦性质（三和弦 / 七和弦），逻辑层用它判断
 * `zoneInChord` 与"每第 4 小节七和弦"的口径，不参与音频合成（合成在 src/audio/music.ts）。
 */
export const CHORDS: Readonly<Record<ChordKey, ChordDef>> = {
  am: {
    id: 'am',
    root: 'A',
    quality: 'minor',
    zoneInChord: TRIAD_ZONES,
  },
  f: {
    id: 'f',
    root: 'F',
    quality: 'major',
    zoneInChord: TRIAD_ZONES,
  },
  c: {
    id: 'c',
    root: 'C',
    quality: 'major',
    zoneInChord: TRIAD_ZONES,
  },
  g: {
    id: 'g',
    root: 'G',
    quality: 'major',
    zoneInChord: TRIAD_ZONES,
  },
  dm: {
    id: 'dm',
    root: 'D',
    quality: 'minor',
    zoneInChord: TRIAD_ZONES,
  },
  /** E 大三和弦：A 小调的属和弦（副歌/桥段的"门"，落在这里最想回到主音）。 */
  e: {
    id: 'e',
    root: 'E',
    quality: 'major',
    zoneInChord: TRIAD_ZONES,
  },
  am7: {
    id: 'am7',
    root: 'A',
    quality: 'minor7',
    zoneInChord: SEVENTH_ZONES,
  },
  fmaj7: {
    id: 'fmaj7',
    root: 'F',
    quality: 'major7',
    zoneInChord: SEVENTH_ZONES,
  },
  cmaj7: {
    id: 'cmaj7',
    root: 'C',
    quality: 'major7',
    zoneInChord: SEVENTH_ZONES,
  },
  g7: {
    id: 'g7',
    root: 'G',
    quality: 'dominant7',
    zoneInChord: SEVENTH_ZONES,
  },
};

/** 是否是七和弦（第 4 区因此成为内音）。音频层与点燃判定共用。 */
export function isSeventhChord(key: ChordKey): boolean {
  const chord = CHORDS[key];
  return chord.quality === 'dominant7' || chord.quality === 'major7' || chord.quality === 'minor7';
}

/** 取某和弦下某区是否为内音（点燃 ±25% 与"该区招灾 ×2"都读这里）。 */
export function zoneInChord(key: ChordKey, zone: ZoneId): boolean {
  return CHORDS[key].zoneInChord[zone];
}

/* ==========================================================================
 * 展示文案（out-of-schema content）
 * ========================================================================== */

/** 和弦的展示名与一句话说明（`ChordDef` 只有根音与和弦性质）。 */
export interface ChordContent {
  readonly id: ChordKey;
  readonly name: string;
  readonly description: string;
}

/** 10 个和弦的展示名与一句话说明（排练室、后台曲目单、调试面板用）。 */
export const CHORD_CONTENT: Readonly<Record<ChordKey, ChordContent>> = {
  am: { id: 'am', name: 'Am · 主和弦', description: '整首歌的家：四区都在内音里，最安全的一小节。' },
  f: { id: 'f', name: 'F · 六级', description: '往外拉的一小节：把人从台上推到台下。' },
  c: { id: 'c', name: 'C · 三级', description: '最亮的一小节；适合把光铺开收人。' },
  g: { id: 'g', name: 'G · 七级', description: '往上顶的一小节；下一小节通常要回家（Am）。' },
  dm: { id: 'dm', name: 'Dm · 四级', description: '副歌里最紧的一小节：光要收，不要铺。' },
  e: { id: 'e', name: 'E · 属和弦', description: '全曲唯一"想回到主音"的一小节，桥段用它当门。' },
  am7: { id: 'am7', name: 'Am7 · 主七和弦', description: '第 4 区变成内音的一小节：七度声部终于站进和弦里。' },
  fmaj7: { id: 'fmaj7', name: 'Fmaj7 · 六 maj7', description: '桥段的软着陆：裂缝最多的时候听起来最容易撑过去。' },
  cmaj7: { id: 'cmaj7', name: 'Cmaj7 · 三 maj7', description: '副歌后半的提亮：适合在人浪之后收一波人。' },
  g7: { id: 'g7', name: 'G7 · 属七', description: '最想解决的一小节，也是每段循环的收尾。' },
};
