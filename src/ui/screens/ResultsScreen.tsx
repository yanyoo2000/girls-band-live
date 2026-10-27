/** 结算：后台清单、真实数据、评级、四句成员短句（允许数字）。 */

import type { ReactElement } from 'react';
import type { EndingKind } from '../../types/game';
import type { ResultView } from '../../types/ui';
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

export interface ResultsScreenProps {
  readonly view: ResultView;
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

/** 散场之后。 */
export function ResultsScreen({ view, onRestart, onMenu }: ResultsScreenProps): ReactElement {
  const ctx = emptyCopyContext();
  const maxZone = Math.max(1, ...ZONE_ORDER.map((zone) => view.zoneCounts[zone] ?? 0));
  const ratio = view.stats.converted + view.stats.burned;
  const convertShare = ratio === 0 ? 0 : Math.round((view.stats.converted / ratio) * 100);

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

        <div className="results__columns">
          <section className="results__data" aria-labelledby="results-data-title">
            <h2 id="results-data-title" className="results__section-title">
              真实数据
            </h2>
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
                <dt>转化人数</dt>
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
                <dt>离场</dt>
                <dd>{view.stats.leftVenue}</dd>
              </div>
              <div>
                <dt>空位</dt>
                <dd>{view.emptySeats}</dd>
              </div>
              <div>
                <dt>第二排空位</dt>
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
