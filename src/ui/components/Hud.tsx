/**
 * 战斗 HUD（GDD §12；v1.0.1 可读性修复）。
 *
 * 硬规则：局内 0 个数字。人气 = 白光比例 + 10s 趋势 + 空位剪影；
 * 四区 = 形状点 + 亮灯比例；光 = 散/束/回三格 + 护盾/冷却；返听 = 耳朵 + 倒计时环；
 * 序曲教学三步不阻断，首次束光覆盖观众时红色反馈。
 */

import type { ReactElement } from 'react';
import type { HudSnapshot, InstrumentLineId, LightMode, ZoneHud } from '../../types/game';
import type { CoreCardId } from '../../types/game';
import type { RunUiFlags } from '../bridge';
import {
  SEGMENT_ORDER,
  ZONE_HEAT_LABELS,
  ZONE_LABELS,
  ZONE_SHORT,
} from '../copy';
import {
  EarIcon,
  EncoreIcon,
  PauseIcon,
  PlugIcon,
  SilenceIcon,
  SkipIcon,
} from './Icons';

export interface HudProps {
  readonly hud: HudSnapshot;
  readonly run: RunUiFlags;
  readonly onPause: () => void;
  readonly onSkipEmptyHouse: () => void;
}

const LINE_LABELS: Readonly<Record<InstrumentLineId, string>> = {
  guitar: '吉他',
  bass: '贝斯',
  drums: '鼓',
};

const LIGHT_MODES: readonly { readonly id: LightMode; readonly label: string; readonly hint: string }[] = [
  { id: 'spread', label: '散光', hint: '养人' },
  { id: 'beam', label: '束光', hint: '烧人' },
  { id: 'self', label: '回照', hint: '护盾' },
];

const CORE_HINTS: Readonly<Record<CoreCardId, string>> = {
  'choir-wall': '四区都养起来时，合唱波更响；散光养人。',
  'solo-return': '把光收回脚下，护盾亮起；此时不能转化。',
  'bait-line': '光停住的区会变成诱饵；那里更招噪音。',
};

const SEGMENT_PIPS: readonly string[] = SEGMENT_ORDER.map((segment) => {
  switch (segment) {
    case 'overture':
      return '序曲';
    case 'verse':
      return '主歌';
    case 'chorus':
      return '副歌';
    case 'bridge':
      return '桥段';
    case 'finale':
      return '终曲';
    default:
      return '';
  }
});

const TOTAL_SECONDS = 570;
const CAPACITY = 768;
const SECOND_ROW_CAPACITY = 64;

/** 0..1 截断。 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** 四边白光：血量＝白光吃掉多少颜色。 */
function Whiteout({ whiteout }: { readonly whiteout: number }): ReactElement {
  return (
    <div className="whiteout" style={{ opacity: Math.min(0.85, clamp01(whiteout)) }} aria-hidden="true">
      <div className="whiteout__edge whiteout__edge--top" />
      <div className="whiteout__edge whiteout__edge--right" />
      <div className="whiteout__edge whiteout__edge--bottom" />
      <div className="whiteout__edge whiteout__edge--left" />
      <div className="whiteout__veil" />
    </div>
  );
}

