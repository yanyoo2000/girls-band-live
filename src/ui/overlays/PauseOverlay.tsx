/** 暂停面板：继续 / 重新开始 / 设置 / 回主菜单 + 当前构筑。 */

import type { ReactElement } from 'react';
import type { PauseView } from '../../types/ui';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { BUILD_LABELS } from '../copy';

export interface PauseOverlayProps {
  readonly view: PauseView;
  readonly onResume: () => void;
  readonly onRestart: () => void;
  readonly onSettings: () => void;
  readonly onQuit: () => void;
}

/** 暂停弹层。 */
export function PauseOverlay({ view, onResume, onRestart, onSettings, onQuit }: PauseOverlayProps): ReactElement {
  return (
    <Dialog label="暂停面板" size="md" describedBy="pause-summary">
      <header className="dialog__head">
        <p className="ui-eyebrow">演出暂停</p>
        <h2 className="dialog__title">先喘一口气</h2>
        <p id="pause-summary" className="dialog__sub">
          停在 {view.elapsed} · {view.segmentName}
          {view.coreName === null ? '' : ` · ${view.coreName}`}
        </p>
      </header>

      <section className="pause-build" aria-labelledby="pause-build-title">
        <h3 id="pause-build-title" className="pause-build__title">
          当前构筑
        </h3>
        {view.cards.length === 0 ? (
          <p className="pause-build__empty">还没有拿到卡。第一次升级会先选核心。</p>
        ) : (
          <ul className="pause-build__cards">
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
      </section>

      <div className="dialog__actions dialog__actions--stack">
        <Button variant="primary" data-autofocus="true" onClick={onResume}>
          继续演出
        </Button>
        <Button variant="secondary" onClick={onRestart} disabled={!view.canRestart}>
          重新开始
        </Button>
        <Button variant="secondary" onClick={onSettings}>
          设置
        </Button>
        <Button variant="danger" onClick={onQuit}>
          回主菜单
        </Button>
      </div>

      <p className="dialog__hint">Tab 查看构筑 · Esc 继续 · 设置与回主菜单都会先暂停。</p>
    </Dialog>
  );
}
