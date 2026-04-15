import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

function loadEnvFromFile(filePath) {
  if (!existsSync(filePath)) return
  const raw = readFileSync(filePath, 'utf-8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    if (!key || process.env[key]) continue
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
    process.env[key] = value
  }
}

function must(value, name) {
  if (!value) throw new Error(`Variavel obrigatoria ausente: ${name}`)
  return value
}

function mapLocalStatusToGoogle(status) {
  return status === 'DONE' ? 'completed' : 'needsAction'
}

function mapGoogleStatusToLocal(status) {
  return status === 'completed' ? 'DONE' : 'TODO'
}

function mapLocalStatusToLark(status) {
  if (status === 'DONE') return 'done'
  if (status === 'IN_PROGRESS') return 'doing'
  return 'todo'
}

function mapLarkStatusToLocal(status) {
  const safe = String(status || '').toLowerCase()
  if (safe === 'done' || safe === 'completed') return 'DONE'
  if (safe === 'doing' || safe === 'in_progress') return 'IN_PROGRESS'
  return 'TODO'
}

function dueDateToRfc3339(dateValue) {
  if (!dateValue) return null
  return `${dateValue}T00:00:00.000Z`
}

/** Resumo curto para o Google Tasks (espelho); descrição completa fica no sistema. */
function googleMirrorNotes(details) {
  const s = String(details || '').trim()
  if (!s) return ''
  const max = 380
  return s.length > max ? `${s.slice(0, max)}…` : s
}

function googleMirrorPayload(row) {
  return {
    title: row.title,
    notes: googleMirrorNotes(row.details),
    status: mapLocalStatusToGoogle(row.status),
    due: dueDateToRfc3339(row.due_date),
  }
}

function parseGoogleEventDate(value) {
  if (!value) return null
  if (typeof value.dateTime === 'string' && value.dateTime) return value.dateTime
  if (typeof value.date === 'string' && value.date) return `${value.date}T00:00:00.000Z`
  return null
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`)
  }
  return data
}

async function getGoogleAccessToken(env) {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET || !env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    return null
  }
  const body = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  })
  const json = await fetchJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  return json?.access_token || null
}

async function googleApi(path, accessToken, options = {}) {
  const url = `https://tasks.googleapis.com/tasks/v1${path}`
  return fetchJson(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
}

async function googleCalendarApi(path, accessToken, options = {}) {
  const url = `https://www.googleapis.com/calendar/v3${path}`
  return fetchJson(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
}

async function getLarkTenantAccessToken(env) {
  if (!env.LARK_APP_ID || !env.LARK_APP_SECRET) return null
  const json = await fetchJson('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: env.LARK_APP_ID,
      app_secret: env.LARK_APP_SECRET,
    }),
  })
  const token = json?.tenant_access_token
  if (!token) return null
  return token
}

