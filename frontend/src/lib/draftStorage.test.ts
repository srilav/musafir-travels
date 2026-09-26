import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearDraftOnLogout,
  draftStorageKey,
  getStorageGeneration,
  isStorageAvailable,
  loadDraft,
  saveDraft,
  type StoredDraft,
} from './draftStorage'

const BASE = 'http://api.test/api/v1'

function makeDraft(overrides: Partial<StoredDraft> = {}): StoredDraft {
  return {
    schema_version: 1,
    account: 'asha',
    api_base_url: BASE,
    updated_at: '2026-09-24T10:00:00.000Z',
    mode: 'chat',
    messages: [
      { role: 'user', content: 'Goa with friends', ui_only: false },
      { role: 'assistant', content: 'What are your dates?', ui_only: false },
    ],
    fields: { destination: 'Goa', start_date: '', end_date: '', trip_type: 'group_of_friends' },
    missing_fields: ['start_date', 'end_date'],
    clarification_fields: [],
    composer: 'from 3',
    reference_date: '2026-09-24',
    timezone: 'Asia/Kolkata',
    creation_in_progress: false,
    uncertain_outcome: false,
    ...overrides,
  }
}

const expected = { account: 'asha', apiBaseUrl: BASE }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('draft storage', () => {
  it('namespaces keys by account and backend environment', () => {
    const a = draftStorageKey('asha', BASE)
    expect(a).not.toBe(draftStorageKey('ravi', BASE))
    expect(a).not.toBe(draftStorageKey('asha', 'https://prod.example.com/api/v1'))
    expect(a).toContain('v1')
  })

  it('round-trips a valid draft', () => {
    const key = draftStorageKey('asha', BASE)
    expect(saveDraft(key, makeDraft(), getStorageGeneration())).toBe('saved')
    expect(loadDraft(key, expected)).toEqual({ status: 'restored', draft: makeDraft() })
  })

  it('returns none when nothing is stored', () => {
    expect(loadDraft(draftStorageKey('asha', BASE), expected)).toEqual({ status: 'none' })
  })

  it.each([
    ['malformed JSON', '{not json'],
    ['a non-object', '42'],
    ['an unsupported schema version', JSON.stringify(makeDraft({ schema_version: 2 as 1 }))],
    ['another account', JSON.stringify(makeDraft({ account: 'ravi' }))],
    ['another backend', JSON.stringify(makeDraft({ api_base_url: 'https://other/api/v1' }))],
    ['a bad role', JSON.stringify(makeDraft({ messages: [{ role: 'system' as 'user', content: 'x', ui_only: false }] }))],
    ['an oversized message', JSON.stringify(makeDraft({ messages: [{ role: 'user', content: 'a'.repeat(2001), ui_only: false }] }))],
    [
      'too many messages',
      JSON.stringify(
        makeDraft({ messages: Array.from({ length: 21 }, () => ({ role: 'user' as const, content: 'x', ui_only: false })) }),
      ),
    ],
    ['an invalid date', JSON.stringify(makeDraft({ fields: { destination: 'Goa', start_date: '2027-02-30', end_date: '', trip_type: '' } }))],
    ['an unknown trip type', JSON.stringify(makeDraft({ fields: { destination: 'Goa', start_date: '', end_date: '', trip_type: 'crew' as '' } }))],
    ['an unknown field marker', JSON.stringify(makeDraft({ missing_fields: ['budget' as 'destination'] }))],
    ['a bad reference date', JSON.stringify(makeDraft({ reference_date: '24/09/2026' }))],
    ['a bad timezone', JSON.stringify(makeDraft({ timezone: 'Mars/Olympus' }))],
    ['a missing marker flag', JSON.stringify({ ...makeDraft(), creation_in_progress: 'yes' })],
  ])('rejects and removes %s without throwing', (_label, raw) => {
    const key = draftStorageKey('asha', BASE)
    window.localStorage.setItem(key, raw)
    expect(loadDraft(key, expected)).toEqual({ status: 'invalid' })
    expect(window.localStorage.getItem(key)).toBeNull()
  })

  it('deletes the account draft on logout and suppresses late writes', () => {
    const key = draftStorageKey('asha', BASE)
    const otherKey = draftStorageKey('ravi', BASE)
    const writerGeneration = getStorageGeneration()
    saveDraft(key, makeDraft(), writerGeneration)
    saveDraft(otherKey, makeDraft({ account: 'ravi' }), writerGeneration)

    clearDraftOnLogout(key)

    expect(window.localStorage.getItem(key)).toBeNull()
    expect(window.localStorage.getItem(otherKey)).not.toBeNull()
    // A late response from the old session cannot recreate the draft.
    expect(saveDraft(key, makeDraft(), writerGeneration)).toBe('suppressed')
    expect(window.localStorage.getItem(key)).toBeNull()
    // A new session writes normally.
    expect(saveDraft(key, makeDraft(), getStorageGeneration())).toBe('saved')
  })

  it('reports unavailable/full storage instead of throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })
    expect(isStorageAvailable()).toBe(false)
    expect(saveDraft(draftStorageKey('asha', BASE), makeDraft(), getStorageGeneration())).toBe('failed')
  })

  it('reports unavailable when reading throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError')
    })
    expect(loadDraft(draftStorageKey('asha', BASE), expected)).toEqual({ status: 'unavailable' })
  })
})
