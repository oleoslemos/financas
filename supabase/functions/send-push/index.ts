import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "https://esm.sh/web-push@3.6.7"

// Configuração do CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

interface PushPayload {
  title: string
  body: string
  url?: string
  userIds?: string[]
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "BMfj1Q3ueoxrWBpj6ivhvD9lnCilu6dBTWYKD1UIp1r5MaaFPrEYexNb1E9edIpUrSw8NCFbq1TgFsLo-kMzWPg"
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? ""
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:contato@bemaviv.com.br"

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Missing Supabase configuration" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (!vapidPrivateKey) {
      return new Response(JSON.stringify({ error: "Missing VAPID_PRIVATE_KEY secret" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Se o corpo tiver parâmetros específicos, usa. Caso contrário, verifica follow-ups vencidos do dia
    let payload: PushPayload = {
      title: "Bem Aviv Hub",
      body: "Você tem tarefas ou follow-ups pendentes para hoje!",
      url: "/bem-aviv/follow-up",
    }

    if (req.method === "POST") {
      try {
        const body = await req.json()
        if (body.title) payload.title = body.title
        if (body.body) payload.body = body.body
        if (body.url) payload.url = body.url
        if (Array.isArray(body.userIds)) payload.userIds = body.userIds
      } catch {
        // Usa payload padrão
      }
    }

    // Busca inscrições ativas
    let query = supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth, user_id")
    if (payload.userIds && payload.userIds.length > 0) {
      query = query.in("user_id", payload.userIds)
    }

    const { data: subscriptions, error: subsError } = await query

    if (subsError) {
      throw subsError
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhuma inscrição push encontrada para envio.", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const notificationData = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || "/bem-aviv/follow-up",
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
    })

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        }

        try {
          await webpush.sendNotification(pushSubscription, notificationData)
          return { id: sub.id, status: "sent" }
        } catch (err: any) {
          // Se inscrição expirou ou foi cancelada no navegador (404 ou 410 Gone), remove da tabela
          if (err.statusCode === 404 || err.statusCode === 410) {
            await supabase.from("push_subscriptions").delete().eq("id", sub.id)
          }
          throw err
        }
      })
    )

    const sentCount = results.filter((r) => r.status === "fulfilled").length
    const failedCount = results.filter((r) => r.status === "rejected").length

    return new Response(
      JSON.stringify({
        success: true,
        sent: sentCount,
        failed: failedCount,
        total: subscriptions.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
