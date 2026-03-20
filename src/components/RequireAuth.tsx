import { useAuth } from '@clerk/clerk-react'
import { Navigate, Outlet } from 'react-router-dom'

export function RequireAuth() {
  const { isLoaded, isSignedIn } = useAuth()
  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        Carregando…
      </div>
    )
  }
  if (!isSignedIn) return <Navigate to="/sign-in" replace />
  return <Outlet />
}
