# noop logo masters

SVG masters for the noop app icon. 1024×1024 viewBox, optically
centered italic N at weight 500.

## Files

| File | Purpose |
|---|---|
| `noop-icon-light.svg` | Light appearance — charcoal N on `#fafafa` |
| `noop-icon-dark.svg`  | Dark appearance — `#fafafa` N on `#09090b` |
| `noop-icon-tinted.svg` | Tinted appearance — white N on `#09090b`; iOS 18 tints the white from the user's wallpaper |

All three share identical glyph geometry — only the palette changes.

## Using these with Apple Icon Composer

1. Open **Icon Composer** (ships with Xcode 16+).
2. **File → New** → name it `noop` → save inside the project.
3. In the layers panel on the left, you'll see three slots: **Light**,
   **Dark**, **Tinted**.
4. Drag the matching SVG onto each slot.
5. **File → Export…** → choose the `apps/app/ios/noop/Images.xcassets/`
   directory. Icon Composer writes a `.icon` bundle that Xcode picks up
   on the next build.

## Font dependency

The SVGs reference the system font stack
(`-apple-system, BlinkMacSystemFont, 'SF Pro Display', …`). Icon
Composer on macOS renders these with **SF Pro Display Medium Italic**
since that's the first match in the stack — same glyph you saw in the
browser previews.

If you need to ship these to a non-Apple tool or want to be safe
against font availability, convert the `<text>` element to an outlined
`<path>` using:

```sh
# in any vector tool:
# Sketch:    Type → Convert Text to Outlines
# Affinity:  Layer → Convert to Curves
# Figma:     Right-click → Outline stroke (or Flatten)
# Inkscape:  Path → Object to Path
```

Save the outlined version alongside as `noop-icon-*.outlined.svg`.

## Color tokens

These match the inspector's palette so the brand reads consistently
across surfaces:

- `#09090b` — surface (the dark slate)
- `#fafafa` — text-0 (near-white)
