/**
 * UI 文案与本地化（dev-ui）。
 *
 * 只做「事实 → 中文」的渲染，不计算玩法，不读存档，不碰 DOM。
 * 数据层提供的 `CopyBank` 优先；缺项时使用本文件的保底文案（原创）。
 */

import type {
  CopyBank,
  CopyContext,
  CopyLineDef,
} from '../types/data';
import type {
  FailureReason,
  FailureReplay,
  Grade,
  MemberId,
  SegmentId,
  ZoneId,
} from '../types/game';
import type { OverlayKind, ScreenId } from '../types/ui';

/* ==========================================================================
 * 1. 固定文案
 * ========================================================================== */

/** 游戏名（中文）。 */
export const GAME_TITLE = '谁在听';
/** 游戏名（英文副题）。 */
export const GAME_TITLE_EN = "WHO'S LISTENING";
/** 乐队名。 */
export const BAND_NAME = '留声';
/** 本场曲目。 */
export const SONG_TITLE = '再亮一会儿';
/** 场馆。 */
export const VENUE_NAME = 'B2 旧货仓';
/** 主菜单一句话。 */
export const TAGLINE = '你只有一束光。照向台下，他们为你燃烧，噪音也循光而来。';
/** 桌面提示。 */
export const DESKTOP_HINT = '仅桌面 · 键盘 + 鼠标 · 建议 1280×720 以上';
/** 空场结论文案（数据层缺项时使用）。 */
export const EMPTY_HOUSE_LINE = '今天，只有你听见了。';
/** 制作名单声明。 */
export const CREDITS_NOTICE =
  '零外部素材：画面、字体、声音全部由代码与系统资源生成。离线单文件，可重复构建。';

/* ==========================================================================
 * 2. 座区、段落、角色、评级
 * ========================================================================== */

/** 四区固定顺序（与 ZoneId 联合顺序一致）。 */
export const ZONE_ORDER: readonly ZoneId[] = [
  'front-left',
  'front-right',
  'back-left',
  'back-right',
];

/** 四区中文名。 */
export const ZONE_LABELS: Readonly<Record<ZoneId, string>> = {
  'front-left': '前左区',
  'front-right': '前右区',
  'back-left': '后左区',
  'back-right': '后右区',
};

/** 四区短名（HUD 角标）。 */
export const ZONE_SHORT: Readonly<Record<ZoneId, string>> = {
  'front-left': '前左',
  'front-right': '前右',
  'back-left': '后左',
  'back-right': '后右',
};

/** 四区序号（失败卡与暂停面板可用数字）。 */
export const ZONE_NUMBER: Readonly<Record<ZoneId, number>> = {
  'front-left': 1,
  'front-right': 2,
  'back-left': 3,
  'back-right': 4,
};

/** 热度 0–4 的中文读法（HUD 不出现数字）。 */
export const ZONE_HEAT_LABELS: readonly [string, string, string, string, string] = [
  '灭',
  '抬头',
  '举棒',
  '合唱',
  '和声',
];

/** 五段中文名。 */
export const SEGMENT_LABELS: Readonly<Record<SegmentId, string>> = {
  overture: '序曲',
  verse: '主歌',
  chorus: '副歌',
  bridge: '桥段',
  finale: '终曲',
};

/** 五段固定顺序。 */
export const SEGMENT_ORDER: readonly SegmentId[] = [
  'overture',
  'verse',
  'chorus',
  'bridge',
  'finale',
];

/** 成员中文名（数据层缺项时使用）。 */
export const MEMBER_NAMES: Readonly<Record<MemberId, string>> = {
  jiangqi: '江栖',
  xuliao: '许燎',
  wensheng: '闻笙',
  shaoyan: '邵砚',
};

/** 成员职责（主菜单剪影用）。 */
export const MEMBER_ROLES: Readonly<Record<MemberId, string>> = {
  jiangqi: '主唱 · 光',
  xuliao: '主音吉他 · 高频',
  wensheng: '贝斯 · 低频护盾',
  shaoyan: '鼓 · 节拍',
};

