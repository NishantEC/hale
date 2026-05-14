# noop — logo & app icon design

**Status:** approved, implemented
**Date:** 2026-05-14

## Context

The app's display name changed from "app" to "noop" and the previous
icon set was generic. We wanted a brand mark that:

- Reads as the letter **N** at app-icon scale
- Feels in the same family as WHOOP's circle-mark (minimal, geometric,
  letterform-driven) but doesn't copy it
- Works as a single design with **three iOS 18 appearance variants**
  (light / dark / tinted) so the OS swaps automatically
- Renders identically across tools (Icon Composer, Figma, browsers) —
  no font-lookup risk

The system around it (Sprints 1–4 plus the inspector work) is unchanged.
This spec covers only the visual identity and the asset wiring.

## Final design

**Glyph:** the letter "N" in **SF Pro Italic, Medium (weight 500)**, at
`font-size = 560` on a 1024×1024 canvas, optically centered at
`(512, 720)` baseline.

**Outlined as path data**, so the SVGs do not depend on the renderer
having SF Pro installed. The outline was extracted from
`/System/Library/Fonts/SFNSItalic.ttf` with the `wght` variable axis
set to 500 via `opentype.js`.

**Palette (monochrome only):**

- `#fafafa` — near-white surface (matches inspector's text-0 token)
- `#09090b` — deep slate (matches inspector's surface token)

**Three appearance variants:**

| Variant | Background | Glyph | Used when |
|---|---|---|---|
| Light | `#fafafa` | `#09090b` | iOS Light appearance, fallback |
| Dark | `#09090b` | `#fafafa` | iOS Dark appearance |
| Tinted | `#09090b` | `#ffffff` | iOS 18 tinted icon mode — system tints the white glyph from the wallpaper |

The geometry is identical across all three; only the fill colors differ.

## Why this design

- **The N is the brand.** "noop" is short and starts with N; a
  monogram is more memorable at icon scale than the wordmark would be.
- **Italic medium (not black).** Earlier rounds tested weights 700/900;
  they felt heavy and competed with neighboring app icons. 500 reads
  refined without being timid.
- **No ring / circle frame.** Initial WHOOP-inspired rounds had a
  circle. After dropping it the icon feels modern and lets the glyph
  own the canvas. The ring is in the design history if we want it
  back.
- **Outlined path, not text.** Font-stack-based SVGs render differently
  in Icon Composer vs the browser vs Figma. Baking the glyph into
  geometry makes it portable.

## Asset layout

```
apps/app/assets/logo/
├── README.md
├── noop-icon-light.svg / .png         (1024×1024)
├── noop-icon-dark.svg  / .png         (1024×1024)
├── noop-icon-tinted.svg / .png        (1024×1024)
├── noop-icon-android.png              (1024×1024, full bleed legacy)
├── noop-icon-android-foreground.png   (1024×1024, ~64% safe area)
├── noop-icon-android-background.png   (1024×1024, solid slate)
├── noop-splash-light.svg / .png       (transparent + #09090b glyph)
└── noop-splash-dark.svg  / .png       (transparent + #fafafa glyph)
```

## Pipeline (how the icons reach the device)

**Path chosen: Expo's classic `AppIcon.appiconset` route.**

Source code at `node_modules/@expo/prebuild-config/build/plugins/icons/withIosIcons.js`. When `ios.icon` is an object with `light`/`dark`/`tinted` keys, Expo:

1. Rasterizes each PNG via sharp (already 1024×1024 in our case → no
   resize needed)
2. Writes them to `ios/<projectname>/Images.xcassets/AppIcon.appiconset/`
   with names `App-Icon-1024x1024@1x.png`,
   `App-Icon-dark-1024x1024@1x.png`,
   `App-Icon-tinted-1024x1024@1x.png`
3. Generates `Contents.json` marking each with the appropriate
   `appearances` array (`luminosity: dark`, `luminosity: tinted`)
4. iOS 18+ reads the appiconset and swaps variants based on user
   appearance setting — no app code needed

We deliberately did **not** use the `.icon` (Liquid Glass) bundle route.
That format is required only for animated icons, glass effects, and
parallax layers — overkill for a static monochrome glyph. Trade-off
documented for future revisit if we want richer icon behavior.

## app.json wiring

```jsonc
{
  "name": "noop",
  "slug": "noop",
  "scheme": "noop",
  "icon": "./assets/logo/noop-icon-light.png",
  "ios": {
    "icon": {
      "light":  "./assets/logo/noop-icon-light.png",
      "dark":   "./assets/logo/noop-icon-dark.png",
      "tinted": "./assets/logo/noop-icon-tinted.png"
    }
  },
  "android": {
    "icon": "./assets/logo/noop-icon-android.png",
    "adaptiveIcon": {
      "foregroundImage": "./assets/logo/noop-icon-android-foreground.png",
      "backgroundImage": "./assets/logo/noop-icon-android-background.png"
    }
  },
  "plugins": [
    ["expo-splash-screen", {
      "image": "./assets/logo/noop-splash-light.png",
      "imageWidth": 220,
      "resizeMode": "contain",
      "backgroundColor": "#fafafa",
      "dark": {
        "image": "./assets/logo/noop-splash-dark.png",
        "backgroundColor": "#09090b"
      }
    }]
  ]
}
```

Bundle identifier (`com.noopbase.noop.app`) is unchanged so existing
installs update in place.

## Build verification

To pick up the new icon, regenerate the native projects:

```sh
cd apps/app
pnpm prebuild:clean
```

This writes the new `AppIcon.appiconset` to
`apps/app/ios/noop/Images.xcassets/`. Xcode picks it up on the next
build (Release mode, ⌘R on a USB-connected iPhone — see
`apps/app/ios/noop.xcworkspace`).

The home screen icon should change to the italic N on first launch;
Settings → Appearance toggle should swap between light and dark
variants instantly. iOS 18 Tinted mode lives under Settings →
Wallpaper → Customize → Color filter.

## Open follow-ups (not blocking)

- **Web favicon** (`assets/images/app-icon-web-favicon.png`) still
  points at the old rotated-N asset. The inspector loads from there;
  trivial to regenerate when next touching the inspector.
- **Old `assets/images/app-icon-*.png`** files are now unused by
  `app.json` but still on disk. Safe to delete once the new icons are
  confirmed in a release build.
- **Apple Icon Composer / `.icon` route** documented but not used. If we
  ever want animated or glass-effect icons (iOS 18+), the source SVGs
  in `assets/logo/` are ready inputs for Icon Composer's three variant
  tabs.

## Files changed in this work

- **New** — `apps/app/assets/logo/` (10 files)
- **Modified** — `apps/app/app.json` (name, slug, scheme, icon paths,
  splash plugin config)
- **Modified** — `.gitignore` (added `.superpowers/` to exclude
  brainstorm session files)
- **New** — this spec
