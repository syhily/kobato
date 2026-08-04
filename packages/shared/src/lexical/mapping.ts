import type {
  Block,
  CodeBlock,
  FootnoteDefinitionBlock,
  ImageBlock,
  LinkMarkDef,
  MarkDef,
  MathBlock,
  MathInlineMarkDef,
  MusicPlayerBlock,
  PortableTextBody,
  Span,
  TableBlock,
  TextBlock,
  TwoColumnBlock,
} from '@kobato/shared/legacy-pt/schema'
import type {
  LexicalBlockNode,
  LexicalBody,
  LexicalFootnoteDefinitionNode,
  LexicalHeadingNode,
  LexicalInlineNode,
  LexicalListItemNode,
  LexicalListNode,
  LexicalNonContainerBlockNode,
  LexicalParagraphNode,
  LexicalSimpleInlineNode,
  LexicalTableCellNode,
  LexicalTableNode,
  LexicalTwoColumnNode,
} from '@kobato/shared/lexical/schema'

import { canonicalizePortableTextBodyShape } from '@kobato/shared/legacy-pt/canonicalize'
import { PT_DECORATOR_TO_FORMAT_BIT } from '@kobato/shared/lexical/schema'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'

// ONE-WAY PT → Lexical conversion (§3.1 mapping table). Pure JSON: no
// `lexical` runtime, no React — the output is a `LexicalBody` in the
// shared dialect (`@kobato/shared/lexical/schema`), which the caller
// usually pushes through `canonicalizeLexicalBodyShape` for the
// deterministic 0.45.0 serialized form.
//
// The input is canonicalised FIRST (`canonicalizePortableTextBodyShape`):
// list levels are normalised and skipped levels filled, list-item styles
// forced to `normal`, footnote indices renumbered and definitions moved
// to the end — the mapper then relies on those guarantees (a streak's
// kinds are consistent per level).
//
// Mapping decisions worth noting:
//
//   - `_key` → `ptKey` on the CUSTOM nodes only (mathInline / footnoteRef
//     / image / mathBlock / musicPlayer / solution / twoColumn /
//     footnoteDefinition). Standard nodes (paragraph, heading, quote,
//     list, listitem, link, code, table family) cannot carry it — their
//     `importJSON`/`exportJSON` would drop it, so the canonical shape
//     never contains it.
//   - `align` → element `format` (`'left' | 'center' | 'right'`), the
//     lexical element-format vocabulary.
//   - PT hard breaks are `\n` inside span text → split into text segments
//     with `linebreak` nodes between (mirrors the PT↔PM bridge's
//     `pushSpan`).
//   - decorator marks fold into the TextNode format bitmask (strong=1,
//     em=2, strike-through=4, underline=8, code=16); the FIRST link
//     markDef wraps the span's content in a LinkNode; mathInline /
//     footnoteRef marks become their custom nodes; any remaining marks
//     are dropped (the editor never emits more than one markDef per
//     span).
//   - `code.highlightedHtml` is a render-time artifact with no lexical
//     home — dropped.
//   - an empty PT body maps to a single empty paragraph (the editor's
//     minimum document).

// --- small factories --------------------------------------------------------

function elementBase(format = ''): {
  direction: null
  format: string
  indent: 0
  version: 1
} {
  return { direction: null, format, indent: 0, version: 1 }
}

function formatFromAlign(align: TextBlock['align']): string {
  return align === undefined ? '' : align
}

function textNode(text: string, format = 0): Extract<LexicalSimpleInlineNode, { type: 'text' }> {
  return { detail: 0, format, mode: 'normal', style: '', text, type: 'text', version: 1 }
}

function paragraph(children: LexicalInlineNode[], format = ''): LexicalParagraphNode {
  return {
    ...elementBase(format),
    type: 'paragraph',
    children,
    textFormat: 0,
    textStyle: '',
  }
}

function emptyParagraph(): LexicalParagraphNode {
  return paragraph([])
}

// --- inline mapping ---------------------------------------------------------

