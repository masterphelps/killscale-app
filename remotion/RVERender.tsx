/**
 * RVERender — Export-only composition that uses the SAME Layer components
 * as the editor preview. This guarantees rendered output matches what
 * the user sees in the editor.
 *
 * Unlike AdOverlay.tsx (which was a separate reimplementation), this
 * composition delegates ALL rendering to RVE's Layer/LayerContent pipeline.
 *
 * The OverlayConfig → Overlay[] conversion happens SERVER-SIDE in the
 * render API route (using overlayConfigToRVEOverlays from rve-bridge.ts).
 * This composition receives pre-converted overlays as inputProps.
 */

import React from 'react'
import { AbsoluteFill } from 'remotion'
import { Layer } from '../lib/rve/utils/remotion/layer'
import type { Overlay } from '../lib/rve/types'

export type RVERenderProps = {
  /** Pre-converted RVE overlays (converted server-side via overlayConfigToRVEOverlays) */
  overlays: Overlay[]
  /** Duration in seconds (used by calculateMetadata for composition length) */
  durationInSeconds: number
}

const layerContainer: React.CSSProperties = {
  overflow: 'hidden',
  maxWidth: '3000px',
}

export const RVERender: React.FC<RVERenderProps> = ({ overlays }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: 'transparent' }}>
      <AbsoluteFill style={layerContainer}>
        {overlays.map((overlay) => (
          <Layer key={overlay.id} overlay={overlay} />
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
