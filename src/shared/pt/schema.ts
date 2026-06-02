import { z } from 'zod'

// PortableText dialect for this repository. Storing PortableText in
// `content.body` (`jsonb`) lets the editor reuse the well-trodden PT
// surface (Tiptap's ProseMirror schema converts to/from PT cleanly,
// the `@portabletext/react` SSR renderer is plug-and-play, and a future
// post migration can reuse the same shape) while still expressing every
// MDX construct the existing posts/pages depend on.
//
// The dialect is intentionally a *strict subset* of the upstream PT
// spec: we keep the `_type: 'block' | 'span'` core verbatim, the
// standard inline marks (`strong`, `em`, `underline`, `code`,
// `strike-through`), `link` markDefs, and the canonical block styles
// (`normal` / `h1`-`h4` / `blockquote`); on top of that we add a
// hand-picked set of custom block types (`image`, `code`, `mathBlock`,
// `horizontalRule`, `musicPlayer`, `solution`, `twoColumn`)
// and two custom inline marks (`mathInline`, `footnoteRef`) that
// each map 1:1 onto an existing MDX-side React component.
//
// **Why not store ProseMirror JSON directly?**
//   - PT is editor-agnostic: a future migration off Tiptap (StackEdit,
//     a server-side LLM transformer, …) doesn't reshape every row.
//   - PT is much easier to validate at the API perimeter — flat block
//     arrays vs. recursive PM trees of arbitrary depth.
//   - PT's `markDefs` carry rich link/annotation metadata while leaving
//     the inline span text reflowable, which preserves text searchability.
//
// **Why a strict subset instead of arbitrary `_type`?**
//   - Keeping the type union closed gives the SSR renderer
//     (PortableTextBody UI component) and the Tiptap bridge
//     (page-editor pt-bridge module) a finite switch to drive.
//   - The Zod schema `portableTextBodySchema` rejects unknown payloads
//     before they land in `content.body`, so downgrading the renderer
//     after a future spec extension never produces "unrenderable"
//     revisions in the wild.
//
// All ids (`_key`) are server-generated random ids in the editor save
// path; the schema only checks they're non-empty strings (the editor
// state machine owns uniqueness within a revision).

const NON_EMPTY_KEY = z.string().min(1)

// --- Standard inline marks ---------------------------------------------------

// Closed set of *decorator* marks (i.e. inline format toggles that
// don't carry data — the inline `code` is just a span style, not a
// reference into `markDefs`). The `mathInline` and `footnoteRef`
// "marks" actually live in `markDefs` because they need a payload, but
// they appear inside `span.marks` as the corresponding `_key`.
export const STANDARD_DECORATORS = ['strong', 'em', 'underline', 'code', 'strike-through'] as const
export type StandardDecorator = (typeof STANDARD_DECORATORS)[number]

// --- Standard block styles ---------------------------------------------------

// Closed set of paragraph/heading styles. We support h1-h4 because the
// Markdown corpus only ever uses up to four levels (the SEO / TOC code
// would mis-render h5/h6 anyway). `blockquote` covers GFM blockquotes
// and the editor's `<` / `> ` shortcuts; the `solution` blockquote
// variant is its *own* `_type: 'solution'` block, not a style.
export const STANDARD_BLOCK_STYLES = ['normal', 'h1', 'h2', 'h3', 'h4', 'blockquote'] as const
export type StandardBlockStyle = (typeof STANDARD_BLOCK_STYLES)[number]

export const STANDARD_LIST_ITEMS = ['bullet', 'number'] as const
export type StandardListItem = (typeof STANDARD_LIST_ITEMS)[number]

// --- Custom mark definitions (markDefs entries) ------------------------------

// `link` is the upstream PT canonical mark — the editor lifts a
// selection's URL into `markDefs[i] = { _type: 'link', _key, href }`
// and references it by `_key` in `span.marks`. We add `rel`/`target`
// so external-link rules (`rel="nofollow noreferrer"`,
// `target="_blank"`) saved at editor time round-trip into the SSR
// output without re-running `rehype-external-links`.
export const linkMarkDefSchema = z.object({
  _type: z.literal('link'),
  _key: NON_EMPTY_KEY,
  href: z.string().refine((v) => !/^\s*(javascript|data|vbscript):/i.test(v.trim()), {
    message: 'href must not use javascript:, data:, or vbscript: protocol',
  }),
  rel: z.string().optional(),
  target: z.string().optional(),
})
export type LinkMarkDef = z.infer<typeof linkMarkDefSchema>

