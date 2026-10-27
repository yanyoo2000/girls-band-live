/**
 * 文案库：四名成员 + 旁白；全部由本局真实数据驱动（不联网、不生成自由文本）。
 *
 * 依据：docs/gdd.md §5.3（后台曲目单 / 结算后台）、§13.4（失败卡三条原因）、§13.5（评级）、
 *       §12.2（"局内 0 数字"只约束战斗 HUD：升级卡、暂停、结算允许数值文案）；
 *       docs/tech-spec.md §7.1（CopyBank / CopyLineDef / CopyTrigger）。
 *
 * 写作约束：
 * - 全角标点；不出现现实乐队/歌曲/动漫角色/商标；
 * - 局内触发（run-start / first-convert / first-crowd-wave / return-lock / line-break / silence /
 *   finale-drop）的句子**不含数字**——它们可能出现在后台曲目单里，而"局内 0 数字"是硬口径；
 * - 结算后台（results-backstage）允许带数字，因为它只在结算页出现；
 * - 每句不超过 40 字，保证后台纸片一行放得下。
 */

import type { CopyBank, CopyLineDef, CopyTrigger } from '../types/data';
import type { FailureReasonCode, Grade } from '../types/game';

/** 旁白的说话人标记（`CopyLineDef.speaker` 允许 `MemberId | 'narrator'`）。 */
const NARRATOR = 'narrator' as const;

/* ==========================================================================
 * 1. 文案行（按触发点）
 * ========================================================================== */

/** 序曲：她站上台，还没开灯。 */
const LINE_RUN_START: CopyLineDef = {
  id: 'line-run-start-jiangqi',
  trigger: 'run-start',
  speaker: 'jiangqi',
  render: () => '今晚只有一盏工作灯。先别开灯——让他们自己抬头。',
};

/** 第一个人站起来（第一次转化）。 */
const LINE_FIRST_CONVERT: CopyLineDef = {
  id: 'line-first-convert-jiangqi',
  trigger: 'first-convert',
  speaker: 'jiangqi',
  render: () => '第一个人站起来了。你看得见他手里那根荧光棒的形状。',
};

/** 许燎在你点亮第一排时，把副歌压低了一档（第一次转化的第二个视角）。 */
const LINE_FIRST_CONVERT_XULIAO: CopyLineDef = {
  id: 'line-first-convert-xuliao',
  trigger: 'first-convert',
  speaker: 'xuliao',
  render: () => '她把副歌压低了一档，把地方留给你点灯。',
};

/** 第一次人浪：邵砚先停半拍。 */
const LINE_FIRST_WAVE_SHAOYAN: CopyLineDef = {
  id: 'line-first-wave-shaoyan',
  trigger: 'first-crowd-wave',
  speaker: 'shaoyan',
  render: () => '她先停半拍，然后浪自己走了。她没看你，但她在等你。',
};

/** 第一次人浪：旁白补一句机制（人浪不是技能，是奖励）。 */
const LINE_FIRST_WAVE_NARRATOR: CopyLineDef = {
  id: 'line-first-wave-narrator',
  trigger: 'first-crowd-wave',
  speaker: NARRATOR,
  render: () => '人浪不是你按出来的——你只负责养人，浪自己会发生。',
};

/** 返听锁定：唯一一次"敌人发出声音"。 */
const LINE_RETURN_LOCK: CopyLineDef = {
  id: 'line-return-lock-wensheng',
  trigger: 'return-lock',
  speaker: 'wensheng',
  render: () => '音箱堆上长出一只耳朵。它咬住你的光了——别停，走。',
};

/** 线断：闻笙用身体挡接口。 */
const LINE_LINE_BREAK: CopyLineDef = {
  id: 'line-line-break-wensheng',
  trigger: 'line-break',
  speaker: 'wensheng',
  render: () => '线被拽掉了。她站到接口前替你挡着，低频一下子空了。',
};

