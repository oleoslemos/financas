import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { createClient } from '@supabase/supabase-js'

const GOOGLE_CALENDAR_EVENTS_SCOPE =
  'https://www.googleapis.com/auth/calendar.events'
const REFRESH_TOKEN_URL = 'https://oauth2.googleapis.com/token'

async function refreshGoogleAccessToken(token) {
  try {
    if (!token.refreshToken) {
      throw new Error('Refresh token indisponivel.')
    }

    const response = await fetch(REFRESH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
      }),
    })

    const refreshedTokens = await response.json()
    if (!response.ok) {
      throw refreshedTokens
    }

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      accessTokenExpires: Date.now() + refreshedTokens.expires_in * 1000,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
      error: undefined,
    }
  } catch (_error) {
    return {
      ...token,
      error: 'RefreshAccessTokenError',
    }
  }
}

async function persistGoogleCredentials({ userId, refreshToken }) {
  if (!userId || !refreshToken) return

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  await supabase.from('google_user_sync_credentials').upsert(
    {
      user_id: userId,
      refresh_token: refreshToken,
      is_active: true,
    },
    { onConflict: 'user_id' },
  )
}

function getBaseUrl() {
  const nextAuthUrl = process.env.NEXTAUTH_URL?.trim()
  if (nextAuthUrl) return nextAuthUrl.replace(/\/+$/, '')

  const vercelUrl = process.env.VERCEL_URL?.trim()
  if (vercelUrl) return `https://${vercelUrl.replace(/\/+$/, '')}`

  return ''
}

function maskUserId(value) {
  if (!value) return ''
  if (value.length <= 8) return '***'
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

async function triggerSyncForUser({ integrationUserId }) {
  if (!integrationUserId) return

  const baseUrl = getBaseUrl()
  if (!baseUrl) return

  const token = process.env.SYNC_WEBHOOK_TOKEN?.trim()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['x-sync-token'] = token

  const startedAt = Date.now()
  try {
    const response = await fetch(`${baseUrl}/api/sync-tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ integrationUserId }),
    })
    const latencyMs = Date.now() - startedAt

    console.info('[auth-google-sync-trigger]', {
      operation: 'trigger_sync',
      integration_user_id: maskUserId(integrationUserId),
      status: response.status,
      ok: response.ok,
      latency_ms: latencyMs,
      endpoint: '/api/sync-tasks',
    })
  } catch (_error) {
    const latencyMs = Date.now() - startedAt
    console.warn('[auth-google-sync-trigger]', {
      operation: 'trigger_sync',
      integration_user_id: maskUserId(integrationUserId),
      status: 'network_error',
      ok: false,
      latency_ms: latencyMs,
      endpoint: '/api/sync-tasks',
    })
    // Fluxo de login não deve falhar por erro de sync inicial.
  }
}

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: `openid email profile ${GOOGLE_CALENDAR_EVENTS_SCOPE}`,
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        const integrationUserId =
          token.sub || profile?.sub || account.providerAccountId
        await persistGoogleCredentials({
          userId: integrationUserId,
          refreshToken: account.refresh_token,
        })
        await triggerSyncForUser({ integrationUserId })

        return {
          ...token,
          sub: integrationUserId,
          accessToken: account.access_token,
          accessTokenExpires: account.expires_at ? account.expires_at * 1000 : 0,
          refreshToken: account.refresh_token || token.refreshToken,
        }
      }

      if (token.accessTokenExpires && Date.now() < token.accessTokenExpires) {
        return token
      }

      return refreshGoogleAccessToken(token)
    },
    async session({ session, token }) {
      session.error = token.error
      session.accessToken = token.accessToken
      return session
    },
  },
})

export { handler as GET, handler as POST }
