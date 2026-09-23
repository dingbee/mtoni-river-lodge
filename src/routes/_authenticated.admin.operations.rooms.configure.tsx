import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Save, BedDouble, Layers3 } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { listRoomConfiguration, saveRoomCategory, saveRoomType } from "@/lib/room-management.functions";

export const Route = createFileRoute("/_authenticated/admin/operations/rooms/configure")({
  head: () => ({ meta: [{ title: "Room Configuration — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: RoomConfigurationPage,
});

type Category = {
  id?: string; slug: string; name: string; description: string | null;
  features: string[]; specifications: Record<string, string>; sort_order: number; status: "active" | "archived";
};
type Room = {
  id?: string; slug: string; name: string; category_id: string | null; short_description: string | null;
  capacity_adults: number; capacity_children: number; max_occupancy: number; total_units: number;
  base_price: number; currency: string; status: "active" | "inactive"; sort_order: number;
  included_guests: number; extra_guest_fee: number; hero_line: string | null; image_url: string | null;
  gallery_urls: string[]; size_label: string | null; view_label: string | null; bed_label: string | null; bathroom_label: string | null;
};

const blankCategory = (): Category => ({ slug: "", name: "", description: "", features: [], specifications: {}, sort_order: 0, status: "active" });
const blankRoom = (): Room => ({
  slug: "", name: "", category_id: null, short_description: "", capacity_adults: 2, capacity_children: 0,
  max_occupancy: 2, total_units: 1, base_price: 0, currency: "USD", status: "active", sort_order: 0,
  included_guests: 2, extra_guest_fee: 0, hero_line: "", image_url: "", gallery_urls: [],
  size_label: "", view_label: "", bed_label: "", bathroom_label: "",
});
const linesToFeatures = (value: string) => value.split("\n").map(v => v.trim()).filter(Boolean);
const linesToSpecs = (value: string) => Object.fromEntries(value.split("\n").map(v => v.trim()).filter(Boolean).map(line => {
  const i = line.indexOf(":"); return i < 1 ? [line, ""] : [line.slice(0, i).trim(), line.slice(i + 1).trim()];
}).filter(([k]) => k));
const specsToLines = (value: Record<string, string> | null | undefined) => Object.entries(value ?? {}).map(([k, v]) => k + ": " + v).join("\n");

function RoomConfigurationPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listRoomConfiguration);
  const categoryFn = useServerFn(saveRoomCategory);
  const roomFn = useServerFn(saveRoomType);
  const q = useQuery({ queryKey: ["room-configuration"], queryFn: () => listFn() });
  const [category, setCategory] = useState<Category>(blankCategory());
  const [categoryFeatures, setCategoryFeatures] = useState("");
  const [categorySpecs, setCategorySpecs] = useState("");
  const [room, setRoom] = useState<Room>(blankRoom());
  const [gallery, setGallery] = useState("");

  const categories = (q.data?.categories ?? []) as Category[];
  const rooms = (q.data?.rooms ?? []) as Room[];
  const activeCategories = categories.filter(c => c.status === "active");

  const saveCat = useMutation({
    mutationFn: () => categoryFn({ data: {
      ...category, features: linesToFeatures(categoryFeatures), specifications: linesToSpecs(categorySpecs),
    }}),
    onSuccess: () => {
      toast.success("Room category saved");
      setCategory(blankCategory()); setCategoryFeatures(""); setCategorySpecs("");
      qc.invalidateQueries({ queryKey: ["room-configuration"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveRoom = useMutation({
    mutationFn: () => roomFn({ data: {
      id: room.id, slug: room.slug, name: room.name, categoryId: room.category_id,
      shortDescription: room.short_description ?? "", capacityAdults: room.capacity_adults,
      capacityChildren: room.capacity_children, maxOccupancy: room.max_occupancy, quantity: room.total_units,
      basePrice: Number(room.base_price), currency: room.currency.toUpperCase(),
      includedGuests: room.included_guests, extraGuestFee: Number(room.extra_guest_fee),
      status: room.status, sortOrder: room.sort_order, heroLine: room.hero_line ?? "",
      imageUrl: room.image_url ?? "", galleryUrls: gallery.split("\n").map(v => v.trim()).filter(Boolean),
      sizeLabel: room.size_label ?? "", viewLabel: room.view_label ?? "", bedLabel: room.bed_label ?? "",
      bathroomLabel: room.bathroom_label ?? "",
    }}),
    onSuccess: () => {
      toast.success("Room configuration saved");
      setRoom(blankRoom()); setGallery("");
      qc.invalidateQueries({ queryKey: ["room-configuration"] });
      qc.invalidateQueries({ queryKey: ["ops-room-board"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editCategory = (c: Category) => {
    setCategory(c); setCategoryFeatures(c.features.join("\n")); setCategorySpecs(specsToLines(c.specifications));
  };
  const editRoom = (r: Room) => {
    setRoom({ ...r }); setGallery((r.gallery_urls ?? []).join("\n"));
  };
  const selectedCategory = activeCategories.find(c => c.id === room.category_id);

  return (
    <div className="space-y-6">
      <PageHeader title="Room Configuration" description="Configure room types, physical inventory quantity, pricing, currency and guest-facing category content."
        actions={<Link to="/admin/operations/rooms"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" />Room Board</Button></Link>} />
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <div><h2 className="text-lg font-semibold">Room categories</h2><p className="text-sm text-muted-foreground">Features and specifications shown on guest-facing room pages.</p></div>
            <Layers3 className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="mt-5 space-y-3">
            {categories.map(c => <button key={c.id} type="button" onClick={() => editCategory(c)} className="w-full rounded-lg border p-3 text-left hover:bg-muted">
              <div className="flex justify-between gap-3"><span className="font-medium">{c.name}</span><span className="text-xs text-muted-foreground">{c.status}</span></div>
              <p className="mt-1 text-xs text-muted-foreground">{c.features.length} features · {Object.keys(c.specifications ?? {}).length} specifications</p>
            </button>)}
            {categories.length === 0 && <p className="text-sm text-muted-foreground">No categories yet.</p>}
          </div>
          <div className="mt-5 space-y-3 border-t pt-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input placeholder="Category name" value={category.name} onChange={e => setCategory({...category, name:e.target.value})} />
              <Input placeholder="slug" value={category.slug} onChange={e => setCategory({...category, slug:e.target.value})} />
            </div>
            <Textarea placeholder="Category description" value={category.description ?? ""} onChange={e => setCategory({...category, description:e.target.value})} />
            <Textarea placeholder={"Features — one per line\nKing bed\nPrivate balcony\nAir conditioning"} value={categoryFeatures} onChange={e => setCategoryFeatures(e.target.value)} />
            <Textarea placeholder={"Specifications — one per line, Label: value\nBed: King\nBathroom: En-suite\nSize: 38 m²"} value={categorySpecs} onChange={e => setCategorySpecs(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => {setCategory(blankCategory());setCategoryFeatures("");setCategorySpecs("");}}>Clear</Button>
              <Button onClick={() => saveCat.mutate()} disabled={saveCat.isPending || !category.name || !category.slug}><Save className="mr-2 h-4 w-4" />{saveCat.isPending ? "Saving…" : category.id ? "Update category" : "Add category"}</Button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <div><h2 className="text-lg font-semibold">Room types & inventory</h2><p className="text-sm text-muted-foreground">Name, category, quantity, price, currency and physical-unit reconciliation.</p></div>
            <BedDouble className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="mt-5 space-y-3">
            {rooms.map(r => <button key={r.id} type="button" onClick={() => editRoom(r)} className="w-full rounded-lg border p-3 text-left hover:bg-muted">
              <div className="flex justify-between gap-3"><span className="font-medium">{r.name}</span><span className="text-xs text-muted-foreground">{r.currency} {Number(r.base_price).toLocaleString()} · {r.total_units} units</span></div>
              <p className="mt-1 text-xs text-muted-foreground">{categories.find(c => c.id === r.category_id)?.name ?? "Uncategorised"} · {r.status}</p>
            </button>)}
            {rooms.length === 0 && <p className="text-sm text-muted-foreground">No room types yet.</p>}
          </div>
          <div className="mt-5 space-y-3 border-t pt-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input placeholder="Room name" value={room.name} onChange={e => setRoom({...room,name:e.target.value})} />
              <Input placeholder="slug" value={room.slug} onChange={e => setRoom({...room,slug:e.target.value})} />
            </div>
            <Select value={room.category_id ?? "none"} onValueChange={v => setRoom({...room,category_id:v === "none" ? null : v})}>
              <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent><SelectItem value="none">No category</SelectItem>{activeCategories.map(c => <SelectItem key={c.id} value={c.id!}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input type="number" min="1" placeholder="Quantity" value={room.total_units} onChange={e => setRoom({...room,total_units:Number(e.target.value)})} />
              <Input type="number" min="0" placeholder="Base price" value={room.base_price} onChange={e => setRoom({...room,base_price:Number(e.target.value)})} />
              <Input placeholder="Currency" maxLength={3} value={room.currency} onChange={e => setRoom({...room,currency:e.target.value.toUpperCase()})} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input type="number" min="1" placeholder="Adults" value={room.capacity_adults} onChange={e => setRoom({...room,capacity_adults:Number(e.target.value)})} />
              <Input type="number" min="0" placeholder="Children" value={room.capacity_children} onChange={e => setRoom({...room,capacity_children:Number(e.target.value)})} />
              <Input type="number" min="1" placeholder="Max occupancy" value={room.max_occupancy} onChange={e => setRoom({...room,max_occupancy:Number(e.target.value)})} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input type="number" min="1" placeholder="Included guests" value={room.included_guests} onChange={e => setRoom({...room,included_guests:Number(e.target.value)})} />
              <Input type="number" min="0" placeholder="Extra guest fee" value={room.extra_guest_fee} onChange={e => setRoom({...room,extra_guest_fee:Number(e.target.value)})} />
            </div>
            <Textarea placeholder="Short description" value={room.short_description ?? ""} onChange={e => setRoom({...room,short_description:e.target.value})} />
            <Textarea placeholder="Hero line" value={room.hero_line ?? ""} onChange={e => setRoom({...room,hero_line:e.target.value})} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input placeholder="Image URL (optional)" value={room.image_url ?? ""} onChange={e => setRoom({...room,image_url:e.target.value})} />
              <Input placeholder="Size e.g. 38 m²" value={room.size_label ?? ""} onChange={e => setRoom({...room,size_label:e.target.value})} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input placeholder="View" value={room.view_label ?? ""} onChange={e => setRoom({...room,view_label:e.target.value})} />
              <Input placeholder="Bed" value={room.bed_label ?? ""} onChange={e => setRoom({...room,bed_label:e.target.value})} />
              <Input placeholder="Bathroom" value={room.bathroom_label ?? ""} onChange={e => setRoom({...room,bathroom_label:e.target.value})} />
            </div>
            <Textarea placeholder="Gallery image URLs — one per line" value={gallery} onChange={e => setGallery(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => {setRoom(blankRoom());setGallery("");}}>Clear</Button>
              <Button onClick={() => saveRoom.mutate()} disabled={saveRoom.isPending || !room.name || !room.slug}><Save className="mr-2 h-4 w-4" />{saveRoom.isPending ? "Saving…" : room.id ? "Update room" : "Add room"}</Button>
            </div>
            {selectedCategory && <p className="text-xs text-muted-foreground">Guest-facing features/specifications inherit automatically from <strong>{selectedCategory.name}</strong>.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
