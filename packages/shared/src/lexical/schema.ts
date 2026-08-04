import { isSafeUrl } from '@kobato/shared/sanitize-url'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { z } from 'zod'

// Strict Lexical EditorState-JSON subset for this repository. The future
// body format (`content.body` → `jsonb`) is a Lexical 0.45.0 EditorState
// (`{root: {children: [...]}}`). This module pins the structural dialect —
// the node type union, per-type field shapes, and the nesting rules — with
// hand-written structural types plus a zod whitelist gate. It must stay
// runtime-dependency-free: NOTHING here may import `lexical` (the gate is
// pure JSON validation; the editor package layers the real
// `parseEditorState` double-check on top in `./validate.ts`).
//
// Field names and defaults below are the ACTUAL serialized shape of
// lexical 0.45.0 (verified against `exportJSON()` of every registered
// node), not a guessed model:
//
//   - element nodes: `{children, direction, format, indent, type,
//     version}`; `direction`/`format`/`indent` are null / '' / 0 in the
//     canonical form
//   - paragraph adds `textFormat` (number) + `textStyle` (string) — both
//     ALWAYS emitted by 0.45.0's `exportJSON`, even when 0 / ''
//   - heading adds `tag`; list adds `listType`/`start`/`tag`; listitem
//     adds `value` (+ `checked` when set); link adds `url`/`rel`/
//     `target`/`title` — the latter three ALWAYS emitted (`null` when
//     unset); code adds `language`/`theme` (omitted when unset)
//   - table adds `colWidths`/`rowStriping`/`frozenColumnCount`/
//     `frozenRowCount`; tablerow adds `height`; tablecell adds
//     `backgroundColor` (ALWAYS, `null` when unset), `colSpan`,
//     `headerState` (0..3 bitmask: 1 = row header, 2 = column header),
//     `rowSpan`, `width`, `verticalAlign`
//   - text: `{detail, format, mode, style, text, type, version}`;
//     linebreak: `{type, version}`; horizontalrule: `{type, version}`
//     (a DecoratorNode in 0.45 — lives in `@lexical/extension` upstream,
//     hand-rolled here to keep the dependency list closed)
//
// Custom node dialect (owned by this repo):
//
//   - mathInline `{tex, mathml?, svg?}`, footnoteRef `{targetKey,
//     index}`, image `{src, alt?, caption?, layout?, width?, height?,
//     thumbhash?, storagePath?, imageId?}`, mathBlock `{tex, mathml?,
//     svg?}`, musicPlayer `{playerId, auto?, center?}` — inline / block
//     decorators
//   - solution `{children}`, twoColumn `{children: [twoColumnPane,
//     twoColumnPane]}`, twoColumnPane `{side}`, footnoteDefinition
//     `{index, children}` — block elements
//   - every custom node may carry `ptKey` — the originating PT `_key`,
//     preserved across canonicalization for migration reconciliation
//     (standard nodes cannot carry it: their `importJSON`/`exportJSON`
//     would drop it)
//
// Nesting rules mirror the PT schema (`NonRecursiveBlock`): the custom
// containers (solution / twoColumn / footnoteDefinition) may only appear
// as direct children of root, and their children must be non-container
// blocks — the zod nesting below enforces the depth limit by
// construction.

// --- shared constants ------------------------------------------------------

/** Lexical 0.45.0 text-format bitmask ceiling used by the dialect gate. */
export const TEXT_NODE_FORMAT_MAX = 127
// 0.45.0 actually defines bits up to 1 << 10 (IS_CAPITALIZE = 1024, full
// mask 2047). 127 is a DELIBERATE content-dialect boundary: the PT mark
// set (strong/em/strike/underline/code → bits 1..16) is what both
// renderers can display, bits 32/64 (subscript/superscript) are admitted
// as slack for future toolbar work, and 128+ (highlight / lowercase /
// uppercase / capitalize) is rejected so the wire never stores marks the
// renderers silently drop. Relaxing requires renderer support first
// (see the ascending-bit wrapping in both renderers).

