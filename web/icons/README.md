# Icons

`icon.svg` is the master. iOS Safari requires PNG for `apple-touch-icon`, so before going live, export PNGs at:

- `icon-192.png` (192×192) — manifest
- `icon-512.png` (512×512) — manifest splash
- `apple-touch-icon.png` (180×180) — iOS home screen

Quick generation:

```bash
# macOS:
brew install librsvg
rsvg-convert -w 180 -h 180 icon.svg -o apple-touch-icon.png
rsvg-convert -w 192 -h 192 icon.svg -o icon-192.png
rsvg-convert -w 512 -h 512 icon.svg -o icon-512.png

# or with Inkscape:
inkscape icon.svg --export-type=png --export-width=180 --export-filename=apple-touch-icon.png
```

Until those exist, iOS will fall back to the SVG (works in Safari 17+).
