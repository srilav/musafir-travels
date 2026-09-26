import { describe, expect, it } from 'vitest'
import { CONFIRMATION_PHRASES, isConfirmationPhrase, normalizeConfirmation } from './confirmation'

describe('isConfirmationPhrase', () => {
  it('accepts every phrase in the approved list', () => {
    for (const phrase of CONFIRMATION_PHRASES) expect(isConfirmationPhrase(phrase)).toBe(true)
  })

  it.each([
    'Yes',
    'YES',
    '  yes  ',
    'yes.',
    'Yes!',
    'yes!!!',
    'Yes, create it.',
    'yes   create   it',
    'Create it!',
    'create trip',
    'Confirm.',
    'Haan',
    'haan, bana do',
    'Haan bana do!',
    'haan create kar do',
    'Haan, create kar do.',
    '\tyes\n',
  ])('normalizes case, whitespace and punctuation: %j', (text) => {
    expect(isConfirmationPhrase(text)).toBe(true)
  })

  it.each([
    'yes, but change the dates',
    'Yes, but make it solo',
    'yes please change destination',
    'no',
    'not yes',
    'yesterday',
    'yess',
    'confirmed?',
    'create it for family',
    'haan but solo',
    'ok',
    'sure',
    '',
    '   ',
    'yes create it now',
  ])('rejects non-standalone or unlisted replies: %j', (text) => {
    expect(isConfirmationPhrase(text)).toBe(false)
  })

  it('normalizes to lowercase single-spaced words', () => {
    expect(normalizeConfirmation('  Haan,   BANA do!! ')).toBe('haan bana do')
  })
})
