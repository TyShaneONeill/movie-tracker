/**
 * Utility functions for the app
 */

/**
 * Format a date string as a relative time string
 * e.g., "Just now", "5m ago", "2h ago", "3d ago", "Jan 15"
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'Just now';
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return `${diffInDays}d ago`;
  }

  // For older dates, show formatted date
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
  };

  // Add year if different from current year
  if (date.getFullYear() !== now.getFullYear()) {
    options.year = 'numeric';
  }

  return date.toLocaleDateString('en-US', options);
}

/**
 * Returns true if the given release date is in the future (i.e. movie has not yet been released).
 * Returns false if release date is null, undefined, or already past.
 */
export function isUnreleased(releaseDate: string | null | undefined): boolean {
  if (!releaseDate) return false;
  // Compare YYYY-MM-DD strings directly to avoid UTC timezone parsing issues.
  // en-CA locale reliably formats as YYYY-MM-DD in the user's local timezone.
  const today = new Date().toLocaleDateString('en-CA');
  return releaseDate > today;
}
