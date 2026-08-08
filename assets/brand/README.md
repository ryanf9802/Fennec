# Fennec brand assets

This directory is the source of truth for Fennec's visual identity. The SVGs
are resolution-independent and can be copied directly for documentation,
community pages, and future product surfaces.

## Choosing an asset

- `fennec-a-mark-primary.svg` is the default standalone mark.
- `fennec-a-mark-micro-primary.svg` is optically adjusted for 16–24 px use.
- `fennec-a-lockup-primary.svg` is the default horizontal logo.
- `*-cyan.svg` and `*-white.svg` are monochrome treatments for dark surfaces.
- `*-navy.svg` is the monochrome treatment for light surfaces.
- `fennec-a-reference-sheet.svg` previews the full set and palette.

Keep clear space around the standalone mark roughly equal to the width of its
lower stem. Do not recolor individual paths outside the supplied treatments.

The Windows runtime copies the primary mark from this directory.
Raster application icons in `src/Fennec.App/Assets` are generated derivatives;
run `tools/generate-icons.ps1` on Windows after changing the source artwork.

## Palette

- Cyan: `#65D9EE`
- Orange: `#FF8A3D`
- Navy: `#0B111D`
- Soft white: `#F7FAFF`
