import { useEffect } from "react";

const TAWK_SRC = "https://embed.tawk.to/6a0f40e2a548cd1c33c41430/1jp5paumt";

export function TawkToWidget() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).__tawkLoaded) return;

    const loadWidget = () => {
      (window as any).__tawkLoaded = true;

      // Set up Tawk_API before script injection so the widget picks up config
      const existing = (window as any).Tawk_API || {};
      (window as any).Tawk_API = existing;
      (window as any).Tawk_LoadStart = new Date();

      // Earthy / dark neutral styling aligned with Mtoni brand
      existing.customStyle = {
        visibility: {
          desktop: {
            position: "br",
            xOffset: 24,
            yOffset: 24,
            show: true,
          },
          mobile: {
            position: "br",
            xOffset: 16,
            yOffset: 80, // sits above the mobile sticky CTA (~60px tall)
            show: true,
          },
        },
        color: {
          theme: "#1E2D1E",      // deep forest / charcoal
          text: "#F2E3BB",       // ivory
          header: "#1E2D1E",
          headerText: "#F2E3BB",
          bubble: "#C0B87A",     // clay / gold accent
        },
      };

      // The remote Tawk dashboard settings have desktop visibility disabled
      // (`visibility.desktop.show = false`), which causes the widget to be
      // hidden on desktop even though customStyle requests it. Force-show
      // the widget once the API is ready, on both desktop and mobile.
      existing.onLoad = function () {
        try {
          (window as any).Tawk_API?.showWidget?.();
        } catch {}
      };
      existing.onStatusChange = function () {
        try {
          (window as any).Tawk_API?.showWidget?.();
        } catch {}
      };

      // Safety net: poll for a short window after load in case onLoad fires
      // before our handler is registered.
      let attempts = 0;
      const showInterval = setInterval(() => {
        attempts++;
        const api = (window as any).Tawk_API;
        if (api?.showWidget) {
          try { api.showWidget(); } catch {}
        }
        if (attempts > 20) clearInterval(showInterval);
      }, 500);

      const s1 = document.createElement("script");
      s1.type = "text/javascript";
      s1.async = true;
      s1.src = TAWK_SRC;
      s1.charset = "UTF-8";
      s1.setAttribute("crossorigin", "*");

      const s0 = document.getElementsByTagName("script")[0];
      if (s0 && s0.parentNode) {
        s0.parentNode.insertBefore(s1, s0);
      } else {
        document.body.appendChild(s1);
      }
    };

    // Lazy-load after main content / LCP
    const idleTimer = setTimeout(() => {
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(loadWidget, { timeout: 4000 });
      } else {
        loadWidget();
      }
    }, 2000);

    return () => clearTimeout(idleTimer);
  }, []);

  return null;
}
