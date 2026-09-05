import type { CommentEditorState } from '@/shared/lexical/comment-schema'
import type { LexicalEditorState, LexicalNodeJson } from '@/shared/lexical/schema'
import type { CommentBody } from '@/shared/pt/comment-schema'
import type {
  ImageBlock,
  MarkDef,
  NonRecursiveBlock,
  PortableTextBody,
  Span,
  TableBlock,
  TextBlock,
} from '@/shared/pt/schema'

import { commentEditorStateSchema } from '@/shared/lexical/comment-schema'
import { lexicalEditorStateSchema } from '@/shared/lexical/schema'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// The bespoke PortableText → Lexical converter (plan
// docs/plans/inkling-editor-replacement.md, round R15; 三核裁决: zero-loss
// direct structural mapping, NO HTML round-trip of the source — the
// round-trip survives only as the cross-check in `./pt-lexical-crosscheck`).
// Every PT construct from the LEGACY schema (`@/shared/pt/schema`) maps
// explicitly; anything without a mapping is collected and FAILS the row
// (`UnmappedConstructError` carries the full list) — nothing is silently
// dropped.
//
// Mapping table (article/page surface):
//   block style normal/(absent) → paragraph           h1–h4 → extended-heading(tag)
//   block style blockquote      → extended-quote      align → element format
//   listItem bullet/number @lvl → nested list > listitem (Lexical nesting)
//   span decorators → text format bitmask (strong 1, em 2, strike 4, underline 8, code 16)
//   '\n' in span text           → linebreak nodes (PT hard-break semantics)
//   markDef link                → link node wrapping the consecutive-span run
//   markDef mathInline          → math-inline node (span text dropped —
//                                 renderers ignore it on both sides)
//   markDef footnoteRef         → footnote-ref text node (text = 1-based index)
//   image (9 fields)            → image node (KobatoImageNode dataset; layout
//                                 carried on the kobato key, cardWidth regular)
//   code                        → codeblock (highlightedHtml re-derived)
//   mathBlock                   → math (mathml/svg re-derived by the prerender)
//   horizontalRule              → horizontalrule
//   musicPlayer                 → music-player {playerId} (+ save-time meta
//                                 snapshot filled by the caller); the legacy
//                                 auto/center flags have no dataset slot (R10
//                                 登记) and are counted, not carried
//   table (+rows/cells)         → table > tablerow > tablecell (headerState
//                                 COLUMN for the header row, ROW otherwise)
//   solution                    → solution card, nested blocks → fragment →
//                                 HTML `content` via the projection renderer
//   twoColumn                   → two-column card (`left`/`right` HTML)
//   footnoteDefinition          → footnotedefinition card (`content` HTML,
//                                 targetKey = PT `_key`); collected and
//                                 appended at the doc end (inkling's run
//                                 invariant; PT already stores them there)
// Comment surface: block (normal/blockquote/lists ≤4) / code / mathBlock with
// link + mathInline markDefs — the same converters, validated against the
// restricted comment schema.
//
// Hard-fail (unmapped) constructs: a span mark that is neither a known
// decorator nor resolves to a markDef (`dangling-mark:<name>`), a span
// carrying two or more markDef references (`multi-markdef-span`), and any
// `_type` outside the schema (unreachable past zod validation, still
// defended).

/** Per-body conversion statistics; the executor merges these into the report. */
export interface PtConversionStats {
  /** Every visited PT `_type` (nested blocks included) → count. */
  blockTypes: Record<string, number>
  markDefTypes: Record<string, number>
  decoratorMarks: Record<string, number>
  /** Container card type → nested PT `_type` → count. Cards whose nested
   * content holds card-type blocks (image/code/mathBlock/…) render fine but
   * the R10 nested editors mount no card nodes — editing re-serializes
   * without them. Counted for the audit report. */
  nestedBlockTypes: Record<string, Record<string, number>>
  /** musicPlayer blocks carrying auto/center flags the dataset drops. */
  musicFlagDrops: number
  /** footnoteRef markDefs pointing at a missing definition (converted as-is). */
  orphanFootnoteRefs: number
}

