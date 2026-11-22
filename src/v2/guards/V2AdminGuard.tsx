import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { getCurrentV2User } from '../services/v2AuthService'

/**
 * Lista de usernames com acesso à área administrativa (/adm).
 * Para adicionar mais administradores, basta inserir o username neste array.
 */
export const ADM_ALLOWED_USERNAMES: string[] = [
  'leoslemos',
  'suelenjalves',
]

export function isAdminUser(username: string | null | undefined): boolean {
  if (!username) return false
  return ADM_ALLOWED_USERNAMES.includes(username.trim().toLowerCase())
}

interface V2AdminGuardProps {
  children: React.ReactNode
}

export function V2AdminGuard({ children }: V2AdminGuardProps) {
  const [checked, setChecked] = useState(false)
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    const user = getCurrentV2User()
    if (user && isAdminUser(user.username)) {
      setAllowed(true)
    } else {
      setAllowed(false)
    }
    setChecked(true)
  }, [])

  if (!checked) return null

  if (!allowed) {
    return <Navigate to="/v2/login" replace />
  }

  return <>{children}</>
}
