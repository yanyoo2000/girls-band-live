/** 暂停中的设置弹层：与设置屏共用面板。 */

import type { ReactElement } from 'react';
import type { SettingsV1 } from '../../types/save';
import type { SettingsView } from '../../types/ui';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { SettingsPanel } from '../components/SettingsPanel';

export interface SettingsOverlayProps {
  readonly view: SettingsView;
  readonly onPatch: (patch: Partial<SettingsV1>) => void;
  readonly onBack: () => void;
  readonly onToggleFullscreen: () => void;
}

/** 设置弹层。 */
export function SettingsOverlay({ view, onPatch, onBack, onToggleFullscreen }: SettingsOverlayProps): ReactElement {
  return (
    <Dialog label="设置面板" size="md">
      <header className="dialog__head">
        <p className="ui-eyebrow">暂停中</p>
        <h2 className="dialog__title">设置</h2>
        <p className="dialog__sub">改动会立即生效，并写回本机存档。</p>
      </header>
      <SettingsPanel view={view} onPatch={onPatch} onToggleFullscreen={onToggleFullscreen} />
      <div className="dialog__actions">
        <Button variant="primary" onClick={onBack}>
          返回暂停
        </Button>
      </div>
    </Dialog>
  );
}
