/** 制作名单：团队角色列表 + 零外部素材声明。 */

import type { ReactElement } from 'react';
import type { CreditsView } from '../../types/ui';
import { ScreenShell } from '../components/ScreenShell';
import { BAND_NAME, GAME_TITLE } from '../copy';

export interface CreditsScreenProps {
  readonly view: CreditsView;
  readonly onBack: () => void;
}

/** 制作名单。 */
export function CreditsScreen({ view, onBack }: CreditsScreenProps): ReactElement {
  return (
    <ScreenShell
      title="制作名单"
      eyebrow={`${GAME_TITLE} · ${BAND_NAME}`}
      onBack={onBack}
      backLabel="回后台"
      width="narrow"
      footer={<p className="credits__thanks">谢谢你听完这一场。</p>}
    >
      <div className="credits">
        {view.roles.map((role) => (
          <section key={role.role} className="credits__role" aria-labelledby={`credits-${role.role}`}>
            <h2 id={`credits-${role.role}`} className="credits__role-name">
              {role.role}
            </h2>
            <ul className="credits__members">
              {role.members.map((member) => (
                <li key={member}>{member}</li>
              ))}
            </ul>
          </section>
        ))}
        <p className="credits__notice">{view.notice}</p>
      </div>
    </ScreenShell>
  );
}
