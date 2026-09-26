import { API_BASE_URL } from '../config'
import type { ErrorBody, ValidationErrorItem } from '../types'

/** An HTTP error response from the backend (non-2xx). */
export class ApiError extends Error {
  readonly status: number
  readonly detail: ErrorBody['detail'] | null
  /** Parsed integer-seconds `Retry-After` header (429 responses), if present. */
  readonly retryAfterSeconds: number | null

  constructor(status: number, detail: ErrorBody['detail'] | null, retryAfterSeconds: number | null = null) {
    super(typeof detail === 'string' ? detail : `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/** The request never produced an HTTP response (offline, DNS, CORS, reset...). */
export class NetworkError extends Error {
  constructor(message = 'Network request failed') {
    super(message)
    this.name = 'NetworkError'
  }
}

let authToken: string | null = null
let unauthorizedHandler: (() => void) | null = null

export function setAuthToken(token: string | null): void {
  authToken = token
}

export function getAuthToken(): string | null {
  return authToken
}

/** Registered by AuthContext: called when an authenticated request returns 401. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10)
  const date = Date.parse(trimmed)
  if (!Number.isNaN(date)) return Math.max(0, Math.ceil((date - Date.now()) / 1000))
  return null
}

function isErrorBody(value: unknown): value is ErrorBody {
  if (typeof value !== 'object' || value === null || !('detail' in value)) return false
  const detail = (value as { detail: unknown }).detail
  return typeof detail === 'string' || Array.isArray(detail)
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  /** Send the bearer token (default true). */
  auth?: boolean
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, auth = true } = options
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = auth ? authToken : null
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new NetworkError()
  }

  if (!response.ok) {
    let detail: ErrorBody['detail'] | null = null
    try {
      const parsed: unknown = await response.json()
      if (isErrorBody(parsed)) detail = parsed.detail
    } catch {
      // Non-JSON error body; keep detail null.
    }
    // Only an authenticated request's 401 means the session is invalid; a
    // 401 from login means bad credentials and must not log anyone out.
    if (response.status === 401 && token && token === authToken) {
      unauthorizedHandler?.()
    }
    throw new ApiError(response.status, detail, parseRetryAfter(response.headers.get('Retry-After')))
  }

  if (response.status === 204) return undefined as T
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

function formatValidationItem(item: ValidationErrorItem): string {
  const field = item.loc.filter((part) => part !== 'body').join('.')
  return field ? `${field}: ${item.msg}` : item.msg
}

/** Human-readable message for any error thrown by the API layer. */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof ApiError) {
    if (typeof error.detail === 'string' && error.detail.trim()) return error.detail
    if (Array.isArray(error.detail) && error.detail.length > 0) {
      return error.detail.map(formatValidationItem).join('; ')
    }
    return fallback
  }
  if (error instanceof NetworkError) return 'Could not reach the server. Check your connection and try again.'
  return fallback
}
