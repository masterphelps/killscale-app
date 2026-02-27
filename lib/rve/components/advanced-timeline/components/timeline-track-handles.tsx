import React from 'react';
import { TimelineTrack as TimelineTrackType, TimelineSection } from '../types';
import { TIMELINE_CONSTANTS } from '../constants';

/** Section display config */
const SECTION_CONFIG: Record<TimelineSection, { label: string; color: string }> = {
  overlays: { label: 'Overlays', color: '#3b82f6' },
  captions: { label: 'Captions', color: '#8b5cf6' },
  media:    { label: 'Media',    color: '#a1a1aa' },
  audio:    { label: 'Audio',    color: '#f97316' },
};

interface SectionGroup {
  section: TimelineSection;
  trackCount: number;
}

interface TimelineTrackHandlesProps {
  tracks: TimelineTrackType[];
}

export const TimelineTrackHandles: React.FC<TimelineTrackHandlesProps> = ({
  tracks,
}) => {
  // Group consecutive tracks by section
  const sectionGroups = React.useMemo(() => {
    const groups: SectionGroup[] = [];
    let current: SectionGroup | null = null;

    for (const track of tracks) {
      const section = track.section || 'overlays';
      if (current && current.section === section) {
        current.trackCount++;
      } else {
        current = { section, trackCount: 1 };
        groups.push(current);
      }
    }

    return groups;
  }, [tracks]);

  return (
    <div
      className="flex flex-col h-full bg-background border-r border-border border-l overflow-hidden"
      style={{
        width: `${TIMELINE_CONSTANTS.HANDLE_WIDTH}px`,
      }}
    >
      {/* Header spacer to match TimelineMarkers height */}
      <div
        className="flex-shrink-0 bg-background border-b border-border"
        style={{ height: `${TIMELINE_CONSTANTS.MARKERS_HEIGHT}px` }}
      />

      {/* Section labels — scrollable, synced with track scroll */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide track-handles-scroll">
        {sectionGroups.map((group, groupIndex) => {
          const config = SECTION_CONFIG[group.section];
          const groupHeight = group.trackCount * TIMELINE_CONSTANTS.TRACK_HEIGHT;

          return (
            <div key={group.section} className="relative">
              {/* Section divider between groups (not before first) */}
              {groupIndex > 0 && (
                <div className="h-px bg-border" />
              )}

              {/* Section label — vertically centered across all tracks in the section */}
              <div
                className="flex items-center justify-center"
                style={{ height: `${groupHeight}px` }}
              >
                <span
                  className="text-[11px] uppercase tracking-wider font-medium select-none"
                  style={{ color: config.color }}
                >
                  {config.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
