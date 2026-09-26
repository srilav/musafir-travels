import type { TripType } from '../types'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Parse a strict `YYYY-MM-DD` calendar date. Returns null when invalid. */
export function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = ISO_DATE.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1) return null
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (day > daysInMonth) return null
  return { year, month, day }
}

export function isValidIsoDate(value: unknown): value is string {
  return typeof value === 'string' && parseIsoDate(value) !== null
}

/** "3 April 2027" — written month name and four-digit year, locale-independent. */
export function formatLongDate(value: string): string {
  const parsed = parseIsoDate(value)
  if (!parsed) return value
  return `${parsed.day} ${MONTHS[parsed.month - 1]} ${String(parsed.year).padStart(4, '0')}`
}

/** "Saturday, 3 April 2027" */
export function formatLongDateWithWeekday(value: string): string {
  const parsed = parseIsoDate(value)
  if (!parsed) return value
  const weekday = WEEKDAYS[new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay()]
  return `${weekday}, ${formatLongDate(value)}`
}

/** "3 April 2027 – 5 April 2027" (or a single date for same-day trips). */
export function formatDateRange(start: string, end: string): string {
  if (start === end) return formatLongDate(start)
  return `${formatLongDate(start)} – ${formatLongDate(end)}`
}

/** The user's local calendar date as `YYYY-MM-DD` (no UTC conversion). */
export function todayLocalIso(now: Date = new Date()): string {
  const year = String(now.getFullYear()).padStart(4, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isValidTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 100) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

/** The browser's IANA timezone identifier, falling back to UTC. */
export function localTimezone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return isValidTimezone(zone) ? zone : 'UTC'
  } catch {
    return 'UTC'
  }
}

export const TRIP_TYPE_LABELS: Record<TripType, string> = {
  solo: 'Solo',
  couple: 'Couple',
  family: 'Family',
  group_of_friends: 'Group of friends',
}
