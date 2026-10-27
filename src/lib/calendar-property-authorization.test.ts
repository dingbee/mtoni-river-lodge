import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migration = (name: string) =>
  readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");

describe("StayNas calendar property authorization migrations", () => {
  it("derives calendar privileges from active membership in the requested property", async () => {
    const sql = await migration("20261027170000_staynas_calendar_intelligence_p3.sql");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.staynas_calendar_has_property_role");
    expect(sql).toContain("pm.property_id = _property_id");
    expect(sql).toContain("pm.status = 'active'");
    expect(sql).toContain("pm.role = ANY(_roles)");
    expect(sql).not.toContain("public.has_any_role(");
  });

  it("does not use global roles for P3 schedule or occurrence access", async () => {
    const p3 = await migration("20261027170000_staynas_calendar_intelligence_p3.sql");
    const durable = await migration("20261027180000_staynas_calendar_durable_occurrences.sql");
    expect(p3).not.toContain("public.has_any_role(");
    expect(durable).not.toContain("public.has_any_role(");
    expect(p3).toContain("staynas_calendar_has_property_role(auth.uid(), property_id");
    expect(p3).toContain("staynas_calendar_has_property_role(v_uid, _property_id");
    expect(durable).toContain("staynas_calendar_has_property_role(v_uid, _property_id");
  });

  it("uses property roles for the existing operational calendar RPCs", async () => {
    const sql = await migration("20261027183000_staynas_calendar_property_scoped_authorization.sql");
    expect(sql).toContain("staynas_calendar_has_property_role(\n    _uid, _property_id");
    expect(sql).toContain("staynas_calendar_has_property_role(\n        _uid, _property_id");
    expect(sql).not.toContain("public.has_any_role(");
  });
});