export function emptyPtConversionStats(): PtConversionStats {
  return {
    blockTypes: {},
    markDefTypes: {},
    decoratorMarks: {},
    nestedBlockTypes: {},
    musicFlagDrops: 0,
    orphanFootnoteRefs: 0,
  }
}

export function mergePtConversionStats(target: PtConversionStats, source: PtConversionStats): void {
  for (const [key, count] of Object.entries(source.blockTypes)) {
    target.blockTypes[key] = (target.blockTypes[key] ?? 0) + count
  }
  for (const [key, count] of Object.entries(source.markDefTypes)) {
    target.markDefTypes[key] = (target.markDefTypes[key] ?? 0) + count
  }
  for (const [key, count] of Object.entries(source.decoratorMarks)) {
    target.decoratorMarks[key] = (target.decoratorMarks[key] ?? 0) + count
  }
  for (const [container, nested] of Object.entries(source.nestedBlockTypes)) {
    const bucket = (target.nestedBlockTypes[container] ??= {})
    for (const [key, count] of Object.entries(nested)) {
      bucket[key] = (bucket[key] ?? 0) + count
    }
  }
  target.musicFlagDrops += source.musicFlagDrops
  target.orphanFootnoteRefs += source.orphanFootnoteRefs
}

/** A body holds constructs with no mapping — the row fails, nothing is written. */
export class UnmappedConstructError extends Error {
  readonly constructs: readonly string[]
  constructor(constructs: readonly string[]) {
    super(`unmapped PortableText constructs: ${constructs.join(', ')}`)
    this.name = 'UnmappedConstructError'
    this.constructs = constructs
  }
}

export interface PtToLexicalOptions {
  /** Renders a converted nested-block fragment to the card dataset HTML
   * (the projection renderer — `renderLexicalFragmentHtml`). Target-side
   * rendering, not a source round-trip. */
  renderFragmentHtml: (children: LexicalNodeJson[]) => Promise<string>
}

interface Ctx extends PtToLexicalOptions {
  stats: PtConversionStats
  unmapped: string[]
  fragments: NestedFragment[]
  /** `_key`s of the body's footnoteDefinition blocks (orphan-ref detection). */
  footnoteDefinitionKeys: ReadonlySet<string>
}

function bump(bucket: Record<string, number>, key: string): void {
  bucket[key] = (bucket[key] ?? 0) + 1
}

