/** 结算：后台清单、真实数据、评级、四句成员短句（允许数字）。 */

import type { ReactElement } from 'react';
import type { EndingKind, InstrumentLineId } from '../../types/game';
import type { ResultView, UiBridge } from '../../types/ui';
import { Button } from '../components/Button';
import { ScreenShell } from '../components/ScreenShell';
import { Stamp } from '../components/Stamp';
import {
  EMPTY_HOUSE_LINE,
  MEMBER_NAMES,
  SONG_TITLE,
  ZONE_LABELS,
  ZONE_ORDER,
  emptyCopyContext,
  formatTime,
} from '../copy';
import { useRunFlags } from '../hooks';

export interface ResultsScreenProps {
  readonly view: ResultView;
  readonly bridge: UiBridge;
  readonly onRestart: () => void;
  readonly onMenu: () => void;
}

/** 结局文案。 */
function endingLabel(ending: EndingKind): string {
  switch (ending) {
    case 'complete':
      return '完成终曲';
    case 'empty-house':
      return '空场完成';
    case 'interrupted':
      return '中断 · 没有评级';
    default:
      return '散场';
  }
}

const LINE_LABELS: Readonly<Record<InstrumentLineId, string>> = {
  guitar: '吉他',
  bass: '贝斯',
  drums: '鼓',
};

