import { useUser } from '@clerk/clerk-react'
import { Building2, FolderKanban, Wallet } from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { canAccessProjects } from '../lib/projectsAccess'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import {
  clearStoredHubChoice,
  isBemAvivOnlyUser,
  isMultiSystemUser,
  setStoredHubChoice,
  type StoredHubChoice,
} from '../lib/userAccess'

export function SystemChooserPage() {
  const { user } = useUser()
  const navigate = useNavigate()
  const emails = clerkEmailCandidates(user)
  const projectsEnabled = emails.some((e) => canAccessProjects(e))

  useEffect(() => {
    if (isBemAvivOnlyUser(emails)) {
      navigate('/bem-aviv', { replace: true })
      return
    }
    if (!isMultiSystemUser(emails)) {
      navigate('/lsh/resumo', { replace: true })
    }
  }, [emails, navigate])

  function choose(choice: StoredHubChoice) {
    setStoredHubChoice(choice)
    if (choice === 'lsh') navigate('/lsh/resumo', { replace: true })
    else if (choice === 'bem-aviv') navigate('/bem-aviv', { replace: true })
    else navigate('/projetos', { replace: true })
  }

  if (!isMultiSystemUser(emails) || isBemAvivOnlyUser(emails)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        Redirecionando…
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-2 py-6">
      <header className="text-center">
        <h1 className="font-hub text-2xl font-bold tracking-tight text-slate-900">Escolher sistema</h1>
        <p className="mt-2 text-sm text-slate-600">
          Selecione qual módulo deseja usar. A escolha fica salva neste navegador até você alterar.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <button
          type="button"
          onClick={() => choose('lsh')}
          className="flex flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-[#185FA5]/40 hover:shadow-md"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100 text-[#185FA5]">
            <Wallet size={22} strokeWidth={2} aria-hidden />
          </span>
          <span>
            <span className="block font-hub text-lg font-semibold text-slate-900">Financeiro (LSH)</span>
            <span className="mt-1 block text-sm text-slate-600">Resumo, fluxo, cartões e cadastros.</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => choose('bem-aviv')}
          className="flex flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-[#185FA5]/40 hover:shadow-md"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
            <Building2 size={22} strokeWidth={2} aria-hidden />
          </span>
          <span>
            <span className="block font-hub text-lg font-semibold text-slate-900">{"EKO'7"}</span>
            <span className="mt-1 block text-sm text-slate-600">Clientes, follow-up, pedidos e catálogo.</span>
          </span>
        </button>

        {projectsEnabled ? (
          <button
            type="button"
            onClick={() => choose('projetos')}
            className="flex flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-[#185FA5]/40 hover:shadow-md sm:col-span-2 lg:col-span-1"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-800">
              <FolderKanban size={22} strokeWidth={2} aria-hidden />
            </span>
            <span>
              <span className="block font-hub text-lg font-semibold text-slate-900">Projetos</span>
              <span className="mt-1 block text-sm text-slate-600">Kanban, backlog e execução.</span>
            </span>
          </button>
        ) : null}
      </div>

      <p className="text-center">
        <button
          type="button"
          className="text-xs font-medium text-[#185FA5] underline-offset-2 hover:underline"
          onClick={() => {
            clearStoredHubChoice()
          }}
        >
          Limpar preferência salva (entrada pedirá nova escolha)
        </button>
      </p>
    </div>
  )
}