function elementNode(
  type: string,
  children: Record<string, unknown>[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { type, version: 1, children, direction: 'ltr', format: '', indent: 0, ...extra }
}

function textNode(text: string, format = 0): Record<string, unknown> {
  return { type: 'extended-text', version: 1, detail: 0, format, mode: 'normal', style: '', text }
}

// Lexical TEXT_FORMAT bitmask (lexical 0.46): bold 1, italic 2,
// strikethrough 4, underline 8, code 16.
const DECORATOR_FORMAT: Record<string, number> = {
  strong: 1,
  em: 2,
  'strike-through': 4,
  underline: 8,
  code: 16,
}

interface ClassifiedSpan {
  format: number
  def: MarkDef | null
}

function classifySpan(span: Span, markDefs: readonly MarkDef[], ctx: Ctx): ClassifiedSpan {
  let format = 0
  let def: MarkDef | null = null
  for (const mark of span.marks ?? []) {
    const decorator = DECORATOR_FORMAT[mark]
    if (decorator !== undefined) {
      format |= decorator
      bump(ctx.stats.decoratorMarks, mark)
      continue
    }
    const found = markDefs.find((entry) => entry._key === mark) ?? null
    if (found === null) {
      ctx.unmapped.push(`dangling-mark:${mark}`)
      continue
    }
    if (def !== null) {
      ctx.unmapped.push('multi-markdef-span')
      continue
    }
    def = found
  }
  return { format, def }
}

/** Pushes a span's text as text/linebreak nodes (`\n` IS the PT hard break). */
function pushTextRun(out: Record<string, unknown>[], text: string, format: number): void {
  const segments = text.split('\n')
  for (let i = 0; i < segments.length; i += 1) {
    if (i > 0) {
      out.push({ type: 'linebreak', version: 1 })
    }
    const segment = segments[i]!
    if (segment === '') {
      continue
    }
    out.push(textNode(segment, format))
  }
}

function convertInlineChildren(block: TextBlock, ctx: Ctx): Record<string, unknown>[] {
  const markDefs = block.markDefs ?? []
  for (const def of markDefs) {
    bump(ctx.stats.markDefTypes, def._type)
  }
  const out: Record<string, unknown>[] = []
  const spans = block.children
  let i = 0
  while (i < spans.length) {
    const span = spans[i]!
    const { format, def } = classifySpan(span, markDefs, ctx)
    if (def?._type === 'mathInline') {
      // The mark IS the content on both sides — the span's tex-source text
      // never renders (retired MathInlineMarkRenderer ignored `children`).
      out.push({ type: 'math-inline', version: 1, tex: def.tex, mathml: '', svg: '' })
      i += 1
      continue
    }
    if (def?._type === 'footnoteRef') {
      if (!ctx.footnoteDefinitionKeys.has(def.targetKey)) {
        ctx.stats.orphanFootnoteRefs += 1
      }
      out.push({ ...textNode(String(def.index), format), type: 'footnote-ref', targetKey: def.targetKey })
      i += 1
      continue
    }
    if (def?._type === 'link') {
      // Fold the whole consecutive run sharing this link key into one node.
      const linkChildren: Record<string, unknown>[] = []
      let j = i
      while (j < spans.length) {
        const next = classifySpan(spans[j]!, markDefs, ctx)
        if (next.def?._type !== 'link' || next.def._key !== def._key) {
          break
        }
        pushTextRun(linkChildren, spans[j]!.text, next.format)
        j += 1
      }
      out.push(
        elementNode('link', linkChildren, {
          url: def.href,
          rel: def.rel ?? null,
          target: def.target ?? null,
          title: null,
        }),
      )
      i = j
      continue
    }
    pushTextRun(out, span.text, format)
    i += 1
  }
  return out
}

function convertTextBlock(block: TextBlock, ctx: Ctx): Record<string, unknown> {
  const children = convertInlineChildren(block, ctx)
  const format = block.align ?? ''
  const style = block.style ?? 'normal'
  if (style === 'blockquote') {
    return elementNode('extended-quote', children, { format })
  }
  if (style === 'h1' || style === 'h2' || style === 'h3' || style === 'h4') {
    return elementNode('extended-heading', children, { tag: style, format })
  }
  return elementNode('paragraph', children, { format })
}

interface JsonNode {
  [key: string]: unknown
  children: JsonNode[]
}

function makeListNode(kind: 'bullet' | 'number'): JsonNode {
  return unsafeCast<JsonNode>(
    elementNode('list', [], { listType: kind, start: 1, tag: kind === 'bullet' ? 'ul' : 'ol' }),
  )
}

function makeListItem(children: Record<string, unknown>[], value: number): JsonNode {
  return unsafeCast<JsonNode>(elementNode('listitem', children, { value }))
}

/**
 * PT lists are flat `listItem` + `level` streaks; Lexical nests
 * `list > listitem > list`. Mirrors the retired pt-bridge `consumeListStreak`
 * semantics: a level-1 kind change or a same-depth kind change ends the
 * streak; missing intermediate levels synthesize an empty parent item.
 */
function convertListStreak(
  blocks: readonly TextBlock[],
  start: number,
  ctx: Ctx,
): { node: Record<string, unknown>; consumed: number } {
  const rootKind = blocks[start]!.listItem === 'number' ? 'number' : 'bullet'
  const root = makeListNode(rootKind)
  const stack: { kind: 'bullet' | 'number'; node: JsonNode }[] = [{ kind: rootKind, node: root }]
  let i = start
  while (i < blocks.length) {
    const block = blocks[i]!
    if (block.listItem === undefined) {
      break
    }
    const kind = block.listItem === 'number' ? 'number' : 'bullet'
    const level = Math.max(1, block.level ?? 1)
    if (level === 1 && kind !== rootKind) {
      break
    }
    while (stack.length > level) {
      stack.pop()
    }
    while (stack.length < level) {
      const parent = stack[stack.length - 1]!
      let parentItem = parent.node.children[parent.node.children.length - 1]
      if (parentItem?.type !== 'listitem') {
        parentItem = makeListItem([], parent.node.children.length + 1)
        parent.node.children.push(parentItem)
      }
      const subKind = level === stack.length + 1 ? kind : 'bullet'
      const sub = makeListNode(subKind)
      parentItem.children.push(sub)
      stack.push({ kind: subKind, node: sub })
    }
    const target = stack[stack.length - 1]!
    if (target.kind !== kind) {
      break
    }
    target.node.children.push(makeListItem(convertInlineChildren(block, ctx), target.node.children.length + 1))
    i += 1
  }
  return { node: root, consumed: i - start }
}

function convertImageBlock(block: ImageBlock): Record<string, unknown> {
  return {
    type: 'image',
    version: 1,
    src: block.src,
    // PT captions are PLAIN text; the Lexical dataset's caption is inline
    // HTML — escape so a literal `<` never turns into markup at render.
    caption: escapeCaptionHtml(block.caption ?? ''),
    title: '',
    alt: block.alt ?? '',
    cardWidth: 'regular',
    width: block.width ?? null,
    height: block.height ?? null,
    href: '',
    thumbhash: block.thumbhash ?? '',
    storagePath: block.storagePath ?? '',
    imageId: block.imageId ?? '',
    layout: block.layout ?? 'center',
  }
}

function escapeCaptionHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function convertTableBlock(block: TableBlock, ctx: Ctx): Record<string, unknown> {
  const hasHeaderRow = block.hasHeaderRow === true
  const rows = block.rows.map((row, rowIndex) =>
    elementNode(
      'tablerow',
      row.cells.map((cell) => {
        for (const def of cell.markDefs ?? []) {
          bump(ctx.stats.markDefTypes, def._type)
        }
        const inline: Record<string, unknown>[] = []
        let i = 0
        const spans = cell.content
        while (i < spans.length) {
          const span = spans[i]!
          const { format, def } = classifySpan(span, cell.markDefs ?? [], ctx)
          if (def !== null) {
            // The PT table cell schema admits link markDefs only.
            if (def._type !== 'link') {
              ctx.unmapped.push(`table-cell-markdef:${def._type}`)
              i += 1
              continue
            }
            const linkChildren: Record<string, unknown>[] = []
            let j = i
            while (j < spans.length) {
              const next = classifySpan(spans[j]!, cell.markDefs ?? [], ctx)
              if (next.def?._type !== 'link' || next.def._key !== def._key) {
                break
              }
              pushTextRun(linkChildren, spans[j]!.text, next.format)
              j += 1
            }
            inline.push(
              elementNode('link', linkChildren, {
                url: def.href,
                rel: def.rel ?? null,
                target: def.target ?? null,
                title: null,
              }),
            )
            i = j
            continue
          }
          pushTextRun(inline, span.text, format)
          i += 1
        }
        return elementNode('tablecell', [elementNode('paragraph', inline)], {
          headerState: cell.isHeader === true ? (rowIndex === 0 && hasHeaderRow ? 2 : 1) : 0,
        })
      }),
    ),
  )
  return elementNode('table', rows)
}

/** Nested (card-content) blocks — the PT `NonRecursiveBlock` set. Synchronous:
 * nested blocks cannot themselves contain the HTML-carrying cards. */
function convertNestedBlock(block: NonRecursiveBlock, ctx: Ctx): Record<string, unknown> | null {
  switch (block._type) {
    case 'block':
      return convertTextBlock(block, ctx)
    case 'image':
      return convertImageBlock(block)
    case 'code':
      return {
        type: 'codeblock',
        version: 1,
        code: block.code,
        language: block.language ?? '',
        caption: '',
        highlightedHtml: '',
      }
    case 'mathBlock':
      return { type: 'math', version: 1, tex: block.tex, mathml: '', svg: '' }
    case 'horizontalRule':
      return { type: 'horizontalrule', version: 1 }
    case 'musicPlayer':
      return convertMusicPlayerBlock(block, ctx)
    case 'table':
      return convertTableBlock(block, ctx)
    default:
      ctx.unmapped.push(`nested-block:${unsafeCast<{ _type: string }>(block)._type}`)
      return null
  }
}

function convertMusicPlayerBlock(
  block: { playerId: string; auto?: boolean | undefined; center?: boolean | undefined },
  ctx: Ctx,
): Record<string, unknown> {
  if (block.auto !== undefined || block.center !== undefined) {
    ctx.stats.musicFlagDrops += 1
  }
  // Meta snapshot (name/artist/cover/audioUrl/lyric) is NOT filled here — the
  // caller runs the save pipeline's `snapshotMusicPlayerMeta` so the backfill
  // and a regular save share one resolution path (R9a semantics).
  return { type: 'music-player', version: 1, playerId: block.playerId }
}

/** Converts nested blocks, consuming list streaks; nested lists are possible
 * in card content even though the real corpus has none. */
function convertNestedBlocks(blocks: readonly NonRecursiveBlock[], ctx: Ctx): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  let i = 0
  while (i < blocks.length) {
    const block = blocks[i]!
    bump(ctx.stats.blockTypes, block._type)
    if (block._type === 'block' && block.listItem !== undefined) {
      const { node, consumed } = convertListStreak(unsafeCast<readonly TextBlock[]>(blocks), i, ctx)
      // The head was counted above; count the rest of the streak.
      for (let k = i + 1; k < i + consumed; k += 1) {
        bump(ctx.stats.blockTypes, 'block')
      }
      out.push(node)
      i += consumed
      continue
    }
    const converted = convertNestedBlock(block, ctx)
    if (converted !== null) {
      out.push(converted)
    }
    i += 1
  }
  return out
}

