import { Link } from 'react-router'
import { formatDateRange, TRIP_TYPE_LABELS } from '../lib/dates'
import type { TripSummary } from '../types'

export function TripListItem({ trip }: { trip: TripSummary }) {
  return (
    <li>
      <Link
        to={`/trips/${trip.id}`}
        className="flex flex-col gap-1 rounded-md border border-border bg-surface px-4 py-3 hover:border-primary focus-visible:outline-2 focus-visible:outline-primary sm:flex-row sm:items-center sm:justify-between"
      >
        <span className="font-semibold text-primary">{trip.destination}</span>
        <span className="text-sm text-text-muted">
          {formatDateRange(trip.start_date, trip.end_date)} · {TRIP_TYPE_LABELS[trip.trip_type] ?? trip.trip_type}
        </span>
      </Link>
    </li>
  )
}