async function larkApi(path, token, options = {}) {
  const url = `https://open.feishu.cn/open-apis${path}`
  return fetchJson(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
}

async function syncGoogle(supabase, localRows, env) {
  if (!env.GOOGLE_TASKLIST_ID) {
    return { created: 0, updated: 0, imported: 0, skipped: true, reason: 'GOOGLE_TASKLIST_ID ausente' }
  }
  const token = await getGoogleAccessToken(env)
  if (!token) {
    return {
      created: 0,
      updated: 0,
      imported: 0,
      skipped: true,
      reason: 'Credenciais Google OAuth ausentes (GOOGLE_OAUTH_*)',
    }
  }

  const autoImportRaw = String(env.GOOGLE_TASKS_AUTO_IMPORT ?? '').trim().toLowerCase()
  const autoImport =
    autoImportRaw === ''
      ? true
      : autoImportRaw === 'true' || autoImportRaw === '1' || autoImportRaw === 'yes' || autoImportRaw === 'y'

  const remoteResp = await googleApi(
    `/lists/${encodeURIComponent(env.GOOGLE_TASKLIST_ID)}/tasks?showCompleted=true&showHidden=true&maxResults=100`,
    token,
  )
  const remoteItems = Array.isArray(remoteResp?.items) ? remoteResp.items : []
  const remoteById = new Map(remoteItems.map((t) => [t.id, t]))

  let updated = 0
  let imported = 0
  let mirrorCreated = 0
  let mirrorUpdated = 0

  // Legado: linhas importadas como GOOGLE_TASKS (fonte era o Google).
  for (const row of localRows.filter((r) => r.source === 'GOOGLE_TASKS')) {
    if (!row.external_id) continue
    const remote = remoteById.get(row.external_id)
    if (!remote) continue
    const shouldStatus = mapLocalStatusToGoogle(row.status)
    const shouldTitle = row.title
    if (remote.status !== shouldStatus || (remote.title || '') !== shouldTitle) {
      await googleApi(`/lists/${encodeURIComponent(env.GOOGLE_TASKLIST_ID)}/tasks/${encodeURIComponent(row.external_id)}`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          title: shouldTitle,
          notes: row.details || '',
          status: shouldStatus,
          due: dueDateToRfc3339(row.due_date),
        }),
      })
      updated += 1
    }
  }

  // Novo: tarefas LOCAIS (compartilhadas no sistema) com espelho opcional no Google — só campos relevantes.
  for (const row of localRows.filter((r) => r.source === 'LOCAL' && r.google_sync_enabled)) {
    const body = googleMirrorPayload(row)
    if (!row.google_external_id) {
      const inserted = await googleApi(`/lists/${encodeURIComponent(env.GOOGLE_TASKLIST_ID)}/tasks`, token, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      const extId = inserted?.id
      if (!extId) continue
      const { error } = await supabase.from('lsh_tasks').update({ google_external_id: extId }).eq('id', row.id)
      if (!error) mirrorCreated += 1
    } else {
      await googleApi(
        `/lists/${encodeURIComponent(env.GOOGLE_TASKLIST_ID)}/tasks/${encodeURIComponent(row.google_external_id)}`,
        token,
        {
          method: 'PATCH',
          body: JSON.stringify(body),
        },
      )
      mirrorUpdated += 1
    }
  }

  if (autoImport) {
    for (const remote of remoteItems) {
      const existsLegacy = localRows.some((r) => r.external_id === remote.id && r.source === 'GOOGLE_TASKS')
      const existsMirror = localRows.some((r) => r.google_external_id === remote.id)
      if (existsLegacy || existsMirror) continue
      const { error } = await supabase.from('lsh_tasks').insert({
        user_id: env.SYNC_OWNER_USER_ID,
        title: String(remote.title || 'SEM TITULO').toUpperCase(),
        details: String(remote.notes || '').toUpperCase() || null,
        status: mapGoogleStatusToLocal(remote.status),
        priority: 'MEDIUM',
        due_date: remote.due ? String(remote.due).slice(0, 10) : null,
        source: 'GOOGLE_TASKS',
        external_id: remote.id,
      })
      if (!error) imported += 1
    }
  }

  return {
    created: mirrorCreated,
    updated: updated + mirrorUpdated,
    imported,
    mirror: { created: mirrorCreated, updated: mirrorUpdated },
    skipped: false,
    autoImport,
  }
}

async function syncLark(supabase, localRows, env) {
  const token = await getLarkTenantAccessToken(env)
  if (!token) {
    return {
      created: 0,
      updated: 0,
      imported: 0,
      skipped: true,
      reason: 'Credenciais Lark ausentes (LARK_APP_ID/LARK_APP_SECRET)',
    }
  }

  const mineRaw = await larkApi('/task/v2/tasks?page_size=200', token)
  const remoteItems = Array.isArray(mineRaw?.data?.items) ? mineRaw.data.items : []
  const remoteById = new Map(remoteItems.map((t) => [t.guid || t.id, t]))

  let created = 0
  let updated = 0
  let imported = 0

  for (const row of localRows.filter((r) => r.source === 'LARK_TASK')) {
    if (!row.external_id) continue
    const remote = remoteById.get(row.external_id)
    if (!remote) continue
    const remoteStatus = mapLarkStatusToLocal(remote.status || remote.completed)
    if (remoteStatus !== row.status || String(remote.summary || '').toUpperCase() !== row.title) {
      await larkApi(`/task/v2/tasks/${encodeURIComponent(row.external_id)}`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          summary: row.title,
          description: row.details || '',
          completed: row.status === 'DONE',
        }),
      })
      updated += 1
    }
  }

  for (const row of localRows.filter((r) => r.source === 'LOCAL' && !r.external_id && r.lark_sync_enabled)) {
    const createdTask = await larkApi('/task/v2/tasks', token, {
      method: 'POST',
      body: JSON.stringify({
        summary: row.title,
        description: row.details || '',
        completed: row.status === 'DONE',
      }),
    })
    const extId = createdTask?.data?.guid || createdTask?.guid
    if (!extId) continue
    await supabase
      .from('lsh_tasks')
      .update({ source: 'LARK_TASK', external_id: extId })
      .eq('id', row.id)
    created += 1
  }

  for (const remote of remoteItems) {
    const guid = remote.guid || remote.id
    if (!guid) continue
    const exists = localRows.some((r) => r.external_id === guid && r.source === 'LARK_TASK')
    if (exists) continue
    const { error } = await supabase.from('lsh_tasks').insert({
      user_id: env.SYNC_OWNER_USER_ID,
      title: String(remote.summary || 'SEM TITULO').toUpperCase(),
      details: String(remote.description || '').toUpperCase() || null,
      status: mapLarkStatusToLocal(remote.status || remote.completed),
      priority: 'MEDIUM',
      due_date: remote.due ? String(remote.due).slice(0, 10) : null,
      source: 'LARK_TASK',
      external_id: guid,
    })
    if (!error) imported += 1
  }

  return { created, updated, imported, skipped: false }
}

