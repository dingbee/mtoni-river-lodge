import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouter } from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { BackToTop } from "@/components/site/BackToTop";
import { TawkToWidget } from "@/components/site/TawkToWidget";

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
  const prevPathRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const unsubscribe = router.subscribe("onResolved", () => {
      const currentPath = router.state.location.href;
      if (typeof window !== "undefined" && window.gtag && currentPath !== prevPathRef.current) {
        window.gtag("event", "page_view", {
          page_location: currentPath,
          page_path: router.state.location.pathname,
          page_title: document.title,
        });
        prevPathRef.current = currentPath;
      }
    });
    return () => unsubscribe();
  }, [router]);

  return null;
}

function RootComponent() {
  return (
    <>
      <Outlet />
      <BackToTop />
      <TawkToWidget />
      <GoogleAnalytics />
    </>
  );
}
