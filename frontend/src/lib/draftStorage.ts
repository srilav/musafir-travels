/**
 * Browser-local restoration of one unfinished trip-creation flow per account
 * (frontend-spec §12). Namespaced by backend environment (API base URL) and
 * account; validated on restore; deleted on logout with late writes suppressed.
 */
import { API_BASE_URL } from '../config'
import { TRIP_DRAFT_FIELDS, type ChatRole, type TripDraftField } from '../types'
import { isValidIsoDate, isValidTimezone } from './dates'
import { isTripType, type DraftFields } from './draftValidation'
import { charCount, MAX_CONVERSATION_MESSAGES, MAX_MESSAGE_CHARS } from './limits'

export const DRAFT_SCHEMA_VERSION = 1
const KEY_PREFIX = 'musafir.tripDraft'
const MAX_FIELD_CHARS = 1000
const MAX_COMPOSER_CHARS = 50_000
const MAX_UI_ONLY_ENTRIES = 40

export type FlowMode = 'chat' | 'manual'

export interface StoredMessage {
  role: ChatRole
  content: string
  /** UI-only entries (e.g. a chat confirmation) are shown but never sent to the AI. */
  ui_only: boolean
}

export interface StoredDraft {
  schema_version: typeof DRAFT_SCHEMA_VERSION
  account: string
  api_base_url: string
  updated_at: string
  mode: FlowMode
  messages: StoredMessage[]
  fields: DraftFields
  missing_fields: TripDraftField[]
  clarification_fields: TripDraftField[]
  composer: string
  reference_date: string
  timezone: string
  creation_in_progress: boolean
  uncertain_outcome: boolean
}

export function draftStorageKey(account: string, apiBaseUrl: string = API_BASE_URL): string {
  return `${KEY_PREFIX}:v${DRAFT_SCHEMA_VERSION}:${encodeURIComponent(apiBaseUrl)}:${encodeURIComponent(account)}`
}

function getStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

/** Probe whether localStorage can be written right now. */
export function isStorageAvailable(): boolean {
  const storage = getStorage()
  if (!storage) return false
  const probe = `${KEY_PREFIX}:probe`
  try {
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

// ---- Session generation: suppresses persistence after logout ----

let generation = 0

export function getStorageGeneration(): number {
  return generation
}

/**
 * Delete the account's saved draft (captured key) and invalidate every writer
 * created before this point, so late responses cannot recreate the draft.
 */
export function clearDraftOnLogout(key: string | null): void {
  generation += 1
  if (key) removeDraft(key)
}

export function removeDraft(key: string): void {
  try {
    getStorage()?.removeItem(key)
  } catch {
    // Storage unavailable: nothing persisted to remove.
  }
}

export type SaveResult = 'saved' | 'suppressed' | 'failed'

export function saveDraft(key: string, draft: StoredDraft, writerGeneration: number): SaveResult {
  if (writerGeneration !== generation) return 'suppressed'
  const storage = getStorage()
  if (!storage) return 'failed'
  try {
    storage.setItem(key, JSON.stringify(draft))
    return 'saved'
  } catch {
    return 'failed'
  }
}

export type LoadResult =
  | { status: 'none' }
  | { status: 'restored'; draft: StoredDraft }
  | { status: 'invalid' }
  | { status: 'unavailable' }

export function loadDraft(key: string, expected: { account: string; apiBaseUrl: string }): LoadResult {
  const storage = getStorage()
  if (!storage) return { status: 'unavailable' }
  let raw: string | null
  try {
    raw = storage.getItem(key)
  } catch {
    return { status: 'unavailable' }
  }
  if (raw === null) return { status: 'none' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    removeDraft(key)
    return { status: 'invalid' }
  }
  const draft = validateStoredDraft(parsed, expected)
  if (!draft) {
    removeDraft(key)
    return { status: 'invalid' }
  }
  return { status: 'restored', draft }
}

// ---- Validation ----

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max
}

function validateMessages(value: unknown): StoredMessage[] | null {
  if (!Array.isArray(value)) return null
  const messages: StoredMessage[] = []
  let conversationCount = 0
  let uiOnlyCount = 0
  for (const item of value) {
    if (!isRecord(item)) return null
    const { role, content, ui_only: uiOnly } = item
    if (role !== 'user' && role !== 'assistant') return null
    if (typeof content !== 'string' || content.trim().length === 0) return null
    if (charCount(content) > MAX_MESSAGE_CHARS) return null
    if (typeof uiOnly !== 'boolean') return null
    if (uiOnly) uiOnlyCount += 1
    else conversationCount += 1
    messages.push({ role, content, ui_only: uiOnly })
  }
  if (conversationCount > MAX_CONVERSATION_MESSAGES || uiOnlyCount > MAX_UI_ONLY_ENTRIES) return null
  return messages
}

function validateFields(value: unknown): DraftFields | null {
  if (!isRecord(value)) return null
  const { destination, start_date: start, end_date: end, trip_type: tripType } = value
  if (!isBoundedString(destination, MAX_FIELD_CHARS)) return null
  if (!isBoundedString(start, MAX_FIELD_CHARS) || !isBoundedString(end, MAX_FIELD_CHARS)) return null
  // Dates are either unresolved ('') or strict ISO (native date inputs only produce these).
  if (start !== '' && !isValidIsoDate(start)) return null
  if (end !== '' && !isValidIsoDate(end)) return null
  if (tripType !== '' && !isTripType(tripType)) return null
  return { destination, start_date: start, end_date: end, trip_type: tripType as DraftFields['trip_type'] }
}

function validateFieldList(value: unknown): TripDraftField[] | null {
  if (!Array.isArray(value)) return null
  if (!value.every((item) => (TRIP_DRAFT_FIELDS as readonly unknown[]).includes(item))) return null
  return Array.from(new Set(value as TripDraftField[]))
}

export function validateStoredDraft(
  value: unknown,
  expected: { account: string; apiBaseUrl: string },
): StoredDraft | null {
  if (!isRecord(value)) return null
  if (value.schema_version !== DRAFT_SCHEMA_VERSION) return null
  if (value.account !== expected.account || value.api_base_url !== expected.apiBaseUrl) return null
  if (typeof value.updated_at !== 'string' || Number.isNaN(Date.parse(value.updated_at))) return null
  if (value.mode !== 'chat' && value.mode !== 'manual') return null
  const messages = validateMessages(value.messages)
  const fields = validateFields(value.fields)
  const missing = validateFieldList(value.missing_fields)
  const clarification = validateFieldList(value.clarification_fields)
  if (!messages || !fields || !missing || !clarification) return null
  if (!isBoundedString(value.composer, MAX_COMPOSER_CHARS)) return null
  if (!isValidIsoDate(value.reference_date) || !isValidTimezone(value.timezone)) return null
  if (typeof value.creation_in_progress !== 'boolean' || typeof value.uncertain_outcome !== 'boolean') return null
  return {
    schema_version: DRAFT_SCHEMA_VERSION,
    account: value.account,
    api_base_url: value.api_base_url,
    updated_at: value.updated_at,
    mode: value.mode,
    messages,
    fields,
    missing_fields: missing,
    clarification_fields: clarification.filter((field) => !missing.includes(field)),
    composer: value.composer,
    reference_date: value.reference_date,
    timezone: value.timezone,
    creation_in_progress: value.creation_in_progress,
    uncertain_outcome: value.uncertain_outcome,
  }
}
