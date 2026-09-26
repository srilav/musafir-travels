import { Link } from 'react-router'
import { getErrorMessage } from '../api/client'
import { useTrips } from '../api/trips'
import { Spinner } from '../components/Spinner'
import { TripListItem } from '../components/TripListItem'
import { buttonPrimary, buttonSecondary, card } from '../lib/styles'

export function HomePage() {
  const trips = useTrips()

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Welcome to Musafir Travels</h1>
        <Link to="/trips/new" className={buttonPrimary}>
          Add New Trip
        </Link>
      </div>

      <section className={card} aria-labelledby="trip-plan-heading">
        <h2 id="trip-plan-heading" className="mb-4 text-lg font-semibold">
          Trip Plan
        </h2>
        {trips.isPending ? (
          <Spinner label="Loading your trips…" />
        ) : trips.isError ? (
          <div className="space-y-3">
            <p role="alert" className="text-error">
              Couldn’t load your trips. {getErrorMessage(trips.error)}
            </p>
            <button type="button" className={buttonSecondary} onClick={() => void trips.refetch()}>
              Try again
            </button>
          </div>
        ) : trips.data.length === 0 ? (
          <div className="space-y-3 py-4 text-center">
            <p className="text-text-muted">You haven’t planned any trips yet.</p>
            <Link to="/trips/new" className={buttonPrimary}>
              Add New Trip
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {trips.data.map((trip) => (
              <TripListItem key={trip.id} trip={trip} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
