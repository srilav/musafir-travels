import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import { vi, type Mock } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { TOKEN_STORAGE_KEY, USERNAME_STORAGE_KEY } from '../auth/authState'
import { ProtectedRoute } from '../auth/ProtectedRoute'
import { AppShell } from '../components/AppShell'
import { NewTripPage } from '../pages/NewTripPage'

export const API = 'http://api.test/api/v1'

export function jsonResponse(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

export interface RecordedCall {
  url: string
  method: string
  body: unknown
  headers: Record<string, string>
}

type Handler = (call: RecordedCall, signal?: AbortSignal | null) => Response | Promise<Response>

/** Stub global fetch; every call is recorded (with parsed JSON body). */
export function mockFetch(handler: Handler): { fetch: Mock; calls: RecordedCall[] } {
  const calls: RecordedCall[] = []
  const fetchMock = vi.fn<typeof fetch>(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: RecordedCall = {
      url: String(input),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
    }
    calls.push(call)
    return handler(call, init?.signal)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetch: fetchMock, calls }
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export function signIn(username = 'asha', token = 'token-asha') {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token)
  window.localStorage.setItem(USERNAME_STORAGE_KEY, username)
}

function TripStub() {
  const { tripId } = useParams()
  return <p>Trip page {tripId}</p>
}

export function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

/** Render the /trips/new flow (inside AppShell) with auth + query providers. */
export function renderNewTrip(options: { queryClient?: QueryClient } = {}) {
  const queryClient = options.queryClient ?? makeQueryClient()
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={['/trips/new']}>
          <Routes>
            <Route path="/login" element={<p>Login page</p>} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route path="/trips" element={<p>Trips list</p>} />
                <Route path="/trips/new" element={<NewTripPage />} />
                <Route path="/trips/:tripId" element={<TripStub />} />
              </Route>
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
  return { ...render(tree), queryClient }
}
