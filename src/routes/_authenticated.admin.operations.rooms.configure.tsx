import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ArrowLeft, Save, BedDouble, Layers3, Upload, Link2, X, Plus, Search, Image as ImageIcon, Check, ChevronDown } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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

const FEATURE_OPTIONS = ["King bed", "Twin beds", "Air conditioning", "Wi-Fi", "Smart TV", "Balcony", "River view", "Garden view", "Private terrace", "Mini bar", "Coffee / tea facilities", "Work desk", "Safe", "Soundproofing", "Wheelchair accessible", "Kitchenette", "Dining area", "Blackout curtains"];
const SPEC_OPTIONS = ["Room size (m²)", "Maximum occupancy", "Bed configuration", "View type", "Bathroom type", "Number of bedrooms", "Dining area", "Kitchenette", "Floor level", "Accessibility"];
const blankCategory = (): Category => ({ slug: "", name: "", description: "", features: [], specifications: {}, sort_order: 0, status: "active" });
const blankRoom = (): Room => ({
  slug: "", name: "", category_id: null, short_description: "", capacity_adults: 2, capacity_children: 0,
  max_occupancy: 2, total_units: 1, base_price: 0, currency: "USD", status: "active", sort_order: 0,
  included_guests: 2, extra_guest_fee: 0, hero_line: "", image_url: "", gallery_urls: [],
  size_label: "", view_label: "", bed_label: "", bathroom_label: "",
});
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const linesToSpecs = (value: Record<string, string> | null | undefined) => Object.entries(value ?? {}).map(([k, v]) => k + ": " + v).join("\n");

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return <div className="min-w-0 space-y-1.5"><Label className="text-sm font-medium">{label}{required && <span className="ml-1 text-destructive">*</span>}</Label>{children}{hint && <p className="text-xs leading-4 text-muted-foreground">{hint}</p>}</div>;
}

function ChoicePanel({ title, options, selected, onChange, custom, onCustom, searchHint }: {
  title: string; options: string[]; selected: string[]; onChange: (next: string[]) => void;
  custom: string; onCustom: (value: string) => void; searchHint: string;
}) {
  const [search, setSearch] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const visible = options.filter(x => x.toLowerCase().includes(search.toLowerCase()));
  const toggle = (item: string, checked: boolean) => onChange(checked ? [...selected, item] : selected.filter(x => x !== item));
  const addCustom = () => {
    const value = custom.trim();
    if (!value) return;
    if (!selected.includes(value)) onChange([...selected, value]);
    onCustom(""); setCustomOpen(false);
  };
  return <div className="rounded-xl border bg-background overflow-hidden">
    <div className="flex items-center justify-between gap-2 border-b px-3 py-3">
      <div className="font-semibold text-sm">{title}</div><Badge variant="secondary">{selected.length} selected</Badge>
    </div>
    <div className="p-3 space-y-3">
      <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label={searchHint} className="pl-9 h-9" placeholder={searchHint} value={search} onChange={e => setSearch(e.target.value)} /></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 max-h-56 overflow-y-auto pr-1">
        {visible.map(item => <label key={item} className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-muted/70 cursor-pointer">
          <Checkbox checked={selected.includes(item)} onCheckedChange={v => toggle(item, v === true)} />
          <span>{item}</span>
        </label>)}
        {visible.length === 0 && <p className="text-sm text-muted-foreground py-3 col-span-2">No matching options.</p>}
      </div>
      {selected.length > 0 && <div className="border-t pt-3"><p className="text-xs text-muted-foreground mb-2">Selected items</p><div className="flex flex-wrap gap-1.5">{selected.map(item => <Badge key={item} variant="outline" className="gap-1 py-1">{item}<button type="button" aria-label={"Remove " + item} onClick={() => toggle(item, false)}><X className="h-3 w-3" /></button></Badge>)}</div></div>}
      {customOpen ? <div className="flex gap-2"><Input autoFocus value={custom} onChange={e => onCustom(e.target.value)} placeholder="Enter a custom option" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} /><Button type="button" size="sm" onClick={addCustom}><Plus className="h-4 w-4 mr-1" />Add</Button></div> : <Button type="button" variant="outline" size="sm" className="w-full border-dashed" onClick={() => setCustomOpen(true)}><Plus className="h-4 w-4 mr-1" />Add custom {title.toLowerCase().replace(/s$/, "")}</Button>}
    </div>
  </div>;
}

function RoomConfigurationPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listRoomConfiguration);
  const categoryFn = useServerFn(saveRoomCategory);
  const roomFn = useServerFn(saveRoomType);
  const q = useQuery({ queryKey: ["room-configuration"], queryFn: () => listFn() });
  const [category, setCategory] = useState<Category>(blankCategory());
  const [categoryFeatures, setCategoryFeatures] = useState<string[]>([]);
  const [categorySpecs, setCategorySpecs] = useState<Record<string, string>>({});
  const [specValues, setSpecValues] = useState<Record<string, string>>({});
  const [customFeature, setCustomFeature] = useState("");
  const [customSpec, setCustomSpec] = useState("");
  const [room, setRoom] = useState<Room>(blankRoom());
  const [gallery, setGallery] = useState<string[]>([]);
  const [galleryUrl, setGalleryUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const categories = (q.data?.categories ?? []) as Category[];
  const rooms = (q.data?.rooms ?? []) as Room[];
  const activeCategories = categories.filter(c => c.status === "active");
  const updateRoom = (patch: Partial<Room>) => setRoom(prev => ({ ...prev, ...patch }));

  const saveCat = useMutation({
    mutationFn: () => categoryFn({ data: {
      ...category, features: categoryFeatures,
      specifications: Object.fromEntries(categoryFeatures.length >= 0 ? Object.entries(categorySpecs).filter(([key]) => !!key) : []),
    }}),
    onSuccess: () => { toast.success("Room category saved"); setCategory(blankCategory()); setCategoryFeatures([]); setCategorySpecs({}); qc.invalidateQueries({ queryKey: ["room-configuration"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveRoom = useMutation({
    mutationFn: () => roomFn({ data: {
      id: room.id, slug: room.slug, name: room.name, categoryId: room.category_id,
      shortDescription: room.short_description ?? "", capacityAdults: Number(room.capacity_adults),
      capacityChildren: Number(room.capacity_children), maxOccupancy: Number(room.max_occupancy), quantity: Number(room.total_units),
      basePrice: Number(room.base_price), currency: room.currency.toUpperCase(),
      includedGuests: Number(room.included_guests), extraGuestFee: Number(room.extra_guest_fee),
      status: room.status, sortOrder: room.sort_order, heroLine: room.hero_line ?? "",
      imageUrl: room.image_url ?? "", galleryUrls: gallery,
      sizeLabel: room.size_label ?? "", viewLabel: room.view_label ?? "", bedLabel: room.bed_label ?? "",
      bathroomLabel: room.bathroom_label ?? "",
    }}),
    onSuccess: () => { toast.success("Room configuration saved"); setRoom(blankRoom()); setGallery([]); setImagePreviews([]); qc.invalidateQueries({ queryKey: ["room-configuration"] }); qc.invalidateQueries({ queryKey: ["ops-room-board"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const editCategory = (c: Category) => { setCategory(c); setCategoryFeatures(c.features ?? []); setCategorySpecs(c.specifications ?? {}); };
  const editRoom = (r: Room) => { setRoom({ ...r }); setGallery(r.gallery_urls ?? []); setImagePreviews([r.image_url, ...(r.gallery_urls ?? [])].filter(Boolean) as string[]); };
  const selectedCategory = activeCategories.find(c => c.id === room.category_id);

  async function uploadImages(files: FileList | File[]) {
    const list = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (!list.length) { toast.error("Choose image files to upload."); return; }
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of list) {
        if (file.size > 8 * 1024 * 1024) { toast.error(file.name + " exceeds the 8 MB limit."); continue; }
        const key = "room-images/" + crypto.randomUUID() + "-" + file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const { error } = await supabase.storage.from("media").upload(key, file, { cacheControl: "3600", upsert: false, contentType: file.type });
        if (error) throw error;
        const { data } = supabase.storage.from("media").getPublicUrl(key);
        uploaded.push(data.publicUrl);
      }
      if (uploaded.length) {
        updateRoom({ image_url: room.image_url || uploaded[0] });
        setGallery(prev => [...prev, ...uploaded.filter(url => url !== (room.image_url || uploaded[0]))]);
        setImagePreviews(prev => [...prev, ...uploaded]);
        toast.success(uploaded.length + " image(s) uploaded");
      }
    } catch (e) { toast.error("Image upload failed: " + (e as Error).message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }
  const addGalleryUrl = () => {
    const url = galleryUrl.trim();
    if (!url) return;
    if (url !== room.image_url && !gallery.includes(url)) setGallery(prev => [...prev, url]);
    setImagePreviews(prev => prev.includes(url) ? prev : [...prev, url]);
    setGalleryUrl("");
  };
  const clearRoom = () => { setRoom(blankRoom()); setGallery([]); setImagePreviews([]); setSpecValues({}); };

  return <div className="space-y-6 pb-8">
    <PageHeader title="Room Board" description="Configure guest-facing room categories, physical inventory, rates and photography."
      actions={<Link to="/admin/operations/rooms"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" />Back to Room Board</Button></Link>} />
    <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-2">
      {[["Dashboard","/admin/operations"],["Room Board","/admin/operations/rooms"],["Arrivals","/admin/operations/arrivals"],["Housekeeping","/admin/operations/housekeeping"],["Tasks","/admin/operations/tasks"],["Alerts","/admin/operations/alerts"],["Activity","/admin/operations/activity"]].map(([label, href]) => <Link key={label} to={href} className={"rounded-lg px-3 py-2 text-sm font-medium " + (label === "Room Board" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{label}</Link>)}
    </div>

    <section className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="flex flex-col gap-3 border-b bg-muted/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2.5"><Layers3 className="h-5 w-5 text-primary" /></div><div><h2 className="text-lg font-semibold">Room categories</h2><p className="text-sm text-muted-foreground">Group room types and choose which features guests see on your booking pages.</p></div></div>
        <Button variant="outline" onClick={() => { setCategory(blankCategory()); setCategoryFeatures([]); setCategorySpecs({}); }}><Plus className="mr-2 h-4 w-4" />New category</Button>
      </div>
      <div className="p-5 space-y-5">
        {categories.length > 0 && <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{categories.map(c => <button key={c.id} type="button" onClick={() => editCategory(c)} className={"rounded-xl border p-3 text-left transition hover:border-primary/50 hover:bg-muted/30 " + (category.id === c.id ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "")}><div className="flex items-center justify-between gap-2"><span className="font-medium">{c.name}</span>{category.id === c.id && <Check className="h-4 w-4 text-primary" />}</div><p className="mt-1 text-xs text-muted-foreground">{(c.features ?? []).length} features · {Object.keys(c.specifications ?? {}).length} specifications · {c.status}</p></button>)}</div>}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Category name" required><Input placeholder="e.g. Deluxe Suite" value={category.name} onChange={e => setCategory({ ...category, name: e.target.value, slug: category.id ? category.slug : slugify(e.target.value) })} /></Field>
          <Field label="URL slug" required hint="Lowercase, unique, and URL-friendly."><Input placeholder="deluxe-suite" value={category.slug} onChange={e => setCategory({ ...category, slug: slugify(e.target.value) })} /></Field>
        </div>
        <Field label="Description" hint="A short description displayed to guests."><Textarea rows={2} placeholder="Describe what makes this room category distinctive…" value={category.description ?? ""} onChange={e => setCategory({ ...category, description: e.target.value })} /></Field>
        <div className="grid gap-4 xl:grid-cols-2">
          <ChoicePanel title="Features" options={FEATURE_OPTIONS} selected={categoryFeatures} onChange={setCategoryFeatures} custom={customFeature} onCustom={setCustomFeature} searchHint="Search room features…" />
          <div className="rounded-xl border bg-background overflow-hidden">
            <div className="border-b px-3 py-3"><h3 className="font-semibold text-sm">Specifications</h3><p className="text-xs text-muted-foreground mt-1">Select attributes, then enter the value for this category.</p></div>
            <div className="p-3 space-y-2">
              {SPEC_OPTIONS.map(option => <div key={option} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50"><label className="flex min-w-0 items-center gap-2 text-sm"><Checkbox checked={option in categorySpecs} onCheckedChange={v => setCategorySpecs(prev => { const next = {...prev}; if (v === true) next[option] = next[option] ?? ""; else delete next[option]; return next; })} /><span>{option}</span></label>{option in categorySpecs && <Input aria-label={option + " value"} className="h-8" placeholder="Enter value" value={categorySpecs[option]} onChange={e => setCategorySpecs(prev => ({...prev, [option]: e.target.value}))} />}</div>)}
              {Object.keys(categorySpecs).filter(k => !SPEC_OPTIONS.includes(k)).map(option => <div key={option} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 rounded-lg px-2 py-2"><span className="text-sm">{option}</span><div className="flex gap-1"><Input className="h-8" value={categorySpecs[option]} onChange={e => setCategorySpecs(prev => ({...prev, [option]: e.target.value}))} /><Button type="button" size="icon" variant="ghost" aria-label={"Remove " + option} onClick={() => setCategorySpecs(prev => { const next = {...prev}; delete next[option]; return next; })}><X className="h-4 w-4" /></Button></div></div>)}
              <div className="flex gap-2 pt-2"><Input placeholder="Custom specification name" value={customSpec} onChange={e => setCustomSpec(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); const k = customSpec.trim(); if (k) setCategorySpecs(prev => ({...prev, [k]: ""})); setCustomSpec(""); } }} /><Button type="button" variant="outline" onClick={() => { const k = customSpec.trim(); if (k) setCategorySpecs(prev => ({...prev, [k]: ""})); setCustomSpec(""); }}><Plus className="mr-1 h-4 w-4" />Add</Button></div>
            </div>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end"><Button variant="ghost" onClick={() => {setCategory(blankCategory());setCategoryFeatures([]);setCategorySpecs({});}}>Clear form</Button><Button onClick={() => saveCat.mutate()} disabled={saveCat.isPending || !category.name.trim() || !category.slug.trim()}><Save className="mr-2 h-4 w-4" />{saveCat.isPending ? "Saving…" : category.id ? "Save category changes" : "Save category"}</Button></div>
      </div>
    </section>

    <section className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="flex flex-col gap-3 border-b bg-muted/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2.5"><BedDouble className="h-5 w-5 text-primary" /></div><div><h2 className="text-lg font-semibold">Room types & physical inventory</h2><p className="text-sm text-muted-foreground">A room type defines the product and rate. Quantity tracks the physical rooms of that type.</p></div></div>
        <Button variant="outline" onClick={clearRoom}><Plus className="mr-2 h-4 w-4" />New room type</Button>
      </div>
      <div className="p-5 space-y-6">
        {rooms.length > 0 && <div><p className="text-sm font-medium mb-2">Existing room types <span className="text-muted-foreground font-normal">— select one to edit</span></p><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{rooms.map(r => <button key={r.id} type="button" onClick={() => editRoom(r)} className={"rounded-xl border p-3 text-left hover:border-primary/50 " + (room.id === r.id ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "")}><div className="flex justify-between gap-2"><span className="font-medium">{r.name}</span><Badge variant={r.status === "active" ? "secondary" : "outline"}>{r.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{r.total_units} physical rooms · {r.currency} {Number(r.base_price).toLocaleString()} / night</p><p className="text-xs text-muted-foreground">{categories.find(c => c.id === r.category_id)?.name ?? "No category"}</p></button>)}</div></div>}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Room type name" required><Input placeholder="e.g. Deluxe River View" value={room.name} onChange={e => updateRoom({name:e.target.value, slug: room.id ? room.slug : slugify(e.target.value)})} /></Field>
          <Field label="URL slug / code" required><Input placeholder="deluxe-river-view" value={room.slug} onChange={e => updateRoom({slug:slugify(e.target.value)})} /></Field>
          <Field label="Guest-facing category" required><Select value={room.category_id ?? "none"} onValueChange={v => updateRoom({category_id:v === "none" ? null : v})}><SelectTrigger><SelectValue placeholder="Choose a category" /></SelectTrigger><SelectContent><SelectItem value="none">No category</SelectItem>{activeCategories.map(c => <SelectItem key={c.id} value={c.id!}>{c.name}</SelectItem>)}</SelectContent></Select></Field>
        </div>
        <div className="rounded-xl border bg-muted/20 p-4 space-y-3"><div><h3 className="font-semibold text-sm">Inventory & availability</h3><p className="text-xs text-muted-foreground mt-1">Enter counts, not room numbers. Availability is the number currently sellable, and cannot exceed total physical rooms.</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Total physical rooms" required hint="All rooms of this type at the property."><Input type="number" min="1" value={room.total_units} onChange={e => updateRoom({total_units:Math.max(1, Number(e.target.value))})} /></Field>
          <Field label="Maximum guests per room" required hint="Maximum occupancy including adults and children."><Input type="number" min="1" value={room.max_occupancy} onChange={e => updateRoom({max_occupancy:Math.max(1, Number(e.target.value))})} /></Field>
          <Field label="Adults allowed" hint="Maximum adult guests."><Input type="number" min="1" value={room.capacity_adults} onChange={e => updateRoom({capacity_adults:Math.max(1, Number(e.target.value))})} /></Field>
          <Field label="Children allowed" hint="Maximum child guests."><Input type="number" min="0" value={room.capacity_children} onChange={e => updateRoom({capacity_children:Math.max(0, Number(e.target.value))})} /></Field>
        </div></div>
        <div className="rounded-xl border bg-muted/20 p-4 space-y-3"><div><h3 className="font-semibold text-sm">Rates & currency</h3><p className="text-xs text-muted-foreground mt-1">Set the base nightly rate and how additional guests are charged. Currency is stored per room type.</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Base rate per night" required hint="Amount for the included guest count."><Input type="number" min="0" step="0.01" value={room.base_price} onChange={e => updateRoom({base_price:Math.max(0, Number(e.target.value))})} /></Field>
          <Field label="Rate currency" required hint="Use the property's agreed pricing currency."><Select value={room.currency} onValueChange={v => updateRoom({currency:v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["TZS","USD","EUR","GBP","KES","UGX","ZAR"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Guests included in base rate" required hint="Guests covered by the base nightly rate."><Input type="number" min="1" value={room.included_guests} onChange={e => updateRoom({included_guests:Math.max(1, Number(e.target.value))})} /></Field>
          <Field label="Extra guest fee / night" hint={"Per extra guest, in " + room.currency + "."}><Input type="number" min="0" step="0.01" value={room.extra_guest_fee} onChange={e => updateRoom({extra_guest_fee:Math.max(0, Number(e.target.value))})} /></Field>
        </div><div className="flex flex-wrap items-center gap-2 rounded-lg bg-background border p-3 text-sm"><span className="text-muted-foreground">Rate preview:</span><strong>{room.currency} {Number(room.base_price || 0).toLocaleString()} / night</strong><span className="text-muted-foreground">for {room.included_guests} guest(s)</span></div></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Room size" hint="Guest-facing floor area, e.g. 38 m²."><Input placeholder="e.g. 38 m²" value={room.size_label ?? ""} onChange={e => updateRoom({size_label:e.target.value})} /></Field>
          <Field label="Bed configuration"><Input placeholder="e.g. 1 King bed or 2 Twin beds" value={room.bed_label ?? ""} onChange={e => updateRoom({bed_label:e.target.value})} /></Field>
          <Field label="Bathroom"><Input placeholder="e.g. En-suite rain shower" value={room.bathroom_label ?? ""} onChange={e => updateRoom({bathroom_label:e.target.value})} /></Field>
          <Field label="View"><Input placeholder="e.g. River view" value={room.view_label ?? ""} onChange={e => updateRoom({view_label:e.target.value})} /></Field>
          <Field label="Room status"><Select value={room.status} onValueChange={v => updateRoom({status:v as Room["status"]})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active — available to sell</SelectItem><SelectItem value="inactive">Inactive — hidden from sale</SelectItem></SelectContent></Select></Field>
        </div>
        <Field label="Short description" hint="A concise description for listings and booking results."><Textarea rows={2} placeholder="Describe the room layout, comfort and standout details…" value={room.short_description ?? ""} onChange={e => updateRoom({short_description:e.target.value})} /></Field>
        <Field label="Headline / hero line" hint="Optional promotional line shown with the room."><Input placeholder="e.g. Space to unwind, with a view worth waking up for." value={room.hero_line ?? ""} onChange={e => updateRoom({hero_line:e.target.value})} /></Field>

        <div className="rounded-xl border overflow-hidden">
          <div className="flex flex-col gap-3 border-b bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold">Room photography</h3><p className="text-xs text-muted-foreground mt-1">Upload JPG, PNG or WebP images (max 8 MB each), or add image URLs.</p></div><div className="flex flex-wrap gap-2"><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="hidden" onChange={e => e.target.files && uploadImages(e.target.files)} /><Button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}><Upload className="mr-2 h-4 w-4" />{uploading ? "Uploading…" : "Upload images"}</Button></div></div>
          <div className="p-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><Field label="Cover image URL" hint="Paste an existing public image URL, or upload a cover image above."><Input type="url" placeholder="https://example.com/room-cover.jpg" value={room.image_url ?? ""} onChange={e => updateRoom({image_url:e.target.value})} /></Field><div className="flex items-end"><Button type="button" variant="outline" onClick={() => { const url = (room.image_url ?? "").trim(); if (url) { setImagePreviews(prev => prev.includes(url) ? prev : [url, ...prev]); toast.success("Cover image added to preview"); } else toast.error("Enter an image URL first."); }}><Link2 className="mr-2 h-4 w-4" />Preview URL</Button></div></div>
            <div className="rounded-xl border-2 border-dashed p-5 text-center bg-muted/10" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void uploadImages(e.dataTransfer.files); }}><ImageIcon className="h-7 w-7 mx-auto text-muted-foreground mb-2" /><p className="text-sm font-medium">Drag and drop room photos here</p><p className="text-xs text-muted-foreground mt-1">Or use Upload images. Add URLs for images hosted elsewhere.</p><Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => fileRef.current?.click()} disabled={uploading}>Choose files</Button></div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><Field label="Add gallery image URL" hint="Add one image URL at a time."><Input type="url" placeholder="https://example.com/room-gallery.jpg" value={galleryUrl} onChange={e => setGalleryUrl(e.target.value)} onKeyDown={e => {if (e.key === "Enter") {e.preventDefault(); addGalleryUrl();}}} /></Field><div className="flex items-end"><Button type="button" variant="outline" onClick={addGalleryUrl}><Plus className="mr-2 h-4 w-4" />Add URL</Button></div></div>
            {imagePreviews.length > 0 && <div><p className="text-sm font-medium mb-2">Image preview and gallery <span className="text-muted-foreground font-normal">({imagePreviews.length})</span></p><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{imagePreviews.map((url, i) => <div key={url + i} className="relative overflow-hidden rounded-lg border bg-muted aspect-[4/3]"><img src={url} alt={"Room image " + (i+1)} className="h-full w-full object-cover" onError={e => {e.currentTarget.style.opacity = "0.25";}} /><Badge className="absolute bottom-2 left-2">{url === room.image_url ? "Cover image" : "Gallery"}</Badge><button type="button" aria-label="Remove image" className="absolute right-2 top-2 rounded-full bg-background/90 p-1.5 shadow" onClick={() => { if (url === room.image_url) updateRoom({image_url:""}); else setGallery(prev => prev.filter(x => x !== url)); setImagePreviews(prev => prev.filter(x => x !== url)); }}><X className="h-3.5 w-3.5" /></button></div>)}</div></div>}
          </div>
        </div>
        {selectedCategory && <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm"><span className="font-medium">{selectedCategory.name}</span> features and specifications are inherited by this room type for guest-facing display.</div>}
        <div className="sticky bottom-2 z-10 flex flex-col-reverse gap-2 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">Changes are saved to this property's room configuration.</p><div className="flex flex-col-reverse gap-2 sm:flex-row"><Button variant="ghost" onClick={clearRoom}>Clear form</Button><Button onClick={() => saveRoom.mutate()} disabled={saveRoom.isPending || !room.name.trim() || !room.slug.trim() || Number(room.total_units) < 1 || Number(room.base_price) < 0}><Save className="mr-2 h-4 w-4" />{saveRoom.isPending ? "Saving…" : room.id ? "Save room type" : "Add room type"}</Button></div></div>
      </div>
    </section>
  </div>;
}
