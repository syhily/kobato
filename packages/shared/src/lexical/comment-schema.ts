import type {
  LexicalCodeNode,
  LexicalElementBase,
  LexicalInlineMathNode,
  LexicalLineBreakNode,
  LexicalMathBlockNode,
  LexicalTextNode,
} from '@kobato/shared/lexical/schema'

import { TEXT_NODE_FORMAT_MAX } from '@kobato/shared/lexical/schema'
import { isSafeUrl } from '@kobato/shared/sanitize-url'
import { z } from 'zod'

// Comment-body dialect of the Lexical EditorState JSON — the strict
// subset of `lexicalBodySchema` that comment threads may carry (the
// Lexical counterpart of `@kobato/shared/pt/comment-schema`). Comments
// are authored through a deliberately-thin editor, and this module pins
// the structural gate the editor AND (from R5 on) the server perimeter
// validate against. It must stay runtime-dependency-free: NOTHING here
// may import `lexical` — the gate is pure JSON validation; the editor
// package layers the real `parseEditorState` double-check on top in
// `./comment-validate.ts`.
//
// Allowed vs. the full `lexicalBodySchema`:
//   - root blocks: paragraph / quote / list / code / mathBlock ONLY
//   - inline: text / linebreak / link / mathInline ONLY — `footnoteRef`
//     is excluded because comments carry no footnote registry
//   - lists: `bullet` / `number` ONLY (no `check`), nested at most
//     4 levels deep — the Lexical-tree counterpart of the PT comment
//     list-item `level ≤ 4` constraint (the PT→Lexical mapping nests a
//     PT level-N streak at Lexical depth N; a root list is level 1)
//   - listitem children: inline nodes and/or nested lists — the 0.45
//     runtime shape (`ListItemNode.append` unwraps paragraphs, so a
//     parsed item can never hold one); `paragraph` is accepted as an
//     input-compat alias for the PT→Lexical mapping output and is
//     canonicalized away (a parse round-trip flattens it)
//   - quote children are paragraphs; code children are plain text
//     nodes — same as the body dialect
//
// Rejected at the gate (unknown node types fail the discriminated
// union): heading / image / horizontalrule / musicPlayer / table family
// / solution / twoColumn / footnoteDefinition / footnoteRef. Field-level
// constraints match the body schema: text `format` bitmask ≤ 127, link
// `url` must be a safe URL, code `language`/`theme` optional strings,
// element base fields required (`direction` nullable).
//
// The ≤ 200-block cap of the server canonicalize is NOT part of this
// gate — it is a server-side policy (`canonicalizeCommentBody`, R5),
// just like the PT track keeps it out of the shared zod schema.

// --- structural types ------------------------------------------------------

export interface LexicalCommentLinkNode extends LexicalElementBase {
  type: 'link'
  children: LexicalCommentSimpleInlineNode[]
  url: string
  rel: string | null
  target: string | null
  title: string | null
}

export type LexicalCommentSimpleInlineNode = LexicalTextNode | LexicalLineBreakNode | LexicalInlineMathNode

export type LexicalCommentInlineNode = LexicalCommentSimpleInlineNode | LexicalCommentLinkNode

export interface LexicalCommentParagraphNode extends LexicalElementBase {
  type: 'paragraph'
  children: LexicalCommentInlineNode[]
  textFormat?: number
  textStyle?: string
}

export interface LexicalCommentQuoteNode extends LexicalElementBase {
  type: 'quote'
  children: LexicalCommentParagraphNode[]
}

export interface LexicalCommentListItemNode extends LexicalElementBase {
  type: 'listitem'
  value: number
  checked?: boolean | null
  /**
   * The 0.45 runtime shape: inline nodes directly (the list conversion
   * appends the paragraph's children into the item — `ListItemNode.append`
   * unwraps paragraphs, so a parsed item can never hold one) and/or nested
   * lists. `paragraph` is accepted as an input-compat alias (the PT→Lexical
   * mapping emits it; a parse round-trip flattens it back to inlines).
   */
  children: LexicalCommentListItemChildNode[]
}

export type LexicalCommentListItemChildNode =
  | LexicalCommentParagraphNode
  | LexicalCommentListNode
  | LexicalCommentInlineNode

export interface LexicalCommentListNode extends LexicalElementBase {
  type: 'list'
  listType: 'bullet' | 'number'
  start: number
  tag: 'ul' | 'ol'
  children: LexicalCommentListItemNode[]
}

export type LexicalCommentBlockNode =
  | LexicalCommentParagraphNode
  | LexicalCommentQuoteNode
  | LexicalCommentListNode
  | LexicalCodeNode
  | LexicalMathBlockNode

