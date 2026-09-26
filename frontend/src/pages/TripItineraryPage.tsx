import { useState } from 'react'
import { useParams } from 'react-router'
import { ApiError, getErrorMessage } from '../api/client'
import { useTrip } from '../api/trips'
import { BackToTrips } from '../components/BackToTrips'
import { DayPlanner } from '../components/DayPlanner'
import { DeleteTripButton } from '../components/DeleteTripButton'
import { PrintButton } from '../components/PrintButton'
import { Spinner } from '../components/Spinner'
import { formatDateRange, TRIP_TYPE_LABELS } from '../lib/dates'
import { buttonSecondary, card } from '../lib/styles'

export function TripItineraryPage() {
  const { tripId = '' } = useParams()
  const trip = useTrip(tripId)
  const [expandedDayId, setExpandedDayId] = useState<string | null>(null)

  let content
  if (trip.isPending) {
    content = <Spinner label="Loading itinerary…" />
  } else if (trip.isError) {
    const notFound = trip.error instanceof ApiError && trip.error.status === 404
    content = (
      <div className={`${card} space-y-3`}>
        <p role="alert" className="text-error">
          {notFound ? 'This trip doesn’t exist or isn’t yours.' : `Couldn’t load this trip. ${getErrorMessage(trip.error)}`}
        </p>
        {!notFound && (
          <button type="button" className={buttonSecondary} onClick={() => void trip.refetch()}>
            Try again
          </button>
        )}
      </div>
    )
  } else {
    const data = trip.data
    const hasActivities = data.days.some((day) => day.activities.length > 0)
    const days = [...data.days].sort((a, b) => a.day_number - b.day_number)
    content = (
      <div className="space-y-4">
        <div className={`${card} flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between`}>
          <div>
            <h1 className="text-2xl font-bold text-primary">{data.destination}</h1>
            <p className="text-text-muted">
              {formatDateRange(data.start_date, data.end_date)} · {TRIP_TYPE_LABELS[data.trip_type] ?? data.trip_type}
            </p>
          </div>
          {hasActivities && (
            <div className="flex flex-wrap items-start gap-2">
              <PrintButton trip={data} />
              <DeleteTripButton tripId={data.id} destination={data.destination} />
            </div>
          )}
        </div>
        {!hasActivities && (
          <p className="text-sm text-text-muted">
            Tap a day to start adding activities. Print and Delete appear once your trip has activities.
          </p>
        )}
        <div className="space-y-3">
          {days.map((day) => (
            <DayPlanner
              key={day.id}
              tripId={data.id}
              day={day}
              expanded={expandedDayId === day.id}
              onToggle={() => setExpandedDayId((current) => (current === day.id ? null : day.id))}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <BackToTrips />
      {content}
    </div>
  )
}
