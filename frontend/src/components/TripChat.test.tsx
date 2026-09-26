import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CONFIRMATION_QUESTION } from '../lib/confirmation'
import { todayLocalIso } from '../lib/dates'
import { draftStorageKey, type StoredDraft } from '../lib/draftStorage'
import { API, deferred, jsonResponse, mockFetch, renderNewTrip, signIn, type RecordedCall } from '../test/utils'
import type { TripDraftResponse } from '../types'

/** Exclude the live region so transcript text isn't matched twice. */
const LIVE = { ignore: '[data-testid="live-region"], script, style' }
const AI_URL = `${API}/ai/trip-draft`
const TRIPS_URL = `${API}/trips`
const USER_TEXT = 'Goa from 03/04/2027 to 05/04/2027 with friends'

const COMPLETE: TripDraftResponse = {
  draft: { destination: 'Goa', start_date: '2027-04-03', end_date: '2027-04-05', trip_type: 'group_of_friends' },
  missing_fields: [],
  clarification_fields: [],
  reply: 'Goa, 3–5 April 2027, with friends. Please review these details.',
}

const PARTIAL: TripDraftResponse = {
  draft: { destination: 'Goa', start_date: '2027-04-03', end_date: '2027-04-05', trip_type: null },
  missing_fields: ['trip_type'],
  clarification_fields: [],
  reply: 'Who is travelling: solo, as a couple, with family, or with friends?',
}

const CREATED_TRIP = {
  id: 'trip-1',
  destination: 'Goa',
  start_date: '2027-04-03',
  end_date: '2027-04-05',
  trip_type: 'group_of_friends',
  created_at: '2026-09-24T10:00:00Z',
  days: [],
}

type Reply = Response | Promise<Response> | (() => Response | Promise<Response>)

/** Route AI turns through a queue; POST /trips to `createReply`. */
function setupApi(aiReplies: Reply[], createReply: Reply = jsonResponse(201, CREATED_TRIP)) {
  const queue = [...aiReplies]
  const mocked = mockFetch((call) => {
    if (call.url === AI_URL && call.method === 'POST') {
      const next = queue.shift()
      if (!next) throw new Error('Unexpected AI call')
      return typeof next === 'function' ? next() : next
    }
    if (call.url === TRIPS_URL && call.method === 'POST') {
      return typeof createReply === 'function' ? createReply() : createReply
    }
    throw new Error(`Unexpected request ${call.method} ${call.url}`)
  })
  return {
    ...mocked,
    aiCalls: () => mocked.calls.filter((call) => call.url === AI_URL),
    createCalls: () => mocked.calls.filter((call) => call.url === TRIPS_URL),
  }
}

function ok(body: TripDraftResponse) {
  return () => jsonResponse(200, body)
}

function composer() {
  return screen.getByLabelText('Your message')
}

function storedDraft(overrides: Partial<StoredDraft> = {}): StoredDraft {
  return {
    schema_version: 1,
    account: 'asha',
    api_base_url: API,
    updated_at: new Date().toISOString(),
    mode: 'chat',
    messages: [],
    fields: { destination: '', start_date: '', end_date: '', trip_type: '' },
    missing_fields: [],
    clarification_fields: [],
    composer: '',
    reference_date: todayLocalIso(),
    timezone: 'Asia/Kolkata',
    creation_in_progress: false,
    uncertain_outcome: false,
    ...overrides,
  }
}

function seedDraft(draft: StoredDraft, account = 'asha') {
  window.localStorage.setItem(draftStorageKey(account), JSON.stringify(draft))
}

function readDraft(account = 'asha'): StoredDraft | null {
  const raw = window.localStorage.getItem(draftStorageKey(account))
  return raw ? (JSON.parse(raw) as StoredDraft) : null
}

async function completeConversation(user: ReturnType<typeof userEvent.setup>) {
  await user.type(composer(), `${USER_TEXT}{Enter}`)
  await screen.findByText(COMPLETE.reply)
  await screen.findByText(CONFIRMATION_QUESTION)
}

