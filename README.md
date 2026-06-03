# Heraldry Weaver

Procedural and custom heraldry for Obsidian — for worldbuilders and TTRPG GMs.
Generate or hand-build coats of arms, save them, embed them in notes (block or
inline), export to image, and drive it all from templates.

## Using it

Open the panel from the **shield ribbon icon** or the command **Open Heraldry
Weaver panel**. The panel has two modes:

- **Roll** — Generate from a name/seed, or Roll 1 / Roll 9 random named results.
  Click any result to select it, then Save.
- **Build** — Manual control: shield shape (heater / French / Spanish / lozenge
  / round), field (plain / divided / variation) with metal, colour, and **fur**
  tinctures — the eight standard furs plus custom recoloured furs via the fur
  editor — an ordinary, and **layered charge groups**: add several charges, each
  with its own tincture, count, arrangement, 3×3 position, scale, rotation, and
  horizontal/vertical mirroring. Live preview with a rule-of-tincture hint.

Shared actions: **Save** (to the in-plugin library), **Copy reference**,
**Insert block**, **SVG**, **PNG**, **Copy config**, **Import config**.

Saved arms appear in the **library** beneath the preview (ten most recent).
**Browse all…** opens a searchable grid; the **All / Used / Unused** dropdown
scans your notes so you can find saved arms that aren't referenced anywhere — a
quick way to prune. Click any entry to load it; hover to delete.

### Displaying arms in notes

Block (full shield + name + blazon + buttons):

````markdown
```heraldry
name: House Aldori
motto: Strength and honor
```
````

By default a block shows interactive buttons (Reroll / Save / SVG / PNG). Add
`controls: false` (or a bare `static` line) to render a fixed shield with no
buttons — best for finished notes. Blocks added with **Insert block** are static
by default; change that under **Settings → Inserting blocks**.

Inline (sized to the text line — works inside tables / ITS infoboxes):

```markdown
| Ruling house | `heraldry:House Aldori` House Aldori |
```

Inline syntax is `` `heraldry:[key][|size]` ``. An empty key falls back to the
note title; `size` is a px number (e.g. `120`) or any CSS length (e.g. `4em`),
which is what you want for an infobox image slot:

```markdown
> [!infobox]+
> # {{name}}
> `heraldry:|120`
> ###### Stats
> | Type | Stat |
> | --- | --- |
```

Because the empty-key inline and a bare block both resolve to the note title,
the infobox shield and a content-body block show the **same** arms automatically.

### Random arms, linked across the page

Seeding from the title is deterministic — the same note name always yields the
same arms. For *random* arms that are still identical between the infobox shield
and the body block, put a seed in the note's frontmatter (property name set in
**Settings → Names → Seed property**, default `heraldry-seed`). Every bare
reference on the page reads it, so they stay in sync:

```markdown
---
heraldry-seed: <% Date.now().toString(36) + Math.random().toString(36).slice(2, 6) %>
---
# {{name}}
> [!infobox]+
> # {{name}}
> `heraldry:|120`
...

```heraldry
```
````

The Templater expression rolls a fresh seed once at creation, so each note gets
unique arms; both bare references read that one seed, so they match; and because
the seed is saved in frontmatter, the arms stay stable every time the note is
re-rendered. Precedence is: an explicit `seed:` in a block beats the frontmatter
seed, which beats a saved entry / the note title.

A reference resolves to a **saved** entry if one exists, otherwise it is
generated deterministically from the text. A block may also carry an explicit
`seed:` so it reproduces exact rolled arms without being saved.

## Public API

`app.plugins.plugins["heraldry-weaver"].api`

| Method | Returns |
|---|---|
| `generate(seed)` | a spec |
| `generateName(seed)` | a place/house name |
| `generateArms(seed)` | `{ seed, spec, blazon, svg }` |
| `toBlazon(spec)` | blazon string |
| `svg(seedOrName)` | raw SVG string |
| `block(name, { seed?, unique?, motto? })` | a fenced ```heraldry block string |
| `inline(name)` | an inline reference token |
| `saveArms(name, spec)` | persists to the library |
| `getArms(name)` / `listArms()` | library access |
| `encodeConfig(spec)` / `decodeConfig(str)` | shareable config string |

## Town Forge integration (none required)

Town Forge creates a note whose **title is the place name**, so there is nothing
to wire up: a bare block seeds itself from the note it lives in.

Put this in your Town Forge note template (or any note):

````markdown
```heraldry
```
````

