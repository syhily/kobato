import { z } from 'zod'

import type { MusicPlayerBlockMeta } from '@/shared/types/music'

// Isomorphic Inkling Lexical JSON dialect. This module defines the storage
// contract and TypeScript types; it does NOT import Lexical runtime, DOM,
// server, client, or node:* APIs.

export const INKLING_SCHEMA_VERSION = 1
export const INKLING_LEXICAL_VERSION = '0.13.1'

export type InklingFeatureMode = 'article' | 'comment'

// --- Common Lexical serialization primitives --------------------------------

const inklingDirectionSchema = z.union([z.literal('ltr'), z.literal('rtl'), z.null()])
const inklingElementFormatSchema = z.union([z.string(), z.number()])

// --- Inline nodes -----------------------------------------------------------

export interface InklingTextNode {
  type: 'text'
  version: number
  key?: string
  text: string
  format?: number
  style?: string
  mode?: 'normal' | 'token' | 'segmented'
  detail?: number
}

export const inklingTextNodeSchema: z.ZodType<InklingTextNode> = z.object({
  type: z.literal('text'),
  version: z.number().int().min(1),
  key: z.string().optional(),
  text: z.string(),
  format: z.number().optional(),
  style: z.string().optional(),
  mode: z.union([z.literal('normal'), z.literal('token'), z.literal('segmented')]).optional(),
  detail: z.number().optional(),
})

export interface InklingLineBreakNode {
  type: 'linebreak'
  version: number
  key?: string
}

export const inklingLineBreakNodeSchema: z.ZodType<InklingLineBreakNode> = z.object({
  type: z.literal('linebreak'),
  version: z.number().int().min(1),
  key: z.string().optional(),
})

export interface InklingInlineMathNode {
  type: 'inline-math'
  version: number
  key?: string
  tex: string
  mathml?: string
}

export const inklingInlineMathNodeSchema: z.ZodType<InklingInlineMathNode> = z.object({
  type: z.literal('inline-math'),
  version: z.number().int().min(1),
  key: z.string().optional(),
  tex: z.string(),
  mathml: z.string().optional(),
})

export interface InklingFootnoteRefNode {
  type: 'footnote-ref'
  version: number
  key?: string
  targetKey: string
  refKey: string
  index: number
}

export const inklingFootnoteRefNodeSchema: z.ZodType<InklingFootnoteRefNode> = z.object({
  type: z.literal('footnote-ref'),
  version: z.number().int().min(1),
  key: z.string().optional(),
  targetKey: z.string().min(1),
  refKey: z.string().min(1),
  index: z.number().int().min(1),
})

export interface InklingLinkNode {
  type: 'link'
  version: number
  key?: string
  url: string
  target?: string | null
  rel?: string | null
  title?: string | null
  direction?: 'ltr' | 'rtl' | null
  format?: string | number
  indent?: number
  children: InklingInlineNode[]
}

export const inklingLinkNodeSchema: z.ZodType<InklingLinkNode> = z.object({
  type: z.literal('link'),
  version: z.number().int().min(1),
  key: z.string().optional(),
  url: z.string(),
  target: z.union([z.string(), z.null()]).optional(),
  rel: z.union([z.string(), z.null()]).optional(),
  title: z.union([z.string(), z.null()]).optional(),
  direction: inklingDirectionSchema.optional(),
  format: inklingElementFormatSchema.optional(),
  indent: z.number().int().min(0).optional(),
  children: z.lazy(() => inklingInlineContentSchema),
})

export type InklingInlineNode =
  | InklingTextNode
  | InklingLineBreakNode
  | InklingLinkNode
  | InklingInlineMathNode
  | InklingFootnoteRefNode

export const inklingInlineNodeSchema: z.ZodType<InklingInlineNode> = z.lazy(() =>
  z.union([
    inklingTextNodeSchema,
    inklingLineBreakNodeSchema,
    inklingLinkNodeSchema,
    inklingInlineMathNodeSchema,
    inklingFootnoteRefNodeSchema,
  ]),
)

export const inklingInlineContentSchema = z.array(inklingInlineNodeSchema)

// --- Non-recursive block nodes ---------------------------------------------

export interface InklingParagraphNode {
  type: 'paragraph'
  version: number
  key?: string
  direction?: 'ltr' | 'rtl' | null
  format?: string | number
  indent?: number
  children: InklingInlineNode[]
}