async function syncGoogleCalendar(supabase, env) {
  const token = await getGoogleAccessToken(env)
  if (!token) {
    return {
      synced: 0,
      calendarId: env.GOOGLE_CALENDAR_ID,
      rangeDays: 30,
      skipped: true,
      reason: 'Credenciais Google OAuth ausentes (GOOGLE_OAUTH_*)',
    }
  }
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 30)
  end.setHours(23, 59, 59, 999)

  const params = {
    calendarId: env.GOOGLE_CALENDAR_ID,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 500,
    showDeleted: true,
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
  }

  const query = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(params.maxResults),
    showDeleted: 'true',
    timeMin: params.timeMin,
    timeMax: params.timeMax,
  })
  const remoteResp = await googleCalendarApi(
    `/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events?${query.toString()}`,
    token,
  )
  const remoteItems = Array.isArray(remoteResp?.items) ? remoteResp.items : []

  let synced = 0
  for (const event of remoteItems) {
    const startAt = parseGoogleEventDate(event.start)
    const endAt = parseGoogleEventDate(event.end) || startAt
    const extId = event.id
    if (!extId || !startAt || !endAt) continue

    const payload = {
      user_id: env.SYNC_OWNER_USER_ID,
      source: 'GOOGLE_CALENDAR',
      calendar_id: env.GOOGLE_CALENDAR_ID,
      external_id: extId,
      summary: String(event.summary || 'SEM TITULO').toUpperCase(),
      details: String(event.description || '').toUpperCase() || null,
      location: String(event.location || '').toUpperCase() || null,
      start_at: startAt,
      end_at: endAt,
      is_all_day: Boolean(event.start?.date && !event.start?.dateTime),
      status: String(event.status || 'confirmed').toLowerCase(),
    }

    const { error } = await supabase
      .from('lsh_calendar_events')
      .upsert(payload, { onConflict: 'user_id,source,external_id' })
    if (!error) synced += 1
  }

  return { synced, calendarId: env.GOOGLE_CALENDAR_ID, rangeDays: 30, skipped: false }
}

export async function runTasksSync(options = {}) {
  const { loadDotEnv = true, logger = console } = options
  if (loadDotEnv) loadEnvFromFile('.env')

  const env = {
    SUPABASE_URL: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    GOOGLE_TASKLIST_ID: process.env.GOOGLE_TASKLIST_ID || process.env.GWS_TASKLIST_ID,
    GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID || process.env.GWS_CALENDAR_ID || 'primary',
    GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    GOOGLE_OAUTH_REFRESH_TOKEN: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
    GOOGLE_TASKS_AUTO_IMPORT: process.env.GOOGLE_TASKS_AUTO_IMPORT,
    LARK_APP_ID: process.env.LARK_APP_ID,
    LARK_APP_SECRET: process.env.LARK_APP_SECRET,
    SYNC_OWNER_USER_ID: process.env.SYNC_OWNER_USER_ID,
  }

  must(env.SUPABASE_URL, 'SUPABASE_URL ou VITE_SUPABASE_URL')
  must(env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY')
  must(env.SYNC_OWNER_USER_ID, 'SYNC_OWNER_USER_ID')

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: localRows, error } = await supabase
    .from('lsh_tasks')
    .select('id, title, details, status, priority, due_date, source, external_id, google_sync_enabled, google_external_id, lark_sync_enabled')
    .eq('user_id', env.SYNC_OWNER_USER_ID)

  if (error) throw error

  logger.log('Sincronizando Google Tasks...')
  const google = await syncGoogle(supabase, localRows || [], env)
  logger.log('Sincronizando Lark Tasks...')
  const lark = await syncLark(supabase, localRows || [], env)
  logger.log('Sincronizando Google Agenda...')
  const calendar = await syncGoogleCalendar(supabase, env)

  return {
    ok: true,
    google,
    lark,
    calendar,
  }
}
