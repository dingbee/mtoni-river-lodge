import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { HIGHLIGHT_ICONS, type DirectHighlight, type DirectOffer, type HighlightIcon } from "@/lib/direct-booking-content";

const ICON_LABELS: Record<HighlightIcon, string> = {
  stay: "Rooms & stays",
  dining: "Dining",
  wellness: "Wellness & spa",
  outdoors: "Outdoor activities",
  pool: "Pool",
  wifi: "Wi-Fi",
  transfer: "Transfers",
  family: "Family",
};

const EMPTY_OFFER: DirectOffer = { enabled: false, eyebrow: "", title: "", body: "", ctaLabel: "", ctaUrl: "", imageUrl: "" };

type Props = {
  available: boolean;
  valueWords: string[];
  highlights: DirectHighlight[];
  offer: DirectOffer | null;
  onValueWords: (value: string[]) => void;
  onHighlights: (value: DirectHighlight[]) => void;
  onOffer: (value: DirectOffer | null) => void;
};

/**
 * Optional content for the guest booking page template. Each section is shown
 * to guests only when it is filled in here.
 */
export function TemplateContentFields({ available, valueWords, highlights, offer, onValueWords, onHighlights, onOffer }: Props) {
  if (!available) {
    return <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
      Template content will be available after the pending database update for this release is applied. Existing branding is unaffected.
    </p>;
  }
  const words = [0, 1, 2].map((index) => valueWords[index] ?? "");
  const setWord = (index: number, value: string) => {
    const next = [...words];
    next[index] = value;
    // Slots keep their position while editing; empty words are removed on save.
    onValueWords(next);
  };
  const setHighlight = (index: number, patch: Partial<DirectHighlight>) =>
    onHighlights(highlights.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const currentOffer = offer ?? EMPTY_OFFER;
  const setOffer = (patch: Partial<DirectOffer>) => {
    const next = { ...currentOffer, ...patch };
    const empty = !next.enabled && !next.title && !next.eyebrow && !next.body && !next.ctaLabel && !next.ctaUrl && !next.imageUrl;
    onOffer(empty ? null : next);
  };

  return <div className="space-y-6">
    <div className="space-y-2">
      <Label>Value words <span className="font-normal text-muted-foreground">(up to 3, shown under the hero)</span></Label>
      <div className="grid gap-2 sm:grid-cols-3">
        {words.map((word, index) => <Input key={index} value={word} maxLength={24} onChange={(e) => setWord(index, e.target.value)} placeholder={["Tranquil", "Authentic", "Restorative"][index]} aria-label={`Value word ${index + 1}`} />)}
      </div>
    </div>

    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Label>Highlights <span className="font-normal text-muted-foreground">({highlights.length}/4)</span></Label>
        <Button type="button" variant="outline" size="sm" disabled={highlights.length >= 4} onClick={() => onHighlights([...highlights, { title: "", description: "", icon: "stay" }])}><Plus className="mr-1 h-3.5 w-3.5" />Add highlight</Button>
      </div>
      {highlights.length === 0 && <p className="text-xs text-muted-foreground">No highlights. The section is hidden on the booking page.</p>}
      {highlights.map((item, index) => <div key={index} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[160px_minmax(0,1fr)_auto] sm:items-start">
        <select value={item.icon} onChange={(e) => setHighlight(index, { icon: e.target.value as HighlightIcon })} aria-label={`Highlight ${index + 1} icon`} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          {HIGHLIGHT_ICONS.map((icon) => <option key={icon} value={icon}>{ICON_LABELS[icon]}</option>)}
        </select>
        <div className="grid gap-2">
          <Input value={item.title} maxLength={40} onChange={(e) => setHighlight(index, { title: e.target.value })} placeholder="Farm-to-table dining" aria-label={`Highlight ${index + 1} title`} />
          <Input value={item.description} maxLength={140} onChange={(e) => setHighlight(index, { description: e.target.value })} placeholder="Short description" aria-label={`Highlight ${index + 1} description`} />
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label={`Remove highlight ${index + 1}`} onClick={() => onHighlights(highlights.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
      </div>)}
    </div>

    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div><p className="text-sm font-medium">Offer banner</p><p className="text-xs text-muted-foreground">Shown near the end of the booking page when switched on and given a title.</p></div>
        <Switch checked={currentOffer.enabled} onCheckedChange={(enabled) => setOffer({ enabled })} aria-label="Show offer banner" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={currentOffer.eyebrow} maxLength={40} onChange={(e) => setOffer({ eyebrow: e.target.value })} placeholder="Label, e.g. Special offer" aria-label="Offer label" />
        <Input value={currentOffer.title} maxLength={80} onChange={(e) => setOffer({ title: e.target.value })} placeholder="Offer title" aria-label="Offer title" />
        <Textarea className="sm:col-span-2" rows={2} value={currentOffer.body} maxLength={240} onChange={(e) => setOffer({ body: e.target.value })} placeholder="Offer details as they apply to guests" aria-label="Offer details" />
        <Input value={currentOffer.ctaLabel} maxLength={30} onChange={(e) => setOffer({ ctaLabel: e.target.value })} placeholder="Button label, e.g. View offer" aria-label="Offer button label" />
        <Input value={currentOffer.ctaUrl} maxLength={2048} onChange={(e) => setOffer({ ctaUrl: e.target.value })} placeholder="/p/your-property/campaign/… or https://…" aria-label="Offer button link" />
        <Input className="sm:col-span-2" value={currentOffer.imageUrl} maxLength={2048} onChange={(e) => setOffer({ imageUrl: e.target.value })} placeholder="Offer image https://… (optional)" aria-label="Offer image URL" />
      </div>
    </div>
  </div>;
}
