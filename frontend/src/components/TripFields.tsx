import { useId } from 'react'
import { formatLongDate, isValidIsoDate, TRIP_TYPE_LABELS } from '../lib/dates'
import type { DraftFields, FieldErrors } from '../lib/draftValidation'
import { inputBase, inputInvalid, labelBase } from '../lib/styles'
import { TRIP_TYPES, type TripDraftField } from '../types'

export interface TripFieldsProps {
  fields: DraftFields
  errors: FieldErrors
  onChange: (field: TripDraftField, value: string) => void
  labels: Record<TripDraftField, string>
  /** AI markers: absent values. */
  missing?: readonly TripDraftField[]
  /** AI markers: ambiguous/invalid values needing clarification. */
  clarification?: readonly TripDraftField[]
  /** Show "Not provided yet" for empty fields without an AI marker. */
  markUnresolved?: boolean
  disabled?: boolean
  /** Field order (manual form uses From/To/Destination/Type). */
  order?: readonly TripDraftField[]
}

const DEFAULT_ORDER: readonly TripDraftField[] = ['destination', 'start_date', 'end_date', 'trip_type']

/** Editable destination / dates / trip type, shared by the review and manual form. */
export function TripFields({
  fields,
  errors,
  onChange,
  labels,
  missing = [],
  clarification = [],
  markUnresolved = false,
  disabled = false,
  order = DEFAULT_ORDER,
}: TripFieldsProps) {
  const baseId = useId()

  function status(field: TripDraftField): { text: string; tone: 'error' | 'muted' } | null {
    const error = errors[field]
    if (error) return { text: error, tone: 'error' }
    if (clarification.includes(field)) return { text: 'Needs clarification', tone: 'error' }
    if (missing.includes(field)) return { text: 'Missing', tone: 'muted' }
    if (markUnresolved && !fields[field]) return { text: 'Not provided yet', tone: 'muted' }
    return null
  }

  return (
    <div className="space-y-4">
      {order.map((field) => {
        const id = `${baseId}-${field}`
        const statusId = `${id}-status`
        const fieldStatus = status(field)
        const invalid = Boolean(errors[field]) || clarification.includes(field)
        const describedBy = fieldStatus ? statusId : undefined
        const className = `${inputBase} ${invalid ? inputInvalid : ''}`
        return (
          <div key={field}>
            <label htmlFor={id} className={labelBase}>
              {labels[field]}
            </label>
            {field === 'destination' && (
              <input
                id={id}
                className={className}
                value={fields.destination}
                maxLength={300}
                onChange={(event) => onChange('destination', event.target.value)}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                disabled={disabled}
              />
            )}
            {(field === 'start_date' || field === 'end_date') && (
              <>
                <input
                  id={id}
                  type="date"
                  className={className}
                  value={fields[field]}
                  onChange={(event) => onChange(field, event.target.value)}
                  aria-invalid={invalid || undefined}
                  aria-describedby={describedBy}
                  disabled={disabled}
                />
                {isValidIsoDate(fields[field]) && (
                  <p className="mt-1 text-sm text-text-muted">{formatLongDate(fields[field])}</p>
                )}
              </>
            )}
            {field === 'trip_type' && (
              <select
                id={id}
                className={className}
                value={fields.trip_type}
                onChange={(event) => onChange('trip_type', event.target.value)}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                disabled={disabled}
              >
                <option value="">Select trip type</option>
                {TRIP_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {TRIP_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            )}
            {fieldStatus && (
              <p
                id={statusId}
                className={`mt-1 text-sm ${fieldStatus.tone === 'error' ? 'text-error' : 'text-text-muted'}`}
              >
                {fieldStatus.text}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
