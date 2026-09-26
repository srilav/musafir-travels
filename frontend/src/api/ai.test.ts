import { describe, expect, it } from 'vitest'
import { isTripDraftResponse } from './ai'

const complete = {
  draft: { destination: 'Goa', start_date: '2027-04-03', end_date: '2027-04-05', trip_type: 'group_of_friends' },
  missing_fields: [],
  clarification_fields: [],
  reply: 'Goa, 3–5 April 2027, with friends.',
}

describe('isTripDraftResponse', () => {
  it('accepts a complete response and a clarification response', () => {
    expect(isTripDraftResponse(complete)).toBe(true)
    expect(
      isTripDraftResponse({
        draft: { destination: 'Goa', start_date: null, end_date: null, trip_type: 'group_of_friends' },
        missing_fields: ['start_date', 'end_date'],
        clarification_fields: [],
        reply: 'What are your dates?',
      }),
    ).toBe(true)
  })

  it.each([
    ['extra draft key', { ...complete, draft: { ...complete.draft, budget: 1 } }],
    ['bad trip type', { ...complete, draft: { ...complete.draft, trip_type: 'crew' } }],
    ['reversed dates', { ...complete, draft: { ...complete.draft, end_date: '2027-04-01' } }],
    ['blank reply', { ...complete, reply: '  ' }],
    ['null field not listed', { ...complete, draft: { ...complete.draft, destination: null } }],
    ['non-null field listed', { ...complete, missing_fields: ['destination'] }],
    [
      'overlapping lists',
      {
        ...complete,
        draft: { ...complete.draft, destination: null },
        missing_fields: ['destination'],
        clarification_fields: ['destination'],
      },
    ],
    ['unknown field name', { ...complete, clarification_fields: ['budget'] }],
  ])('rejects %s', (_label, body) => {
    expect(isTripDraftResponse(body)).toBe(false)
  })
})
