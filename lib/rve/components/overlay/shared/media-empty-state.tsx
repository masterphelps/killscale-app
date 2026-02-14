import { Search, AlertCircle } from "lucide-react";

interface MediaEmptyStateProps {
  type: 'no-adaptors' | 'no-results' | 'initial';
  mediaType: string; // e.g., "videos", "images"
  activeTabName?: string;
}

/**
 * MediaEmptyState - Shared empty state component
 * 
 * Provides consistent empty state messaging and styling across all media panels.
 * Handles different types of empty states with appropriate icons and messages.
 */
export const MediaEmptyState: React.FC<MediaEmptyStateProps> = ({
  type,
  mediaType,
  activeTabName,
}) => {
  if (type === 'no-adaptors') {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-center">
        <AlertCircle className="h-8 w-8 mb-2" />
        <p>No {mediaType} available</p>
      </div>
    );
  }

  if (type === 'no-results') {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-center">
        <AlertCircle className="h-8 w-8 mb-2" />
        <p>
          No {mediaType} found
          {activeTabName ? ` in ${activeTabName}` : ""}
        </p>
        <p className="text-sm mt-1">Try a different search term</p>
      </div>
    );
  }

  // Initial state
  return (
    <div className="flex flex-col font-extralight items-center justify-center py-8 text-muted-foreground text-center">
      <Search className="h-8 w-8 mb-2" />
      <p className="text-sm text-center">
        Use the search to find {mediaType}
      </p>
      <p className="text-xs text-center mt-1">
        Enter a search term above
      </p>
    </div>
  );
}; 