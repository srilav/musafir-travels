/** Shared Tailwind class strings so the single color/spacing scale stays consistent. */
export const buttonPrimary =
  'inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-surface ' +
  'hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

export const buttonSecondary =
  'inline-flex items-center justify-center rounded-md border border-primary bg-surface px-4 py-2 text-sm ' +
  'font-semibold text-primary hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50'

export const buttonDanger =
  'inline-flex items-center justify-center rounded-md border border-error bg-surface px-4 py-2 text-sm ' +
  'font-semibold text-error hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-error disabled:cursor-not-allowed disabled:opacity-50'

export const linkText =
  'font-medium text-primary underline-offset-2 hover:text-primary-hover hover:underline ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

export const inputBase =
  'block w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-text ' +
  'placeholder:text-text-muted focus:border-primary focus:outline-2 focus:outline-primary/30'

export const inputInvalid = 'border-error focus:border-error focus:outline-error/30'

export const labelBase = 'mb-1 block text-sm font-medium text-text'

export const card = 'rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-6'
