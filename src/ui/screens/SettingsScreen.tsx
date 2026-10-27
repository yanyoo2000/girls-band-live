/** 设置屏：声音、画质、减少动态、高对比、节拍脉冲、低闪。 */

import type { ReactElement } from 'react';
import type { SettingsV1 } from '../../types/save';
import type { SettingsView } from '../../types/ui';
import { ScreenShell } from '../components/ScreenShell';
import { SettingsPanel } from '../components/SettingsPanel';

export interface SettingsScreenProps {
  readonly view: SettingsView;
  readonly onPatch: (patch: Partial<SettingsV1>) => void;
  readonly onBack: () => void;
  readonly onToggleFullscreen: () => void;
}

/** 设置屏。 */
export function SettingsScreen({ view, onPatch, onBack, onToggleFullscreen }: SettingsScreenProps): ReactElement {
  return (
    <ScreenShell
      title="设置"
      eyebrow="调音台 · 立即生效"
      onBack={onBack}
      backLabel="回后台"
      width="narrow"
      footer={<p className="settings-foot">设置写入本机 `gbl.save.v1`；局内进度不会保存。</p>}
    >
      <SettingsPanel view={view} onPatch={onPatch} onToggleFullscreen={onToggleFullscreen} />
    </ScreenShell>
  );
}
