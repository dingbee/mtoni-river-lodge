import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Camera,
  CheckCircle2,
  Clock3,
  ConciergeBell,
  ImagePlus,
  Loader2,
  MessageCircle,
  Send,
  ShieldAlert,
  Upload,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  createGuestRequestPhotoUpload,
  finalizeGuestRequestPhotoUpload,
  getGuestPortalSnapshot,
  guestPortalConciergeChat,
  submitGuestPortalRequest,
} from "./guest-portal.functions";
import {
  GUEST_PORTAL_MAX_PHOTOS,
  guestPortalCategories,
  guestRequestStatusLabel,
  validateGuestPortalPhotoMeta,
  type GuestPortalRequestType,
} from "./guest-portal.shared";

type Tab = "stay" | "service" | "issue" | "requests" | "assistance";

const CATEGORY_LABELS: Record<string, string> = {
  housekeeping: "Housekeeping",
  room_service: "Room service",
  dining: "Dining",
  airport_transfer: "Transport",
  maintenance: "Maintenance",
  special_occasion: "Special occasion",
  private_dining: "Private dining",
  complaint: "Complaint",
  service_recovery: "Service recovery",
  other: "Other assistance",
};

function dateText(value: string) {
  return new Date(value + "T12:00:00").toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function timeText(value: string) {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function GuestPortalPage({ token }: { token: string }) {
  const qc = useQueryClient();
  const snapshotFn = useServerFn(getGuestPortalSnapshot);
  const submitFn = useServerFn(submitGuestPortalRequest);
  const createUploadFn = useServerFn(createGuestRequestPhotoUpload);
  const finalizeUploadFn = useServerFn(finalizeGuestRequestPhotoUpload);
  const chatFn = useServerFn(guestPortalConciergeChat);

  const [tab, setTab] = useState<Tab>("stay");
  const [requestType, setRequestType] = useState<GuestPortalRequestType>("service");
  const [category, setCategory] = useState("housekeeping");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [urgency, setUrgency] = useState<"normal" | "urgent">("normal");
  const [files, setFiles] = useState<File[]>([]);
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());
  const [photoRetryRequestId, setPhotoRetryRequestId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<
    Array<{ role: "guest" | "assistant"; text: string; escalated?: boolean }>
  >([]);

  const snapshot = useQuery({
    queryKey: ["guest-portal", token],
    queryFn: () => snapshotFn({ data: { token } }),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const categories = guestPortalCategories(requestType);
  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  );
  useEffect(
    () => () => previews.forEach((preview) => URL.revokeObjectURL(preview.url)),
    [previews],
  );

  useEffect(() => {
    if (!categories.includes(category)) setCategory(categories[0] ?? "other");
  }, [requestType, category, categories]);

  async function uploadSelectedPhotos(requestId: string) {
    for (const file of files) {
      const signed = await createUploadFn({
        data: {
          token,
          requestId,
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
        },
      });
      const { error } = await supabase.storage
        .from("guest-request-evidence")
        .uploadToSignedUrl(signed.path, signed.token, file, {
          contentType: file.type,
          upsert: false,
        });
      if (error)
        throw new Error(
          "Your request was received, but a photograph could not be uploaded. Retry the remaining photographs.",
        );
      await finalizeUploadFn({
        data: {
          token,
          requestId,
          path: signed.path,
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
        },
      });
      setFiles((current) => current.filter((candidate) => candidate !== file));
    }
  }

  const submit = useMutation({
    mutationFn: async () => {
      const row = await submitFn({
        data: {
          token,
          submissionId,
          requestType,
          category: category as never,
          description,
          instructions,
          urgency,
        },
      });
      setPhotoRetryRequestId(row.id);
      if (files.length) await uploadSelectedPhotos(row.id);
      return row;
    },
    onSuccess: (row) => {
      toast.success("Request " + row.id.slice(0, 8).toUpperCase() + " received");
      setDescription("");
      setInstructions("");
      setUrgency("normal");
      setFiles([]);
      setSubmissionId(crypto.randomUUID());
      setPhotoRetryRequestId(null);
      setTab("requests");
      qc.invalidateQueries({ queryKey: ["guest-portal", token] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const retryPhotos = useMutation({
    mutationFn: () => {
      if (!photoRetryRequestId) throw new Error("There is no request awaiting photographs.");
      return uploadSelectedPhotos(photoRetryRequestId);
    },
    onSuccess: () => {
      setFiles([]);
      setPhotoRetryRequestId(null);
      toast.success("Photographs attached successfully");
      qc.invalidateQueries({ queryKey: ["guest-portal", token] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const chat = useMutation({
    mutationFn: (message: string) => chatFn({ data: { token, message } }),
    onSuccess: (reply, message) => {
      setChatMessages((current) => [
        ...current,
        { role: "guest", text: message },
        {
          role: "assistant",
          text: reply.message.content,
          escalated: Boolean(reply.message.escalated || reply.escalation),
        },
      ]);
      setChatInput("");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function addPhotos(fileList: FileList | null) {
    if (!fileList?.length) return;
    const selected = Array.from(fileList);
    if (files.length + selected.length > GUEST_PORTAL_MAX_PHOTOS) {
      toast.error("You can attach up to " + GUEST_PORTAL_MAX_PHOTOS + " photographs per request.");
      return;
    }
    const invalid = selected
      .map((file) => validateGuestPortalPhotoMeta(file.name, file.type, file.size))
      .find(Boolean);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setFiles((current) => current.concat(selected));
  }

  if (snapshot.isLoading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-5">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Securely opening your stay…
        </p>
      </main>
    );
  }

  if (snapshot.error || !snapshot.data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center px-5">
        <div className="w-full rounded-2xl border border-border bg-card p-6 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-3 font-display text-2xl">Guest access unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {(snapshot.error as Error)?.message ??
              "This link is invalid, expired or no longer active."}
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Please contact the property reception team for a new access link.
          </p>
        </div>
      </main>
    );
  }

  const data = snapshot.data;
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "stay", label: "My Stay" },
    { id: "service", label: "Request a Service" },
    { id: "issue", label: "Report an Issue" },
    { id: "requests", label: "My Requests" },
    { id: "assistance", label: "Guest Assistance" },
  ];

  return (
    <main className="min-h-screen bg-muted/20 pb-12">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            StayNas Guest Portal
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl">{data.property.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Welcome, {data.booking.guestName}. Your in-stay services and assistance.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Booking </span>
              <span className="font-mono font-semibold">{data.booking.reference}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-3 py-5 sm:px-6">
        <nav
          className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-3"
          aria-label="Guest portal sections"
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={
                "shrink-0 rounded-full border px-4 py-2 text-xs font-medium transition " +
                (tab === item.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground")
              }
            >
              {item.label}
              {item.id === "requests" && data.requests.length > 0
                ? " (" + data.requests.length + ")"
                : ""}
            </button>
          ))}
        </nav>

        {tab === "stay" && (
          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
                Your room
              </p>
              <h2 className="mt-2 font-display text-2xl">{data.booking.roomName}</h2>
              {data.booking.unitLabel && (
                <p className="text-sm text-muted-foreground">Room {data.booking.unitLabel}</p>
              )}
              <p className="mt-4 text-sm text-muted-foreground">Booking reference</p>
              <p className="font-mono text-sm">{data.booking.reference}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
                Your stay dates
              </p>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Arrival</p>
                  <p className="mt-1 font-display text-xl">{dateText(data.booking.checkIn)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Departure</p>
                  <p className="mt-1 font-display text-xl">{dateText(data.booking.checkOut)}</p>
                </div>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                {data.booking.adults} adult{data.booking.adults === 1 ? "" : "s"} ·{" "}
                {data.booking.children} child{data.booking.children === 1 ? "" : "ren"}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 md:col-span-2">
              <div className="flex items-center gap-2">
                <ConciergeBell className="h-5 w-5 text-muted-foreground" />
                <h2 className="font-display text-xl">During your stay</h2>
              </div>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Request housekeeping, room service, dining or transport. Report a room problem with
                photographs, then follow the actual progress here.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => setTab("service")}>Request a service</Button>
                <Button variant="outline" onClick={() => setTab("issue")}>
                  Report an issue
                </Button>
                <Button variant="ghost" onClick={() => setTab("assistance")}>
                  Ask AI Concierge
                </Button>
              </div>
            </div>
          </section>
        )}

        {(tab === "service" || tab === "issue") && (
          <section className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="flex items-center gap-2">
              {tab === "service" ? (
                <ConciergeBell className="h-5 w-5" />
              ) : (
                <Wrench className="h-5 w-5" />
              )}
              <h2 className="font-display text-2xl">
                {tab === "service" ? "Request a Service" : "Report an Issue"}
              </h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {tab === "service"
                ? "Tell the property team what you need. Your request will be recorded against this stay."
                : "Describe the problem and attach photographs if they will help the team understand it."}
            </p>

            <form
              className="mt-5 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                submit.mutate();
              }}
            >
              <div>
                <label className="text-sm font-medium" htmlFor="guest-request-category">
                  Category
                </label>
                <select
                  id="guest-request-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-3 text-sm"
                >
                  {categories.map((item) => (
                    <option key={item} value={item}>
                      {CATEGORY_LABELS[item] ?? item}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium" htmlFor="guest-request-description">
                  What do you need?
                </label>
                <textarea
                  id="guest-request-description"
                  required
                  minLength={3}
                  maxLength={1500}
                  rows={4}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={
                    tab === "service"
                      ? "Describe the service you would like…"
                      : "Describe what happened or what needs attention…"
                  }
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-3 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium" htmlFor="guest-request-instructions">
                  Additional instructions (optional)
                </label>
                <textarea
                  id="guest-request-instructions"
                  rows={2}
                  maxLength={500}
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                  placeholder="Preferred time, details or anything the team should know…"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-3 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium" htmlFor="guest-request-urgency">
                  Priority
                </label>
                <select
                  id="guest-request-urgency"
                  value={urgency}
                  onChange={(event) => setUrgency(event.target.value as "normal" | "urgent")}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-3 text-sm"
                >
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent — please review promptly</option>
                </select>
              </div>

              <div className="rounded-xl border border-dashed border-border p-4">
                <div className="flex items-center gap-2">
                  <ImagePlus className="h-5 w-5 text-muted-foreground" />
                  <p className="text-sm font-medium">Photographs (optional)</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add up to {GUEST_PORTAL_MAX_PHOTOS} JPEG, PNG or WebP images. Maximum 8 MB each.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted">
                    <Camera className="h-4 w-4" /> Take photo
                    <input
                      className="sr-only"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      onChange={(event) => {
                        addPhotos(event.target.files);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted">
                    <Upload className="h-4 w-4" /> Choose photos
                    <input
                      className="sr-only"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      onChange={(event) => {
                        addPhotos(event.target.files);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>
                {previews.length > 0 && (
                  <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {previews.map(({ file, url }) => (
                      <div
                        key={file.name + file.lastModified}
                        className="relative overflow-hidden rounded-lg border border-border"
                      >
                        <img
                          src={url}
                          alt={file.name}
                          className="aspect-square w-full object-cover"
                        />
                        <div className="p-1">
                          <p className="truncate text-[10px] text-muted-foreground">{file.name}</p>
                          <button
                            type="button"
                            className="text-[10px] font-medium text-destructive"
                            onClick={() =>
                              setFiles((current) =>
                                current.filter((candidate) => candidate !== file),
                              )
                            }
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {photoRetryRequestId && files.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                  Your request has been recorded. Some photographs still need uploading.
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => retryPhotos.mutate()}
                    disabled={retryPhotos.isPending}
                  >
                    {retryPhotos.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-4 w-4" />
                    )}
                    Retry photo upload
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Your request is linked to booking {data.booking.reference}.
                </p>
                <Button
                  type="submit"
                  disabled={
                    submit.isPending || retryPhotos.isPending || description.trim().length < 3
                  }
                >
                  {submit.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Submit request
                </Button>
              </div>
            </form>
          </section>
        )}

        {tab === "requests" && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-2xl">My Requests</h2>
                <p className="text-sm text-muted-foreground">
                  Progress refreshes automatically while this portal is open.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void snapshot.refetch()}>
                <Clock3 className="mr-2 h-4 w-4" /> Refresh
              </Button>
            </div>
            {data.requests.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-8 text-center">
                <MessageCircle className="mx-auto h-7 w-7 text-muted-foreground" />
                <p className="mt-3 font-medium">No requests yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your service requests and issue reports will appear here.
                </p>
              </div>
            ) : (
              data.requests.map((request) => (
                <article key={request.id} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                        {CATEGORY_LABELS[request.category] ?? request.category}
                      </p>
                      <h3 className="mt-1 font-medium">{request.requestText}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Reference {request.id.slice(0, 8).toUpperCase()} · Received{" "}
                        {timeText(request.createdAt)}
                      </p>
                    </div>
                    <span className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-semibold">
                      {guestRequestStatusLabel(request.status)}
                    </span>
                  </div>
                  {request.statusNote && (
                    <p className="mt-3 rounded-lg bg-muted/40 p-3 text-sm">{request.statusNote}</p>
                  )}
                  {request.attachments?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {request.attachments.map((attachment, index: number) => (
                        <a
                          key={index}
                          href={attachment.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted"
                        >
                          <ImagePlus className="h-4 w-4" /> {attachment.fileName}
                        </a>
                      ))}
                    </div>
                  )}
                  {request.statusHistory?.length > 0 && (
                    <ol className="mt-4 space-y-2 border-l border-border pl-4">
                      {request.statusHistory.map((event, index: number) => (
                        <li key={index} className="relative text-xs">
                          <span className="absolute -left-[1.32rem] top-1 h-2 w-2 rounded-full bg-primary" />
                          <span className="font-medium">
                            {guestRequestStatusLabel(event.status)}
                          </span>
                          <span className="ml-2 text-muted-foreground">
                            {timeText(event.occurredAt)}
                          </span>
                          {event.note && <p className="mt-1 text-muted-foreground">{event.note}</p>}
                        </li>
                      ))}
                    </ol>
                  )}
                </article>
              ))
            )}
          </section>
        )}

        {tab === "assistance" && (
          <section className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <ConciergeBell className="h-5 w-5" />
              <h2 className="font-display text-2xl">AI Concierge</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Ask about services during your stay or get help describing a request. The Concierge
              receives this property's context and your authorized stay context.
            </p>
            <div className="mt-4 min-h-40 space-y-3 rounded-xl bg-muted/30 p-3">
              {chatMessages.length === 0 && (
                <p className="text-sm text-muted-foreground">How can we help during your stay?</p>
              )}
              {chatMessages.map((message, index) => (
                <div
                  key={index}
                  className={
                    "max-w-[90%] rounded-xl px-3 py-2 text-sm " +
                    (message.role === "guest"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "mr-auto bg-card")
                  }
                >
                  {message.text}
                  {message.escalated && (
                    <p className="mt-2 text-xs font-medium">
                      A human team member may need to follow up. You can also submit a request to
                      the property team.
                    </p>
                  )}
                </div>
              ))}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (chatInput.trim()) chat.mutate(chatInput.trim());
              }}
            >
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Ask the AI Concierge…"
                maxLength={1000}
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-3 text-sm"
              />
              <Button type="submit" disabled={chat.isPending || !chatInput.trim()}>
                {chat.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-sm font-medium">Prefer a person?</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Send the property team a service-recovery or assistance request.
              </p>
              <Button
                className="mt-2"
                size="sm"
                variant="outline"
                onClick={() => {
                  setRequestType("issue");
                  setCategory("service_recovery");
                  setTab("issue");
                }}
              >
                <MessageCircle className="mr-2 h-4 w-4" /> Request human assistance
              </Button>
            </div>
          </section>
        )}

        <footer className="mt-8 flex items-center justify-center gap-2 text-center text-[11px] text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Private access to this reservation · Link expires {timeText(data.accessExpiresAt)}
        </footer>
      </div>
    </main>
  );
}