export const PT_DECORATOR_TO_FORMAT_BIT: Readonly<Record<string, number>> = {
  strong: 1,
  em: 2,
  'strike-through': 4,
  underline: 8,
  code: 16,
}

// --- structural types ------------------------------------------------------

export interface LexicalElementBase {
  direction: 'ltr' | 'rtl' | null
  format: string
  indent: number
  version: 1
}

export interface LexicalTextNode {
  detail: number
  format: number
  mode: 'normal' | 'token' | 'segmented'
  style: string
  text: string
  type: 'text'
  version: 1
}

export interface LexicalLineBreakNode {
  type: 'linebreak'
  version: 1
}

// Decorator nodes serialize as `{type, version}` plus their own fields —
// they carry NO element base fields (no children / direction / format /
// indent), matching `DecoratorNode.exportJSON()` in 0.45.0.

export interface LexicalInlineMathNode {
  type: 'mathInline'
  tex: string
  mathml?: string
  svg?: string
  ptKey?: string
  version: 1
}

export interface LexicalFootnoteRefNode {
  type: 'footnoteRef'
  targetKey: string
  index: number
  ptKey?: string
  version: 1
}

export interface LexicalLinkNode extends LexicalElementBase {
  type: 'link'
  children: LexicalSimpleInlineNode[]
  url: string
  rel: string | null
  target: string | null
  title: string | null
}

export type LexicalSimpleInlineNode =
  | LexicalTextNode
  | LexicalLineBreakNode
  | LexicalInlineMathNode
  | LexicalFootnoteRefNode

export type LexicalInlineNode = LexicalSimpleInlineNode | LexicalLinkNode

export interface LexicalParagraphNode extends LexicalElementBase {
  type: 'paragraph'
  children: LexicalInlineNode[]
  textFormat?: number
  textStyle?: string
}

export interface LexicalHeadingNode extends LexicalElementBase {
  type: 'heading'
  tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  children: LexicalInlineNode[]
}

export interface LexicalQuoteNode extends LexicalElementBase {
  type: 'quote'
  children: LexicalParagraphNode[]
}

export interface LexicalListItemNode extends LexicalElementBase {
  type: 'listitem'
  value: number
  checked?: boolean | null
  /**
   * Dual-shape children (mirrors the comment dialect):
   * the 0.45 runtime shape carries inline nodes directly
   * (`ListItemNode.append` unwraps paragraphs — a parsed item can never
   * hold one), the PT→Lexical mapping emits `paragraph` aliases, and
   * nested lists nest at any position. The canonicalize parse round-trip
   * narrows the paragraph alias away to the runtime inline form.
   */
  children: LexicalListItemChildNode[]
}

export type LexicalListItemChildNode = LexicalParagraphNode | LexicalListNode | LexicalInlineNode

export interface LexicalListNode extends LexicalElementBase {
  type: 'list'
  listType: 'bullet' | 'number' | 'check'
  start: number
  tag: 'ul' | 'ol'
  children: LexicalListItemNode[]
}

export interface LexicalCodeNode extends LexicalElementBase {
  type: 'code'
  language?: string
  theme?: string
  /** Server prerender artifact (Shiki) — stripped on save, recomputed server-side (same policy as the PT `highlightedHtml`). */
  highlightedHtml?: string
  children: LexicalTextNode[]
}

export interface LexicalImageNode {
  type: 'image'
  src: string
  alt?: string
  caption?: string
  layout?: 'left' | 'center' | 'right'
  width?: number
  height?: number
  thumbhash?: string
  storagePath?: string
  imageId?: string
  ptKey?: string
  version: 1
}

export interface LexicalMathBlockNode {
  type: 'mathBlock'
  tex: string
  mathml?: string
  svg?: string
  ptKey?: string
  version: 1
}

