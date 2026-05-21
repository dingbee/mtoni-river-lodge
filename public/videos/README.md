# Hero background video

Drop the cinematic hero loop here so the homepage hero (`HeroCinematic`)
can play it. The component looks for these files by default:

- `mtoni-hero.webm` — preferred (smaller, modern codec)
- `mtoni-hero.mp4`  — fallback (H.264, broad compatibility)

## Recommended encoding

- Resolution: 1920×1080 (or 1280×720 for a lighter file)
- Duration: 15–30 s, seamless loop
- No audio track (the player is muted; stripping audio shrinks the file)
- Target size: < 6 MB for mobile-friendly loading
- Color: warm earthy grade, slight contrast lift — matches the on-page tint

### Suggested ffmpeg commands

```bash
# H.264 MP4 (universal fallback)
ffmpeg -i source.mov -an -vf "scale=1920:-2" -c:v libx264 -preset slow \
  -crf 24 -pix_fmt yuv420p -movflags +faststart mtoni-hero.mp4

# VP9 WebM (preferred)
ffmpeg -i source.mov -an -vf "scale=1920:-2" -c:v libvpx-vp9 \
  -b:v 0 -crf 34 -row-mt 1 mtoni-hero.webm
```

Until the file is added the hero gracefully falls back to the static
`hero-river.jpg` poster, so the page never breaks.