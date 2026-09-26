import { isValidIsoDate } from '../lib/dates'
import { isTripType } from '../lib/draftValidation'
import { charCount, MAX_MESSAGE_CHARS } from '../lib/limits'
import { TRIP_DRAFT_FIELDS, type TripDraft, type TripDraftField, type TripDraftRequest, type TripDraftResponse } from '../types'
import { ApiError, apiRequest } from './client'

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isDraft(value: unknown): value is TripDraft {
  if (typeof value !== 'object' || value === null) return false
  const draft = value as Record<string, unknown>
  const keys = Object.keys(draft)
  if (keys.length !== 4 || !TRIP_DRAFT_FIELDS.every((field) => field in draft)) return false
  if (!isNullableString(draft.destination)) return false
  if (typeof draft.destination === 'string' && draft.destination.trim().length === 0) return false
  if (draft.start_date !== null && !isValidIsoDate(draft.start_date)) return false
  if (draft.end_date !== null && !isValidIsoDate(draft.end_date)) return false
  if (draft.trip_type !== null && !isTripType(draft.trip_type)) return false
  if (typeof draft.start_date === 'string' && typeof draft.end_date === 'string' && draft.end_date < draft.start_date) {
    return false
  }
  return true
}

function isFieldList(value: unknown): value is TripDraftField[] {
  return (
    Array.isArray(value) &&
    value.every((item) => (TRIP_DRAFT_FIELDS as readonly unknown[]).includes(item)) &&
    new Set(value).size === value.length
  )
}

/** Structural check of a TripDraftResponse; anything else is treated as a 502. */
export function isTripDraftResponse(value: unknown): value is TripDraftResponse {
  if (typeof value !== 'object' || value === null) return false
  const body = value as Record<string, unknown>
  if (
    !isDraft(body.draft) ||
    !isFieldList(body.missing_fields) ||
    !isFieldList(body.clarification_fields) ||
    typeof body.reply !== 'string' ||
    body.reply.trim().length === 0 ||
    charCount(body.reply) > MAX_MESSAGE_CHARS
  ) {
    return false
  }
  // Lists are disjoint and together cover exactly the null fields.
  const draft = body.draft
  const missing = body.missing_fields
  const clarification = body.clarification_fields
  return TRIP_DRAFT_FIELDS.every((field) => {
    const inMissing = missing.includes(field)
    const inClarification = clarification.includes(field)
    if (inMissing && inClarification) return false
    return draft[field] === null ? inMissing || inClarification : !inMissing && !inClarification
  })
}

/** One stateless AI turn: `POST /ai/trip-draft`. */
export async function postTripDraft(request: TripDraftRequest, signal?: AbortSignal): Promise<TripDraftResponse> {
  const body = await apiRequest<unknown>('/ai/trip-draft', { method: 'POST', body: request, signal })
  if (!isTripDraftResponse(body)) {
    throw new ApiError(502, 'The assistant returned an invalid response.')
  }
  return body
}
