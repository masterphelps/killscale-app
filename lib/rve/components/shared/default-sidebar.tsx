import * as React from "react";
import {
  Film,
  Music,
  Type,
  Subtitles,
  ImageIcon,
  FolderOpen,
  Sticker,
  Layout,
  ChevronsLeft,
  Settings,
  Sparkles,
  Plus,
  Check,
} from "lucide-react";

// Import OverlayType directly from types to avoid export issues
import { OverlayType } from "../../types";

// Import hooks and contexts directly
import { useEditorSidebar } from "../../contexts/sidebar-context";
import { useEditorContext } from "../../contexts/editor-context";

// Import overlay panels directly
import { VideoOverlayPanel } from "../overlay/video/video-overlay-panel";
import { TextOverlaysPanel } from "../overlay/text/text-overlays-panel";
import SoundsOverlayPanel from "../overlay/sounds/sounds-overlay-panel";
import { CaptionsOverlayPanel } from "../overlay/captions/captions-overlay-panel";
import { ImageOverlayPanel } from "../overlay/images/image-overlay-panel";
import { LocalMediaPanel } from "../overlay/local-media/local-media-panel";
import { StickersPanel } from "../overlay/stickers/stickers-panel";
import { TemplateOverlayPanel } from "../overlay/templates/template-overlay-panel";
import { SettingsPanel } from "../settings/settings-panel";
import { AIOverlayPanel } from "../overlay/ai/ai-overlay-panel";
import type { SiblingClip } from "../react-video-editor";

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
  /** Footer text to display at the bottom of the sidebar */
  footerText?: string;
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
  siblingClips?: SiblingClip[];
  /** Callback when user clicks "Add" on a sibling clip */
  onAppendSibling?: (sibling: SiblingClip) => void;
  /** Set of sibling jobIds already appended to the timeline */
  appendedSiblings?: Set<string>;
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
}) => {
  const { activePanel, setActivePanel, setIsOpen } = useEditorSidebar();
  const { setSelectedOverlayId, selectedOverlayId, overlays } = useEditorContext();

  // Get the selected overlay to check its type
  const selectedOverlay = selectedOverlayId !== null 
    ? overlays.find(overlay => overlay.id === selectedOverlayId) 
    : null;

  // Only show back button if there's a selected overlay AND it matches the active panel type
  const shouldShowBackButton = selectedOverlay && selectedOverlay.type === activePanel;
  
  const getPanelTitle = (type: OverlayType): string => {
    switch (type) {
      case OverlayType.VIDEO:
        return "Video";
      case OverlayType.TEXT:
        return "Text";
      case OverlayType.SOUND:
        return "Audio";
      case OverlayType.CAPTION:
        return "Caption";
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
    {
      title: getPanelTitle(OverlayType.VIDEO),
      url: "#",
      icon: Film,
      panel: OverlayType.VIDEO,
      type: OverlayType.VIDEO,
    },
    {
      title: getPanelTitle(OverlayType.TEXT),
      url: "#",
      icon: Type,
      panel: OverlayType.TEXT,
      type: OverlayType.TEXT,
    },
    {
      title: getPanelTitle(OverlayType.SOUND),
      url: "#",
      icon: Music,
      panel: OverlayType.SOUND,
      type: OverlayType.SOUND,
    },
    {
      title: getPanelTitle(OverlayType.CAPTION),
      url: "#",
      icon: Subtitles,
      panel: OverlayType.CAPTION,
      type: OverlayType.CAPTION,
    },
    {
      title: getPanelTitle(OverlayType.IMAGE),
      url: "#",
      icon: ImageIcon,
      panel: OverlayType.IMAGE,
      type: OverlayType.IMAGE,
    },
    {
      title: getPanelTitle(OverlayType.STICKER),
      url: "#",
      icon: Sticker,
      panel: OverlayType.STICKER,
      type: OverlayType.STICKER,
    },
    {
      title: getPanelTitle(OverlayType.LOCAL_DIR),
      url: "#",
      icon: FolderOpen,
      panel: OverlayType.LOCAL_DIR,
      type: OverlayType.LOCAL_DIR,
    },
    {
      title: getPanelTitle(OverlayType.TEMPLATE),
      url: "#",
      icon: Layout,
      panel: OverlayType.TEMPLATE,
      type: OverlayType.TEMPLATE,
    },
    ...(onAIGenerate
      ? [
          {
            title: getPanelTitle(OverlayType.AI),
            url: "#",
            icon: Sparkles,
            panel: OverlayType.AI,
            type: OverlayType.AI,
          },
        ]
      : []),
  ].filter((item) => !disabledPanels.includes(item.type));

  /**
   * Renders the appropriate panel component based on the active panel selection
   * @returns {React.ReactNode} The component corresponding to the active panel
   */
  const renderActivePanel = () => {
    switch (activePanel) {
      case OverlayType.TEXT:
        return <TextOverlaysPanel />;
      case OverlayType.SOUND:
        return <SoundsOverlayPanel />;
      case OverlayType.VIDEO:
        return (
          <>
            {siblingClips && siblingClips.length > 0 && onAppendSibling && (
              <div className="px-1 pb-3 mb-3 border-b border-border">
                <h4 className="text-xs font-medium text-muted-foreground mb-2">Concept Videos</h4>
                <div className="space-y-2">
                  {siblingClips.map((sibling) => {
                    const isAppended = appendedSiblings?.has(sibling.jobId) ?? false;
                    return (
                      <div
                        key={sibling.jobId}
                        className="flex items-center gap-2 p-1.5 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                      >
                        {/* Small 9:16 video thumbnail */}
                        <div className="relative w-10 h-[71px] rounded overflow-hidden bg-black flex-shrink-0">
                          <video
                            src={sibling.rawVideoUrl}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                            preload="metadata"
                          />
                          <span className="absolute bottom-0.5 right-0.5 text-[9px] bg-black/70 text-white px-1 rounded">
                            {sibling.durationSeconds}s
                          </span>
                        </div>
                        {/* Info + Add button */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-foreground truncate">
                            {sibling.conceptTitle}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            Concept {sibling.adIndex + 1}
                          </p>
                        </div>
                        <button
                          onClick={() => !isAppended && onAppendSibling(sibling)}
                          disabled={isAppended}
                          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors flex-shrink-0 ${
                            isAppended
                              ? 'bg-emerald-500/20 text-emerald-400 cursor-default'
                              : 'bg-primary/20 text-primary hover:bg-primary/30'
                          }`}
                        >
                          {isAppended ? (
                            <><Check className="w-3 h-3" /> Added</>
                          ) : (
                            <><Plus className="w-3 h-3" /> Add</>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <VideoOverlayPanel />
          </>
        );
      case OverlayType.CAPTION:
        return <CaptionsOverlayPanel />;
      case OverlayType.IMAGE:
        return <ImageOverlayPanel />;
      case OverlayType.STICKER:
        return <StickersPanel />;
      case OverlayType.LOCAL_DIR:
        return <LocalMediaPanel />;
      case OverlayType.TEMPLATE:
        return <TemplateOverlayPanel />;
      case OverlayType.SETTINGS:
        return <SettingsPanel />;
      case OverlayType.AI:
        return onAIGenerate ? (
          <AIOverlayPanel
            onGenerate={onAIGenerate}
            isGenerating={isAIGenerating}
            hasTranscript={hasAITranscript}
          />
        ) : null;
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
                        src="/icons/logo-rve.png"
                        alt="RVE Logo"
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
                        setActivePanel(item.panel);
                        setIsOpen(true);
                      }}
                      size="lg"
                      className="flex flex-col items-center gap-2 px-1.5 py-2.5"
                      data-active={activePanel === item.panel}
                    >
                      <item.icon className={`h-5 w-5 ${item.type === OverlayType.AI ? 'text-purple-400' : ''}`} strokeWidth={1.5} />
                      {showIconTitles && (
                        <span className={`text-[8px] leading-none ${item.type === OverlayType.AI ? 'text-purple-400' : ''}`}>
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
                        setActivePanel(OverlayType.SETTINGS);
                        setIsOpen(true);
                      }}
                      size="lg"
                      className="flex flex-col items-center gap-2 px-1.5 py-2.5"
                      data-active={activePanel === OverlayType.SETTINGS}
                    >
                      <Settings className="h-5 w-5" strokeWidth={1.5} />
                      {showIconTitles && (
                        <span className="text-[8px] leading-none">
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
        <SidebarContent className="bg-background px-2 pt-1">
          {renderActivePanel()}
        </SidebarContent>
      </Sidebar>
    </Sidebar>
  );
};
