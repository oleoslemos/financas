import { useUser } from '@clerk/clerk-react'
import { Navigate, Outlet } from 'react-router-dom'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { canAccessProjects } from '../lib/projectsAccess'

export function RequireProjectsAccess() {
  const { user, isLoaded } = useUser()

  if (!isLoaded) {
    return <p className="text-sm text-slate-500">Carregando...</p>
  }

  const hasAccess = clerkEmailCandidates(user).some((email) => canAccessProjects(email))
  if (!hasAccess) {
    return <Navigate to="/lsh/inicio" replace />
  }

  return <Outlet />
}
