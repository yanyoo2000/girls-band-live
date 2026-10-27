/** 今晚的曲目单：上一局真实数据驱动的四行后台笔迹（只读）。 */

import type { ReactElement } from 'react';
import type { SetlistView } from '../../types/ui';
import { ScreenShell } from '../components/ScreenShell';
import { emptyCopyContext, MEMBER_NAMES, SONG_TITLE, VENUE_NAME } from '../copy';

export interface SetlistScreenProps {
  readonly view: SetlistView;
  readonly onBack: () => void;
}

/** 后台曲目单：纸、笔迹、四名成员各一句。 */
export function SetlistScreen({ view, onBack }: SetlistScreenProps): ReactElement {
  const ctx = emptyCopyContext();
  return (
    <ScreenShell
      title="今晚的曲目单"
      eyebrow={`${VENUE_NAME} · ${SONG_TITLE}`}
      onBack={onBack}
      backLabel="回后台"
      width="narrow"
      footer={<p className="setlist__note">这张纸只写上一场发生的事。它不会替你选歌。</p>}
    >
      <article className="setlist" aria-label="后台曲目单">
        <header className="setlist__head">
          <span className="setlist__stamp" aria-hidden="true">
            留声
          </span>
          <p className="setlist__title">{SONG_TITLE}</p>
          <p className="setlist__venue">{VENUE_NAME}</p>
        </header>
        {view.hasPreviousRun ? null : (
          <p className="setlist__empty">上一场还没有发生。今晚是新的第一页。</p>
        )}
        <ol className="setlist__lines">
          {view.lines.map((line, index) => (
            <li key={line.id} className={`setlist__line setlist__line--${index % 2 === 0 ? 'a' : 'b'}`}>
              <span className="setlist__speaker">
                {line.speaker === 'narrator' ? '旁白' : MEMBER_NAMES[line.speaker]}
              </span>
              <span className="setlist__text">{line.render(ctx)}</span>
            </li>
          ))}
        </ol>
        <footer className="setlist__sign" aria-hidden="true">
          <span>留声 · 演出后</span>
        </footer>
      </article>
    </ScreenShell>
  );
}
