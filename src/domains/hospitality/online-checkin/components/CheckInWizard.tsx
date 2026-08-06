import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckInStepper } from "./CheckInStepper";
import {
  arrivalInfoSchema,
  fetchCheckInSummary,
  guestInfoSchema,
  submitCheckIn,
  verifyCheckIn,
  type ArrivalInfoValues,
  type GuestInfoValues,
  type VerifiedCheckIn,
} from "../services/checkin-client";

const emptyArrival: ArrivalInfoValues = {
  arrival_date: "",
  estimated_arrival_time: "",
  arrival_mode: "",
  flight_number: "",
  airport: "",
  transfer_required: false,
  transfer_notes: "",
  visit_purpose: "",
  dietary_requirements: "",
  accessibility_needs: "",
  special_requests: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  emergency_contact_relation: "",
};

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function CheckInWizard({ token }: { token: string }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState("");
  const [verified, setVerified] = useState<VerifiedCheckIn | null>(null);
  const [guest, setGuest] = useState<GuestInfoValues | null>(null);
  const [arrival, setArrival] = useState<ArrivalInfoValues>(emptyArrival);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const summaryQuery = useQuery({
    queryKey: ["checkin-summary", token],
    queryFn: () => fetchCheckInSummary(token),
    retry: false,
  });

  const verifyMutation = useMutation({
    mutationFn: () => verifyCheckIn(token, answer),
    onSuccess: (data) => {
      setVerified(data);
      setGuest({
        full_name: data.booking.guest_name ?? "",
        email: data.booking.guest_email ?? "",
        phone: data.booking.guest_phone ?? "",
        country: data.booking.country ?? "",
        adults: data.booking.adults ?? 1,
        children: data.booking.children ?? 0,
        signature_name: "",
      });
      setArrival((prev) => ({ ...prev, arrival_date: data.booking.check_in }));
      setErrors({});
      setStep(1);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      submitCheckIn({ token, answer, guest: guest as GuestInfoValues, arrival, final: true }),
    onSuccess: () => {
      toast.success("Check-in submitted");
      void navigate({ to: "/check-in/success" });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (summaryQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const summary = summaryQuery.data;
  const expired =
    !!summary && (summary.status === "expired" || new Date(summary.expires_at) <= new Date());

  if (summaryQuery.isError || !summary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check-in link not recognised</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Please use the link from your confirmation email, or contact reception for a new one.
        </CardContent>
      </Card>
    );
  }

  if (expired) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>This check-in link has expired</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Reservation {summary.reference}. Please contact reception and we will send a fresh link.
        </CardContent>
      </Card>
    );
  }

  const alreadyDone = ["submitted", "under_review", "approved"].includes(summary.status);
  if (alreadyDone) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check-in already submitted</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          We have your details for reservation {summary.reference}. Reception will confirm before
          you arrive.
        </CardContent>
      </Card>
    );
  }

  function validateGuest() {
    const parsed = guestInfoSchema.safeParse(guest);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message;
      setErrors(next);
      return false;
    }
    setGuest(parsed.data);
    setErrors({});
    return true;
  }

  function validateArrival() {
    const parsed = arrivalInfoSchema.safeParse(arrival);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message;
      setErrors(next);
      return false;
    }
    setArrival(parsed.data);
    setErrors({});
    return true;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
            Online check-in
          </p>
          <h1 className="mt-2 font-display text-3xl text-foreground">
            Reservation {summary.reference}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {summary.room_name} · {summary.check_in} → {summary.check_out} · {summary.nights} night
            {summary.nights === 1 ? "" : "s"}
          </p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <ShieldCheck className="h-3.5 w-3.5" /> Secure link
        </Badge>
      </div>

      <CheckInStepper current={step} />

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Verify your reservation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              For your security, confirm the email address on the booking ({summary.email_hint}) or
              the lead guest surname ({summary.surname_hint}).
            </p>
            <Field label="Email or surname" htmlFor="verify-answer">
              <Input
                id="verify-answer"
                value={answer}
                maxLength={255}
                autoComplete="off"
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <Button
              onClick={() => verifyMutation.mutate()}
              disabled={answer.trim().length < 2 || verifyMutation.isPending}
            >
              {verifyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Continue
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 1 && guest && (
        <Card>
          <CardHeader>
            <CardTitle>Guest information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" htmlFor="full_name" error={errors.full_name}>
                <Input
                  id="full_name"
                  value={guest.full_name}
                  maxLength={120}
                  onChange={(e) => setGuest({ ...guest, full_name: e.target.value })}
                />
              </Field>
              <Field label="Email" htmlFor="email" error={errors.email}>
                <Input
                  id="email"
                  type="email"
                  value={guest.email}
                  maxLength={255}
                  onChange={(e) => setGuest({ ...guest, email: e.target.value })}
                />
              </Field>
              <Field label="Phone" htmlFor="phone" error={errors.phone}>
                <Input
                  id="phone"
                  value={guest.phone ?? ""}
                  maxLength={40}
                  onChange={(e) => setGuest({ ...guest, phone: e.target.value })}
                />
              </Field>
              <Field label="Country" htmlFor="country" error={errors.country}>
                <Input
                  id="country"
                  value={guest.country ?? ""}
                  maxLength={80}
                  onChange={(e) => setGuest({ ...guest, country: e.target.value })}
                />
              </Field>
              <Field label="Adults" htmlFor="adults" error={errors.adults}>
                <Input
                  id="adults"
                  type="number"
                  min={1}
                  max={10}
                  value={guest.adults}
                  onChange={(e) => setGuest({ ...guest, adults: Number(e.target.value) })}
                />
              </Field>
              <Field label="Children" htmlFor="children" error={errors.children}>
                <Input
                  id="children"
                  type="number"
                  min={0}
                  max={10}
                  value={guest.children}
                  onChange={(e) => setGuest({ ...guest, children: Number(e.target.value) })}
                />
              </Field>
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button onClick={() => validateGuest() && setStep(2)}>Continue</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Arrival details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Arrival date" htmlFor="arrival_date" error={errors.arrival_date}>
                <Input
                  id="arrival_date"
                  type="date"
                  value={arrival.arrival_date ?? ""}
                  onChange={(e) => setArrival({ ...arrival, arrival_date: e.target.value })}
                />
              </Field>
              <Field
                label="Estimated arrival time"
                htmlFor="estimated_arrival_time"
                error={errors.estimated_arrival_time}
              >
                <Input
                  id="estimated_arrival_time"
                  type="time"
                  value={arrival.estimated_arrival_time ?? ""}
                  onChange={(e) =>
                    setArrival({ ...arrival, estimated_arrival_time: e.target.value })
                  }
                />
              </Field>
              <Field label="Arriving by" htmlFor="arrival_mode" error={errors.arrival_mode}>
                <Input
                  id="arrival_mode"
                  placeholder="Flight, road transfer, own car"
                  value={arrival.arrival_mode ?? ""}
                  maxLength={40}
                  onChange={(e) => setArrival({ ...arrival, arrival_mode: e.target.value })}
                />
              </Field>
              <Field label="Flight number" htmlFor="flight_number" error={errors.flight_number}>
                <Input
                  id="flight_number"
                  value={arrival.flight_number ?? ""}
                  maxLength={30}
                  onChange={(e) => setArrival({ ...arrival, flight_number: e.target.value })}
                />
              </Field>
              <Field label="Airport" htmlFor="airport" error={errors.airport}>
                <Input
                  id="airport"
                  placeholder="JRO / ARK"
                  value={arrival.airport ?? ""}
                  maxLength={80}
                  onChange={(e) => setArrival({ ...arrival, airport: e.target.value })}
                />
              </Field>
              <Field label="Purpose of visit" htmlFor="visit_purpose" error={errors.visit_purpose}>
                <Input
                  id="visit_purpose"
                  placeholder="Safari, Kilimanjaro climb, leisure"
                  value={arrival.visit_purpose ?? ""}
                  maxLength={120}
                  onChange={(e) => setArrival({ ...arrival, visit_purpose: e.target.value })}
                />
              </Field>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm text-foreground">Airport transfer required</p>
                <p className="text-xs text-muted-foreground">
                  Our team will confirm timing and pricing with you.
                </p>
              </div>
              <Switch
                checked={arrival.transfer_required}
                onCheckedChange={(v) => setArrival({ ...arrival, transfer_required: v })}
                aria-label="Airport transfer required"
              />
            </div>

            <Field label="Dietary requirements" htmlFor="dietary_requirements">
              <Textarea
                id="dietary_requirements"
                maxLength={500}
                value={arrival.dietary_requirements ?? ""}
                onChange={(e) => setArrival({ ...arrival, dietary_requirements: e.target.value })}
              />
            </Field>
            <Field label="Accessibility needs" htmlFor="accessibility_needs">
              <Textarea
                id="accessibility_needs"
                maxLength={500}
                value={arrival.accessibility_needs ?? ""}
                onChange={(e) => setArrival({ ...arrival, accessibility_needs: e.target.value })}
              />
            </Field>
            <Field label="Anything else we should prepare?" htmlFor="special_requests">
              <Textarea
                id="special_requests"
                maxLength={1000}
                value={arrival.special_requests ?? ""}
                onChange={(e) => setArrival({ ...arrival, special_requests: e.target.value })}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Emergency contact" htmlFor="emergency_contact_name">
                <Input
                  id="emergency_contact_name"
                  maxLength={120}
                  value={arrival.emergency_contact_name ?? ""}
                  onChange={(e) =>
                    setArrival({ ...arrival, emergency_contact_name: e.target.value })
                  }
                />
              </Field>
              <Field label="Contact phone" htmlFor="emergency_contact_phone">
                <Input
                  id="emergency_contact_phone"
                  maxLength={40}
                  value={arrival.emergency_contact_phone ?? ""}
                  onChange={(e) =>
                    setArrival({ ...arrival, emergency_contact_phone: e.target.value })
                  }
                />
              </Field>
              <Field label="Relationship" htmlFor="emergency_contact_relation">
                <Input
                  id="emergency_contact_relation"
                  maxLength={60}
                  value={arrival.emergency_contact_relation ?? ""}
                  onChange={(e) =>
                    setArrival({ ...arrival, emergency_contact_relation: e.target.value })
                  }
                />
              </Field>
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={() => validateArrival() && setStep(3)}>Review</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && guest && verified && (
        <Card>
          <CardHeader>
            <CardTitle>Review and confirm</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <ReviewGroup
              title="Stay"
              rows={[
                ["Reservation", verified.booking.reference],
                ["Room", verified.booking.room_name],
                ["Dates", `${verified.booking.check_in} → ${verified.booking.check_out}`],
              ]}
            />
            <ReviewGroup
              title="Guest"
              rows={[
                ["Name", guest.full_name],
                ["Email", guest.email],
                ["Phone", guest.phone || "—"],
                ["Country", guest.country || "—"],
                ["Party", `${guest.adults} adults · ${guest.children} children`],
              ]}
            />
            <ReviewGroup
              title="Arrival"
              rows={[
                ["Date", arrival.arrival_date || "—"],
                ["Time", arrival.estimated_arrival_time || "—"],
                ["Arriving by", arrival.arrival_mode || "—"],
                ["Flight", arrival.flight_number || "—"],
                ["Airport transfer", arrival.transfer_required ? "Requested" : "Not required"],
                ["Dietary", arrival.dietary_requirements || "—"],
                ["Accessibility", arrival.accessibility_needs || "—"],
                ["Notes", arrival.special_requests || "—"],
                [
                  "Emergency contact",
                  arrival.emergency_contact_name
                    ? `${arrival.emergency_contact_name} · ${arrival.emergency_contact_phone || "—"}`
                    : "—",
                ],
              ]}
            />
            <Field label="Type your full name to sign" htmlFor="signature_name">
              <Input
                id="signature_name"
                maxLength={120}
                value={guest.signature_name ?? ""}
                onChange={(e) => setGuest({ ...guest, signature_name: e.target.value })}
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              By submitting you confirm these details are correct and accept the lodge house rules.
              Identity documents are collected at reception on arrival.
            </p>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button
                onClick={() => submitMutation.mutate()}
                disabled={
                  submitMutation.isPending ||
                  (guest.signature_name ?? "").trim().length < 2
                }
              >
                {submitMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit check-in
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ReviewGroup({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{title}</p>
      <dl className="mt-2 divide-y divide-border rounded-lg border border-border">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-4 px-3 py-2 text-sm">
            <dt className="w-40 shrink-0 text-muted-foreground">{label}</dt>
            <dd className="text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}