/** 三条构筑的短标签。 */
export const BUILD_LABELS: Readonly<Record<'choir' | 'solo' | 'bait', string>> = {
  choir: '合唱流',
  solo: '独奏流',
  bait: '招灾流',
};

/** 评级短评（数据层 `grades` 缺项时使用）。 */
export const GRADE_LABELS: Readonly<Record<Grade, string>> = {
  S: '这一晚，满场',
  A: '他们没走',
  B: '还有人听',
  C: '只剩一盏灯',
};

/** 屏幕名（无障碍播报）。 */
export const SCREEN_LABELS: Readonly<Record<ScreenId, string>> = {
  boot: '启动',
  menu: '主菜单',
  setlist: '今晚的曲目单',
  rehearsal: '排练室',
  settings: '设置',
  credits: '制作名单',
  playing: '演出',
  paused: '暂停',
  levelup: '升级选择',
  results: '散场之后',
};

/** 覆盖层名（无障碍播报）。 */
export const OVERLAY_LABELS: Readonly<Record<Exclude<OverlayKind, 'none'>, string>> = {
  pause: '暂停面板',
  levelup: '升级选择',
  failure: '失败卡',
  settings: '设置面板',
  'confirm-quit': '离开确认',
};

/* ==========================================================================
 * 3. 排练室与制作名单
 * ========================================================================== */

/** 排练室三页（玩法说明，不含教程弹窗）。 */
export const REHEARSAL_PAGES: readonly {
  readonly title: string;
  readonly body: readonly string[];
  readonly diagram: 'light' | 'burn-or-sing' | 'return-listener';
}[] = [
  {
    title: '走位与光',
    body: [
      'WASD 或方向键移动主唱；鼠标移动光。你只有一束光，它只能看一个地方。',
      '按住左键收成束光，松开回到散光。点击是点燃；落在拍点上，伤害更高。',
      '光在同一个地方停太久，返听会咬住你的习惯。移光，或者把它烧掉。',
    ],
    diagram: 'light',
  },
  {
    title: '烧与唱化',
    body: [
      '光照到噪音会把它烧穿：快，不可逆，但不产出观众。',
      '把光留在被覆盖的人身上，噪音会被唱化：慢，但人会回来，还会更多。',
      '灰 → 彩 → 黑。全场只有三种颜色；第四种高饱和色，就是 bug。',
    ],
    diagram: 'burn-or-sing',
  },
  {
    title: '危险与返听',
    body: [
      '返听会锁定你的光。右侧出现耳朵时，移光、绕后，或者烧掉它。',
      '静默段会抽走声音，节拍环还在。关掉声音，也能把这段弹完。',
      '终曲长按 Space 放下光：人够，他们照回台上；不够，你一个人弹完。',
    ],
    diagram: 'return-listener',
  },
];

/** 制作名单（角色而不是个人姓名，避免名单随人员调整而过期）。 */
export const CREDITS_ROLES: readonly {
  readonly role: string;
  readonly members: readonly string[];
}[] = [
  {
    role: '制作与导演',
    members: ['制作人：编排、计票、里程碑与发布', '创意总监：GDD、三案融合', '技术总监：类型契约、技术方案、集成', '美术总监：视觉方向、程序化资产'],
  },
  {
    role: '策划',
    members: [
      '叙事与角色关系 / Roguelike 数值 / 氛围与视听',
      '玩法融合 / 二次元社区 / 复古街机',
      '极简与资源 / 长线运营 / 反套路实验 / 新手友好',
    ],
  },
  {
    role: '评审与打分',
    members: ['三位评审：玩法乐趣 / 工程可行性 / 玩家价值', '七位打分员：硬核、音游、休闲、独立、视觉、速通、新手'],
  },
  {
    role: '工程',
    members: ['引擎 / 渲染 / 战斗 / 成长 / 内容 / UI / 音频'],
  },
  {
    role: '质量与发行',
    members: ['自动化测试 / 实机试玩 / 兼容与无障碍 / 代码审查 / 发行'],
  },
];

