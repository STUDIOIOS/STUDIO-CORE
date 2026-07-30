# PFL x MVP — The Artist Series Opportunity

A one page consumer products and licensing case for Carl at PFL, written off the back of the
PFL and MVP merger announced 30 July 2026.

```
pfl-mvp-artist-series.html    source (A4 portrait, self-contained apart from assets/fonts.css)
assets/fonts.css              base64 embedded substitute fonts
STUDIO_IOS_PFL_MVP_ARTIST_SERIES_ONE_PAGER.pdf   the deliverable
SOURCES.md                    every figure on the page and where it came from
build.sh                      re-render the PDF after editing the HTML
```

## Fonts

The document is set in the Studio IOS system: Shapiro 65 Light Heavy Wide for headings, Apercu Mono
Pro Medium for body. Neither font was available on the machine this was built on, so the CSS falls
back to Archivo Expanded Bold and IBM Plex Mono, embedded in `assets/fonts.css`.

The font stacks name the house fonts first. Install Shapiro and Apercu Mono locally, run `build.sh`,
and the PDF re-renders in the real typefaces with no other change needed.

## Logo

The STUDIO IOS mark is set as type rather than the logo artwork, because `LOGO/STUDIO.png` was not
available here. Swap the two `.wordmark` spans for the PNG before this goes out.

## Re-rendering

```bash
./build.sh
```

Requires Chromium or Chrome. The script prints to A4 portrait at margin zero and the layout is pinned
to one page, so check the output after any copy edit: content that overruns is clipped rather than
pushed to a second page.
