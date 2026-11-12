import { describe, expect, it } from "vitest";
import { BookingPropertyError } from "@/lib/booking-property";
import { resolvePublicBookingContext } from "@/lib/public-booking-context.server";

describe("public booking property context", () => {
  it("rejects property slugs outside the server-owned publication allowlist", async () => {
    await expect(resolvePublicBookingContext("untrusted-property-slug")).rejects.toBeInstanceOf(
      BookingPropertyError,
    );
  });
});
