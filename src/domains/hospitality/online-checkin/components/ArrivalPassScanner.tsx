import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalisePassToken } from "../services/arrival-pass-shared";

/**
 * Reception QR capture. Camera decoding is loaded on demand (browser-only);
 * manual entry always works as a fallback on desktops without a camera.
 */
export function ArrivalPassScanner({
  onToken,
  busy,
}: {
  onToken: (token: string) => void;
  busy?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => () => stopRef.current?.(), []);

  const stop = () => {
    stopRef.current?.();
    stopRef.current = null;
    setScanning(false);
  };

  const start = async () => {
    setError(null);
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current ?? undefined,
        (result) => {
          const text = result?.getText();
          if (!text) return;
          stop();
          onToken(normalisePassToken(text));
        },
      );
      stopRef.current = () => controls.stop();
      setScanning(true);
    } catch {
      setError("Camera unavailable — enter the pass code manually below.");
      setScanning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-[18px] border border-border bg-[color:var(--os-surface)]/40">
        <video
          ref={videoRef}
          className={`aspect-video w-full object-cover ${scanning ? "" : "hidden"}`}
          muted
          playsInline
        />
        {!scanning && (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 text-center">
            <ScanLine className="h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="max-w-xs text-xs text-muted-foreground">
              Point the camera at the guest&apos;s arrival pass QR code, or enter the code manually.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {scanning ? (
          <Button type="button" variant="outline" size="sm" onClick={stop}>
            <CameraOff className="mr-2 h-4 w-4" /> Stop camera
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={() => void start()} disabled={busy}>
            <Camera className="mr-2 h-4 w-4" /> Start camera
          </Button>
        )}
      </div>

      {error && <p className="text-xs text-[color:var(--os-warn)]">{error}</p>}

      <form
        className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const token = normalisePassToken(manual);
          if (token.length >= 24) onToken(token);
        }}
      >
        <Input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Paste arrival pass code or link"
          aria-label="Arrival pass code"
        />
        <Button type="submit" variant="outline" disabled={busy || manual.trim().length < 24}>
          Look up
        </Button>
      </form>
    </div>
  );
}
