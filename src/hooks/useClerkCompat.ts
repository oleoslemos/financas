import { useMemo, useCallback } from 'react'
import { useAuth as useSupabaseAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'

export function useAuth() {
  const { session, loading } = useSupabaseAuth()

  const getToken = useCallback(async (_options?: { template?: string }) => {
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    return currentSession?.access_token ?? null
  }, [])

  return useMemo(() => ({
    isLoaded: !loading,
    isSignedIn: !!session,
    getToken,
  }), [loading, session, getToken])
}

export function useUser() {
  const { user, loading } = useSupabaseAuth()

  const mappedUser = useMemo(() => {
    if (!user) return null

    const fullName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário'
    const parts = fullName.trim().split(/\s+/)
    const firstName = parts[0] || 'Usuário'
    const lastName = parts.slice(1).join(' ') || ''

    return {
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
    }
  }, [user])

  return useMemo(() => ({
    isLoaded: !loading,
    isSignedIn: !!user,
    user: mappedUser,
  }), [loading, user, mappedUser])
}
