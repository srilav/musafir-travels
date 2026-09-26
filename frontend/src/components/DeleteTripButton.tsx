import { useState } from 'react'
import { useNavigate } from 'react-router'
import { getErrorMessage } from '../api/client'
import { useDeleteTrip } from '../api/trips'
import { buttonDanger, buttonSecondary } from '../lib/styles'

export function DeleteTripButton({ tripId, destination }: { tripId: string; destination: string }) {
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const remove = useDeleteTrip({ onDeleted: () => navigate('/trips', { replace: true }) })

  if (!confirming) {
    return (
      <button type="button" className={buttonDanger} onClick={() => setConfirming(true)}>
        Delete
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm">Delete the trip to {destination}? This can’t be undone.</p>
      <div className="flex gap-2">
        <button
          type="button"
          className={buttonDanger}
          disabled={remove.isPending}
          onClick={() => remove.mutate(tripId)}
        >
          {remove.isPending ? 'Deleting…' : 'Yes, delete trip'}
        </button>
        <button
          type="button"
          className={buttonSecondary}
          disabled={remove.isPending}
          onClick={() => {
            setConfirming(false)
            remove.reset()
          }}
        >
          Cancel
        </button>
      </div>
      {remove.isError && (
        <p role="alert" className="text-sm text-error">
          Couldn’t delete the trip: {getErrorMessage(remove.error)}
        </p>
      )}
    </div>
  )
}
