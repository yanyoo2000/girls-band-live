/** 启动屏：<2s 进入，首次点击解锁 AudioContext。 */
import type { KeyboardEvent, ReactElement } from 'react';
import { Button } from '../components/Button';
import { BAND_NAME, DESKTOP_HINT, GAME_TITLE, GAME_TITLE_EN, TAGLINE } from '../copy';

export interface BootScreenProps {
  readonly audioUnlocked: boolean;
  readonly onStart: () => void;
}

/** 黑底、标题与一次点击。 */
export function BootScreen({ audioUnlocked, onStart }: BootScreenProps): ReactElement {
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Tab') return;
    // 启动屏只有一个主操作：Tab 不跑到浏览器 chrome / 文档末尾。
    const button = event.currentTarget.querySelector<HTMLButtonElement>('button:not([disabled])');
    event.preventDefault();
    button?.focus();
  };

  return (
    <section className="boot" aria-label="启动" onKeyDown={onKeyDown}>
      <div className="boot__lamp" aria-hidden="true" />
      <div className="boot__inner">
        <p className="boot__band">{BAND_NAME}</p>
        <h1 className="boot__title">{GAME_TITLE}</h1>
        <p className="boot__title-en">{GAME_TITLE_EN}</p>
        <p className="boot__tagline">{TAGLINE}</p>
        <div className="boot__start">
          <Button variant="primary" autoFocus onClick={onStart}>
            {audioUnlocked ? '进入后台' : '点击开始'}
          </Button>
          <p className="boot__note">{audioUnlocked ? '声音已解锁。' : '第一次点击会解锁声音。'}</p>
        </div>
        <p className="boot__hint">{DESKTOP_HINT}</p>
      </div>
      <div className="boot__floor" aria-hidden="true" />
    </section>
  );
}
