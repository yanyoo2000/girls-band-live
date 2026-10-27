/** 演出屏：HUD + 中断选择（安可 / 继续独奏）。 */

import type { ReactElement } from 'react';
import type { OverlayKind, UiBridge } from '../../types/ui';
import { Hud } from '../components/Hud';
import { useHud, useRunFlags } from '../hooks';
import { InterruptOverlay } from '../overlays/InterruptOverlay';

export interface PlayingScreenProps {
  readonly bridge: UiBridge;
  readonly overlay: OverlayKind;
}

/** 演出屏只读快照；HUD 10Hz，不碰 Three。 */
export function PlayingScreen({ bridge, overlay }: PlayingScreenProps): ReactElement {
  const hud = useHud(bridge);
  const run = useRunFlags(bridge);
  const showInterrupt = run.interruptPending && overlay === 'none';

  return (
    <div className="playing" aria-hidden={overlay !== 'none'}>
      <Hud
        hud={hud}
        run={run}
        onPause={() => bridge.dispatch({ type: 'open-overlay', overlay: 'pause' })}
        onSkipEmptyHouse={() => bridge.dispatch({ type: 'skip-empty-house' })}
      />
      {showInterrupt ? (
        <InterruptOverlay
          onEncore={() => bridge.dispatch({ type: 'encore' })}
          onContinueSolo={() => bridge.dispatch({ type: 'continue-solo' })}
        />
      ) : null}
    </div>
  );
}