export interface LexicalMusicPlayerNode {
  type: 'musicPlayer'
  playerId: string
  auto?: boolean
  center?: boolean
  ptKey?: string
  version: 1
}

export interface LexicalHorizontalRuleNode {
  type: 'horizontalrule'
  version: 1
}

export interface LexicalTableCellNode extends LexicalElementBase {
  type: 'tablecell'
  backgroundColor: string | null
  colSpan: number
  headerState: number
  rowSpan: number
  width?: number | null
  verticalAlign?: string
  children: LexicalParagraphNode[]
}

export interface LexicalTableRowNode extends LexicalElementBase {
  type: 'tablerow'
  height?: number
  children: LexicalTableCellNode[]
}

export interface LexicalTableNode extends LexicalElementBase {
  type: 'table'
  colWidths?: number[] | null
  rowStriping?: boolean
  frozenColumnCount?: number
  frozenRowCount?: number
  children: LexicalTableRowNode[]
}

export interface LexicalSolutionNode extends LexicalElementBase {
  type: 'solution'
  ptKey?: string
  children: LexicalNonContainerBlockNode[]
}

export interface LexicalTwoColumnPaneNode extends LexicalElementBase {
  type: 'twoColumnPane'
  side: 'left' | 'right'
  children: LexicalNonContainerBlockNode[]
}

export interface LexicalTwoColumnNode extends LexicalElementBase {
  type: 'twoColumn'
  ptKey?: string
  children: [LexicalTwoColumnPaneNode, LexicalTwoColumnPaneNode]
}

export interface LexicalFootnoteDefinitionNode extends LexicalElementBase {
  type: 'footnoteDefinition'
  index: number
  ptKey?: string
  children: LexicalNonContainerBlockNode[]
}

/** Block nodes that may appear inside the custom containers (PT `NonRecursiveBlock`). */
export type LexicalNonContainerBlockNode =
  | LexicalParagraphNode
  | LexicalHeadingNode
  | LexicalQuoteNode
  | LexicalListNode
  | LexicalCodeNode
  | LexicalImageNode
  | LexicalMathBlockNode
  | LexicalMusicPlayerNode
  | LexicalHorizontalRuleNode
  | LexicalTableNode

export type LexicalBlockNode =
  | LexicalNonContainerBlockNode
  | LexicalSolutionNode
  | LexicalTwoColumnNode
  | LexicalFootnoteDefinitionNode

export type LexicalNode =
  | LexicalBlockNode
  | LexicalListItemNode
  | LexicalTwoColumnPaneNode
  | LexicalInlineNode
  | LexicalTextNode
  | LexicalLineBreakNode

export interface LexicalRootNode extends LexicalElementBase {
  type: 'root'
  children: LexicalBlockNode[]
}

export interface LexicalBody {
  root: LexicalRootNode
}

// --- zod whitelist gate ----------------------------------------------------
//
// Element base fields are REQUIRED (`.nullable()` for `direction`):
// lexical 0.45.0's `exportJSON` always emits them, and so does this
// repo's mapping — the gate intentionally rejects trees that lack them.

const ELEMENT_BASE_FIELDS = {
  direction: z.enum(['ltr', 'rtl']).nullable(),
  format: z.string(),
  indent: z.number().int().min(0),
  version: z.literal(1),
}

const PT_KEY_FIELD = {
  /** Originating PT block/span `_key` (migration reconciliation). */
  ptKey: z.string().min(1).optional(),
}

const textNodeSchema = z.object({
  detail: z.number().int().min(0),
  format: z.number().int().min(0).max(TEXT_NODE_FORMAT_MAX),
  mode: z.enum(['normal', 'token', 'segmented']),
  style: z.string(),
  text: z.string(),
  type: z.literal('text'),
  version: z.literal(1),
}) satisfies z.ZodType<LexicalTextNode>

