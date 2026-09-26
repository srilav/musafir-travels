import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { postTripDraft } from '../api/ai'
import { ApiError, getErrorMessage, isAbortError, NetworkError } from '../api/client'
import { useCreateTrip } from '../api/trips'
import { API_BASE_URL } from '../config'
import { CONFIRMATION_QUESTION, isConfirmationPhrase } from '../lib/confirmation'
import { formatLongDate, localTimezone, todayLocalIso } from '../lib/dates'
import {
  draftStorageKey,
  getStorageGeneration,
  isStorageAvailable,
  loadDraft,
  removeDraft,
  saveDraft,
  type FlowMode,
  type StoredDraft,
} from '../lib/draftStorage'
import {
  EMPTY_FIELDS,
  fromTripDraft,
  getFieldErrors,
  hasFieldErrors,
  isFieldValueValid,
  keepValidFields,
  toCreateTripRequest,
  toTripDraft,
  type DraftFields,
} from '../lib/draftValidation'
import { charCount, checkSendLimits, isHistoryFull, MAX_MESSAGE_CHARS, type LimitProblem } from '../lib/limits'
import { buttonPrimary, buttonSecondary, card, inputBase, inputInvalid } from '../lib/styles'
import type { ChatMessage, ChatRole, CreateTripRequest, TripDraftField } from '../types'
import { NewTripForm } from './NewTripForm'
import { TripDraftReview } from './TripDraftReview'

export const OPENING_PROMPT = 'Where would you like to go, when, and who is travelling?'
export const SAMPLE_INPUT = 'Goa from 03/04/2027 to 05/04/2027 with friends.'
export const SAMPLE_EXPLANATION = 'Dates use DD/MM/YYYY — this means 3–5 April 2027.'
const DEFAULT_RETRY_AFTER_SECONDS = 30

interface TranscriptEntry {
  id: string
  role: ChatRole
  content: string
  /** Shown in the transcript but never sent to the AI (confirmation exchange). */
  uiOnly: boolean
}

interface FlowState {
  mode: FlowMode
  transcript: TranscriptEntry[]
  fields: DraftFields
  missing: TripDraftField[]
  clarification: TripDraftField[]
  composer: string
  /** Fixed at conversation start; refreshed only by restart / returning to chat. */
  referenceDate: string
  timezone: string
  creationInProgress: boolean
  uncertainOutcome: boolean
}

type Notice = { kind: 'restored'; updatedAt: string } | { kind: 'invalid' } | null

interface AiError {
  message: string
  retryable: boolean
}

function currentTime(): number {
  return Date.now()
}

let entryCounter = 0
function makeEntry(role: ChatRole, content: string, uiOnly: boolean): TranscriptEntry {
  entryCounter += 1
  return { id: `m${entryCounter}`, role, content, uiOnly }
}

function freshFlow(fields: DraftFields = EMPTY_FIELDS, mode: FlowMode = 'chat'): FlowState {
  return {
    mode,
    transcript: [],
    fields,
    missing: [],
    clarification: [],
    composer: '',
    referenceDate: todayLocalIso(),
    timezone: localTimezone(),
    creationInProgress: false,
    uncertainOutcome: false,
  }
}

function isPristine(flow: FlowState): boolean {
  return (
    flow.mode === 'chat' &&
    flow.transcript.length === 0 &&
    flow.composer === '' &&
    flow.missing.length === 0 &&
    flow.clarification.length === 0 &&
    !flow.creationInProgress &&
    !flow.uncertainOutcome &&
    Object.values(flow.fields).every((value) => value === '')
  )
}

function toStored(flow: FlowState, account: string): StoredDraft {
  return {
    schema_version: 1,
    account,
    api_base_url: API_BASE_URL,
    updated_at: new Date().toISOString(),
    mode: flow.mode,
    messages: flow.transcript.map((entry) => ({ role: entry.role, content: entry.content, ui_only: entry.uiOnly })),
    fields: flow.fields,
    missing_fields: flow.missing,
    clarification_fields: flow.clarification,
    composer: flow.composer,
    reference_date: flow.referenceDate,
    timezone: flow.timezone,
    creation_in_progress: flow.creationInProgress,
    uncertain_outcome: flow.uncertainOutcome,
  }
}

