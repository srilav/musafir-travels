import { Link, Outlet } from 'react-router'
import { useAuth } from '../auth/authState'
import { buttonSecondary } from '../lib/styles'

/** Minimal header for authenticated pages: title link home, username, logout. */
export function AppShell() {
  const { username, logout } = useAuth()
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link
            to="/trips"
            className="text-xl font-bold text-primary hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-primary"
          >
            Musafir Travels
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-text-muted">
              Logged in as <span className="font-medium text-text">{username}</span>
            </span>
            <button type="button" className={`${buttonSecondary} px-3 py-1.5`} onClick={logout}>
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
