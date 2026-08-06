import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAdminMutation } from "@/hooks/use-admin-mutation";
import { addArrivalStaffNote, reviewStaffCheckIn } from "../services/arrivals.functions";
import type { ReviewAction } from "../services/arrivals-shared";

export function StaffReviewActions({
  bookingId,
  hasCheckIn,
  canOverride,
}: {
  bookingId: string;
  hasCheckIn: boolean;
  canOverride: boolean;
}) {
  const queryClient = useQueryClient();
  const review = useServerFn(reviewStaffCheckIn);
  const addNote = useServerFn(addArrivalStaffNote);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["staff-arrival-detail", bookingId] });
    void queryClient.invalidateQueries({ queryKey: ["staff-arrivals"] });
  };

  const reviewMutation = useAdminMutation({
    mutationFn: (action: ReviewAction) =>
      review({ data: { bookingId, action, reason: reason.trim() || undefined } }),
    loadingMessage: "Updating check-in…",
    successMessage: "Check-in updated",
    onSuccess: () => {
      setReason("");
      invalidate();
    },
  });

  const noteMutation = useAdminMutation({
    mutationFn: () => addNote({ data: { bookingId, body: note.trim() } }),
    loadingMessage: "Saving note…",
    successMessage: "Note added to the guest profile",
    onSuccess: () => {
      setNote("");
      invalidate();
    },
  });

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Textarea
          rows={2}
          placeholder="Reason shown in the audit trail (required to reject or request corrections)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!hasCheckIn || reviewMutation.isPending}
            onClick={() => reviewMutation.mutate("approve")}
          >
            Approve check-in
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={!hasCheckIn || reviewMutation.isPending}
            onClick={() => reviewMutation.mutate("reject")}
          >
            Reject
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!hasCheckIn || reviewMutation.isPending}
            onClick={() => reviewMutation.mutate("request_corrections")}
          >
            Request corrections
          </Button>
          {canOverride && (
            <Button
              size="sm"
              variant="ghost"
              disabled={!hasCheckIn || reviewMutation.isPending}
              onClick={() => reviewMutation.mutate("reopen")}
            >
              Reopen for review
            </Button>
          )}
        </div>
        {!hasCheckIn && (
          <p className="text-xs text-muted-foreground">
            No online check-in submission exists for this reservation yet.
          </p>
        )}
      </div>

      <div className="space-y-2 border-t pt-4">
        <Textarea
          rows={2}
          placeholder="Add a staff note to the guest profile"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={note.trim().length < 2 || noteMutation.isPending}
          onClick={() => noteMutation.mutate()}
        >
          Add note
        </Button>
      </div>
    </div>
  );
}
