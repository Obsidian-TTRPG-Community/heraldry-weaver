# Changelog

All notable changes to Heraldry Weaver are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## [1.5.0] - 2026-08-01

### Added

- **Counterchanged charges and ordinaries.** On a divided or varied field, a
  charge or ordinary can be blazoned *counterchanged*: it takes the field's two
  tinctures in reverse, so each part of it shows the opposite of the region it
  lies on. Rendered by painting the swapped field through the element's own
  silhouette, so it works uniformly across every division and variation, keeps
  fur patterns aligned, and needs no per-division geometry. The **Build** panel
  grows a *Counterchanged* toggle (shown only when the field has two distinct
  region tinctures), the blazon reads "... counterchanged", and counterchanged
  elements are exempt from the rule-of-tincture hint. Fields that cannot be
  counterchanged — plain fields, imported field art, imported tiling variations
  — ignore the flag and fall back to the element's own tincture.

## [1.4.1] - 2026-06-07

### Fixed

- Plugin-review compliance. Declared `minAppVersion` 1.7.2 (matches the
  `revealLeaf` Promise API in use) and replaced direct `style` assignments with
  `setCssStyles`, clearing both reviewer errors. Also: `TextEncoder`-based
  base64 instead of deprecated `escape`/`unescape`; `activeDocument` for
  popout-window compatibility; command ids/names no longer repeat the plugin
  id/name; fire-and-forget promises marked with `void`; and a few `any`-typed
  accesses tightened. `versions.json` is no longer attached as a release asset
  (Obsidian reads it from the repository).

## [1.4.0] - 2026-06-06

### Added

- **Flags.** A **Format** toggle (Shield / Flag) renders the same arms on a flag
  instead of a shield, with a full roster of shapes: **flag** (3:2), **square
  banner**, **vertical banner**, **swallowtail**, **double swallowtail**,
  **burgee**, **pennon**, **tapered pennon**, **streamer**, **gonfalon** (three
  tails), **gonfalon swallowtail**, **pointed**, **rounded**, and **ragged**
  banners. The field and ordinary scale into the flag outline (full-width fess,
  corner-to-corner saltire); charges are placed undistorted. Shields unchanged.

## [1.3.0] - 2026-06-03

### Added

- **Charge rotation** — each charge group has a **rotation** slider (±180°),
  spinning charges about their own centre. Combines with scale and horizontal/
  vertical mirroring; positions and arrangement are preserved. Random rolls keep
  charges upright. Round-trips through saved arms and config strings.

## [1.2.0] - 2026-06-01

A large update centred on **bringing your own artwork in**. Heraldry Weaver now
imports external vector art for every part of a shield, not just charges, and
gives you fine colour and placement control over it. Fully backward compatible:
existing saved arms and config strings are unchanged, and default random rolls
are byte-for-byte identical to 1.1.0.

### Added

- **Custom asset imports for five element types.** A single **asset folder**
  with reserved type-subfolders, each importing `.svg` or `.wmf` files:
  - `charges/` — individual charges
  - `ordinaries/` — fesses, bends, chevrons, saltires…
  - `shields/` — escutcheon outlines
  - `fields/` — background images / full field art
  - `variations/` — tiling field patterns
  - `furs/` — semé / fur sheets used as recolourable tinctures

  Nested folders within any of these become **categories** in the relevant
  picker. A **Create subfolders** button in settings scaffolds them all.
- **WMF (Windows Metafile) import** — the vector format sold by commercial
  heraldic art sites such as [heraldryclipart.com](https://www.heraldryclipart.com/).
  Parses filled polygons/paths, brush colours, and fill rules; normalises to a
  tight, origin-aligned viewBox.
- **Custom furs** — imported semé/diaper sheets register as tinctures usable on
  **fields and divisions**, rendered by cover-fill, and **recolourable** to any
  tincture from the fur editor's new *Imported furs* section.
- **Per-charge and per-ordinary colour control** — an *Original colours* toggle
  plus a per-colour **remap** palette, so an imported emblem can keep its own
  colours, be remapped colour-by-colour, or flattened to a silhouette tincture.
- **Image-field colour & placement controls** — image fields gain a
  **background tincture** (fills transparent areas of the art), the same
  *Original colours* / per-colour remap editor, and **size + X/Y offset**
  sliders to fit art whose shape doesn't match the shield.
- **Ordinary placement controls** — a **size** slider and a **centre-offset**
  slider, plus automatic **ink-cropping** so imported ordinaries centre on the
  artwork itself (not on any padding in the source canvas) and span the field
  at 1×.
- **Include custom content in rolls** — an opt-in setting that lets the Roll
  generator draw from all your imported assets (charges, ordinaries, shields,
  fields, variations, furs). Off by default so rolls stay reproducible.
- **Documentation** — a *Compatible art packs* note in settings and an expanded
  README explaining heraldryclipart.com support, that no third-party artwork
  ships with the plugin, and exactly where to drop files.

### Changed

- The *Custom charges* settings section is now **Custom assets**; the reload
  command is **Reload custom assets** and covers every imported type.
- README's import section rewritten from "Custom charges" to **"Custom assets
  (import)"** with a per-folder reference table.

### Notes

- No third-party artwork ships with the plugin; imports are SVG/WMF you supply
  or purchase. EPS is not supported (those packs include a WMF twin).
- The renderer remains dependency-light — no `sharp`/`jsdom` in the bundle.

## [1.1.0] - 2026-05-30

- Custom (recoloured) furs via the fur editor; the eight standard furs as
  tinctures on fields and divisions.

## [1.0.0]

- Initial release: procedural and hand-built coats of arms, a saved-arms
  library, block and inline embedding, SVG/PNG export, a public API, custom
  name sources, and a bundled fantasy charge pack.

[1.5.0]: https://github.com/Obsidian-TTRPG-Community/heraldry-weaver/releases/tag/1.5.0
[1.4.1]: https://github.com/Obsidian-TTRPG-Community/heraldry-weaver/releases/tag/1.4.1
[1.4.0]: https://github.com/Obsidian-TTRPG-Community/heraldry-weaver/releases/tag/1.4.0
[1.3.0]: https://github.com/Obsidian-TTRPG-Community/heraldry-weaver/releases/tag/1.3.0
[1.2.0]: https://github.com/Obsidian-TTRPG-Community/heraldry-weaver/releases/tag/1.2.0
[1.1.0]: https://github.com/Obsidian-TTRPG-Community/heraldry-weaver/releases/tag/1.1.0
[1.0.0]: https://github.com/Obsidian-TTRPG-Community/heraldry-weaver/releases/tag/1.0.0
