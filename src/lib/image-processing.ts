// Browser-only image processing helpers. Do NOT import from server code.

export interface ProcessedImage {
  blob: Blob;
  filename: string;
  mime: string;
  width: number;
  height: number;
  size: number;
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Compress + convert an image file to WebP client-side using the canvas API.
 * Non-image files pass through unchanged.
 */
export async function processImage(
  file: File,
  opts: { maxWidth?: number; quality?: number; toWebp?: boolean } = {},
): Promise<ProcessedImage> {
  const maxWidth = opts.maxWidth ?? 2400;
  const quality = opts.quality ?? 0.82;
  const toWebp = opts.toWebp ?? true;

  if (!file.type.startsWith("image/") || file.type === "image/svg+xml" || file.type === "image/gif") {
    return { blob: file, filename: file.name, mime: file.type || "application/octet-stream", width: 0, height: 0, size: file.size };
  }

  const bitmap = await createImageBitmap(file);
  const scale = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2d context unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);

  const outMime = toWebp ? "image/webp" : file.type;
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), outMime, quality);
  });

  const baseName = file.name.replace(/\.[^./]+$/, "");
  const ext = toWebp ? "webp" : (file.name.split(".").pop() || "bin");
  return { blob, filename: `${baseName}.${ext}`, mime: outMime, width: w, height: h, size: blob.size };
}