function countNested(ctx: Ctx, container: string, blocks: readonly NonRecursiveBlock[]): void {
  const bucket = (ctx.stats.nestedBlockTypes[container] ??= {})
  for (const block of blocks) {
    bump(bucket, block._type)
  }
}

/**
 * One converted card fragment captured during conversion — the cross-check
 * (`./pt-lexical-crosscheck`) validates each card's nested content against
 * its PT source at NODE level (the card corpus contribution is tag-stripped
 * dataset HTML, which cannot line-split KaTeX/Shiki markup faithfully).
 */
export interface NestedFragment {
  container: 'solution' | 'twoColumn' | 'footnoteDefinition'
  /** PT `_key` of the card block. */
  key: string
  /** twoColumn only. */
  side?: 'left' | 'right'
  ptBlocks: NonRecursiveBlock[]
  nodes: LexicalNodeJson[]
}

async function renderNestedHtml(
  blocks: readonly NonRecursiveBlock[],
  container: NestedFragment['container'],
  key: string,
  side: 'left' | 'right' | undefined,
  ctx: Ctx,
): Promise<string> {
  countNested(ctx, container, blocks)
  const nodes = convertNestedBlocks(blocks, ctx)
  ctx.fragments.push({
    container,
    key,
    ...(side === undefined ? {} : { side }),
    ptBlocks: [...blocks],
    nodes: unsafeCast<LexicalNodeJson[]>(nodes),
  })
  if (nodes.length === 0) {
    return ''
  }
  return ctx.renderFragmentHtml(unsafeCast<LexicalNodeJson[]>(nodes))
}

