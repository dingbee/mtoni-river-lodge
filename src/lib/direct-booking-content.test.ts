import { describe, expect, it } from "vitest";
import { directHeroPhotos, hasTemplateColumns, offerSchema, parseTemplateContent, publicGalleryUrls, visibleOffer } from "./direct-booking-content";

describe("parseTemplateContent", () => {
  it("returns empty content when the branding row is missing or predates the template columns", () => {
    expect(parseTemplateContent(null)).toEqual({ valueWords: [], highlights: [], offer: null });
    expect(parseTemplateContent({ tagline: "x" })).toEqual({ valueWords: [], highlights: [], offer: null });
    expect(hasTemplateColumns({ tagline: "x" })).toBe(false);
    expect(hasTemplateColumns({ value_words: [], highlights: [], offer: null })).toBe(true);
  });

  it("keeps valid entries and drops malformed ones individually", () => {
    const content = parseTemplateContent({
      value_words: ["Tranquil", "", 42, "Authentic", "Restorative", "Extra"],
      highlights: [
        { title: "Farm-to-table dining", description: "Local ingredients.", icon: "dining" },
        { title: "" },
        { title: "Spa", icon: "not-an-icon" },
        { title: "River walks" },
      ],
      offer: { enabled: true, title: "Stay longer, save more", ctaUrl: "javascript:alert(1)" },
    });
    expect(content.valueWords).toEqual(["Tranquil", "Authentic", "Restorative"]);
    expect(content.highlights).toEqual([
      { title: "Farm-to-table dining", description: "Local ingredients.", icon: "dining" },
      { title: "River walks", description: "", icon: "stay" },
    ]);
    expect(content.offer).toBeNull();
  });

  it("accepts same-site and https offer links only", () => {
    const base = { enabled: true, title: "Offer" };
    expect(offerSchema.safeParse({ ...base, ctaUrl: "/p/demo/book" }).success).toBe(true);
    expect(offerSchema.safeParse({ ...base, ctaUrl: "https://example.com/offer" }).success).toBe(true);
    expect(offerSchema.safeParse({ ...base, ctaUrl: "//evil.example" }).success).toBe(false);
    expect(offerSchema.safeParse({ ...base, ctaUrl: "http://example.com" }).success).toBe(false);
    expect(offerSchema.safeParse({ ...base, imageUrl: "http://example.com/a.jpg" }).success).toBe(false);
  });

  it("shows an offer only when enabled", () => {
    const offer = offerSchema.parse({ enabled: false, title: "Offer" });
    expect(visibleOffer(offer)).toBeNull();
    expect(visibleOffer({ ...offer, enabled: true })?.title).toBe("Offer");
  });
});

describe("publicGalleryUrls", () => {
  it("keeps https image URLs only", () => {
    expect(publicGalleryUrls(["https://a.example/1.jpg", "http://a.example/2.jpg", 3, "data:image/png;base64,xx"])).toEqual(["https://a.example/1.jpg"]);
    expect(publicGalleryUrls(null)).toEqual([]);
  });
});

describe("directHeroPhotos", () => {
  const rooms = [
    { name: "Standard", image_url: "https://a.example/s.jpg" },
    { name: "Deluxe", image_url: null, gallery_urls: ["https://a.example/d.jpg"] },
    { name: "No photo", image_url: null },
    { name: "Suite", image_url: "https://a.example/su.jpg" },
  ];
  it("prefers the property gallery, uncaptioned", () => {
    expect(directHeroPhotos(["https://g.example/1.jpg"], rooms)).toEqual([{ url: "https://g.example/1.jpg" }]);
  });
  it("falls back to room photographs captioned with the room name, up to three", () => {
    expect(directHeroPhotos([], rooms)).toEqual([
      { url: "https://a.example/s.jpg", caption: "Standard" },
      { url: "https://a.example/d.jpg", caption: "Deluxe" },
      { url: "https://a.example/su.jpg", caption: "Suite" },
    ]);
  });
  it("returns nothing when there are no photographs", () => {
    expect(directHeroPhotos([], [{ name: "x" }])).toEqual([]);
  });
});
