import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listBookingProductConfiguration, saveBookingProductConfiguration, publishBookingProductConfiguration } from "@/domains/booking/booking-product-configuration.functions";

export const Route = createFileRoute("/_authenticated/admin/booking-products")({
  head: () => ({ meta: [{ title: "Booking Products — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: BookingProducts,
});

function BookingProducts() {
  const listFn=useServerFn(listBookingProductConfiguration);
  const saveFn=useServerFn(saveBookingProductConfiguration);
  const publishFn=useServerFn(publishBookingProductConfiguration);
  const qc=useQueryClient();
  const {data,isLoading,isError}=useQuery({queryKey:["staynas.booking-products"],queryFn:()=>listFn()});
  const [channel,setChannel]=useState<"permanent"|"campaign">("permanent");
  const [campaignSlug,setCampaignSlug]=useState("");
  const [roomId,setRoomId]=useState("");
  const [publicationId,setPublicationId]=useState("");
  const [offerName,setOfferName]=useState("");
  const [offerCode,setOfferCode]=useState("");
  const [description,setDescription]=useState("");
  const [order,setOrder]=useState("100");
  const [minimumStay,setMinimumStay]=useState("");
  const [maximumStay,setMaximumStay]=useState("");
  const [stayStartsOn,setStayStartsOn]=useState("");
  const [stayEndsOn,setStayEndsOn]=useState("");
  const save=useMutation({mutationFn:()=>saveFn({data:{
    roomId,publicationId,channel,campaignSlug:channel==="campaign"?campaignSlug:null,
    offerName:channel==="campaign"?offerName:undefined,offerCode:channel==="campaign"?offerCode:undefined,
    offerDescription:description||undefined,displayOrder:Number(order),publicVisible:false,
    minimumStay:minimumStay?Number(minimumStay):null,maximumStay:maximumStay?Number(maximumStay):null,
    stayStartsOn:stayStartsOn||null,stayEndsOn:stayEndsOn||null,
  }}),onSuccess:()=>{toast.success("Booking product saved as draft.");qc.invalidateQueries({queryKey:["staynas.booking-products"]});},onError:(e)=>toast.error(e.message)});
  const publish=useMutation({mutationFn:(id:string)=>publishFn({data:{id}}),onSuccess:()=>{toast.success("Booking product published.");qc.invalidateQueries({queryKey:["staynas.booking-products"]});},onError:(e)=>toast.error(e.message)});
  const selectedPublication=data?.publications.find((p:any)=>p.id===publicationId);
  const assignedRoomTypes=selectedPublication?.room_type_assignments??[];
  const validRoom=data?.rooms.find((r:any)=>r.id===roomId);
  const compatible=Boolean(validRoom&&assignedRoomTypes.some((x:any)=>x.room_type_id===validRoom.catalogue_type_id));
  return <div className="space-y-6">
    <PageHeader title="Booking Products" description="Choose existing rooms and published rate plans for permanent booking and campaign offers. Inventory and pricing remain managed by their existing StayNas services." />
    <SectionCard title="Configure a booking product" description={data?.property ? "Property currency: "+data.property.currency+". Prices are calculated by the published Pricing Engine snapshot." : ""}>
      {isLoading?<p className="text-sm text-muted-foreground">Loading property rooms and published rate plans…</p>:isError?<p className="text-sm text-destructive">Booking configuration could not be loaded.</p>:<>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">Booking channel<select className="w-full rounded-md border bg-background p-2" value={channel} onChange={e=>setChannel(e.target.value as "permanent"|"campaign")}><option value="permanent">Permanent /book</option><option value="campaign">Campaign offer</option></select></label>
          <label className="space-y-1 text-sm">Room type<select className="w-full rounded-md border bg-background p-2" value={roomId} onChange={e=>setRoomId(e.target.value)}><option value="">Select an existing room</option>{data?.rooms.map((r:any)=><option key={r.id} value={r.id}>{r.name} · max {r.max_occupancy} guests</option>)}</select></label>
          <label className="space-y-1 text-sm sm:col-span-2">Published rate plan<select className="w-full rounded-md border bg-background p-2" value={publicationId} onChange={e=>setPublicationId(e.target.value)}><option value="">Select a published rate snapshot</option>{data?.publications.map((p:any)=><option key={p.id} value={p.id}>{p.name} · {p.currency} · publication {p.publication_number}</option>)}</select></label>
          {channel==="campaign"&&<>
            <label className="space-y-1 text-sm">Campaign slug<Input value={campaignSlug} onChange={e=>setCampaignSlug(e.target.value)} placeholder="summer-escape" /></label>
            <label className="space-y-1 text-sm">Offer code<Input value={offerCode} onChange={e=>setOfferCode(e.target.value)} placeholder="SUMMER-RACK" /></label>
            <label className="space-y-1 text-sm sm:col-span-2">Offer name<Input value={offerName} onChange={e=>setOfferName(e.target.value)} placeholder="Summer stay offer" /></label>
            <label className="space-y-1 text-sm sm:col-span-2">Offer description<Input value={description} onChange={e=>setDescription(e.target.value)} /></label>
            <label className="space-y-1 text-sm">Stay starts on<Input type="date" value={stayStartsOn} onChange={e=>setStayStartsOn(e.target.value)} /></label>
            <label className="space-y-1 text-sm">Stay ends on<Input type="date" value={stayEndsOn} onChange={e=>setStayEndsOn(e.target.value)} /></label>
            <label className="space-y-1 text-sm">Minimum stay (nights)<Input type="number" min="1" value={minimumStay} onChange={e=>setMinimumStay(e.target.value)} /></label>
            <label className="space-y-1 text-sm">Maximum stay (nights)<Input type="number" min="1" value={maximumStay} onChange={e=>setMaximumStay(e.target.value)} /></label>
          </>}
          <label className="space-y-1 text-sm">Display order<Input type="number" min="0" value={order} onChange={e=>setOrder(e.target.value)} /></label>
        </div>
        {roomId&&publicationId&&!compatible&&<p className="mt-3 text-sm text-destructive">This published rate plan is not assigned to the selected room type. Select a compatible publication.</p>}
        <div className="mt-4 flex justify-end"><Button disabled={save.isPending||!roomId||!publicationId||!compatible||(channel==="campaign"&&(!campaignSlug||!offerName||!offerCode))} onClick={()=>save.mutate()}>{save.isPending?"Saving…":"Save as draft"}</Button></div>
      </>}
    </SectionCard>
    <SectionCard title="Configured booking products" description="Drafts do not appear publicly. Editing a published configuration returns it to draft and requires explicit republishing.">
      <div className="space-y-3">{(data?.configurations??[]).length===0?<p className="text-sm text-muted-foreground">No booking products configured for this property yet.</p>:(data?.configurations??[]).map((item:any)=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <div><p className="font-medium">{item.channel==="permanent"?"Permanent booking":item.offer_name}</p><p className="text-xs text-muted-foreground">{item.campaign_slug??"/book"} · room {item.room_id.slice(0,8)} · order {item.display_order}</p></div>
        <div className="flex items-center gap-2"><Badge variant={item.publication_status==="published"?"default":"outline"}>{item.publication_status}</Badge>{item.publication_status!=="published"&&<Button size="sm" disabled={publish.isPending} onClick={()=>publish.mutate(item.id)}>Publish</Button>}</div>
      </div>)}</div>
    </SectionCard>
  </div>;
}
