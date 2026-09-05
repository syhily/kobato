import { z } from 'zod'

import { isSafeUrl } from '@/shared/sanitize-url'

// LEGACY (R14): PortableText survives only for pre-Lexical `content.body` /
// comment rows until the R15 backfill converts them. No new consumer may
// import this schema; R15's row-by-row converter validates against it.
//
// Strict PortableText subset for this repository. PT was stored in
// `content.body` (`jsonb`) and mapped 1:1 to the (retired) SSR renderer's React
// components; Zod rejects unknown payloads at the API perimeter.

const NON_EMPTY_KEY = z.string().min(1)

export const STANDARD_DECORATORS = ['strong', 'em', 'underline', 'code', 'strike-through'] as const
export type StandardDecorator = (typeof STANDARD_DECORATORS)[number]

export const STANDARD_BLOCK_STYLES = ['normal', 'h1', 'h2', 'h3', 'h4', 'blockquote'] as const
export type StandardBlockStyle = (typeof STANDARD_BLOCK_STYLES)[number]

export const STANDARD_LIST_ITEMS = ['bullet', 'number'] as const
export type StandardListItem = (typeof STANDARD_LIST_ITEMS)[number]

export const linkMarkDefSchema = z.object({
  _type: z.literal('link'),
  _key: NON_EMPTY_KEY,
  href: z.string().refine((v) => isSafeUrl(v), {
    message: 'href must not use javascript:, data:, or vbscript: protocol',
  }),
  rel: z.string().optional(),
  target: z.string().optional(),
})
export type LinkMarkDef = z.infer<typeof linkMarkDefSchema>

export const mathInlineMarkDefSchema = z.object({
  _type: z.literal('mathInline'),
  _key: NON_EMPTY_KEY,
  tex: z.string(),
  mathml: z.string().optional(),
  svg: z.string().optional(),
})
export type MathInlineMarkDef = z.infer<typeof mathInlineMarkDefSchema>

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

export const spanSchema = z.object({
  _type: z.literal('span'),
  _key: NON_EMPTY_KEY,
  text: z.string(),
  marks: z.array(z.string()).optional(),
})
export type Span = z.infer<typeof spanSchema>

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
  storagePath: z.string().optional(),
  imageId: z.string().optional(),
})
export type ImageBlock = z.infer<typeof imageBlockSchema>

export const codeBlockSchema = z.object({
  _type: z.literal('code'),
  _key: NON_EMPTY_KEY,
  code: z.string(),
  language: z.string().optional(),
  highlightedHtml: z.string().optional(),
})
export type CodeBlock = z.infer<typeof codeBlockSchema>

export const mathBlockSchema = z.object({
  _type: z.literal('mathBlock'),
  _key: NON_EMPTY_KEY,
  tex: z.string(),
  mathml: z.string().optional(),
  svg: z.string().optional(),
})
export type MathBlock = z.infer<typeof mathBlockSchema>

export const horizontalRuleBlockSchema = z.object({
  _type: z.literal('horizontalRule'),
  _key: NON_EMPTY_KEY,
})
export type HorizontalRuleBlock = z.infer<typeof horizontalRuleBlockSchema>

export const musicPlayerBlockSchema = z.object({
  _type: z.literal('musicPlayer'),
  _key: NON_EMPTY_KEY,
  /** 16-char `[a-z0-9]` opaque handle from `music.player_id`. */
  playerId: z.string().min(1),
  auto: z.boolean().optional(),
  center: z.boolean().optional(),
})
export type MusicPlayerBlock = z.infer<typeof musicPlayerBlockSchema>

export const tableCellSchema = z.object({
  _type: z.literal('tableCell'),
  _key: NON_EMPTY_KEY,
  /** When true the cell renders as `<th>` instead of `<td>`. */
  isHeader: z.boolean().optional(),
  content: z.array(spanSchema),
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
  hasHeaderRow: z.boolean().optional(),
})
export type TableBlock = z.infer<typeof tableBlockSchema>

export type SolutionBlock = {
  _type: 'solution'
  _key: string
  children: NonRecursiveBlock[]
}

export type TwoColumnBlock = {
  _type: 'twoColumn'
  _key: string
  left: NonRecursiveBlock[]
  right: NonRecursiveBlock[]
}

export type FootnoteDefinitionBlock = {
  _type: 'footnoteDefinition'
  _key: string
  index: number
  children: NonRecursiveBlock[]
}

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

export const portableTextBodySchema = z.array(blockSchema)
export type PortableTextBody = z.infer<typeof portableTextBodySchema>

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
