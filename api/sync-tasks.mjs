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

  try {
    const result = await runTasksSync({ loadDotEnv: false, logger: console })
    return json(res, 200, result)
  } catch (err) {
    return json(res, 500, {
      ok: false,
      error: String(err?.message || err),
    })
  }
}
