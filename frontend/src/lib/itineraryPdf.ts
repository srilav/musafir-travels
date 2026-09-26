import { formatLongDate, formatLongDateWithWeekday, TRIP_TYPE_LABELS } from './dates'
import type { Trip } from '../types'

export type PdfLine =
  | { kind: 'title'; text: string }
  | { kind: 'subtitle'; text: string }
  | { kind: 'day'; text: string }
  | { kind: 'item'; text: string }
  | { kind: 'empty'; text: string }

/** Plain text list per day: trip header, then each Day heading with its activities as bullets. */
export function buildItineraryLines(trip: Trip): PdfLine[] {
  const range =
    trip.start_date === trip.end_date
      ? formatLongDate(trip.start_date)
      : `${formatLongDate(trip.start_date)} to ${formatLongDate(trip.end_date)}`
  const lines: PdfLine[] = [
    { kind: 'title', text: trip.destination },
    { kind: 'subtitle', text: `${range} (${TRIP_TYPE_LABELS[trip.trip_type] ?? trip.trip_type})` },
  ]
  const days = [...trip.days].sort((a, b) => a.day_number - b.day_number)
  for (const day of days) {
    lines.push({ kind: 'day', text: `Day ${day.day_number} - ${formatLongDateWithWeekday(day.date)}` })
    const activities = [...day.activities].sort((a, b) => a.sort_order - b.sort_order)
    if (activities.length === 0) lines.push({ kind: 'empty', text: 'No activities planned.' })
    for (const activity of activities) lines.push({ kind: 'item', text: activity.text })
  }
  return lines
}

export function itineraryFileName(trip: Trip): string {
  const slug = trip.destination
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'trip'}-itinerary.pdf`
}

/** Generate the PDF client-side and trigger a browser download. */
export async function downloadItineraryPdf(trip: Trip): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 56
  const pageHeight = doc.internal.pageSize.getHeight()
  const width = doc.internal.pageSize.getWidth() - margin * 2
  let y = margin

  const write = (text: string, size: number, style: 'normal' | 'bold', indent = 0, gapBefore = 0) => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    const wrapped = doc.splitTextToSize(text, width - indent) as string[]
    const lineHeight = size * 1.35
    y += gapBefore
    for (const line of wrapped) {
      if (y + lineHeight > pageHeight - margin) {
        doc.addPage()
        y = margin
      }
      doc.text(line, margin + indent, y)
      y += lineHeight
    }
  }

  for (const line of buildItineraryLines(trip)) {
    switch (line.kind) {
      case 'title':
        write(line.text, 20, 'bold')
        break
      case 'subtitle':
        write(line.text, 12, 'normal', 0, 2)
        break
      case 'day':
        write(line.text, 14, 'bold', 0, 14)
        break
      case 'item':
        write(`- ${line.text}`, 11, 'normal', 14)
        break
      case 'empty':
        write(line.text, 11, 'normal', 14)
        break
    }
  }

  doc.save(itineraryFileName(trip))
}
