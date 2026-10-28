/** 暂停面板：继续 / 重新开始 / 设置 / 回主菜单 + 当前构筑（与 HUD 同源）。 */

import type { ReactElement } from 'react';
import type { PauseView, UiBridge } from '../../types/ui';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { BUILD_LABELS } from '../copy';
import { useRunFlags } from '../hooks';

export interface PauseOverlayProps {
  readonly view: PauseView;
  readonly bridge: UiBridge;
  readonly onResume: () => void;
  readonly onRestart: () => void;
  readonly onSettings: () => void;
  readonly onQuit: () => void;
}

/** 暂停弹层。 */
export function PauseOverlay({ view, bridge, onResume, onRestart, onSettings, onQuit }: PauseOverlayProps): ReactElement {
  const run = useRunFlags(bridge);
  const coreCard = view.cards.find((card) => card.category === 'core') ?? null;
  return (
    <Dialog label="暂停面板" size="md" describedBy="pause-summary">
      <header className="dialog__head">
        <p className="ui-eyebrow">{run.emptyHouse ? '空场暂停' : '演出暂停'}</p>
        <h2 className="dialog__title">先喘一口气</h2>
        <p id="pause-summary" className="dialog__sub">
          停在 {view.elapsed} · {view.segmentName}
          {view.coreName === null ? '' : ` · ${view.coreName}`}
        </p>
      </header>

      <section
        className="pause-build"
        aria-labelledby="pause-build-title"
        data-pause-build="true"
        tabIndex={-1}
      >
        <h3 id="pause-build-title" className="pause-build__title">
          当前构筑
        </h3>
        {view.cards.length === 0 && view.coreName === null ? (
          <p className="pause-build__empty">还没有拿到卡。第一次升级会先选核心。</p>
        ) : (
          <ul className="pause-build__cards">
            {view.coreName === null || coreCard !== null ? null : (
              <li className="pause-build__card is-core">
                <span className="pause-build__card-name">{view.coreName}</span>
                <span className="pause-build__card-kind">核心</span>
              </li>
            )}
            {view.cards.map((card) => (
              <li
                key={card.id}
                className={`pause-build__card ${card.category === 'core' ? 'is-core' : ''} ${
                  card.build === null ? 'is-generic' : `is-${card.build}`
                }`}
              >
                <span className="pause-build__card-name">{card.name}</span>
                <span className="pause-build__card-kind">
                  {card.category === 'core'
                    ? '核心'
                    : card.build === null
                      ? '通用'
                      : BUILD_LABELS[card.build]}
                </span>
              </li>
            ))}
          </ul>
        )}
        {run.evolutionName === undefined || run.evolutionName === null ? null : (
          <p className="pause-build__evolution">本局进化：{run.evolutionName}</p>
        )}
        <p className="pause-build__hint">与 HUD 底部构筑条同源：核心、最近卡、转化/烧死记账。</p>
      </section>

      <div className="dialog__actions dialog__actions--stack">
        <Button variant="primary" data-autofocus="true" onClick={onResume}>
          {run.emptyHouse ? '回到空场' : '继续演出'}
        </Button>
        <Button variant="secondary" onClick={onRestart} disabled={!view.canRestart}>
          重新开始
        </Button>
        <Button variant="secondary" data-pause-settings="true" onClick={onSettings}>
          设置
        </Button>
        <Button variant="danger" onClick={onQuit}>
          回主菜单
        </Button>
      </div>

      <p className="dialog__hint">Tab 打开构筑并聚焦此处 · Esc 继续 · 设置与回主菜单都会先暂停。</p>
    </Dialog>
  );
}
