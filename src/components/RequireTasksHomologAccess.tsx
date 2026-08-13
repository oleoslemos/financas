import { useUser } from '../hooks/useClerkCompat'
import { Navigate, Outlet } from 'react-router-dom'
import { canAccessTasksHomolog } from '../lib/tasksHomologAccess'

export function RequireTasksHomologAccess() {
  const { user, isLoaded } = useUser()

  if (!isLoaded) {
    return <p className="text-sm text-slate-500">Carregando...</p>
  }

  const primary = user?.primaryEmailAddress?.emailAddress
  if (!canAccessTasksHomolog(primary)) {
    return <Navigate to="/lsh/resumo" replace />
  }

  return <Outlet />
}
