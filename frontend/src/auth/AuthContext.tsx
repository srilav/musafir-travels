import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { setAuthToken, setUnauthorizedHandler } from '../api/client'
import { clearDraftOnLogout, draftStorageKey } from '../lib/draftStorage'
import type { AuthResponse } from '../types'
import { AuthContext, readStoredSession, TOKEN_STORAGE_KEY, USERNAME_STORAGE_KEY, type AuthContextValue } from './authState'

interface Session {
  token: string | null
  username: string | null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session>(() => {
    const stored = readStoredSession()
    setAuthToken(stored.token)
    return stored
  })
  const signIn = useCallback((response: AuthResponse) => {
    try {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, response.access_token)
      window.localStorage.setItem(USERNAME_STORAGE_KEY, response.username)
    } catch {
      // Session still works in memory without storage.
    }
    setAuthToken(response.access_token)
    setSession({ token: response.access_token, username: response.username })
  }, [])

  const logout = useCallback(() => {
    // Capture the account's draft key before clearing authentication, then
    // delete the draft and invalidate any writer that could recreate it.
    const username = session.username
    clearDraftOnLogout(username ? draftStorageKey(username) : null)
    setAuthToken(null)
    try {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY)
      window.localStorage.removeItem(USERNAME_STORAGE_KEY)
    } catch {
      // Ignore storage failures.
    }
    setSession({ token: null, username: null })
    queryClient.cancelQueries().catch(() => undefined)
    queryClient.clear()
  }, [queryClient, session.username])

  // Only a 401 from an authenticated request logs out (ProtectedRoute then
  // redirects to /login).
  useEffect(() => {
    setUnauthorizedHandler(logout)
    return () => setUnauthorizedHandler(null)
  }, [logout])

  const value = useMemo<AuthContextValue>(
    () => ({
      token: session.token,
      username: session.username,
      isAuthenticated: Boolean(session.token && session.username),
      signIn,
      logout,
    }),
    [session, signIn, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
