import { useUser } from '../hooks/useClerkCompat'
import { SignOutButton } from './ui/AuthComponents'
import { Outlet } from 'react-router-dom'
import { Button } from './ui/Button'
import { getAllowedEmailSetForHostname, isEmailAllowed } from '../lib/allowedEmails'

/** Bloqueia o app se o e-mail do usuário não estiver na lista permitida para o host (quando definida). */
export function AllowedEmailGuard() {
  const { user, isLoaded } = useUser()
  const host = typeof window !== 'undefined' ? window.location.hostname : ''
  const allowed = getAllowedEmailSetForHostname(host)

  if (allowed === null) {
    return <Outlet />
  }

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-600">
        Carregando…
      </div>
    )
  }

  const primary = user?.primaryEmailAddress?.emailAddress
  const verifiedEmails =
    user?.emailAddresses
      ?.filter((a) => a.verification?.status === 'verified')
      .map((a) => a.emailAddress) ?? []

  const ok =
    isEmailAllowed(primary, allowed) ||
    verifiedEmails.some((e) => isEmailAllowed(e, allowed))

  if (!ok) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white p-4 text-center sm:p-6">
        <p className="text-lg text-slate-900">Acesso restrito</p>
        <p className="max-w-md text-sm text-slate-600">
          Este aplicativo só pode ser usado por contas autorizadas. O e-mail da sua sessão não está na lista
          permitida.
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
