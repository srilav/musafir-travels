/** Backend base URL, e.g. `http://localhost:8000/api/v1`. Never hardcoded. */
export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

if (!API_BASE_URL && import.meta.env.DEV) {
  console.warn('VITE_API_BASE_URL is not set; copy .env.example to .env.local.')
}
