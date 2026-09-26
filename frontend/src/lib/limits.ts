import type { ChatMessage } from '../types'

/** Approved limits (api-contract §5, AI-spec §6). */
export const MAX_MESSAGE_CHARS = 2000
export const MAX_AGGREGATE_CHARS = 12000
export const MAX_CONVERSATION_MESSAGES = 20
/** One slot is reserved for the assistant response. */
export const MAX_REQUEST_MESSAGES = MAX_CONVERSATION_MESSAGES - 1

/** Character count in Unicode code points (matches the backend's `len`). */
export function charCount(text: string): number {
  let count = 0
  for (const _char of text) count += 1
  return count
}

export function totalChars(messages: readonly ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + charCount(message.content), 0)
}

export type LimitProblem =
  | { kind: 'message_too_long'; length: number }
  | { kind: 'history_full' }
  | { kind: 'aggregate_exceeded'; total: number }

/**
 * Check whether sending `text` after `history` stays within every bound.
 * Returns null when the send is allowed. History is never truncated.
 */
export function checkSendLimits(history: readonly ChatMessage[], text: string): LimitProblem | null {
  const length = charCount(text)
  if (length > MAX_MESSAGE_CHARS) return { kind: 'message_too_long', length }
  if (history.length + 1 > MAX_REQUEST_MESSAGES) return { kind: 'history_full' }
  const total = totalChars(history) + length
  if (total > MAX_AGGREGATE_CHARS) return { kind: 'aggregate_exceeded', total }
  return null
}

/** Whether no further message can be sent regardless of its content. */
export function isHistoryFull(history: readonly ChatMessage[]): boolean {
  return history.length + 1 > MAX_REQUEST_MESSAGES
}