const lineBreakSchema = z.object({
  type: z.literal('linebreak'),
  version: z.literal(1),
}) satisfies z.ZodType<LexicalLineBreakNode>

const inlineMathSchema = z.object({
  type: z.literal('mathInline'),
  tex: z.string(),
  mathml: z.string().optional(),
  svg: z.string().optional(),
  ...PT_KEY_FIELD,
  version: z.literal(1),
}) satisfies z.ZodType<LexicalInlineMathNode>

const footnoteRefSchema = z.object({
  type: z.literal('footnoteRef'),
  targetKey: z.string().min(1),
  index: z.number().int().min(1),
  ...PT_KEY_FIELD,
  version: z.literal(1),
}) satisfies z.ZodType<LexicalFootnoteRefNode>

const simpleInlineSchema = z.discriminatedUnion('type', [
  textNodeSchema,
  lineBreakSchema,
  inlineMathSchema,
  footnoteRefSchema,
])

const linkSchema: z.ZodType<LexicalLinkNode> = z.object({
  ...ELEMENT_BASE_FIELDS,
  type: z.literal('link'),
  url: z.string().refine((value) => isSafeUrl(value), {
    message: 'url must not use javascript:, data:, or vbscript: protocol',
  }),
  // rel / target / title are REQUIRED and nullable: 0.45.0's
  // `LinkNode.exportJSON` always emits them (`null` when unset).
  rel: z.string().nullable(),
  target: z.string().nullable(),
  title: z.string().nullable(),
  children: z.array(simpleInlineSchema),
})

const inlineSchema: z.ZodType<LexicalInlineNode> = z.union([simpleInlineSchema, linkSchema])

const paragraphSchema = z.object({
  ...ELEMENT_BASE_FIELDS,
  type: z.literal('paragraph'),
  children: z.array(inlineSchema),
  // Optional on PURPOSE: 0.45.0's `exportJSON` ALWAYS emits
  // `textFormat`/`textStyle` (0 / ''), but the gate must also admit
  // pre-canonical input (the PT mapping and hand-written trees) that
  // omits them; canonicalization re-emits the full field set.
  textFormat: z.number().int().min(0).max(TEXT_NODE_FORMAT_MAX).optional(),
  textStyle: z.string().optional(),
}) satisfies z.ZodType<LexicalParagraphNode>

