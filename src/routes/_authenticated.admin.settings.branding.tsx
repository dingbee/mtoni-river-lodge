import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ImagePlus, Save, Palette, Eye } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useAdminMutation } from "@/hooks/use-admin-mutation";
import { usePropertyContext } from "@/modules/property/PropertyContext";
import { getPropertyBranding, savePropertyBranding, type PropertyBranding } from "@/modules/property/property-branding.functions";

export const Route = createFileRoute("/_authenticated/admin/settings/branding")({
  head: () => ({ meta: [{ title: "Property Branding — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: PropertyBrandingPage,
});

const defaults = (propertyId: string): PropertyBranding => ({
  propertyId, logoUrl: "", logoDarkUrl: "", faviconUrl: "",
  primaryColor: "#1e352a", secondaryColor: "#c6a878",
  backgroundColor: "#f5f4ef", textColor: "#202820",
  tagline: "", description: "", heroImageUrl: "",
  galleryImageUrls: [], showStayNasAttribution: true,
});

function PropertyBrandingPage() {
  const { property } = usePropertyContext();
  const getFn = useServerFn(getPropertyBranding);
  const saveFn = useServerFn(savePropertyBranding);
  const qc = useQueryClient();
  const queryKey = ["property-branding", property.id];
  const query = useQuery({ queryKey, queryFn: () => getFn({ data: { propertyId: property.id } }) });
  const [form, setForm] = useState<PropertyBranding>(defaults(property.id));

  useEffect(() => {
    if (query.data) setForm(query.data);
    else if (!query.isLoading) setForm(defaults(property.id));
  }, [query.data, query.isLoading, property.id]);

  const save = useAdminMutation({
    mutationFn: (payload: PropertyBranding) => saveFn({ data: payload }),
    successMessage: "Property branding saved",
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const update = <K extends keyof PropertyBranding>(key: K, value: PropertyBranding[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  if (query.isLoading) return <LoadingState />;

  return <div className="space-y-6">
    <PageHeader title="Property Branding" description={`Configure the guest-facing identity for ${property.name}. Changes are isolated to this property.`} />
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <SectionCard title="Logo & identity" description="Use a transparent PNG or SVG logo. Add hosted image URLs; direct file upload is not enabled in this first release.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Primary logo URL"><Input value={form.logoUrl} onChange={e => update("logoUrl", e.target.value)} placeholder="https://…/logo.svg" /></Field>
            <Field label="Dark-background logo URL"><Input value={form.logoDarkUrl} onChange={e => update("logoDarkUrl", e.target.value)} placeholder="https://…/logo-white.svg" /></Field>
            <Field label="Favicon URL"><Input value={form.faviconUrl} onChange={e => update("faviconUrl", e.target.value)} placeholder="https://…/favicon.png" /></Field>
            <Field label="Brand tagline"><Input value={form.tagline} onChange={e => update("tagline", e.target.value)} maxLength={160} placeholder="A stay worth remembering" /></Field>
          </div>
          <div className="mt-4"><Field label="Property description"><Textarea rows={3} value={form.description} onChange={e => update("description", e.target.value)} maxLength={1000} placeholder="A short introduction shown to guests…" /></Field></div>
        </SectionCard>

        <SectionCard title="Brand colours" description="Set the core colour tokens used by the guest-facing booking experience.">
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorField label="Primary" value={form.primaryColor} onChange={v => update("primaryColor", v)} />
            <ColorField label="Secondary" value={form.secondaryColor} onChange={v => update("secondaryColor", v)} />
            <ColorField label="Page background" value={form.backgroundColor} onChange={v => update("backgroundColor", v)} />
            <ColorField label="Text" value={form.textColor} onChange={v => update("textColor", v)} />
          </div>
        </SectionCard>

        <SectionCard title="Photography" description="Use public HTTPS image URLs. Room photography remains managed in room configuration.">
          <Field label="Booking hero image URL"><Input value={form.heroImageUrl} onChange={e => update("heroImageUrl", e.target.value)} placeholder="https://…/hero.webp" /></Field>
          <div className="mt-4"><Field label="Gallery image URLs (one per line)"><Textarea rows={4} value={form.galleryImageUrls.join("\n")} onChange={e => update("galleryImageUrls", e.target.value.split("\n").map(v => v.trim()).filter(Boolean).slice(0,12))} placeholder="https://…/image-1.webp&#10;https://…/image-2.webp" /></Field></div>
        </SectionCard>

        <SectionCard title="Booking page options">
          <div className="flex items-center justify-between gap-4">
            <div><p className="text-sm font-medium">Show StayNas attribution</p><p className="text-xs text-muted-foreground">Display “Powered by StayNas” on the public booking page.</p></div>
            <Switch checked={form.showStayNasAttribution} onCheckedChange={v => update("showStayNasAttribution", v)} />
          </div>
        </SectionCard>
        <div className="flex justify-end"><Button onClick={() => save.mutate(form)} disabled={save.isPending}><Save className="mr-2 h-4 w-4"/>{save.isPending ? "Saving…" : "Save branding"}</Button></div>
      </div>

      <div className="space-y-4 xl:sticky xl:top-5 xl:self-start">
        <SectionCard title="Live preview" description="A simplified preview of the booking identity using your current unsaved values.">
          <div className="overflow-hidden rounded-xl border" style={{ backgroundColor: form.backgroundColor, color: form.textColor }}>
            <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: form.primaryColor + "22" }}>
              {form.logoUrl ? <img src={form.logoUrl} alt="Property logo preview" className="h-9 max-w-28 object-contain" /> : <div className="flex h-9 w-9 items-center justify-center rounded-lg text-white" style={{ backgroundColor: form.primaryColor }}><ImagePlus className="h-4 w-4"/></div>}
              <span className="text-sm font-semibold">{property.name}</span>
            </div>
            <div className="p-4">
              {form.heroImageUrl ? <img src={form.heroImageUrl} alt="Property hero preview" className="mb-4 aspect-[16/9] w-full rounded-lg object-cover"/> : <div className="mb-4 flex aspect-[16/9] items-center justify-center rounded-lg text-xs opacity-60" style={{ backgroundColor: form.secondaryColor + "33" }}>Hero image preview</div>}
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: form.secondaryColor }}>A more personal way to stay</p>
              <h3 className="mt-2 text-xl font-semibold">{property.name}</h3>
              {form.tagline && <p className="mt-1 text-sm">{form.tagline}</p>}
              {form.description && <p className="mt-2 text-xs leading-5 opacity-75">{form.description}</p>}
              <div className="mt-4 rounded-lg px-4 py-3 text-center text-xs font-semibold text-white" style={{ backgroundColor: form.primaryColor }}>Find your stay</div>
            </div>
            {form.showStayNasAttribution && <p className="px-4 pb-3 text-center text-[10px] opacity-60">Powered by StayNas</p>}
          </div>
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Eye className="h-3.5 w-3.5"/> Preview updates as you edit; save to persist.</p>
        </SectionCard>
      </div>
    </div>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Field label={label}><div className="flex items-center gap-2"><Input type="color" value={value} onChange={e => onChange(e.target.value)} className="h-10 w-14 p-1"/><Input value={value} onChange={e => onChange(e.target.value)} maxLength={7}/></div></Field>;
}
