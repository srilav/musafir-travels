import { Link, Navigate, useNavigate } from 'react-router'
import { useSignup } from '../api/auth'
import { getErrorMessage } from '../api/client'
import { useAuth } from '../auth/authState'
import { AuthForm } from '../components/AuthForm'
import { linkText } from '../lib/styles'

export function SignupPage() {
  const { isAuthenticated, signIn } = useAuth()
  const navigate = useNavigate()
  const signup = useSignup()

  if (isAuthenticated) return <Navigate to="/trips" replace />

  return (
    <AuthForm
      title="Create your account"
      submitLabel="Sign up"
      pending={signup.isPending}
      error={signup.error ? getErrorMessage(signup.error, 'Sign up failed. Please try again.') : null}
      passwordAutoComplete="new-password"
      onSubmit={(credentials) =>
        signup.mutate(credentials, {
          onSuccess: (response) => {
            signIn(response)
            navigate('/trips', { replace: true })
          },
        })
      }
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className={linkText}>
            Log in
          </Link>
        </>
      }
    />
  )
}
