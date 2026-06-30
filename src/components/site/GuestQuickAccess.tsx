import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  BedSingle,
  MessageCircle,
  UtensilsCrossed,
  Compass,
  Map,
  MapPin,
  Mountain,
  Binoculars,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WHATSAPP_URL, DIRECTIONS_URL } from "@/lib/contact";

function getIsStandalone(): boolean {
  if (typeof window === "undefined") return false;

  // iOS Safari / WebClip (iPhone/iPad Add to Home Screen)
  if ((window.navigator as { standalone?: boolean }).standalone === true) {
    return true;
  }

  // Chrome/Edge/Android desktop-installed PWA modes
  if (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches
  ) {
    return true;
  }

  // Android Trusted Web Activity (TWA) / opened from Google Play
  if (document.referrer?.startsWith("android-app://")) {
    return true;
  }

  return false;
}

function useIsStandalonePWA(): boolean {
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Avoid hydration mismatch by only detecting on the client.
    setIsStandalone(getIsStandalone());

    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const overlayQuery = window.matchMedia(
      "(display-mode: window-controls-overlay)"
    );

    const update = () => setIsStandalone(getIsStandalone());

    // Modern API first, with legacy addListener fallback for older Safari.
    if (typeof standaloneQuery.addEventListener === "function") {
      standaloneQuery.addEventListener("change", update);
      overlayQuery.addEventListener("change", update);
    } else {
      (standaloneQuery as { addListener?: (cb: () => void) => void }).addListener?.(
        update
      );
      (overlayQuery as { addListener?: (cb: () => void) => void }).addListener?.(
        update
      );
    }

    return () => {
      if (typeof standaloneQuery.removeEventListener === "function") {
        standaloneQuery.removeEventListener("change", update);
        overlayQuery.removeEventListener("change", update);
      } else {
        (
          standaloneQuery as { removeListener?: (cb: () => void) => void }
        ).removeListener?.(update);
        (
          overlayQuery as { removeListener?: (cb: () => void) => void }
        ).removeListener?.(update);
      }
    };
  }, []);

  return isStandalone;
}

const items = [
  {
    label: "Book a Room",
    description: "Check live availability",
    href: "/book",
    icon: BedSingle,
    external: false,
  },
  {
    label: "WhatsApp Reception",
    description: "Message our team",
    href: WHATSAPP_URL,
    icon: MessageCircle,
    external: true,
  },
  {
    label: "Dining",
    description: "Riverside cuisine",
    href: "/dining",
    icon: UtensilsCrossed,
    external: false,
  },
  {
    label: "Experiences",
    description: "Walks, cycling & more",
    href: "/experiences",
    icon: Compass,
    external: false,
  },
  {
    label: "Explore the Property",
    description: "Rooms & grounds",
    href: "/stay",
    icon: Map,
    external: false,
  },
  {
    label: "Directions",
    description: "Open in Google Maps",
    href: DIRECTIONS_URL,
    icon: MapPin,
    external: true,
  },
  {
    label: "Kilimanjaro Climbers",
    description: "Pre-climb stays",
    href: "/mount-kilimanjaro-accommodation-arusha",
    icon: Mountain,
    external: false,
  },
  {
    label: "Safari Planning",
    description: "Plan your journey",
    href: "/plan",
    icon: Binoculars,
    external: false,
  },
] as const;

function ActionCard({
  item,
}: {
  item: (typeof items)[number];
}) {
  const Icon = item.icon;
  const className = cn(
    "group relative flex flex-col items-center justify-center gap-4 rounded-sm border border-charcoal/10 bg-ivory p-6 text-center transition-all duration-300",
    "hover:-translate-y-1 hover:border-charcoal/20 hover:bg-bone hover:shadow-soft",
    "active:scale-[0.98] active:duration-100",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "min-h-[120px] sm:min-h-[140px]"
  );

  const contents = (
    <>
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-bone text-primary transition-colors duration-300 group-hover:bg-ivory group-hover:text-forest">
        <Icon className="h-6 w-6" strokeWidth={1.4} aria-hidden="true" />
      </span>
      <span className="flex flex-col items-center gap-1">
        <span className="font-display text-base leading-tight text-charcoal sm:text-lg">
          {item.label}
        </span>
        <span className="text-xs text-charcoal/60">{item.description}</span>
      </span>
    </>
  );

  if (item.external) {
    return (
      <a
        href={item.href}
        className={className}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${item.label} — ${item.description}`}
      >
        {contents}
      </a>
    );
  }

  return (
    <Link
      to={item.href}
      className={className}
      aria-label={`${item.label} — ${item.description}`}
    >
      {contents}
    </Link>
  );
}

export function GuestQuickAccess() {
  const isStandalone = useIsStandalonePWA();

  // Render nothing on the server and during normal browser visits.
  // This preserves the existing homepage layout for non-PWA users.
  if (!isStandalone) {
    return null;
  }

  return (
    <section
      aria-label="Guest quick access"
      className="relative bg-bone px-5 py-10 sm:px-6 lg:px-12 lg:py-16"
    >
      <div className="mx-auto max-w-[1300px]">
        <h2 className="sr-only">Guest Quick Access</h2>
        <nav aria-label="Quick access">
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-5">
            {items.map((item) => (
              <li key={item.label}>
                <ActionCard item={item} />
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}
