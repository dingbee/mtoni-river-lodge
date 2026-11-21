import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

/** Uploads a branding image to the property-branding bucket and returns its public URL. */
export function AssetUpload({ propertyId, assetKey, label, onUploaded }: { propertyId: string; assetKey: string; label: string; onUploaded: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upload = async (file?: File) => {
    if (!file) return;
    setError("");
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    if (!allowed.includes(file.type)) { setError("Use JPEG, PNG, WebP or AVIF."); return; }
    if (file.size > 10 * 1024 * 1024) { setError("File exceeds the 10 MB limit."); return; }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "img";
      const path = `${propertyId}/branding/${assetKey}-${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("property-branding").upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: false });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("property-branding").getPublicUrl(path);
      onUploaded(data.publicUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Check your property role and try again.");
    } finally { setBusy(false); }
  };
  return <div className="space-y-1.5">
    <label className="text-sm font-medium">{label}</label>
    <label className="flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent">
      {busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Upload className="h-4 w-4"/>}
      {busy ? "Uploading…" : "Choose image"}
      <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" disabled={busy} onChange={e => { void upload(e.target.files?.[0]); e.currentTarget.value = ""; }} />
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