describe('TripChat — entry UI', () => {
  it('shows the opening prompt, persistent DD/MM/YYYY sample, language hint and manual toggle', () => {
    signIn()
    setupApi([])
    renderNewTrip()
    expect(screen.getByText('Where would you like to go, when, and who is travelling?')).toBeInTheDocument()
    expect(screen.getByText('Goa from 03/04/2027 to 05/04/2027 with friends.')).toBeInTheDocument()
    expect(screen.getByText('Dates use DD/MM/YYYY — this means 3–5 April 2027.')).toBeInTheDocument()
    expect(screen.getByText('English or Hinglish')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enter details manually' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: '← Back to Trips' }).length).toBeGreaterThan(0)
    expect(screen.getByText('0 / 2,000 characters')).toBeInTheDocument()
    // Trip type is not preselected.
    expect(screen.getByLabelText('Trip type')).toHaveValue('')
  })
})

describe('TripChat — conversation and confirmation', () => {
  it('complete conversation → review → "yes" creates the trip exactly once, then navigates', async () => {
    signIn()
    const createResponse = deferred<Response>()
    const api = setupApi([ok(COMPLETE)], () => createResponse.promise)
    const user = userEvent.setup()
    renderNewTrip()

    await completeConversation(user)

    const [aiCall] = api.aiCalls()
    expect(aiCall.body).toEqual({
      messages: [{ role: 'user', content: USER_TEXT }],
      draft: { destination: null, start_date: null, end_date: null, trip_type: null },
      reference_date: todayLocalIso(),
      timezone: expect.any(String),
    })

    // Written-month review with human-readable trip type; heading receives focus.
    const summary = screen.getByLabelText('Trip summary')
    expect(within(summary).getByText('3 April 2027 – 5 April 2027')).toBeInTheDocument()
    expect(within(summary).getByText('Group of friends')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Review trip details' })).toHaveFocus()
    expect(api.createCalls()).toHaveLength(0)

    await user.type(composer(), 'Haan, bana do!{Enter}')
    // Pending: repeat attempts are ignored.
    expect(screen.getByRole('button', { name: 'Creating trip…' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Creating trip…' }))
    fireEvent.keyDown(composer(), { key: 'Enter' })
    expect(api.createCalls()).toHaveLength(1)
    // The creation-in-progress marker is persisted before submission.
    expect(readDraft()?.creation_in_progress).toBe(true)
    // Not navigated before 201.
    expect(screen.queryByText('Trip page trip-1')).not.toBeInTheDocument()

    createResponse.resolve(jsonResponse(201, CREATED_TRIP))
    expect(await screen.findByText('Trip page trip-1')).toBeInTheDocument()

    expect(api.createCalls()).toHaveLength(1)
    expect(api.createCalls()[0].body).toEqual({
      destination: 'Goa',
      start_date: '2027-04-03',
      end_date: '2027-04-05',
      trip_type: 'group_of_friends',
    })
    expect(api.aiCalls()).toHaveLength(1) // confirmation needs no AI request
    expect(readDraft()).toBeNull() // cleared after successful creation
  })

  it('"yes" without a pending review is sent to the AI and never creates a trip', async () => {
    signIn()
    const api = setupApi([ok(PARTIAL)])
    const user = userEvent.setup()
    renderNewTrip()

    await user.type(composer(), 'yes{Enter}')
    await screen.findByText(PARTIAL.reply, LIVE)

    expect(api.aiCalls()).toHaveLength(1)
    expect((api.aiCalls()[0].body as { messages: unknown }).messages).toEqual([{ role: 'user', content: 'yes' }])
    expect(api.createCalls()).toHaveLength(0)
    expect(screen.queryByText(CONFIRMATION_QUESTION)).not.toBeInTheDocument()
  })

  it('"yes, but make it solo" is a correction that goes through the AI', async () => {
    signIn()
    const solo: TripDraftResponse = { ...COMPLETE, draft: { ...COMPLETE.draft, trip_type: 'solo' }, reply: 'Updated to solo.' }
    const api = setupApi([ok(COMPLETE), ok(solo)])
    const user = userEvent.setup()
    renderNewTrip()
    await completeConversation(user)

    await user.type(composer(), 'yes, but make it solo{Enter}')
    await screen.findByText('Updated to solo.')

    expect(api.createCalls()).toHaveLength(0)
    const second = api.aiCalls()[1].body as { messages: { role: string; content: string }[] }
    expect(second.messages.at(-1)).toEqual({ role: 'user', content: 'yes, but make it solo' })
    // A fresh summary is shown and a new confirmation requested.
    expect(within(screen.getByLabelText('Trip summary')).getByText('Solo')).toBeInTheDocument()
    // The earlier question stays in the transcript; the new pending question follows the new summary.
    const questions = within(screen.getByRole('list', { name: 'Conversation' })).getAllByText(CONFIRMATION_QUESTION)
    expect(questions).toHaveLength(2)
  })

  it('a manual edit clears the pending confirmation; the edited draft is sent on the next turn', async () => {
    signIn()
    const api = setupApi([ok(COMPLETE), ok({ ...COMPLETE, draft: { ...COMPLETE.draft, trip_type: 'family' }, reply: 'Family trip noted.' })])
    const user = userEvent.setup()
    renderNewTrip()
    await completeConversation(user)

    await user.selectOptions(screen.getByLabelText('Trip type'), 'family')
    expect(screen.queryByText(CONFIRMATION_QUESTION)).not.toBeInTheDocument()

    await user.type(composer(), 'yes{Enter}')
    await screen.findByText('Family trip noted.')
    expect(api.createCalls()).toHaveLength(0)
    expect(api.aiCalls()).toHaveLength(2)
    expect((api.aiCalls()[1].body as { draft: { trip_type: string } }).draft.trip_type).toBe('family')
  })

  it('the Create trip button uses the same guarded handler', async () => {
    signIn()
    const api = setupApi([ok(COMPLETE)])
    const user = userEvent.setup()
    renderNewTrip()
    await completeConversation(user)

    const button = screen.getByRole('button', { name: 'Create trip' })
    await user.dblClick(button)
    expect(await screen.findByText('Trip page trip-1')).toBeInTheDocument()
    expect(api.createCalls()).toHaveLength(1)
  })

  it('keeps Create trip disabled while fields are unresolved or invalid', async () => {
    signIn()
    setupApi([ok(PARTIAL)])
    const user = userEvent.setup()
    renderNewTrip()
    await user.type(composer(), `${USER_TEXT}{Enter}`)
    await screen.findByText(PARTIAL.reply, LIVE)

    expect(screen.getByRole('button', { name: 'Create trip' })).toBeDisabled()
    expect(screen.getByText('Missing')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Trip type'), 'couple')
    expect(screen.queryByText('Missing')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create trip' })).toBeEnabled()

    // Conflicting dates stay visibly invalid and block creation and AI sends.
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2027-04-01' } })
    expect(screen.getByText('End date must be on or after the start date.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create trip' })).toBeDisabled()
    await user.type(composer(), 'hello')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })
})

describe('TripChat — stale responses', () => {
  it('ignores a response that arrives after the user edited the draft', async () => {
    signIn()
    const pending = deferred<Response>()
    const api = setupApi([() => pending.promise])
    const user = userEvent.setup()
    renderNewTrip()

    await user.type(composer(), `${USER_TEXT}{Enter}`)
    expect(screen.getByRole('button', { name: 'Waiting…' })).toBeDisabled()
    await user.type(screen.getByLabelText('Destination'), 'Kerala')

    await act(async () => {
      pending.resolve(jsonResponse(200, COMPLETE))
      await pending.promise
    })

    expect(screen.getByLabelText('Destination')).toHaveValue('Kerala')
    expect(screen.queryByText(COMPLETE.reply)).not.toBeInTheDocument()
    expect(screen.queryByText(CONFIRMATION_QUESTION)).not.toBeInTheDocument()
    expect(api.aiCalls()).toHaveLength(1)
  })

  it('ignores a response that arrives after switching to manual mode', async () => {
    signIn()
    const pending = deferred<Response>()
    setupApi([() => pending.promise])
    const user = userEvent.setup()
    renderNewTrip()

    await user.type(composer(), `${USER_TEXT}{Enter}`)
    await user.click(screen.getByRole('button', { name: 'Enter details manually' }))

    await act(async () => {
      pending.resolve(jsonResponse(200, COMPLETE))
      await pending.promise
    })

    expect(screen.getByLabelText('Destination')).toHaveValue('')
    expect(screen.getByLabelText('Trip Type')).toHaveValue('')
  })
})

describe('TripChat — limits', () => {
  it('blocks a message over 2,000 characters and preserves the text', async () => {
    signIn()
    const api = setupApi([])
    renderNewTrip()
    const long = 'a'.repeat(2001)
    fireEvent.change(composer(), { target: { value: long } })

    expect(screen.getByText('2,001 / 2,000 characters')).toBeInTheDocument()
    expect(screen.getByText(/Your message is 2,001 characters; the limit is 2,000/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    fireEvent.keyDown(composer(), { key: 'Enter' })
    expect(api.calls).toHaveLength(0)
    expect(composer()).toHaveValue(long)
  })

  it('at the conversation limit offers manual completion or restart without truncating', async () => {
    signIn()
    const messages = Array.from({ length: 20 }, (_, index) => ({
      role: (index % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `message ${index + 1}`,
      ui_only: false,
    }))
    seedDraft(storedDraft({ messages, composer: 'one more' }))
    const api = setupApi([])
    const user = userEvent.setup()
    renderNewTrip()

    expect(screen.getByText('message 1')).toBeInTheDocument()
    expect(screen.getByText('This conversation has reached its message limit.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    fireEvent.keyDown(composer(), { key: 'Enter' })
    expect(api.calls).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Complete manually' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Restart conversation' }))
    expect(screen.queryByText('message 1')).not.toBeInTheDocument()
    expect(screen.queryByText('This conversation has reached its message limit.')).not.toBeInTheDocument()
  })

  it('blocks a send that would exceed the 12,000-character aggregate', () => {
    signIn()
    const messages = Array.from({ length: 6 }, (_, index) => ({
      role: (index % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `${index}`.repeat(2000),
      ui_only: false,
    }))
    seedDraft(storedDraft({ messages }))
    const api = setupApi([])
    renderNewTrip()

    fireEvent.change(composer(), { target: { value: 'x' } })
    expect(screen.getByText('This conversation is too long to send another message.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restart conversation' })).toBeInTheDocument()
    fireEvent.keyDown(composer(), { key: 'Enter' })
    expect(api.calls).toHaveLength(0)
  })
})

describe('TripChat — errors', () => {
  it('503 shows a brief message with retry and manual entry; retry does not duplicate the user message', async () => {
    signIn()
    const api = setupApi([() => jsonResponse(503, { detail: 'AI unavailable' }), ok(COMPLETE)])
    const user = userEvent.setup()
    renderNewTrip()

    await user.type(composer(), `${USER_TEXT}{Enter}`)
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('The assistant is unavailable right now.')).toBeInTheDocument()
    expect(within(alert).getByRole('button', { name: 'Enter details manually' })).toBeInTheDocument()

    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    await screen.findByText(COMPLETE.reply)

    expect(api.aiCalls()).toHaveLength(2)
    expect(api.aiCalls()[1].body).toEqual(api.aiCalls()[0].body)
    expect(screen.getAllByText(USER_TEXT)).toHaveLength(1)
  })

  it.each([
    [502, 'The assistant gave an unusable answer.'],
    [504, 'The assistant took too long to respond.'],
  ])('%i offers retry and manual entry, preserving the draft', async (status, message) => {
    signIn()
    setupApi([() => jsonResponse(status, { detail: 'x' })])
    const user = userEvent.setup()
    renderNewTrip()
    await user.type(composer(), `${USER_TEXT}{Enter}`)
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(message)).toBeInTheDocument()
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeEnabled()
    expect(screen.getByText(USER_TEXT)).toBeInTheDocument()
  })

  it('429 respects Retry-After by disabling send', async () => {
    signIn()
    setupApi([() => jsonResponse(429, { detail: 'Too many requests' }, { 'Retry-After': '5' })])
    const user = userEvent.setup()
    renderNewTrip()
    await user.type(composer(), `${USER_TEXT}{Enter}`)

    expect(await screen.findByText('You can send again in 5 seconds.')).toBeInTheDocument()
    await user.type(composer(), 'another')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled()
  })

  it('422 shows the validation message inline without retry', async () => {
    signIn()
    setupApi([() => jsonResponse(422, { detail: 'messages exceed the allowed size' })])
    const user = userEvent.setup()
    renderNewTrip()
    await user.type(composer(), `${USER_TEXT}{Enter}`)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('messages exceed the allowed size')
    expect(within(alert).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })

  it('announces replies through a polite live region', async () => {
    signIn()
    setupApi([ok(PARTIAL)])
    const user = userEvent.setup()
    renderNewTrip()
    const live = screen.getByTestId('live-region')
    expect(live).toHaveAttribute('aria-live', 'polite')
    await user.type(composer(), `${USER_TEXT}{Enter}`)
    await waitFor(() => expect(live).toHaveTextContent(PARTIAL.reply))
  })

  it('renders model text as plain text, not HTML', async () => {
    signIn()
    setupApi([ok({ ...PARTIAL, reply: '<img src=x onerror="alert(1)"> <b>bold</b>' })])
    const user = userEvent.setup()
    const { container } = renderNewTrip()
    await user.type(composer(), `${USER_TEXT}{Enter}`)
    await screen.findByText('<img src=x onerror="alert(1)"> <b>bold</b>', LIVE)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
  })
})

describe('TripChat — keyboard', () => {
  it('Shift+Enter inserts a newline and IME composition does not submit', async () => {
    signIn()
    const api = setupApi([])
    const user = userEvent.setup()
    renderNewTrip()

    await user.type(composer(), 'Goa{Shift>}{Enter}{/Shift}with friends')
    expect(composer()).toHaveValue('Goa\nwith friends')
    fireEvent.keyDown(composer(), { key: 'Enter', isComposing: true })
    fireEvent.keyDown(composer(), { key: 'Enter', keyCode: 229 })
    expect(api.calls).toHaveLength(0)
  })
})

describe('TripChat — restoration', () => {
  it('restores after a refresh with no automatic requests and requires a fresh review', async () => {
    signIn()
    const api = setupApi([ok(COMPLETE), ok(COMPLETE)])
    const user = userEvent.setup()
    const first = renderNewTrip()
    await completeConversation(user)
    await user.type(composer(), 'draft text')
    first.unmount()

    expect(readDraft()?.composer).toBe('draft text')
    renderNewTrip()

    expect(screen.getByText(/We restored your unfinished trip/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Discard draft' })).toBeInTheDocument()
    expect(screen.getByText(USER_TEXT)).toBeInTheDocument()
    expect(screen.getByText(COMPLETE.reply)).toBeInTheDocument()
    expect(screen.getByLabelText('Destination')).toHaveValue('Goa')
    expect(composer()).toHaveValue('draft text')
    expect(api.calls).toHaveLength(1) // nothing replayed
    // The consumed/pending confirmation is not restored.
    expect(screen.queryByText(CONFIRMATION_QUESTION)).not.toBeInTheDocument()

    await user.clear(composer())
    await user.type(composer(), 'yes{Enter}')
    await waitFor(() => expect(api.aiCalls()).toHaveLength(2))
    expect(api.createCalls()).toHaveLength(0)
  })

  it('"Discard draft" clears the saved flow', async () => {
    signIn()
    seedDraft(storedDraft({ messages: [{ role: 'user', content: 'Goa please', ui_only: false }] }))
    setupApi([])
    const user = userEvent.setup()
    renderNewTrip()
    expect(screen.getByText('Goa please')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Discard draft' }))
    expect(screen.queryByText('Goa please')).not.toBeInTheDocument()
    expect(readDraft()).toBeNull()
  })

  it('keeps and displays the original date context when resuming on a later date', async () => {
    signIn()
    seedDraft(
      storedDraft({
        reference_date: '2026-01-01',
        timezone: 'Asia/Kolkata',
        messages: [
          { role: 'user', content: 'Goa next weekend', ui_only: false },
          { role: 'assistant', content: 'Who is going?', ui_only: false },
        ],
      }),
    )
    const api = setupApi([ok(PARTIAL)])
    const user = userEvent.setup()
    renderNewTrip()
    expect(screen.getByText(/interpreted relative to 1 January 2026 \(\s*Asia\/Kolkata\)/)).toBeInTheDocument()
    await user.type(composer(), 'with friends{Enter}')
    await waitFor(() => expect(api.aiCalls()).toHaveLength(1))
    const body = api.aiCalls()[0].body as { reference_date: string; timezone: string; messages: unknown[] }
    expect(body.reference_date).toBe('2026-01-01')
    expect(body.timezone).toBe('Asia/Kolkata')
    expect(body.messages).toHaveLength(3)
  })

  it('does not restore another account’s draft', () => {
    signIn('asha')
    seedDraft(storedDraft({ account: 'ravi', messages: [{ role: 'user', content: 'Ravi trip', ui_only: false }] }), 'ravi')
    setupApi([])
    renderNewTrip()
    expect(screen.queryByText('Ravi trip')).not.toBeInTheDocument()
  })

  it('discards corrupt saved data without crashing', () => {
    signIn()
    window.localStorage.setItem(draftStorageKey('asha'), '{"schema_version":1,"messages":"oops"')
    setupApi([])
    renderNewTrip()
    expect(screen.getByText('Your saved draft couldn’t be restored, so it was discarded.')).toBeInTheDocument()
    expect(composer()).toHaveValue('')
  })

  it('explains when storage is unavailable and keeps the in-memory flow', async () => {
    signIn()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })
    setupApi([])
    const user = userEvent.setup()
    renderNewTrip()
    expect(screen.getByText(/Draft restoration is unavailable/)).toBeInTheDocument()
    await user.type(composer(), 'Goa')
    expect(composer()).toHaveValue('Goa')
  })
})

describe('TripChat — uncertain creation outcome', () => {
  it('restores an interrupted creation as an uncertain outcome without resubmitting', async () => {
    signIn()
    seedDraft(
      storedDraft({
        fields: { destination: 'Goa', start_date: '2027-04-03', end_date: '2027-04-05', trip_type: 'group_of_friends' },
        messages: [
          { role: 'user', content: USER_TEXT, ui_only: false },
          { role: 'assistant', content: COMPLETE.reply, ui_only: false },
          { role: 'assistant', content: CONFIRMATION_QUESTION, ui_only: true },
          { role: 'user', content: 'yes', ui_only: true },
        ],
        creation_in_progress: true,
      }),
    )
    const api = setupApi([])
    const user = userEvent.setup()
    renderNewTrip()

    expect(screen.getByText(/We couldn’t confirm whether your trip was created/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Check saved trips' })).toHaveAttribute('href', '/trips')
    expect(screen.getByRole('button', { name: 'Create trip' })).toBeDisabled()
    expect(api.calls).toHaveLength(0)
    expect(readDraft()?.uncertain_outcome).toBe(true)

    await user.click(screen.getByRole('button', { name: 'I’ve checked — continue' }))
    expect(screen.getByRole('button', { name: 'Create trip' })).toBeEnabled()
    expect(api.calls).toHaveLength(0)
  })

  it('a network failure during creation is reported as uncertain and not retried', async () => {
    signIn()
    const api = setupApi([ok(COMPLETE)], () => {
      throw new TypeError('Failed to fetch')
    })
    const user = userEvent.setup()
    renderNewTrip()
    await completeConversation(user)
    await user.type(composer(), 'yes{Enter}')

    expect(await screen.findByText(/We couldn’t confirm whether your trip was created/, LIVE)).toBeInTheDocument()
    expect(api.createCalls()).toHaveLength(1)
    expect(screen.getByLabelText('Destination')).toHaveValue('Goa')
  })

  it('a definite creation failure keeps the details and allows another attempt', async () => {
    signIn()
    let attempts = 0
    const api = setupApi([ok(COMPLETE)], () => {
      attempts += 1
      return attempts === 1 ? jsonResponse(400, { detail: 'end_date must be on or after start_date' }) : jsonResponse(201, CREATED_TRIP)
    })
    const user = userEvent.setup()
    renderNewTrip()
    await completeConversation(user)
    await user.type(composer(), 'yes{Enter}')

    expect(await screen.findByText(/Couldn’t create the trip: end_date must be on or after start_date/, LIVE)).toBeInTheDocument()
    expect(readDraft()?.creation_in_progress).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Create trip' }))
    expect(await screen.findByText('Trip page trip-1')).toBeInTheDocument()
    expect(api.createCalls()).toHaveLength(2)
  })
})

describe('TripChat — manual mode', () => {
  it('switching preserves extracted values without preselecting a trip type, and creates via the form', async () => {
    signIn()
    const api = setupApi([ok(PARTIAL)])
    const user = userEvent.setup()
    renderNewTrip()
    await user.type(composer(), `${USER_TEXT}{Enter}`)
    await screen.findByText(PARTIAL.reply, LIVE)

    await user.click(screen.getByRole('button', { name: 'Enter details manually' }))
    expect(screen.getByLabelText('Destination')).toHaveValue('Goa')
    expect(screen.getByLabelText('From date')).toHaveValue('2027-04-03')
    expect(screen.getByLabelText('To date')).toHaveValue('2027-04-05')
    expect(screen.getByLabelText('Trip Type')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Create trip' })).toBeDisabled()

    await user.selectOptions(screen.getByLabelText('Trip Type'), 'family')
    await user.click(screen.getByRole('button', { name: 'Create trip' }))
    expect(await screen.findByText('Trip page trip-1')).toBeInTheDocument()
    expect(api.createCalls()[0].body).toEqual({
      destination: 'Goa',
      start_date: '2027-04-03',
      end_date: '2027-04-05',
      trip_type: 'family',
    })
  })

  it('returning to chat starts a fresh conversation with the current valid draft', async () => {
    signIn()
    seedDraft(
      storedDraft({
        mode: 'manual',
        messages: [{ role: 'user', content: 'old message', ui_only: false }],
        fields: { destination: 'Jaipur', start_date: '2027-04-03', end_date: '', trip_type: '' },
        reference_date: '2026-01-01',
      }),
    )
    const api = setupApi([ok(PARTIAL)])
    const user = userEvent.setup()
    renderNewTrip()
    await user.click(screen.getByRole('button', { name: 'Describe your trip in chat instead' }))
    expect(screen.queryByText('old message')).not.toBeInTheDocument()
    await user.type(composer(), 'with family{Enter}')
    await waitFor(() => expect(api.aiCalls()).toHaveLength(1))
    expect(api.aiCalls()[0].body).toMatchObject({
      messages: [{ role: 'user', content: 'with family' }],
      draft: { destination: 'Jaipur', start_date: '2027-04-03', end_date: null, trip_type: null },
      reference_date: todayLocalIso(),
    })
  })
})

describe('TripChat — logout', () => {
  it('logout deletes the saved draft and a late response cannot recreate it', async () => {
    signIn()
    const pending = deferred<Response>()
    setupApi([() => pending.promise])
    const user = userEvent.setup()
    renderNewTrip()

    await user.type(composer(), `${USER_TEXT}{Enter}`)
    expect(readDraft()).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Log out' }))
    expect(await screen.findByText('Login page')).toBeInTheDocument()
    expect(readDraft()).toBeNull()
    expect(window.localStorage.getItem('musafir.token')).toBeNull()

    await act(async () => {
      pending.resolve(jsonResponse(200, COMPLETE))
      await pending.promise
    })
    expect(readDraft()).toBeNull()
  })

  it('a 401 logs out, deletes the draft and redirects to /login', async () => {
    signIn()
    const api = setupApi([() => jsonResponse(401, { detail: 'Token expired' })])
    const user = userEvent.setup()
    renderNewTrip()
    await user.type(composer(), `${USER_TEXT}{Enter}`)

    expect(await screen.findByText('Login page')).toBeInTheDocument()
    expect(readDraft()).toBeNull()
    expect(window.localStorage.getItem('musafir.token')).toBeNull()
    expect((api.calls[0] as RecordedCall).headers.Authorization).toBe('Bearer token-asha')
  })
})