/** 静默：总线归零，只剩鼓。 */
const LINE_SILENCE: CopyLineDef = {
  id: 'line-silence-shaoyan',
  trigger: 'silence',
  speaker: 'shaoyan',
  render: () => '总线上什么都没有了。跟着她踩八分音符的那只脚走。',
};

/** 放下光：终曲。 */
const LINE_FINALE_DROP: CopyLineDef = {
  id: 'line-finale-drop-jiangqi',
  trigger: 'finale-drop',
  speaker: 'jiangqi',
  render: () => '你把光放下去了。剩下的交给台下。',
};

/** 空场完成（不是失败）。 */
const LINE_EMPTY_HOUSE: CopyLineDef = {
  id: 'line-empty-house-narrator',
  trigger: 'empty-house',
  speaker: NARRATOR,
  render: () => '今天，只有你听见了。',
};

/** 中断失败：一句话归因，不指责玩家。 */
const LINE_FAILURE: CopyLineDef = {
  id: 'line-failure-narrator',
  trigger: 'failure',
  speaker: NARRATOR,
  render: () => '不是他们走了，是你看着别的地方太久了。',
};

/** 结算后台 · 江栖：她记得这一晚的人数与空位。 */
const LINE_BACKSTAGE_JIANGQI: CopyLineDef = {
  id: 'line-backstage-jiangqi',
  trigger: 'results-backstage',
  speaker: 'jiangqi',
  render: (ctx) =>
    `今晚有 ${ctx.converted} 个人第一次站起来；第二排还空着 ${ctx.secondRowEmpty} 个位置。`,
};

/** 结算后台 · 许燎：她只关心自己有没有弹错。 */
const LINE_BACKSTAGE_XULIAO: CopyLineDef = {
  id: 'line-backstage-xuliao',
  trigger: 'results-backstage',
  speaker: 'xuliao',
  render: (ctx) => `吉他断了 ${ctx.lineBreaks.guitar} 次。她一句都没漏。`,
};

/** 结算后台 · 闻笙：她记得谁没再来。 */
const LINE_BACKSTAGE_WENSHENG: CopyLineDef = {
  id: 'line-backstage-wensheng',
  trigger: 'results-backstage',
  speaker: 'wensheng',
  render: (ctx) => `贝斯断了 ${ctx.lineBreaks.bass} 次，返听咬了你 ${ctx.returnLocks} 次。`,
};

/** 结算后台 · 邵砚：她数的是拍子，不是人。 */
const LINE_BACKSTAGE_SHAOYAN: CopyLineDef = {
  id: 'line-backstage-shaoyan',
  trigger: 'results-backstage',
  speaker: 'shaoyan',
  render: (ctx) => `鼓断了 ${ctx.lineBreaks.drums} 次；从头到尾她一次都没停。`,
};

/** 结算后台 · 旁白：给空场与失败一句不同的话（同一触发点，按 ending 分支）。 */
const LINE_BACKSTAGE_NARRATOR: CopyLineDef = {
  id: 'line-backstage-narrator',
  trigger: 'results-backstage',
  speaker: NARRATOR,
  render: (ctx) =>
    ctx.ending === 'empty-house'
      ? '台下的椅子都翻回去了，你还在台上。'
      : `裂缝 ${ctx.cracks} 道，烧掉 ${ctx.burned} 只，被覆盖 ${ctx.covered} 人次。`,
};

/** 全部文案行（同一触发点允许多行，由 UI 决定展示哪一条）。 */
export const COPY_LINES: readonly CopyLineDef[] = [
  LINE_RUN_START,
  LINE_FIRST_CONVERT,
  LINE_FIRST_CONVERT_XULIAO,
  LINE_FIRST_WAVE_SHAOYAN,
  LINE_FIRST_WAVE_NARRATOR,
  LINE_RETURN_LOCK,
  LINE_LINE_BREAK,
  LINE_SILENCE,
  LINE_FINALE_DROP,
  LINE_EMPTY_HOUSE,
  LINE_FAILURE,
  LINE_BACKSTAGE_JIANGQI,
  LINE_BACKSTAGE_XULIAO,
  LINE_BACKSTAGE_WENSHENG,
  LINE_BACKSTAGE_SHAOYAN,
  LINE_BACKSTAGE_NARRATOR,
];

