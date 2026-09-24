import { supabase } from '../../lib/supabaseClient'

export type V2User = {
  id: string
  full_name: string
  username: string
  email: string
  created_at: string
}

const LOCAL_USERS_KEY = 'v2_local_users_db'
const LOCAL_SESSION_KEY = 'v2_active_session'

function getLocalUsers(): (V2User & { password_hash: string })[] {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLocalUsers(users: (V2User & { password_hash: string })[]): void {
  try {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users))
  } catch {
    /* ignore */
  }
}

export function getCurrentV2User(): V2User | null {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setV2Session(user: V2User | null): void {
  try {
    if (user) {
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(LOCAL_SESSION_KEY)
    }
  } catch {
    /* ignore */
  }
}

export async function registerV2User(data: {
  full_name: string
  username: string
  email: string
  password: string
}): Promise<{ user: V2User; error: string | null }> {
  const cleanUsername = data.username.trim().toLowerCase()
  const cleanEmail = data.email.trim().toLowerCase()
  const cleanName = data.full_name.trim()

  if (!cleanName) return { user: null as any, error: 'Por favor, informe seu nome completo.' }
  if (!cleanUsername || cleanUsername.length < 3) return { user: null as any, error: 'O usuário deve ter pelo menos 3 caracteres.' }
  if (!data.password || data.password.length < 4) return { user: null as any, error: 'A senha deve ter pelo menos 4 caracteres.' }

  // Check local database first
  const localUsers = getLocalUsers()
  if (localUsers.some((u) => u.username === cleanUsername)) {
    return { user: null as any, error: 'Este nome de usuário já está cadastrado.' }
  }

  // Attempt Supabase insert if table v2_users exists
  const newUserRecord = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    full_name: cleanName,
    username: cleanUsername,
    email: cleanEmail,
    password_hash: data.password, // Store password
    created_at: new Date().toISOString(),
  }

  if (supabase) {
    try {
      const { data: existingSupabaseUser } = await supabase
        .from('v2_users')
        .select('id')
        .eq('username', cleanUsername)
        .maybeSingle()

      if (existingSupabaseUser) {
        return { user: null as any, error: 'Este nome de usuário já está cadastrado no banco.' }
      }

      const { error: insErr } = await supabase.from('v2_users').insert({
        id: newUserRecord.id,
        full_name: cleanName,
        username: cleanUsername,
        email: cleanEmail,
        password_hash: data.password,
      })

      if (insErr) {
        console.warn('Tabela v2_users no Supabase indisponível ou RLS ativo, salvando localmente:', insErr.message)
      }
    } catch (e) {
      console.warn('Falha no Supabase, mantendo persistência local:', e)
    }
  }

  // Save in Local DB & Session
  localUsers.push(newUserRecord)
  saveLocalUsers(localUsers)

  const userSession: V2User = {
    id: newUserRecord.id,
    full_name: newUserRecord.full_name,
    username: newUserRecord.username,
    email: newUserRecord.email,
    created_at: newUserRecord.created_at,
  }

  setV2Session(userSession)
  return { user: userSession, error: null }
}

export async function loginV2User(data: {
  username: string
  password: string
}): Promise<{ user: V2User; error: string | null }> {
  const cleanUsername = data.username.trim().toLowerCase()
  if (!cleanUsername) return { user: null as any, error: 'Informe seu usuário.' }
  if (!data.password) return { user: null as any, error: 'Informe sua senha.' }

  // 1. Try Supabase
  if (supabase) {
    try {
      const { data: supaUser, error: supaErr } = await supabase
        .from('v2_users')
        .select('id, full_name, username, email, password_hash, created_at')
        .eq('username', cleanUsername)
        .maybeSingle()

      if (!supaErr && supaUser) {
        if (supaUser.password_hash === data.password) {
          const userSession: V2User = {
            id: supaUser.id,
            full_name: supaUser.full_name,
            username: supaUser.username,
            email: supaUser.email,
            created_at: supaUser.created_at || new Date().toISOString(),
          }
          setV2Session(userSession)
          return { user: userSession, error: null }
        } else {
          return { user: null as any, error: 'Senha incorreta.' }
        }
      }
    } catch (e) {
      console.warn('Erro ao consultar Supabase, verificando banco local:', e)
    }
  }

  // 2. Try Local Users DB
  const localUsers = getLocalUsers()
  const found = localUsers.find((u) => u.username === cleanUsername)

  if (!found) {
    return { user: null as any, error: 'Usuário não encontrado.' }
  }

  if (found.password_hash !== data.password) {
    return { user: null as any, error: 'Senha incorreta.' }
  }

  const userSession: V2User = {
    id: found.id,
    full_name: found.full_name,
    username: found.username,
    email: found.email,
    created_at: found.created_at,
  }

  setV2Session(userSession)
  return { user: userSession, error: null }
}

export function logoutV2User(): void {
  setV2Session(null)
}
