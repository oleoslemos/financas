import { useAuth } from '@clerk/clerk-react'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { useMemo, useRef } from 'react'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export function useSupabase(): SupabaseClient | null {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const getTokenRef = useRef(getToken)
  getTokenRef.current = getToken

  return useMemo(() => {
    if (!isLoaded || !isSignedIn || !url || !anon) return null
    return createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, init) => {
          const headers = new Headers(init?.headers)
          const token = await getTokenRef.current({ template: 'supabase' })
          if (token) headers.set('Authorization', `Bearer ${token}`)
          return fetch(input, { ...init, headers })
        },
      },
    })
  }, [isLoaded, isSignedIn, url, anon])
}