// `mathInline` payload is a TeX expression (already validated by the
// editor) plus the pre-rendered MathML produced server-side at save
// time. `svg` is retained for historical pre-rendered revisions.
export const mathInlineMarkDefSchema = z.object({
  _type: z.literal('mathInline'),
  _key: NON_EMPTY_KEY,
  tex: z.string(),
  mathml: z.string().optional(),
  svg: z.string().optional(),
})
export type MathInlineMarkDef = z.infer<typeof mathInlineMarkDefSchema>

// `footnoteRef` matches `<sup>` in post MDX. The `targetKey`
// is the `_key` of the `footnoteDefinition` block this reference
// points at, so the SSR renderer can resolve a hover preview without
// scanning the entire body.
export const footnoteRefMarkDefSchema = z.object({
  _type: z.literal('footnoteRef'),
  _key: NON_EMPTY_KEY,
  targetKey: NON_EMPTY_KEY,
  /** Display index (1, 2, 3, …) — pre-computed at save time. */
  index: z.number().int().min(1),
})
export type FootnoteRefMarkDef = z.infer<typeof footnoteRefMarkDefSchema>

export const markDefSchema = z.discriminatedUnion('_type', [
  linkMarkDefSchema,
  mathInlineMarkDefSchema,
  footnoteRefMarkDefSchema,
])
export type MarkDef = z.infer<typeof markDefSchema>

// --- Span (inline run) -------------------------------------------------------

// `marks` strings are either standard decorator names or `markDef._key`
// references — the union is intentionally `string` (not the Zod-tight
// enum) because the editor and the SSR renderer cross-check them
// against the surrounding `markDefs[]` at runtime. Validating the
// reference graph in Zod would force every span schema to know the
// outer block, blowing up the type definition with no real safety win.
export const spanSchema = z.object({
  _type: z.literal('span'),
  _key: NON_EMPTY_KEY,
  text: z.string(),
  marks: z.array(z.string()).optional(),
})
export type Span = z.infer<typeof spanSchema>

// --- Standard text block -----------------------------------------------------

export const TEXT_ALIGN_VALUES = ['left', 'center', 'right'] as const
export type TextAlignValue = (typeof TEXT_ALIGN_VALUES)[number]

export const textBlockSchema = z.object({
  _type: z.literal('block'),
  _key: NON_EMPTY_KEY,
  style: z.enum(STANDARD_BLOCK_STYLES).optional(),
  listItem: z.enum(STANDARD_LIST_ITEMS).optional(),
  level: z.number().int().min(1).max(6).optional(),
  align: z.enum(TEXT_ALIGN_VALUES).optional(),
  children: z.array(spanSchema),
  markDefs: z.array(markDefSchema).optional(),
})
export type TextBlock = z.infer<typeof textBlockSchema>

// --- Custom block types -----------------------------------------------------

// Image block. `assetSrc` is the resolved public URL (matches the
// MDX `<img src="…">`) so the SSR renderer doesn't have to
// resolve an asset reference on the hot path; the optional
// `imagePath` is the S3 storagePath this row references, which the
// `image_sources` projection on `content` writes out for the
// thumbhash-resolution enhancer.
export const IMAGE_BLOCK_LAYOUT = ['left', 'center', 'right'] as const
export type ImageBlockLayout = (typeof IMAGE_BLOCK_LAYOUT)[number]

export const imageBlockSchema = z.object({
  _type: z.literal('image'),
  _key: NON_EMPTY_KEY,
  src: z.string(),
  alt: z.string().optional(),
  caption: z.string().optional(),
  /** Horizontal alignment; omit or `center` for default centered figure. */
  layout: z.enum(IMAGE_BLOCK_LAYOUT).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  thumbhash: z.string().optional(),
  /** When the asset is stored in our S3 bucket, the canonical key. */
  storagePath: z.string().optional(),
  /**
   * Set when the block references a row in the `image` table (the
   * media library). When omitted, the block is an external image —
   * its `src` is a third-party URL, no thumbhash / dimensions are
   * resolved at save time, and the block is not added to the
   * surrounding revision's `image_sources` projection.
   */
  imageId: z.string().optional(),
})
export type ImageBlock = z.infer<typeof imageBlockSchema>