function fromStored(stored: StoredDraft): FlowState {
  return {
    mode: stored.mode,
    transcript: stored.messages.map((message) => makeEntry(message.role, message.content, message.ui_only)),
    fields: stored.fields,
    missing: stored.missing_fields,
    clarification: stored.clarification_fields,
    composer: stored.composer,
    referenceDate: stored.reference_date,
    timezone: stored.timezone,
    // An interrupted creation is never replayed: it becomes an uncertain outcome.
    creationInProgress: false,
    uncertainOutcome: stored.uncertain_outcome || stored.creation_in_progress,
  }
}

function apiMessages(transcript: readonly TranscriptEntry[]): ChatMessage[] {
  return transcript.filter((entry) => !entry.uiOnly).map((entry) => ({ role: entry.role, content: entry.content }))
}

function describeAiError(error: unknown): AiError {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 422:
        return {
          message: `The assistant couldn’t accept that request: ${getErrorMessage(error, 'invalid input.')}`,
          retryable: false,
        }
      case 429:
        return { message: 'You’ve reached the assistant’s request limit for now.', retryable: true }
      case 502:
        return { message: 'The assistant gave an unusable answer.', retryable: true }
      case 503:
        return { message: 'The assistant is unavailable right now.', retryable: true }
      case 504:
        return { message: 'The assistant took too long to respond.', retryable: true }
      default:
        return { message: 'Something went wrong while contacting the assistant.', retryable: true }
    }
  }
  if (error instanceof NetworkError) {
    return { message: 'Couldn’t reach the server. Check your connection.', retryable: true }
  }
  return { message: 'Something went wrong while contacting the assistant.', retryable: true }
}

function limitMessage(problem: LimitProblem): string {
  switch (problem.kind) {
    case 'message_too_long':
      return `Your message is ${problem.length.toLocaleString('en-US')} characters; the limit is ${MAX_MESSAGE_CHARS.toLocaleString('en-US')}. Shorten it to send.`
    case 'history_full':
      return 'This conversation has reached its message limit.'
    case 'aggregate_exceeded':
      return 'This conversation is too long to send another message.'
  }
}

interface InitialState {
  flow: FlowState
  notice: Notice
  storageUnavailable: boolean
}

function initialise(storageKey: string, account: string): InitialState {
  if (!isStorageAvailable()) return { flow: freshFlow(), notice: null, storageUnavailable: true }
  const result = loadDraft(storageKey, { account, apiBaseUrl: API_BASE_URL })
  switch (result.status) {
    case 'restored':
      return {
        flow: fromStored(result.draft),
        notice: { kind: 'restored', updatedAt: result.draft.updated_at },
        storageUnavailable: false,
      }
    case 'invalid':
      return { flow: freshFlow(), notice: { kind: 'invalid' }, storageUnavailable: false }
    case 'unavailable':
      return { flow: freshFlow(), notice: null, storageUnavailable: true }
    case 'none':
      return { flow: freshFlow(), notice: null, storageUnavailable: false }
  }
}

function formatSavedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${formatLongDate(todayLocalIso(date))} at ${time}`
}

/**
 * Chat-first trip entry (frontend-spec §12): conversation + editable review,
 * with the manual form as an always-available alternative. Owns the flow
 * state, restoration, AI turns and the single guarded create handler.
 */
export function TripChat({ account }: { account: string }) {
  const navigate = useNavigate()
  const createTrip = useCreateTrip()
  const ids = useId()
  const storageKey = draftStorageKey(account)

  const [initial] = useState(() => initialise(storageKey, account))
  const [flow, setFlow] = useState<FlowState>(initial.flow)
  const [notice, setNotice] = useState<Notice>(initial.notice)
  const [storageUnavailable, setStorageUnavailable] = useState(initial.storageUnavailable)
  const [generation] = useState(getStorageGeneration)

  const [aiPending, setAiPending] = useState(false)
  const [aiError, setAiError] = useState<AiError | null>(null)
  const [inlineError, setInlineError] = useState<string | null>(null)
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [pendingConfirmation, setPendingConfirmation] = useState<CreateTripRequest | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [focusReviewToken, setFocusReviewToken] = useState(0)

  const versionRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(false)
  const creatingRef = useRef(false)
  const completedRef = useRef(false)
  const composingRef = useRef(false)
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null)
  const transcriptRef = useRef<HTMLOListElement>(null)

  // Lifecycle: leaving the page invalidates any pending AI response.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      versionRef.current += 1
      abortRef.current?.abort()
    }
  }, [])

  // Persist the unfinished flow (never after completion or a logout).
  useEffect(() => {
    if (completedRef.current || storageUnavailable) return
    if (generation !== getStorageGeneration()) return
    if (isPristine(flow)) {
      removeDraft(storageKey)
      return
    }
    if (saveDraft(storageKey, toStored(flow, account), generation) === 'failed') {
      // Syncing with an external system (localStorage) whose failure must be surfaced.
      // oxlint-disable-next-line react/set-state-in-effect
      setStorageUnavailable(true)
    }
  }, [flow, storageKey, account, generation, storageUnavailable])

  // Retry-After countdown.
  useEffect(() => {
    if (cooldownUntil === null) return
    const timer = window.setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= cooldownUntil) setCooldownUntil(null)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [cooldownUntil])

  useEffect(() => {
    if (focusReviewToken > 0) reviewHeadingRef.current?.focus()
  }, [focusReviewToken])

  useEffect(() => {
    const list = transcriptRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [flow.transcript.length, aiPending, pendingConfirmation])

  // ---- Derived state ----
  const fieldErrors = getFieldErrors(flow.fields)
  const createRequest = toCreateTripRequest(flow.fields)
  const isReady = createRequest !== null && flow.clarification.length === 0
  const canCreate = isReady && !aiPending && !creating && !flow.uncertainOutcome
  const history = apiMessages(flow.transcript)
  const composerText = flow.composer.trim()
  const coolingDown = cooldownUntil !== null && now < cooldownUntil
  const secondsLeft = cooldownUntil !== null ? Math.max(0, Math.ceil((cooldownUntil - now) / 1000)) : 0
  const isConfirming = pendingConfirmation !== null && composerText !== '' && isConfirmationPhrase(composerText)
  const limitProblem: LimitProblem | null = isConfirming
    ? null
    : composerText
      ? checkSendLimits(history, composerText)
      : isHistoryFull(history)
        ? { kind: 'history_full' }
        : null
  const historyBlocked = limitProblem !== null && limitProblem.kind !== 'message_too_long'
  const draftBlocksSend = !isConfirming && hasFieldErrors(fieldErrors)
  const canSend = composerText !== '' && !aiPending && !creating && !coolingDown && limitProblem === null && !draftBlocksSend
  const composerCount = charCount(flow.composer)
  const lastEntry = flow.transcript.at(-1)
  const canRetry =
    aiError?.retryable === true && !aiPending && !creating && !coolingDown && lastEntry?.role === 'user' && !lastEntry.uiOnly

  // ---- Helpers ----
  function cancelPendingAi(reason?: string) {
    versionRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    if (aiPending) {
      setAiPending(false)
      if (reason) setAnnouncement(reason)
    }
  }

  async function runAiTurn(base: FlowState) {
    const version = ++versionRef.current
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setAiPending(true)
    setAiError(null)
    setInlineError(null)
    setAnnouncement('The assistant is replying…')
    try {
      const response = await postTripDraft(
        {
          messages: apiMessages(base.transcript),
          draft: toTripDraft(base.fields),
          reference_date: base.referenceDate,
          timezone: base.timezone,
        },
        controller.signal,
      )
      if (version !== versionRef.current) return // stale: edited, restarted, switched or left
      abortRef.current = null
      const fields = fromTripDraft(response.draft)
      const request = toCreateTripRequest(fields)
      const ready =
        request !== null && response.missing_fields.length === 0 && response.clarification_fields.length === 0
      setFlow((prev) => ({
        ...prev,
        transcript: [...prev.transcript, makeEntry('assistant', response.reply, false)],
        fields,
        missing: response.missing_fields,
        clarification: response.clarification_fields,
      }))
      setAiPending(false)
      if (ready) {
        // A complete validated summary is now displayed: await confirmation of this exact snapshot.
        setPendingConfirmation(request)
        setAnnouncement(`${response.reply} ${CONFIRMATION_QUESTION}`)
        setFocusReviewToken((token) => token + 1)
      } else {
        setAnnouncement(response.reply)
      }
    } catch (error) {
      if (version !== versionRef.current || isAbortError(error)) return
      abortRef.current = null
      setAiPending(false)
      if (error instanceof ApiError && error.status === 401) return // AuthContext logs out
      const described = describeAiError(error)
      if (error instanceof ApiError && error.status === 429) {
        const seconds = error.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS
        const current = currentTime()
        setNow(current)
        setCooldownUntil(current + seconds * 1000)
      }
      setAiError(described)
      setAnnouncement(described.message)
    }
  }

  /** The single guarded creation path for chat confirmation and the Create trip button. */
  async function submitCreate(request: CreateTripRequest, base: FlowState) {
    if (creatingRef.current) return
    creatingRef.current = true
    cancelPendingAi()
    setPendingConfirmation(null)
    setCreating(true)
    setCreateError(null)
    setAnnouncement('Creating your trip…')
    // Persist the creation-in-progress marker before submitting.
    const marked: FlowState = { ...base, creationInProgress: true }
    if (!storageUnavailable && saveDraft(storageKey, toStored(marked, account), generation) === 'failed') {
      setStorageUnavailable(true)
    }
    setFlow(marked)
    try {
      const trip = await createTrip.mutateAsync(request)
      completedRef.current = true
      removeDraft(storageKey)
      if (mountedRef.current) navigate(`/trips/${trip.id}`)
    } catch (error) {
      creatingRef.current = false
      if (!mountedRef.current) return
      setCreating(false)
      if (error instanceof ApiError && error.status === 401) return
      const uncertain =
        error instanceof NetworkError || (error instanceof ApiError && (error.status === 502 || error.status === 504))
      setFlow((prev) => ({ ...prev, creationInProgress: false, uncertainOutcome: prev.uncertainOutcome || uncertain }))
      if (uncertain) {
        setAnnouncement('We couldn’t confirm whether your trip was created.')
      } else {
        const message = `Couldn’t create the trip: ${getErrorMessage(error)} Your details are kept.`
        setCreateError(message)
        setAnnouncement(message)
      }
    }
  }

  // ---- Event handlers ----
  function handleSend() {
    const text = flow.composer.trim()
    if (!text || aiPending || creatingRef.current || coolingDown) return

    if (pendingConfirmation && isConfirmationPhrase(text)) {
      const snapshot = pendingConfirmation
      setPendingConfirmation(null) // consumed once
      const next: FlowState = {
        ...flow,
        composer: '',
        transcript: [
          ...flow.transcript,
          makeEntry('assistant', CONFIRMATION_QUESTION, true),
          makeEntry('user', text, true),
        ],
      }
      void submitCreate(snapshot, next)
      return
    }

    if (hasFieldErrors(fieldErrors)) {
      setInlineError('Fix the highlighted trip details before sending another message.')
      return
    }
    if (checkSendLimits(history, text)) return

    const transcript = [
      ...flow.transcript,
      ...(pendingConfirmation ? [makeEntry('assistant', CONFIRMATION_QUESTION, true)] : []),
      makeEntry('user', text, false),
    ]
    setPendingConfirmation(null)
    setNotice(null)
    const next: FlowState = { ...flow, transcript, composer: '' }
    setFlow(next)
    void runAiTurn(next)
  }

  function handleRetry() {
    if (!canRetry) return
    if (hasFieldErrors(fieldErrors)) {
      setInlineError('Fix the highlighted trip details before retrying.')
      return
    }
    // Resend the failed turn as-is: the user message is already in the transcript.
    void runAiTurn(flow)
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return
    if (event.nativeEvent.isComposing || composingRef.current || event.keyCode === 229) return
    event.preventDefault()
    if (canSend || isConfirming) handleSend()
  }

  function handleFieldChange(field: TripDraftField, value: string) {
    cancelPendingAi('The pending reply was cancelled because you edited the trip details.')
    setPendingConfirmation(null)
    setCreateError(null)
    setInlineError(null)
    setFlow((prev) => {
      const fields = { ...prev.fields, [field]: value } as DraftFields
      const resolved = isFieldValueValid(field, fields)
      return {
        ...prev,
        fields,
        missing: resolved ? prev.missing.filter((item) => item !== field) : prev.missing,
        clarification: resolved ? prev.clarification.filter((item) => item !== field) : prev.clarification,
      }
    })
  }

  function handleCreateClick() {
    const request = toCreateTripRequest(flow.fields)
    if (!request || !canCreate) return
    void submitCreate(request, flow)
  }

  function switchToManual() {
    cancelPendingAi()
    setPendingConfirmation(null)
    setAiError(null)
    setInlineError(null)
    setFlow((prev) => ({ ...prev, mode: 'manual' }))
  }

  function switchToChat() {
    cancelPendingAi()
    setPendingConfirmation(null)
    setAiError(null)
    setInlineError(null)
    setCreateError(null)
    setNotice(null)
    // A fresh conversation seeded with the current valid draft and fresh date context.
    setFlow((prev) => ({ ...freshFlow(keepValidFields(prev.fields)), uncertainOutcome: prev.uncertainOutcome }))
  }

  function restartConversation() {
    cancelPendingAi()
    setPendingConfirmation(null)
    setAiError(null)
    setInlineError(null)
    setCreateError(null)
    setNotice(null)
    setFlow((prev) => ({ ...freshFlow(), uncertainOutcome: prev.uncertainOutcome }))
  }

  function discardDraft() {
    cancelPendingAi()
    removeDraft(storageKey)
    setPendingConfirmation(null)
    setAiError(null)
    setInlineError(null)
    setCreateError(null)
    setNotice(null)
    setFlow(freshFlow())
  }

  // ---- Render ----
  const composerId = `${ids}-composer`
  const hintId = `${ids}-hint`
  const sampleId = `${ids}-sample`
  const counterId = `${ids}-counter`
  const limitId = `${ids}-limit`
  const referenceChanged = flow.referenceDate !== todayLocalIso()

  const notices = (
    <>
      {notice?.kind === 'restored' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3 text-sm">
          <p>
            We restored your unfinished trip{formatSavedAt(notice.updatedAt) ? ` from ${formatSavedAt(notice.updatedAt)}` : ''}.
            Review the details before creating it.
          </p>
          <button type="button" className={`${buttonSecondary} px-3 py-1.5`} onClick={discardDraft}>
            Discard draft
          </button>
        </div>
      )}
      {notice?.kind === 'invalid' && (
        <p className="rounded-md border border-border bg-surface px-4 py-3 text-sm">
          Your saved draft couldn’t be restored, so it was discarded.
        </p>
      )}
      {storageUnavailable && (
        <p className="rounded-md border border-border bg-surface px-4 py-3 text-sm">
          Draft restoration is unavailable because this browser’s storage is blocked or full. Your progress is kept
          only while this page stays open.
        </p>
      )}
      {flow.uncertainOutcome && (
        <div role="alert" className="space-y-2 rounded-md border border-error bg-surface px-4 py-3 text-sm">
          <p>
            We couldn’t confirm whether your trip was created. Please check your saved trips before creating it again.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/trips" className={`${buttonSecondary} px-3 py-1.5`}>
              Check saved trips
            </Link>
            <button
              type="button"
              className={`${buttonSecondary} px-3 py-1.5`}
              onClick={() => setFlow((prev) => ({ ...prev, uncertainOutcome: false }))}
            >
              I’ve checked — continue
            </button>
          </div>
        </div>
      )}
      {createError && (
        <p role="alert" className="text-sm text-error">
          {createError}
        </p>
      )}
    </>
  )

  const modeToggle =
    flow.mode === 'chat' ? (
      <button type="button" className={buttonSecondary} onClick={switchToManual} disabled={creating}>
        Enter details manually
      </button>
    ) : (
      <button type="button" className={buttonSecondary} onClick={switchToChat} disabled={creating}>
        Describe your trip in chat instead
      </button>
    )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Add New Trip</h1>
        {modeToggle}
      </div>

      <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="live-region">
        {announcement}
      </div>

      {notices}

      {flow.mode === 'manual' ? (
        <NewTripForm
          fields={flow.fields}
          errors={fieldErrors}
          missing={flow.missing}
          clarification={flow.clarification}
          onChange={handleFieldChange}
          onSubmit={handleCreateClick}
          canSubmit={canCreate}
          submitting={creating}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <section className={`${card} flex min-w-0 flex-col gap-4`} aria-labelledby={`${ids}-chat-heading`}>
            <h2 id={`${ids}-chat-heading`} className="text-lg font-semibold">
              Describe your trip
            </h2>
            {referenceChanged && (
              <p className="text-sm text-text-muted">
                Dates in this conversation are interpreted relative to {formatLongDate(flow.referenceDate)} (
                {flow.timezone}), when it started.
              </p>
            )}
            <ol
              ref={transcriptRef}
              className="flex max-h-[28rem] min-h-40 flex-col gap-3 overflow-y-auto"
              aria-label="Conversation"
            >
              <ChatBubble speaker="assistant" content={OPENING_PROMPT} />
              {flow.transcript.map((entry) => (
                <ChatBubble key={entry.id} speaker={entry.role} content={entry.content} />
              ))}
              {pendingConfirmation && <ChatBubble speaker="assistant" content={CONFIRMATION_QUESTION} />}
              {aiPending && (
                <li className="text-sm text-text-muted" aria-hidden="true">
                  The assistant is replying…
                </li>
              )}
            </ol>

            {aiError && (
              <div role="alert" className="space-y-2 rounded-md border border-error px-3 py-2 text-sm">
                <p className="text-error">{aiError.message}</p>
                {coolingDown && <p>You can send again in {secondsLeft} seconds.</p>}
                <div className="flex flex-wrap gap-2">
                  {aiError.retryable && (
                    <button type="button" className={`${buttonSecondary} px-3 py-1.5`} onClick={handleRetry} disabled={!canRetry}>
                      Retry
                    </button>
                  )}
                  <button type="button" className={`${buttonSecondary} px-3 py-1.5`} onClick={switchToManual}>
                    Enter details manually
                  </button>
                </div>
              </div>
            )}

            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault()
                if (canSend || isConfirming) handleSend()
              }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={composerId} className="text-sm font-medium">
                  Your message
                </label>
                <span id={hintId} className="text-xs text-text-muted">
                  English or Hinglish
                </span>
              </div>
              <textarea
                id={composerId}
                rows={3}
                className={`${inputBase} resize-y ${limitProblem?.kind === 'message_too_long' ? inputInvalid : ''}`}
                value={flow.composer}
                onChange={(event) => {
                  const value = event.target.value
                  setFlow((prev) => ({ ...prev, composer: value }))
                }}
                onKeyDown={handleComposerKeyDown}
                onCompositionStart={() => {
                  composingRef.current = true
                }}
                onCompositionEnd={() => {
                  composingRef.current = false
                }}
                aria-describedby={`${hintId} ${sampleId} ${counterId}${limitProblem && composerText ? ` ${limitId}` : ''}`}
                aria-invalid={limitProblem?.kind === 'message_too_long' || undefined}
                disabled={creating}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  id={counterId}
                  className={`text-xs ${composerCount > MAX_MESSAGE_CHARS ? 'text-error' : 'text-text-muted'}`}
                >
                  {composerCount.toLocaleString('en-US')} / {MAX_MESSAGE_CHARS.toLocaleString('en-US')} characters
                </span>
                <button type="submit" className={buttonPrimary} disabled={!(canSend || (isConfirming && !creating))}>
                  {aiPending ? 'Waiting…' : 'Send'}
                </button>
              </div>
              {limitProblem && (composerText || historyBlocked) && (
                <div id={limitId} className="space-y-2 text-sm">
                  <p className="text-error">{limitMessage(limitProblem)}</p>
                  {historyBlocked && (
                    <div className="flex flex-wrap gap-2">
                      <p className="w-full text-text">
                        Complete the remaining details manually, or restart the conversation.
                      </p>
                      <button type="button" className={`${buttonSecondary} px-3 py-1.5`} onClick={switchToManual}>
                        Complete manually
                      </button>
                      <button type="button" className={`${buttonSecondary} px-3 py-1.5`} onClick={restartConversation}>
                        Restart conversation
                      </button>
                    </div>
                  )}
                </div>
              )}
              {draftBlocksSend && composerText && (
                <p className="text-sm text-error">Fix the highlighted trip details before sending another message.</p>
              )}
              {inlineError && !draftBlocksSend && <p className="text-sm text-error">{inlineError}</p>}
              <div id={sampleId} className="rounded-md bg-background px-3 py-2 text-sm text-text-muted">
                <p>
                  Example: <span className="text-text">{SAMPLE_INPUT}</span>
                </p>
                <p>{SAMPLE_EXPLANATION}</p>
              </div>
            </form>
          </section>

          <TripDraftReview
            fields={flow.fields}
            errors={fieldErrors}
            missing={flow.missing}
            clarification={flow.clarification}
            complete={isReady ? createRequest : null}
            onChange={handleFieldChange}
            onCreate={handleCreateClick}
            canCreate={canCreate}
            creating={creating}
            headingRef={reviewHeadingRef}
          />
        </div>
      )}
    </div>
  )
}

function ChatBubble({ speaker, content }: { speaker: ChatRole; content: string }) {
  const isUser = speaker === 'user'
  return (
    <li className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm break-words whitespace-pre-wrap ${
          isUser ? 'bg-primary text-surface' : 'border border-border bg-background text-text'
        }`}
      >
        <span className="sr-only">{isUser ? 'You: ' : 'Assistant: '}</span>
        {content}
      </div>
    </li>
  )
}
