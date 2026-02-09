import React from 'react'
import { Composition } from 'remotion'
import { AdOverlay } from './AdOverlay'
import type { OverlayConfig } from './types'

// Default overlay config for Remotion Studio preview
const defaultOverlayConfig: OverlayConfig = {
  style: 'capcut',
  hook: {
    line1: 'This product changed my life',
    line2: "Here's why...",
    line2Color: '#10B981',
    startSec: 0,
    endSec: 3,
    animation: 'pop',
  },
  captions: [
    { text: 'I started using this 3 months ago', startSec: 3, endSec: 5.5 },
    { text: 'And the results speak for themselves', startSec: 5.5, endSec: 8, highlight: true, highlightWord: 'results' },
  ],
  cta: {
    buttonText: 'SHOP NOW',
    brandName: 'Your Brand',
    startSec: 8,
    animation: 'pop',
  },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AdOverlayComp = AdOverlay as any

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 9:16 vertical ad (TikTok, Reels, Stories) */}
      <Composition
        id="AdOverlay"
        component={AdOverlayComp}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          videoUrl: '',
          durationInSeconds: 10,
          overlayConfig: defaultOverlayConfig,
        }}
      />
      {/* 1:1 square ad (Feed) */}
      <Composition
        id="AdOverlaySquare"
        component={AdOverlayComp}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1080}
        defaultProps={{
          videoUrl: '',
          durationInSeconds: 10,
          overlayConfig: defaultOverlayConfig,
        }}
      />
      {/* 16:9 landscape ad (YouTube) */}
      <Composition
        id="AdOverlayLandscape"
        component={AdOverlayComp}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          videoUrl: '',
          durationInSeconds: 10,
          overlayConfig: defaultOverlayConfig,
        }}
      />
    </>
  )
}
