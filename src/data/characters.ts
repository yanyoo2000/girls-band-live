/**
 * 4 名乐队成员 + 4 个角色瞬间 + 40px 剪影约束。
 *
 * 依据：docs/gdd.md §5（角色定义、剪影三重辨识、4 个角色瞬间）、§4（可操作角色 1、成员 4）；
 *       docs/art-direction.md §4（面数、人色、乐器形状、站位）；
 *       docs/tech-spec.md §7.1（MemberId 固定 4 值）。
 *
 * 约束：
 * - 只有主唱可操作（`playable: true` 恰好 1 人）；
 * - 三名队友不移动，站位在 3D 里固定、永不与主唱同深度重叠；
 * - 角色性不靠立绘/配音/过场：每个成员的"大招"= 1 个角色瞬间（见 `MOMENTS`），
 *   由 combat 按 `trigger` 触发，文本由 copy.ts 提供。
 *
 * 说明：本作没有独立"武器/大招"系统（GDD §6.1 锁定"没有点燃键以外的攻击输入"）。
 * 成员的攻击/被动落在 `how` 与 `balance.ts` 的 `MEMBER_RULES`（数值），
 * "大招"落在 4 个角色瞬间与 3 个进化（cards.ts 的 `EVOLUTIONS`）。
 */

import type { CharacterDef, MemberMomentDef, SilhouetteDef } from '../types/data';
import type { MemberId, MemberMomentId } from '../types/game';

/** 乐队名（GDD §0 锁定；全部原创，不影射现实乐队）。 */
export const BAND_NAME = '留声';

/** 玩家操作的成员（GDD §4：可操作角色 1）。 */
export const PLAYER_MEMBER_ID: MemberId = 'jiangqi';

/**
 * 舞台站位（世界坐标，米；舞台中心为原点，+z 朝向观众席）。
 * 与 art-direction §4 的"站位"列一致：主唱中前、吉他右前、贝斯左前、鼓后中（鼓台 +0.6m）。
 */
const STAGE_POSITIONS: Readonly<Record<MemberId, SilhouetteDef['stagePosition']>> = {
  jiangqi: { x: 0, z: 1.6 },
  xuliao: { x: 2.6, z: 1.2 },
  wensheng: { x: -2.6, z: 1.2 },
  shaoyan: { x: 0, z: -2.4 },
};

/**
 * 江栖（主唱，玩家，唯一可操作）。
 * 她负责的"乐器"是麦克风；她的系统是光，不是线。
 */
const JIANGQI: CharacterDef = {
  id: 'jiangqi',
  name: '江栖',
  who: '第九任主唱。上一个主唱在终曲前把麦克风留在台唇上就走了，她捡起来，一直没放下。',
  how: '她只有一束光：散光铺场、束光救火、回照自保；她也是台上唯一能移动的人。',
  fear: '安静——观众越少，她耳返里自己的呼吸越响，一个人时最响。',
  silhouette: {
    outline: '细长、头发向两侧外扩、麦线斜挎（40px 下最窄的一条竖影）',
    primary: 'member-jiangqi',
    secondary: 'zone-third',
    instrumentShape: '短杆麦克风：一竖一点（0.06m 杆 + 0.03m 头），斜挎一条 0.02m 线',
    stagePosition: STAGE_POSITIONS.jiangqi,
  },
  line: null,
  moment: 'breath',
  playable: true,
};

/** 许燎（主音吉他）：高频穿刺，怕弹错。 */
const XULIAO: CharacterDef = {
  id: 'xuliao',
  name: '许燎',
  who: '写歌的人。每一句副歌她都改过三遍，改到自己也记不清第一版是什么样。',
  how: '高频穿刺：照亮"和弦外音区"时，她的高频波对远处与空中的噪音额外穿透 +20%。',
  fear: '弹错——她宁可不弹，也不肯弹一个自己没想清楚的音。',
  silhouette: {
    outline: '窄肩、前倾 6°、琴身斜三角（40px 下像一片斜着的纸）',
    primary: 'member-xuliao',
    secondary: 'ink',
    instrumentShape: '斜三角琴身 + 细颈：斜挎 12°，琴头指左前下方',
    stagePosition: STAGE_POSITIONS.xuliao,
  },
  line: 'guitar',
  moment: 'echoed-phrase',
  playable: false,
};

/** 闻笙（贝斯）：低频护盾，怕被忘记。 */
const WENSHENG: CharacterDef = {
  id: 'wensheng',
  name: '闻笙',
  who: '话最少，负责"记忆"。她记得每一场来过的脸，也记得谁没再来。',
  how: '低频护盾：她那一侧的噪音移速 −30%；她的线一断，护盾就没了。',
  fear: '被忘记——所以她总站在最靠接口的位置上。',
  silhouette: {
    outline: '宽肩、站直、0.9m 长颈琴横向切过身体（40px 下最宽的一条横线）',
    primary: 'member-wensheng',
    secondary: 'zone-fifth',
    instrumentShape: '长颈琴：0.9m 横线 + 短琴身，琴颈几乎水平',
    stagePosition: STAGE_POSITIONS.wensheng,
  },
  line: 'bass',
  moment: 'body-shield',
  playable: false,
};

