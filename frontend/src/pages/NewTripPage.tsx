import { useAuth } from '../auth/authState'
import { BackToTrips } from '../components/BackToTrips'
import { TripChat } from '../components/TripChat'

export function NewTripPage() {
  const { username } = useAuth()
  return (
    <div className="space-y-4">
      <BackToTrips />
      {/* Keyed by account so a different sign-in never sees another account's flow. */}
      {username && <TripChat key={username} account={username} />}
    </div>
  )
}
