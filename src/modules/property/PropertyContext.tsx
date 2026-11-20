import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  listStayNasProperties,
  setStayNasActiveProperty,
  updateStayNasPropertyCurrency,
  type StayNasPropertyRecord,
} from "./property.functions";

export type StayNasProperty = {
  id: string;
  organisationId: string;
  name: string;
  code: string;
  timezone: string;
  currency: string;
  status: "active" | "setup" | "suspended";
};

export type StayNasOrganisation = {
  id: string;
  name: string;
  properties: StayNasProperty[];
};

// Explicit unavailable state; it has no property identity and no default currency.
const EMPTY_PROPERTY: StayNasProperty = {
  id: "",
  organisationId: "",
  name: "",
  code: "",
  timezone: "",
  currency: "",
  status: "setup",
};

type PropertyContextValue = {
  organisation: StayNasOrganisation;
  properties: StayNasProperty[];
  property: StayNasProperty;
  setProperty: (propertyId: string) => void;
  status: "loading" | "ready" | "error";
  error: string | null;
  updateCurrency: (currency: string) => Promise<void>;
};

const PropertyContext = createContext<PropertyContextValue | null>(null);

function toProperty(row: StayNasPropertyRecord): StayNasProperty {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    name: row.name,
    code: row.code,
    timezone: row.timezone,
    currency: row.currency,
    status: row.status,
  };
}

export function PropertyProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listStayNasProperties);
  const setActiveFn = useServerFn(setStayNasActiveProperty);
  const updateCurrencyFn = useServerFn(updateStayNasPropertyCurrency);
  const [properties, setProperties] = useState<StayNasProperty[]>([]);
  const [activePropertyId, setActivePropertyId] = useState("");
  const [organisation, setOrganisation] = useState<StayNasOrganisation>({ id: "", name: "", properties: [] });
  const [status, setStatus] = useState<PropertyContextValue["status"]>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void listFn()
      .then(async (rows) => {
        if (cancelled) return;
        const mapped = rows.map(toProperty);
        const active = mapped.find((p) => rows.find((r) => r.id === p.id)?.is_active) ?? null;
        if (cancelled) return;
        setProperties(mapped);
        setActivePropertyId(active?.id ?? "");
        setOrganisation({
          id: rows[0]?.organisation_id ?? "",
          name: rows[0]?.organisation_name ?? "",
          properties: mapped,
        });
        if (!active) {
          setError("No active property is selected. Select an authorised property to continue.");
          setStatus("error");
          return;
        }
        setError(null);
        setStatus("ready");
      })
      .catch((cause) => {
        if (cancelled) return;
        setProperties([]);
        setActivePropertyId("");
        setOrganisation({ id: "", name: "", properties: [] });
        setError(cause instanceof Error ? cause.message : "Property context could not be loaded.");
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [listFn, setActiveFn]);

  const setProperty = useCallback(async (propertyId: string) => {
    if (!properties.some((p) => p.id === propertyId)) return;
    try {
      await setActiveFn({ data: { propertyId } });
      setActivePropertyId(propertyId);
      setError(null);
      setStatus("ready");
    } catch {
      // Do not switch the UI if the server rejects property access.
    }
  }, [properties, setActiveFn]);

  const updateCurrency = useCallback(async (currency: string) => {
    if (!activePropertyId) throw new Error("An active property is required before changing its currency.");
    const result = await updateCurrencyFn({ data: { currency } });
    if (result.propertyId !== activePropertyId) throw new Error("The active property changed during the currency update. Reload the property context before continuing.");
    setProperties((current) => current.map((item) =>
      item.id === result.propertyId ? { ...item, currency: result.currency } : item,
    ));
    setOrganisation((current) => ({
      ...current,
      properties: current.properties.map((item) =>
        item.id === result.propertyId ? { ...item, currency: result.currency } : item,
      ),
    }));
    await queryClient.invalidateQueries();
  }, [activePropertyId, queryClient, updateCurrencyFn]);

  const property = useMemo(
    () => properties.find((p) => p.id === activePropertyId) ?? EMPTY_PROPERTY,
    [activePropertyId, properties],
  );

  const value = useMemo(() => ({
    organisation,
    properties,
    property,
    status,
    error,
    setProperty,
    updateCurrency,
  }), [organisation, properties, property, status, error, setProperty, updateCurrency]);

  return <PropertyContext.Provider value={value}>{children}</PropertyContext.Provider>;
}

export function usePropertyContext() {
  const value = useContext(PropertyContext);
  if (!value) throw new Error("usePropertyContext must be used inside PropertyProvider");
  return value;
}
