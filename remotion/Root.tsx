import React from 'react'
import { Composition } from 'remotion'
import { AdOverlay } from './AdOverlay'
import type { AdOverlayProps, OverlayConfig } from './types'

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

const FPS = 30

// Dynamic duration from inputProps — renders the full timeline length
const calculateMetadata = ({ props }: { props: AdOverlayProps }) => {
  const duration = props.durationInSeconds || 10
  return {
    durationInFrames: Math.max(1, Math.round(duration * FPS)),
    fps: FPS,
  }
}

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 9:16 vertical ad (TikTok, Reels, Stories) */}
      <Composition
        id="AdOverlay"
        component={AdOverlayComp}
        durationInFrames={300}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{
          videoUrl: '',
          durationInSeconds: 10,
          overlayConfig: defaultOverlayConfig,
        }}
        calculateMetadata={calculateMetadata}
      />
      {/* 1:1 square ad (Feed) */}
      <Composition
        id="AdOverlaySquare"
        component={AdOverlayComp}
        durationInFrames={300}
        fps={FPS}
        width={1080}
        height={1080}
        defaultProps={{
          videoUrl: '',
          durationInSeconds: 10,
          overlayConfig: defaultOverlayConfig,
        }}
        calculateMetadata={calculateMetadata}
      />
      {/* 16:9 landscape ad (YouTube) */}
      <Composition
        id="AdOverlayLandscape"
        component={AdOverlayComp}
        durationInFrames={300}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{
          videoUrl: '',
          durationInSeconds: 10,
          overlayConfig: defaultOverlayConfig,
        }}
        calculateMetadata={calculateMetadata}
      />
    </>
  )
}
