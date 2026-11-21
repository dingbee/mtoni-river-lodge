import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

/** Uploads a branding image to the property-branding bucket and returns its public URL. */
export function AssetUpload({ propertyId, assetKey, label, onUploaded, multiple = false }: { propertyId: string; assetKey: string; label: string; onUploaded: (url: string) => void; multiple?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif"];
  /** Uploads files one at a time, in order; a rejected file does not stop the rest. */
  const upload = async (files: File[]) => {
    if (!files.length) return;
    setError("");
    setBusy(true);
    const problems: string[] = [];
    try {
      for (const file of files) {
        if (!allowed.includes(file.type)) { problems.push(`${file.name}: use JPEG, PNG, WebP or AVIF.`); continue; }
        if (file.size > 10 * 1024 * 1024) { problems.push(`${file.name}: exceeds the 10 MB limit.`); continue; }
        const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "img";
        const path = `${propertyId}/branding/${assetKey}-${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("property-branding").upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: false });
        if (uploadError) {
          problems.push(`${file.name}: ${/row-level security|unauthorized|permission/i.test(uploadError.message) ? "your role in this property cannot upload images (owner, admin or manager required)." : uploadError.message}`);
          continue;
        }
        const { data } = supabase.storage.from("property-branding").getPublicUrl(path);
        onUploaded(data.publicUrl);
      }
    } finally {
      setBusy(false);
      if (problems.length) setError(problems.join(" "));
    }
  };
  return <div className="space-y-1.5">
    <label className="text-sm font-medium">{label}</label>
    <label className="flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent">
      {busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Upload className="h-4 w-4"/>}
      {busy ? "Uploading…" : "Choose image"}
      <input type="file" multiple={multiple} accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" disabled={busy} onChange={e => { void upload(Array.from(e.target.files ?? [])); e.currentTarget.value = ""; }} />
    </label>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}

export function AssetField({ label, value, propertyId, assetKey, onUploaded }: { label: string; value: string; propertyId: string; assetKey: string; onUploaded: (url: string) => void }) {
  return <div className="space-y-2">
    <AssetUpload label={label} propertyId={propertyId} assetKey={assetKey} onUploaded={onUploaded}/>
    {value && <div className="flex items-center gap-3 rounded-md border p-2">
      <img src={value} alt={`${label} preview`} className="h-12 w-20 rounded object-contain"/>
      <Input value={value} onChange={e => onUploaded(e.target.value)} aria-label={`${label} URL`} className="text-xs"/>
    </div>}
  </div>;
}
