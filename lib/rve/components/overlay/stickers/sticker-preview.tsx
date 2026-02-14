import React, { memo, useCallback, useRef } from "react";
import { Player } from "@remotion/player";
import { Sequence } from "remotion";
import { OverlayType, StickerCategory } from "../../../types";

// Wrapper component for sticker preview with static frame
const StickerPreview = memo(
  ({ template, onClick }: { template: any; onClick: () => void }) => {
    const playerRef = useRef<any>(null);
    const { Component } = template;

    const stickerDuration =
      template.config.defaultProps?.durationInFrames || 100;

    const previewProps = {
      overlay: {
        id: -1,
        type: OverlayType.STICKER,
        content: template.config.id,
        category: template.config.category as StickerCategory,
        durationInFrames: stickerDuration,
        from: 0,
        height: 100,
        width: 200,
        left: 0,
        top: 0,
        row: 0,
        isDragging: false,
        rotation: 0,
        styles: {
          opacity: 1,
          ...template.config.defaultProps?.styles,
        },
      },
      isSelected: false,
      ...template.config.defaultProps,
    };

    const MemoizedComponent = memo(Component);

    const PreviewComponent = () => (
      <Sequence from={0} durationInFrames={stickerDuration}>
        <MemoizedComponent {...previewProps} />
      </Sequence>
    );

    const handleMouseEnter = useCallback(() => {
      if (playerRef.current) {
        playerRef.current.seekTo(0);
        playerRef.current.play();
      }
    }, []);

    const handleMouseLeave = useCallback(() => {
      if (playerRef.current) {
        playerRef.current.pause();
        playerRef.current.seekTo(15);
      }
    }, []);

    return (
      <button
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`
          group relative w-full h-full
          rounded-lg bg-muted/40
          border border-border
          hover:border-secondary
          hover:bg-accent/30
          transition-all duration-200 overflow-hidden
          ${template.config.isPro ? "relative" : ""}
        `}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <Player
            ref={playerRef}
            component={PreviewComponent}
            durationInFrames={stickerDuration}
            compositionWidth={template.config.layout === "double" ? 280 : 140}
            compositionHeight={140}
            fps={30}
            initialFrame={15}
            acknowledgeRemotionLicense={true}
            autoPlay={false}
            loop
            controls={false}
            style={{
              width: template.config.layout === "double" ? "100%" : "140px",
              height: "140px",
            }}
          />
        </div>
      </button>
    );
  },
  (prevProps, nextProps) =>
    prevProps.template.config.id === nextProps.template.config.id
);

StickerPreview.displayName = "StickerPreview";

export { StickerPreview }; 