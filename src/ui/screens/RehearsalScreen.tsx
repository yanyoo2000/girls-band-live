/** 排练室：三页玩法说明（无长教程、可跳过）。 */

import { useState } from 'react';
import type { ReactElement } from 'react';
import type { RehearsalView } from '../../types/ui';
import { Button } from '../components/Button';
import { Diagram } from '../components/Diagram';
import { ScreenShell } from '../components/ScreenShell';

export interface RehearsalScreenProps {
  readonly view: RehearsalView;
  readonly onBack: () => void;
}

/** 三页说明：走位与光 / 烧与唱化 / 危险与返听。 */
export function RehearsalScreen({ view, onBack }: RehearsalScreenProps): ReactElement {
  const [page, setPage] = useState<number>(view.current);
  const total = view.pages.length;
  const safePage = Math.max(0, Math.min(total - 1, page));
  const current = view.pages[safePage];
  const isLast = safePage >= total - 1;

  return (
    <ScreenShell
      title="排练室"
      eyebrow="开演前，只讲三页"
      onBack={onBack}
      backLabel="回后台"
      width="wide"
      footer={
        <div className="rehearsal-nav">
          <Button variant="ghost" disabled={safePage === 0} onClick={() => setPage(Math.max(0, safePage - 1))}>
            上一页
          </Button>
          <ol className="rehearsal-nav__dots" aria-label="排练室页数">
            {view.pages.map((item, index) => (
              <li key={item.title} className={index === safePage ? 'is-current' : ''}>
                <button
                  type="button"
                  className="rehearsal-nav__dot"
                  aria-label={`第 ${index + 1} 页：${item.title}`}
                  aria-current={index === safePage ? 'step' : undefined}
                  onClick={() => setPage(index)}
                />
              </li>
            ))}
          </ol>
          <Button
            variant={isLast ? 'primary' : 'secondary'}
            onClick={() => {
              if (isLast) {
                onBack();
              } else {
                setPage(Math.min(total - 1, safePage + 1));
              }
            }}
          >
            {isLast ? '看完了，回后台' : '下一页'}
          </Button>
        </div>
      }
    >
      {current === undefined ? null : (
        <div className="rehearsal">
          <div className="rehearsal__diagram">
            <Diagram kind={current.diagram} />
          </div>
          <div className="rehearsal__copy">
            <p className="ui-eyebrow">
              第 {safePage + 1} / {total} 页
            </p>
            <h2 className="rehearsal__title">{current.title}</h2>
            <ul className="rehearsal__body">
              {current.body.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="rehearsal__skip">不想看可以跳过：这些规则在暂停面板里也能查到。</p>
          </div>
        </div>
      )}
    </ScreenShell>
  );
}
