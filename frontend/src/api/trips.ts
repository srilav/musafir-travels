import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Activity, CreateActivityRequest, CreateTripRequest, Trip, TripSummary } from '../types'
import { apiRequest } from './client'

export const tripKeys = {
  all: ['trips'] as const,
  detail: (tripId: string) => ['trips', tripId] as const,
}

export function fetchTrips(): Promise<TripSummary[]> {
  return apiRequest<TripSummary[]>('/trips')
}

export function fetchTrip(tripId: string): Promise<Trip> {
  return apiRequest<Trip>(`/trips/${encodeURIComponent(tripId)}`)
}

export function createTrip(body: CreateTripRequest): Promise<Trip> {
  // Only the four CreateTripRequest fields are ever sent.
  const payload: CreateTripRequest = {
    destination: body.destination,
    start_date: body.start_date,
    end_date: body.end_date,
    trip_type: body.trip_type,
  }
  return apiRequest<Trip>('/trips', { method: 'POST', body: payload })
}

export function deleteTrip(tripId: string): Promise<void> {
  return apiRequest<void>(`/trips/${encodeURIComponent(tripId)}`, { method: 'DELETE' })
}

export function addActivity(tripId: string, dayId: string, body: CreateActivityRequest): Promise<Activity> {
  return apiRequest<Activity>(
    `/trips/${encodeURIComponent(tripId)}/days/${encodeURIComponent(dayId)}/activities`,
    { method: 'POST', body },
  )
}

export function updateActivity(activityId: string, body: CreateActivityRequest): Promise<Activity> {
  return apiRequest<Activity>(`/activities/${encodeURIComponent(activityId)}`, { method: 'PATCH', body })
}

export function deleteActivity(activityId: string): Promise<void> {
  return apiRequest<void>(`/activities/${encodeURIComponent(activityId)}`, { method: 'DELETE' })
}

export function useTrips() {
  return useQuery({ queryKey: tripKeys.all, queryFn: fetchTrips })
}

export function useTrip(tripId: string) {
  return useQuery({ queryKey: tripKeys.detail(tripId), queryFn: () => fetchTrip(tripId) })
}

export function useCreateTrip() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createTrip,
    onSuccess: (trip) => {
      queryClient.setQueryData(tripKeys.detail(trip.id), trip)
      void queryClient.invalidateQueries({ queryKey: tripKeys.all, exact: true })
    },
  })
}

/**
 * Deleting is special (frontend-spec §5): evict the detail query rather than
 * refetching it (it would 404), and invalidate only the exact list key.
 */
export function useDeleteTrip(options: { onDeleted?: (tripId: string) => void } = {}) {
  const queryClient = useQueryClient()
  const { onDeleted } = options
  return useMutation({
    mutationFn: deleteTrip,
    onSuccess: (_data, tripId) => {
      // Navigate away first so the unmounting detail page never observes the
      // evicted query and refetches it.
      onDeleted?.(tripId)
      queryClient.removeQueries({ queryKey: tripKeys.detail(tripId) })
      void queryClient.invalidateQueries({ queryKey: tripKeys.all, exact: true })
    },
  })
}

export function useAddActivity(tripId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ dayId, text }: { dayId: string; text: string }) => addActivity(tripId, dayId, { text }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tripKeys.detail(tripId) }),
  })
}

export function useUpdateActivity(tripId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ activityId, text }: { activityId: string; text: string }) => updateActivity(activityId, { text }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tripKeys.detail(tripId) }),
  })
}

export function useDeleteActivity(tripId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (activityId: string) => deleteActivity(activityId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tripKeys.detail(tripId) }),
  })
}
