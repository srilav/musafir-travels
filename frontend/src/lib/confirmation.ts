/**
 * Deterministic standalone confirmation matching (AI-spec §5).
 *
 * The phrase list is explicit; matching is exact after normalization
 * (case, whitespace, punctuation). No substring matching: "yes, but change
 * the dates" is a correction, not a confirmation.
 */
export const CONFIRMATION_PHRASES: readonly string[] = [
  'yes',
  'yes create it',
  'create it',
  'create trip',
  'confirm',
  'haan',
  'haan bana do',
  'haan create kar do',
]

const PHRASE_SET = new Set(CONFIRMATION_PHRASES)

export function normalizeConfirmation(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isConfirmationPhrase(text: string): boolean {
  return PHRASE_SET.has(normalizeConfirmation(text))
}

export const CONFIRMATION_QUESTION = 'Shall I create this trip? Reply yes to confirm, or tell me what to change.'
