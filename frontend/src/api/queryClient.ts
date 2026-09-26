import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './client'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Don't retry client errors (401/404...); retry transient failures once.
        retry: (failureCount, error) => !(error instanceof ApiError && error.status < 500) && failureCount < 1,
        refetchOnWindowFocus: false,
      },
    },
  })
}
