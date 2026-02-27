import React, { useState } from "react";
import { CaptionOverlay, CaptionStyles, Caption } from "../../../types";
import { captionTemplates } from "../../../templates/caption-templates";

import { CaptionStylePanel } from "./caption-style-panel";
import { CaptionTimeline } from "./caption-timeline";

interface CaptionSettingsProps {
  localOverlay: CaptionOverlay;
  setLocalOverlay: (overlay: CaptionOverlay) => void;
  currentFrame: number;
  startFrame: number;
  captions: Caption[];
}

export const defaultCaptionStyles: CaptionStyles = captionTemplates.classic.styles;

type CaptionTab = 'edit' | 'style';

export const CaptionSettings: React.FC<CaptionSettingsProps> = ({
  localOverlay,
  setLocalOverlay,
  currentFrame,
}) => {
  const [activeTab, setActiveTab] = useState<CaptionTab>('edit');
  const currentMs = (currentFrame / 30) * 1000;

  return (
    <div className="flex flex-col h-full">
      <div className="flex rounded-lg bg-bg-hover p-1 flex-shrink-0 mx-1">
        <button
          onClick={() => setActiveTab('edit')}
          className={`flex-1 text-sm py-2 rounded-md transition-colors ${activeTab === 'edit' ? 'bg-bg-card text-white' : 'text-zinc-400 hover:text-zinc-300'}`}
        >
          Edit
        </button>
        <button
          onClick={() => setActiveTab('style')}
          className={`flex-1 text-sm py-2 rounded-md transition-colors ${activeTab === 'style' ? 'bg-bg-card text-white' : 'text-zinc-400 hover:text-zinc-300'}`}
        >
          Style
        </button>
      </div>

      {activeTab === 'edit' && (
        <div className="flex-1 min-h-0 overflow-y-auto mt-2">
          <CaptionTimeline
            localOverlay={localOverlay}
            setLocalOverlay={setLocalOverlay}
            currentMs={currentMs}
          />
        </div>
      )}

      {activeTab === 'style' && (
        <div className="flex-1 min-h-0 overflow-y-auto mt-2">
          <CaptionStylePanel
            localOverlay={localOverlay}
            setLocalOverlay={setLocalOverlay}
          />
        </div>
      )}
    </div>
  );
};