It renders arms seeded from the note's title — open "Restov", get Restov's arms,
stable forever, no template code and no saving. Same for an inline shield with an
empty key (handy in an infobox):

```markdown
| Arms | `heraldry:` |
```

If a saved entry matches the note title, that saved coat is used; otherwise it's
generated from the title. Override per-note with an explicit `name:`/`seed:` line
when you want something other than the title. The `api.block(...)` /
`api.inline(...)` helpers remain for templates that want to pass an explicit name
or bake a unique random seed.

## Custom name sources

Rolled names come from the built-in generator by default (deterministic per
seed). To pull names from elsewhere, open **Settings → Names** and switch
**Name source** to **Custom script**. You get a JavaScript box whose body
returns one name; in scope are `app`, `api`, and `seed`, where `api` is bound to
the `.api` of the plugin named in **Connector plugin id** (default `randomness`).
For example, to roll a Randomness table:

```js
return (await api.rollUnscoped("TF-ThievesGuildName")).result;
```

The **Run once** button tests it and shows the result. Any error falls back to
the built-in generator, so rolling never breaks. Scripted names are not
deterministic per seed (the arms still are).

For programmatic control, the API also exposes
`setNameProvider((seed) => name)` (sync or async) and `clearNameProvider()`.
Register a provider on load — e.g. from a Templater startup script — and it
takes precedence over the setting:

```js
const hw = app.plugins.plugins["heraldry-weaver"].api;
hw.setNameProvider(async () => (await app.plugins.plugins["randomness"].api.rollUnscoped("MyNames")).result);
```

A provider is a live function, so it isn't persisted — re-register it on load if
you want it permanent.

## Custom assets (import)

Heraldry Weaver reads standard **SVG** and **WMF** vector art, so it works with
commercial heraldic art packs such as **[heraldryclipart.com](https://www.heraldryclipart.com/)**.
**No third-party artwork ships with the plugin** — it stays free of bundled
assets — but anything you purchase there (or any SVG/WMF you already own) drops
straight in. WMF is the vector format those sites provide; EPS isn't supported,
but their assets ship a WMF twin.

### Where files go

Set an **asset folder** in **Settings → Custom assets** (default `Heraldry
Weaver`). Inside it, six **reserved subfolders** each map to one element type:

| Subfolder | Holds |
|---|---|
| `charges/` | individual charges (lions, crosses, stars…) |
| `ordinaries/` | fesses, bends, chevrons, saltires… |
| `shields/` | escutcheon outlines |
| `fields/` | background images / full field art |
| `variations/` | tiling field patterns |
| `furs/` | semé / fur sheets used as recolourable tinctures |

Click **Create subfolders** in settings to make them all at once, drop your
files into the matching folder, then run **Reload custom assets** (command or
the settings button). Each file appears in the relevant picker by filename, and
**nested folders** within any reserved subfolder become categories in that
picker.

### Colours & rolls

Imported **charges** and **ordinaries** are silhouette-recoloured to the chosen
tincture by default; turn *Recolour imported charges* off, or use the per-item
**Original colours** toggle and per-colour remap to keep or recolour the art's
own palette. **Image fields** add a background-tincture control, **size and
X/Y offset** sliders to fine-tune the fit (useful when the art's shape doesn't
match the shield), plus the same colour editor, and **furs** are recolourable
tinctures usable on fields and divisions. By default custom content is **excluded from random rolls** to keep
generation's curated look — switch on **Include custom content in rolls** to let
the dice draw from everything in your reserved folders.

### Bundled charge pack

Separately, an optional **bundled charge pack** — ~28 fantasy charges (lion,
eagle, wolf, dragon, castle, ship, crown, and more) from
[game-icons.net](https://game-icons.net) under CC BY 3.0, recoloured to the
chosen tincture — ships with the plugin and appears in the Build mode Charge
dropdown out of the box. Toggle the pack off in settings if you only want your
own. See `CREDITS.md` for attribution.

### Charge packs and attribution

Good free sources of fantasy charge SVGs:

- **game-icons.net** — ~4,000 icons, CC BY 3.0 (attribution required).
- **RPG-Awesome** (raw SVGs) — derived from game-icons.net, CC BY 3.0; the CSS
  is MIT and the font is SIL OFL 1.1.

These are usable in a free plugin **with credit**. If you bundle any of these,
keep a `CREDITS.md` listing each source, its author, and its licence; CC BY 3.0
requires attribution but not share-alike.

## Licence

Plugin code: MIT. Bundled artwork (if any) is credited separately per its
licence.
