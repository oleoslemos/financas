import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { getCurrentV2User, logoutV2User, V2User } from '../../services/v2AuthService'
import { ShieldAlert, LogOut } from 'lucide-react'

export function V2OrcamentoGuard() {
  const location = useLocation()
  const [currentUser, setCurrentUser] = useState<V2User | null>(() => getCurrentV2User())

  useEffect(() => {
    setCurrentUser(getCurrentV2User())
  }, [location.pathname])

  if (!currentUser) {
    const redirectUrl = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/v2/orcamento/login?redirect=${redirectUrl}`} replace />
  }

  const role = (currentUser.role || 'vendedor').toLowerCase()
  const allowedRoles = ['administrador', 'vendedor']

  if (!allowedRoles.includes(role)) {
    return (
      <div className="min-h-screen bg-[#F4F8F3] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-4 border border-slate-200 shadow-lg">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-slate-900">Sem permissão de acesso</h2>
          <p className="text-sm text-slate-600 font-medium">
            O módulo móvel de orçamento é exclusivo para os perfis <strong>Administrador</strong> e <strong>Vendedor</strong>.
            Seu usuário atual está configurado como <em>{currentUser.role || 'Sem perfil'}</em>.
          </p>
          <button
            type="button"
            onClick={() => {
              logoutV2User()
              window.location.href = '/v2/orcamento/login'
            }}
            className="w-full py-3.5 px-4 rounded-2xl bg-[#0D6BAF] text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#0b5a93] transition shadow-md"
          >
            <LogOut className="w-4 h-4" />
            Sair e trocar de conta
          </button>
        </div>
      </div>
    )
  }

  return <Outlet />
}
