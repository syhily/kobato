/**
 * Self-contained public DTO types for the Kobato Content API (SDK 1.x ↔
 * `/api/content/v1`).
 *
 * This module is the published package's type surface: it MUST NOT import
 * any workspace package — a consumer's `npm install` of this SDK must
 * resolve every type here from public npm packages only (zod + the
 * package's own declarations). The shapes are derived from the shared
 * contracts / types and the server Content API procedure outputs; the
 * contract-consistency test (`packages/sdk/tests/unit/contract-consistency
 * .test.ts`) pins this copy to the server's `ContentPublicRouter` at the
 * type level.
 *
 * Copy discipline: fields, optionality, unions and Date-vs-ISO-string
 * spellings must stay bit-identical to the sources listed per block —
 * drift breaks the consistency test.
 */

import { z } from 'zod'

// ─── wire primitives (source: the shared contracts primitives) ─────────────

export const idString = z.string().regex(/^\d+$/, 'numeric id required')
export const isoDateTime = z.iso.datetime()

export interface MarkdownHeading {
  depth: number
  slug: string
  text: string
}

// ─── PortableText wire schema (source: the shared PT schema) ────────────────
// Validation refinements (URL safety, non-empty keys) are dropped — only
// the inferred types matter for the typed client; the server remains the
// validation perimeter.

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
  href: z.string(),
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
  playerId: z.string().min(1),
  auto: z.boolean().optional(),
  center: z.boolean().optional(),
})
export type MusicPlayerBlock = z.infer<typeof musicPlayerBlockSchema>

