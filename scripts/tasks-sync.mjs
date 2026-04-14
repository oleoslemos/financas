import { execSync } from 'node:child_process'
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

loadEnvFromFile('.env')

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const GWS_TASKLIST_ID = process.env.GWS_TASKLIST_ID
const GWS_CALENDAR_ID = process.env.GWS_CALENDAR_ID || 'primary'

function must(value, name) {
  if (!value) throw new Error(`Variavel obrigatoria ausente: ${name}`)
  return value
}

function runJson(cmd) {
  const out = execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  if (!out) return null
  try {
    return JSON.parse(out)
  } catch {
    const firstJsonIdx = Math.max(
      out.indexOf('{') === -1 ? Number.POSITIVE_INFINITY : out.indexOf('{'),
      out.indexOf('[') === -1 ? Number.POSITIVE_INFINITY : out.indexOf('['),
    )
    if (Number.isFinite(firstJsonIdx)) {
      try {
        return JSON.parse(out.slice(firstJsonIdx))
      } catch {
        // fallback para parse por linhas
      }
    }
    const lines = out
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    const parsed = lines.map((line) => JSON.parse(line))
    return parsed.length === 1 ? parsed[0] : parsed
  }
}

function runGwsJson(subcommand, paramsObj, bodyObj) {
  const paramsEscaped = JSON.stringify(paramsObj).replace(/"/g, '\\"')
  const bodySwitch =
    bodyObj == null ? '' : ` --json "${JSON.stringify(bodyObj).replace(/"/g, '\\"')}"`
  const cmd = `gws ${subcommand} --params "${paramsEscaped}"${bodySwitch} --format json`
  return runJson(cmd)
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

function parseGoogleEventDate(value) {
  if (!value) return null
  if (typeof value.dateTime === 'string' && value.dateTime) return value.dateTime
  if (typeof value.date === 'string' && value.date) return `${value.date}T00:00:00.000Z`
  return null
}

async function syncGoogle(supabase, localRows) {
  if (!GWS_TASKLIST_ID) {
    console.log('Google: ignorado (GWS_TASKLIST_ID nao definido).')
    return { created: 0, updated: 0, imported: 0 }
  }

  const listParams = {
    tasklist: GWS_TASKLIST_ID,
    showCompleted: true,
    showHidden: true,
  }
  const remoteResp = runGwsJson('tasks tasks list', listParams)
  const remoteItems = Array.isArray(remoteResp?.items) ? remoteResp.items : []
  const remoteById = new Map(remoteItems.map((t) => [t.id, t]))

  let created = 0
  let updated = 0
  let imported = 0

  for (const row of localRows.filter((r) => r.source === 'GOOGLE_TASKS')) {
    if (!row.external_id) continue
    const remote = remoteById.get(row.external_id)
    if (!remote) continue
    const shouldStatus = mapLocalStatusToGoogle(row.status)
    const shouldTitle = row.title
    if (remote.status !== shouldStatus || (remote.title || '') !== shouldTitle) {
      const patchParams = { tasklist: GWS_TASKLIST_ID, task: row.external_id }
      const patchBody = {
        title: shouldTitle,
        notes: row.details || '',
        status: shouldStatus,
        due: dueDateToRfc3339(row.due_date),
      }
      runGwsJson('tasks tasks patch', patchParams, patchBody)
      updated += 1
    }
  }

  for (const row of localRows.filter((r) => r.source === 'LOCAL' && !r.external_id)) {
    const insertParams = { tasklist: GWS_TASKLIST_ID }
    const insertBody = {
      title: row.title,
      notes: row.details || '',
      status: mapLocalStatusToGoogle(row.status),
      due: dueDateToRfc3339(row.due_date),
    }
    const inserted = runGwsJson('tasks tasks insert', insertParams, insertBody)
    const extId = inserted?.id
    if (!extId) continue
    await supabase
      .from('lsh_tasks')
      .update({ source: 'GOOGLE_TASKS', external_id: extId })
      .eq('id', row.id)
    created += 1
  }

  for (const remote of remoteItems) {
    const exists = localRows.some((r) => r.external_id === remote.id && r.source === 'GOOGLE_TASKS')
    if (exists) continue
    const { error } = await supabase.from('lsh_tasks').insert({
      user_id: process.env.SYNC_OWNER_USER_ID,
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

  return { created, updated, imported }
}

async function syncLark(supabase, localRows) {
  const mineRaw = runJson('lark-cli task +get-my-tasks --format json --page-all')
  const pages = Array.isArray(mineRaw) ? mineRaw : [mineRaw]
  const remoteItems = pages.flatMap((p) => p?.data?.items || p?.items || [])
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
      runJson(
        `lark-cli task +update --task-id "${row.external_id}" --summary "${row.title}" --description "${row.details || ''}" --format json`
      )
      if (row.status === 'DONE') {
        runJson(`lark-cli task +complete --task-id "${row.external_id}" --format json`)
      } else {
        runJson(`lark-cli task +reopen --task-id "${row.external_id}" --format json`)
      }
      updated += 1
    }
  }

  for (const row of localRows.filter((r) => r.source === 'LOCAL' && !r.external_id)) {
    const createdTask = runJson(
      `lark-cli task +create --summary "${row.title}" --description "${row.details || ''}" --format json`
    )
    const extId = createdTask?.data?.guid || createdTask?.guid
    if (!extId) continue
    if (mapLocalStatusToLark(row.status) === 'done') {
      runJson(`lark-cli task +complete --task-id "${extId}" --format json`)
    }
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
      user_id: process.env.SYNC_OWNER_USER_ID,
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

  return { created, updated, imported }
}

async function syncGoogleCalendar(supabase) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 30)
  end.setHours(23, 59, 59, 999)

  const params = {
    calendarId: GWS_CALENDAR_ID,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 500,
    showDeleted: true,
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
  }

  const remoteResp = runGwsJson('calendar events list', params)
  const remoteItems = Array.isArray(remoteResp?.items) ? remoteResp.items : []

  let synced = 0
  for (const event of remoteItems) {
    const startAt = parseGoogleEventDate(event.start)
    const endAt = parseGoogleEventDate(event.end) || startAt
    const extId = event.id
    if (!extId || !startAt || !endAt) continue

    const payload = {
      user_id: process.env.SYNC_OWNER_USER_ID,
      source: 'GOOGLE_CALENDAR',
      calendar_id: GWS_CALENDAR_ID,
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

  return { synced, calendarId: GWS_CALENDAR_ID, rangeDays: 30 }
}

async function main() {
  must(SUPABASE_URL, 'SUPABASE_URL ou VITE_SUPABASE_URL')
  must(SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY')
  must(process.env.SYNC_OWNER_USER_ID, 'SYNC_OWNER_USER_ID')

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { data: localRows, error } = await supabase
    .from('lsh_tasks')
    .select('id, title, details, status, priority, due_date, source, external_id')
    .eq('user_id', process.env.SYNC_OWNER_USER_ID)

  if (error) throw error

  console.log('Sincronizando Google Tasks...')
  const google = await syncGoogle(supabase, localRows || [])
  console.log('Sincronizando Lark Tasks...')
  const lark = await syncLark(supabase, localRows || [])
  console.log('Sincronizando Google Agenda...')
  const calendar = await syncGoogleCalendar(supabase)

  console.log(
    JSON.stringify(
      {
        ok: true,
        google,
        lark,
        calendar,
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message || err) }, null, 2))
  process.exit(1)
})