export const inklingParagraphNodeSchema: z.ZodType<InklingParagraphNode> = z.object({
  type: z.literal('paragraph'),
  version: z.number().int().min(1),
  key: z.string().optional(),
  direction: inklingDirectionSchema.optional(),
  format: inklingElementFormatSchema.optional(),
  indent: z.number().int().min(0).optional(),
  children: z.lazy(() => inklingInlineContentSchema),
})

export interface InklingHeadingNode {
  type: 'heading'
  version: number
  key?: string
  tag: 'h1' | 'h2' | 'h3' | 'h4'
  direction?: 'ltr' | 'rtl' | null
  format?: string | number
  indent?: number
  children: InklingInlineNode[]
}

export const inklingHeadingNodeSchema: z.ZodType<InklingHeadingNode> = z.object({
  type: z.literal('heading'),
  version: z.number().int().min(1),
  key: z.string().optional(),
  tag: z.enum(['h1', 'h2', 'h3', 'h4']),
  direction: inklingDirectionSchema.optional(),
  format: inklingElementFormatSchema.optional(),
  indent: z.number().int().min(0).optional(),
  children: z.lazy(() => inklingInlineContentSchema),
})

export interface InklingQuoteNode {
  type: 'quote'
  version: number
  key?: string
  direction?: 'ltr' | 'rtl' | null
  format?: string | number
  indent?: number
  children: InklingInlineNode[]
}

export const inklingQuoteNodeSchema: z.ZodType<InklingQuoteNode> = z.object({
  type: z.literal('quote'),
  version: z.number().int().min(1),
  key: z.string().optional(),
  direction: inklingDirectionSchema.optional(),
  format: inklingElementFormatSchema.optional(),
  indent: z.number().int().min(0).optional(),
  children: z.lazy(() => inklingInlineContentSchema),
})

export type InklingListItemChild = InklingInlineNode | InklingListNode

export const inklingListItemChildSchema: z.ZodType<InklingListItemChild> = z.lazy(() =>
  z.union([inklingInlineNodeSchema, inklingListNodeSchema]),
)

export interface InklingListItemNode {
  type: 'listitem'
  version: number
  key?: string
  value: number
  direction?: 'ltr' | 'rtl' | null
  format?: string | number
  indent?: number
  children: InklingListItemChild[]
}

export const inklingListItemNodeSchema: z.ZodType<InklingListItemNode> = z.lazy(() =>
  z.object({
    type: z.literal('listitem'),
    version: z.number().int().min(1),
    key: z.string().optional(),
    value: z.number().int().min(1),
    direction: inklingDirectionSchema.optional(),
    format: inklingElementFormatSchema.optional(),
    indent: z.number().int().min(0).optional(),
    children: z.array(inklingListItemChildSchema),
  }),
)

export interface InklingListNode {
  type: 'list'
  version: number
  key?: string
  listType: 'bullet' | 'number'
  start?: number
  tag?: string
  direction?: 'ltr' | 'rtl' | null
  format?: string | number
  indent?: number
  children: InklingListItemNode[]
}

export const inklingListNodeSchema: z.ZodType<InklingListNode> = z.lazy(() =>
  z.object({
    type: z.literal('list'),
    version: z.number().int().min(1),
    key: z.string().optional(),
    listType: z.enum(['bullet', 'number']),
    start: z.number().int().min(1).optional(),
    tag: z.string().optional(),
    direction: inklingDirectionSchema.optional(),
    format: inklingElementFormatSchema.optional(),
    indent: z.number().int().min(0).optional(),
    children: z.array(inklingListItemNodeSchema),
  }),
)

export const INKLING_IMAGE_LAYOUTS = ['left', 'center', 'right'] as const
export type InklingImageLayout = (typeof INKLING_IMAGE_LAYOUTS)[number]

export interface InklingImageCardNode {
  type: 'image-card'
  version: number
  key?: string
  src: string
  alt?: string
  caption?: string
  layout?: InklingImageLayout
  width?: number
  height?: number
  thumbhash?: string
  storagePath?: string
  imageId?: string
}

