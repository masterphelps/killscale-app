/**
 * Lightweight time utility to replace date-fns formatDistanceToNow
 * Formats the distance between a given date and now in a human-readable format
 * 
 * @param date - The date to format the distance from
 * @param options - Options object (compatible with date-fns API)
 * @returns A human-readable string representing the time distance
 */
export function formatDistanceToNow(
  date: Date | number, 
  options?: { addSuffix?: boolean }
): string {
  const now = new Date();
  const then = new Date(date);
  const diffInMs = now.getTime() - then.getTime();
  const diffInSeconds = Math.floor(diffInMs / 1000);
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);
  
  let result: string;
  
  if (diffInSeconds < 60) {
    result = diffInSeconds <= 1 ? 'just now' : `${diffInSeconds} seconds`;
  } else if (diffInMinutes < 60) {
    result = diffInMinutes === 1 ? '1 minute' : `${diffInMinutes} minutes`;
  } else if (diffInHours < 24) {
    result = diffInHours === 1 ? '1 hour' : `${diffInHours} hours`;
  } else if (diffInDays < 30) {
    result = diffInDays === 1 ? '1 day' : `${diffInDays} days`;
  } else {
    // For dates older than 30 days, show the actual date
    return then.toLocaleDateString();
  }
  
  // Add suffix if requested (mimics date-fns behavior)
  if (options?.addSuffix && result !== 'just now') {
    result += ' ago';
  }
  
  return result;
} 