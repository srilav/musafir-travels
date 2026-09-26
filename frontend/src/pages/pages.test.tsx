import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { AppRoutes } from '../App'
import { AuthProvider } from '../auth/AuthContext'
import { API, deferred, jsonResponse, makeQueryClient, mockFetch, signIn } from '../test/utils'

function renderApp(path: string, queryClient = makeQueryClient()) {
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  )
  return queryClient
}

const SUMMARY = {
  id: 't1',
  destination: 'Kyoto, Japan',
  start_date: '2026-10-01',
  end_date: '2026-10-02',
  trip_type: 'couple',
  created_at: '2026-09-16T10:00:00Z',
}

const TRIP = {
  ...SUMMARY,
  days: [
    {
      id: 'd1',
      day_number: 1,
      date: '2026-10-01',
      activities: [{ id: 'a1', text: 'Visit Fushimi Inari', sort_order: 0, created_at: '' }],
    },
    { id: 'd2', day_number: 2, date: '2026-10-02', activities: [] },
  ],
}

describe('auth pages', () => {
  it('redirects unauthenticated users to /login', () => {
    mockFetch(() => jsonResponse(200, []))
    renderApp('/trips')
    expect(screen.getByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  })

  it('shows an inline error on bad credentials and logs in on success', async () => {
    let attempt = 0
    mockFetch((call) => {
      if (call.url === `${API}/auth/login`) {
        attempt += 1
        return attempt === 1
          ? jsonResponse(401, { detail: 'Invalid credentials' })
          : jsonResponse(200, { access_token: 'tok', token_type: 'bearer', expires_in: 2592000, username: 'asha' })
      }
      return jsonResponse(200, [])
    })
    const user = userEvent.setup()
    renderApp('/login')
    await user.type(screen.getByLabelText('Username'), 'asha')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByText('Invalid username or password.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByText('Welcome to Musafir Travels')).toBeInTheDocument()
    expect(screen.getByText('asha')).toBeInTheDocument()
    expect(window.localStorage.getItem('musafir.token')).toBe('tok')
    expect(window.localStorage.getItem('musafir.username')).toBe('asha')
  })

  it('shows signup errors such as a taken username', async () => {
    mockFetch(() => jsonResponse(400, { detail: 'Username already taken' }))
    const user = userEvent.setup()
    renderApp('/signup')
    await user.type(screen.getByLabelText('Username'), 'asha')
    await user.type(screen.getByLabelText('Password'), 'pw')
    await user.click(screen.getByRole('button', { name: 'Sign up' }))
    expect(await screen.findByText('Username already taken')).toBeInTheDocument()
  })
})

describe('HomePage', () => {
  it('shows loading, then the trip list with a title link home', async () => {
    signIn()
    const list = deferred<Response>()
    mockFetch(() => list.promise)
    renderApp('/trips')
    expect(screen.getByText('Loading your trips…')).toBeInTheDocument()
    list.resolve(jsonResponse(200, [SUMMARY]))
    const link = await screen.findByRole('link', { name: /Kyoto, Japan/ })
    expect(link).toHaveAttribute('href', '/trips/t1')
    expect(screen.getByRole('link', { name: 'Musafir Travels' })).toHaveAttribute('href', '/trips')
  })

  it('shows an empty state with an Add New Trip call-to-action', async () => {
    signIn()
    mockFetch(() => jsonResponse(200, []))
    renderApp('/trips')
    expect(await screen.findByText('You haven’t planned any trips yet.')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Add New Trip' })).toHaveLength(2)
  })

  it('shows an error with retry', async () => {
    signIn()
    let calls = 0
    mockFetch(() => {
      calls += 1
      return calls === 1 ? jsonResponse(500, { detail: 'boom' }) : jsonResponse(200, [SUMMARY])
    })
    const user = userEvent.setup()
    renderApp('/trips')
    expect(await screen.findByText(/Couldn’t load your trips/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Kyoto, Japan')).toBeInTheDocument()
  })
})

describe('TripItineraryPage', () => {
  it('expands a day, adds an activity, and deletes the trip without refetching the detail', async () => {
    signIn()
    const { calls } = mockFetch((call) => {
      if (call.method === 'GET' && call.url === `${API}/trips/t1`) return jsonResponse(200, TRIP)
      if (call.method === 'GET' && call.url === `${API}/trips`) return jsonResponse(200, [])
      if (call.method === 'POST' && call.url === `${API}/trips/t1/days/d2/activities`) {
        return jsonResponse(201, { id: 'a9', text: 'Nishiki market', sort_order: 0, created_at: '' })
      }
      if (call.method === 'DELETE' && call.url === `${API}/trips/t1`) return new Response(null, { status: 204 })
      throw new Error(`Unexpected ${call.method} ${call.url}`)
    })
    const user = userEvent.setup()
    const queryClient = renderApp('/trips/t1')
    const removeSpy = vi.spyOn(queryClient, 'removeQueries')
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    expect(await screen.findByRole('heading', { name: 'Kyoto, Japan' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Back to Trips' })).toHaveAttribute('href', '/trips')

    await user.click(screen.getByRole('button', { name: /Day 2/ }))
    await user.type(screen.getByLabelText('New activity for Day 2'), 'Nishiki market')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await vi.waitFor(() =>
      expect(calls.some((call) => call.method === 'POST' && (call.body as { text: string }).text === 'Nishiki market')).toBe(true),
    )

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete trip' }))
    expect(await screen.findByText('Welcome to Musafir Travels')).toBeInTheDocument()

    expect(removeSpy).toHaveBeenCalledWith({ queryKey: ['trips', 't1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['trips'], exact: true })
    const detailGetsAfterDelete = calls
      .slice(calls.findIndex((call) => call.method === 'DELETE'))
      .filter((call) => call.method === 'GET' && call.url === `${API}/trips/t1`)
    expect(detailGetsAfterDelete).toHaveLength(0)
  })

  it('hides Print/Delete until the trip has activities', async () => {
    signIn()
    mockFetch(() => jsonResponse(200, { ...TRIP, days: TRIP.days.map((day) => ({ ...day, activities: [] })) }))
    renderApp('/trips/t1')
    expect(await screen.findByRole('heading', { name: 'Kyoto, Japan' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Print' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Day 1/ })).toBeInTheDocument()
  })
})