function mapSpan(span: Span, markDefs: readonly MarkDef[], out: LexicalInlineNode[]): void {
  if (span.text === '') {
    return
  }
  let formatBits = 0
  let linkDef: LinkMarkDef | undefined
  const customNodes: LexicalSimpleInlineNode[] = []
  for (const mark of span.marks ?? []) {
    const bit = PT_DECORATOR_TO_FORMAT_BIT[mark]
    if (bit !== undefined) {
      formatBits |= bit
      continue
    }
    const def = markDefs.find((entry) => entry._key === mark)
    if (def === undefined) {
      // Unknown mark name — the PT renderer shows the text unstyled;
      // emit the text without styling. Never fail a migration for a
      // dangling mark.
      continue
    }
    if (def._type === 'link') {
      if (linkDef === undefined) {
        linkDef = def
      }
      continue
    }
    if (def._type === 'mathInline') {
      customNodes.push(mapInlineMath(def))
      continue
    }
    customNodes.push(mapFootnoteRef(def))
  }
  // A span whose markDefs include mathInline / footnoteRef is consumed by
  // those custom nodes: the span text is representational (the footnote
  // display digit, or empty for inline math) — the payload lives in the
  // node fields. Text segments and decorator bits are dropped in that
  // case; a link markDef still wraps the custom nodes (the PT renderer
  // nests the marks).
  if (customNodes.length > 0) {
    if (linkDef === undefined) {
      out.push(...customNodes)
    } else {
      out.push({
        ...elementBase(),
        type: 'link',
        url: linkDef.href,
        rel: linkDef.rel ?? null,
        target: linkDef.target ?? null,
        title: null,
        children: customNodes,
      })
    }
    return
  }
  // `\n` inside span text IS the PT hard break (Shift+Enter): split into
  // segments with `linebreak` nodes between — the same rule the PT↔PM
  // bridge's `pushSpan` applies.
  const segments = span.text.split('\n')
  const inlines: LexicalSimpleInlineNode[] = []
  for (let i = 0; i < segments.length; i += 1) {
    if (i > 0) {
      inlines.push({ type: 'linebreak', version: 1 })
    }
    const segment = segments[i]
    if (segment === '') {
      continue
    }
    inlines.push(textNode(segment, formatBits))
  }
  if (linkDef === undefined) {
    out.push(...inlines)
    return
  }
  out.push({
    ...elementBase(),
    type: 'link',
    url: linkDef.href,
    rel: linkDef.rel ?? null,
    target: linkDef.target ?? null,
    title: null,
    children: inlines,
  })
}

function mapInlineMath(def: MathInlineMarkDef): LexicalSimpleInlineNode {
  return {
    type: 'mathInline',
    version: 1,
    tex: def.tex,
    ...(def.mathml !== undefined ? { mathml: def.mathml } : {}),
    ...(def.svg !== undefined ? { svg: def.svg } : {}),
    ptKey: def._key,
  }
}

function mapFootnoteRef(def: Extract<MarkDef, { _type: 'footnoteRef' }>): LexicalSimpleInlineNode {
  return {
    type: 'footnoteRef',
    version: 1,
    targetKey: def.targetKey,
    index: def.index,
    ptKey: def._key,
  }
}

function mapSpans(spans: readonly Span[], markDefs: readonly MarkDef[] | undefined): LexicalInlineNode[] {
  const out: LexicalInlineNode[] = []
  for (const span of spans) {
    if (span._type !== 'span') {
      continue
    }
    mapSpan(span, markDefs ?? [], out)
  }
  return out
}

// --- text blocks ------------------------------------------------------------

function mapTextBlock(block: TextBlock, asListItemChild: boolean): LexicalBlockNode {
  const inlines = mapSpans(block.children, block.markDefs)
  if (asListItemChild) {
    // A PT list item child is always a paragraph (canonicalise forces
    // `style: 'normal'`); the list item node wraps it.
    return paragraph(inlines, formatFromAlign(block.align))
  }
  if (block.style === 'blockquote') {
    return {
      ...elementBase(formatFromAlign(block.align)),
      type: 'quote',
      children: [paragraph(inlines)],
    }
  }
  if (block.style === 'normal' || block.style === undefined) {
    return paragraph(inlines, formatFromAlign(block.align))
  }
  // h1–h4 (the schema pins the style enum).
  return {
    ...elementBase(formatFromAlign(block.align)),
    type: 'heading',
    tag: block.style as LexicalHeadingNode['tag'],
    children: inlines,
  }
}

// --- non-recursive blocks ---------------------------------------------------