const headingSchema = z.object({
  ...ELEMENT_BASE_FIELDS,
  type: z.literal('heading'),
  tag: z.enum(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']),
  children: z.array(inlineSchema),
}) satisfies z.ZodType<LexicalHeadingNode>

const quoteSchema = z.object({
  ...ELEMENT_BASE_FIELDS,
  type: z.literal('quote'),
  children: z.array(paragraphSchema),
}) satisfies z.ZodType<LexicalQuoteNode>

const codeSchema = z.object({
  ...ELEMENT_BASE_FIELDS,
  type: z.literal('code'),
  language: z.string().optional(),
  theme: z.string().optional(),
  highlightedHtml: z.string().optional(),
  children: z.array(textNodeSchema),
}) satisfies z.ZodType<LexicalCodeNode>

const imageSchema = z.object({
  type: z.literal('image'),
  src: z.string().min(1),
  alt: z.string().optional(),
  caption: z.string().optional(),
  layout: z.enum(['left', 'center', 'right']).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  thumbhash: z.string().optional(),
  storagePath: z.string().optional(),
  imageId: z.string().optional(),
  ...PT_KEY_FIELD,
  version: z.literal(1),
}) satisfies z.ZodType<LexicalImageNode>

const mathBlockSchema = z.object({
  type: z.literal('mathBlock'),
  tex: z.string(),
  mathml: z.string().optional(),
  svg: z.string().optional(),
  ...PT_KEY_FIELD,
  version: z.literal(1),
}) satisfies z.ZodType<LexicalMathBlockNode>

const musicPlayerSchema = z.object({
  type: z.literal('musicPlayer'),
  playerId: z.string().min(1),
  auto: z.boolean().optional(),
  center: z.boolean().optional(),
  ...PT_KEY_FIELD,
  version: z.literal(1),
}) satisfies z.ZodType<LexicalMusicPlayerNode>

const horizontalRuleSchema = z.object({
  type: z.literal('horizontalrule'),
  version: z.literal(1),
}) satisfies z.ZodType<LexicalHorizontalRuleNode>

const tableCellSchema = z.object({
  ...ELEMENT_BASE_FIELDS,
  type: z.literal('tablecell'),
  // backgroundColor / colSpan / headerState / rowSpan are REQUIRED:
  // 0.45.0's `TableCellNode.exportJSON` always emits them.
  backgroundColor: z.string().nullable(),
  colSpan: z.number().int().min(1),
  headerState: z.number().int().min(0).max(3),
  rowSpan: z.number().int().min(1),
  width: z.number().nullable().optional(),
  verticalAlign: z.string().optional(),
  children: z.array(paragraphSchema),
}) satisfies z.ZodType<LexicalTableCellNode>

const tableRowSchema = z.object({
  ...ELEMENT_BASE_FIELDS,
  type: z.literal('tablerow'),
  height: z.number().optional(),
  children: z.array(tableCellSchema),
}) satisfies z.ZodType<LexicalTableRowNode>

const tableSchema = z.object({
  ...ELEMENT_BASE_FIELDS,
  type: z.literal('table'),
  colWidths: z.array(z.number()).nullable().optional(),
  rowStriping: z.boolean().optional(),
  frozenColumnCount: z.number().int().optional(),
  frozenRowCount: z.number().int().optional(),
  children: z.array(tableRowSchema),
}) satisfies z.ZodType<LexicalTableNode>

// listitem children: paragraph alias (PT mapping), inline runtime nodes
// (0.45 `ListItemNode.append` unwraps paragraphs), and/or nested list(s) —
// the recursive knot (list ⇆ listitem) is resolved lazily; the opaque
// `unknown` output of the lazy references is narrowed with a targeted cast
// (the shared `unsafeCast` trips the checker's circularity detection here
// — the ONLY casts in this module; the rest of the gate is checked
// structurally).
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const listItemChildrenSchema = z.array(
  z.union([paragraphSchema, inlineSchema, z.lazy(() => listSchema)]),
) as unknown as z.ZodType<LexicalListItemChildNode[]>
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const listChildrenSchema = z.array(z.lazy(() => listItemSchema)) as unknown as z.ZodType<LexicalListItemNode[]>

const listItemSchema = z.object({
  ...ELEMENT_BASE_FIELDS,
  type: z.literal('listitem'),
  // `value` is REQUIRED: 0.45.0's `ListItemNode.exportJSON` always
  // emits it; `checked` only appears once a checkbox list sets it.
  value: z.number().int().min(1),
  checked: z.boolean().nullable().optional(),
  // The list ⇆ listitem recursion cannot be expressed as a plain zod
  // object (the lazy reference's output is opaque `unknown`), so the two
  // children arrays carry a typed cast — the ONLY cast in this module;
  // the rest of the gate is checked structurally.
  children: listItemChildrenSchema,
}) satisfies z.ZodType<LexicalListItemNode>

const listSchema = z.object({
  ...ELEMENT_BASE_FIELDS,
  type: z.literal('list'),
  listType: z.enum(['bullet', 'number', 'check']),
  // `start` / `tag` are REQUIRED: 0.45.0's `ListNode.exportJSON` always
  // emits them.
  start: z.number().int().min(1),
  tag: z.enum(['ul', 'ol']),
  children: listChildrenSchema,
}) satisfies z.ZodType<LexicalListNode>

// The block union excludes the custom containers; the container schemas
// below reuse it for their children, which pins the nesting depth: a
// solution / twoColumn / footnoteDefinition may only sit at the root
// level and may only contain non-container blocks (PT NonRecursiveBlock
// spirit — never solution-in-solution).
const nonContainerBlockSchema = z.discriminatedUnion('type', [
  paragraphSchema,
  headingSchema,
  quoteSchema,
  listSchema,
  codeSchema,
  imageSchema,
  mathBlockSchema,
  musicPlayerSchema,
  horizontalRuleSchema,
  tableSchema,
])

const solutionSchema = z.object({
  ...ELEMENT_BASE_FIELDS,
  type: z.literal('solution'),
  ...PT_KEY_FIELD,
  children: z.array(nonContainerBlockSchema),
}) satisfies z.ZodType<LexicalSolutionNode>

const twoColumnPaneSchema = z.object({
  ...ELEMENT_BASE_FIELDS,
  type: z.literal('twoColumnPane'),
  side: z.enum(['left', 'right']),
  children: z.array(nonContainerBlockSchema),
}) satisfies z.ZodType<LexicalTwoColumnPaneNode>

const twoColumnSchema = z.object({
  ...ELEMENT_BASE_FIELDS,
  type: z.literal('twoColumn'),
  ...PT_KEY_FIELD,
  children: z.tuple([twoColumnPaneSchema, twoColumnPaneSchema]),
}) satisfies z.ZodType<LexicalTwoColumnNode>

const footnoteDefinitionSchema = z.object({
  ...ELEMENT_BASE_FIELDS,
  type: z.literal('footnoteDefinition'),
  ...PT_KEY_FIELD,
  index: z.number().int().min(1),
  children: z.array(nonContainerBlockSchema),
}) satisfies z.ZodType<LexicalFootnoteDefinitionNode>

const blockSchema = z.discriminatedUnion('type', [
  paragraphSchema,
  headingSchema,
  quoteSchema,
  listSchema,
  codeSchema,
  imageSchema,
  mathBlockSchema,
  musicPlayerSchema,
  horizontalRuleSchema,
  tableSchema,
  solutionSchema,
  twoColumnSchema,
  footnoteDefinitionSchema,
]) satisfies z.ZodType<LexicalBlockNode>

export const rootNodeSchema = z.object({
  ...ELEMENT_BASE_FIELDS,
  type: z.literal('root'),
  children: z.array(blockSchema),
}) satisfies z.ZodType<LexicalRootNode>

export const lexicalBodySchema = z.object({
  root: rootNodeSchema,
}) satisfies z.ZodType<LexicalBody>

/**
 * The canonical empty body — zero root children (the Lexical counterpart
 * of the PT `[]`). The editor normalizes it to the single-empty-paragraph
 * document on load; the wire treats it as "no content".
 */
export const EMPTY_LEXICAL_BODY: LexicalBody = {
  root: {
    direction: null,
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
    children: [],
  },
}

// --- parsing helpers -------------------------------------------------------

/**
 * Validate an arbitrary value as a `LexicalBody` (structural gate only —
 * pure JSON validation, NO `lexical` runtime involved). Throws a Zod
 * `ZodError` on failure; use `safeParseLexicalBody` for a result
 * envelope. Unknown fields are stripped per node type (whitelist
 * semantics), matching the PT wire schema behavior.
 */
export function parseLexicalBody(value: unknown): LexicalBody {
  return lexicalBodySchema.parse(value)
}

export function safeParseLexicalBody(
  value: unknown,
): { ok: true; body: LexicalBody } | { ok: false; error: z.ZodError } {
  const result = lexicalBodySchema.safeParse(value)
  if (result.success) {
    return { ok: true, body: result.data }
  }
  return { ok: false, error: result.error }
}

// --- structural helpers ----------------------------------------------------

/** True when the node is a container (has a `children` array). */
export function isLexicalElementNode(node: LexicalNode): node is LexicalNode & { children: LexicalNode[] } {
  const children = unsafeCast<{ children?: unknown }>(node).children
  return Array.isArray(children)
}
