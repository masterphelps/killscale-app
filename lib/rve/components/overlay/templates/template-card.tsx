import { TemplateThumbnail } from "./template-thumbnail";
import { TemplateOverlay } from "../../../types";
import { Card, CardHeader, CardTitle } from "../../ui/card";

/**
 * Type for templates with source attribution
 */
type TemplateWithSource = TemplateOverlay & {
  _source: string;
  _sourceDisplayName: string;
};

interface TemplateCardProps {
  template: TemplateWithSource;
  onClick: (template: TemplateOverlay) => void;
}

export const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  onClick,
}) => {
  return (
    <Card
      className="cursor-pointer transition-all duration-200 bg-card border border-border hover:shadow-lg shadow-none"
      onClick={() => onClick(template)}
    >
      <CardHeader className="p-3 space-y-3">
        <div className="aspect-video w-full overflow-hidden rounded-md">
          <TemplateThumbnail
            {...(template.thumbnail && { thumbnail: template.thumbnail })}
            name={template.name}
          />
        </div>
        
        <div className="space-y-2">
          <CardTitle className="text-sm text-foreground font-extralight leading-tight">
            {template.name}
          </CardTitle>
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {template.description}
          </p>
        </div>
        
        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-1.5">
              {template.tags.slice(0, 3).map((tag, index) => (
                <span
                  key={index}
                  className="px-2 py-1 bg-primary/10 text-primary rounded text-[10px] font-extralight"
                >
                  {tag}
                </span>
              ))}
              {template.tags.length > 3 && (
                <span className="text-xs text-muted-foreground self-center">
                  +{template.tags.length - 3}
                </span>
              )}
            </div>
            
            <div className="text-xs text-muted-foreground">
              {new Date(template.updatedAt).toLocaleDateString()}
            </div>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}; 