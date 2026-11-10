import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, ExternalLink, Loader2, RefreshCw, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getGuestPortalAccessStatus,
  issueGuestPortalAccess,
  revokeGuestPortalAccess,
} from "./guest-portal.functions";

export function GuestPortalAccessPanel({
  bookingId,
  bookingStatus,
}: {
  bookingId: string;
  bookingStatus: string;
}) {
  const qc = useQueryClient();
  const [link, setLink] = useState<string | null>(null);
  const statusFn = useServerFn(getGuestPortalAccessStatus);
  const issueFn = useServerFn(issueGuestPortalAccess);
  const revokeFn = useServerFn(revokeGuestPortalAccess);

  const access = useQuery({
    queryKey: ["guest-portal-access", bookingId],
    queryFn: () => statusFn({ data: { bookingId } }),
    enabled: bookingStatus === "checked_in",
  });

  const issue = useMutation({
    mutationFn: () => issueFn({ data: { bookingId } }),
    onSuccess: (result) => {
      setLink(window.location.origin + "/guest/" + result.token);
      toast.success("In-stay guest access created");
      qc.invalidateQueries({ queryKey: ["guest-portal-access", bookingId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revoke = useMutation({
    mutationFn: () => revokeFn({ data: { bookingId } }),
    onSuccess: () => {
      setLink(null);
      toast.success("Guest portal access revoked");
      qc.invalidateQueries({ queryKey: ["guest-portal-access", bookingId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="mt-4 rounded-lg border border-border p-4 text-sm">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <p className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
          In-stay guest portal
        </p>
      </div>

      {bookingStatus !== "checked_in" ? (
        <p className="mt-2 text-muted-foreground">
          Guest access can be issued after Front Desk records the guest as checked in.
        </p>
      ) : access.isLoading ? (
        <p className="mt-2 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking access…
        </p>
      ) : access.error ? (
        <p className="mt-2 text-destructive">{(access.error as Error).message}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {access.data?.active ? (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Access active.</span> The bearer link is
              shown only when first issued. Rotate it if the guest needs a new link.
              {access.data.expiresAt
                ? " Expires " + new Date(access.data.expiresAt).toLocaleString() + "."
                : ""}
            </p>
          ) : (
            <p className="text-muted-foreground">
              No active in-stay guest access credential exists for this booking.
            </p>
          )}

          {link && (
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                Share this private link directly with the checked-in guest. It grants access to this
                booking only.
              </p>
              <p className="mt-2 break-all font-mono text-xs">{link}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(link);
                    toast.success("Guest portal link copied");
                  }}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy link
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={link} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open portal
                  </a>
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => issue.mutate()}
              disabled={issue.isPending || revoke.isPending}
            >
              {issue.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              {access.data?.active ? "Rotate access link" : "Create guest portal link"}
            </Button>
            {access.data?.active && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => revoke.mutate()}
                disabled={revoke.isPending || issue.isPending}
              >
                {revoke.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShieldOff className="mr-1.5 h-3.5 w-3.5" />
                )}
                Revoke access
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
