import type { FormEvent } from 'react'
import type { DraftFields, FieldErrors } from '../lib/draftValidation'
import { buttonPrimary, card } from '../lib/styles'
import type { TripDraftField } from '../types'
import { TripFields } from './TripFields'

interface NewTripFormProps {
  fields: DraftFields
  errors: FieldErrors
  missing: readonly TripDraftField[]
  clarification: readonly TripDraftField[]
  onChange: (field: TripDraftField, value: string) => void
  onSubmit: () => void
  canSubmit: boolean
  submitting: boolean
}

const LABELS: Record<TripDraftField, string> = {
  start_date: 'From date',
  end_date: 'To date',
  destination: 'Destination',
  trip_type: 'Trip Type',
}

const ORDER: readonly TripDraftField[] = ['start_date', 'end_date', 'destination', 'trip_type']

/** Manual entry (and AI fallback). Never preselects a trip type. */
export function NewTripForm({ fields, errors, missing, clarification, onChange, onSubmit, canSubmit, submitting }: NewTripFormProps) {
  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (canSubmit) onSubmit()
  }

  return (
    <form className={`${card} max-w-xl space-y-4`} onSubmit={handleSubmit} noValidate aria-labelledby="manual-heading">
      <h2 id="manual-heading" className="text-lg font-semibold">
        Enter trip details
      </h2>
      <TripFields
        fields={fields}
        errors={errors}
        onChange={onChange}
        labels={LABELS}
        order={ORDER}
        missing={missing}
        clarification={clarification}
        disabled={submitting}
      />
      <button type="submit" className={`${buttonPrimary} w-full sm:w-auto`} disabled={!canSubmit}>
        {submitting ? 'Creating trip…' : 'Create trip'}
      </button>
    </form>
  )
}
