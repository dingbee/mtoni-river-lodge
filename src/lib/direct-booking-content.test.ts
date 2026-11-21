import { describe, expect, it } from "vitest";
import { activeSocialLinks, directHeroPhotos, EMPTY_TEMPLATE_SETTINGS, hasTemplateColumns, normalizeSocialLink, offerSchema, parseSocialLinks, parseTemplateSettings, socialLinkProblem, socialLinksSchema, telHref, parseTemplateContent, publicGalleryUrls, visibleOffer } from "./direct-booking-content";

describe("parseTemplateContent", () => {
  it("returns empty content when the branding row is missing or predates the template columns", () => {
    const empty = { valueWords: [], highlights: [], offer: null, template: EMPTY_TEMPLATE_SETTINGS, socialLinks: {} };
    expect(parseTemplateContent(null)).toEqual(empty);
    expect(parseTemplateContent({ tagline: "x" })).toEqual(empty);
    expect(hasTemplateColumns({ tagline: "x" })).toBe(false);
    expect(hasTemplateColumns({ value_words: [], highlights: [], offer: null })).toBe(false);
    expect(hasTemplateColumns({ value_words: [], highlights: [], offer: null, template: {} })).toBe(true);
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
      { title: "Farm-to-table dining", description: "Local ingredients.", icon: "dining", linkUrl: "" },
      { title: "River walks", description: "", icon: "stay", linkUrl: "" },
    ]);
    expect(content.offer).toBeNull();
  });

  it("accepts same-site and https offer links only", () => {
    const base = { enabled: true, title: "Offer" };
    expect(offerSchema.safeParse({ ...base, ctaUrl: "/p/demo/book" }).success).toBe(true);
    expect(offerSchema.safeParse({ ...base, ctaUrl: "https://example.com/offer" }).success).toBe(true);
    expect(offerSchema.safeParse({ ...base, ctaUrl: "#rooms" }).success).toBe(true);
    expect(offerSchema.safeParse({ ...base, ctaUrl: "#" }).success).toBe(false);
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
  it("falls back to room photographs captioned with the room name", () => {
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

describe("template settings", () => {
  it("defaults every field to empty so nothing is shown that the property did not enter", () => {
    expect(parseTemplateSettings(null)).toEqual(EMPTY_TEMPLATE_SETTINGS);
    expect(EMPTY_TEMPLATE_SETTINGS.hero.headline).toBe("");
    expect(EMPTY_TEMPLATE_SETTINGS.rating.value).toBeNull();
    expect(EMPTY_TEMPLATE_SETTINGS.photoCards).toEqual([]);
  });

  it("keeps valid sections when another section is invalid", () => {
    const parsed = parseTemplateSettings({
      hero: { headline: "Nature.\nComfort.\nYou.", videoUrl: "http://insecure.example/video.mp4" },
      rating: { value: 4.9, label: "Loved by guests" },
      photoCards: [{ imageUrl: "https://a.example/1.jpg", caption: "Sanctuaries" }, { imageUrl: "not a url" }],
      contact: { email: "reservations@example.com" },
    });
    expect(parsed.hero).toEqual(EMPTY_TEMPLATE_SETTINGS.hero);
    expect(parsed.rating.value).toBe(4.9);
    expect(parsed.photoCards).toEqual([{ imageUrl: "https://a.example/1.jpg", caption: "Sanctuaries" }]);
    expect(parsed.contact.email).toBe("reservations@example.com");
  });

  it("rejects ratings outside 0–5", () => {
    expect(parseTemplateSettings({ rating: { value: 7 } }).rating.value).toBeNull();
  });
});

describe("social links", () => {
  it("keeps https links for known networks only, in display order", () => {
    const links = parseSocialLinks({ facebook: "https://facebook.com/x", instagram: "https://instagram.com/x", myspace: "https://myspace.com/x", youtube: "http://youtube.com/x" });
    expect(links).toEqual({ facebook: "https://facebook.com/x", instagram: "https://instagram.com/x" });
    expect(activeSocialLinks(links).map(([network]) => network)).toEqual(["instagram", "facebook"]);
  });
});

describe("social link normalisation and contact links", () => {
  it("turns a WhatsApp number into a wa.me link and adds https to bare domains", () => {
    expect(normalizeSocialLink("whatsapp", "+255 712 345 678")).toBe("https://wa.me/255712345678");
    expect(normalizeSocialLink("instagram", "instagram.com/nolmark")).toBe("https://instagram.com/nolmark");
    expect(normalizeSocialLink("facebook", "  ")).toBe("");
  });

  it("rejects links that point at the wrong network or are insecure", () => {
    expect(socialLinkProblem("instagram", "https://facebook.com/x")).toMatch(/not a instagram/);
    expect(socialLinkProblem("youtube", "http://youtube.com/x")).toMatch(/https/);
    expect(socialLinkProblem("x", "https://twitter.com/x")).toBeNull();
    expect(socialLinkProblem("whatsapp", "https://wa.me/255712345678")).toBeNull();
    expect(socialLinkProblem("tripadvisor", "https://www.tripadvisor.co.uk/Hotel_Review-x")).toBeNull();
  });

  it("drops invalid stored links when rendering", () => {
    expect(parseSocialLinks({ instagram: "https://evil.example/x", whatsapp: "+255 712 345 678", facebook: "" })).toEqual({ whatsapp: "https://wa.me/255712345678" });
  });

  it("validates admin input and reports the network at fault", () => {
    expect(socialLinksSchema.safeParse({ instagram: "instagram.com/a", tiktok: "" }).data).toEqual({ instagram: "https://instagram.com/a" });
    const bad = socialLinksSchema.safeParse({ linkedin: "https://example.com" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0].message).toMatch(/^linkedin:/);
  });

  it("builds dialer-safe phone links", () => {
    expect(telHref("+255 (712) 345-678")).toBe("tel:+255712345678");
    expect(telHref("0712 345 678")).toBe("tel:0712345678");
    expect(telHref("call us")).toBe("");
  });
});
