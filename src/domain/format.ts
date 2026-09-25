import { parseISODate } from './billing';

/** "2026-10-03" -> "Oct 3" in the user's locale. Formatted as UTC so the day never shifts. */
export function formatDueDate(iso: string, withYear = false): string {
  const { y, m, d } = parseISODate(iso);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: withYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  });
}
