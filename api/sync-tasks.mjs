import { runTasksSync } from '../scripts/tasks-sync-core.mjs'
import { verifyToken } from '@clerk/backend'

function json(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function getToken(req) {
  const headerToken = req.headers['x-sync-token']
  if (typeof headerToken === 'string' && headerToken.trim()) return headerToken.trim()
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim()
  }
  return ''
}

async function getAuthenticatedUserId(req) {
  const auth = req.headers.authorization
  if (typeof auth !== 'string' || !auth.toLowerCase().startsWith('bearer ')) return ''

  const token = auth.slice(7).trim()
  if (!token) return ''

  const secretKey = process.env.CLERK_SECRET_KEY?.trim()
  if (!secretKey) return ''

  try {
    const payload = await verifyToken(token, { secretKey })
    return typeof payload?.sub === 'string' ? payload.sub : ''
  } catch (_error) {
    return ''
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Method not allowed. Use POST.' })
  }

  const authUserId = await getAuthenticatedUserId(req)
  let isWebhookAuthorized = false
  const expectedToken = process.env.SYNC_WEBHOOK_TOKEN?.trim()
  if (expectedToken) {
    const provided = getToken(req)
    isWebhookAuthorized = Boolean(provided && provided === expectedToken)
  }
  if (!authUserId && !isWebhookAuthorized) {
    return json(res, 401, { ok: false, error: 'Unauthorized' })
  }

  const required = ['SUPABASE_SERVICE_ROLE_KEY']
  const missing = required.filter((k) => !process.env[k] || !String(process.env[k]).trim())
  if (missing.length) {
    return json(res, 500, {
      ok: false,
      error: `Variáveis obrigatórias ausentes na Vercel: ${missing.join(', ')}`,
      missing,
    })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const targetUserId = authUserId || body.integrationUserId || body.userId
    const result = await runTasksSync({
      loadDotEnv: false,
      logger: console,
      targetUserId,
      taskOwnerUserId: body.taskOwnerUserId,
    })
    return json(res, 200, result)
  } catch (err) {
    return json(res, 500, {
      ok: false,
      error: String(err?.message || err),
    })
  }
}