interface BodyAccumulator {
  children: Record<string, unknown>[]
  footnoteDefinitions: Record<string, unknown>[]
}

async function convertTopLevelBlocks(body: PortableTextBody, ctx: Ctx): Promise<BodyAccumulator> {
  const acc: BodyAccumulator = { children: [], footnoteDefinitions: [] }
  let i = 0
  while (i < body.length) {
    const block = body[i]!
    bump(ctx.stats.blockTypes, block._type)
    if (block._type === 'block') {
      if (block.listItem !== undefined) {
        const { node, consumed } = convertListStreak(unsafeCast<readonly TextBlock[]>(body), i, ctx)
        for (let k = i + 1; k < i + consumed; k += 1) {
          bump(ctx.stats.blockTypes, 'block')
        }
        acc.children.push(node)
        i += consumed
        continue
      }
      acc.children.push(convertTextBlock(block, ctx))
    } else if (block._type === 'footnoteDefinition') {
      // Doc-end run: collected and appended after every other block
      // (inkling derives the visible index from the rank in that run).
      acc.footnoteDefinitions.push({
        type: 'footnotedefinition',
        version: 1,
        content: await renderNestedHtml(block.children, 'footnoteDefinition', block._key, undefined, ctx),
        targetKey: block._key,
        index: block.index,
      })
    } else if (block._type === 'solution') {
      acc.children.push({
        type: 'solution',
        version: 1,
        content: await renderNestedHtml(block.children, 'solution', block._key, undefined, ctx),
      })
    } else if (block._type === 'twoColumn') {
      const left = await renderNestedHtml(block.left, 'twoColumn', block._key, 'left', ctx)
      const right = await renderNestedHtml(block.right, 'twoColumn', block._key, 'right', ctx)
      acc.children.push({ type: 'two-column', version: 1, left, right })
    } else {
      const converted = convertNestedBlock(block, ctx)
      if (converted !== null) {
        acc.children.push(converted)
      }
    }
    i += 1
  }
  return acc
}

