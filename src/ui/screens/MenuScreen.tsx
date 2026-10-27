/** 主菜单：标题、四名成员剪影、五个入口、最佳记录与音量。 */

import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import type { ScreenId } from '../../types/ui';
import type { SettingsV1 } from '../../types/save';
import type { MenuView, SettingsView } from '../../types/ui';
import { Button } from '../components/Button';
import { MemberSilhouette } from '../components/MemberSilhouette';
import { Slider } from '../components/Field';
import {
  BAND_NAME,
  DESKTOP_HINT,
  GAME_TITLE,
  GAME_TITLE_EN,
  MEMBER_ROLES,
  SONG_TITLE,
  TAGLINE,
  VENUE_NAME,
} from '../copy';

export interface MenuScreenProps {
  readonly view: MenuView;
  readonly settingsView: SettingsView;
  readonly onStart: () => void;
  readonly onNavigate: (screen: ScreenId) => void;
  readonly onPatch: (patch: Partial<SettingsV1>) => void;
  readonly onToggleFullscreen: () => void;
}

/** 后台入口。 */
export function MenuScreen({
  view,
  settingsView,
  onStart,
  onNavigate,
  onPatch,
  onToggleFullscreen,
}: MenuScreenProps): ReactElement {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <section className="menu-screen" aria-labelledby="menu-title">
      <div className="menu-screen__glow" aria-hidden="true" />
      <div className="menu-screen__grid" aria-hidden="true" />

      <header className="menu-hero">
        <p className="menu-hero__band">{BAND_NAME}</p>
        <h1 id="menu-title" className="menu-hero__title" tabIndex={-1} ref={titleRef}>
          {GAME_TITLE}
        </h1>
        <p className="menu-hero__en">{GAME_TITLE_EN}</p>
        <p className="menu-hero__tagline">{TAGLINE}</p>
      </header>

      <div className="menu-layout">
        <nav className="menu-nav" aria-label="主菜单">
          <Button variant="primary" block className="menu-nav__start" onClick={onStart}>
            <span className="menu-nav__main">开始演出</span>
            <span className="menu-nav__sub">
              {SONG_TITLE} · {VENUE_NAME}
            </span>
          </Button>
          <Button variant="secondary" block onClick={() => onNavigate('setlist')}>
            今晚的曲目单
          </Button>
          <Button variant="secondary" block onClick={() => onNavigate('rehearsal')}>
            排练室
          </Button>
          <Button variant="secondary" block onClick={() => onNavigate('settings')}>
            设置
          </Button>
          <Button variant="secondary" block onClick={() => onNavigate('credits')}>
            制作名单
          </Button>
        </nav>

        <div className="menu-side">
          <ul className="menu-members" aria-label="乐队成员">
            {view.members.map((member) => (
              <li key={member.id} className="menu-member">
                <MemberSilhouette id={member.id} colorToken={member.colorToken} className="menu-member__silhouette" />
                <span className="menu-member__name">{member.name}</span>
                <span className="menu-member__role">{MEMBER_ROLES[member.id]}</span>
              </li>
            ))}
          </ul>

          <div className="menu-record" aria-label="最佳记录">
            <p className="ui-eyebrow">散场之后 · 最佳</p>
            <dl className="menu-record__grid">
              <div>
                <dt>峰值人气</dt>
                <dd>{view.best.audience}</dd>
              </div>
              <div>
                <dt>最长一场</dt>
                <dd>{view.best.time}</dd>
              </div>
              <div>
                <dt>评级</dt>
                <dd>{view.best.rank}</dd>
              </div>
              <div>
                <dt>完成终曲</dt>
                <dd>{view.best.clears}</dd>
              </div>
            </dl>
            {view.canStart ? null : <p className="menu-record__lock">声音还没解锁。</p>}
          </div>
        </div>
      </div>

      <footer className="menu-foot">
        <div className="menu-foot__volume">
          <Slider
            label="主音量"
            value={settingsView.settings.master}
            format={(value) => `${Math.round(value * 100)}%`}
            onChange={(value) => onPatch({ master: value })}
          />
        </div>
        <div className="menu-foot__actions">
          <Button variant="ghost" onClick={onToggleFullscreen}>
            全屏 / 窗口
          </Button>
          <span className="menu-foot__hint">{DESKTOP_HINT}</span>
        </div>
      </footer>
    </section>
  );
}
