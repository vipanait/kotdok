# Landing: app download — verification

Task report for `docs/superpowers/plans/2026-10-19-landing-app-download.md`, not a roadmap stage.
Checked on 2026-10-19 on branch `web/landing-app-download`, `npm run dev:staging` at localhost:3000.

## Commands

| Check | Result |
|---|---|
| `npm run lint --workspace @lapka/web` | exit 0 |
| `npm run typecheck --workspace @lapka/web` | exit 0 |
| `npm run build --workspace @lapka/web` | exit 0 |
| `npm test --workspace @lapka/web` | 64 files, 528 tests passed |

## QR codes

`apps/web/public/images/app-download/qr-*.svg` rendered to PNG with `rsvg-convert` on a white background and decoded with the macOS Vision framework (`VNDetectBarcodesRequest`):

| File | Decoded | `APP_STORE_LINKS` |
|---|---|---|
| qr-ios.svg | `https://apps.apple.com/app/id6813030153` | `ios`, identical |
| qr-android.svg | `https://play.google.com/store/apps/details?id=my.lapka.app` | `android`, identical |

The plan's App Store link had the Indonesian storefront (`/id/app/…`): a click on a computer opened the Indonesian page. On the owner's choice the link has no storefront, so Apple opens the visitor's own store; `qr-ios.svg` was regenerated with `toqr` 0.1.1 (already in node_modules via @expo/cli), error correction M, 4-module white quiet zone, and decoded again. `qr-android.svg` is the design's file, unchanged. `docs/design/app-download` keeps the mockup's old iOS code.

Both URLs answer 200. Not scanned with a phone camera: no phone at hand during the check.

## Layout

Viewport emulation in the in-app browser; `scrollWidth` equals the viewport width at every size.

| Width | App block | Header «Приложение» |
|---|---|---|
| 320 | two buttons, 56 px high | visible |
| 390 | two buttons, 56 px high | visible |
| 700 | two buttons | visible |
| 768 | both QR cards, under the text | visible |
| 1024 | both QR cards, beside the text | visible |
| 1440 | both QR cards, beside the text; matches `docs/design/app-download/desktop.png` | visible |

- The phone switch uses the site's existing 760 px breakpoint, not the mockup's 700 px; 761–900 px put the QR cards under the text.
- Signed-in header at 320 px simulated by putting «Личный кабинет» into the account button: the nav wraps to two rows and the header grows to 114 px; nothing clipped, no horizontal scroll. Before the fix the fixed 85 px header pushed «Приложение» above the top edge.
- EN at 390 px: «How Lapka works», the new disclaimer, «Get it on App Store» / «Get it on Google Play» on one line each, 56 px.
- After review: the store-link arrow no longer takes the caption style (14 px, text colour, was 11 px muted); at 800 px the scan hint is centred under the cards (centre 258 px = cards centre, was 400 px).
- The hidden variant is `display: none`, so its links are out of the Tab order and the accessibility tree.

## Navigation

- «Приложение» on `/legal` → `/#app`, the section scrolled into view.
- The main button still leads a guest to `/register`; `LandingContent` keeps the `/check` branch for a signed-in user unchanged.

## Screenshots

- [desktop-1440.png](landing-app-download/desktop-1440.png)
- [mobile-390.png](landing-app-download/mobile-390.png)

Both taken from headless Chrome with DevTools device emulation; the round «N» is the Next.js dev indicator.
