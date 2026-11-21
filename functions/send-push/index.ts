// Supabase Edge Function: send-push
// This function sends birthday push notifications (and other pending alerts) to users.
// It is invoked manually (by the "Testar alertas agora" button) or via a scheduled cron job.

import { serve } from "https://deno.land/x/supabase@1.86.0/functions/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.2";
import webPush from "https://esm.sh/web-push@3.5.0";

// ------------------------------------------------------------
// Helper: get today (Brazilian timezone) in "MM-DD" format
// ------------------------------------------------------------
function getTodayBR(): { month: string; day: string } {
  const now = new Date();
  const todayBR = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const month = String(todayBR.getMonth() + 1).padStart(2, "0");
  const day = String(todayBR.getDate()).padStart(2, "0");
  return { month, day };
}

// ------------------------------------------------------------
// Initialise Supabase client (service role key required)
// ------------------------------------------------------------
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

// ------------------------------------------------------------
// VAPID configuration – the public key must match the one used on the client
// ------------------------------------------------------------
const vapidPublicKey = Deno.env.get("SUPABASE_VAPID_PUBLIC_KEY") ?? "";
const vapidPrivateKey = Deno.env.get("SUPABASE_PUSH_PRIVATE_KEY") ?? "";
if (!vapidPublicKey || !vapidPrivateKey) {
  console.error("VAPID keys are missing – set SUPABASE_VAPID_PUBLIC_KEY and SUPABASE_PUSH_PRIVATE_KEY env vars.");
}
webPush.setVapidDetails(
  "mailto:contato@bemaviv.com",
  vapidPublicKey,
  vapidPrivateKey,
);

// ------------------------------------------------------------
// Main handler
// ------------------------------------------------------------
serve(async (req) => {
  try {
    const { force, userId } = await req.json().catch(() => ({}));

    // 1. Determine which users should receive birthday alerts
    let usersQuery = supabase
      .from("push_notification_preferences")
      .select("user_id, notify_birthdays_today, system_source")
      .eq("notify_birthdays_today", true)
      .eq("system_source", "v2");
    if (userId) {
      usersQuery = usersQuery.eq("user_id", userId);
    }
    const { data: prefs, error: prefErr } = await usersQuery;
    if (prefErr) throw prefErr;
    if (!prefs || prefs.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: "No users with birthday notifications enabled." }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Build birthday items for today (clients + relatives)
    const { month, day } = getTodayBR();
    const { data: clients } = await supabase
      .from("bem_aviv_clients")
      .select("id, full_name, phone_1, birth_date")
      .not("birth_date", "is", null);
    const { data: relatives } = await supabase
      .from("bem_aviv_client_relatives")
      .select("id, name, phone, relationship, birth_date")
      .not("birth_date", "is", null);

    const items: Array<{ id: string; category: string; clientName: string; clientPhone?: string; description: string; systemUrl: string }> = [];
    // Clients birthday
    for (const c of clients ?? []) {
      if (!c.birth_date) continue;
      const parts = String(c.birth_date).split("-");
      if (parts[1] === month && parts[2] === day) {
        items.push({
          id: `bday-c-${c.id}`,
          category: "aniversario",
          clientName: c.full_name,
          clientPhone: c.phone_1,
          description: "Cliente faz aniversário hoje.",
          systemUrl: "/bem-aviv/clientes",
        });
      }
    }
    // Relatives birthday
    for (const r of relatives ?? []) {
      if (!r.birth_date) continue;
      const parts = String(r.birth_date).split("-");
      if (parts[1] === month && parts[2] === day) {
        items.push({
          id: `bday-r-${r.id}`,
          category: "aniversario",
          clientName: r.name,
          clientPhone: r.phone,
          description: `Familiar (${r.relationship || "Parente"}) aniversariando hoje.`,
          systemUrl: "/bem-aviv/clientes",
        });
      }
    }

    if (items.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: "No birthday items for today." }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3. Send push to each user's subscriptions
    let totalSent = 0;
    const failedEndpoints: string[] = [];
    for (const pref of prefs) {
      const { data: subs, error: subErr } = await supabase
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("user_id", pref.user_id);
      if (subErr) {
        console.warn("Failed to fetch subscriptions for user", pref.user_id, subErr);
        continue;
      }
      // Build a summary payload for this user
      const names = items.map((i) => i.clientName).join(", ");
      const payload = {
        title: "🎂 Aniversariantes de hoje",
        body: `${names} ${items.length === 1 ? "está" : "estão"} comemorando hoje!`,
        icon: "/pwa-192x192.png",
        badge: "/pwa-192x192.png",
        data: { url: "/bem-aviv/clientes" },
      };
      for (const sub of subs ?? []) {
        try {
          await webPush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify(payload),
          );
          totalSent++;
        } catch (e) {
          console.warn("Push send error for endpoint", sub.endpoint, e);
          failedEndpoints.push(sub.endpoint);
          // Remove invalid subscription
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent: totalSent, failed: failedEndpoints.length, failedEndpoints }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in send-push function", error);
    return new Response(JSON.stringify({ success: false, error: error.message ?? "unknown" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