function mapImage(block: ImageBlock): LexicalNonContainerBlockNode {
  return {
    type: 'image',
    version: 1,
    src: block.src,
    ...(block.alt !== undefined ? { alt: block.alt } : {}),
    ...(block.caption !== undefined ? { caption: block.caption } : {}),
    ...(block.layout !== undefined ? { layout: block.layout } : {}),
    ...(block.width !== undefined ? { width: block.width } : {}),
    ...(block.height !== undefined ? { height: block.height } : {}),
    ...(block.thumbhash !== undefined ? { thumbhash: block.thumbhash } : {}),
    ...(block.storagePath !== undefined ? { storagePath: block.storagePath } : {}),
    ...(block.imageId !== undefined ? { imageId: block.imageId } : {}),
    ptKey: block._key,
  }
}

function mapCode(block: CodeBlock): LexicalNonContainerBlockNode {
  return {
    ...elementBase(),
    type: 'code',
    ...(block.language !== undefined ? { language: block.language } : {}),
    children: [textNode(block.code)],
  }
}

function mapMathBlock(block: MathBlock): LexicalNonContainerBlockNode {
  return {
    type: 'mathBlock',
    version: 1,
    tex: block.tex,
    ...(block.mathml !== undefined ? { mathml: block.mathml } : {}),
    ...(block.svg !== undefined ? { svg: block.svg } : {}),
    ptKey: block._key,
  }
}

function mapMusicPlayer(block: MusicPlayerBlock): LexicalNonContainerBlockNode {
  return {
    type: 'musicPlayer',
    version: 1,
    playerId: block.playerId,
    ...(block.auto !== undefined ? { auto: block.auto } : {}),
    ...(block.center !== undefined ? { center: block.center } : {}),
    ptKey: block._key,
  }
}

function mapTable(block: TableBlock): LexicalNonContainerBlockNode {
  const hasHeaderRow = block.hasHeaderRow === true
  const rows: LexicalTableNode['children'] = block.rows.map((row, rowIndex) => ({
    ...elementBase(),
    type: 'tablerow',
    children: row.cells.map((cell): LexicalTableCellNode => {
      // headerState bitmask: 1 = row header (first row when
      // `hasHeaderRow`), 2 = column header (cell `isHeader`), 3 = both.
      const headerState = (hasHeaderRow && rowIndex === 0 ? 1 : 0) | (cell.isHeader === true ? 2 : 0)
      return {
        ...elementBase(),
        type: 'tablecell',
        backgroundColor: null,
        colSpan: 1,
        headerState,
        rowSpan: 1,
        children: [paragraph(mapSpans(cell.content, cell.markDefs))],
      }
    }),
  }))
  return {
    ...elementBase(),
    type: 'table',
    children: rows,
  }
}

// --- lists (flat PT streak → nested Lexical tree) ---------------------------

function isPtListItem(block: Block): block is TextBlock & { listItem: 'bullet' | 'number' } {
  return block._type === 'block' && (block.listItem === 'bullet' || block.listItem === 'number')
}

type ListStreakItem = TextBlock & { listItem: 'bullet' | 'number' }

function createList(listType: 'bullet' | 'number'): LexicalListNode {
  return {
    ...elementBase(),
    type: 'list',
    listType,
    start: 1,
    tag: listType === 'bullet' ? 'ul' : 'ol',
    children: [],
  }
}

function createListItem(item: ListStreakItem): LexicalListItemNode {
  // Canonical PT list-item children always map to exactly one paragraph.
  return {
    ...elementBase(),
    type: 'listitem',
    value: 1,
    children: [unsafeCast<LexicalParagraphNode>(mapTextBlock(item, true))],
  }
}

/**
 * Nest a canonical flat list streak into a `ListNode`/`ListItemNode`
 * tree. Levels ascend by construction (canonicalise fills gaps with
 * empty items), so the stack opens one nested list per level and closes
 * deeper levels when an item goes back up. Kinds are consistent per
 * level within a streak (canonicalise breaks streaks at kind conflicts),
 * so the kind of the first item at a level owns that level's list.
 */
function buildListTree(streak: readonly ListStreakItem[]): LexicalListNode {
  const root = createList(streak[0]!.listItem)
  const listStack: LexicalListNode[] = [root]
  for (const item of streak) {
    const level = Math.max(1, item.level ?? 1)
    while (listStack.length > level) {
      listStack.pop()
    }
    while (listStack.length < level) {
      const parentList = listStack[listStack.length - 1]!
      const lastItem = parentList.children[parentList.children.length - 1]!
      const nested = createList(item.listItem)
      lastItem.children.push(nested)
      listStack.push(nested)
    }
    listStack[level - 1]!.children.push(createListItem(item))
  }
  return root
}

