// =========================================================
// KEYS99 - EMAIL THE PEOPLE BEHIND A PROJECT WHEN AN ENQUIRY COMES IN
//
// Supabase Edge Function. A database trigger (supabase/17-enquiry-email.sql)
// calls it with { kind: "residential" | "commercial", id } for every new
// enquiry. It then:
//
//  1. loads the enquiry and its project;
//  2. picks the recipients: the project's agent and relationship manager
//     (when active), or - if neither has an email - the enquiry_email in
//     app_settings;
//  3. fills enquiry.assigned_agent_id from the project's agent when empty;
//  4. sends one email through Brevo (replies go to the visitor, if they
//     gave an email) and stamps notified_at, so an enquiry is mailed once.
//
// Secrets (Supabase > Edge Functions > Secrets), see ENQUIRY-EMAILS.md:
//   BREVO_API_KEY           Brevo API key (v3)
//   MAIL_FROM               verified sender, e.g. support@keys99.com
//   ENQUIRY_NOTIFY_SECRET   long random string, same value as the Vault
//                           secret "enquiry_notify_secret"
//   MAIL_FROM_NAME          optional, default "Keys99 Enquiries"
//   SITE_URL                optional, default https://keys99.com
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// =========================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const TYPE_LABEL: Record<string, string> = {
  enquire_now: "Enquiry",
  request_callback: "Callback request",
  schedule_site_visit: "Site visit request",
  get_price_details: "Price details request",
  request_lease_details: "Lease details request",
  whatsapp_now: "WhatsApp enquiry",
};

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function visitText(date?: string | null, time?: string | null) {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
  if (!time) return day;
  const h = Number(time.slice(0, 2));
  return `${day}, ${h % 12 || 12}:${time.slice(3, 5)} ${h < 12 ? "AM" : "PM"}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const secret = Deno.env.get("ENQUIRY_NOTIFY_SECRET");
  if (!secret || req.headers.get("x-notify-secret") !== secret) return json({ error: "Unauthorized" }, 401);

  let kind = "", id = "";
  try {
    ({ kind, id } = await req.json());
  } catch (_) {
    return json({ error: "Bad request" }, 400);
  }
  if (!["residential", "commercial"].includes(kind) || !/^[0-9a-f-]{36}$/i.test(id)) {
    return json({ error: "Bad request" }, 400);
  }

  const apiKey = Deno.env.get("BREVO_API_KEY");
  const from = Deno.env.get("MAIL_FROM");
  if (!apiKey || !from) return json({ error: "BREVO_API_KEY and MAIL_FROM must be set" }, 500);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const enquiries = `${kind}_enquiries`;

  const { data: enq, error: enqError } = await db.from(enquiries).select("*").eq("id", id).maybeSingle();
  if (enqError || !enq) return json({ error: "Enquiry not found" }, 404);
  if (enq.notified_at) return json({ skipped: "already notified" });

  const { data: project } = await db
    .from(`${kind}_projects`)
    .select("project_name, agent_id, relationship_manager_id")
    .eq("id", enq.project_id)
    .maybeSingle();

  const people: { name: string; email: string; role: string }[] = [];
  let agentId: string | null = null;

  if (project?.agent_id) {
    const { data: agent } = await db.from("agents").select("id, full_name, email, status").eq("id", project.agent_id).maybeSingle();
    if (agent) {
      agentId = agent.id;
      if (agent.email && agent.status === "active") people.push({ name: agent.full_name, email: agent.email, role: "Agent" });
    }
  }
  if (project?.relationship_manager_id) {
    const { data: rm } = await db.from("relationship_managers").select("full_name, email, status").eq("id", project.relationship_manager_id).maybeSingle();
    if (rm?.email && rm.status === "active") people.push({ name: rm.full_name, email: rm.email, role: "Relationship manager" });
  }
  if (!people.length) {
    const { data: settings } = await db.from("app_settings").select("enquiry_email").limit(1).maybeSingle();
    if (settings?.enquiry_email) people.push({ name: "Keys99 team", email: settings.enquiry_email, role: "Team" });
  }
  if (!people.length) return json({ error: "No recipient: no active agent/RM email and no app_settings.enquiry_email" }, 422);

  const to = [...new Map(people.map((p) => [p.email.toLowerCase(), p])).values()];
  const projectName = project?.project_name || "a project";
  const label = TYPE_LABEL[enq.enquiry_type] || "Enquiry";
  const visit = enq.enquiry_type === "schedule_site_visit" ? visitText(enq.preferred_visit_date, enq.preferred_visit_time) : "";
  const site = (Deno.env.get("SITE_URL") || "https://keys99.com").replace(/\/$/, "");
  const phone = String(enq.phone || "");
  const wa = String(enq.whatsapp || enq.phone || "").replace(/\D/g, "");

  const rows: [string, string][] = [
    ["Project", projectName],
    ["Type", label],
    ["Name", enq.contact_person],
    ["Phone", phone],
    ["WhatsApp", enq.whatsapp && enq.whatsapp !== enq.phone ? enq.whatsapp : ""],
    ["Email", enq.email],
    ["Preferred visit", visit],
    ["Prefers to be contacted by", enq.preferred_contact_method],
    ["Message", enq.message],
    ["Source", [enq.source, enq.utm_source, enq.utm_campaign].filter(Boolean).join(" / ")],
  ];
  const tableRows = rows.filter(([, v]) => v).map(([k, v]) =>
    `<tr><td style="padding:6px 14px 6px 0;color:#6b7f86;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;color:#0e2d3e;white-space:pre-wrap">${esc(v)}</td></tr>`
  ).join("");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0e2d3e">
  <h2 style="margin:0 0 4px">New ${esc(label.toLowerCase())}: ${esc(projectName)}</h2>
  <p style="margin:0 0 16px;color:#6b7f86">Received ${esc(new Date(enq.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))} IST. Please contact the visitor as soon as you can.</p>
  <table style="border-collapse:collapse;font-size:15px">${tableRows}</table>
  <p style="margin:20px 0 0">
    ${phone ? `<a href="tel:${esc(phone)}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 16px;background:#006b5b;color:#fff;border-radius:8px;text-decoration:none">Call ${esc(phone)}</a>` : ""}
    ${wa ? `<a href="https://wa.me/${esc(wa)}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 16px;background:#1f9d55;color:#fff;border-radius:8px;text-decoration:none">WhatsApp</a>` : ""}
    <a href="${esc(site)}/admin/leads.html" style="display:inline-block;margin:0 0 8px;padding:10px 16px;border:1px solid #d3e0dc;color:#0e2d3e;border-radius:8px;text-decoration:none">Open in leads</a>
  </p>
  <p style="margin:16px 0 0;font-size:12px;color:#8a9aa0">Sent automatically by Keys99 to ${esc(to.map((p) => `${p.name} (${p.role})`).join(", "))}.</p>
</div>`;
  const text = rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n") + `\n\nLeads: ${site}/admin/leads.html`;

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: Deno.env.get("MAIL_FROM_NAME") || "Keys99 Enquiries", email: from },
      to: to.map((p) => ({ email: p.email, name: p.name })),
      ...(enq.email ? { replyTo: { email: enq.email, name: enq.contact_person } } : {}),
      subject: `New ${label.toLowerCase()}: ${projectName} - ${enq.contact_person}${visit ? ` (${visit})` : ""}`,
      htmlContent: html,
      textContent: text,
      tags: ["enquiry", kind],
    }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    console.error("Brevo refused the mail:", res.status, detail);
    return json({ error: "Mail not sent", status: res.status }, 502);
  }

  await db.from(enquiries).update({
    notified_at: new Date().toISOString(),
    ...(agentId && !enq.assigned_agent_id ? { assigned_agent_id: agentId } : {}),
  }).eq("id", id);

  return json({ sent: to.map((p) => p.email) });
});
