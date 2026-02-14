import React from "react";
import { PaintBucket, Settings } from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../ui/tabs";

interface TabItem {
  value: string;
  label: string;
  icon?: React.ReactNode;
  content?: React.ReactNode;
  disabled?: boolean;
  badge?: string;
  count?: number;
  error?: string;
}

interface SourceResult {
  adaptorName: string;
  adaptorDisplayName: string;
  itemCount: number;
  hasMore?: boolean;
  error?: string;
}

interface FlexibleTabsProps {
  /** Array of tab configurations */
  tabs: TabItem[];
  /** Default active tab value */
  defaultValue?: string;
  /** Additional CSS classes for the container */
  className?: string;
  /** Callback when tab changes (for controlled mode) */
  onTabChange?: (value: string) => void;
  /** Current active tab (for controlled mode) */
  activeTab?: string;
}

interface SimpleTabsProps {
  /** Default active tab value */
  defaultValue?: string;
  /** Settings tab content */
  settingsContent: React.ReactNode;
  /** Style tab content */
  styleContent: React.ReactNode;
  /** Additional CSS classes for the container */
  className?: string;
}

interface SourceTabsProps {
  /** Array of source results to display as tabs */
  sourceResults: SourceResult[];
  /** Currently active tab identifier */
  activeTab: string;
  /** Callback when a tab is clicked */
  onTabChange: (tabId: string) => void;
  /** Optional className for additional styling */
  className?: string;
  /** Whether to show the "All" tab */
  showAllTab?: boolean;
}

// Union type for props
type UnifiedTabsProps = FlexibleTabsProps | SimpleTabsProps | SourceTabsProps;

// Type guards
function isSimpleProps(props: UnifiedTabsProps): props is SimpleTabsProps {
  return 'settingsContent' in props && 'styleContent' in props;
}

function isSourceProps(props: UnifiedTabsProps): props is SourceTabsProps {
  return 'sourceResults' in props;
}

/**
 * Unified tab component that handles all tab use cases in the application
 * Provides consistent styling across all overlay types and source filtering
 * 
 * Can be used in three ways:
 * 1. Simple mode: Just pass settingsContent and styleContent for standard Settings/Style tabs
 * 2. Flexible mode: Pass a tabs array for custom tab configurations with content
 * 3. Source mode: Pass sourceResults for source filtering tabs (no content, just triggers)
 * 
 * @component
 * @example
 * ```tsx
 * // Simple mode
 * <UnifiedTabs
 *   settingsContent={<MySettingsPanel />}
 *   styleContent={<MyStylePanel />}
 * />
 * 
 * // Flexible mode
 * <UnifiedTabs
 *   tabs={[
 *     { value: "captions", label: "Captions", icon: <AlignLeft />, content: <CaptionPanel /> },
 *     { value: "style", label: "Style", icon: <PaintBucket />, content: <StylePanel /> }
 *   ]}
 * />
 * 
 * // Source mode
 * <UnifiedTabs
 *   sourceResults={sourceResults}
 *   activeTab={activeTab}
 *   onTabChange={setActiveTab}
 * />
 * ```
 */
export const UnifiedTabs: React.FC<UnifiedTabsProps> = (props) => {
  // Handle source tabs mode
  if (isSourceProps(props)) {
    const { sourceResults, activeTab, onTabChange, className = "", showAllTab = true } = props;
    
    // Calculate total count for "All" tab
    const totalCount = sourceResults.reduce(
      (sum, source) => sum + source.itemCount,
      0
    );

    if (sourceResults.length === 0) {
      return null;
    }

    return (
      <div className={className}>
        <Tabs value={activeTab} onValueChange={onTabChange}>
          <TabsList>
            {/* All Tab */}
            {showAllTab && (
              <TabsTrigger
                value="all"
                className="text-xs font-extralight border-b-2 border-transparent rounded-none"
              >
                All ({totalCount})
              </TabsTrigger>
            )}

            {/* Individual Source Tabs */}
            {sourceResults.map((source) => (
              <TabsTrigger
                key={source.adaptorName}
                value={source.adaptorName}
                className="text-xs font-extralight border-b-2 border-transparent rounded-none"
              >
                <span>{source.adaptorDisplayName}</span>
                <span className="text-[10px] opacity-70">({source.itemCount})</span>
                {source.error && <span className="text-[10px]">⚠️</span>}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
    );
  }

  // Convert simple props to flexible format for overlay tabs
  const tabsData: TabItem[] = isSimpleProps(props) 
    ? [
        {
          value: "settings",
          label: "Settings",
          icon: <Settings className="w-3 h-3" />,
          content: props.settingsContent,
        },
        {
          value: "style", 
          label: "Style",
          icon: <PaintBucket className="w-3 h-3" />,
          content: props.styleContent,
        }
      ]
    : props.tabs;

  const defaultValue = props.defaultValue || tabsData[0]?.value || "settings";
  const className = props.className || "";
  const isControlled = 'activeTab' in props && 'onTabChange' in props;

  const getTabTriggerClassName = (tab: TabItem) => {
    const baseClasses = "text-xs font-extralight border-b-2 border-transparent rounded-none";
    
    if (tab.disabled) {
      return `${baseClasses} cursor-not-allowed opacity-50`;
    }
    
    return baseClasses;
  };

  const tabsProps = isControlled 
    ? { 
        value: (props as FlexibleTabsProps).activeTab, 
        onValueChange: (props as FlexibleTabsProps).onTabChange 
      }
    : { defaultValue };

  return (
    <Tabs {...tabsProps} className={`w-full ${className}`}>
      <TabsList>
        {tabsData.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            disabled={tab.disabled}
            className={getTabTriggerClassName(tab)}
          >
            <span className="flex items-center gap-2 text-xs">
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && (
                <span className="text-[10px] opacity-70">({tab.count})</span>
              )}
              {tab.badge && (
                <span className="text-[9px] ml-2 text-sidebar-accent-foreground font-extralight bg-sidebar-accent/60 rounded-sm">
                  {tab.badge}
                </span>
              )}
              {tab.error && <span className="text-[10px]">⚠️</span>}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>

      {/* Only render content for tabs that have content (not for source tabs) */}
      {tabsData.some(tab => tab.content) && tabsData.map((tab) => (
        <TabsContent 
          key={tab.value} 
          value={tab.value} 
          className="space-y-4 mt-2 h-auto focus-visible:outline-none"
        >
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}; 