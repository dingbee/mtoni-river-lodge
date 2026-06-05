import { useEffect, useId, useRef, useState } from "react";

const TRIPADVISOR_URL =
  "https://www.tripadvisor.com/Hotel_Review-g297913-d27185811-Reviews-Mtoni_River_Lodge-Arusha_Arusha_Region.html";
const TRIPADVISOR_LOGO =
  "https://static.tacdn.com/img2/brand_refresh/Tripadvisor_lockup_horizontal_secondary_registered.svg";
const SCRIPT_SRC =
  "https://www.jscache.com/wejs?wtype=excellent&uniq=641&locationId=27185811&lang=en_US&display_version=2";
const SCRIPT_ID = "tripadvisor-excellent-641";

type Props = {
  className?: string;
  label?: string;
};

export function TripadvisorExcellentWidget({ className = "", label }: Props) {
  const uniqueListId = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);

  // Lazy-load: only attach script once the widget enters the viewport.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const el = wrapRef.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !inView) return;
    let cancelled = false;
    let timeoutId: number | undefined;

    const markLoaded = () => {
      if (cancelled) return;
      // Detect injection: Tripadvisor replaces inner content of #TA_excellent641
      const ok = !!containerRef.current?.querySelector("iframe, .widSSP, .widTAR");
      if (ok) setLoaded(true);
      else setFailed(true);
    };

    const attach = () => {
      const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
      if (existing) {
        // Script already present — re-evaluate so widget renders into new container
        try {
          const reRun = document.createElement("script");
          reRun.src = SCRIPT_SRC;
          reRun.async = true;
          reRun.onerror = () => !cancelled && setFailed(true);
          document.body.appendChild(reRun);
        } catch {
          if (!cancelled) setFailed(true);
        }
        timeoutId = window.setTimeout(markLoaded, 2500);
        return;
      }
      const s = document.createElement("script");
      s.id = SCRIPT_ID;
      s.src = SCRIPT_SRC;
      s.async = true;
      s.onerror = () => !cancelled && setFailed(true);
      document.body.appendChild(s);
      timeoutId = window.setTimeout(markLoaded, 2500);
    };

    attach();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [inView]);

  if (failed) {
    return (
      <div className={`flex justify-center ${className}`}>
        <div className="w-full max-w-md rounded-2xl border border-charcoal/10 bg-ivory/80 p-8 text-center shadow-sm">
          <img
            src={TRIPADVISOR_LOGO}
            alt="Tripadvisor"
            className="mx-auto h-8 w-auto"
            loading="lazy"
          />
          <p className="mt-5 text-sm text-charcoal/75">
            View our latest guest reviews on Tripadvisor.
          </p>
          <a
            href={TRIPADVISOR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#2f4a3a] px-6 py-3 text-[0.7rem] uppercase tracking-[0.28em] text-ivory transition-colors hover:bg-[#243a2d]"
          >
            Read Reviews <span aria-hidden>↗</span>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className={`flex w-full justify-center ${className}`}>
      <div
        className="ta-excellent-wrap flex w-full max-w-md items-center justify-center"
        style={{ minHeight: 110 }}
      >
        {label ? (
          <span className="sr-only">{label}</span>
        ) : null}
        <div
          id="TA_excellent641"
          className="TA_excellent"
          ref={containerRef}
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            width: "100%",
            overflow: "hidden",
          }}
        >
          <ul id={`ta-${uniqueListId}`} className="TA_links">
            <li>
              <a
                target="_blank"
                rel="noopener noreferrer"
                href={TRIPADVISOR_URL}
              >
                <img
                  src={TRIPADVISOR_LOGO}
                  alt="Tripadvisor Reviews - Mtoni River Lodge"
                  className="widEXCIMG"
                  style={{ height: 36, width: "auto" }}
                />
              </a>
            </li>
          </ul>
        </div>
        {/* hidden helper to satisfy loaded state if script renders */}
        <span aria-hidden style={{ display: "none" }}>{loaded ? "loaded" : ""}</span>
      </div>
    </div>
  );
}

export default TripadvisorExcellentWidget;