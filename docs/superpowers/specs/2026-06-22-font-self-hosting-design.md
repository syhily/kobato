# Self-hosted web fonts via cn-font-split

> **Status:** design — pending implementation
> **Date:** 2026-06-22
> **Scope:** browser font delivery, CSP hardening, storage pipeline, admin UI

## Background

Custom web fonts are currently configured as **external CSS URLs** (Google Fonts,
etc.) stored in the `blog.fonts` settings row (`globalCss`/`postCss`/`codeCss`,
each a `z.array(z.url()).max(8)`). `src/root.tsx:192-200` renders a
`<link rel="stylesheet">` per URL into `<head>`, and `buildCspHeader()`
(`src/server/http/middleware-pipeline.ts:62-105`) extracts each URL's origin
per-request and appends it to `style-src`/`font-src`/`img-src`/`media-src`.

This has two problems:

1. **CSP weakening.** Arbitrary external origins are injected into the policy
   on every request. The more fonts configured, the wider the attack surface.
2. **Latent CSP bug.** The per-URL origin extraction only whitelists the CSS
   host. For providers where CSS and font files live on different origins
   (notably Google Fonts: CSS on `fonts.googleapis.com`, woff2 on
   `fonts.gstatic.com`), the woff2 fetches are blocked by `font-src`. This is
   silently broken today.

## Design decision: self-host via server-side slicing

Replace external CSS URLs with **uploaded font packages**. Each package is a
single `.ttf`/`.otf` uploaded through the admin UI, sliced into many small
woff2 chunks by **cn-font-split** running server-side (WASM), and stored
through the existing `StorageBackend` abstraction (local or S3). A generated
`result.css` manifest references the chunks via relative paths and is itself
stored alongside them. The browser loads a single self-hosted `<link>` per
package.

Because everything is served from `'self'` (local) or the asset CDN host
(already CSP-allowlisted at `middleware-pipeline.ts:76-78`), **the CSP issue
disappears entirely** — no per-font origin injection, no cross-origin font-file
blocking. The dynamic origin-extraction loop is deleted.

### Out of scope

- **Canvas (OG/calendar) fonts** stay as-is. They consume full TTFs server-side
  via `@napi-rs/canvas`; slicing them would break canvas rendering. The
  `FontsCanvasCard` in the settings UI and the `fonts.ts` upload resource for
  `og`/`calendar` slots are untouched.
- **Backwards compatibility for external CSS URLs.** Hard cutover: the
  `globalCss`/`postCss`/`codeCss` fields are dropped from the schema. Existing
  values are orphaned in the JSON row and silently ignored.

---

## Architecture

### Upload flow (synchronous, single request)

```
admin uploads .ttf/.otf + familyName
        │
        ▼
POST /api/admin/fonts/upload
   1. magic-byte validate (TTF/OTF) — matches image/branding precedent
   2. compute sha256 of the source buffer → packageHash
   3. if a font row with this hash already exists → return it (dedupe)
   4. write source buffer to a temp dir under DATA_PATH
   5. call sliceFont(sourcePath, destFold) → runs cn-font-split WASM
        → emits result.css + chunk-*.woff2 files in destFold
   6. storagePrefix = `fonts/<packageHash>/`
   7. stream every emitted file into activeBackend().put(...)
        contentType = font/woff2 (chunks) | text/css (result.css)
        visibility = public, cacheControl = immutable
   8. compute etag = sha256(result.css) for cache-busting
   9. INSERT font row → return it
  10. audit event font_uploaded
```

The request stays open for the full upload + slice + store cycle (several
seconds for a CJK font). The UI shows a spinner with "Processing font…" text
and the card is disabled until the response returns. No background worker, no
status enum, no polling — the row is only inserted on success, so there is no
`processing`/`failed` state to track.

### Render flow (SSR, `src/root.tsx`)

The `blog.fonts` loader resolves each slot's ordered font-id list into font
rows via a single batched query, producing:

```ts
fonts = {
  global: [{ familyName, cssKey, driver, etag }, ...],
  post:   [...],
  code:   [...],
}
```

In `<head>`, for each font across all three slots:

```tsx
<link rel="stylesheet" href={resolveAssetUrl(driver, cssKey, etagTs)} />
```

