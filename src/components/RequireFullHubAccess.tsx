import { useUser } from '@clerk/clerk-react'
import { Navigate, Outlet } from 'react-router-dom'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { isBemAvivOnlyUser } from '../lib/userAccess'

/**
 * Bloqueia rotas de Financeiro (LSH) e Projetos para quem tem apenas Bem Aviv.
 */
export function RequireFullHubAccess() {
  const { user } = useUser()
  const emails = clerkEmailCandidates(user)

  if (isBemAvivOnlyUser(emails)) {
    return <Navigate to="/bem-aviv" replace />
  }

  return <Outlet />
}
