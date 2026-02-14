import React, { useState, useRef, useMemo, useCallback } from "react";
import { useLocalMedia } from "../../../contexts/local-media-context";
import { formatBytes, formatDuration } from "../../../utils/general/format-utils";
import { Button } from "../../ui/button";
import { Loader2, Upload, Trash2, Music } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { UnifiedTabs } from "../shared/unified-tabs";
import { setCurrentNewItemDragData, setCurrentNewItemDragType } from "../../advanced-timeline/hooks/use-new-item-drag";

/**
 * User Media Gallery Component
 *
 * Displays the user's uploaded media files and provides functionality to:
 * - Upload new media files
 * - Filter media by type (image, video, audio)
 * - Preview media files
 * - Delete media files
 * - Add media to the timeline
 */
export function LocalMediaGallery({
  onSelectMedia,
}: {
  onSelectMedia?: (mediaFile: any) => void;
}) {
  const { localMediaFiles, addMediaFile, removeMediaFile, isLoading } =
    useLocalMedia();
  const [activeTab, setActiveTab] = useState("all");
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create source results for the tabs - memoized to prevent recalculation
  const sourceResults = useMemo(() => [
    {
      adaptorName: "image",
      adaptorDisplayName: "Images",
      itemCount: localMediaFiles.filter(file => file.type === "image").length,
    },
    {
      adaptorName: "video",
      adaptorDisplayName: "Videos", 
      itemCount: localMediaFiles.filter(file => file.type === "video").length,
    },
    {
      adaptorName: "audio",
      adaptorDisplayName: "Audio",
      itemCount: localMediaFiles.filter(file => file.type === "audio").length,
    },
  ], [localMediaFiles]);

  // Filter media files based on active tab - memoized to prevent recalculation
  const filteredMedia = useMemo(() => {
    return localMediaFiles.filter((file) => {
      if (activeTab === "all") return true;
      return file.type === activeTab;
    });
  }, [localMediaFiles, activeTab]);

  // Handle file upload - memoized to prevent recreation
  const handleFileUpload = useCallback(async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      try {
        setUploadError(null);
        await addMediaFile(files[0]);
        // Reset the input value to allow uploading the same file again
        event.target.value = "";
      } catch (error) {
        console.error("Error uploading file:", error);
        setUploadError("Failed to upload file. Please try again.");
        event.target.value = "";
      }
    }
  }, [addMediaFile]);

  // Handle upload button click - memoized to prevent recreation
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Handle media selection - memoized to prevent recreation
  const handleMediaSelect = useCallback((file: any) => {
    setSelectedFile(file);
    setPreviewOpen(true);
  }, []);

  // Add media to timeline - memoized to prevent recreation
  const handleAddToTimeline = useCallback(() => {
    if (selectedFile && onSelectMedia) {
      onSelectMedia(selectedFile);
      setPreviewOpen(false);
    }
  }, [selectedFile, onSelectMedia]);

  // Handle drag start for timeline integration
  const handleDragStart = useCallback((file: any) => (e: React.DragEvent) => {
    // Extract duration from file if available
    const fileDuration = file.duration;
    const defaultDuration = file.type === "video" ? 5 : file.type === "audio" ? 5 : 5; // Default to 5 seconds
    const duration = typeof fileDuration === 'number' && fileDuration > 0 
      ? fileDuration 
      : defaultDuration;
    
    // Use file type directly - timeline expects 'video', 'image', or 'audio'
    const timelineType = file.type; // video, image, or audio
    
    // Convert file path to proper src URL for timeline
    // Handle both server paths and blob URLs
    let mediaSrc: string;
    if (file.path.startsWith('blob:')) {
      // Direct blob URL - use as-is
      mediaSrc = file.path;
    } else {
      // Server path - convert to use the API route for better content-type handling
      const apiPath = file.path.startsWith('/') ? file.path.substring(1) : file.path;
      mediaSrc = `/api/latest/local-media/serve/${apiPath}`;
    }
    
    // Create enriched file data with proper src for timeline
    const enrichedFileData = {
      ...file,
      src: mediaSrc, // Add src property that timeline expects
      file: mediaSrc, // Also add file property for audio fallback
      title: file.name, // Add title for audio content display
      thumbnail: file.thumbnail || mediaSrc, // Ensure thumbnail is set
      _isLocalMedia: true, // Flag to indicate this is local media
    };
    
    // Set drag data for timeline
    const dragData = {
      isNewItem: true,
      type: timelineType,
      label: file.name,
      duration,
      data: enrichedFileData, // Pass enriched file data
    };
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData("application/json", JSON.stringify(dragData));
    
    // Set global drag state for timeline
    setCurrentNewItemDragType(dragData.type);
    setCurrentNewItemDragData(dragData);
    
    // Create a custom drag image (smaller thumbnail)
    const thumbnail = e.currentTarget.querySelector('img');
    if (thumbnail) {
      // Create a smaller version of the thumbnail for dragging
      const dragPreview = document.createElement('div');
      dragPreview.style.position = 'absolute';
      dragPreview.style.top = '-9999px';
      dragPreview.style.width = '60px';
      dragPreview.style.height = '40px';
      dragPreview.style.overflow = 'hidden';
      dragPreview.style.borderRadius = '4px';
      dragPreview.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
      dragPreview.style.cursor = 'none';
      
      const clonedImg = thumbnail.cloneNode(true) as HTMLImageElement;
      clonedImg.style.width = '80px';
      clonedImg.style.height = '60px';
      clonedImg.style.objectFit = 'cover';
      
      dragPreview.appendChild(clonedImg);
      document.body.appendChild(dragPreview);
      
      e.dataTransfer.setDragImage(dragPreview, 40, 30);
      
      // Clean up the preview element after drag starts
      setTimeout(() => {
        dragPreview.remove();
      }, 0);
    } else if (file.type === "audio") {
      // For audio files without thumbnail, create a simple preview
      const dragPreview = document.createElement('div');
      dragPreview.style.position = 'absolute';
      dragPreview.style.top = '-9999px';
      dragPreview.style.width = '60px';
      dragPreview.style.height = '40px';
      dragPreview.style.backgroundColor = 'rgba(0,0,0,0.8)';
      dragPreview.style.borderRadius = '4px';
      dragPreview.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
      dragPreview.style.display = 'flex';
      dragPreview.style.alignItems = 'center';
      dragPreview.style.justifyContent = 'center';
      dragPreview.innerHTML = '🎵';
      dragPreview.style.fontSize = '20px';
      
      document.body.appendChild(dragPreview);
      e.dataTransfer.setDragImage(dragPreview, 30, 20);
      
      setTimeout(() => {
        dragPreview.remove();
      }, 0);
    }
  }, []);
  
  const handleDragEnd = useCallback(() => {
    // Clear drag state
    setCurrentNewItemDragType(null);
    setCurrentNewItemDragData(null);
  }, []);

  // Render preview content based on file type
  const renderPreviewContent = () => {
    if (!selectedFile) return null;

    const commonClasses =
      "max-h-[50vh] w-full object-contain rounded-lg shadow-sm";

    switch (selectedFile.type) {
      case "image":
        return (
          <div className="relative bg-card rounded-lg p-2 flex justify-center">
            <img
              src={selectedFile.path}
              alt={selectedFile.name}
              className={`${commonClasses} object-contain`}
            />
          </div>
        );
      case "video":
        return (
          <div className="relative bg-card rounded-lg p-2">
            <video
              src={selectedFile.path}
              controls
              className={commonClasses}
              controlsList="nodownload"
              playsInline
            />
          </div>
        );
      case "audio":
        return (
          <div className="flex flex-col items-center space-y-3 p-4 bg-card rounded-lg">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <Music className="w-6 h-6" />
            </div>
            <audio
              src={
                selectedFile.path.startsWith("http")
                  ? selectedFile.path
                  : `${window.location.origin}${selectedFile.path}`
              }
              controls
              className="w-[280px] max-w-full"
              controlsList="nodownload"
            />
          </div>
        );
      default:
        return (
          <div className="text-sm text-secondary">
            Unsupported file type
          </div>
        );
    }
  };

  // Render media item - memoized to prevent recreation
  const renderMediaItem = useCallback((file: any) => {
    return (
      <div
        key={file.id}
        className="relative group/item border rounded-md overflow-hidden cursor-pointer 
          hover:border-primary transition-all 
          bg-card shadow-sm hover:shadow-md"
        onClick={() => handleMediaSelect(file)}
        draggable={true}
        onDragStart={handleDragStart(file)}
        onDragEnd={handleDragEnd}
      >
        {/* Thumbnail */}
        <div className="aspect-video relative">
          {file.type === "image" && (
            <img
              src={file.thumbnail || `/api/latest/local-media/serve/${file.path.startsWith('/') ? file.path.substring(1) : file.path}`}
              alt={file.name}
              className="absolute inset-0 w-full h-full object-cover bg-card"
              draggable={false}
            />
          )}
          {file.type === "video" && (
            <>
              <img
                src={file.thumbnail}
                alt={file.name}
                className="absolute inset-0 w-full h-full object-cover bg-card"
                draggable={false}
              />
              <div className="absolute bottom-1.5 right-1.5 bg-black/75 text-foreground text-xs px-1.5 py-0.5 rounded-md">
                {formatDuration(file.duration)}
              </div>
            </>
          )}
          {file.type === "audio" && (
            <div className="w-full h-full flex items-center justify-center bg-card">
              <Music className="w-10 h-10" />
            </div>
          )}
        </div>

        {/* Media info */}
        <div className="p-2.5">
          <p className="text-sm font-extralight truncate text-foreground">
            {file.name}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatBytes(file.size)}
          </p>
        </div>

        {/* Delete button */}
        <button
          className="absolute top-2 right-2 bg-destructive
            text-destructive-foreground p-1.5 rounded-full opacity-0 group-hover/item:opacity-100 transition-all duration-200 
            shadow-sm hover:shadow-md transform hover:scale-105"
          onClick={(e) => {
            e.stopPropagation();
            removeMediaFile(file.id);
          }}
          title="Delete media"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }, [handleMediaSelect, removeMediaFile, handleDragStart, handleDragEnd]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm font-extralight">Saved Uploads</h2>
        <div>
          <Button
            variant="default"
            size="sm"
            className="gap-1"
            onClick={handleUploadClick}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Upload
          </Button>
          <input
            ref={fileInputRef}
            id="file-upload"
            type="file"
            className="hidden"
            onChange={handleFileUpload}
            accept="image/*,video/*,audio/*"
            disabled={isLoading}
          />
        </div>
      </div>

      {uploadError && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-2 rounded mb-4">
          {uploadError}
        </div>
      )}

      <div className="flex-1 flex flex-col">
        <UnifiedTabs
          sourceResults={sourceResults}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          className="mb-4"
        />

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 text-sm text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <p>Loading media files...</p>
            </div>
          ) : filteredMedia.length === 0 ? (
            <div className="h-full flex flex-col font-extralight items-center justify-center py-8 text-muted-foreground text-center">
              <Upload className="h-8 w-8 mb-2" />
              <p className="text-sm text-center">No media files</p>
              <p className="text-xs text-center mt-1">
                Upload your first media file to get started
              </p>
              <Button
                variant="default"
                size="sm"
                onClick={handleUploadClick}
                className="text-xs mt-3"
              >
                Upload Media
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
              {filteredMedia.map(renderMediaItem)}
            </div>
          )}
        </div>
      </div>

      {/* Media Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedFile?.name}</DialogTitle>
            <DialogDescription>
              {selectedFile?.type} • {formatBytes(selectedFile?.size)}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center">{renderPreviewContent()}</div>
          <div className="flex justify-end mt-4">
            <Button variant="default" size="sm" onClick={handleAddToTimeline}>
              Add to Timeline
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
