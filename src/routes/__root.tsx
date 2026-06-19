import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouter } from "@tanstack/react-router";
import { useRef, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    dataLayer: unknown[];
  }
}

import appCss from "../styles.css?url";
import { BackToTop } from "@/components/site/BackToTop";
import { TawkToWidget } from "@/components/site/TawkToWidget";
import { Toaster } from "@/components/ui/sonner";
import { trackPageView } from "@/lib/analytics";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

const fallbackQueryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60 * 1000, refetchOnWindowFocus: false },
  },
});

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Mtoni River Lodge — A Riverfront Sanctuary in Arusha, Tanzania" },
      { name: "description", content: "An intimate luxury eco-lodge on the banks of the Mtoni River in Arusha. Riverside rooms, fireside dining, and curated journeys into the heart of Tanzania." },
      { name: "author", content: "Mtoni River Lodge" },
      { property: "og:title", content: "Mtoni River Lodge — A Riverfront Sanctuary in Arusha, Tanzania" },
      { property: "og:description", content: "An intimate luxury eco-lodge on the banks of the Mtoni River in Arusha. Riverside rooms, fireside dining, and curated journeys into the heart of Tanzania." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Mtoni River Lodge — A Riverfront Sanctuary in Arusha, Tanzania" },
      { name: "twitter:description", content: "An intimate luxury eco-lodge on the banks of the Mtoni River in Arusha. Riverside rooms, fireside dining, and curated journeys into the heart of Tanzania." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/SHkcQELriCO5cdR2YzaTl25G7pE2/social-images/social-1778599166460-1000489399.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/SHkcQELriCO5cdR2YzaTl25G7pE2/social-images/social-1778599166460-1000489399.webp" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500;600&display=swap" },
    ],
    scripts: [
      {
        type: "text/javascript",
        async: true,
        src: "https://www.googletagmanager.com/gtag/js?id=GT-55XDHB82",
      },
      {
        type: "text/javascript",
        children: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'GT-55XDHB82');
        `,
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": "https://mtoniriverlodge.com/#organization",
              name: "Mtoni River Lodge",
              url: "https://mtoniriverlodge.com",
              logo: "https://mtoniriverlodge.com/__l5e/assets-v1/73e0339b-9bf5-43f8-b083-ec13fde6b001/mtoni-river-lodge-logo.png",
              email: "bookings@mtoniriverlodge.com",
              telephone: "+255752441443",
              address: {
                "@type": "PostalAddress",
                streetAddress: "Gomba Estate",
                addressLocality: "Arusha",
                addressRegion: "Arusha",
                addressCountry: "TZ",
              },
              contactPoint: [
                {
                  "@type": "ContactPoint",
                  telephone: "+255752441443",
                  contactType: "reservations",
                  email: "bookings@mtoniriverlodge.com",
                  areaServed: "Worldwide",
              availableLanguage: ["English", "Swahili"],
            },
          ],
          geo: {
            "@type": "GeoCoordinates",
            latitude: -3.435813,
            longitude: 36.794313,
          },
            },
            {
              "@type": ["Hotel", "LodgingBusiness"],
              "@id": "https://mtoniriverlodge.com/#hotel",
              name: "Mtoni River Lodge",
              url: "https://mtoniriverlodge.com",
              description:
                "Luxury eco-lodge in Arusha, Tanzania offering 24 riverfront rooms on the banks of the Nduruma River.",
              numberOfRooms: 24,
              image:
                "https://storage.googleapis.com/gpt-engineer-file-uploads/SHkcQELriCO5cdR2YzaTl25G7pE2/social-images/social-1778599166460-1000489399.webp",
              email: "bookings@mtoniriverlodge.com",
              telephone: "+255752441443",
              priceRange: "$$$",
              address: {
                "@type": "PostalAddress",
                streetAddress: "Gomba Estate",
                addressLocality: "Arusha",
                addressRegion: "Arusha",
                addressCountry: "TZ",
              },
              geo: {
                "@type": "GeoCoordinates",
                latitude: -3.435813,
                longitude: 36.794313,
              },
              amenityFeature: [
                "Swimming Pool",
                "Restaurant",
                "Riverfront Setting",
                "Free WiFi",
                "Airport Transfers",
                "Guided Experiences",
              ].map((name) => ({
                "@type": "LocationFeatureSpecification",
                name,
                value: true,
              })),
              parentOrganization: { "@id": "https://mtoniriverlodge.com/#organization" },
            },
            {
              "@type": "WebSite",
              "@id": "https://mtoniriverlodge.com/#website",
              url: "https://mtoniriverlodge.com",
              name: "Mtoni River Lodge",
              publisher: { "@id": "https://mtoniriverlodge.com/#organization" },
              potentialAction: {
                "@type": "SearchAction",
                target: {
                  "@type": "EntryPoint",
                  urlTemplate:
                    "https://mtoniriverlodge.com/journal?q={search_term_string}",
                },
                "query-input": "required name=search_term_string",
              },
            },
          ],
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function GoogleAnalytics() {
  const router = useRouter();
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = router.subscribe("onResolved", () => {
      const currentPath = router.state.location.href;
      if (currentPath !== prevPathRef.current) {
        trackPageView(router.state.location.pathname, document.title);
        prevPathRef.current = currentPath;
      }
    });
    return () => unsubscribe();
  }, [router]);

  return null;
}

function RootComponent() {
  return (
    <QueryClientProvider client={fallbackQueryClient}>
      <Outlet />
      <BackToTop />
      <TawkToWidget />
      <GoogleAnalytics />
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
