import { createContext, useContext, useEffect, useMemo, useState } from "react";

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

const DEMO_ORGANISATION: StayNasOrganisation = {
  id: "org-staynas-demo",
  name: "StayNas Demo Organisation",
  properties: [
    {
      id: "property-mtoni",
      organisationId: "org-staynas-demo",
      name: "Mtoni River Lodge",
      code: "MTONI",
      timezone: "Africa/Dar_es_Salaam",
      currency: "USD",
      status: "active",
    },
  ],
};

const STORAGE_KEY = "staynas.active-property";

type PropertyContextValue = {
  organisation: StayNasOrganisation;
  properties: StayNasProperty[];
  property: StayNasProperty;
  setProperty: (propertyId: string) => void;
};

const PropertyContext = createContext<PropertyContextValue | null>(null);

export function PropertyProvider({ children }: { children: React.ReactNode }) {
  const [activePropertyId, setActivePropertyId] = useState(DEMO_ORGANISATION.properties[0].id);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && DEMO_ORGANISATION.properties.some((p) => p.id === stored)) {
        setActivePropertyId(stored);
      }
    } catch {
      // Storage is optional; the default property remains usable.
    }
  }, []);

  const setProperty = (propertyId: string) => {
    if (!DEMO_ORGANISATION.properties.some((p) => p.id === propertyId)) return;
    setActivePropertyId(propertyId);
    try {
      localStorage.setItem(STORAGE_KEY, propertyId);
    } catch {
      // Storage is optional.
    }
  };

  const value = useMemo(() => {
    const property =
      DEMO_ORGANISATION.properties.find((p) => p.id === activePropertyId) ??
      DEMO_ORGANISATION.properties[0];

    return {
      organisation: DEMO_ORGANISATION,
      properties: DEMO_ORGANISATION.properties,
      property,
      setProperty,
    };
  }, [activePropertyId]);

  return <PropertyContext.Provider value={value}>{children}</PropertyContext.Provider>;
}

export function usePropertyContext() {
  const value = useContext(PropertyContext);
  if (!value) throw new Error("usePropertyContext must be used inside PropertyProvider");
  return value;
}
