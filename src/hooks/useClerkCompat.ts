import { useAuth as useSupabaseAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'

export function useAuth() {
  const { session, loading } = useSupabaseAuth()

  const getToken = async (_options?: { template?: string }) => {
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    return currentSession?.access_token ?? null
  }

  return {
    isLoaded: !loading,
    isSignedIn: !!session,
    getToken,
  }
}

export function useUser() {
  const { user, loading } = useSupabaseAuth()

  const getFirstNameAndLastName = () => {
    if (!user) return { firstName: '', lastName: '', fullName: '' }
    
    const fullName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário'
    const parts = fullName.trim().split(/\s+/)
    const firstName = parts[0] || 'Usuário'
    const lastName = parts.slice(1).join(' ') || ''
    
    return { firstName, lastName, fullName }
  }

  const { firstName, lastName, fullName } = getFirstNameAndLastName()

  const mappedUser = user ? {
    id: user.id,
    fullName,
    firstName,
    lastName,
    primaryEmailAddress: {
      emailAddress: user.email || '',
    },
    emailAddresses: [
      {
        emailAddress: user.email || '',
        verification: { status: 'verified' },
      },
    ],
  } : null

  return {
    isLoaded: !loading,
    isSignedIn: !!user,
    user: mappedUser,
  }
}