export interface LexicalCommentRootNode extends LexicalElementBase {
  type: 'root'
  children: LexicalCommentBlockNode[]
}

export interface LexicalCommentBody {
  root: LexicalCommentRootNode
}

// --- zod whitelist gate ----------------------------------------------------
//
// The list depth cap is enforced BY CONSTRUCTION: four list schemas
// (L1..L4), where a level-N listitem may only nest a list from the
// next level and the level-4 listitem accepts inlines/paragraphs only
// (no nested list) — a depth-5 list has no schema, so it fails the
// union. The lazy list ⇆ listitem recursion is resolved per level,
// which terminates the zod recursion naturally.

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

const simpleInlineSchema = z.discriminatedUnion('type', [textNodeSchema, lineBreakSchema, inlineMathSchema])

const linkSchema: z.ZodType<LexicalCommentLinkNode> = z.object({
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

const inlineSchema: z.ZodType<LexicalCommentInlineNode> = z.union([simpleInlineSchema, linkSchema])

const paragraphSchema = z.object({
  ...ELEMENT_BASE_FIELDS,
  type: z.literal('paragraph'),
  children: z.array(inlineSchema),
  textFormat: z.number().int().min(0).max(TEXT_NODE_FORMAT_MAX).optional(),
  textStyle: z.string().optional(),
}) satisfies z.ZodType<LexicalCommentParagraphNode>

const quoteSchema = z.object({
  ...ELEMENT_BASE_FIELDS,
  type: z.literal('quote'),
  children: z.array(paragraphSchema),
}) satisfies z.ZodType<LexicalCommentQuoteNode>

const codeSchema = z.object({
  ...ELEMENT_BASE_FIELDS,
  type: z.literal('code'),
  language: z.string().optional(),
  theme: z.string().optional(),
  children: z.array(textNodeSchema),
}) satisfies z.ZodType<LexicalCodeNode>

const mathBlockSchema = z.object({
  type: z.literal('mathBlock'),
  tex: z.string(),
  mathml: z.string().optional(),
  svg: z.string().optional(),
  ...PT_KEY_FIELD,
  version: z.literal(1),
}) satisfies z.ZodType<LexicalMathBlockNode>

// The list ⇆ listitem recursion per level is resolved lazily; the
// opaque `unknown` output of the lazy references is narrowed with a
// targeted cast (the same trick `lexical/schema.ts` uses — the ONLY
// casts in this module).
const listItemChildrenSchema = (nested: z.ZodType<LexicalCommentListNode>) =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  z.array(z.union([paragraphSchema, inlineSchema, nested])) as unknown as z.ZodType<LexicalCommentListItemChildNode[]>

// The factories deliberately return the inferred `ZodObject` type (no
// `z.ZodType` annotation — that would erase the discriminant and break
// the `discriminatedUnion` below); each level const pins its dialect
// type with `satisfies`.
function listItemSchema(children: z.ZodType<LexicalCommentListItemChildNode[]>) {
  return z.object({
    ...ELEMENT_BASE_FIELDS,
    type: z.literal('listitem'),
    // `value` is REQUIRED: 0.45.0's `ListItemNode.exportJSON` always
    // emits it; `checked` only appears once a checkbox list sets it.
    value: z.number().int().min(1),
    checked: z.boolean().nullable().optional(),
    children,
  })
}

function listSchema(items: z.ZodType<LexicalCommentListItemNode>) {
  return z.object({
    ...ELEMENT_BASE_FIELDS,
    type: z.literal('list'),
    // Comment lists are `bullet` / `number` only — `check` is excluded
    // with the PT comment dialect (bullet/number list items only).
    listType: z.enum(['bullet', 'number']),
    // `start` / `tag` are REQUIRED: 0.45.0's `ListNode.exportJSON`
    // always emits them.
    start: z.number().int().min(1),
    tag: z.enum(['ul', 'ol']),
    children: z.array(items),
  })
}

// Level 4 — the deepest list: its items may only hold inlines and/or
// paragraphs — no nested list.
const listItemChildrenL4Schema = z.array(z.union([paragraphSchema, inlineSchema]))
const listItemL4Schema = listItemSchema(listItemChildrenL4Schema) satisfies z.ZodType<LexicalCommentListItemNode>
const listL4Schema = listSchema(listItemL4Schema) satisfies z.ZodType<LexicalCommentListNode>

// Level 3 items may nest a level-4 list; level 2 a level-3 list;
// level 1 (root) a level-2 list.
const listItemChildrenL3Schema = listItemChildrenSchema(listL4Schema)
const listItemL3Schema = listItemSchema(listItemChildrenL3Schema) satisfies z.ZodType<LexicalCommentListItemNode>
const listL3Schema = listSchema(listItemL3Schema) satisfies z.ZodType<LexicalCommentListNode>

const listItemChildrenL2Schema = listItemChildrenSchema(listL3Schema)
const listItemL2Schema = listItemSchema(listItemChildrenL2Schema) satisfies z.ZodType<LexicalCommentListItemNode>
const listL2Schema = listSchema(listItemL2Schema) satisfies z.ZodType<LexicalCommentListNode>

const listItemChildrenL1Schema = listItemChildrenSchema(listL2Schema)
const listItemL1Schema = listItemSchema(listItemChildrenL1Schema) satisfies z.ZodType<LexicalCommentListItemNode>
const listL1Schema = listSchema(listItemL1Schema) satisfies z.ZodType<LexicalCommentListNode>

const commentBlockSchema = z.discriminatedUnion('type', [
  paragraphSchema,
  quoteSchema,
  listL1Schema,
  codeSchema,
  mathBlockSchema,
])

const commentRootSchema = z.object({
  ...ELEMENT_BASE_FIELDS,
  type: z.literal('root'),
  children: z.array(commentBlockSchema),
}) satisfies z.ZodType<LexicalCommentRootNode>

export const lexicalCommentBodySchema = z.object({
  root: commentRootSchema,
}) satisfies z.ZodType<LexicalCommentBody>

/**
 * The canonical empty comment body — zero root children (the Lexical
 * counterpart of the PT `EMPTY_COMMENT_BODY` array). The editor
 * normalizes it to the single-empty-paragraph document on load; the
 * wire treats it as "no content".
 */
export const EMPTY_LEXICAL_COMMENT_BODY: LexicalCommentBody = {
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
 * Validate an arbitrary value as a `LexicalCommentBody` (structural gate
 * only — pure JSON validation, NO `lexical` runtime involved). Throws a
 * Zod `ZodError` on failure; use `safeParseLexicalCommentBody` for a
 * result envelope. Unknown fields are stripped per node type (whitelist
 * semantics), matching the PT wire schema behavior.
 */
export function parseLexicalCommentBody(value: unknown): LexicalCommentBody {
  return lexicalCommentBodySchema.parse(value)
}

export function safeParseLexicalCommentBody(
  value: unknown,
): { ok: true; body: LexicalCommentBody } | { ok: false; error: z.ZodError } {
  const result = lexicalCommentBodySchema.safeParse(value)
  if (result.success) {
    return { ok: true, body: result.data }
  }
  return { ok: false, error: result.error }
}

// --- structural helpers ----------------------------------------------------

/**
 * A comment body is "empty" when it has no blocks or every block is an
 * empty paragraph — the shape an empty document canonicalizes to (one
 * empty paragraph, mirroring the body dialect).
 */
export function isEmptyLexicalCommentBody(body: LexicalCommentBody): boolean {
  if (body.root.children.length === 0) {
    return true
  }
  return body.root.children.every((node) => node.type === 'paragraph' && node.children.length === 0)
}

/**
 * Blank check for the comment save path — the Lexical counterpart of
 * `isCommentBodyBlank` (PT). Whitespace-only text does not count:
 * a body is blank when every block contributes nothing after trimming.
 */
export function isLexicalCommentBodyBlank(body: LexicalCommentBody): boolean {
  if (body.root.children.length === 0) {
    return true
  }
  for (const block of body.root.children) {
    if (commentBlockText(block).trim().length > 0) {
      return false
    }
  }
  return true
}

function commentBlockText(block: LexicalCommentBlockNode): string {
  switch (block.type) {
    case 'paragraph':
      return commentInlineText(block.children)
    case 'quote':
      return block.children.map((paragraph) => commentInlineText(paragraph.children)).join('')
    case 'list':
      return block.children.map((item) => commentListItemText(item)).join('')
    case 'code':
      return block.children.map((child) => child.text).join('')
    case 'mathBlock':
      return block.tex
  }
}

function commentListItemText(item: LexicalCommentListItemNode): string {
  return item.children
    .map((child) => {
      if (child.type === 'list') {
        return commentBlockText(child)
      }
      if (child.type === 'paragraph') {
        return commentInlineText(child.children)
      }
      return commentInlineText([child])
    })
    .join('')
}

function commentInlineText(nodes: readonly LexicalCommentInlineNode[]): string {
  let out = ''
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        out += node.text
        break
      case 'linebreak':
        out += '\n'
        break
      case 'link':
        out += commentInlineText(node.children)
        break
      case 'mathInline':
        // The displayed glyph is the TeX source (mirrors
        // `commentBodyToHtml`'s `$…$` rendering).
        out += node.tex
        break
    }
  }
  return out
}
