import { useUser } from '../hooks/useClerkCompat'
import { SignOutButton } from './ui/AuthComponents'
import { Outlet } from 'react-router-dom'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { canAccessProjects } from '../lib/projectsAccess'
import { Button } from './ui/Button'

export function RequireProjectsAccess() {
  const { user, isLoaded } = useUser()

  if (!isLoaded) {
    return <p className="text-sm text-slate-500">Carregando...</p>
  }

  const hasAccess = clerkEmailCandidates(user).some((email) => canAccessProjects(email))
  if (!hasAccess) {
    return (
      <div className="flex min-h-[65vh] flex-col items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-lg font-medium text-slate-900">Acesso negado ao módulo Projetos</p>
        <p className="max-w-lg text-sm text-slate-600">
          Seu usuário está autenticado no sistema, mas não está autorizado para esta área. Solicite liberação ou
          acesse com uma conta permitida.
        </p>
        <SignOutButton>
          <Button type="button" variant="secondary">
            Sair e tentar outra conta
          </Button>
        </SignOutButton>
      </div>
    )
  }

  return <Outlet />
}