// Code block. `code` is the raw text; `language` is the user-selected
// language slug (matches `<pre data-language="…">` produced by
// `rehype-code`). `highlightedHtml` is the pre-rendered Shiki HTML
// produced server-side at save time so SSR public renders don't
// re-tokenise the code on every request.
export const codeBlockSchema = z.object({
  _type: z.literal('code'),
  _key: NON_EMPTY_KEY,
  code: z.string(),
  language: z.string().optional(),
  highlightedHtml: z.string().optional(),
})
export type CodeBlock = z.infer<typeof codeBlockSchema>

// Block-level math. `tex` is the raw TeX, `mathml` is the KaTeX-rendered
// MathML saved alongside so SSR doesn't render math at request time.
// `svg` is retained for historical pre-rendered revisions. Inline
// math lives in `mathInlineMarkDef`.
export const mathBlockSchema = z.object({
  _type: z.literal('mathBlock'),
  _key: NON_EMPTY_KEY,
  tex: z.string(),
  mathml: z.string().optional(),
  svg: z.string().optional(),
})
export type MathBlock = z.infer<typeof mathBlockSchema>

// Horizontal rule (`---` / `<hr>`).
export const horizontalRuleBlockSchema = z.object({
  _type: z.literal('horizontalRule'),
  _key: NON_EMPTY_KEY,
})
export type HorizontalRuleBlock = z.infer<typeof horizontalRuleBlockSchema>

// `<MusicPlayer id="…" auto={…} center={…} />` from the music MDX
// component.
// Stores only the metadata MDX accepted; the public renderer hands it
// to the same React component as today.
export const musicPlayerBlockSchema = z.object({
  _type: z.literal('musicPlayer'),
  _key: NON_EMPTY_KEY,
  /** 16-char `[a-z0-9]` opaque handle from `music.player_id`. */
  playerId: z.string().min(1),
  auto: z.boolean().optional(),
  center: z.boolean().optional(),
})
export type MusicPlayerBlock = z.infer<typeof musicPlayerBlockSchema>

// --- Table block ------------------------------------------------------------

// Table cells carry inline content only. We deliberately restrict
// `content` to `spans` (with the standard decorator + link `markDef`
// allowed) — no nested PT blocks. Reasons:
//   * Upstream PortableText (and emdash) treat tables this way; the
//     `@portabletext/react` toolkit doesn't recurse into table cells
//     either, so keeping cells flat avoids a renderer mismatch.
//   * Nesting blocks inside cells would require recursive Zod schemas
//     for cell content + extra round-trip rules in the bridge for
//     every block type the cell could contain (mathBlock inside a
//     table is a poor authoring experience anyway).
//   * The Tiptap editor side stays simple: each cell is a single
//     `<paragraph>` whose children are the inline runs.
//
// `mathInline` and `footnoteRef` mark defs are intentionally **not**
// projected into table cells — the bridge strips them on PM → PT
// because the editor cannot reasonably let the operator manage cross-
// cell footnote registries, and lined formulas inside a cell quickly
// become unreadable. The standard `link` mark def is still allowed.
export const tableCellSchema = z.object({
  _type: z.literal('tableCell'),
  _key: NON_EMPTY_KEY,
  /** When true the cell renders as `<th>` instead of `<td>`. */
  isHeader: z.boolean().optional(),
  content: z.array(spanSchema),
  /** Standard `link` markDefs only (mathInline / footnoteRef are
   *  forbidden in cells; see comment above). */
  markDefs: z.array(linkMarkDefSchema).optional(),
})
export type TableCell = z.infer<typeof tableCellSchema>

export const tableRowSchema = z.object({
  _type: z.literal('tableRow'),
  _key: NON_EMPTY_KEY,
  cells: z.array(tableCellSchema),
})
export type TableRow = z.infer<typeof tableRowSchema>

export const tableBlockSchema = z.object({
  _type: z.literal('table'),
  _key: NON_EMPTY_KEY,
  rows: z.array(tableRowSchema),
  /** First row is rendered as `<thead><th>…` when set. Equivalent to
   *  setting `isHeader: true` on every cell of `rows[0]` but cheaper
   *  to project and easier to toggle from the editor's BubbleMenu. */
  hasHeaderRow: z.boolean().optional(),
})
export type TableBlock = z.infer<typeof tableBlockSchema>

