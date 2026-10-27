/** 设置面板（设置屏与暂停弹层共用）。 */

import type { ReactElement } from 'react';
import type { SettingsV1 } from '../../types/save';
import type { SettingsView } from '../../types/ui';
import { Button } from './Button';
import { Segmented, Slider, Toggle } from './Field';

export interface SettingsPanelProps {
  readonly view: SettingsView;
  readonly onPatch: (patch: Partial<SettingsV1>) => void;
  readonly onToggleFullscreen?: () => void;
}

/** 百分比格式。 */
function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** 设置项：立即生效并写入存档（bridge 防抖 250ms）。 */
export function SettingsPanel({ view, onPatch, onToggleFullscreen }: SettingsPanelProps): ReactElement {
  const { settings, audioUnlocked } = view;
  return (
    <div className="settings-panel">
      <section className="settings-section" aria-labelledby="settings-audio">
        <header className="settings-section__head">
          <h2 id="settings-audio" className="settings-section__title">
            声音
          </h2>
          <p className="settings-section__note">{audioUnlocked ? '声音已解锁' : '首次点击后解锁声音'}</p>
        </header>
        <Slider label="主音量" value={settings.master} format={percent} onChange={(value) => onPatch({ master: value })} />
        <Slider label="音乐" value={settings.music} format={percent} onChange={(value) => onPatch({ music: value })} />
        <Slider label="音效" value={settings.sfx} format={percent} onChange={(value) => onPatch({ sfx: value })} />
      </section>

      <section className="settings-section" aria-labelledby="settings-video">
        <header className="settings-section__head">
          <h2 id="settings-video" className="settings-section__title">
            画面与可读性
          </h2>
          <p className="settings-section__note">全部立即生效，并写入本机存档。</p>
        </header>
        <Segmented
          label="画质"
          value={settings.quality}
          options={[
            { value: 'high', label: '高', hint: 'DPR 1.5，粒子全开' },
            { value: 'low', label: '低', hint: 'DPR 1.0，粒子减半' },
          ]}
          onChange={(value) => onPatch({ quality: value === 'low' ? 'low' : 'high' })}
        />
        <div className="settings-grid">
          <Toggle
            label="减少动态"
            checked={settings.reducedMotion}
            hint="关屏震、光锥脉动、人浪起伏减半"
            onChange={(checked) => onPatch({ reducedMotion: checked })}
          />
          <Toggle
            label="高对比"
            checked={settings.highContrast}
            hint="描边 2px、背景更暗、四区加形状"
            onChange={(checked) => onPatch({ highContrast: checked })}
          />
          <Toggle
            label="节拍脉冲"
            checked={settings.beatPulse}
            hint="舞台脚下拍点脉动；关声仍可玩"
            onChange={(checked) => onPatch({ beatPulse: checked })}
          />
          <Toggle
            label="低闪"
            checked={settings.lowFlash}
            hint="全屏白闪 1 帧、不超过 3Hz"
            onChange={(checked) => onPatch({ lowFlash: checked })}
          />
        </div>
        {onToggleFullscreen === undefined ? null : (
          <div className="settings-actions">
            <Button variant="ghost" onClick={onToggleFullscreen}>
              切换全屏
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