export const tableCellSchema = z.object({
  _type: z.literal('tableCell'),
  _key: NON_EMPTY_KEY,
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

// ─── Lexical body dialect (source: the shared lexical schema) ──────────────
// The R5b wire format: a Lexical 0.45.0 EditorState JSON subset
// (`{root: {children: [...]}}`). Type-only copies of
// `@kobato/shared/lexical/schema` — the SDK must stay self-contained.

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

export interface LexicalRootNode extends LexicalElementBase {
  type: 'root'
  children: LexicalBlockNode[]
}

export interface LexicalBody {
  root: LexicalRootNode
}

// ─── Lexical comment dialect (source: the shared lexical comment schema) ──

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

// ─── enriched PT body (source: the shared PT enriched types) ───────────────

export interface MusicPlayerBlockMeta {
  id: string
  name: string
  artist: string
  cover: string
  audioUrl: string
  lyric: string
}

export type EnrichedMusicPlayerBlock = MusicPlayerBlock & { meta?: MusicPlayerBlockMeta }

export type EnrichedNonRecursiveBlock = Exclude<NonRecursiveBlock, MusicPlayerBlock> | EnrichedMusicPlayerBlock

export type EnrichedSolutionBlock = Omit<SolutionBlock, 'children'> & { children: EnrichedNonRecursiveBlock[] }

export type EnrichedTwoColumnBlock = Omit<TwoColumnBlock, 'left' | 'right'> & {
  left: EnrichedNonRecursiveBlock[]
  right: EnrichedNonRecursiveBlock[]
}

export type EnrichedFootnoteDefinitionBlock = Omit<FootnoteDefinitionBlock, 'children'> & {
  children: EnrichedNonRecursiveBlock[]
}

export type EnrichedBlock =
  | EnrichedNonRecursiveBlock
  | EnrichedSolutionBlock
  | EnrichedTwoColumnBlock
  | EnrichedFootnoteDefinitionBlock

export type EnrichedPortableTextBody = EnrichedBlock[]

// ─── comment body schema (source: the shared PT comment schema) ────────────

const COMMENT_LIST_MAX_LEVEL = 4

const COMMENT_BLOCK_STYLES = ['normal', 'blockquote'] as const

const commentMarkDefSchema = z.discriminatedUnion('_type', [linkMarkDefSchema, mathInlineMarkDefSchema])

export const commentTextBlockSchema = textBlockSchema.extend({
  style: z.enum(COMMENT_BLOCK_STYLES).optional(),
  level: z.number().int().min(1).max(COMMENT_LIST_MAX_LEVEL).optional(),
  markDefs: z.array(commentMarkDefSchema).optional(),
})

export type CommentTextBlock = z.infer<typeof commentTextBlockSchema>

export const commentBlockSchema = z.discriminatedUnion('_type', [
  commentTextBlockSchema,
  codeBlockSchema,
  mathBlockSchema,
])

export type CommentBlock = z.infer<typeof commentBlockSchema>

export const commentBodySchema = z.array(commentBlockSchema)
export type CommentBody = z.infer<typeof commentBodySchema>

// ─── comment wire DTO (source: the shared contracts comments) ──────────────

export const commentBaseDto = z.object({
  id: idString,
  createAt: isoDateTime,
  updatedAt: isoDateTime,
  deleteAt: isoDateTime.nullable(),
  deleteRequestedAt: isoDateTime.nullable().optional(),
  body: z.custom<LexicalCommentBody>(),
  type: z.enum(['post', 'page']).nullable(),
  ownerId: idString.nullable(),
  userId: idString,
  isVerified: z.boolean().nullable(),
  rid: z.number().int().nonnegative(),
  isCollapsed: z.boolean().nullable(),
  isPending: z.boolean().nullable(),
  isPinned: z.boolean().nullable(),
  voteUp: z.number().nullable(),
  voteDown: z.number().nullable(),
  rootId: idString.nullable(),
  name: z.string(),
  emailVerified: z.boolean(),
  link: z.string().nullable(),
  badgeName: z.string().nullable(),
  badgeColor: z.string().nullable(),
  badgeTextColor: z.string().nullable(),
})

// The recursive `children` branch uses a getter so zod resolves the schema
// lazily and `z.infer` derives the recursive wire type directly.
export const commentItemDto = commentBaseDto.extend({
  get children() {
    return z.array(commentItemDto).optional()
  },
  childrenTruncated: z.boolean().optional(),
  childrenTotal: z.number().int().nonnegative().optional(),
})
export type CommentItemWire = z.infer<typeof commentItemDto>

// ─── webmention wire DTO (source: the shared contracts webmentions) ────────

export const publicWebmentionDto = z.object({
  id: idString,
  sourceUrl: z.string(),
  type: z.enum(['mention', 'reply', 'like', 'repost']),
  authorName: z.string().nullable(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  createdAt: isoDateTime,
})
export type PublicWebmentionWire = z.infer<typeof publicWebmentionDto>

// ─── catalog types (source: the shared catalog types) ──────────────────────

export interface Friend {
  website: string
  description?: string
  homepage: string
  poster: string
  posterThumbhash?: string
}

export interface Category {
  name: string
  slug: string
  cover: string
  coverThumbhash?: string
  description: string
  counts: number
  permalink: string
}

export interface Tag {
  name: string
  slug: string
  counts: number
  permalink: string
}

export interface ClientPage {
  id: string
  title: string
  date: Date
  updated?: Date
  comments: boolean
  cover: string
  coverThumbhash?: string
  coverWidth?: number
  coverHeight?: number
  og?: string
  published: boolean
  summary: string
  toc: boolean
  showUpdated: boolean
  showFriends: boolean
  slug: string
  permalink: string
  headings: MarkdownHeading[]
}

export interface ClientPost {
  id: string
  title: string
  date: Date
  updated?: Date
  comments: boolean
  alias: string[]
  tags: string[]
  category: string
  summary: string
  cover: string
  coverThumbhash?: string
  og?: string
  published: boolean
  visible: boolean
  toc: boolean
  showUpdated: boolean
  slug: string
  permalink: string
  headings: MarkdownHeading[]
  pinnedAt?: Date
}

export interface PostMetadata {
  likes: number
  views: number
  comments: number
}

export type ClientPostWithMetadata = ClientPost & { meta: PostMetadata }

export interface ListingPostCard {
  id: string
  slug: string
  title: string
  summary: string
  cover: string
  coverThumbhash?: string
  permalink: string
  category: string
  date: Date
  published: boolean
}

export type ListingPostCardWithMetadata = ListingPostCard & { meta: PostMetadata }

export interface DetailPostShell {
  id: string
  slug: string
  title: string
  summary: string
  cover: string
  coverThumbhash?: string
  permalink: string
  category: string
  tags: string[]
  date: Date
  updated?: Date
  og?: string
  comments: boolean
  toc: boolean
  showUpdated: boolean
  headings: MarkdownHeading[]
}

export interface DetailPageShell {
  id: string
  slug: string
  title: string
  summary: string
  cover: string
  coverThumbhash?: string
  coverWidth?: number
  coverHeight?: number
  permalink: string
  date: Date
  updated?: Date
  og?: string
  comments: boolean
  toc: boolean
  showUpdated: boolean
  headings: MarkdownHeading[]
}

export interface SidebarPostLink {
  slug: string
  title: string
  permalink: string
}

export interface SidebarTagLink {
  name: string
  slug: string
  permalink: string
  counts: number
}

export interface CommentFormUser {
  id: string
  name: string
  email: string
  website: string | null
  admin: boolean
}

/** Pre-computed `MetaDescriptor[]` ready to return from `meta()`. */
export type ListingSeoMode = 'always' | 'skip-on-first-page'

export interface ListingMetadataFlags {
  likes?: boolean
  views?: boolean
  comments?: boolean
}

// Structural copy of react-router's `MetaDescriptor` (source:
// node_modules/react-router/.../routeModules.d.ts) so the published SDK
// does not need react-router installed to resolve its types.
export type SdkLdJsonObject = { [Key in string]: SdkLdJsonValue } & { [Key in string]?: SdkLdJsonValue | undefined }
export type SdkLdJsonArray = SdkLdJsonValue[] | readonly SdkLdJsonValue[]
export type SdkLdJsonPrimitive = string | number | boolean | null
export type SdkLdJsonValue = SdkLdJsonPrimitive | SdkLdJsonObject | SdkLdJsonArray
export type SdkMetaDescriptor =
  | { charSet: 'utf-8' }
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string }
  | { httpEquiv: string; content: string }
  | { 'script:ld+json': SdkLdJsonObject | SdkLdJsonObject[] }
  | { tagName: 'meta' | 'link'; [name: string]: string }
  | { [name: string]: unknown }

export interface ListingPageLoaderData<TExtra = undefined> {
  pageNum: number
  totalPage: number
  rootPath: string
  resolvedPosts: ListingPostCardWithMetadata[]
  title?: string
  description?: string
  seo: SdkMetaDescriptor[]
  extra: TExtra
  listingNowIso: string
}

export interface SidebarData {
  posts: SidebarPostLink[]
  tags: Tag[]
  recentComments: LatestComment[]
}

export interface HomeExtra {
  categoryLinks: Record<string, string>
  featurePosts: ListingPostCard[]
  sidebar: SidebarData
}

// ─── comment assembly types (source: the shared comments types) ────────────

export interface LatestComment {
  title: string
  author: string
  authorLink: string
  permalink: string
}

export interface CommentAndUser {
  id: number
  createAt: Date
  updatedAt: Date
  deleteAt: Date | null
  deleteRequestedAt?: Date | string | null
  body: LexicalCommentBody
  content: string | null
  type: 'post' | 'page' | null
  ownerId: number | null
  userId: number
  isVerified: boolean | null
  ua: string | null
  ip: string | null
  rid: number
  isCollapsed: boolean | null
  isPending: boolean | null
  isPinned: boolean | null
  voteUp: number | null
  voteDown: number | null
  rootId: number | null
  name: string
  email: string
  emailVerified: boolean
  link: string | null
  badgeName: string | null
  badgeColor: string | null
  badgeTextColor: string | null
}

export interface Comments {
  comments: CommentAndUser[]
  count: number
  roots_count: number
}

export interface DetailPageComments {
  commentData: Comments | null
  commentItems: CommentItemWire[]
}

export interface CommentReq {
  page_key: string
  name: string
  email: string
  link?: string
  body: LexicalCommentBody
  rid?: number
}

// ─── image / font meta (source: the shared images / fonts types) ───────────

export interface ResolvedImageMeta {
  thumbhash?: string
  width?: number
  height?: number
}

export interface ResolvedFont {
  family: string
  href: string
}

export interface ResolvedFonts {
  global: ResolvedFont[]
  post: ResolvedFont[]
  code: ResolvedFont[]
}

// ─── blog settings bundle (source: the shared config types) ────────────────

export const SOCIAL_NETWORKS = ['github', 'x', 'wechat', 'weibo', 'qq'] as const
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number]

export interface SiteIdentitySettings {
  title: string
  description: string
  website: string
  keywords: string[]
  author: { name: string; email: string; url: string }
  locale: string
  timeZone: string
  timeFormat: string
  initialYear: number
  icpNo?: string
  moeIcpNo?: string
}

export interface NavigationItem {
  text: string
  link: string
  target?: string
}

export interface FooterNavItem {
  type: 'social' | 'themeToggle' | 'search'
  network?: SocialNetwork // only when type === 'social'
}

export interface NavigationSettings {
  navigation: {
    sideNav: NavigationItem[]
    footerNav: FooterNavItem[]
  }
}

export interface SocialItem {
  name: string
  network: SocialNetwork
  type: 'link' | 'qrcode'
  title?: string
  link: string
}

export interface SocialsSettings {
  socials: SocialItem[]
}

export interface ContentSettings {
  pagination: {
    posts: number
    category: number
    tags: number
    search: number
  }
  feed: {
    full: boolean
    size: number
  }
  post: {
    sort: 'asc' | 'desc'
    sortBy: 'publishedAt' | 'updatedAt'
    featureEnabled: boolean
  }
  footnotes: {
    sectionTitle: string
  }
}

export type SidebarWidgetType = 'search' | 'recentPosts' | 'recentComments' | 'randomTags' | 'todayCalendar'

export interface SidebarWidget {
  type: SidebarWidgetType
  enabled: boolean
  count?: number
}

export type DailyQuoteSource = 'shanbay' | 'one' | 'hitokoto' | 'custom' | 'local'

export interface CustomQuote {
  content: string
  author: string
}

export interface SidebarSettings {
  sidebar: {
    widgets: SidebarWidget[]
    dailyQuote: {
      source: DailyQuoteSource
      customQuotes: CustomQuote[]
    }
  }
}

export interface CommentsSettings {
  comments: {
    size: number
    avatar: {
      mirror: string
    }
    tokenTtlSeconds: number
  }
}

export interface WebmentionsSettings {
  webmention: {
    receiveEnabled: boolean
    displayOnPosts: boolean
  }
}

export interface SeoSettings {
  toc: {
    minHeadingLevel: number
    maxHeadingLevel: number
  }
  og: {
    width: number
    height: number
  }
}

export interface MailSettings {
  mail: {
    enabled: boolean
    host: string
    apiKey?: string | undefined
    sender: string
    transport: 'zeabur' | 'smtp' | 'mailgun'
    smtpHost: string
    smtpPort: number
    smtpUser: string
    smtpPass?: string | undefined
    smtpSecure: boolean
    smtpRequireTls: boolean
    smtpRejectUnauthorized: boolean
    mailgunDomain: string
    mailgunApiKey?: string | undefined
  }
}

export interface NewsletterSettings {
  newsletter: {
    enabled: boolean
    fromName: string
    subjectPrefix: string
  }
}

// Tunable cache buckets only — the settings slot list derives from
// the shared cache registry (tunable: true entries): og, calendar,
// avatar, imageMeta, searchResult.
export type TunableCacheBucketId = 'og' | 'calendar' | 'avatar' | 'imageMeta' | 'searchResult'

export interface CacheBucketSlot {
  prefix: string
  ttlSeconds: number
}

export interface CacheSettings {
  cache: Record<TunableCacheBucketId, CacheBucketSlot>
}

export type StorageDriver = 's3' | 'local'

export interface BrandingObjectRef {
  etag: string
  contentType: string
  size: number
  updatedAt: string
  driver: StorageDriver
}

export interface SiteAssetBranding {
  faviconSvg?: BrandingObjectRef
  logoSvg?: BrandingObjectRef
  logoDarkSvg?: BrandingObjectRef
  logoLargeSvg?: BrandingObjectRef
  logoLargeDarkSvg?: BrandingObjectRef
  faviconIco?: BrandingObjectRef
  appleTouchIcon?: BrandingObjectRef
  icon192?: BrandingObjectRef
  icon512?: BrandingObjectRef
  openGraph?: BrandingObjectRef
  blogPoster?: BrandingObjectRef
  blogPosterDark?: BrandingObjectRef
  defaultAvatar?: BrandingObjectRef
  defaultMusicCover?: BrandingObjectRef
  robotsTxt?: string
}

export interface AssetsSettings {
  asset: { host: string; scheme: 'http' | 'https' }
  storage: {
    enabled: boolean
    endpoint: string
    region: string
    bucket: string
    accessKeyId: string
    secretAccessKey?: string | undefined
    forcePathStyle: boolean
    urlTemplate: string
  }
  upload: {
    maxBytes: number
    jpegQuality: number
  }
  branding?: SiteAssetBranding
}

export interface RateLimitBucket {
  windowSeconds: number
  maxAttempts: number
}

export interface RateLimitSettings {
  signInIp: RateLimitBucket
  commentPostIp: RateLimitBucket
  commentPostEmail: RateLimitBucket
  likeIncreaseIp: RateLimitBucket
  inviteIp: RateLimitBucket
  inviteEmail: RateLimitBucket
  passwordResetIp: RateLimitBucket
  passwordResetEmail: RateLimitBucket
  passwordResetTarget: RateLimitBucket
  resourceIp: RateLimitBucket
  otpSendIp: RateLimitBucket
  otpSendEmail: RateLimitBucket
  otpVerifyIp: RateLimitBucket
  otpVerifyEmail: RateLimitBucket
  signInEmail: RateLimitBucket
  passkeyAuthBeginIp: RateLimitBucket
  passkeyAuthFinishIp: RateLimitBucket
  passkeyRegisterBeginIp: RateLimitBucket
  passkeyRegisterFinishIp: RateLimitBucket
  passkeySetForceIp: RateLimitBucket
  passkeyDeleteIp: RateLimitBucket
}

export interface FontsSettings {
  og: { family: string }
  calendar: { family: string }
  global: string[]
  post: string[]
  code: string[]
}

export interface BackupSettings {
  scheduled: {
    enabled: boolean
    frequency: 'daily' | 'weekly' | 'monthly'
    hour: number
    minute: 0 | 30
    dayOfWeek?: number
    dayOfMonth?: number
  }
  retention: {
    enabled: boolean
    days: number
  }
}

export interface LimitsSettings {
  maxRequestBodySize: number
  sessionMaxAge: number
  auditLogDbRetentionDays: number
  auditLogArchiveRetentionDays: number
}

export interface AnalyticsSettings {
  analytics: {
    trackAdmin: boolean
    keepBotRows: boolean
    geoipAutoUpdate: boolean
  }
}

export interface SecuritySettings {
  csrf: {
    enabled: boolean
    exemptPaths: string[]
  }
  cors: {
    enabled: boolean
    origins: string[]
  }
  passkey: {
    enabled: boolean
  }
}

export interface BlogSettingsBundle {
  siteIdentity: SiteIdentitySettings | null
  assets: AssetsSettings | null
  navigation: NavigationSettings | null
  socials: SocialsSettings | null
  content: ContentSettings | null
  sidebar: SidebarSettings | null
  comments: CommentsSettings | null
  webmentions: WebmentionsSettings | null
  seo: SeoSettings | null
  mail: MailSettings | null
  newsletter: NewsletterSettings | null
  cache: CacheSettings | null
  rateLimit: RateLimitSettings | null
  fonts: FontsSettings | null
  backup: BackupSettings | null
  limits: LimitsSettings | null
  analytics: AnalyticsSettings | null
  security: SecuritySettings | null
}

// ─── Content API procedure outputs ──────────────────────────────────────────
// Derived from the server loaders the procedures wrap (the server http
// loaders + the content-public controller).
// `detail` is the "critical" detail payload — the streaming `comments` /
// `webmentions` Promise fields are fanned out to their own list procedures
// and never ride the RPC wire.

export interface PublicDetailCritical {
  commentKey: string
  likes: number
  currentUser: CommentFormUser | undefined
  admin: boolean
  recentComments: LatestComment[]
}

export interface PostDetailOutput {
  post: DetailPostShell
  body: LexicalBody
  visibleTags: Tag[]
  sidebarPosts: SidebarPostLink[]
  tags: Tag[]
  detail: PublicDetailCritical
  imageMeta: Record<string, ResolvedImageMeta>
  musicMeta: Record<string, MusicPlayerBlockMeta>
  draftMarker: 'draft' | 'unpublished-draft' | 'published-draft' | null
  /** Set when `slug` matched an alias — the frontend 301s to this slug. */
  canonicalSlug: string | null
}

export interface PageDetailOutput {
  page: DetailPageShell
  body: LexicalBody
  friends: Friend[]
  showFriends: boolean
  draftMarker: 'draft' | 'unpublished-draft' | 'published-draft' | null
  detail: PublicDetailCritical
  imageMeta: Record<string, ResolvedImageMeta>
  musicMeta: Record<string, MusicPlayerBlockMeta>
  footnotesSectionTitle: string
  publicEtag: string | null
}

export interface ArchivesOutput {
  resolvedPosts: ListingPostCardWithMetadata[]
  listingNowIso: string
}

export interface LayoutOutput {
  blogSettings: BlogSettingsBundle | null
  fonts: ResolvedFonts | null
}

export interface CategoryDetailOutput {
  slug: string
  name: string
  description: string
}

export interface TagDetailOutput {
  slug: string
  name: string
}

/** Redirect adaptation shared by the listing procedures: page loaders
 * throw React-Router-shaped 301/302 `Response`s that become this payload
 * on the RPC wire; the frontend replays them with `throw redirect(...)`. */
export interface RedirectPayload {
  redirectTo: string
}
