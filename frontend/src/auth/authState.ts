import { createContext, useContext } from 'react'
import type { AuthResponse } from '../types'

export const TOKEN_STORAGE_KEY = 'musafir.token'
export const USERNAME_STORAGE_KEY = 'musafir.username'

export interface AuthContextValue {
  token: string | null
  username: string | null
  isAuthenticated: boolean
  /** Store a successful login/signup response. */
  signIn: (response: AuthResponse) => void
  /** Clear the session and the account's saved trip draft. */
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within an AuthProvider')
  return value
}

export function readStoredSession(): { token: string | null; username: string | null } {
  try {
    const token = window.localStorage.getItem(TOKEN_STORAGE_KEY)
    const username = window.localStorage.getItem(USERNAME_STORAGE_KEY)
    if (token && username) return { token, username }
  } catch {
    // Storage unavailable: start signed out.
  }
  return { token: null, username: null }
}