export const inklingImageCardNodeSchema: z.ZodType<InklingImageCardNode> = z.object({
  type: z.literal('image-card'),
  version: z.number().int().min(1),
  key: z.string().optional(),
  src: z.string(),
  alt: z.string().optional(),
  caption: z.string().optional(),
  layout: z.enum(INKLING_IMAGE_LAYOUTS).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  thumbhash: z.string().optional(),
  storagePath: z.string().optional(),
  imageId: z.string().optional(),
})

export interface InklingCodeBlockNode {
  type: 'code-block'
  version: number
  key?: string
  code: string
  language?: string
  highlightedHtml?: string
}

export const inklingCodeBlockNodeSchema: z.ZodType<InklingCodeBlockNode> = z.object({
  type: z.literal('code-block'),
  version: z.number().int().min(1),
  key: z.string().optional(),
  code: z.string(),
  language: z.string().optional(),
  highlightedHtml: z.string().optional(),
})

export interface InklingMathBlockNode {
  type: 'math-block'
  version: number
  key?: string
  tex: string
  mathml?: string
}

export const inklingMathBlockNodeSchema: z.ZodType<InklingMathBlockNode> = z.object({
  type: z.literal('math-block'),
  version: z.number().int().min(1),
  key: z.string().optional(),
  tex: z.string(),
  mathml: z.string().optional(),
})

export interface InklingMusicCardNode {
  type: 'music-card'
  version: number
  key?: string
  playerId: string
  auto?: boolean
  center?: boolean
  meta?: MusicPlayerBlockMeta
}

export const inklingMusicCardNodeSchema: z.ZodType<InklingMusicCardNode> = z.object({
  type: z.literal('music-card'),
  version: z.number().int().min(1),
  key: z.string().optional(),
  playerId: z.string().min(1),
  auto: z.boolean().optional(),
  center: z.boolean().optional(),
  meta: z.custom<MusicPlayerBlockMeta>().optional(),
})

export interface InklingTableCellNode {
  type: 'tablecell'
  version: number
  key?: string
  isHeader?: boolean
  direction?: 'ltr' | 'rtl' | null
  format?: string | number
  indent?: number
  children: InklingInlineNode[]
}

export const inklingTableCellNodeSchema: z.ZodType<InklingTableCellNode> = z.object({
  type: z.literal('tablecell'),
  version: z.number().int().min(1),
  key: z.string().optional(),
  isHeader: z.boolean().optional(),
  direction: inklingDirectionSchema.optional(),
  format: inklingElementFormatSchema.optional(),
  indent: z.number().int().min(0).optional(),
  children: z.lazy(() => inklingInlineContentSchema),
})

export interface InklingTableRowNode {
  type: 'tablerow'
  version: number
  key?: string
  cells: InklingTableCellNode[]
}

export const inklingTableRowNodeSchema: z.ZodType<InklingTableRowNode> = z.object({
  type: z.literal('tablerow'),
  version: z.number().int().min(1),
  key: z.string().optional(),
  cells: z.array(inklingTableCellNodeSchema),
})

export interface InklingTableNode {
  type: 'table'
  version: number
  key?: string
  rows: InklingTableRowNode[]
}

export const inklingTableNodeSchema: z.ZodType<InklingTableNode> = z.object({
  type: z.literal('table'),
  version: z.number().int().min(1),
  key: z.string().optional(),
  rows: z.array(inklingTableRowNodeSchema),
})

export interface InklingHorizontalRuleNode {
  type: 'horizontal-rule'
  version: number
  key?: string
}

export const inklingHorizontalRuleNodeSchema: z.ZodType<InklingHorizontalRuleNode> = z.object({
  type: z.literal('horizontal-rule'),
  version: z.number().int().min(1),
  key: z.string().optional(),
})

// --- Recursive container block nodes ----------------------------------------

export interface InklingSolutionNode {
  type: 'solution'
  version: number
  key?: string
  children: InklingNonRecursiveBlockNode[]
}

export const inklingSolutionNodeSchema: z.ZodType<InklingSolutionNode> = z.object({
  type: z.literal('solution'),
  version: z.number().int().min(1),
  key: z.string().optional(),
  children: z.array(z.lazy(() => inklingNonRecursiveBlockNodeSchema)),
})

export interface InklingTwoColumnNode {
  type: 'two-column'
  version: number
  key?: string
  left: InklingNonRecursiveBlockNode[]
  right: InklingNonRecursiveBlockNode[]
}

