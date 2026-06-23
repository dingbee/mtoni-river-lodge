// Sends booking-related guest emails through the Gmail connector gateway.
// Sender identity: "Mtoni River Lodge <bookings@mtoniriverlodge.com>".
// NOTE: The Gmail API will only honour this From address if
// bookings@mtoniriverlodge.com is configured as a verified "Send mail as"
// alias on the connected Google account. Otherwise Gmail rewrites From to
// the authenticated mailbox. Reply-To is always set to bookings@.
// This file is server-only and must never be imported from client code.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const SENDER_NAME = "Mtoni River Lodge";
const SENDER_EMAIL = "bookings@mtoniriverlodge.com";
const REPLY_TO = "bookings@mtoniriverlodge.com";

function b64url(input: string): string {
  // Gmail API expects base64url-encoded RFC 2822 message
  // Use Buffer (available in the Worker runtime with nodejs_compat)
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildMime(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: { filename: string; contentType: string; bytes: Uint8Array }[];
}): string {
  const altBoundary = `=_alt_${Math.random().toString(36).slice(2)}`;
  const mixedBoundary = `=_mixed_${Math.random().toString(36).slice(2)}`;
  const hasAttachments = !!opts.attachments?.length;
  const topBoundary = hasAttachments ? mixedBoundary : altBoundary;
  const topType = hasAttachments ? "multipart/mixed" : "multipart/alternative";

  const headers = [
    `From: "${SENDER_NAME}" <${SENDER_EMAIL}>`,
    `To: ${opts.to}`,
    `Reply-To: ${opts.replyTo ?? REPLY_TO}`,
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: ${topType}; boundary="${topBoundary}"`,
  ].join("\r\n");

  const altPart = [
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    "",
    `--${altBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    opts.text,
    "",
    `--${altBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    opts.html,
    "",
    `--${altBoundary}--`,
  ].join("\r\n");

  let body: string;
  if (!hasAttachments) {
    body = altPart;
  } else {
    const parts: string[] = [`--${mixedBoundary}`, altPart, ""];
    for (const a of opts.attachments!) {
      const b64 = Buffer.from(a.bytes).toString("base64").replace(/(.{76})/g, "$1\r\n");
      parts.push(
        `--${mixedBoundary}`,
        `Content-Type: ${a.contentType}; name="${a.filename}"`,
        `Content-Disposition: attachment; filename="${a.filename}"`,
        "Content-Transfer-Encoding: base64",
        "",
        b64,
        "",
      );
    }
    parts.push(`--${mixedBoundary}--`, "");
    body = parts.join("\r\n");
  }

  return `${headers}\r\n\r\n${body}`;
}

export async function sendGmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: { filename: string; contentType: string; bytes: Uint8Array }[];
}): Promise<{ id?: string; ok: boolean; error?: string }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gmailKey = process.env.GOOGLE_MAIL_API_KEY;
  if (!lovableKey || !gmailKey) {
    return { ok: false, error: "Gmail connector not configured" };
  }

  const raw = b64url(buildMime(opts));
  const res = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": gmailKey,
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Gmail send failed ${res.status}: ${text.slice(0, 500)}` };
  }
  const json = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, id: json.id };
}

// ============== Branded templates ==============

const BRAND_COLOR = "#2f5d3a";
const ACCENT = "#c79a4b";

function shell(inner: string, preheader: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Mtoni River Lodge</title></head>
<body style="margin:0;padding:0;background:#f6f3ee;font-family:Georgia,'Times New Roman',serif;color:#2b2b2b;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f3ee;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:6px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);">
<tr><td style="background:${BRAND_COLOR};padding:28px 32px;color:#ffffff;text-align:center;">
  <div style="font-size:22px;letter-spacing:2px;text-transform:uppercase;">Mtoni River Lodge</div>
  <div style="font-size:12px;opacity:.85;margin-top:4px;letter-spacing:1px;">ARUSHA · TANZANIA</div>
</td></tr>
<tr><td style="padding:32px;">${inner}</td></tr>
<tr><td style="background:#fafaf7;padding:20px 32px;border-top:1px solid #eee;font-size:12px;color:#777;text-align:center;">
  Mtoni River Lodge · Arusha, Tanzania<br/>
  <a href="https://mtoniriverlodge.com" style="color:${ACCENT};text-decoration:none;">mtoniriverlodge.com</a>
  &nbsp;·&nbsp; <a href="mailto:${REPLY_TO}" style="color:${ACCENT};text-decoration:none;">${REPLY_TO}</a>
</td></tr>
</table>
</td></tr></table></body></html>`;
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:6px 0;color:#777;font-size:13px;width:40%;">${label}</td><td style="padding:6px 0;color:#2b2b2b;font-size:14px;font-weight:bold;">${value}</td></tr>`;
}

