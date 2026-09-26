import { describe, expect, it } from 'vitest'
import { formatDateRange, formatLongDate, isValidIsoDate, isValidTimezone, todayLocalIso } from './dates'

describe('dates', () => {
  it('validates strict YYYY-MM-DD calendar dates', () => {
    expect(isValidIsoDate('2027-04-03')).toBe(true)
    expect(isValidIsoDate('2028-02-29')).toBe(true)
    expect(isValidIsoDate('2027-02-29')).toBe(false)
    expect(isValidIsoDate('2027-13-01')).toBe(false)
    expect(isValidIsoDate('03/04/2027')).toBe(false)
    expect(isValidIsoDate('2027-4-3')).toBe(false)
    expect(isValidIsoDate(null)).toBe(false)
  })

  it('formats with written month names and four-digit years', () => {
    expect(formatLongDate('2027-04-03')).toBe('3 April 2027')
    expect(formatDateRange('2027-04-03', '2027-04-05')).toBe('3 April 2027 – 5 April 2027')
    expect(formatDateRange('2027-04-03', '2027-04-03')).toBe('3 April 2027')
  })

  it('uses the local calendar date', () => {
    expect(todayLocalIso(new Date(2026, 8, 24, 23, 59))).toBe('2026-09-24')
  })

  it('validates IANA timezones', () => {
    expect(isValidTimezone('Asia/Kolkata')).toBe(true)
    expect(isValidTimezone('Not/AZone')).toBe(false)
    expect(isValidTimezone('')).toBe(false)
  })
})
