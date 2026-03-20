import { SignOutButton, useUser } from '@clerk/clerk-react'
import { Outlet } from 'react-router-dom'
import { getAllowedEmailSet, isEmailAllowed } from '../lib/allowedEmails'

/** Bloqueia o app se o e-mail do usuário não estiver em VITE_ALLOWED_EMAILS (quando definido). */
export function AllowedEmailGuard() {
  const { user, isLoaded } = useUser()
  const allowed = getAllowedEmailSet()

  if (allowed === null) {
    return <Outlet />
  }

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 p-6 text-center">
        <p className="text-lg text-slate-200">Acesso restrito</p>
        <p className="max-w-md text-sm text-slate-400">
          Este aplicativo só pode ser usado por contas autorizadas. O e-mail da sua sessão não está na lista
          permitida.
        </p>
        <SignOutButton>
          <button type="button" className="btn btn-secondary">
            Sair e tentar outra conta
          </button>
        </SignOutButton>
      </div>
    )
  }

  return <Outlet />
}
