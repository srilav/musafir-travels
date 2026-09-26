import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { buttonPrimary, card, inputBase, labelBase } from '../lib/styles'

interface AuthFormProps {
  title: string
  submitLabel: string
  pending: boolean
  error: string | null
  onSubmit: (credentials: { username: string; password: string }) => void
  footer: ReactNode
  passwordAutoComplete: 'current-password' | 'new-password'
}

/** Shared username/password form used by LoginForm and SignupForm. */
export function AuthForm({ title, submitLabel, pending, error, onSubmit, footer, passwordAutoComplete }: AuthFormProps) {
  const id = useId()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!username.trim() || !password) {
      setLocalError('Enter both a username and a password.')
      return
    }
    setLocalError(null)
    onSubmit({ username: username.trim(), password })
  }

  const shownError = localError ?? error
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className={`${card} w-full max-w-sm`}>
        <p className="mb-1 text-center text-2xl font-bold text-primary">Musafir Travels</p>
        <h1 className="mb-6 text-center text-lg font-semibold">{title}</h1>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor={`${id}-username`} className={labelBase}>
              Username
            </label>
            <input
              id={`${id}-username`}
              className={inputBase}
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor={`${id}-password`} className={labelBase}>
              Password
            </label>
            <input
              id={`${id}-password`}
              type="password"
              className={inputBase}
              autoComplete={passwordAutoComplete}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {shownError && (
            <p role="alert" className="text-sm text-error">
              {shownError}
            </p>
          )}
          <button type="submit" className={`${buttonPrimary} w-full`} disabled={pending}>
            {pending ? 'Please wait…' : submitLabel}
          </button>
        </form>
        <div className="mt-4 text-center text-sm text-text-muted">{footer}</div>
      </div>
    </div>
  )
}