/** 邵砚（鼓）：全场拍点的来源，怕数错。 */
const SHAOYAN: CharacterDef = {
  id: 'shaoyan',
  name: '邵砚',
  who: '从不停止的人。她从 14 岁开始每天打满两小时，一天没断过。',
  how: '节拍：全场的拍点由她给出；她一停，拍点就变弱，点燃窗口跟着抖。',
  fear: '数错——她怕的不是打错，是数错。',
  silhouette: {
    outline: '横向最宽、坐姿、鼓台抬高 0.6m（40px 下像一个矮而宽的方）',
    primary: 'member-shaoyan',
    secondary: 'whiteout',
    instrumentShape: '两根鼓棒：两短斜线（35°），外加 1.4m 鼓组外框',
    stagePosition: STAGE_POSITIONS.shaoyan,
  },
  line: 'drums',
  moment: 'half-beat',
  playable: false,
};

/** 4 名成员（顺序 = 主菜单剪影展示顺序：唱 / 吉他 / 贝斯 / 鼓）。 */
export const CHARACTERS: readonly CharacterDef[] = [JIANGQI, XULIAO, WENSHENG, SHAOYAN];

/** id → 定义（逻辑层按 id 查表的唯一入口；穷尽 Record，缺人 tsc 直接报错）。 */
export const CHARACTER_BY_ID: Readonly<Record<MemberId, CharacterDef>> = {
  jiangqi: JIANGQI,
  xuliao: XULIAO,
  wensheng: WENSHENG,
  shaoyan: SHAOYAN,
};

/**
 * 江栖的呼吸（序曲第 4 秒）：不是过场，是把"她是一个人"提前说清楚。
 * `trigger = run-start`，表现 3 秒，不打断操作。
 */
const MOMENT_BREATH: MemberMomentDef = {
  id: 'breath',
  member: 'jiangqi',
  trigger: 'run-start',
  duration: 3,
  description:
    '序曲第 4 秒，耳返里第一次出现她自己的呼吸声；观众越少，呼吸越响——空场时最响。',
};

/** 许燎把句子还给你：连续 3 次同区完美点燃的奖励。 */
const MOMENT_ECHOED_PHRASE: MemberMomentDef = {
  id: 'echoed-phrase',
  member: 'xuliao',
  trigger: 'three-perfect-ignites',
  duration: 8,
  description:
    '你连续 3 次在同一区完美点燃后，下一次副歌她把那段句子自己弹回来（8 小节后重现，你没有教过她后半句）。',
};

/** 闻笙用身体挡接口 1.5 秒：线断时唯一能插线的窗口。 */
const MOMENT_BODY_SHIELD: MemberMomentDef = {
  id: 'body-shield',
  member: 'wensheng',
  trigger: 'line-break',
  duration: 1.5,
  description:
    '线被噪音拽掉，她一步站到接口前用身体挡 1.5 秒；挡的时候低频消失，你听得见她在硬撑。',
};

/** 邵砚留给你的一拍：某区开始冷却时，8 秒内把光移过去可保住热度。 */
const MOMENT_HALF_BEAT: MemberMomentDef = {
  id: 'half-beat',
  member: 'shaoyan',
  trigger: 'zone-cooling',
  duration: 8,
  description:
    '某区开始冷却时，她先停半拍再补一个 fill；若你 8 秒内把光移过去，她会把那一拍留给你（下一小节该区热度不掉）。',
};

/**
 * 4 个角色瞬间（GDD §5.2，数量锁定 4）。
 *
 * `trigger` 四个取值各用一次，与 src/types/data.ts 的联合类型一一对应：
 * run-start / three-perfect-ignites / line-break / zone-cooling。
 * `duration` = 该瞬间的表现或生效时长（秒），不是冷却。
 */
export const MOMENTS: readonly MemberMomentDef[] = [
  MOMENT_BREATH,
  MOMENT_ECHOED_PHRASE,
  MOMENT_BODY_SHIELD,
  MOMENT_HALF_BEAT,
];

/** id → 瞬间定义（combat 触发时按 id 查表）。 */
export const MOMENT_BY_ID: Readonly<Record<MemberMomentId, MemberMomentDef>> = {
  breath: MOMENT_BREATH,
  'echoed-phrase': MOMENT_ECHOED_PHRASE,
  'body-shield': MOMENT_BODY_SHIELD,
  'half-beat': MOMENT_HALF_BEAT,
};

/**
 * 角色瞬间的展示名（`MemberMomentDef` 有 description 与 id，但没有 name）。
 *
 * 四句名词化短语，用于结算/图鉴展示；`description` 仍是 characters.ts 里那份原文。
 */
export const MOMENT_NAMES: Readonly<Record<MemberMomentId, string>> = {
  breath: '耳返里的呼吸',
  'echoed-phrase': '她把句子还给你',
  'body-shield': '用身体挡接口',
  'half-beat': '留给你的半拍',
};