export const inklingTwoColumnNodeSchema: z.ZodType<InklingTwoColumnNode> = z.object({
  type: z.literal('two-column'),
  version: z.number().int().min(1),
  key: z.string().optional(),
  left: z.array(z.lazy(() => inklingNonRecursiveBlockNodeSchema)),
  right: z.array(z.lazy(() => inklingNonRecursiveBlockNodeSchema)),
})

export interface InklingFootnoteDefinitionNode {
  type: 'footnote-definition'
  version: number
  key?: string
  targetKey: string
  index: number
  children: InklingNonRecursiveBlockNode[]
}

export const inklingFootnoteDefinitionNodeSchema: z.ZodType<InklingFootnoteDefinitionNode> = z.object({
  type: z.literal('footnote-definition'),
  version: z.number().int().min(1),
  key: z.string().optional(),
  targetKey: z.string().min(1),
  index: z.number().int().min(1),
  children: z.array(z.lazy(() => inklingNonRecursiveBlockNodeSchema)),
})

// --- Block unions -----------------------------------------------------------

export type InklingNonRecursiveBlockNode =
  | InklingParagraphNode
  | InklingHeadingNode
  | InklingQuoteNode
  | InklingListNode
  | InklingImageCardNode
  | InklingCodeBlockNode
  | InklingMathBlockNode
  | InklingMusicCardNode
  | InklingTableNode
  | InklingHorizontalRuleNode

export const inklingNonRecursiveBlockNodeSchema: z.ZodType<InklingNonRecursiveBlockNode> = z.lazy(() =>
  z.union([
    inklingParagraphNodeSchema,
    inklingHeadingNodeSchema,
    inklingQuoteNodeSchema,
    inklingListNodeSchema,
    inklingImageCardNodeSchema,
    inklingCodeBlockNodeSchema,
    inklingMathBlockNodeSchema,
    inklingMusicCardNodeSchema,
    inklingTableNodeSchema,
    inklingHorizontalRuleNodeSchema,
  ]),
)

export type InklingBlockNode =
  | InklingNonRecursiveBlockNode
  | InklingSolutionNode
  | InklingTwoColumnNode
  | InklingFootnoteDefinitionNode

export const inklingBlockNodeSchema: z.ZodType<InklingBlockNode> = z.lazy(() =>
  z.union([
    inklingParagraphNodeSchema,
    inklingHeadingNodeSchema,
    inklingQuoteNodeSchema,
    inklingListNodeSchema,
    inklingImageCardNodeSchema,
    inklingCodeBlockNodeSchema,
    inklingMathBlockNodeSchema,
    inklingMusicCardNodeSchema,
    inklingSolutionNodeSchema,
    inklingTwoColumnNodeSchema,
    inklingTableNodeSchema,
    inklingFootnoteDefinitionNodeSchema,
    inklingHorizontalRuleNodeSchema,
  ]),
)

// --- Root and document ------------------------------------------------------

export interface InklingRootNode {
  type: 'root'
  version: number
  key?: string
  direction?: 'ltr' | 'rtl' | null
  format?: string | number
  indent?: number
  children: InklingBlockNode[]
}

export const inklingRootNodeSchema: z.ZodType<InklingRootNode> = z.object({
  type: z.literal('root'),
  version: z.number().int().min(1),
  key: z.string().optional(),
  direction: inklingDirectionSchema.optional(),
  format: inklingElementFormatSchema.optional(),
  indent: z.number().int().min(0).optional(),
  children: z.array(inklingBlockNodeSchema),
})

export interface InklingDocument {
  _type: 'inkling'
  schemaVersion: 1
  lexicalVersion: string
  root: InklingRootNode
}

export const inklingDocumentSchema: z.ZodType<InklingDocument> = z.object({
  _type: z.literal('inkling'),
  schemaVersion: z.literal(INKLING_SCHEMA_VERSION),
  lexicalVersion: z.string().min(1),
  root: inklingRootNodeSchema,
})

// --- Validation helpers -----------------------------------------------------

export function validateInklingDocument(value: unknown): InklingDocument {
  return inklingDocumentSchema.parse(value)
}

export function safeValidateInklingDocument(
  value: unknown,
): { ok: true; document: InklingDocument } | { ok: false; error: z.ZodError } {
  const result = inklingDocumentSchema.safeParse(value)
  if (result.success) {
    return { ok: true, document: result.data }
  }
  return { ok: false, error: result.error }
}