/** 四角区点：形状 + 热度 + 亮灯比例；形状与动作是第二编码。 */
function ZoneDots({
  zones,
  overheated,
  ratios,
}: {
  readonly zones: readonly [ZoneHud, ZoneHud, ZoneHud, ZoneHud];
  readonly overheated: HudSnapshot['overheatedZone'];
  readonly ratios: readonly [number, number, number, number] | undefined;
}): ReactElement {
  return (
    <ul className="zone-dots" aria-label="四区热度与亮灯比例">
      {zones.map((zone, index) => {
        const ratio = ratios?.[index];
        const classes = [
          'zone-dot',
          `zone-dot--${zone.id}`,
          `is-heat-${zone.heat}`,
          zone.waiting ? 'is-waiting' : '',
          zone.blackened ? 'is-blackened' : '',
          overheated === zone.id ? 'is-overheated' : '',
        ]
          .filter((value) => value.length > 0)
          .join(' ');
        const aria = `${ZONE_LABELS[zone.id]}，热度${ZONE_HEAT_LABELS[zone.heat]}${
          ratio === undefined ? '' : `，亮灯${ratio > 0.66 ? '较亮' : ratio > 0.33 ? '一半' : '偏暗'}`
        }${zone.waiting ? '，有人在等你' : ''}${zone.blackened ? '，被噪音覆盖' : ''}${
          overheated === zone.id ? '，过热点' : ''
        }`;
        return (
          <li key={zone.id} className={classes} aria-label={aria}>
            <span className="zone-dot__shape" aria-hidden="true" />
            <span className="zone-dot__name" aria-hidden="true">
              {ZONE_SHORT[zone.id]}
            </span>
            <span className="zone-dot__light" aria-hidden="true">
              <span style={{ width: `${clamp01(ratio ?? 0) * 100}%` }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** 人气读数：趋势箭头 + 空位剪影 + 第二排剪影（不显示数字）。 */
function AudienceGauge({ hud }: { readonly hud: HudSnapshot }): ReactElement {
  const trend = hud.audienceTrend ?? 0;
  const trendClass = trend > 0 ? 'is-up' : trend < 0 ? 'is-down' : 'is-flat';
  const trendText = trend > 0 ? '人气上升' : trend < 0 ? '人气下降' : '人气持平';
  const empty = hud.emptySeats ?? Math.round(clamp01(hud.whiteout / 0.85) * CAPACITY);
  const presentRatio = clamp01(1 - empty / CAPACITY);
  const secondRatio = clamp01(1 - (hud.secondRowEmpty ?? 0) / SECOND_ROW_CAPACITY);
  return (
    <div className={`audience-gauge ${hud.audienceLow ? 'is-low' : ''}`} aria-label={`${trendText}；空位剪影`}>
      <span className={`audience-gauge__trend ${trendClass}`} aria-hidden="true">
        {trend > 0 ? '▲' : trend < 0 ? '▼' : '■'}
      </span>
      <span className="audience-gauge__label" aria-hidden="true">
        人气
      </span>
      <span className="audience-gauge__seats" aria-hidden="true">
        {Array.from({ length: 16 }, (_, index) => (
          <span key={index} className={index / 16 < presentRatio ? 'is-on' : ''} />
        ))}
      </span>
      <span className="audience-gauge__second" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <span key={index} className={index / 8 < secondRatio ? 'is-on' : ''} />
        ))}
      </span>
    </div>
  );
}

/** 空场前预警：边缘脉动 + 一句可执行建议（不显示数字）。 */
function AudienceWarning({ encoreAvailable }: { readonly encoreAvailable: boolean }): ReactElement {
  return (
    <div className="audience-warning" role="status">
      <span className="audience-warning__mark" aria-hidden="true">
        !
      </span>
      <span className="audience-warning__copy">
        <strong>人气快见底了</strong>
        <small>{encoreAvailable ? '还有一次安可，别把光停在空区。' : '切回散光，别再烧人。'}</small>
      </span>
    </div>
  );
}

/** 目光—危险条：左＝被照亮的人，右＝循光噪音。 */
function DangerBar({ coverage, pressure }: { readonly coverage: number; readonly pressure: number }): ReactElement {
  return (
    <div className="danger" aria-label="左：被光照亮的人。右：循光而来的噪音。">
      <span className="danger__label" aria-hidden="true">
        目光
      </span>
      <div className="danger__bar" role="img" aria-label="目光与危险">
        <span className="danger__lit" style={{ width: `${clamp01(coverage) * 100}%` }} />
        <span className="danger__noise" style={{ width: `${clamp01(pressure) * 100}%` }} />
        <span className="danger__threshold" aria-hidden="true" />
      </div>
      <span className="danger__label danger__label--right" aria-hidden="true">
        危险
      </span>
    </div>
  );
}

/** 五段段位点 + 无数字演出进度。 */
function SegmentPips({ index, runSeconds }: { readonly index: number; readonly runSeconds: number }): ReactElement {
  const progress = clamp01(runSeconds / TOTAL_SECONDS);
  return (
    <div className="segments">
      <ol className="segments__pips" aria-label="段落">
        {SEGMENT_PIPS.map((label, pipIndex) => (
          <li
            key={label}
            className={`segments__pip ${pipIndex === index ? 'is-current' : ''} ${
              pipIndex < index ? 'is-past' : ''
            }`}
            aria-current={pipIndex === index ? 'step' : undefined}
            aria-label={label}
          >
            <span className="segments__mark" aria-hidden="true" />
            <span className="segments__name" aria-hidden="true">
              {label}
            </span>
          </li>
        ))}
      </ol>
      <div
        className="run-progress"
        role="progressbar"
        aria-label="演出进度"
        aria-valuemin={0}
        aria-valuemax={TOTAL_SECONDS}
        aria-valuenow={Math.round(runSeconds)}
        aria-valuetext={SEGMENT_PIPS[index] ?? '演出'}
        data-run-seconds={Math.round(runSeconds)}
      >
        <span className="run-progress__fill" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}

/** 光三形态常驻三格 + 当前高亮 + 护盾/冷却/锁定。 */
function LightState({ hud }: { readonly hud: HudSnapshot }): ReactElement {
  const mode = hud.lightMode ?? 'spread';
  const shield = mode === 'self' ? clamp01(hud.soloShield ?? 0) : 0;
  const cooldown = clamp01(hud.igniteCooldown ?? 0);
  const lockMax = Math.max(0.001, hud.maxLock ?? hud.maxLockSeconds ?? 7);
  const lock = hud.returnLocked
    ? clamp01((hud.lockRemaining ?? hud.returnLockRemaining ?? 0) / lockMax)
    : 0;
  return (
    <div className={`light-state ${mode === 'self' ? 'is-solo' : ''}`} data-mode={mode} aria-label={`光形态：${
      mode === 'self' ? '回照' : mode === 'beam' ? '束光' : '散光'
    }`}>
      <div className="light-state__modes" role="group" aria-label="光形态">
        {LIGHT_MODES.map((item) => (
          <span key={item.id} className={`light-state__cell ${mode === item.id ? 'is-active' : ''}`}>
            <span className="light-state__cell-label">{item.label}</span>
            <span className="light-state__cell-hint">{item.hint}</span>
          </span>
        ))}
      </div>
      {mode === 'self' ? <span className="light-state__solo">独奏中</span> : null}
      <div className="light-state__meters">
        {shield > 0 ? (
          <span className="light-state__meter is-shield" aria-label="独奏护盾">
            <span style={{ width: `${shield * 100}%` }} />
          </span>
        ) : null}
        <span className="light-state__meter is-cooldown" aria-label="点燃冷却">
          <span style={{ width: `${(1 - cooldown) * 100}%` }} />
        </span>
        {lock > 0 ? (
          <span className="light-state__meter is-lock" aria-label="返听锁定倒计时">
            <span style={{ width: `${lock * 100}%` }} />
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** 返听锁定：耳朵 + 倒计时环 + 可执行解法。 */
function ReturnLock({ hud }: { readonly hud: HudSnapshot }): ReactElement | null {
  if (!hud.returnLocked) {
    return null;
  }
  const max = Math.max(0.001, hud.maxLock ?? hud.maxLockSeconds ?? 7);
  const remaining = clamp01((hud.lockRemaining ?? hud.returnLockRemaining ?? 0) / max);
  return (
    <div className="lock-callout" role="status" aria-label="返听锁定。移光、断视线，或者烧掉它。">
      <EarIcon className="lock-callout__icon" />
      <span className="lock-callout__copy">
        <strong>返听锁定</strong>
        <small>移光 / 断视线 / 烧掉它</small>
      </span>
      <span
        className="lock-callout__ring"
        aria-hidden="true"
        style={{ background: `conic-gradient(var(--gbl-color-danger) ${remaining * 360}deg, rgba(255,255,255,0.12) 0)` }}
      />
    </div>
  );
}

/** 节拍环：四拍一圈，强拍更亮。 */
function BeatRing({ phase, strength }: { readonly phase: number; readonly strength: 'strong' | 'weak' }): ReactElement {
  const safe = clamp01(phase);
  const step = Math.min(3, Math.floor(safe * 4));
  return (
    <div className={`beat-ring ${strength === 'strong' ? 'is-strong' : 'is-weak'}`} aria-hidden="true">
      <div className="beat-ring__orbit">
        {[0, 1, 2, 3].map((beat) => (
          <span key={beat} className={`beat-ring__dot ${beat === step ? 'is-active' : ''}`} />
        ))}
      </div>
      <span className="beat-ring__hand" style={{ transform: `rotate(${safe * 360}deg)` }} />
      <span className="beat-ring__center" />
    </div>
  );
}

/** 构筑条：核心 + 最近三张卡 + 进化 + 转化/烧死记账 + 卡位点。 */
function BuildStrip({ run }: { readonly run: RunUiFlags }): ReactElement {
  const recent = run.cards.slice(-3);
  const total = run.converted + run.burned;
  const convertShare = total === 0 ? 0 : run.converted / total;
  const coreHint = run.core === null ? null : CORE_HINTS[run.core.id as CoreCardId] ?? null;
  return (
    <div className="build-strip" aria-label="当前构筑与今晚的账">
      <div className="build-strip__core">
        <span className="build-strip__eyebrow">核心</span>
        <span className={`build-strip__core-name ${run.core === null ? 'is-empty' : ''}`}>
          {run.core?.name ?? '未定核心'}
        </span>
        {run.evolutionName === undefined || run.evolutionName === null ? null : (
          <span className="build-strip__evolution">进化：{run.evolutionName}</span>
        )}
      </div>
      <ul className="build-strip__cards" aria-label="最近获得的卡牌">
        {recent.length === 0 ? (
          <li className="build-strip__empty">{run.core === null ? '还没有卡' : '支援卡未拿'}</li>
        ) : (
          recent.map((card) => (
            <li key={card.id} className={`build-strip__card ${card.category === 'core' ? 'is-core' : ''}`}>
              {card.name}
            </li>
          ))
        )}
      </ul>
      {coreHint === null ? null : <p className="build-strip__hint">{coreHint}</p>}
      <div className="ledger" aria-label="转化与烧死">
        <span className="ledger__label" aria-hidden="true">
          账
        </span>
        <span className="ledger__bar">
          <span className="ledger__convert" style={{ width: `${convertShare * 100}%` }} />
          <span className="ledger__burn" style={{ width: `${(1 - convertShare) * 100}%` }} />
        </span>
      </div>
      <div
        className="picks"
        role="progressbar"
        aria-label="卡牌进度"
        aria-valuemin={0}
        aria-valuemax={run.maxPicks}
        aria-valuenow={run.picks}
      >
        {Array.from({ length: run.maxPicks }, (_, index) => (
          <span key={index} className={`picks__pip ${index < run.picks ? 'is-filled' : ''}`} />
        ))}
      </div>
    </div>
  );
}

/** 右侧状态图标（听觉等价）。 */
function StatusIcons({ hud }: { readonly hud: HudSnapshot }): ReactElement {
  const notes: string[] = [];
  if (hud.returnLocked) {
    notes.push('返听锁定');
  }
  if (hud.silent) {
    notes.push('静默');
  }
  if (hud.brokenLines.length > 0) {
    notes.push(`${hud.brokenLines.map((line) => LINE_LABELS[line]).join('、')}线断了`);
  }
  if (hud.encoreAvailable) {
    notes.push('安可未用');
  }
  return (
    <div className="hud-status">
      <ul className="hud-status__list" aria-label="状态">
        {hud.returnLocked ? (
          <li className="hud-status__item is-danger">
            <EarIcon />
            <span className="sr-only">返听锁定</span>
          </li>
        ) : null}
        {hud.silent ? (
          <li className="hud-status__item is-danger">
            <SilenceIcon />
            <span className="sr-only">静默</span>
          </li>
        ) : null}
        {hud.brokenLines.map((line) => (
          <li key={line} className="hud-status__item is-warn">
            <PlugIcon />
            <span className="sr-only">{LINE_LABELS[line]}线断了</span>
          </li>
        ))}
        {hud.encoreAvailable ? (
          <li className="hud-status__item">
            <EncoreIcon />
            <span className="sr-only">安可未用</span>
          </li>
        ) : null}
      </ul>
      <p className="sr-only" aria-live="polite">
        {notes.join('；')}
      </p>
    </div>
  );
}

/** 断线：图标 + 文字 + E 提示（不依赖读屏）。 */
function BrokenNotice({ lines }: { readonly lines: readonly InstrumentLineId[] }): ReactElement | null {
  if (lines.length === 0) {
    return null;
  }
  return (
    <div className="broken-notice" role="status">
      <PlugIcon />
      <span>
        {lines.map((line) => LINE_LABELS[line]).join(' / ')}线断了 · 靠近队友按 E 插线
      </span>
    </div>
  );
}

/** 序曲三步教学：0–30 秒，不强停、不遮操作。 */
function TutorialCoach({ runSeconds }: { readonly runSeconds: number }): ReactElement | null {
  if (runSeconds >= 30) {
    return null;
  }
  const step = runSeconds < 9 ? 0 : runSeconds < 19 ? 1 : 2;
  const steps: readonly { readonly title: string; readonly body: string }[] = [
    { title: '散光养人', body: '移动鼠标或 IJKL 移光；松开左键就是散光，被照到的人会留下来。' },
    { title: '束光烧人', body: '按住左键或 Shift＝束光，光里的观众会被烧；松开才养人。' },
    { title: '点击点燃', body: '点击或 Enter 点燃；落在拍点更亮。看哪里，噪音就从哪里来。' },
  ];
  const current = steps[step];
  if (current === undefined) {
    return null;
  }
  return (
    <div className={`tutorial tutorial--step-${step}`} aria-live="polite">
      <span className="tutorial__dots" aria-hidden="true">
        {steps.map((item, index) => (
          <span key={item.title} className={index === step ? 'is-active' : ''} />
        ))}
      </span>
      <span className="tutorial__copy">
        <strong>{current.title}</strong>
        <small>{current.body}</small>
      </span>
    </div>
  );
}

/** 终曲：放下光。 */
function FinalePrompt({ progress }: { readonly progress: number }): ReactElement {
  const safe = clamp01(progress);
  return (
    <div className="finale" aria-label="终曲：长按 Space 放下光">
      <span className="finale__eyebrow">终曲</span>
      <strong className="finale__text">长按 Space 放下光</strong>
      <span
        className="finale__ring"
        role="progressbar"
        aria-label="放下光"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={Number(safe.toFixed(2))}
        style={{ background: `conic-gradient(var(--gbl-color-stage-warm) ${safe * 360}deg, rgba(255,255,255,0.12) 0)` }}
      />
    </div>
  );
}

/** 读屏趋势摘要：5–10s 量级的变化，不逐拍刷屏。 */
function HudLiveStatus({ hud, run }: { readonly hud: HudSnapshot; readonly run: RunUiFlags }): ReactElement {
  const trend = hud.audienceTrend ?? 0;
  const trendText = trend > 0 ? '人气上升' : trend < 0 ? '人气下降' : '人气持平';
  const low = hud.audienceLow ? '空场预警。' : '';
  const empty = run.emptyHouse ? '已经空场，只剩主唱。' : '';
  const mode = hud.lightMode === 'self' ? '回照' : hud.lightMode === 'beam' ? '束光' : '散光';
  const zones = hud.zones
    .map((zone) => `${ZONE_LABELS[zone.id]}热度${ZONE_HEAT_LABELS[zone.heat]}`)
    .join('；');
  const lock = hud.returnLocked ? '返听锁定，移光或断视线。' : '';
  const broken = hud.brokenLines.length > 0 ? `断线：${hud.brokenLines.map((line) => LINE_LABELS[line]).join('、')}。` : '';
  return (
    <p className="sr-only hud-live" aria-live="polite" aria-atomic="true">
      {`${trendText}。${low}${empty}光形态${mode}。${zones}。${lock}${broken}`}
    </p>
  );
}

/** 战斗 HUD 根组件。 */
export function Hud({ hud, run, onPause, onSkipEmptyHouse }: HudProps): ReactElement {
  const burning = hud.lightMode === 'beam' && hud.lightCoverage > 0.015;
  const classes = [
    'hud',
    hud.critical || hud.audienceLow ? 'hud--critical' : '',
    hud.whiteout > 0.2 ? 'hud--whiteout' : '',
    run.emptyHouse ? 'hud--empty' : '',
    burning ? 'hud--burning' : '',
  ]
    .filter((value) => value.length > 0)
    .join(' ');

  return (
    <div className={classes} data-revision={hud.revision} aria-label="演出信息">
      <Whiteout whiteout={hud.whiteout} />
      <div className="hud__content">
        <div className="hud__top">
          <SegmentPips index={hud.segmentIndex} runSeconds={hud.runSeconds} />
          <DangerBar coverage={hud.lightCoverage} pressure={hud.noisePressure} />
          <ReturnLock hud={hud} />
          {hud.audienceLow && !run.emptyHouse ? (
            <AudienceWarning encoreAvailable={hud.encoreAvailable} />
          ) : null}
        </div>

        <ZoneDots zones={hud.zones} overheated={hud.overheatedZone} ratios={hud.zoneLightRatios} />
        <AudienceGauge hud={hud} />
        <TutorialCoach runSeconds={hud.runSeconds} />
        <StatusIcons hud={hud} />
        <BrokenNotice lines={hud.brokenLines} />
        <LightState hud={hud} />
        <BuildStrip run={run} />
        <BeatRing phase={hud.beatPhase} strength={hud.beatStrength} />

        {burning ? (
          <div className="beam-burn" role="status">
            束光正在烧人 · 松开回散光养人
          </div>
        ) : null}

        {hud.segmentIndex === 4 ? <FinalePrompt progress={hud.holdProgress} /> : null}

        {run.emptyHouse ? (
          <div className="empty-house" role="status">
            <span className="empty-house__text">空场。只剩你还在弹。</span>
            <button type="button" className="empty-house__skip" onClick={onSkipEmptyHouse}>
              <SkipIcon />
              跳过剩余演奏
            </button>
          </div>
        ) : null}

        <button
          type="button"
          className="hud__pause"
          onClick={onPause}
          disabled={!run.canPause}
          aria-label="暂停（Esc）"
        >
          <PauseIcon />
        </button>
        <p className="hud__hint">
          <span>IJKL 移光 · Shift 束光 · Enter 点燃</span>
          <span>Esc 暂停 · Tab 构筑 · Space 终曲</span>
        </p>
        <HudLiveStatus hud={hud} run={run} />
      </div>
    </div>
  );
}
