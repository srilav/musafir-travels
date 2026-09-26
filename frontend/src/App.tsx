import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { createQueryClient } from './api/queryClient'
import { AuthProvider } from './auth/AuthContext'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AppShell } from './components/AppShell'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { NewTripPage } from './pages/NewTripPage'
import { SignupPage } from './pages/SignupPage'
import { TripItineraryPage } from './pages/TripItineraryPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/trips" element={<HomePage />} />
          <Route path="/trips/new" element={<NewTripPage />} />
          <Route path="/trips/:tripId" element={<TripItineraryPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/trips" replace />} />
    </Routes>
  )
}

export default function App() {
  const [queryClient] = useState(createQueryClient)
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
