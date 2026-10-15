import { supabase } from '../../lib/supabaseClient'

export type V2User = {
  id: string
  full_name: string
  username: string
  email: string | null
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

export async function registerV2User(
  data: {
    full_name: string
    username: string
    email?: string
    password: string
  },
  options: { isInvite?: boolean } = {}
): Promise<{ user: V2User; error: string | null }> {
  const cleanUsername = data.username.trim().toLowerCase()
  const cleanEmail = (data.email || '').trim().toLowerCase() || null
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
      const { data: existingSupabaseUser, error: selErr } = await supabase
        .from('v2_users')
        .select('id')
        .eq('username', cleanUsername)
        .maybeSingle()

      if (selErr) {
        console.warn('Erro ao verificar usuário no banco:', selErr)
      } else if (existingSupabaseUser) {
        return { user: null as any, error: 'Este nome de usuário já está cadastrado no banco de dados.' }
      }

      const { error: insErr } = await supabase.from('v2_users').insert({
        id: newUserRecord.id,
        full_name: cleanName,
        username: cleanUsername,
        email: cleanEmail,
        password_hash: data.password,
      })

      if (insErr) {
        console.error('Erro ao salvar usuário no Supabase:', insErr)
        return { user: null as any, error: `Falha ao salvar acesso no banco: ${insErr.message}` }
      }
    } catch (e: any) {
      console.error('Erro de conexão com o Supabase:', e)
      return { user: null as any, error: `Erro de conexão com o banco de dados: ${e?.message || e}` }
    }
  }

  // Atualizar cache local
  localUsers.push(newUserRecord)
  saveLocalUsers(localUsers)

  const userSession: V2User = {
    id: newUserRecord.id,
    full_name: newUserRecord.full_name,
    username: newUserRecord.username,
    email: newUserRecord.email || '',
    created_at: newUserRecord.created_at,
  }

  // Só altera a sessão se NÃO for um convite criado por um admin logado
  if (!options.isInvite) {
    setV2Session(userSession)
  }

  return { user: userSession, error: null }
}

export async function loginV2User(data: {
  username: string
  password: string
}): Promise<{ user: V2User; error: string | null }> {
  // Normaliza: pode ser username OU e-mail
  const cleanInput = data.username.trim().toLowerCase()
  const isEmail = cleanInput.includes('@')

  if (!cleanInput) return { user: null as any, error: 'Informe seu usuário ou e-mail.' }
  if (!data.password) return { user: null as any, error: 'Informe sua senha.' }

  // 1. Try Supabase — busca por username OU email
  if (supabase) {
    try {
      let query = supabase
        .from('v2_users')
        .select('id, full_name, username, email, password_hash, created_at')

      if (isEmail) {
        query = query.eq('email', cleanInput)
      } else {
        query = query.eq('username', cleanInput)
      }

      const { data: supaUser, error: supaErr } = await query.maybeSingle()

      if (supaErr) {
        return { user: null as any, error: 'Erro ao consultar banco de dados.' }
      }

      if (supaUser) {
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
      } else {
        const label = isEmail ? 'E-mail não encontrado.' : 'Usuário não encontrado.'
        return { user: null as any, error: label }
      }
    } catch (e) {
      console.error('Erro ao consultar Supabase:', e)
      return { user: null as any, error: 'Erro de conexão com o banco de dados.' }
    }
  } else {
    return { user: null as any, error: 'Cliente do banco de dados não configurado.' }
  }
}

export function logoutV2User(): void {
  setV2Session(null)
}

export async function fetchV2Users(): Promise<V2User[]> {
  const localUsers = getLocalUsers()

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('v2_users')
        .select('id, full_name, username, email, created_at')
        .order('created_at', { ascending: true })

      if (!error && data && data.length > 0) {
        // Mapear e sincronizar no cache local
        const supaUsers: V2User[] = data.map((u) => ({
          id: u.id,
          full_name: u.full_name,
          username: u.username,
          email: u.email || '',
          created_at: u.created_at || new Date().toISOString(),
        }))

        // Sincronizar senhas locais conhecidas se houver
        const merged = supaUsers.map((su) => {
          const loc = localUsers.find((lu) => lu.username === su.username)
          return {
            ...su,
            password_hash: loc?.password_hash || '',
          }
        })
        saveLocalUsers(merged)

        return supaUsers
      }
    } catch (e) {
      console.warn('Falha ao carregar usuários do Supabase, usando cache local:', e)
    }
  }

  return localUsers.map((u) => ({
    id: u.id,
    full_name: u.full_name,
    username: u.username,
    email: u.email || '',
    created_at: u.created_at,
  }))
}

export function listAllLocalV2Users(): (V2User & { password_hash: string })[] {
  return getLocalUsers()
}

export async function deleteV2UserByUsername(username: string): Promise<{ error: string | null }> {
  const cleanUsername = username.trim().toLowerCase()

  // Remove from local DB
  const localUsers = getLocalUsers()
  const filtered = localUsers.filter((u) => u.username !== cleanUsername)
  saveLocalUsers(filtered)

  // Remove from current session if matches
  const session = getCurrentV2User()
  if (session?.username === cleanUsername) {
    setV2Session(null)
  }

  // Remove from Supabase
  if (supabase) {
    try {
      await supabase.from('v2_users').delete().eq('username', cleanUsername)
    } catch (e) {
      console.warn('Falha ao remover do Supabase:', e)
    }
  }

  return { error: null }
}

export async function clearAllV2Users(): Promise<void> {
  saveLocalUsers([])
  setV2Session(null)
  if (supabase) {
    try {
      await supabase.from('v2_users').delete().neq('id', 'x')
    } catch (e) {
      console.warn('Falha ao limpar usuários do Supabase:', e)
    }
  }
}
