import { afterEach, describe, expect, it, vi } from 'vitest'
import { jsonResponse, mockFetch } from '../test/utils'
import { login } from './auth'
import { ApiError, apiRequest, getErrorMessage, setAuthToken, setUnauthorizedHandler } from './client'

afterEach(() => {
  setAuthToken(null)
  setUnauthorizedHandler(null)
})

describe('api client', () => {
  it('sends the bearer token and calls the unauthorized handler on an authenticated 401', async () => {
    const { calls } = mockFetch(() => jsonResponse(401, { detail: 'Not authenticated' }))
    const handler = vi.fn<() => void>()
    setUnauthorizedHandler(handler)
    setAuthToken('abc')
    await expect(apiRequest('/trips')).rejects.toBeInstanceOf(ApiError)
    expect(calls[0].headers.Authorization).toBe('Bearer abc')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not log out on a login 401 (bad credentials)', async () => {
    mockFetch(() => jsonResponse(401, { detail: 'Invalid credentials' }))
    const handler = vi.fn<() => void>()
    setUnauthorizedHandler(handler)
    await expect(login({ username: 'a', password: 'b' })).rejects.toBeInstanceOf(ApiError)
    expect(handler).not.toHaveBeenCalled()
  })

  it.each([403, 404, 422, 429, 500, 503])('does not log out on %i', async (status) => {
    mockFetch(() => jsonResponse(status, { detail: 'nope' }))
    const handler = vi.fn<() => void>()
    setUnauthorizedHandler(handler)
    setAuthToken('abc')
    await expect(apiRequest('/trips')).rejects.toBeInstanceOf(ApiError)
    expect(handler).not.toHaveBeenCalled()
  })

  it('parses Retry-After and 422 detail arrays', async () => {
    mockFetch(() => jsonResponse(429, { detail: 'Slow down' }, { 'Retry-After': '17' }))
    const error = await apiRequest('/ai/trip-draft', { method: 'POST', body: {} }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).retryAfterSeconds).toBe(17)

    const validation = new ApiError(422, [{ loc: ['body', 'destination'], msg: 'field required', type: 'missing' }])
    expect(getErrorMessage(validation)).toBe('destination: field required')
  })
})
