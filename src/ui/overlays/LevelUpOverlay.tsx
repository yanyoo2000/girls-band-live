/** 升级三选一：冻结模拟，不可重抽（P0）。 */

import type { KeyboardEvent, ReactElement } from 'react';
import type { CardId } from '../../types/game';
import type { LevelUpView } from '../../types/ui';
import { CardPedal } from '../components/CardPedal';
import { Dialog } from '../components/Dialog';
import { BUILD_LABELS } from '../copy';

export interface LevelUpOverlayProps {
  readonly view: LevelUpView;
  readonly onChoose: (cardId: CardId) => void;
}

/** 三张效果器踏板。 */
export function LevelUpOverlay({ view, onChoose }: LevelUpOverlayProps): ReactElement {
  const buildName = view.build.build === null ? null : BUILD_LABELS[view.build.build];

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const index = Number(event.key) - 1;
    if (!Number.isInteger(index) || index < 0 || index > 2) {
      return;
    }
    const card = view.cards[index];
    if (card !== undefined) {
      event.preventDefault();
      onChoose(card.id);
    }
  };

  return (
    <Dialog label="升级选择" size="lg" describedBy="levelup-summary">
      <header className="dialog__head">
        <p className="ui-eyebrow">
          第 {view.build.picks + 1} / {view.build.maxPicks} 次选择
        </p>
        <h2 className="dialog__title">选一张，今晚就按这个弹</h2>
        <p id="levelup-summary" className="dialog__sub">
          {view.build.coreName === null ? '先选核心，今夜的路就定了。' : `核心：${view.build.coreName}`}
          {buildName === null ? '' : ` · ${buildName}`}
          {view.build.evolutionName === null ? '' : ` · 进化：${view.build.evolutionName}`}
        </p>
      </header>

      <div className="levelup" onKeyDown={onKeyDown}>
        {view.cards.map((card, index) => (
          <CardPedal key={card.id} card={card} index={index} onChoose={onChoose} />
        ))}
      </div>

      <p className="dialog__hint">不能重抽。按 1 / 2 / 3 也可以选；Esc 不会跳过这一次选择。</p>
    </Dialog>
  );
}
