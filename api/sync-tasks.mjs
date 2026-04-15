import { runTasksSync } from '../scripts/tasks-sync-core.mjs'

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Method not allowed. Use POST.' })
  }

  const expectedToken = process.env.SYNC_WEBHOOK_TOKEN?.trim()
  if (expectedToken) {
    const provided = getToken(req)
    if (!provided || provided !== expectedToken) {
      return json(res, 401, { ok: false, error: 'Unauthorized' })
    }
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
    const result = await runTasksSync({
      loadDotEnv: false,
      logger: console,
      targetUserId: body.integrationUserId || body.userId,
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
