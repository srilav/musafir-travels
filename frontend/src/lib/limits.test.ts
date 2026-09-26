import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../types'
import { charCount, checkSendLimits, isHistoryFull, MAX_AGGREGATE_CHARS, MAX_MESSAGE_CHARS, MAX_REQUEST_MESSAGES } from './limits'

function history(count: number, content = 'hi'): ChatMessage[] {
  return Array.from({ length: count }, (_, index) => ({ role: index % 2 === 0 ? 'user' : 'assistant', content }))
}

describe('send limits', () => {
  it('counts code points, not UTF-16 units', () => {
    expect(charCount('😀')).toBe(1)
    expect(charCount('abc')).toBe(3)
  })

  it('allows a message at exactly 2,000 characters and rejects 2,001', () => {
    expect(checkSendLimits([], 'a'.repeat(MAX_MESSAGE_CHARS))).toBeNull()
    expect(checkSendLimits([], 'a'.repeat(MAX_MESSAGE_CHARS + 1))).toEqual({ kind: 'message_too_long', length: 2001 })
  })

  it('reserves the 20th slot for the reply: at most 19 messages per request', () => {
    expect(MAX_REQUEST_MESSAGES).toBe(19)
    expect(checkSendLimits(history(18), 'next')).toBeNull()
    expect(checkSendLimits(history(19), 'next')).toEqual({ kind: 'history_full' })
    expect(isHistoryFull(history(18))).toBe(false)
    expect(isHistoryFull(history(19))).toBe(true)
  })

  it('includes the new message in the 12,000-character aggregate', () => {
    const big = history(6, 'a'.repeat(2000)) // 12,000 already
    expect(checkSendLimits(big.slice(0, 5), 'a'.repeat(2000))).toBeNull()
    expect(checkSendLimits(big, 'x')).toEqual({ kind: 'aggregate_exceeded', total: MAX_AGGREGATE_CHARS + 1 })
  })
})
