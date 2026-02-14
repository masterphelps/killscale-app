import { Search } from "lucide-react";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";

interface MediaSearchFormProps {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  isDisabled: boolean;
  placeholder: string;
}

/**
 * MediaSearchForm - Shared search form component
 * 
 * Provides consistent search input and button styling across all media panels.
 * Handles form submission and loading states.
 */
export const MediaSearchForm: React.FC<MediaSearchFormProps> = ({
  searchQuery,
  onSearchQueryChange,
  onSubmit,
  isLoading,
  isDisabled,
  placeholder,
}) => {
  return (
    <form onSubmit={onSubmit} className="flex gap-2 shrink-0">
      <Input
        placeholder={placeholder}
        value={searchQuery}
        className="bg-input text-base font-extralight shadow-none text-foreground"
        style={{ fontSize: '16px', touchAction: 'manipulation' }}
        disabled={isDisabled}
        onChange={(e) => onSearchQueryChange(e.target.value)}
      />
      <Button
        type="submit"
        variant="default"
        size="default"
        disabled={isLoading || isDisabled}
        className="mt-0.5"
      >
        <Search className="h-4 w-4" />
      </Button>
    </form>
  );
}; 