The `result.css` uses relative chunk paths (`./chunk-xxx.woff2`), which resolve
correctly under both local (`/fonts/embedded/<hash>/result.css`) and S3
(`https://<asset.host>/fonts/<hash>/result.css`) URL schemes — no rewriting
needed.

The `<html style="--font-body: …">` override is built by joining family names
in slot order, preserving the tail fallback:

```html
<html style="--font-body: 'FontA', 'FontB', serif"></html>
```

The `postFonts` opt-in (`handle.postFonts === true`) is preserved — post/code
fonts only load on routes that opt in (post detail, page detail, admin,
editor).

### Slot assignment flow

Three oRPC procedures manage slot membership without touching font rows:

| Procedure       | Body                        | Effect                                                                              |
| --------------- | --------------------------- | ----------------------------------------------------------------------------------- |
| `fonts.setSlot` | `{ slot, fontIds: uuid[] }` | Sets the slot's ordered list to the body. One endpoint covers add, remove, reorder. |

On `setSlot`, compare the old list to the new list. For each fontId **removed
from the slot**, compute its total reference count across all three slot
lists. If the count is now **zero** across all slots, garbage-collect: delete
the storage prefix `fonts/<hash>/` and the font row. Otherwise, only the slot
reference is updated.

This reference-counted GC is what makes cross-slot sharing safe: a font used
in both `global` and `post` is only deleted when removed from both.

### Delete flow

`fonts.delete({ fontId })` refuses (409) if the font is referenced by any
slot, returning which slots use it. The user must detach it from all slots
first (which triggers GC automatically). Direct delete exists only for
orphaned fonts (uploaded but never assigned).

---

## Data model

### New table: `font`

`src/server/infra/db/schema/config.ts`, alongside the existing `setting` table:

```ts
export const font = pgTable(
  'font',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyName: text('family_name').notNull(), // user-entered, used in font-family stack
    sourceName: text('source_name').notNull(), // original upload filename, for audit
    hash: text('hash').notNull().unique(), // sha256 of source TTF — content-addressed, dedupe key
    cssKey: text('css_key').notNull(), // 'fonts/<hash>/result.css'
    storageDriver: text('storage_driver').$type<StorageDriver>().notNull(),
    chunkCount: integer('chunk_count').notNull(),
    totalBytes: bigint('total_bytes', { mode: 'number' }).notNull(),
    etag: text('etag').notNull(), // sha256 of result.css, for cache-busting
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('font_family_idx').on(t.familyName)],
)
```

No `status` column — rows are only inserted on successful synchronous slice.
No `slot` column — slot membership lives in the settings row (a font can be in
zero, one, or multiple slots).

The `hash` unique constraint enables **content-addressed dedup**: uploading
the same TTF twice returns the existing row without re-slicing.

### Settings schema changes

`src/server/domains/settings/schemas/fonts.ts`:

```diff
- globalCss:   z.array(z.url()).max(8),
- globalFamily: z.string(),
- postCss:     z.array(z.url()).max(8),
- postFamily:  z.string(),
- codeCss:     z.array(z.url()).max(8),
- codeFamily:  z.string(),
+ global: z.array(z.string().uuid()).max(8),   // ordered font.id list
+ post:   z.array(z.string().uuid()).max(8),
+ code:   z.array(z.string().uuid()).max(8),
```

The `og` and `calendar` fields (Canvas family names) are unchanged.

`src/shared/config/types.ts` `FontsSettings` DTO mirrors this shape. The
`FontsSettingsBundle` loader resolves the font-id lists into font rows at load
time (batched query).

### Migration

A single drizzle-kit migration:

1. `CREATE TABLE font (...)` with indexes.
2. No data migration — the `blog.fonts` JSON row keeps stale `globalCss`/
   `postCss`/`codeCss` keys until overwritten. The new schema's Zod parse
   defaults `global`/`post`/`code` to `[]` on read, so old keys are ignored.
   Rolling back to old code would re-read the old keys (they're still in the
   JSON).

---

## Slicing integration: vendored cn-font-split (WASM-only)

### Why vendor from source

