/**
 * 战斗 HUD（GDD §12）。
 *
 * 硬规则：局内 0 个数字。时间 = 段位点 + 进度弧；人气 = 白光侵占；
 * 区热度 = 四角形状点；转化/烧死 = 两条无数字的记账线；
 * 卡牌 = 底部构筑条；终曲 = 长按提示 + 环形进度。
 */

import type { ReactElement } from 'react';
import type { HudSnapshot, InstrumentLineId, ZoneHud } from '../../types/game';
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

/** 四角区点：形状 + 亮度 + 动作三编码。 */
function ZoneDots({ zones, overheated }: { readonly zones: readonly [ZoneHud, ZoneHud, ZoneHud, ZoneHud]; readonly overheated: ZoneHud['id'] | null }): ReactElement {
  return (
    <ul className="zone-dots" aria-label="四区热度">
      {zones.map((zone) => {
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
          zone.waiting ? '，有人在等你' : ''
        }${zone.blackened ? '，被噪音覆盖' : ''}${overheated === zone.id ? '，过热点' : ''}`;
        return (
          <li key={zone.id} className={classes} aria-label={aria}>
            <span className="zone-dot__shape" aria-hidden="true" />
            <span className="zone-dot__name" aria-hidden="true">
              {ZONE_SHORT[zone.id]}
            </span>
          </li>
        );
      })}
    </ul>
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

/** 构筑条：核心 + 最近三张卡 + 转化/烧死记账 + 卡位点。 */
function BuildStrip({ run }: { readonly run: RunUiFlags }): ReactElement {
  const recent = run.cards.slice(-3);
  const total = run.converted + run.burned;
  const convertShare = total === 0 ? 0 : run.converted / total;
  return (
    <div className="build-strip" aria-label="当前构筑">
      <div className="build-strip__core">
        <span className="build-strip__eyebrow">核心</span>
        <span className={`build-strip__core-name ${run.core === null ? 'is-empty' : ''}`}>
          {run.core?.name ?? '未定核心'}
        </span>
      </div>
      <ul className="build-strip__cards" aria-label="最近获得的卡牌">
        {recent.length === 0 ? (
          <li className="build-strip__empty">还没有卡</li>
        ) : (
          recent.map((card) => (
            <li key={card.id} className={`build-strip__card ${card.category === 'core' ? 'is-core' : ''}`}>
              {card.name}
            </li>
          ))
        )}
      </ul>
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

/** 战斗 HUD 根组件。 */
export function Hud({ hud, run, onPause, onSkipEmptyHouse }: HudProps): ReactElement {
  return (
    <div
      className={`hud ${hud.critical ? 'hud--critical' : ''} ${run.emptyHouse ? 'hud--empty' : ''}`}
      data-revision={hud.revision}
      aria-label="演出信息"
    >
      <Whiteout whiteout={hud.whiteout} />
      <div className="hud__content">
        <div className="hud__top">
          <SegmentPips index={hud.segmentIndex} runSeconds={hud.runSeconds} />
          <DangerBar coverage={hud.lightCoverage} pressure={hud.noisePressure} />
        </div>

        <ZoneDots zones={hud.zones} overheated={hud.overheatedZone} />
        <StatusIcons hud={hud} />
        <BuildStrip run={run} />
        <BeatRing phase={hud.beatPhase} strength={hud.beatStrength} />

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
        <p className="hud__hint" aria-hidden="true">
          Esc 暂停 · Tab 看构筑
        </p>
      </div>
    </div>
  );
}