/** Consume a streak with the same boundary rules canonicalise applies (kind conflicts end the streak). */
function collectListStreak(blocks: readonly Block[], start: number): ListStreakItem[] {
  const first = blocks[start]
  if (!isPtListItem(first)) {
    return []
  }
  const rootKind = first.listItem
  const listKindAtLevel = new Map<number, 'bullet' | 'number'>([[1, rootKind]])
  const streak: ListStreakItem[] = []
  let i = start
  while (i < blocks.length) {
    const cur = blocks[i]
    if (!isPtListItem(cur)) {
      break
    }
    const kind = cur.listItem
    const level = Math.max(1, cur.level ?? 1)
    const existing = listKindAtLevel.get(level)
    if (existing !== undefined && existing !== kind) {
      break
    }
    if (level === 1 && kind !== rootKind) {
      break
    }
    if (!listKindAtLevel.has(level)) {
      listKindAtLevel.set(level, kind)
    }
    streak.push(cur)
    i += 1
  }
  return streak
}

// --- block mapping ----------------------------------------------------------

function mapBlocks(blocks: readonly Block[]): LexicalBlockNode[] {
  const out: LexicalBlockNode[] = []
  let i = 0
  while (i < blocks.length) {
    const block = blocks[i]!
    if (isPtListItem(block)) {
      const streak = collectListStreak(blocks, i)
      out.push(buildListTree(streak))
      i += streak.length
      continue
    }
    out.push(mapBlock(block))
    i += 1
  }
  return out
}

function mapBlock(block: Block): LexicalBlockNode {
  switch (block._type) {
    case 'block':
      return mapTextBlock(block, false)
    case 'image':
      return mapImage(block)
    case 'code':
      return mapCode(block)
    case 'mathBlock':
      return mapMathBlock(block)
    case 'horizontalRule':
      return { type: 'horizontalrule', version: 1 }
    case 'musicPlayer':
      return mapMusicPlayer(block)
    case 'table':
      return mapTable(block)
    case 'solution':
      return {
        ...elementBase(),
        type: 'solution',
        ptKey: block._key,
        // The container's children stay within the schema's
        // `NonRecursiveBlock` bound — same contract as `mapNestedBlocks`.
        children: unsafeCast<LexicalNonContainerBlockNode[]>(mapBlocks(block.children)),
      }
    case 'twoColumn':
      return mapTwoColumn(block)
    case 'footnoteDefinition':
      return mapFootnoteDefinition(block)
  }
}

function mapTwoColumn(block: TwoColumnBlock): LexicalTwoColumnNode {
  return {
    ...elementBase(),
    type: 'twoColumn',
    ptKey: block._key,
    children: [
      {
        ...elementBase(),
        type: 'twoColumnPane',
        side: 'left',
        children: unsafeCast<LexicalNonContainerBlockNode[]>(mapBlocks(block.left)),
      },
      {
        ...elementBase(),
        type: 'twoColumnPane',
        side: 'right',
        children: unsafeCast<LexicalNonContainerBlockNode[]>(mapBlocks(block.right)),
      },
    ],
  }
}

function mapFootnoteDefinition(block: FootnoteDefinitionBlock): LexicalFootnoteDefinitionNode {
  return {
    ...elementBase(),
    type: 'footnoteDefinition',
    index: block.index,
    ptKey: block._key,
    children: unsafeCast<LexicalNonContainerBlockNode[]>(mapBlocks(block.children)),
  }
}

// --- entry point ------------------------------------------------------------

/**
 * Convert a PortableText body to a `LexicalBody` (one-way, pure). The
 * input goes through `canonicalizePortableTextBodyShape` first; an
 * empty PT body maps to a single empty paragraph (the editor's minimum
 * document).
 */
export function convertPtBodyToLexical(ptBody: PortableTextBody): LexicalBody {
  const canonical = canonicalizePortableTextBodyShape(ptBody)
  const children = canonical.length === 0 ? [emptyParagraph()] : mapBlocks(canonical)
  return {
    root: {
      ...elementBase(),
      type: 'root',
      children,
    },
  }
}