The npm package `cn-font-split` is stale (latest 7.4.3) while the Rust core
has advanced to 7.6.8 on GitHub releases. Rather than depend on the abandoned
npm package, we **vendor the TypeScript source** from the `release` branch and
the WASM binary from the 7.6.8 release.

**Verified compatibility:** the protobuf schema (`crates/proto/src/index.proto`)
is byte-identical between `release` and the `7.6.8` tag. The proto schema is
the only contract between JS glue and Rust core, so the vendored source is
fully compatible with the 7.6.8 WASM binary.

### Why WASM-only

cn-font-split ships two parallel codepaths:

| Codepath                      | Binary                                      | Node deps                                                | Install size |
| ----------------------------- | ------------------------------------------- | -------------------------------------------------------- | ------------ |
| `dist/node/` (default `main`) | Native `.so`/`.dylib`/`.dll` via koffi FFI  | `koffi` + `@xan105/ffi` + `@xan105/error` + `@xan105/is` | 6.5 MB       |
| `dist/wasm/` (browser field)  | Single `libffi-wasm32-wasip1.wasm` via WASI | **none**                                                 | ~1.7 MB      |

The WASM path is fully isolated, self-contained, and requires no native
dependencies. It runs single-threaded (vs the native path's multi-threading),
taking ~15-20s for a CJK font vs ~5s native — acceptable under the
synchronous-in-request model with a spinner.

### Vendor layout

```
src/server/domains/fonts/vendor/
├── cnfs-7.6.8.wasm       # Rust core, from GitHub release 7.6.8 (~3 MB)
├── wasm.ts               # fontSplit, APIInterface, createWasi, StaticWasm
├── createAPI.ts          # createAPI (re-exported by wasm.ts)
├── interface.ts          # FontSplitProps types
├── decodeReporter.ts     # decodeReporter (re-exported by wasm.ts)
├── gen.ts                # GENERATED ONCE via protoc, committed
└── deps/
    ├── protobuf.js       # google-protobuf runtime (~470 KB, zero deps)
    ├── memfs.js          # memfs-browser esm bundle (~450 KB, zero deps)
    └── wasm-util.js      # @tybys/wasm-util WASI (~170 KB, zero deps)
```

The four TypeScript source files are **flat** (not nested under `src/wasm/`).
Import paths within them are rewritten to point at `./deps/*` and `./gen`
(relative).

**`gen.ts` is generated once** from `crates/proto/src/index.proto` via
`protoc --ts_out=gen.ts --proto_path=… index.proto` (requires `protoc` +
`protoc-gen-ts` installed). The generated `.ts` is committed — no `protoc`
dependency at build or runtime. Regenerating is a manual upgrade step.

**`deps/`** contains the three transitive libraries, verified zero-dependency:

- `google-protobuf@4.0.2` — pure standalone JS runtime for protobuf
- `memfs-browser@3.5.10` — in-memory filesystem for the WASI virtual FS
- `@tybys/wasm-util@0.10.2` — WASI polyfill (only the `WASI` class is used)

All three are copied as their published dist bundles (`.js`), with their
`.d.ts` alongside for types.

**`cn-font-split` is NOT in `package.json`** — not in `dependencies`, not in
`devDependencies`. The vendored source is fully self-contained. The fonts
domain has zero npm dependencies.

### One-time vendor script

`scripts/vendor-cnfs.mjs` (documented in this spec, run manually, not in CI):

1. Fetch `src/wasm/index.ts`, `src/createAPI.ts`, `src/interface.ts`,
   `src/decodeReporter.ts` from the `release` branch of
   `KonghaYao/cn-font-split`.
2. Fetch `crates/proto/src/index.proto`; run `protoc` + `protoc-gen-ts` to
   generate `gen.ts`.
3. Fetch the three dep dist bundles + `.d.ts` from npm.
4. Download `libffi-wasm32-wasip1.wasm` from the 7.6.8 GitHub release.
5. Rewrite import paths in the four `.ts` files to point at `./deps/*` and
   `./gen`.
6. Flatten the files into `vendor/`.

This makes upgrades reproducible. The vendored libraries are stable
(protobuf, memfs, WASI are mature), so re-running is rare.

### Wrapper module: `src/server/domains/fonts/slice.ts`

```ts
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { fontSplit, type FontSplitProps } from './vendor/wasm'

const WASM_PATH = fileURLToPath(new URL('./vendor/cnfs-7.6.8.wasm', import.meta.url))

export interface SliceResult {
  cssPath: string // destFold/result.css
  chunkPaths: string[] // destFold/chunk-*.woff2
  chunkCount: number
  totalBytes: number
}

export async function sliceFont(
  sourceTtfPath: string,
  destFold: string,
  options?: { fontFamily?: string },
): Promise<SliceResult> {
  const wasmBytes = await readFile(WASM_PATH)
  // fontSplit signature: (input, loadWasm, options)
  // loadWasm receives the WASI imports and returns the instantiated module
  const files = await fontSplit(
    {
      input: await readFile(sourceTtfPath),
      outDir: destFold,
      css: { fontFamily: options?.fontFamily },
      // ...sensible CJK defaults (chunk size, etc.) as module constants
    },
    async (imports) => WebAssembly.instantiate(wasmBytes, imports),
    { logger: () => {} }, // silent — caller handles progress via request lifetime
  )
  // collect result.css + chunks from the returned file list
  // ...
}
```

The caller (`fonts.ts` upload resource) owns the temp directory lifecycle:
create before, read results, upload to storage, clean up after.

### Vite SSR

No config changes. `slice.ts` and the vendored `.ts` files transpile through
the existing pipeline. The `.wasm` is loaded via `readFile` at runtime (like
the MaxMind `.mmdb` loader pattern), not via `import`. No `ssr.external`
entry needed (nothing native). No `noExternal` concerns (pure ESM/TS).

---

## CSP cleanup

`src/server/http/middleware-pipeline.ts` `buildCspHeader()`:

**Remove** (lines 65-75): the loop that extracts origins from
`bundle.fonts.globalCss`/`postCss`/`codeCss` and appends them to the policy.
Those fields no longer exist.

**Keep** (lines 76-78): the asset CDN host whitelist. When storage driver is
S3, the self-hosted font CSS and woff2 chunks are served from the asset host;
it must stay in `style-src`/`font-src`/`img-src`/`media-src`. Local storage
is covered by `'self'`.

**Keep**: `'unsafe-inline'` in `style-src` — the `<html style="--font-body">`
override is an inline style.

**Result:** the policy is strictly tighter. No per-font origin injection. The
dynamic part of `buildCspHeader` reduces to just the asset host.

---

## `/admin/fonts` page

### Route

`src/routes/admin/fonts/index.tsx` — nested under the admin layout. Added to
`TIER2_ADMIN_ROUTES` in `src/server/infra/route-warmup.ts`.

### Layout

```
/admin/fonts
├── Left: Font Library
│   Grid of all uploaded fonts.
│   Each card: familyName, chunkCount, totalBytes, uploaded date.
│   Actions: Delete (refuses if referenced), Upload (spinner during slice).
│
└── Right: Slot Assignment (3 slots)
    global:  [drag-ordered list of active fonts]  [+ Add from library]
    post:    [drag-ordered list of active fonts]  [+ Add from library]
    code:    [drag-ordered list of active fonts]  [+ Add from library]
```

This is **not** a `useSettingsCard` card — it's a dedicated library manager
outside the settings autosave framework. Slot changes call `fonts.setSlot`
directly (an oRPC mutation + `revalidator.revalidate()`), not the settings
save path.

### API procedures (oRPC)

Mounted under `admin.fonts.*`, mirroring `images.controller.ts`:

| Procedure       | Input                        | Effect                                                    |
| --------------- | ---------------------------- | --------------------------------------------------------- |
| `fonts.list`    | —                            | Returns all font rows                                     |
| `fonts.upload`  | `{ familyName, file: Blob }` | Magic-byte validate → slice → store → insert → return row |
| `fonts.delete`  | `{ fontId }`                 | Refuses (409) if referenced; else deletes storage + row   |
| `fonts.setSlot` | `{ slot, fontIds: uuid[] }`  | Sets slot order; GC's fonts that reach zero references    |

**Upload body limit:** the upload route is mounted before the global API
limiter (same exception as the existing `fonts.ts` resource at
`middleware-pipeline.ts:195-198`), with a `bodyLimit` of 60 MiB
(`FONT_MAX_BYTES`). The request lifetime includes slicing (~15-20s for CJK).

### Storage wiring

The upload resource reuses the existing abstraction, mirroring
`src/server/domains/images/storage.ts`:

```ts
// src/server/domains/fonts/storage.ts
export async function putFont(hash: string, files: SliceResult): Promise<StorageDriver> {
  const backend = activeBackend()
  const prefix = `fonts/${hash}/`
  await backend.put({
    key: `${prefix}result.css`,
    body: cssBuffer,
    contentType: 'text/css',
    visibility: 'public',
    cacheControl: 'immutable',
  })
  for (const chunk of files.chunkPaths) {
    await backend.put({
      key: `${prefix}${chunkName}`,
      body: chunkBuffer,
      contentType: 'font/woff2',
      visibility: 'public',
      cacheControl: 'immutable',
    })
  }
  return backend.driver
}
```

### Public serving

`src/server/http/resources/local-storage.ts` changes:

- Add `'fonts/'` to `PUBLIC_STORAGE_PREFIXES` (line 27).
- Add `font/woff2`, `font/ttf`, `font/otf` to `CONTENT_TYPE_BY_EXT` (line 52).

S3 assets are served directly from the CDN host (already CSP-allowlisted).

---

## Code deletion

| File                                            | Change                                                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/server/domains/settings/schemas/fonts.ts`  | Drop `globalCss`/`postCss`/`codeCss` + `*Family` fields; add `global`/`post`/`code` UUID arrays                                                   |
| `src/shared/config/types.ts`                    | `FontsSettings` DTO: same field changes                                                                                                           |
| `src/ui/admin/settings/FontsForm.tsx`           | Remove `FontsGlobalCssCard`, `FontsPostCssCard`, `FontsCodeCard`. Keep `FontsCanvasCard`. The 3 CSS cards' functionality moves to `/admin/fonts`. |
| `src/root.tsx:128-200`                          | Replace external `<link>` loop + family map with font-package-based resolution                                                                    |
| `src/server/http/middleware-pipeline.ts:62-105` | Remove font-URL origin extraction loop from `buildCspHeader`                                                                                      |
| `src/server/http/resources/local-storage.ts`    | Add `fonts/` prefix + font content-types                                                                                                          |
| `src/server/infra/route-warmup.ts`              | Add `/admin/fonts` to `TIER2_ADMIN_ROUTES`                                                                                                        |

---

## Testing

### Unit tests

- `sliceFont`: slice a small known font (e.g. a Latin-only TTF for speed);
  assert `result.css` contains `@font-face` rules, chunks are non-empty
  woff2s, `chunkCount > 0`, `totalBytes > 0`. This is the **schema-drift
  guard** — if the vendored source ever drifts from the WASM binary, this
  test fails.
- `fonts.setSlot` GC logic: given a font in two slots, removing from one does
  not GC; removing from both GC's storage + row.
- `buildCspHeader`: assert no font-origin extraction remains; asset host still
  whitelisted.

### Integration tests

- Upload → slice → store → resolve URL end-to-end (local backend).
- Slot assignment → SSR `<link>` rendering → `font-family` stack order.
- Dedupe: upload same TTF twice → returns existing row, no re-slice.

### Manual smoke

- Upload a CJK font, assign to `global`, load homepage, confirm font renders
  and chunks load progressively (check Network tab for woff2 requests).
- Verify CSP header in devtools — no external origins, no violations.

---

## Open considerations

- **Slicing defaults** (chunk size, language areas, auto-subset) are
  module-level constants in `slice.ts`, tuned for CJK. If admins need
  per-font control, these can later become upload options. Out of scope for
  v1.
- **The vendored `.wasm` (3 MB) + dep bundles (~1 MB) are committed to git.**
  This is the tradeoff of full encapsulation (no `cn-font-split` in
  `package.json`, no runtime npm resolution for the fonts domain). The
  vendor script makes upgrades reproducible.
- **No font preview.** The library grid shows metadata only, not a rendered
  preview of each font. cn-font-split can generate preview SVGs
  (`previewImage` option); adding a preview column is a future enhancement.
