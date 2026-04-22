function buildBaseUrl(req) {
  const envUrl = process.env.NEXTAUTH_URL?.trim()
  if (envUrl) return envUrl.replace(/\/+$/, '')

  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = req.headers['x-forwarded-proto'] || 'https'
  if (!host) return ''
  return `${proto}://${host}`.replace(/\/+$/, '')
}

function json(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Method not allowed' })

  const baseUrl = buildBaseUrl(req)
  if (!baseUrl) return json(res, 500, { ok: false, error: 'Nao foi possivel resolver URL base' })

  const clientId = (process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '').trim()
  if (!clientId) return json(res, 500, { ok: false, error: 'GOOGLE_CLIENT_ID ausente' })

  const callbackUrl = typeof req.query?.callbackUrl === 'string' ? req.query.callbackUrl : '/agenda'
  const integrationUserId =
    (typeof req.query?.integrationUserId === 'string' && req.query.integrationUserId.trim()) ||
    process.env.SYNC_OWNER_USER_ID ||
    ''

  const statePayload = {
    callbackUrl,
    integrationUserId,
  }
  const state = Buffer.from(JSON.stringify(statePayload), 'utf8').toString('base64url')

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/google-callback`,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: 'openid email profile https://www.googleapis.com/auth/calendar.events',
    state,
  })

  res.statusCode = 302
  res.setHeader('Location', `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
  res.end()
}
