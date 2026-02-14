import { useEffect, useState, useRef } from "react";
import {
  Film,
  Music,
  Type,
  Subtitles,
  ImageIcon,
  FolderOpen,
  Sticker,
  Plus,
  X,
} from "lucide-react";
import { useEditorSidebar } from "../../contexts/sidebar-context";
import { OverlayType } from "../../types";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "../ui/sheet";
import { VideoOverlayPanel } from "../overlay/video/video-overlay-panel";
import { TextOverlaysPanel } from "../overlay/text/text-overlays-panel";
import SoundsOverlayPanel from "../overlay/sounds/sounds-overlay-panel";
import { CaptionsOverlayPanel } from "../overlay/captions/captions-overlay-panel";
import { ImageOverlayPanel } from "../overlay/images/image-overlay-panel";
import { StickersPanel } from "../overlay/stickers/stickers-panel";
import { LocalMediaPanel } from "../overlay/local-media/local-media-panel";


/**
 * MobileNavBar Component
 *
 * A compact mobile-only navigation bar that displays overlay type icons
 * with a horizontal scrollable interface. Designed to match the TimelineControls
 * visual style while remaining compact for mobile screens.
 */
export function MobileNavBar() {
  const { activePanel, setActivePanel } = useEditorSidebar();
  const [clickedItemId, setClickedItemId] = useState<string | null>(null);
  const scrollableRef = useRef<HTMLDivElement>(null);
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Check if scrolling is needed
  useEffect(() => {
    const checkScrollWidth = () => {
      if (scrollableRef.current) {
        const { scrollWidth, clientWidth } = scrollableRef.current;
        setShowScrollIndicator(scrollWidth > clientWidth);
      }
    };

    checkScrollWidth();
    window.addEventListener("resize", checkScrollWidth);
    return () => window.removeEventListener("resize", checkScrollWidth);
  }, []);

  // Scroll active item into view when it changes
  useEffect(() => {
    if (activePanel && scrollableRef.current) {
      const activeItem = scrollableRef.current.querySelector(
        `[data-panel="${activePanel}"]`
      ) as HTMLElement;

      if (activeItem) {
        // Calculate the scroll position to center the active item
        const containerWidth = scrollableRef.current.offsetWidth;
        const itemLeft = activeItem.offsetLeft;
        const itemWidth = activeItem.offsetWidth;
        const scrollLeft = itemLeft - containerWidth / 2 + itemWidth / 2;

        scrollableRef.current.scrollTo({
          left: scrollLeft,
          behavior: "smooth",
        });
      }
    }
  }, [activePanel]);

  // Use shorter names on mobile
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
        return "Media";
      case OverlayType.STICKER:
        return "Sticker";

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

  ];

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
        return <VideoOverlayPanel />;
      case OverlayType.CAPTION:
        return <CaptionsOverlayPanel />;
      case OverlayType.IMAGE:
        return <ImageOverlayPanel />;
      case OverlayType.STICKER:
        return <StickersPanel />;
      case OverlayType.LOCAL_DIR:
        return <LocalMediaPanel />;

      default:
        return null;
    }
  };

  const handleItemClick = (item: any) => {
    // Set the clicked item ID for animation
    setClickedItemId(item.title);

    // Clear the animation after it completes
    setTimeout(() => setClickedItemId(null), 300);

    // Set the active panel and open the bottom sheet
    setActivePanel(item.panel);
    setIsSheetOpen(true);
  };

  return (
    <>
      <div className="md:hidden flex flex-col border-t border bg-background/95 dark:bg-background/30 relative">
        <div className="relative flex-1 flex">
          {/* Left fade gradient to indicate scrollable content */}
          {showScrollIndicator && (
            <div className="absolute left-0 top-0 bottom-0 w-4 bg-linear-to-r from-white/90 to-transparent dark:from-gray-900/90 z-10 pointer-events-none" />
          )}

          <div
            ref={scrollableRef}
            className={`flex-1 flex items-center justify-evenly overflow-x-auto scrollbar-hide px-1 py-2 overflow-auto relative`}
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {navigationItems.map((item) => (
              <TooltipProvider key={item.title} delayDuration={50}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      data-panel={item.panel}
                      onClick={() => handleItemClick(item)}
                      className={`rounded flex flex-col items-center flex-1 py-1.5
                      ${
                        clickedItemId === item.title
                          ? "scale-95 opacity-80"
                          : ""
                      }
                      ${
                                          activePanel === item.panel
                    ? "bg-secondary text-secondary-foreground"
                    : "text-secondary-foreground hover:bg-accent"
                      } transition-all`}
                    >
                      <item.icon className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                </Tooltip>
              </TooltipProvider>
            ))}

            {/* "More" indicator button for discoverability */}
            {showScrollIndicator && (
              <button
                onClick={() => {
                  if (scrollableRef.current) {
                    scrollableRef.current.scrollBy({
                      left: 100,
                      behavior: "smooth",
                    });
                  }
                }}
                className="flex items-center justify-center h-9 min-w-9 px-2 rounded bg-background text-foreground"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Right fade gradient to indicate scrollable content */}
          {showScrollIndicator && (
            <div className="absolute right-0 top-0 bottom-0 w-4 bg-linear-to-l from-white/90 to-transparent dark:from-gray-900/90 z-10 pointer-events-none" />
          )}
        </div>
      </div>

      {/* Bottom Sheet for Mobile */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent
          side="bottom"
          className="pt-4 h-[70vh] rounded-t-xl pb-0 px-0 overflow-hidden"
        >
          <div className="flex flex-col h-full">
            <SheetHeader className="px-4 pb-3 border-b">
              <SheetTitle className="text-left text-lg font-light">
                {activePanel && getPanelTitle(activePanel)}
              </SheetTitle>
              <SheetClose className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary text-foreground">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </SheetClose>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-0">
              {renderActivePanel()}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
} 