import * as React from "react";
import {
  FolderOpen,
  Type,
  Music,
  Subtitles,
  MousePointerClick,
  ChevronsLeft,
  Settings,
  Film,
} from "lucide-react";

// Import OverlayType directly from types to avoid export issues
import { OverlayType } from "../../types";

// Import hooks and contexts directly
import { useEditorSidebar } from "../../contexts/sidebar-context";
import { useEditorContext } from "../../contexts/editor-context";

// Import new KillScale panel components
import { MediaPanel } from "../panels/media-panel";
import { TextOverlaysPanel } from "../overlay/text/text-overlays-panel";
import { AudioPanel } from "../panels/audio-panel";
import { CaptionsOverlayPanel } from "../overlay/captions/captions-overlay-panel";
import { AISection } from "../panels/ai-section";
import { CTAPanel } from "../panels/cta-panel";

// Import settings panel (kept from original)
import { SettingsPanel } from "../settings/settings-panel";

// Import video clips panel for project video gallery + per-clip settings
import { VideoClipsPanel } from "../panels/video-clips-panel";

// Import UI components directly
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "../ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { Button } from "../ui/button";

interface DefaultSidebarProps {
  /** Custom logo element to display in the header */
  logo?: React.ReactNode;
  /** Array of overlay types to disable/hide from the sidebar */
  disabledPanels?: OverlayType[];
  /** Whether to show icon titles in the sidebar */
  showIconTitles?: boolean;
  /** AI generation callback — if provided, AI panel is shown */
  onAIGenerate?: (prompt: string) => Promise<void>;
  /** Whether AI generation is in progress */
  isAIGenerating?: boolean;
  /** Whether a transcript is available for AI generation */
  hasAITranscript?: boolean;
  /** Sibling concept videos from the same canvas */
  siblingClips?: any[];
  /** Callback when user clicks "Add" on a sibling clip */
  onAppendSibling?: (sibling: any) => void;
  /** Set of sibling jobIds already appended to the timeline */
  appendedSiblings?: Set<string>;
  // New panel callbacks
  onAddCTA?: (template: { id: string; label: string; text: string; buttonColor: string; textColor: string; style: string }) => void;
  onAddMedia?: (item: { id: string; name: string; mediaType: 'VIDEO' | 'IMAGE'; thumbnailUrl?: string; storageUrl?: string }) => void;
  onAddMusic?: (trackUrl: string, title: string, duration: number) => void;
  onAddText?: (preset: { label: string; fontSize: number; fontWeight: string }) => void;
  onStyleChange?: (style: string) => void;
  currentCaptionStyle?: string;
  // Voiceover
  voices?: { id: string; label: string }[];
  selectedVoice?: string;
  onSelectVoice?: (voiceId: string) => void;
  onGenerateVoiceover?: () => Promise<void>;
  isGeneratingVoiceover?: boolean;
  hasVoiceover?: boolean;
  // Media panel
  editorUserId?: string;
  editorAdAccountId?: string;
}

/**
 * DefaultSidebar Component
 *
 * A dual-sidebar layout component for the video editor application.
 * Consists of two parts:
 * 1. A narrow icon-based sidebar on the left for main navigation
 * 2. A wider content sidebar that displays the active panel's content
 *
 * @component
 */
