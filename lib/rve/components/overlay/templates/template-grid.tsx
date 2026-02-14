import { TemplateCard } from "./template-card";
import { TemplateOverlay } from "../../../types";
import { MediaLoadingGrid } from "../shared/media-loading-grid";
import { MediaEmptyState } from "../shared/media-empty-state";

/**
 * Type for templates with source attribution
 */
type TemplateWithSource = TemplateOverlay & {
  _source: string;
  _sourceDisplayName: string;
};

interface TemplateGridProps {
  templates: TemplateWithSource[];
  isLoading: boolean;
  hasAdaptors: boolean;
  hasSearched: boolean;
  activeTab: string;
  sourceResults: Array<{
    adaptorName: string;
    adaptorDisplayName: string;
    itemCount: number;
    hasMore: boolean;
    error?: string;
  }>;
  onTemplateClick: (template: TemplateOverlay) => void;
  error?: string;
}

/**
 * TemplateGrid - Specialized grid component for template overlays
 * 
 * Provides consistent layout and state handling for template cards.
 * Handles loading states, error states, and empty states specific to templates.
 */
export const TemplateGrid: React.FC<TemplateGridProps> = ({
  templates,
  isLoading,
  hasAdaptors,
  hasSearched,
  activeTab,
  sourceResults,
  onTemplateClick,
  error,
}) => {
  // Get active tab display name for empty state
  const activeTabDisplayName = sourceResults.find(
    s => s.adaptorName === activeTab
  )?.adaptorDisplayName;

  // Show error state
  if (error) {
    return (
      <div className="bg-destructive border border-destructive rounded-lg p-3">
        <div className="text-destructive text-sm font-extralight">
          Error loading templates: {error}
        </div>
      </div>
    );
  }

  // Show loading state
  if (isLoading) {
    return <MediaLoadingGrid />;
  }

  // Show templates if we have them
  if (templates.length > 0) {
    return (
      <div className="space-y-2">
        {templates.map((template: TemplateWithSource) => (
          <TemplateCard
            key={`${template._source}-${template.id}`}
            template={template}
            onClick={onTemplateClick}
          />
        ))}
      </div>
    );
  }

  // Determine empty state type
  if (!hasAdaptors) {
    return <MediaEmptyState type="no-adaptors" mediaType="templates" />;
  }

  if (hasSearched && sourceResults.length > 0) {
    return (
      <MediaEmptyState 
        type="no-results" 
        mediaType="templates"
        activeTabName={activeTab !== "all" ? activeTabDisplayName : undefined}
      />
    );
  }

  return <MediaEmptyState type="initial" mediaType="templates" />;
}; 