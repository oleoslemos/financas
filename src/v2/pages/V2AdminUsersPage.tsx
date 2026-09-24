import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  listAllLocalV2Users,
  deleteV2UserByUsername,
  clearAllV2Users,
  V2User,
} from '../services/v2AuthService'
import {
  Users,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  ShieldAlert,
  UserX,
} from 'lucide-react'

type LocalUser = V2User & { password_hash: string }

export function V2AdminUsersPage() {
  const navigate = useNavigate()
  const [users, setUsers] = useState<LocalUser[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [confirmClearAll, setConfirmClearAll] = useState(false)

  const loadUsers = () => {
    setUsers(listAllLocalV2Users())
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const handleDelete = async (username: string) => {
    setLoading(true)
    setMessage(null)
    try {
      await deleteV2UserByUsername(username)
      loadUsers()
      setMessage({ type: 'success', text: `Usuário "${username}" removido com sucesso.` })
    } catch {
      setMessage({ type: 'error', text: 'Erro ao remover usuário.' })
    } finally {
      setLoading(false)
    }
  }

  const handleClearAll = async () => {
    setLoading(true)
    setMessage(null)
    setConfirmClearAll(false)
    try {
      await clearAllV2Users()
      loadUsers()
      setMessage({ type: 'success', text: 'Todos os usuários foram removidos.' })
    } catch {
      setMessage({ type: 'error', text: 'Erro ao limpar usuários.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8 font-sans">
      {/* Header */}
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate('/v2/login')}
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao Login
          </button>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-rose-100 flex items-center justify-center">
            <ShieldAlert className="h-5 w-5 text-rose-600" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900">Administração de Usuários</h1>
            <p className="text-xs text-slate-500 font-medium">Usuários cadastrados no sistema local</p>
          </div>
        </div>

        {/* Feedback Message */}
        {message && (
          <div
            className={`mb-5 rounded-2xl p-3.5 flex items-center gap-2.5 text-xs font-semibold ${
              message.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border border-rose-200 text-rose-700'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            {message.text}
          </div>
        )}

        {/* Users List Card */}
        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-500" />
              <span className="text-sm font-bold text-slate-700">
                {users.length} usuário{users.length !== 1 ? 's' : ''} cadastrado{users.length !== 1 ? 's' : ''}
              </span>
            </div>
            {users.length > 0 && (
              <button
                onClick={() => setConfirmClearAll(true)}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-3 py-1.5 rounded-xl transition disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remover Todos
              </button>
            )}
          </div>

          {users.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-slate-400">
              <UserX className="h-10 w-10 text-slate-300" />
              <p className="text-sm font-semibold">Nenhum usuário cadastrado</p>
              <p className="text-xs">O banco de usuários local está vazio.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {users.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition group"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="h-9 w-9 rounded-xl bg-emerald-100 flex items-center justify-center font-black text-sm text-emerald-700">
                      {u.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{u.full_name}</p>
                      <p className="text-xs text-slate-500 font-medium">
                        @{u.username}
                        {u.email && <span className="ml-2 text-slate-400">· {u.email}</span>}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(u.username)}
                    disabled={loading}
                    className="flex items-center gap-1.5 text-xs font-bold text-rose-500 hover:text-white hover:bg-rose-500 px-3 py-1.5 rounded-xl transition disabled:opacity-50 opacity-0 group-hover:opacity-100"
                    title={`Remover ${u.username}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-5 font-medium">
          ⚠️ Esta página gerencia apenas o banco de dados local do navegador.
        </p>
      </div>

      {/* Confirm Clear All Modal */}
      {confirmClearAll && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-7 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-rose-100 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
              </div>
              <h2 className="text-base font-black text-slate-900">Confirmar remoção</h2>
            </div>
            <p className="text-sm text-slate-600 font-medium">
              Tem certeza que deseja remover <strong>todos os {users.length} usuário(s)</strong>? Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setConfirmClearAll(false)}
                className="flex-1 py-2.5 px-4 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleClearAll}
                className="flex-1 py-2.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold transition shadow-lg shadow-rose-200"
              >
                Sim, remover todos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
