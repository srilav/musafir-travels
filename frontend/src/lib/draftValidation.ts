import { TRIP_TYPES, type CreateTripRequest, type TripDraft, type TripDraftField, type TripType } from '../types'
import { isValidIsoDate } from './dates'

export const MAX_DESTINATION_CHARS = 300

/** Editable form values; an empty string means unresolved. */
export interface DraftFields {
  destination: string
  start_date: string
  end_date: string
  trip_type: TripType | ''
}

export const EMPTY_FIELDS: DraftFields = { destination: '', start_date: '', end_date: '', trip_type: '' }

export type FieldErrors = Partial<Record<TripDraftField, string>>

export function isTripType(value: unknown): value is TripType {
  return typeof value === 'string' && (TRIP_TYPES as readonly string[]).includes(value)
}

/** Whether one field's value is valid on its own (ignores range conflicts). */
export function isFieldValueValid(field: TripDraftField, fields: DraftFields): boolean {
  switch (field) {
    case 'destination': {
      const trimmed = fields.destination.trim()
      return trimmed.length > 0 && trimmed.length <= MAX_DESTINATION_CHARS
    }
    case 'start_date':
      return isValidIsoDate(fields.start_date)
    case 'end_date':
      return isValidIsoDate(fields.end_date)
    case 'trip_type':
      return isTripType(fields.trip_type)
  }
}

/**
 * Errors for values that are present but invalid (including a reversed date
 * range). Empty fields are "unresolved", not errors.
 */
export function getFieldErrors(fields: DraftFields): FieldErrors {
  const errors: FieldErrors = {}
  const destination = fields.destination.trim()
  if (fields.destination.length > 0 && destination.length === 0) {
    errors.destination = 'Destination cannot be blank.'
  } else if (destination.length > MAX_DESTINATION_CHARS) {
    errors.destination = `Destination must be at most ${MAX_DESTINATION_CHARS} characters.`
  }
  if (fields.start_date && !isValidIsoDate(fields.start_date)) errors.start_date = 'Enter a valid start date.'
  if (fields.end_date && !isValidIsoDate(fields.end_date)) errors.end_date = 'Enter a valid end date.'
  if (
    !errors.start_date &&
    !errors.end_date &&
    fields.start_date &&
    fields.end_date &&
    fields.end_date < fields.start_date
  ) {
    errors.end_date = 'End date must be on or after the start date.'
  }
  if (fields.trip_type && !isTripType(fields.trip_type)) errors.trip_type = 'Choose a valid trip type.'
  return errors
}

export function hasFieldErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0
}

/** Convert form values to the AI contract's TripDraft (null = unresolved). */
export function toTripDraft(fields: DraftFields): TripDraft {
  const destination = fields.destination.trim()
  return {
    destination: destination ? destination : null,
    start_date: fields.start_date || null,
    end_date: fields.end_date || null,
    trip_type: fields.trip_type || null,
  }
}

export function fromTripDraft(draft: TripDraft): DraftFields {
  return {
    destination: draft.destination ?? '',
    start_date: draft.start_date ?? '',
    end_date: draft.end_date ?? '',
    trip_type: draft.trip_type ?? '',
  }
}

/** Keep only individually valid values (used when returning to chat from manual mode). */
export function keepValidFields(fields: DraftFields): DraftFields {
  const errors = getFieldErrors(fields)
  return {
    destination: !errors.destination && isFieldValueValid('destination', fields) ? fields.destination.trim() : '',
    start_date: !errors.start_date && isFieldValueValid('start_date', fields) ? fields.start_date : '',
    end_date: !errors.end_date && isFieldValueValid('end_date', fields) ? fields.end_date : '',
    trip_type: isTripType(fields.trip_type) ? fields.trip_type : '',
  }
}

/** A complete, valid CreateTripRequest, or null when anything is missing/invalid. */
export function toCreateTripRequest(fields: DraftFields): CreateTripRequest | null {
  if (hasFieldErrors(getFieldErrors(fields))) return null
  const destination = fields.destination.trim()
  if (!destination || !isValidIsoDate(fields.start_date) || !isValidIsoDate(fields.end_date)) return null
  if (!isTripType(fields.trip_type)) return null
  return {
    destination,
    start_date: fields.start_date,
    end_date: fields.end_date,
    trip_type: fields.trip_type,
  }
}
