import { Play } from "lucide-react";
import { useState } from "react";

interface TemplateThumbnailProps {
  thumbnail?: string;
  name: string;
  className?: string;
}

export const TemplateThumbnail: React.FC<TemplateThumbnailProps> = ({
  thumbnail,
  name,
  className = "",
}) => {
  const [imageError, setImageError] = useState(false);

  // Show fallback if no thumbnail or if image failed to load
  if (!thumbnail || imageError) {
    return (
      <div
        className={`relative aspect-video overflow-hidden rounded-lg ${className} bg-linear-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center`}
      >
        <Play className="w-8 h-8 text-gray-400 dark:text-gray-500" />
      </div>
    );
  }

  return (
    <div
      className={`relative aspect-video overflow-hidden rounded-lg ${className}`}
    >
      <img
        src={thumbnail}
        alt={name}
        className="absolute inset-0 w-full h-full object-cover"
        onError={() => setImageError(true)}
      />
      <div className="absolute inset-0 bg-black/10" />
    </div>
  );
};
