import { createClient } from '@supabase/supabase-js'

function json(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function decodeState(value) {
  if (!value) return { callbackUrl: '/agenda', integrationUserId: '' }
  try {
    const raw = Buffer.from(String(value), 'base64url').toString('utf8')
    const parsed = JSON.parse(raw)
    return {
      callbackUrl: typeof parsed?.callbackUrl === 'string' ? parsed.callbackUrl : '/agenda',
      integrationUserId: typeof parsed?.integrationUserId === 'string' ? parsed.integrationUserId : '',
    }
  } catch {
    return { callbackUrl: '/agenda', integrationUserId: '' }
  }
}

async function exchangeCodeForRefreshToken({ code, redirectUri }) {
  const clientId = (process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '').trim()
  const clientSecret = (process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '').trim()
  if (!clientId || !clientSecret) {
    throw new Error('Credenciais OAuth Google ausentes')
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  })

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(`Erro OAuth: ${JSON.stringify(payload)}`)
  }
  return payload
}

async function saveCredentials({ integrationUserId, refreshToken }) {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase service role ausente')
  if (!integrationUserId) throw new Error('integrationUserId ausente')
  if (!refreshToken) throw new Error('Google nao retornou refresh_token')

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { error } = await supabase.from('google_user_sync_credentials').upsert(
    {
      user_id: integrationUserId,
      refresh_token: refreshToken,
      is_active: true,
    },
    { onConflict: 'user_id' },
  )
  if (error) throw error
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Method not allowed' })

  const code = typeof req.query?.code === 'string' ? req.query.code : ''
  const state = decodeState(req.query?.state)
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const redirectUri = `${proto}://${host}/api/google-callback`

  try {
    if (!code) throw new Error('Parametro code ausente')

    const integrationUserId = state.integrationUserId || process.env.SYNC_OWNER_USER_ID || ''
    const tokenPayload = await exchangeCodeForRefreshToken({ code, redirectUri })
    await saveCredentials({
      integrationUserId,
      refreshToken: tokenPayload.refresh_token,
    })

    const location = `${state.callbackUrl || '/agenda'}?google_connected=1`
    res.statusCode = 302
    res.setHeader('Location', location)
    res.end()
  } catch (error) {
    const message = encodeURIComponent(String(error?.message || error))
    const location = `${state.callbackUrl || '/agenda'}?google_connected=0&reason=${message}`
    res.statusCode = 302
    res.setHeader('Location', location)
    res.end()
  }
}
