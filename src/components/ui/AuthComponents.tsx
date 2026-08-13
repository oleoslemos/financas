import { useState, useRef, useEffect, type ReactNode } from 'react'
import { LogOut } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useUser } from '../../hooks/useClerkCompat'

export function SignOutButton({ children }: { children: ReactNode }) {
  const { signOut } = useAuth()
  return (
    <span onClick={() => void signOut()} className="cursor-pointer">
      {children}
    </span>
  )
}

export function UserButton({ afterSignOutUrl = '/sign-in' }: { afterSignOutUrl?: string }) {
  const { signOut } = useAuth()
  const { user } = useUser()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fecha o dropdown se clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  if (!user) return null

  // Iniciais para o avatar
  const initials = (() => {
    const first = user.firstName?.[0] || ''
    const last = user.lastName?.[0] || ''
    if (first || last) return `${first}${last}`.toUpperCase()
    return user.primaryEmailAddress?.emailAddress?.slice(0, 2).toUpperCase() || 'US'
  })()

  const handleSignOut = async () => {
    await signOut()
    window.location.href = afterSignOutUrl
  }

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Botão de Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white shadow-sm ring-2 ring-indigo-100 hover:bg-indigo-700 focus:outline-none transition-all duration-200"
      >
        {initials}
      </button>

      {/* Menu Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 origin-top-right rounded-xl border border-slate-200 bg-white p-2 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-3 py-2 border-b border-slate-100 mb-1">
            <p className="text-sm font-semibold text-slate-800 truncate">
              {user.fullName}
            </p>
            <p className="text-xs text-slate-500 truncate mt-0.5">
              {user.primaryEmailAddress?.emailAddress}
            </p>
          </div>

          <button
            onClick={() => void handleSignOut()}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 transition-colors duration-150"
          >
            <LogOut size={16} />
            <span>Sair</span>
          </button>
        </div>
      )}
    </div>
  )
}
