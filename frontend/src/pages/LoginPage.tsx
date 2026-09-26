import { Link, Navigate, useNavigate } from 'react-router'
import { useLogin } from '../api/auth'
import { ApiError, getErrorMessage } from '../api/client'
import { useAuth } from '../auth/authState'
import { AuthForm } from '../components/AuthForm'
import { linkText } from '../lib/styles'

export function LoginPage() {
  const { isAuthenticated, signIn } = useAuth()
  const navigate = useNavigate()
  const login = useLogin()

  if (isAuthenticated) return <Navigate to="/trips" replace />

  const error = login.error
    ? login.error instanceof ApiError && login.error.status === 401
      ? 'Invalid username or password.'
      : getErrorMessage(login.error, 'Login failed. Please try again.')
    : null

  return (
    <AuthForm
      title="Log in"
      submitLabel="Log in"
      pending={login.isPending}
      error={error}
      passwordAutoComplete="current-password"
      onSubmit={(credentials) =>
        login.mutate(credentials, {
          onSuccess: (response) => {
            signIn(response)
            navigate('/trips', { replace: true })
          },
        })
      }
      footer={
        <>
          New here?{' '}
          <Link to="/signup" className={linkText}>
            Create an account
          </Link>
        </>
      }
    />
  )
}