/* ==========================================================================
 * 4. 通用格式化
 * ========================================================================== */

/** 秒 → `m:ss`（失败卡、暂停、结算可用数字；战斗 HUD 不调用）。 */
export function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const minutes = Math.floor(safe / 60);
  const rest = Math.floor(safe % 60);
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** 段落中文名（数据层缺项时回退）。 */
export function segmentLabel(segment: SegmentId): string {
  return SEGMENT_LABELS[segment];
}

/** 空 `CopyContext`，供 UI 直接渲染已绑定的文案行。 */
export function emptyCopyContext(): CopyContext {
  return {
    ending: 'complete',
    grade: null,
    converted: 0,
    burned: 0,
    covered: 0,
    cracks: 0,
    breakout: { 'front-left': 0, 'front-right': 0, 'back-left': 0, 'back-right': 0 },
    emptySeats: 0,
    secondRowEmpty: 0,
    lineBreaks: { guitar: 0, bass: 0, drums: 0 },
    returnLocks: 0,
  };
}

/** 全零乐线断线记录。 */
export const ZERO_LINE_BREAKS: Readonly<Record<'guitar' | 'bass' | 'drums', number>> = {
  guitar: 0,
  bass: 0,
  drums: 0,
};

/**
 * 把数据文案行绑定到本局上下文。
 *
 * 屏幕组件只拿 `CopyLineDef`（types/ui 的视图模型），不持有 `CopyContext`；
 * 因此由 bridge 在生成视图时完成绑定，屏幕渲染时再调用 `render(emptyContext)`。
 */
export function bindCopyLines(
  lines: readonly CopyLineDef[],
  ctx: CopyContext,
): readonly CopyLineDef[] {
  return lines.map((line) => ({
    ...line,
    render: () => line.render(ctx),
  }));
}

/** 失败卡第三条：最后 5 秒在做什么（允许数字）。 */
export function describeLastFiveSeconds(replay: FailureReplay, zone: ZoneId | null): string {
  const where = zone === null ? '' : `，光停在${ZONE_LABELS[zone]}`;
  if (replay.lightPath.length < 2 && replay.movedMeters < 0.2) {
    return `最后 5 秒你没有移动光，点燃 ${replay.ignites} 次${where}。`;
  }
  return `最后 5 秒你移动了 ${replay.movedMeters.toFixed(1)} 米，点燃 ${replay.ignites} 次${where}。`;
}

/* ==========================================================================
 * 5. 文案渲染器（tech-spec §5.6）
 * ========================================================================== */

/** 文案渲染器：失败卡、结算后台、空场、评级。 */
export interface CopyRenderer {
  failureLine(reason: FailureReason): string;
  backstageLines(ctx: CopyContext): readonly CopyLineDef[];
  emptyHouseLine(): string;
  gradeLabel(grade: Grade): string;
}

/** 失败事实里用于模板的数值：时间类取秒，人数类取人数。 */
function failureValue(reason: FailureReason): number {
  switch (reason.code) {
    case 'return-listener-lock':
      return reason.seconds;
    case 'no-ignite':
      return reason.seconds;
    case 'zone-cooled':
    case 'audience-left':
      return reason.people;
    case 'overheated-zone':
      return reason.seconds;
    default:
      return reason.people;
  }
}

/** 保底失败文案（数据层缺项时使用；原创）。 */
function fallbackFailure(reason: FailureReason): string {
  const zoneNumber = reason.zone === null ? null : ZONE_NUMBER[reason.zone];
  switch (reason.code) {
    case 'return-listener-lock':
      return `返听锁住了你的光 ${reason.seconds} 秒，你没能甩掉它。`;
    case 'zone-cooled':
      return zoneNumber === null
        ? `有一整区先冷了下去，${reason.people} 人跟着离场。`
        : `第 ${zoneNumber} 区先冷了下去，${reason.people} 人跟着离场。`;
    case 'audience-left':
      return `${reason.people} 人从出口走了，没有回头。`;
    case 'no-ignite':
      return `最后 ${reason.seconds} 秒，你没有点燃一次。`;
    case 'overheated-zone':
      return zoneNumber === null
        ? '有一区被照得过热，人反而散了。'
        : `第 ${zoneNumber} 区被照得过热，人反而散了。`;
    default:
      return '这一场停在了这里。';
  }
}

