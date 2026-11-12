import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import {
  guestPortalCategories,
  guestRequestStatusLabel,
  validateGuestPortalPhotoMeta,
  buildGuestPortalUrl,
  guestPortalOrigin,
  isGuestPortalStayEligible,
} from "./guest-portal.shared";

describe("guest portal photo validation", () => {
  it("accepts supported image types with matching extensions", () => {
    expect(validateGuestPortalPhotoMeta("room.jpg", "image/jpeg", 1024)).toBeNull();
    expect(validateGuestPortalPhotoMeta("room.png", "image/png", 1024)).toBeNull();
    expect(validateGuestPortalPhotoMeta("room.webp", "image/webp", 1024)).toBeNull();
  });

  it("rejects mismatched types, unsupported files and oversized uploads", () => {
    expect(validateGuestPortalPhotoMeta("room.png", "image/jpeg", 1024)).not.toBeNull();
    expect(validateGuestPortalPhotoMeta("document.pdf", "application/pdf", 1024)).not.toBeNull();
    expect(
      validateGuestPortalPhotoMeta("room.jpg", "image/jpeg", 8 * 1024 * 1024 + 1),
    ).not.toBeNull();
    expect(validateGuestPortalPhotoMeta("room.jpg", "image/jpeg", 0)).not.toBeNull();
  });
});

describe("guest portal request presentation", () => {
  it("maps internal lifecycle states to guest language", () => {
    expect(guestRequestStatusLabel("received")).toBe("Received");
    expect(guestRequestStatusLabel("triaged")).toBe("Confirmed");
    expect(guestRequestStatusLabel("in_progress")).toBe("In progress");
    expect(guestRequestStatusLabel("fulfilled")).toBe("Completed");
    expect(guestRequestStatusLabel("escalated")).toBe("Needs attention");
  });

  it("restricts issue reporting to issue-oriented categories", () => {
    expect(guestPortalCategories("issue")).toEqual([
      "maintenance",
      "complaint",
      "service_recovery",
      "other",
    ]);
    expect(guestPortalCategories("service")).toContain("housekeeping");
  });
});

describe("guest portal bearer URL and QR generation", () => {
  const token = "a".repeat(43);

  it("builds only the canonical guest route from the bearer credential", () => {
    expect(buildGuestPortalUrl("https://staynas.nolmark.co", token)).toBe(
      `https://staynas.nolmark.co/guest/${token}`,
    );
  });

  it("rejects malformed credentials and unsafe origins", () => {
    expect(() => buildGuestPortalUrl("https://staynas.nolmark.co", "short")).toThrow();
    expect(() => buildGuestPortalUrl("javascript:alert(1)", token)).toThrow();
    expect(() => buildGuestPortalUrl("https://user:pass@staynas.nolmark.co", token)).toThrow();
  });

  it("generates a local high-correction PNG QR from the exact share URL", async () => {
    const url = buildGuestPortalUrl("https://staynas.nolmark.co", token);
    const png = await QRCode.toDataURL(url, {
      errorCorrectionLevel: "H",
      margin: 4,
      width: 1200,
    });
    expect(png.startsWith("data:image/png;base64,")).toBe(true);
    const qr = QRCode.create(url, { errorCorrectionLevel: "H" });
    expect(qr.modules.size).toBeGreaterThan(0);
    expect(qr.segments.map((segment) => String(segment.data)).join("")).toBe(url);
  });
});

describe("guest portal environment origin", () => {
  it("uses the explicitly configured approved UAT or production origin", () => {
    expect(guestPortalOrigin("https://preview.vercel.app", "https://uat.staynas.example"))
      .toBe("https://uat.staynas.example");
  });

  it("accepts the canonical production and approved UAT hosts", () => {
    expect(guestPortalOrigin("https://staynas.nolmark.co")).toBe("https://staynas.nolmark.co");
    expect(guestPortalOrigin("https://uat.staynas.com")).toBe("https://uat.staynas.com");
  });

  it("rejects aliases, previews and local development hosts without explicit approval", () => {
    expect(() => guestPortalOrigin("https://staynas.com")).toThrow();
    expect(() => guestPortalOrigin("https://preview.vercel.app")).toThrow();
    expect(() => guestPortalOrigin("http://localhost:3000")).toThrow();
    expect(() => guestPortalOrigin("http://staynas.nolmark.co")).toThrow();
  });
});


describe("guest portal checkout grace eligibility", () => {
  it("allows checked-in stays and only unexpired completed-stay grace", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isGuestPortalStayEligible("checked_in", future)).toBe(true);
    expect(isGuestPortalStayEligible("checked_in", past)).toBe(false);
    expect(isGuestPortalStayEligible("completed", future)).toBe(true);
    expect(isGuestPortalStayEligible("completed", past)).toBe(false);
    expect(isGuestPortalStayEligible("cancelled", future)).toBe(false);
    expect(isGuestPortalStayEligible("confirmed", future)).toBe(false);
  });
});
