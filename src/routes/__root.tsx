import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouter } from "@tanstack/react-router";
import { useRef, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import appCss from "../styles.css?url";
import { BackToTop } from "@/components/site/BackToTop";
import { PWALifecycle } from "@/components/site/PWALifecycle";
import { ConciergeWidget } from "@/components/site/ConciergeWidget";
import { Toaster } from "@/components/ui/sonner";
import { trackPageView } from "@/lib/analytics";

function NotFoundComponent() { return <div className="flex min-h-screen items-center justify-center bg-background px-4"><div className="max-w-md text-center"><h1 className="text-7xl font-bold">404</h1><h2 className="mt-4 text-xl font-semibold">Page not found</h2><p className="mt-2 text-sm text-muted-foreground">The page you're looking for doesn't exist or has been moved.</p><Link to="/rooms" className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">View rooms</Link></div></div>; }
const fallbackQueryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60 * 1000, refetchOnWindowFocus: false } } });

export const Route = createRootRoute({
  head: () => ({ meta: [
    { charSet:"utf-8" }, { name:"viewport", content:"width=device-width, initial-scale=1" },
    { title:"StayNas — Hospitality Operating System" }, { name:"description", content:"StayNas is a hospitality operating system for reservations, operations, guest experience and intelligent hospitality." },
    { name:"author", content:"StayNas" }, { property:"og:title", content:"StayNas — Hospitality Operating System" },
    { property:"og:description", content:"Connected hospitality operations and intelligent guest experiences." }, { property:"og:type", content:"website" },
    { property:"og:site_name", content:"StayNas" }, { name:"theme-color", content:"#0F3D3A" }
  ], links:[
    { rel:"stylesheet", href:appCss }, { rel:"icon", href:"/favicon.ico", sizes:"any" }, { rel:"manifest", href:"/site.webmanifest" },
    { rel:"preconnect", href:"https://fonts.googleapis.com" }, { rel:"preconnect", href:"https://fonts.gstatic.com", crossOrigin:"anonymous" },
    { rel:"stylesheet", href:"https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600&family=Inter:wght@300;400;500;600&display=swap" }
  ], scripts:[{type:"text/javascript",children:"(function(){try{if(location.pathname.indexOf('/admin')!==0)return;var p=localStorage.getItem('staynas-os.theme')||'system';var d=p==='dark'||(p==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-os-theme',d?'dark':'light');}catch(e){}})();"}] }),
  shellComponent: RootShell, component: RootComponent, notFoundComponent: NotFoundComponent,
});
function RootShell({children}:{children:React.ReactNode}) { return <html lang="en" suppressHydrationWarning><head><HeadContent/></head><body>{children}<Scripts/></body></html>; }
function GoogleAnalytics(){const router=useRouter();const prev=useRef<string|null>(null);useEffect(()=>router.subscribe("onResolved",()=>{const href=router.state.location.href;if(href!==prev.current){trackPageView(router.state.location.pathname,document.title);prev.current=href;}}),[router]);return null;}
function RootComponent(){const router=useRouter();const pathname=router.state.location.pathname;const isAdmin=pathname.startsWith("/admin")||pathname.startsWith("/auth")||pathname.startsWith("/api");const [conciergeOpen,setConciergeOpen]=useState(false);return <QueryClientProvider client={fallbackQueryClient}><Outlet/><BackToTop conciergeOpen={conciergeOpen}/><GoogleAnalytics/><PWALifecycle/><Toaster position="top-center" richColors/>{!isAdmin&&<ConciergeWidget onOpenChange={setConciergeOpen}/>}</QueryClientProvider>;}
