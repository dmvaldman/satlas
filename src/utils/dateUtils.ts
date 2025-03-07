/**
 * Formats a timestamp into a relative time string (e.g., "2 days ago")
 * @param timestamp Firestore Timestamp, Unix timestamp in milliseconds, Date object, or undefined
 * @returns Formatted relative time string
 */
export function formatRelativeTime(timestamp: any): string {
  if (!timestamp) return '';

  let timeMs: number;

  // Handle Firestore Timestamp object
  if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp && 'nanoseconds' in timestamp) {
    // Convert Firestore Timestamp to milliseconds
    timeMs = timestamp.seconds * 1000;
  } else if (timestamp instanceof Date) {
    // Handle JavaScript Date object
    timeMs = timestamp.getTime();
  } else {
    // Handle numeric timestamp (milliseconds)
    timeMs = timestamp;
  }

  const now = Date.now();
  const diffMs = now - timeMs;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffSec < 60) {
    return 'just now';
  } else if (diffMin < 60) {
    return `${diffMin} ${diffMin === 1 ? 'minute' : 'minutes'} ago`;
  } else if (diffHour < 24) {
    return `${diffHour} ${diffHour === 1 ? 'hour' : 'hours'} ago`;
  } else if (diffDay < 30) {
    return `${diffDay} ${diffDay === 1 ? 'day' : 'days'} ago`;
  } else if (diffMonth < 12) {
    return `${diffMonth} ${diffMonth === 1 ? 'month' : 'months'} ago`;
  } else {
    return `${diffYear} ${diffYear === 1 ? 'year' : 'years'} ago`;
  }
}