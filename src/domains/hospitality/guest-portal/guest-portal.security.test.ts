import { describe, expect, it } from "vitest";
import {
  guestPortalCategories,
  guestRequestStatusLabel,
  validateGuestPortalPhotoMeta,
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