export const DefaultSidebar: React.FC<DefaultSidebarProps> = ({
  logo,
  disabledPanels = [],
  showIconTitles = true,
  onAIGenerate,
  isAIGenerating = false,
  hasAITranscript = false,
  siblingClips,
  onAppendSibling,
  appendedSiblings,
  onAddCTA,
  onAddMedia,
  onAddMusic,
  onAddText,
  onStyleChange,
  currentCaptionStyle,
  voices,
  selectedVoice,
  onSelectVoice,
  onGenerateVoiceover,
  isGeneratingVoiceover,
  hasVoiceover,
  editorUserId,
  editorAdAccountId,
}) => {
  const { activePanel, setActivePanel, isOpen, setIsOpen } = useEditorSidebar();
  const { setSelectedOverlayId, selectedOverlayId, overlays } = useEditorContext();

  // Get the selected overlay to check its type
  const selectedOverlay = selectedOverlayId !== null 
    ? overlays.find(overlay => overlay.id === selectedOverlayId) 
    : null;

  // Only show back button if there's a selected overlay AND it matches the active panel type
  const shouldShowBackButton = selectedOverlay && selectedOverlay.type === activePanel;
  
  const getPanelTitle = (type: OverlayType): string => {
    switch (type) {
      case OverlayType.MEDIA:
        return "Media";
      case OverlayType.VIDEO:
        return "Video";
      case OverlayType.TEXT:
        return "Text";
      case OverlayType.SOUND:
        return "Audio";
      case OverlayType.CAPTION:
        return "Captions";
      case OverlayType.CTA:
        return "CTA";
      case OverlayType.IMAGE:
        return "Image";
      case OverlayType.LOCAL_DIR:
        return "Uploads";
      case OverlayType.STICKER:
        return "Stickers";
      case OverlayType.TEMPLATE:
        return "Templates";
      case OverlayType.SETTINGS:
        return "Settings";
      case OverlayType.AI:
        return "AI Generate";
      default:
        return "Unknown";
    }
  };

  const navigationItems = [
    { title: 'Media', url: '#', icon: FolderOpen, panel: OverlayType.MEDIA, type: OverlayType.MEDIA },
    { title: 'Video', url: '#', icon: Film, panel: OverlayType.VIDEO, type: OverlayType.VIDEO },
    { title: 'Text', url: '#', icon: Type, panel: OverlayType.TEXT, type: OverlayType.TEXT },
    { title: 'Audio', url: '#', icon: Music, panel: OverlayType.SOUND, type: OverlayType.SOUND },
    { title: 'Captions', url: '#', icon: Subtitles, panel: OverlayType.CAPTION, type: OverlayType.CAPTION },
    { title: 'CTA', url: '#', icon: MousePointerClick, panel: OverlayType.CTA, type: OverlayType.CTA },
  ].filter((item) => !disabledPanels.includes(item.type));

  /**
   * Renders the appropriate panel component based on the active panel selection
   * @returns {React.ReactNode} The component corresponding to the active panel
   */
  const renderActivePanel = () => {
    switch (activePanel) {
      case OverlayType.MEDIA:
        return <MediaPanel userId={editorUserId || ''} adAccountId={editorAdAccountId || ''} onAddMedia={onAddMedia || (() => {})} />;
      case OverlayType.VIDEO:
        return <VideoClipsPanel />;
      case OverlayType.TEXT:
        return <TextOverlaysPanel />;
      case OverlayType.SOUND:
        return (
          <AudioPanel
            onAIGenerate={onAIGenerate || (async () => {})}
            isAIGenerating={isAIGenerating || false}
            voices={voices || []}
            selectedVoice={selectedVoice || 'alloy'}
            onSelectVoice={onSelectVoice || (() => {})}
            onGenerateVoiceover={onGenerateVoiceover || (async () => {})}
            isGeneratingVoiceover={isGeneratingVoiceover || false}
            hasVoiceover={hasVoiceover || false}
            onAddMusic={onAddMusic || (() => {})}
          />
        );
      case OverlayType.CAPTION:
        return (
          <div className="flex flex-col h-full">
            <div className="px-2 pt-2 flex-shrink-0">
              <AISection
                onGenerate={(instruction) => (onAIGenerate || (async () => {}))(`Generate captions: ${instruction}`)}
                isGenerating={isAIGenerating || false}
                placeholder="Generate captions from audio..."
                quickActions={[
                  { label: 'Generate captions from audio', instruction: 'Generate captions from the video audio' },
                ]}
              />
            </div>
            <div className="flex-1 min-h-0">
              <CaptionsOverlayPanel />
            </div>
          </div>
        );
      case OverlayType.CTA:
        return (
          <CTAPanel
            onAIGenerate={onAIGenerate || (async () => {})}
            isAIGenerating={isAIGenerating || false}
            onAddCTA={onAddCTA || (() => {})}
          />
        );
      case OverlayType.SETTINGS:
        return <SettingsPanel />;
      default:
        return null;
    }
  };

  return (
    <Sidebar
      collapsible="icon"
      className="overflow-hidden [&_[data-sidebar=sidebar]]:flex-row"
    >
      {/* First sidebar */}
      <Sidebar
        collapsible="none"
        className="!w-[calc(var(--sidebar-width-icon)+1px)] border-r border-border "
      >
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild className="md:h-8 md:pb-4 md:pt-4 ">
                <a href="#">
                  <div className="flex aspect-square size-9 items-center justify-center rounded-lg">
                    {logo || (
                      <img
                        src="/icons/killscale-favicon.png"
                        alt="KillScale"
                        width={27}
                        height={27}
                      />
                    )}
                  </div>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent className="border-t border-border">
          <SidebarGroup className="pt-3">
            {navigationItems.map((item) => (
              <TooltipProvider key={item.title} delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton
                      onClick={() => {
                        if (activePanel === item.panel && isOpen) {
                          setIsOpen(false);
                        } else {
                          setActivePanel(item.panel);
                          setIsOpen(true);
                        }
                      }}
                      size="lg"
                      className="flex flex-col items-center gap-2 px-1.5 py-2.5"
                      data-active={activePanel === item.panel}
                    >
                      <item.icon className={`h-7 w-7 ${item.type === OverlayType.AI ? 'text-purple-400' : ''}`} strokeWidth={1.5} />
                      {showIconTitles && (
                        <span className={`text-[11px] leading-none ${item.type === OverlayType.AI ? 'text-purple-400' : ''}`}>
                          {item.title}
                        </span>
                      )}
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  <TooltipContent side="right">{item.title}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-border  ">
          <SidebarMenu>
            <div className="flex items-center justify-center">
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton
                      onClick={() => {
                        if (activePanel === OverlayType.SETTINGS && isOpen) {
                          setIsOpen(false);
                        } else {
                          setActivePanel(OverlayType.SETTINGS);
                          setIsOpen(true);
                        }
                      }}
                      size="lg"
                      className="flex flex-col items-center gap-2 px-1.5 py-2.5"
                      data-active={activePanel === OverlayType.SETTINGS}
                    >
                      <Settings className="h-7 w-7" strokeWidth={1.5} />
                      {showIconTitles && (
                        <span className="text-[11px] leading-none">
                          Settings
                        </span>
                      )}
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  <TooltipContent side="right">Settings</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      {/* Second sidebar */}
      <Sidebar collapsible="none" className="hidden flex-1 md:flex bg-background">
      <SidebarHeader className="gap-3.5 border-b border-border px-4 py-3">
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center justify-between w-full">
              <h3 className="font-extralight text-sidebar-foreground">
                {activePanel ? getPanelTitle(activePanel) : ""} 
              </h3>
              {shouldShowBackButton && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setSelectedOverlayId(null)}
                  aria-label="Back"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent className="bg-background px-2 pt-1 overflow-x-hidden">
          {renderActivePanel()}
        </SidebarContent>
      </Sidebar>
    </Sidebar>
  );
};
