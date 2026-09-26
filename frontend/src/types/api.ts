/**
 * Shared types mirroring api-contract-spec.md §5 exactly (snake_case, no
 * alias/conversion layer).
 */

export type TripType = 'solo' | 'couple' | 'family' | 'group_of_friends'

export const TRIP_TYPES: readonly TripType[] = ['solo', 'couple', 'family', 'group_of_friends']

export interface TripSummary {
  id: string
  destination: string
  start_date: string
  end_date: string
  trip_type: TripType
  created_at: string
}

export interface Activity {
  id: string
  text: string
  sort_order: number
  created_at: string
}

export interface Day {
  id: string
  day_number: number
  date: string
  activities: Activity[]
}

export interface Trip extends TripSummary {
  days: Day[]
}

export interface LoginRequest {
  username: string
  password: string
}

export type SignupRequest = LoginRequest

export interface AuthResponse {
  access_token: string
  token_type: string
  expires_in: number
  username: string
}

export interface CreateTripRequest {
  destination: string
  start_date: string
  end_date: string
  trip_type: TripType
}

export interface CreateActivityRequest {
  text: string
}

export type UpdateActivityRequest = CreateActivityRequest

// ---- AI draft schemas (approved enhancement) ----

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export type TripDraftField = 'destination' | 'start_date' | 'end_date' | 'trip_type'

export const TRIP_DRAFT_FIELDS: readonly TripDraftField[] = [
  'destination',
  'start_date',
  'end_date',
  'trip_type',
]

export interface TripDraft {
  destination: string | null
  start_date: string | null
  end_date: string | null
  trip_type: TripType | null
}

export interface TripDraftRequest {
  messages: ChatMessage[]
  draft: TripDraft
  reference_date: string
  timezone: string
}

export interface TripDraftResponse {
  draft: TripDraft
  missing_fields: TripDraftField[]
  clarification_fields: TripDraftField[]
  reply: string
}

// ---- Error body shapes (§3) ----

export interface ValidationErrorItem {
  loc: (string | number)[]
  msg: string
  type: string
}

export interface ErrorBody {
  detail: string | ValidationErrorItem[]
}
