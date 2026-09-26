import { Link } from 'react-router'
import { linkText } from '../lib/styles'

export function BackToTrips() {
  return (
    <Link to="/trips" className={`${linkText} inline-block text-sm`}>
      ← Back to Trips
    </Link>
  )
}
