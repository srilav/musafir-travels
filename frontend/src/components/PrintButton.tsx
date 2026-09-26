import { useState } from 'react'
import { downloadItineraryPdf } from '../lib/itineraryPdf'
import { buttonPrimary } from '../lib/styles'
import type { Trip } from '../types'

export function PrintButton({ trip }: { trip: Trip }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setBusy(true)
    setError(null)
    try {
      await downloadItineraryPdf(trip)
    } catch {
      setError('Couldn’t generate the PDF. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <button type="button" className={buttonPrimary} onClick={() => void handleClick()} disabled={busy}>
        {busy ? 'Preparing PDF…' : 'Print'}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-sm text-error">
          {error}
        </p>
      )}
    </div>
  )
}