// `<Solution>` blockquote-with-flourish (the solutions MDX component).
// The `children` field is a nested PortableText body (text blocks,
// images, code, etc.) so the solution can hold the same set of
// constructs as the page itself. Note: a solution **cannot** nest
// another solution or another footnote definition — the editor never
// surfaces those as slash commands inside a solution body, and this
// flat schema avoids unbounded recursion in both Zod and the SSR
// renderer.
export type SolutionBlock = {
  _type: 'solution'
  _key: string
  children: NonRecursiveBlock[]
}

// 响应式左右两栏；每栏内容为一层 NonRecursiveBlock（不可再嵌套 twoColumn
// 或 footnoteDefinition，与 `solution` 相同的一侧递归边界）。
export type TwoColumnBlock = {
  _type: 'twoColumn'
  _key: string
  left: NonRecursiveBlock[]
  right: NonRecursiveBlock[]
}

// `<li id="user-content-fn-N">` GFM footnote definition. Held as a
// dedicated block so the SSR renderer can collect them at the bottom
// of the body without inferring "this is a footnote" from heading
// patterns. `index` is the human-visible footnote number (1, 2, 3…).
// Same flat-recursion rule as `solution`: footnote definitions can't
// nest other footnote definitions or solutions.
export type FootnoteDefinitionBlock = {
  _type: 'footnoteDefinition'
  _key: string
  index: number
  children: NonRecursiveBlock[]
}

/** Subset of `Block` that's allowed inside `solution.children` /
 *  `footnoteDefinition.children` / `twoColumn.left|right`. Same as `Block`
 *  minus the recursive variants; declared as its own union so the recursion
 *  stays one-deep and Zod's discriminated union doesn't choke on the cycle. */
export type NonRecursiveBlock =
  | TextBlock
  | ImageBlock
  | CodeBlock
  | MathBlock
  | HorizontalRuleBlock
  | MusicPlayerBlock
  | TableBlock

const nonRecursiveBlockSchema = z.discriminatedUnion('_type', [
  textBlockSchema,
  imageBlockSchema,
  codeBlockSchema,
  mathBlockSchema,
  horizontalRuleBlockSchema,
  musicPlayerBlockSchema,
  tableBlockSchema,
])

export const solutionBlockSchema = z.object({
  _type: z.literal('solution'),
  _key: NON_EMPTY_KEY,
  children: z.array(nonRecursiveBlockSchema),
}) satisfies z.ZodType<SolutionBlock>

export const twoColumnBlockSchema = z.object({
  _type: z.literal('twoColumn'),
  _key: NON_EMPTY_KEY,
  left: z.array(nonRecursiveBlockSchema),
  right: z.array(nonRecursiveBlockSchema),
}) satisfies z.ZodType<TwoColumnBlock>

export const footnoteDefinitionBlockSchema = z.object({
  _type: z.literal('footnoteDefinition'),
  _key: NON_EMPTY_KEY,
  index: z.number().int().min(1),
  children: z.array(nonRecursiveBlockSchema),
}) satisfies z.ZodType<FootnoteDefinitionBlock>

// --- Block discriminated union ----------------------------------------------

export type Block = NonRecursiveBlock | SolutionBlock | TwoColumnBlock | FootnoteDefinitionBlock

export const blockSchema = z.discriminatedUnion('_type', [
  textBlockSchema,
  imageBlockSchema,
  codeBlockSchema,
  mathBlockSchema,
  horizontalRuleBlockSchema,
  musicPlayerBlockSchema,
  solutionBlockSchema,
  twoColumnBlockSchema,
  footnoteDefinitionBlockSchema,
  tableBlockSchema,
]) satisfies z.ZodType<Block>

// --- Body --------------------------------------------------------------------

// Top-level body schema applied at every API perimeter (saveDraft,
// publishLatest, previewPage). Empty bodies are valid (a freshly
// created `page` row without a draft yet has `body=[]`).
export const portableTextBodySchema = z.array(blockSchema)
export type PortableTextBody = z.infer<typeof portableTextBodySchema>

// Convenience aliases: keep call sites readable.
export type PortableTextBlock = Block
export type { Block as PtBlock }

export interface PortableTextHeading {
  depth: number
  text: string
  slug: string
}

export interface PortableTextHeadingSlot {
  blockKey: string
  plainText: string
  depth: number
}
