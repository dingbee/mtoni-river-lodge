import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    console.error("Missing required email worker environment configuration");
    return json({ error: "Email worker is not configured" }, 503);
  }

  // Supabase Edge gateway JWT verification must remain enabled.
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${serviceRoleKey}`) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: claimed, error: claimError } = await supabase.rpc(
    "staynas_calendar_claim_email_notifications",
    { _batch_size: 20 },
  );
  if (claimError) {
    console.error("Unable to claim calendar email notifications", claimError.message);
    return json({ error: "Unable to claim notifications" }, 500);
  }

  let sent = 0;
  let retried = 0;
  let failed = 0;
  for (const item of claimed ?? []) {
    try {
      if (!item.recipient_id) throw new Error("Notification has no recipient");
      const { data: userResult, error: userError } = await supabase.auth.admin.getUserById(item.recipient_id);
      if (userError || !userResult.user?.email) throw new Error("Recipient email unavailable");
      const payload = item.payload ?? {};
      const subject = typeof payload.title === "string" && payload.title.trim()
        ? payload.title.trim()
        : "StayNas calendar update";
      const text = typeof payload.body === "string" && payload.body.trim()
        ? payload.body.trim()
        : String(item.event_type ?? "Calendar update");
      const appBaseUrl = Deno.env.get("STAYNAS_APP_URL")?.replace(/\\/$/, "");
      const href = appBaseUrl && typeof payload.href === "string" && payload.href.startsWith("/")
        ? `${appBaseUrl}${payload.href}`
        : null;
      const html = typeof payload.html === "string"
        ? payload.html
        : `<div style="font-family:Arial,sans-serif;line-height:1.5"><h2>${escapeHtml(subject)}</h2><p>${escapeHtml(text)}</p>${href ? `<p><a href="${escapeHtml(href)}">Open StayNas</a></p>` : ""}</div>`;

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `staynas-calendar-${item.id}`,
        },
        body: JSON.stringify({
          from: "StayNas <notifications@nolmark.co>",
          to: [userResult.user.email],
          subject,
          text,
          html,
          tags: [
            { name: "source", value: "staynas-calendar" },
            { name: "outbox_id", value: String(item.id) },
          ],
        }),
      });
      if (!response.ok) {
        const details = await response.text();
        throw new Error(`Resend API ${response.status}: ${details.slice(0, 500)}`);
      }
      const { error: finishError } = await supabase.rpc("staynas_calendar_finish_email_notification", {
        _notification_id: item.id,
        _success: true,
        _error: null,
      });
      if (finishError) throw new Error(`Sent through Resend but could not finalize outbox state: ${finishError.message}`);
      sent++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown email delivery failure";
      const { error: finishError } = await supabase.rpc("staynas_calendar_finish_email_notification", {
        _notification_id: item.id,
        _success: false,
        _error: message.slice(0, 1000),
      });
      if (finishError) {
        console.error("Could not finalize failed email notification", item.id, finishError.message);
        failed++;
      } else if ((item.attempt_count ?? 0) + 1 >= 5) {
        failed++;
      } else {
        retried++;
      }
    }
  }

  return json({ claimed: (claimed ?? []).length, sent, retried, failed });
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
