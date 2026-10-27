/** 升级卡：效果器踏板造型（3 旋钮 + 效果 + 代价 + 构筑色条）。 */

import type { ReactElement } from 'react';
import type { CardDef } from '../../types/data';
import type { CardId } from '../../types/game';

export interface CardPedalProps {
  readonly card: CardDef;
  readonly index: number;
  readonly onChoose: (cardId: CardId) => void;
  readonly disabled?: boolean;
}

/** 构筑 → 踏板主色 class。 */
function buildClass(card: CardDef): string {
  switch (card.build) {
    case 'choir':
      return 'is-choir';
    case 'solo':
      return 'is-solo';
    case 'bait':
      return 'is-bait';
    default:
      return 'is-generic';
  }
}

/** 单张升级卡（键盘：Tab 聚焦，Enter/Space 选择；1/2/3 由父级处理）。 */
export function CardPedal({ card, index, onChoose, disabled = false }: CardPedalProps): ReactElement {
  const category = card.category === 'core' ? '核心' : card.category === 'support' ? '支援' : '通用';
  return (
    <button
      type="button"
      className={`card-pedal ${buildClass(card)}`}
      onClick={() => onChoose(card.id)}
      disabled={disabled}
      aria-label={`${card.name}，${category}。${card.description}${card.cost === null ? '' : ` 代价：${card.cost}`}`}
      data-card-id={card.id}
    >
      <span className="card-pedal__top">
        <span className="card-pedal__index" aria-hidden="true">
          {index + 1}
        </span>
        <span className="card-pedal__category">{category}</span>
        {card.evolution === null ? null : <span className="card-pedal__evo">进化钥匙</span>}
      </span>
      <span className="card-pedal__knobs" aria-hidden="true">
        <span className="card-pedal__knob" />
        <span className="card-pedal__knob" />
        <span className="card-pedal__knob" />
      </span>
      <span className="card-pedal__name">{card.name}</span>
      <span className="card-pedal__effect">{card.description}</span>
      <span className={`card-pedal__cost ${card.cost === null ? 'is-none' : ''}`}>
        {card.cost === null ? '没有代价' : `代价：${card.cost}`}
      </span>
      <span className="card-pedal__led" aria-hidden="true" />
    </button>
  );
}
