import { useMutation } from '@tanstack/react-query'
import type { AuthResponse, LoginRequest, SignupRequest } from '../types'
import { apiRequest } from './client'

export function login(body: LoginRequest): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/login', { method: 'POST', body, auth: false })
}

export function signup(body: SignupRequest): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/signup', { method: 'POST', body, auth: false })
}

export function useLogin() {
  return useMutation({ mutationFn: login })
}

export function useSignup() {
  return useMutation({ mutationFn: signup })
}