/** 保底后台短句（四名成员各一句）。 */
function fallbackBackstageLines(): readonly CopyLineDef[] {
  return [
    {
      id: 'fallback-backstage-jiangqi',
      trigger: 'results-backstage',
      speaker: 'jiangqi',
      render: (ctx: CopyContext) =>
        ctx.ending === 'empty-house'
          ? '江栖把麦克风放回架子上，台下没有回声。'
          : '江栖往台下看了一眼，把麦克风举了一下，又放下。',
    },
    {
      id: 'fallback-backstage-xuliao',
      trigger: 'results-backstage',
      speaker: 'xuliao',
      render: () => '许燎解开琴背带，手还按在最后一个和弦上。',
    },
    {
      id: 'fallback-backstage-wensheng',
      trigger: 'results-backstage',
      speaker: 'wensheng',
      render: (ctx: CopyContext) =>
        ctx.lineBreaks.bass > 0
          ? '闻笙的线断过。她蹲下去，把接口一根一根擦干净。'
          : '闻笙把线一圈一圈收好，没说话。',
    },
    {
      id: 'fallback-backstage-shaoyan',
      trigger: 'results-backstage',
      speaker: 'shaoyan',
      render: () => '邵砚最后一个起身，把鼓棒并齐，放在军鼓上。',
    },
  ];
}

/** 创建文案渲染器。 */
export function createCopyRenderer(bank: CopyBank): CopyRenderer {
  const failureReason = (reason: FailureReason): string => {
    // 以下两条的数值语义由 store 的失败卡事实决定，数据模板的 value 口径不匹配：
    // - zone-cooled 的 people 是「该区还抬头的人数」，不是离场人数；
    // - no-ignite 的 people 是「最近 5 秒点燃次数」，seconds 是全场时间。
    // 为保证 3 秒可读且不撒谎，这两条使用 UI 侧的确定性文案；其余走数据模板。
    if (reason.code === 'zone-cooled') {
      const zoneNumber = reason.zone === null ? null : ZONE_NUMBER[reason.zone];
      const zoneText = zoneNumber === null ? '有一区' : `第 ${zoneNumber} 区`;
      return `${zoneText}先冷了下去，只剩 ${reason.people} 人还在抬头。`;
    }
    if (reason.code === 'no-ignite') {
      return reason.people === 0
        ? '最后 5 秒你一次都没点燃。'
        : `最后 5 秒你只点燃了 ${reason.people} 次。`;
    }
    const template = bank.failureReasons[reason.code];
    if (typeof template === 'function') {
      return template(failureValue(reason));
    }
    return fallbackFailure(reason);
  };

  return {
    failureLine: failureReason,
    backstageLines: (_ctx: CopyContext): readonly CopyLineDef[] => {
      const lines = bank.lines.filter((line) => line.trigger === 'results-backstage');
      // GDD §5.3 / §13.5：四名成员各一句。数据层若追加旁白，取前四条成员行。
      return lines.length > 0 ? lines.slice(0, 4) : fallbackBackstageLines();
    },
    emptyHouseLine: (): string => {
      const line = bank.lines.find((candidate) => candidate.trigger === 'empty-house');
      if (line === undefined) {
        return EMPTY_HOUSE_LINE;
      }
      return line.render(emptyCopyContext());
    },
    gradeLabel: (grade: Grade): string => bank.grades[grade] ?? GRADE_LABELS[grade],
  };
}

/** 成员中文名（数据层缺项时回退）。 */
export function memberLabel(id: MemberId, fallback?: string): string {
  return fallback ?? MEMBER_NAMES[id];
}
