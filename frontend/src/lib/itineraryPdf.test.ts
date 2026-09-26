import { describe, expect, it } from 'vitest'
import type { Trip } from '../types'
import { buildItineraryLines, itineraryFileName } from './itineraryPdf'

const trip: Trip = {
  id: 't1',
  destination: 'Kyoto, Japan',
  start_date: '2026-10-01',
  end_date: '2026-10-02',
  trip_type: 'couple',
  created_at: '2026-09-16T10:00:00Z',
  days: [
    { id: 'd2', day_number: 2, date: '2026-10-02', activities: [] },
    {
      id: 'd1',
      day_number: 1,
      date: '2026-10-01',
      activities: [
        { id: 'a2', text: 'Tea ceremony', sort_order: 1, created_at: '' },
        { id: 'a1', text: 'Visit Fushimi Inari', sort_order: 0, created_at: '' },
      ],
    },
  ],
}

describe('itinerary PDF content', () => {
  it('is a plain text list per day in order', () => {
    expect(buildItineraryLines(trip)).toEqual([
      { kind: 'title', text: 'Kyoto, Japan' },
      { kind: 'subtitle', text: '1 October 2026 to 2 October 2026 (Couple)' },
      { kind: 'day', text: 'Day 1 - Thursday, 1 October 2026' },
      { kind: 'item', text: 'Visit Fushimi Inari' },
      { kind: 'item', text: 'Tea ceremony' },
      { kind: 'day', text: 'Day 2 - Friday, 2 October 2026' },
      { kind: 'empty', text: 'No activities planned.' },
    ])
  })

  it('derives a safe file name', () => {
    expect(itineraryFileName(trip)).toBe('kyoto-japan-itinerary.pdf')
  })
})
