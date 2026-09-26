import type { Ref } from 'react'
import { formatDateRange, TRIP_TYPE_LABELS } from '../lib/dates'
import type { DraftFields, FieldErrors } from '../lib/draftValidation'
import { buttonPrimary, card } from '../lib/styles'
import type { CreateTripRequest, TripDraftField } from '../types'
import { TripFields } from './TripFields'

interface TripDraftReviewProps {
  fields: DraftFields
  errors: FieldErrors
  missing: readonly TripDraftField[]
  clarification: readonly TripDraftField[]
  /** The complete, validated request when every field is resolved. */
  complete: CreateTripRequest | null
  onChange: (field: TripDraftField, value: string) => void
  onCreate: () => void
  canCreate: boolean
  creating: boolean
  headingRef?: Ref<HTMLHeadingElement>
}

const LABELS: Record<TripDraftField, string> = {
  destination: 'Destination',
  start_date: 'Start date',
  end_date: 'End date',
  trip_type: 'Trip type',
}

/** Editable extracted trip details with a written-month summary. */
export function TripDraftReview({
  fields,
  errors,
  missing,
  clarification,
  complete,
  onChange,
  onCreate,
  canCreate,
  creating,
  headingRef,
}: TripDraftReviewProps) {
  return (
    <section className={`${card} space-y-4`} aria-labelledby="trip-review-heading">
      <h2 id="trip-review-heading" ref={headingRef} tabIndex={-1} className="text-lg font-semibold focus:outline-none">
        Review trip details
      </h2>
      {complete ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md bg-background px-3 py-2 text-sm" aria-label="Trip summary">
          <dt className="text-text-muted">Destination</dt>
          <dd className="font-medium">{complete.destination}</dd>
          <dt className="text-text-muted">Dates</dt>
          <dd className="font-medium">{formatDateRange(complete.start_date, complete.end_date)}</dd>
          <dt className="text-text-muted">Trip type</dt>
          <dd className="font-medium">{TRIP_TYPE_LABELS[complete.trip_type]}</dd>
        </dl>
      ) : (
        <p className="text-sm text-text-muted">
          Details appear here as you chat. You can also edit them directly.
        </p>
      )}
      <TripFields
        fields={fields}
        errors={errors}
        onChange={onChange}
        labels={LABELS}
        missing={missing}
        clarification={clarification}
        markUnresolved
        disabled={creating}
      />
      <button type="button" className={`${buttonPrimary} w-full sm:w-auto`} onClick={onCreate} disabled={!canCreate}>
        {creating ? 'Creating trip…' : 'Create trip'}
      </button>
    </section>
  )
}
