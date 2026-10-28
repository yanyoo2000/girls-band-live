/** 小窗口提示：不锁死；可继续（紧凑布局）或回主菜单；Esc 关闭。 */

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

export interface ViewportGateProps {
  readonly onMenu: () => void;
}

const MIN_WIDTH = 1024;
const MIN_HEIGHT = 640;

function tooSmall(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.innerWidth < MIN_WIDTH || window.innerHeight < MIN_HEIGHT;
}

/** <1024×640 时给出键盘出口；"仍然继续"后使用紧凑布局。 */
export function ViewportGate({ onMenu }: ViewportGateProps): ReactElement | null {
  const [small, setSmall] = useState<boolean>(() => tooSmall());
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onResize = (): void => setSmall(tooSmall());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!small || dismissed) {
      return;
    }
    const root = document.documentElement;
    root.dataset.viewportGate = 'true';
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setDismissed(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      delete root.dataset.viewportGate;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [small, dismissed]);

  if (!small || dismissed) {
    return null;
  }

  return (
    <Dialog label="窗口太小" size="sm" describedBy="viewport-gate-desc">
      <header className="dialog__head">
        <p className="ui-eyebrow">桌面布局提示</p>
        <h2 className="dialog__title">窗口太小了</h2>
        <p id="viewport-gate-desc" className="dialog__sub">
          本作按桌面 1024×640 以上设计。你仍然可以继续（界面会紧凑、可能拥挤），
          也可以先回主菜单放大窗口。按 Esc 直接继续。
        </p>
      </header>
      <div className="dialog__actions dialog__actions--stack">
        <Button variant="primary" data-autofocus="true" onClick={() => setDismissed(true)}>
          仍然继续（可能看不清）
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setDismissed(true);
            onMenu();
          }}
        >
          回主菜单
        </Button>
      </div>
      <p className="dialog__hint">缩放 150–200% 时也走这个提示；继续后各行仍可 Tab 操作。</p>
    </Dialog>
  );
}