export interface PtToLexicalResult {
  state: LexicalEditorState
  stats: PtConversionStats
  fragments: NestedFragment[]
}

function footnoteKeysOf(body: PortableTextBody): ReadonlySet<string> {
  const keys = new Set<string>()
  for (const block of body) {
    if (block._type === 'footnoteDefinition') {
      keys.add(block._key)
    }
  }
  return keys
}

/**
 * Converts one zod-validated PT body to the full Lexical state. Throws
 * `UnmappedConstructError` when the body holds a construct with no mapping;
 * the output is validated against `lexicalEditorStateSchema` before return.
 */
export async function convertPortableTextBody(
  body: PortableTextBody,
  options: PtToLexicalOptions,
): Promise<PtToLexicalResult> {
  const ctx: Ctx = {
    ...options,
    stats: emptyPtConversionStats(),
    unmapped: [],
    fragments: [],
    footnoteDefinitionKeys: footnoteKeysOf(body),
  }
  const acc = await convertTopLevelBlocks(body, ctx)
  if (ctx.unmapped.length > 0) {
    throw new UnmappedConstructError([...new Set(ctx.unmapped)])
  }
  const state = lexicalEditorStateSchema.parse({
    root: {
      type: 'root',
      version: 1,
      children: [...acc.children, ...acc.footnoteDefinitions],
      direction: 'ltr',
      format: '',
      indent: 0,
    },
  })
  return { state, stats: ctx.stats, fragments: ctx.fragments }
}

export interface CommentToLexicalResult {
  state: CommentEditorState
  stats: PtConversionStats
}

/** Comment surface: the restricted PT subset → the restricted Lexical state. */
export function convertCommentBody(body: CommentBody): CommentToLexicalResult {
  const ctx: Ctx = {
    renderFragmentHtml: () => Promise.reject(new Error('comment bodies carry no HTML-carrying cards')),
    stats: emptyPtConversionStats(),
    unmapped: [],
    fragments: [],
    footnoteDefinitionKeys: new Set(),
  }
  const children: Record<string, unknown>[] = []
  let i = 0
  while (i < body.length) {
    const block = body[i]!
    bump(ctx.stats.blockTypes, block._type)
    if (block._type === 'block') {
      if (block.listItem !== undefined) {
        const { node, consumed } = convertListStreak(unsafeCast<readonly TextBlock[]>(body), i, ctx)
        for (let k = i + 1; k < i + consumed; k += 1) {
          bump(ctx.stats.blockTypes, 'block')
        }
        children.push(node)
        i += consumed
        continue
      }
      children.push(convertTextBlock(block, ctx))
      i += 1
      continue
    }
    const converted = convertNestedBlock(block, ctx)
    if (converted !== null) {
      children.push(converted)
    }
    i += 1
  }
  if (ctx.unmapped.length > 0) {
    throw new UnmappedConstructError([...new Set(ctx.unmapped)])
  }
  const state = commentEditorStateSchema.parse({
    root: { type: 'root', version: 1, children, direction: 'ltr', format: '', indent: 0 },
  })
  return { state, stats: ctx.stats }
}
