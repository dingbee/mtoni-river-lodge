import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listBookingProductConfiguration,
  publishBookingProductConfiguration,
  saveBookingProductConfiguration,
} from "@/domains/booking/booking-product-configuration.functions";

type RoomOption = {
  id: string;
  name: string;
  max_occupancy: number;
  catalogue_type_id: string;
};

type PublicationOption = {
  id: string;
  name: string;
  currency: string;
  publication_number: number;
  room_type_assignments: Array<{ room_type_id: string }>;
};

type BookingProduct = {
  id: string;
  channel: "permanent" | "campaign";
  offer_name: string | null;
  campaign_slug: string | null;
  room_id: string;
  display_order: number;
  publication_status: "draft" | "published" | "paused" | "expired";
};

type BookingProductListData = {
  property: { currency: string };
  rooms: RoomOption[];
  publications: PublicationOption[];
  configurations: BookingProduct[];
};

export const Route = createFileRoute("/_authenticated/admin/booking-products")({
  head: () => ({
    meta: [
      { title: "Booking Products — StayNas" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: BookingProducts,
});

function BookingProducts() {
  const listFn = useServerFn(listBookingProductConfiguration);
  const saveFn = useServerFn(saveBookingProductConfiguration);
  const publishFn = useServerFn(publishBookingProductConfiguration);
  const queryClient = useQueryClient();
  const { data: rawData, isLoading, isError } = useQuery({
    queryKey: ["staynas.booking-products"],
    queryFn: () => listFn(),
  });
  const data = rawData as BookingProductListData | undefined;

  const [channel, setChannel] = useState<"permanent" | "campaign">("permanent");
  const [campaignSlug, setCampaignSlug] = useState("");
  const [roomId, setRoomId] = useState("");
  const [publicationId, setPublicationId] = useState("");
  const [offerName, setOfferName] = useState("");
  const [offerCode, setOfferCode] = useState("");
  const [description, setDescription] = useState("");
  const [displayOrder, setDisplayOrder] = useState("100");
  const [minimumStay, setMinimumStay] = useState("");
  const [maximumStay, setMaximumStay] = useState("");
  const [stayStartsOn, setStayStartsOn] = useState("");
  const [stayEndsOn, setStayEndsOn] = useState("");

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          roomId,
          publicationId,
          channel,
          campaignSlug: channel === "campaign" ? campaignSlug : null,
          offerName: channel === "campaign" ? offerName : undefined,
          offerCode: channel === "campaign" ? offerCode : undefined,
          offerDescription: description || undefined,
          displayOrder: Number(displayOrder),
          publicVisible: false,
          minimumStay: minimumStay ? Number(minimumStay) : null,
          maximumStay: maximumStay ? Number(maximumStay) : null,
          stayStartsOn: stayStartsOn || null,
          stayEndsOn: stayEndsOn || null,
        },
      }),
    onSuccess: () => {
      toast.success("Booking product saved as draft.");
      queryClient.invalidateQueries({ queryKey: ["staynas.booking-products"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const publish = useMutation({
    mutationFn: (id: string) => publishFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Booking product published.");
      queryClient.invalidateQueries({ queryKey: ["staynas.booking-products"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const selectedPublication = data?.publications.find((item) => item.id === publicationId);
  const assignedRoomTypes = selectedPublication?.room_type_assignments ?? [];
  const selectedRoom = data?.rooms.find((room) => room.id === roomId);
  const compatible = Boolean(
    selectedRoom &&
      assignedRoomTypes.some((assignment) => assignment.room_type_id === selectedRoom.catalogue_type_id),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Booking Products"
        description="Choose existing rooms and published rate plans for permanent booking and campaign offers. Inventory and pricing remain managed by their existing StayNas services."
      />
      <SectionCard
        title="Configure a booking product"
        description={
          data?.property
            ? "Property currency: " +
              data.property.currency +
              ". Prices are calculated by the published Pricing Engine snapshot."
            : ""
        }
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">
            Loading property rooms and published rate plans…
          </p>
        ) : isError ? (
          <p className="text-sm text-destructive">Booking configuration could not be loaded.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                Booking channel
                <select
                  className="w-full rounded-md border bg-background p-2"
                  value={channel}
                  onChange={(event) =>
                    setChannel(event.target.value as "permanent" | "campaign")
                  }
                >
                  <option value="permanent">Permanent /book</option>
                  <option value="campaign">Campaign offer</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                Room type
                <select
                  className="w-full rounded-md border bg-background p-2"
                  value={roomId}
                  onChange={(event) => setRoomId(event.target.value)}
                >
                  <option value="">Select an existing room</option>
                  {data?.rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name} · max {room.max_occupancy} guests
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                Published rate plan
                <select
                  className="w-full rounded-md border bg-background p-2"
                  value={publicationId}
                  onChange={(event) => setPublicationId(event.target.value)}
                >
                  <option value="">Select a published rate snapshot</option>
                  {data?.publications.map((publication) => (
                    <option key={publication.id} value={publication.id}>
                      {publication.name} · {publication.currency} · publication{" "}
                      {publication.publication_number}
                    </option>
                  ))}
                </select>
              </label>
              {channel === "campaign" && (
                <>
                  <label className="space-y-1 text-sm">
                    Campaign slug
                    <Input
                      value={campaignSlug}
                      onChange={(event) => setCampaignSlug(event.target.value)}
                      placeholder="summer-escape"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    Offer code
                    <Input
                      value={offerCode}
                      onChange={(event) => setOfferCode(event.target.value)}
                      placeholder="SUMMER-RACK"
                    />
                  </label>
                  <label className="space-y-1 text-sm sm:col-span-2">
                    Offer name
                    <Input
                      value={offerName}
                      onChange={(event) => setOfferName(event.target.value)}
                      placeholder="Summer stay offer"
                    />
                  </label>
                  <label className="space-y-1 text-sm sm:col-span-2">
                    Offer description
                    <Input
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    Stay starts on
                    <Input
                      type="date"
                      value={stayStartsOn}
                      onChange={(event) => setStayStartsOn(event.target.value)}
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    Stay ends on
                    <Input
                      type="date"
                      value={stayEndsOn}
                      onChange={(event) => setStayEndsOn(event.target.value)}
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    Minimum stay (nights)
                    <Input
                      type="number"
                      min="1"
                      value={minimumStay}
                      onChange={(event) => setMinimumStay(event.target.value)}
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    Maximum stay (nights)
                    <Input
                      type="number"
                      min="1"
                      value={maximumStay}
                      onChange={(event) => setMaximumStay(event.target.value)}
                    />
                  </label>
                </>
              )}
              <label className="space-y-1 text-sm">
                Display order
                <Input
                  type="number"
                  min="0"
                  value={displayOrder}
                  onChange={(event) => setDisplayOrder(event.target.value)}
                />
              </label>
            </div>
            {roomId && publicationId && !compatible && (
              <p className="mt-3 text-sm text-destructive">
                This published rate plan is not assigned to the selected room type. Select a compatible
                publication.
              </p>
            )}
            <div className="mt-4 flex justify-end">
              <Button
                disabled={
                  save.isPending ||
                  !roomId ||
                  !publicationId ||
                  !compatible ||
                  (channel === "campaign" && (!campaignSlug || !offerName || !offerCode))
                }
                onClick={() => save.mutate()}
              >
                {save.isPending ? "Saving…" : "Save as draft"}
              </Button>
            </div>
          </>
        )}
      </SectionCard>
      <SectionCard
        title="Configured booking products"
        description="Drafts do not appear publicly. Editing a published configuration returns it to draft and requires explicit republishing."
      >
        <div className="space-y-3">
          {(data?.configurations ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No booking products configured for this property yet.
            </p>
          ) : (
            (data?.configurations ?? []).map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div>
                  <p className="font-medium">
                    {item.channel === "permanent" ? "Permanent booking" : item.offer_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.campaign_slug ?? "/book"} · room {item.room_id.slice(0, 8)} · order{" "}
                    {item.display_order}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={item.publication_status === "published" ? "default" : "outline"}>
                    {item.publication_status}
                  </Badge>
                  {item.publication_status !== "published" && (
                    <Button
                      size="sm"
                      disabled={publish.isPending}
                      onClick={() => publish.mutate(item.id)}
                    >
                      Publish
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </SectionCard>
    </div>
  );
}
