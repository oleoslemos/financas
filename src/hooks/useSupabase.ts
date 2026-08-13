import { useAuth } from './useClerkCompat'
import { supabase } from '../lib/supabaseClient'
import { type SupabaseClient } from '@supabase/supabase-js'

export function useSupabase(): SupabaseClient | null {
  const { isLoaded, isSignedIn } = useAuth()
  
  if (!isLoaded || !isSignedIn) return null
  return supabase
}
