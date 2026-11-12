import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Printer,
  RefreshCw,
  Share2,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildGuestPortalUrl, guestPortalOrigin } from "./guest-portal.shared";
import {
  getGuestPortalAccessStatus,
  issueGuestPortalAccess,
  revokeGuestPortalAccess,
  recordGuestPortalAccessEvent,
} from "./guest-portal.functions";

function formatDate(value: string | null | undefined, timezone: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone || "UTC",
  }).format(new Date(value));
}

export function GuestPortalAccessPanel({
  bookingId,
  bookingStatus,
}: {
  bookingId: string;
  bookingStatus: string;
}) {
  const qc = useQueryClient();
  const [link, setLink] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [accessId, setAccessId] = useState<string | null>(null);
  const statusFn = useServerFn(getGuestPortalAccessStatus);
  const issueFn = useServerFn(issueGuestPortalAccess);
  const revokeFn = useServerFn(revokeGuestPortalAccess);
  const recordEventFn = useServerFn(recordGuestPortalAccessEvent);

  const access = useQuery({
    queryKey: ["guest-portal-access", bookingId],
    queryFn: () => statusFn({ data: { bookingId } }),
    enabled: true,
  });

  useEffect(() => {
    let cancelled = false;
    setQrDataUrl(null);
    if (!link) return;
    QRCode.toDataURL(link, {
      errorCorrectionLevel: "H",
      margin: 4,
      width: 1200,
      color: { dark: "#111827", light: "#FFFFFF" },
    })
      .then(async (dataUrl) => {
        if (!cancelled) {
          setQrDataUrl(dataUrl);
          if (accessId) {
            try { await recordEventFn({ data: { bookingId, accessId, eventType: "qr_generated" } }); } catch { /* QR remains valid if audit telemetry is unavailable. */ }
          }
        }
      })
      .catch(() => {
        if (!cancelled) toast.error("QR image could not be generated. The secure link remains valid.");
      });
    return () => {
      cancelled = true;
    };
  }, [link, accessId, bookingId, recordEventFn]);

  const issue = useMutation({
    mutationFn: () => issueFn({ data: { bookingId, rotate: true } }),
    onSuccess: (result) => {
      if (result.token) {
        setAccessId(result.accessId);
        setLink(buildGuestPortalUrl(guestPortalOrigin(window.location.origin, import.meta.env.VITE_GUEST_PORTAL_BASE_URL), result.token));
        toast.success("Guest Portal access generated");
      } else {
        setLink(null);
        toast.info("An active credential already exists. Regenerate it to reveal a new shareable link.");
      }
      qc.invalidateQueries({ queryKey: ["guest-portal-access", bookingId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revoke = useMutation({
    mutationFn: () =>
      revokeFn({ data: { bookingId, guestId: access.data?.guestId ?? null } }),
    onSuccess: (result) => {
      setLink(null);
      setQrDataUrl(null);
      setAccessId(null);
      toast.success(result.revokedCount ? "Guest Portal access revoked" : "No active credential to revoke");
      qc.invalidateQueries({ queryKey: ["guest-portal-access", bookingId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      if (accessId) { try { await recordEventFn({ data: { bookingId, accessId, eventType: "link_shared" } }); } catch { /* Sharing succeeds independently of audit telemetry. */ } }
      toast.success("Guest Portal link copied");
    } catch {
      toast.error("Clipboard access is unavailable on this device.");
    }
  }

  async function shareLink() {
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "StayNas Guest Portal",
          text: "Open your secure guest portal for this stay.",
          url: link,
        });
        if (accessId) { try { await recordEventFn({ data: { bookingId, accessId, eventType: "link_shared" } }); } catch { /* Sharing succeeds independently of audit telemetry. */ } }
      } catch (error) {
        if ((error as Error).name !== "AbortError") toast.error("The share action could not be completed.");
      }
      return;
    }
    await copyLink();
  }

  function printCard() {
    if (!qrDataUrl || !access.data) return;
    const printWindow = window.open("", "_blank", "width=640,height=760");
    if (!printWindow) {
      toast.error("Allow pop-ups to print the guest access card.");
      return;
    }
    const escapeHtml = (value: string) =>
      value.replace(/[&<>"']/g, (char) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
      );
    const property = escapeHtml(access.data.propertyName);
    const guest = escapeHtml(access.data.guestName);
    printWindow.opener = null;
    printWindow.document.write(`<!doctype html><html><head><title>Guest Portal Access</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>body{font-family:Arial,sans-serif;display:flex;justify-content:center;padding:32px;color:#111}
      .card{width:440px;text-align:center;border:1px solid #ddd;border-radius:18px;padding:28px}
      img{width:300px;height:300px;max-width:100%}h1{font-size:22px}p{line-height:1.5;color:#444}
      @media print{body{padding:0}.card{border:0}}</style></head><body>
      <main class="card"><h1>${property}</h1><p>Guest Portal Access</p><p>${guest}</p>
      <img src="${qrDataUrl}" alt="Guest Portal QR code">
      <p>Scan to open your StayNas Guest Portal.</p>
      <p>Keep this access card private. Access ends at checkout or when revoked.</p></main>
      <script>window.onload=()=>window.print();</script></body></html>`);
    printWindow.document.close();
  }

  useEffect(() => {
    if (access.data && !access.data.active) {
      setLink(null);
      setQrDataUrl(null);
      setAccessId(null);
    }
  }, [access.data?.active]);

  const active = access.data?.active ?? false;

  return (
    <section className="mt-4 rounded-lg border border-border p-4 text-sm">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <p className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
          Guest Portal access
        </p>
      </div>

      {access.isLoading ? (
        <p className="mt-2 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking access…
        </p>
      ) : access.error ? (
        <p className="mt-2 text-destructive">{(access.error as Error).message}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {bookingStatus !== "checked_in" && (
            <p className="rounded-md bg-muted/40 p-3 text-muted-foreground">
              {bookingStatus === "completed"
                ? "This stay has checked out. Guest Portal access is no longer eligible and any active credential is revoked."
                : bookingStatus === "cancelled" || bookingStatus === "no_show"
                  ? "This reservation is no longer eligible for Guest Portal access."
                  : "Guest Portal access becomes eligible after successful check-in."}
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <div><span className="text-muted-foreground">Guest</span><p className="font-medium">{access.data?.guestName}</p></div>
            <div><span className="text-muted-foreground">Reservation</span><p className="font-medium">{access.data?.reservationReference}</p></div>
            <div><span className="text-muted-foreground">Property / room</span><p className="font-medium">{access.data?.propertyName}{access.data?.roomName ? " · " + access.data.roomName : ""}</p></div>
            <div><span className="text-muted-foreground">Credential status</span><p className="font-medium capitalize">{access.data?.status?.replaceAll("_", " ")}</p></div>
            <div><span className="text-muted-foreground">Issued</span><p>{formatDate(access.data?.createdAt, access.data?.timezone)}</p></div>
            <div><span className="text-muted-foreground">Expires</span><p>{formatDate(access.data?.expiresAt, access.data?.timezone)}</p></div>
            <div><span className="text-muted-foreground">Issued by</span><p className="break-all">{access.data?.createdBy ?? "—"}</p></div>
            <div><span className="text-muted-foreground">Last portal access</span><p>{formatDate(access.data?.lastUsedAt, access.data?.timezone)}</p></div>
          </div>

          {active && !link && (
            <p className="rounded-md bg-muted/40 p-3 text-muted-foreground">
              A valid credential exists. For security, the original bearer URL cannot be recovered. Regenerate access to create and reveal a new link and QR code; the previous link will stop working.
            </p>
          )}

          {link && (
            <div className="grid gap-3 rounded-md border border-border bg-muted/20 p-3 sm:grid-cols-[160px_minmax(0,1fr)]">
              <div className="flex flex-col items-center gap-2">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="StayNas Guest Portal QR code" className="h-40 w-40 rounded bg-white p-1" />
                ) : (
                  <div className="flex h-40 w-40 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                    Generating QR…
                  </div>
                )}
                {qrDataUrl && (
                  <a href={qrDataUrl} download={`staynas-guest-portal-${bookingId}.png`} className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                    <Download className="h-3.5 w-3.5" /> Download QR PNG
                  </a>
                )}
              </div>
              <div className="min-w-0 space-y-2">
                <p className="text-xs text-muted-foreground">
                  This QR code encodes the exact same secure URL as the Copy Link action.
                </p>
                <p className="break-all font-mono text-xs">{link}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={copyLink}><Copy className="mr-1.5 h-3.5 w-3.5" />Copy link</Button>
                  <Button size="sm" variant="outline" onClick={shareLink}><Share2 className="mr-1.5 h-3.5 w-3.5" />Share</Button>
                  <Button size="sm" variant="outline" onClick={printCard} disabled={!qrDataUrl}><Printer className="mr-1.5 h-3.5 w-3.5" />Print card</Button>
                  <Button size="sm" variant="outline" asChild><a href={link} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Open portal</a></Button>
                </div>
              </div>
            </div>
          )}

          {bookingStatus === "checked_in" && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                const message = active
                  ? "Regenerate guest access? The previous link and QR code will be invalidated."
                  : "Generate a secure Guest Portal credential for this checked-in guest?";
                if (window.confirm(message)) issue.mutate();
              }}
              disabled={issue.isPending || revoke.isPending}
            >
              {issue.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
              {active ? "Regenerate access" : "Generate access"}
            </Button>
            {active && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (window.confirm("Revoke this guest's Guest Portal access immediately?")) revoke.mutate();
                }}
                disabled={revoke.isPending || issue.isPending}
              >
                {revoke.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="mr-1.5 h-3.5 w-3.5" />}
                Revoke access
              </Button>
            )}
          </div>
          )}

          <div className="border-t border-border pt-3">
            <p className="text-xs font-medium">Credential history</p>
            {access.data?.events?.length ? (
              <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                {access.data.events.map((event: { id: string; event_type: string; actor_id: string | null; created_at: string }) => (
                  <li key={event.id} className="flex flex-wrap justify-between gap-2">
                    <span className="capitalize">{event.event_type.replaceAll("_", " ")}{event.actor_id ? " · " + event.actor_id : ""}</span>
                    <time>{formatDate(event.created_at, access.data?.timezone)}</time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">No credential events recorded.</p>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Delivery: {access.data?.deliveryStatus ?? "not sent"}. Messaging delivery is available only when this property has an approved provider binding.
          </p>
          {!access.data?.multipleGuestAccess && (
            <p className="text-xs text-muted-foreground">
              Current reservation data supports one linked lead-guest identity. Separate registered-occupant credentials are not yet enabled.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