function money(amount: number | string, currency: string): string {
  const n = Number(amount);
  if (!isFinite(n)) return `${amount} ${currency}`;
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type BookingEmailData = {
  reference: string;
  guestName: string;
  guestEmail: string;
  roomName?: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  total: number | string;
  deposit?: number | string;
  balance?: number | string;
  currency: string;
};

export function renderBookingReceived(b: BookingEmailData) {
  const inner = `
    <h1 style="margin:0 0 8px;font-size:24px;color:${BRAND_COLOR};">Karibu, ${b.guestName}</h1>
    <p style="margin:0 0 18px;line-height:1.6;color:#444;">
      We've received your reservation request for <strong>Mtoni River Lodge</strong>. Your booking is held pending payment of the deposit. Once the deposit clears we'll send your full confirmation.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;border-bottom:1px solid #eee;margin:8px 0 20px;">
      ${row("Reference", b.reference)}
      ${b.roomName ? row("Room", b.roomName) : ""}
      ${row("Check-in", b.checkIn)}
      ${row("Check-out", b.checkOut)}
      ${row("Nights", String(b.nights))}
      ${row("Guests", `${b.adults} adult${b.adults > 1 ? "s" : ""}${b.children ? `, ${b.children} child${b.children > 1 ? "ren" : ""}` : ""}`)}
      ${row("Total", money(b.total, b.currency))}
      ${b.deposit ? row("Deposit due", money(b.deposit, b.currency)) : ""}
    </table>
    <p style="margin:0 0 12px;line-height:1.6;color:#444;">
      If you haven't completed payment yet, you can resume from your booking link. Replies to this email reach our reservations team directly.
    </p>
    <p style="margin:24px 0 0;color:#777;font-size:13px;">— The Mtoni River Lodge Reservations Team</p>`;
  const text = `Karibu, ${b.guestName}\n\nWe've received your reservation request.\n\nReference: ${b.reference}\nCheck-in: ${b.checkIn}\nCheck-out: ${b.checkOut}\nNights: ${b.nights}\nTotal: ${money(b.total, b.currency)}\n${b.deposit ? `Deposit due: ${money(b.deposit, b.currency)}\n` : ""}\nReply to this email if you need assistance.\n\n— Mtoni River Lodge`;
  return {
    subject: `Mtoni River Lodge — Reservation received (${b.reference})`,
    html: shell(inner, `Your reservation ${b.reference} is held pending payment.`),
    text,
  };
}

export function renderBookingConfirmed(b: BookingEmailData) {
  const inner = `
    <h1 style="margin:0 0 8px;font-size:24px;color:${BRAND_COLOR};">Your stay is confirmed</h1>
    <p style="margin:0 0 18px;line-height:1.6;color:#444;">
      Asante sana, ${b.guestName}. We've received your deposit and your reservation at <strong>Mtoni River Lodge</strong> is confirmed. We can't wait to welcome you to the river.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;border-bottom:1px solid #eee;margin:8px 0 20px;">
      ${row("Reference", b.reference)}
      ${b.roomName ? row("Room", b.roomName) : ""}
      ${row("Check-in", b.checkIn)}
      ${row("Check-out", b.checkOut)}
      ${row("Nights", String(b.nights))}
      ${row("Guests", `${b.adults} adult${b.adults > 1 ? "s" : ""}${b.children ? `, ${b.children} child${b.children > 1 ? "ren" : ""}` : ""}`)}
      ${row("Total", money(b.total, b.currency))}
      ${b.deposit ? row("Deposit paid", money(b.deposit, b.currency)) : ""}
      ${b.balance ? row("Balance on arrival", money(b.balance, b.currency)) : ""}
    </table>
    <p style="margin:0 0 12px;line-height:1.6;color:#444;">
      Please reply to this email with arrival time and any special requests. If you'd like to add an airport transfer or an experience, just let us know.
    </p>
    <p style="margin:24px 0 0;color:#777;font-size:13px;">— The Mtoni River Lodge Reservations Team</p>`;
  const text = `Asante sana, ${b.guestName}\n\nYour reservation at Mtoni River Lodge is confirmed.\n\nReference: ${b.reference}\nCheck-in: ${b.checkIn}\nCheck-out: ${b.checkOut}\nNights: ${b.nights}\nDeposit paid: ${b.deposit ? money(b.deposit, b.currency) : "—"}\nBalance on arrival: ${b.balance ? money(b.balance, b.currency) : "—"}\n\nReply to this email with your arrival time and any requests.\n\n— Mtoni River Lodge`;
  return {
    subject: `Mtoni River Lodge — Booking confirmed (${b.reference})`,
    html: shell(inner, `Your booking ${b.reference} is confirmed.`),
    text,
  };
}