/** 触发点 → 该触发点下的文案行（UI 取用方便；10 个触发点全覆盖）。 */
export const COPY_LINES_BY_TRIGGER: Readonly<Record<CopyTrigger, readonly CopyLineDef[]>> = {
  'run-start': [LINE_RUN_START],
  'first-convert': [LINE_FIRST_CONVERT, LINE_FIRST_CONVERT_XULIAO],
  'first-crowd-wave': [LINE_FIRST_WAVE_SHAOYAN, LINE_FIRST_WAVE_NARRATOR],
  'return-lock': [LINE_RETURN_LOCK],
  'line-break': [LINE_LINE_BREAK],
  silence: [LINE_SILENCE],
  'finale-drop': [LINE_FINALE_DROP],
  'empty-house': [LINE_EMPTY_HOUSE],
  failure: [LINE_FAILURE],
  'results-backstage': [
    LINE_BACKSTAGE_JIANGQI,
    LINE_BACKSTAGE_XULIAO,
    LINE_BACKSTAGE_WENSHENG,
    LINE_BACKSTAGE_SHAOYAN,
    LINE_BACKSTAGE_NARRATOR,
  ],
};

/* ==========================================================================
 * 2. 失败卡三条原因（模板，value 的含义按 code 约定）
 * ========================================================================== */

/**
 * 失败原因模板（GDD §13.4：3 秒可读、只给三条）。
 *
 * `value` 的单位按 code 约定：
 * - `return-listener-lock`：秒（被咬住的时长）
 * - `zone-cooled`：人（因该区冷掉而离场的人数）
 * - `audience-left`：人（走出出口的人数）
 * - `no-ignite`：秒（连续没有点燃的时长）
 * - `overheated-zone`：秒（同一区连续被照亮的时长）
 */
export const FAILURE_REASONS: Readonly<Record<FailureReasonCode, (value: number) => string>> = {
  'return-listener-lock': (value) => `返听锁定了你的光 ${value} 秒，锥长和转化都被压住。`,
  'zone-cooled': (value) => `那一区冷掉了，${value} 个人没再抬头。`,
  'audience-left': (value) => `${value} 个人走到了出口，没有回头。`,
  'no-ignite': (value) => `最后 ${value} 秒你一次都没点燃。`,
  'overheated-zone': (value) => `同一区被照了 ${value} 秒，过了热点。`,
};

/** 失败原因的确定性顺序（失败卡三行按此优先级取前三条可用原因）。 */
export const FAILURE_REASON_ORDER: readonly FailureReasonCode[] = [
  'return-listener-lock',
  'zone-cooled',
  'audience-left',
  'no-ignite',
  'overheated-zone',
];

/* ==========================================================================
 * 3. 评级文案
 * ========================================================================== */

/** S/A/B/C 的四句评语（结算页"评级"区块用；阈值见 balance.ts 的 `GRADE_RULES`）。 */
export const GRADE_LABELS: Readonly<Record<Grade, string>> = {
  S: '满场：他们不是来看你的，是来跟你唱的。',
  A: '很好的一晚：前排站满了，后排还空着。',
  B: '撑完了：歌是完整的，人是散的。',
  C: '完成了。今晚台下没坐满，但你唱到了最后一个音。',
};

/* ==========================================================================
 * 4. 文案库（DataRegistry.copy）
 * ========================================================================== */

/**
 * 文案库。
 *
 * `failureReasons` 用 `FailureReasonCode` 作为键（5 个全覆盖），
 * 与 `FailureCard.reasons` 的三条原因一一对应；`grades` 为四档评语。
 */
export const COPY: CopyBank = {
  lines: COPY_LINES,
  failureReasons: FAILURE_REASONS,
  grades: GRADE_LABELS,
};
