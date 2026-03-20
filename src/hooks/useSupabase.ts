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
          let token: string | null = null
          try {
            // Integração nativa Clerk ↔ Supabase (recomendada): token de sessão, sem JWT template
            token = await getTokenRef.current()
            if (!token) {
              try {
                token = await getTokenRef.current({ template: 'supabase' })
              } catch {
                /* template opcional / legado */
              }
            }
          } catch {
            /* evita quebrar o fetch inteiro */
          }
          if (token) headers.set('Authorization', `Bearer ${token}`)
          return fetch(input, { ...init, headers })
        },
      },
    })
  }, [isLoaded, isSignedIn, url, anon])
}