/** 散场之后。 */
export function ResultsScreen({ view, bridge, onRestart, onMenu }: ResultsScreenProps): ReactElement {
  const run = useRunFlags(bridge);
  const ctx = emptyCopyContext();
  const maxZone = Math.max(1, ...ZONE_ORDER.map((zone) => view.zoneCounts[zone] ?? 0));
  const ratio = view.stats.converted + view.stats.burned;
  const convertShare = ratio === 0 ? 0 : Math.round((view.stats.converted / ratio) * 100);
  const lineBreaks = run.lineBreaks;
  const breakTotal = lineBreaks === undefined
    ? 0
    : (lineBreaks.guitar ?? 0) + (lineBreaks.bass ?? 0) + (lineBreaks.drums ?? 0);
  const breakText = lineBreaks === undefined
    ? ''
    : (Object.entries(lineBreaks) as readonly [InstrumentLineId, number][])
        .filter(([, count]) => count > 0)
        .map(([line, count]) => `${LINE_LABELS[line]} ${count} 次`)
        .join('、');
  const emptiestZone = ZONE_ORDER.reduce(
    (best, zone) => ((view.zoneCounts[zone] ?? 0) < (view.zoneCounts[best] ?? 0) ? zone : best),
    ZONE_ORDER[0] ?? 'front-left',
  );
  const emptiestCount = view.zoneCounts[emptiestZone] ?? 0;
  const emptiestText =
    emptiestCount === 0 && maxZone === 0
      ? '四区都已经空了。'
      : `${ZONE_LABELS[emptiestZone]}只剩 ${emptiestCount} 人，是四区里最少的。`;
  const reasons: readonly string[] = [
    `人气：峰值 ${view.stats.peakAudience}，终场 ${view.stats.finalAudience}；空位 ${view.emptySeats}，第二排空位 ${view.secondRowEmpty}。`,
    `空得最快：${emptiestText}`,
    `消耗：被覆盖 ${view.stats.covered} 人次，离场 ${view.stats.leftVenue} 人${
      breakTotal > 0 ? `；断线 ${breakTotal} 次（${breakText}）` : ''
    }。`,
  ];

  return (
    <ScreenShell
      title="散场之后"
      eyebrow={`${SONG_TITLE} · ${endingLabel(view.ending)}`}
      width="wide"
      footer={
        <div className="results__actions">
          <Button variant="primary" onClick={onRestart}>
            再演一场
          </Button>
          <Button variant="secondary" onClick={onMenu}>
            回主菜单
          </Button>
        </div>
      }
    >
      <div className="results">
        <section className="results__hero" aria-label="本场评价">
          <div className="results__hero-copy">
            <p className="ui-eyebrow">今晚的账</p>
            <p className="results__song">{SONG_TITLE}</p>
            <p className="results__ending">{endingLabel(view.ending)}</p>
            {view.ending === 'empty-house' ? <p className="results__empty-line">{EMPTY_HOUSE_LINE}</p> : null}
            <div className="results__best">
              {view.newBestAudience ? <span className="results__badge">峰值新纪录</span> : null}
              {view.newBestRank ? <span className="results__badge">评级新纪录</span> : null}
              {view.newBestAudience || view.newBestRank ? null : <span className="results__badge is-muted">本场记录</span>}
            </div>
          </div>
          {view.grade === null ? (
            <div className="stamp stamp--none" role="img" aria-label="中断，没有评级">
              <span className="stamp__letter" aria-hidden="true">
                —
              </span>
              <span className="stamp__label" aria-hidden="true">
                没有评级
              </span>
              <span className="stamp__rule" aria-hidden="true" />
            </div>
          ) : (
            <Stamp grade={view.grade} />
          )}
        </section>

        {view.ending === 'complete' ? null : (
          <section className="results__why" aria-labelledby="results-why-title">
            <h2 id="results-why-title" className="results__section-title">
              这一场为什么停在这里
            </h2>
            <ol className="results__reasons">
              {reasons.map((reason) => (
                <li key={reason} className="results__reason">
                  {reason}
                </li>
              ))}
            </ol>
          </section>
        )}

        <div className="results__columns">
          <section className="results__data" aria-labelledby="results-data-title">
            <h2 id="results-data-title" className="results__section-title">
              真实数据
            </h2>
            <p className="results__note">
              转化 / 被覆盖 / 离场为累计人次；空位按终场人数；第二排按四区各第二排（共 64 席）。
            </p>
            <dl className="results__stats">
              <div>
                <dt>峰值人气</dt>
                <dd>{view.stats.peakAudience}</dd>
              </div>
              <div>
                <dt>终场人气</dt>
                <dd>{view.stats.finalAudience}</dd>
              </div>
              <div>
                <dt>转化人次</dt>
                <dd>{view.stats.converted}</dd>
              </div>
              <div>
                <dt>烧死噪音</dt>
                <dd>{view.stats.burned}</dd>
              </div>
              <div>
                <dt>转化 / 烧死</dt>
                <dd>{ratio === 0 ? '—' : `${convertShare}%`}</dd>
              </div>
              <div>
                <dt>被覆盖人次</dt>
                <dd>{view.stats.covered}</dd>
              </div>
              <div>
                <dt>离场人次</dt>
                <dd>{view.stats.leftVenue}</dd>
              </div>
              <div>
                <dt>空位</dt>
                <dd>{view.emptySeats}</dd>
              </div>
              <div>
                <dt>第二排空位（四区）</dt>
                <dd>{view.secondRowEmpty}</dd>
              </div>
              <div>
                <dt>安可</dt>
                <dd>{view.stats.encoreUsed ? '已用' : '未用'}</dd>
              </div>
              <div>
                <dt>裂缝</dt>
                <dd>{view.stats.cracks}</dd>
              </div>
              <div>
                <dt>时长</dt>
                <dd>{formatTime(view.stats.duration)}</dd>
              </div>
            </dl>

            <h2 className="results__section-title">四区人数</h2>
            <ul className="results__zones" aria-label="四区人数分布">
              {ZONE_ORDER.map((zone) => {
                const count = view.zoneCounts[zone] ?? 0;
                return (
                  <li key={zone} className={`results__zone results__zone--${zone}`}>
                    <span className="results__zone-name">{ZONE_LABELS[zone]}</span>
                    <span className="results__zone-bar">
                      <span className="results__zone-fill" style={{ width: `${(count / maxZone) * 100}%` }} />
                    </span>
                    <span className="results__zone-count">{count}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="results__backstage" aria-labelledby="results-backstage-title">
            <h2 id="results-backstage-title" className="results__section-title">
              后台
            </h2>
            <ol className="results__lines">
              {view.backstageLines.map((line) => (
                <li key={line.id} className="results__line">
                  <span className="results__speaker">
                    {line.speaker === 'narrator' ? '旁白' : MEMBER_NAMES[line.speaker]}
                  </span>
                  <span className="results__text">{line.render(ctx)}</span>
                </li>
              ))}
            </ol>
            <p className="results__hint">这个数字会留在本机。下一次，换一条构筑试试。</p>
          </section>
        </div>
      </div>
    </ScreenShell>
  );
}
