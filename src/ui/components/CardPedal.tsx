/** 升级卡：效果 + 代价 + 构筑色条 + 进化进度（v1.0.1 删除无标签旋钮）。 */

import type { ReactElement } from 'react';
import type { CardDef } from '../../types/data';
import type { CardId } from '../../types/game';
import type { EvolutionCardHint } from '../bridge';

export interface CardPedalProps {
  readonly card: CardDef;
  readonly index: number;
  readonly onChoose: (cardId: CardId) => void;
  readonly disabled?: boolean;
  readonly evolutionHint?: EvolutionCardHint;
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
export function CardPedal({
  card,
  index,
  onChoose,
  disabled = false,
  evolutionHint,
}: CardPedalProps): ReactElement {
  const category = card.category === 'core' ? '核心' : card.category === 'support' ? '支援' : '通用';
  const hint =
    evolutionHint === undefined
      ? null
      : evolutionHint.kind === 'core'
        ? `开启进化：${evolutionHint.name} · 选它后还需 ${evolutionHint.missing} 张支援`
        : evolutionHint.kind === 'locked'
          ? `进化：${evolutionHint.name} · 先选核心`
          : evolutionHint.kind === 'ready'
            ? `进化：${evolutionHint.name} · 已满足，选它即进化`
            : `进化：${evolutionHint.name} · 还需 ${evolutionHint.missing} 张支援`;
  return (
    <button
      type="button"
      className={`card-pedal ${buildClass(card)}`}
      onClick={() => onChoose(card.id)}
      disabled={disabled}
      title={card.description}
      aria-label={`${card.name}，${category}。${card.description}${card.cost === null ? '' : ` 代价：${card.cost}`}${
        hint === null ? '' : ` ${hint}`
      }`}
      data-card-id={card.id}
    >
      <span className="card-pedal__top">
        <span className="card-pedal__index" aria-hidden="true">
          {index + 1}
        </span>
        <span className="card-pedal__category">{category}</span>
        {card.evolution === null ? null : <span className="card-pedal__evo">进化钥匙</span>}
      </span>
      <span className="card-pedal__name">{card.name}</span>
      <span className="card-pedal__effect">{card.description}</span>
      <span className={`card-pedal__cost ${card.cost === null ? 'is-none' : ''}`}>
        {card.cost === null ? '没有代价' : `代价：${card.cost}`}
      </span>
      {hint === null ? null : <span className="card-pedal__evolution">{hint}</span>}
      <span className="card-pedal__led" aria-hidden="true" />
    </button>
  );
}
