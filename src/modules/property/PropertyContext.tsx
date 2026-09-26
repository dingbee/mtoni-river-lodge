import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listStayNasProperties,
  setStayNasActiveProperty,
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

const FALLBACK_PROPERTY: StayNasProperty = {
  id: "property-nolmark-demo",
  organisationId: "org-nolmark-cdma",
  name: "StayNas Demo Property",
  code: "DEMO",
  timezone: "Africa/Dar_es_Salaam",
  currency: "USD",
  status: "active",
};

const STORAGE_KEY = "staynas.active-property";

type PropertyContextValue = {
  organisation: StayNasOrganisation;
  properties: StayNasProperty[];
  property: StayNasProperty;
  setProperty: (propertyId: string) => void;
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
  const listFn = useServerFn(listStayNasProperties);
  const setActiveFn = useServerFn(setStayNasActiveProperty);
  const [properties, setProperties] = useState<StayNasProperty[]>([FALLBACK_PROPERTY]);
  const [activePropertyId, setActivePropertyId] = useState(FALLBACK_PROPERTY.id);
  const [organisation, setOrganisation] = useState<StayNasOrganisation>({
    id: FALLBACK_PROPERTY.organisationId,
    name: "StayNas",
    properties: [FALLBACK_PROPERTY],
  });

  useEffect(() => {
    let cancelled = false;

    void listFn()
      .then((rows) => {
        if (cancelled || !rows.length) return;

        const mapped = rows.map(toProperty);
        const stored = (() => {
          try {
            return localStorage.getItem(STORAGE_KEY);
          } catch {
            return null;
          }
        })();

        const preferred = mapped.find((p) => p.id === stored);
        const serverActive = mapped.find((p) => rows.find((r) => r.id === p.id)?.is_active);
        const active = preferred ?? serverActive ?? mapped[0];

        setProperties(mapped);
        setActivePropertyId(active.id);
        setOrganisation({
          id: rows[0].organisation_id,
          name: rows[0].organisation_name,
          properties: mapped,
        });
      })
      .catch(() => {
        // The fallback keeps the shell usable if the property service is temporarily unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [listFn]);

  const setProperty = useCallback(async (propertyId: string) => {
    if (!properties.some((p) => p.id === propertyId)) return;
    try {
      await setActiveFn({ data: { propertyId } });
      setActivePropertyId(propertyId);
      try {
        localStorage.setItem(STORAGE_KEY, propertyId);
      } catch {
        // Storage is optional.
      }
    } catch {
      // Do not switch the UI if the server rejects property access.
    }
  }, [properties, setActiveFn]);

  const property = useMemo(
    () => properties.find((p) => p.id === activePropertyId) ?? properties[0],
    [activePropertyId, properties],
  );

  const value = useMemo(() => ({
    organisation,
    properties,
    property,
    setProperty,
  }), [organisation, properties, property, setProperty]);

  return <PropertyContext.Provider value={value}>{children}</PropertyContext.Provider>;
}

export function usePropertyContext() {
  const value = useContext(PropertyContext);
  if (!value) throw new Error("usePropertyContext must be used inside PropertyProvider");
  return value;
}
