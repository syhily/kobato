import type {
  InklingBlockNode,
  InklingCodeBlockNode,
  InklingDocument,
  InklingFootnoteDefinitionNode,
  InklingFootnoteRefNode,
  InklingHeadingNode,
  InklingHorizontalRuleNode,
  InklingImageCardNode,
  InklingInlineMathNode,
  InklingInlineNode,
  InklingLineBreakNode,
  InklingLinkNode,
  InklingListItemNode,
  InklingListNode,
  InklingMathBlockNode,
  InklingMusicCardNode,
  InklingNonRecursiveBlockNode,
  InklingParagraphNode,
  InklingQuoteNode,
  InklingSolutionNode,
  InklingTableCellNode,
  InklingTableNode,
  InklingTableRowNode,
  InklingTextNode,
  InklingTwoColumnNode,
} from '@/shared/inkling/schema'
import type {
  Block,
  CodeBlock,
  FootnoteDefinitionBlock,
  HorizontalRuleBlock,
  ImageBlock,
  MarkDef,
  MathBlock,
  MusicPlayerBlock,
  NonRecursiveBlock,
  PortableTextBody,
  SolutionBlock,
  Span,
  StandardDecorator,
  TableBlock,
  TableCell,
  TextBlock,
  TwoColumnBlock,
} from '@/shared/pt/schema'

import { sanitizeCommentSpanText, type SanitizeToken } from '@/shared/inkling/comment-html-sanitize'
import { createEmptyInklingDocument } from '@/shared/inkling/empty'
import {
  INKLING_FORMAT_BOLD,
  INKLING_FORMAT_CODE,
  INKLING_FORMAT_ITALIC,
  INKLING_FORMAT_STRIKETHROUGH,
  INKLING_FORMAT_UNDERLINE,
} from '@/shared/inkling/format'
import { INKLING_LEXICAL_VERSION } from '@/shared/inkling/schema'
import { commentBodySchema, type CommentBlock, type CommentBody, type CommentMarkDef } from '@/shared/pt/comment-schema'
import { portableTextBodySchema, STANDARD_DECORATORS } from '@/shared/pt/schema'

// Lexical text format bits, imported from `./format` to keep a single source
// of truth that stays in sync with lexical's IS_* constants. Underline is
// `1 << 3 = 8`, code is `1 << 4 = 16`, strikethrough is `1 << 2 = 4`.
const FORMAT_BOLD = INKLING_FORMAT_BOLD
const FORMAT_ITALIC = INKLING_FORMAT_ITALIC
const FORMAT_UNDERLINE = INKLING_FORMAT_UNDERLINE
const FORMAT_CODE = INKLING_FORMAT_CODE
const FORMAT_STRIKETHROUGH = INKLING_FORMAT_STRIKETHROUGH

const DECORATOR_TO_FORMAT: Record<StandardDecorator, number> = {
  strong: FORMAT_BOLD,
  em: FORMAT_ITALIC,
  underline: FORMAT_UNDERLINE,
  code: FORMAT_CODE,
  'strike-through': FORMAT_STRIKETHROUGH,
}

const ARTICLE_ONLY_BLOCK_TYPES = new Set<string>([
  'image',
  'horizontalRule',
  'musicPlayer',
  'solution',
  'twoColumn',
  'footnoteDefinition',
  'table',
])

const ARTICLE_ONLY_MARK_TYPES = new Set<string>(['footnoteRef'])

class MigrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationError'
  }
}

function validatePortableTextInput(body: unknown): PortableTextBody {
  try {
    return portableTextBodySchema.parse(body)
  } catch (error) {
    if (error instanceof Error) {
      throw new MigrationError(`Invalid PortableText body: ${error.message}`)
    }
    throw new MigrationError('Invalid PortableText body')
  }
}

function validateCommentInput(body: unknown): CommentBody {
  try {
    return commentBodySchema.parse(body)
  } catch (error) {
    if (error instanceof Error) {
      throw new MigrationError(`Invalid comment body: ${error.message}`)
    }
    throw new MigrationError('Invalid comment body')
  }
}

function assertNoArticleOnlyBlocks(body: PortableTextBody): void {
  function visit(blocks: readonly Block[]): void {
    for (const block of blocks) {
      if (ARTICLE_ONLY_BLOCK_TYPES.has(block._type)) {
        throw new MigrationError(`Comment body cannot contain article-only block: ${block._type}`)
      }
      if (block._type === 'block') {
        for (const markDef of block.markDefs ?? []) {
          if (ARTICLE_ONLY_MARK_TYPES.has(markDef._type)) {
            throw new MigrationError(`Comment body cannot contain article-only mark: ${markDef._type}`)
          }
        }
      }
    }
  }
  visit(body)
}

function makeBaseNode() {
  return {
    direction: null as 'ltr' | 'rtl' | null,
    format: '',
    indent: 0,
  }
}

function decoratorFormat(marks: readonly string[] | undefined): number {
  let format = 0
  if (marks === undefined) {
    return format
  }
  for (const mark of marks) {
    if (isStandardDecoratorMark(mark)) {
      format |= DECORATOR_TO_FORMAT[mark]
    }
  }
  return format
}

function isStandardDecoratorMark(mark: string): mark is StandardDecorator {
  return (STANDARD_DECORATORS as readonly string[]).includes(mark)
}

function findSpecialMarkKey(span: Span): string | null {
  for (const mark of span.marks ?? []) {
    if (!isStandardDecoratorMark(mark)) {
      return mark
    }
  }
  return null
}

function makeTextNode(span: Span): InklingTextNode {
  const node: InklingTextNode = {
    type: 'text',
    version: 1,
    text: span.text,
    format: decoratorFormat(span.marks),
  }
  if (span._key !== undefined && span._key.length > 0) {
    node.key = span._key
  }
  return node
}

function makeLineBreakNode(_span?: Span): InklingLineBreakNode {
  return { type: 'linebreak', version: 1 }
}

function buildMarkDefMap(markDefs: readonly MarkDef[] | undefined): Map<string, MarkDef> {
  const map = new Map<string, MarkDef>()
  if (markDefs === undefined) {
    return map
  }
  for (const markDef of markDefs) {
    map.set(markDef._key, markDef)
  }
  return map
}

type ConversionMode = 'article' | 'comment'

function standardDecoratorsFromMarks(marks: readonly string[] | undefined): StandardDecorator[] {
  if (marks === undefined) {
    return []
  }
  return marks.filter((mark): mark is StandardDecorator => isStandardDecoratorMark(mark))
}

function mergeConsecutiveTextNodes(nodes: readonly InklingInlineNode[]): InklingInlineNode[] {
  const out: InklingInlineNode[] = []
  let buffer: InklingTextNode[] = []

  function flushBuffer() {
    if (buffer.length === 0) {
      return
    }
    const first = buffer[0]!
    out.push({
      type: 'text',
      version: 1,
      text: buffer.map((n) => n.text).join(''),
      format: first.format,
      key: first.key,
    })
    buffer = []
  }

  for (const node of nodes) {
    if (node.type === 'text') {
      if (buffer.length > 0 && buffer[0]!.format !== node.format) {
        flushBuffer()
      }
      buffer.push(node)
    } else {
      flushBuffer()
      out.push(node)
    }
  }
  flushBuffer()
  return out
}

function makeLinkNodeFromToken(token: Extract<SanitizeToken, { kind: 'link' }>): InklingLinkNode {
  const node: InklingLinkNode = {
    type: 'link',
    version: 1,
    url: token.url,
    direction: null,
    format: '',
    indent: 0,
    children: [
      {
        type: 'text',
        version: 1,
        text: token.text,
        format: decoratorFormat(token.decorators),
      },
    ],
  }
  if (token.rel !== undefined && token.rel.length > 0) {
    node.rel = token.rel
  }
  if (token.title !== undefined && token.title.length > 0) {
    node.title = token.title
  }
  if (token.target !== undefined) {
    node.target = token.target
  }
  return node
}

function tokensToInlineNodes(tokens: readonly SanitizeToken[]): InklingInlineNode[] {
  const out: InklingInlineNode[] = []
  let textBuffer: Extract<SanitizeToken, { kind: 'text' }>[] = []

  function flushText() {
    if (textBuffer.length === 0) {
      return
    }
    const first = textBuffer[0]!
    out.push({
      type: 'text',
      version: 1,
      text: textBuffer.map((t) => t.text).join(''),
      format: decoratorFormat(first.decorators),
    })
    textBuffer = []
  }

  function sameDecorators(a: readonly StandardDecorator[], b: readonly StandardDecorator[]): boolean {
    if (a.length !== b.length) {
      return false
    }
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) {
        return false
      }
    }
    return true
  }

  for (const token of tokens) {
    if (token.kind === 'text') {
      if (textBuffer.length > 0 && !sameDecorators(textBuffer[0]!.decorators, token.decorators)) {
        flushText()
      }
      textBuffer.push(token)
    } else {
      flushText()
      if (token.kind === 'linebreak') {
        out.push(makeLineBreakNode())
      } else if (token.kind === 'link') {
        out.push(makeLinkNodeFromToken(token))
      }
    }
  }
  flushText()
  return mergeConsecutiveTextNodes(out)
}

type CommentInlineSegment = { kind: 'inline'; nodes: InklingInlineNode[] } | { kind: 'paragraph-split' }

function tokensToSegments(tokens: readonly SanitizeToken[]): CommentInlineSegment[] {
  const segments: CommentInlineSegment[] = []
  const currentNodes: InklingInlineNode[] = []
  let textBuffer: Extract<SanitizeToken, { kind: 'text' }>[] = []

  function flushText() {
    if (textBuffer.length === 0) {
      return
    }
    const first = textBuffer[0]!
    currentNodes.push({
      type: 'text',
      version: 1,
      text: textBuffer.map((t) => t.text).join(''),
      format: decoratorFormat(first.decorators),
    })
    textBuffer = []
  }

  function sameDecorators(a: readonly StandardDecorator[], b: readonly StandardDecorator[]): boolean {
    if (a.length !== b.length) {
      return false
    }
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) {
        return false
      }
    }
    return true
  }

  function flushInline() {
    flushText()
    if (currentNodes.length === 0) {
      return
    }
    segments.push({ kind: 'inline', nodes: mergeConsecutiveTextNodes(currentNodes) })
    currentNodes.length = 0
  }

  for (const token of tokens) {
    if (token.kind === 'paragraph-split') {
      flushInline()
      segments.push({ kind: 'paragraph-split' })
      continue
    }

    if (token.kind === 'text') {
      if (textBuffer.length > 0 && !sameDecorators(textBuffer[0]!.decorators, token.decorators)) {
        flushText()
      }
      textBuffer.push(token)
    } else {
      flushText()
      if (token.kind === 'linebreak') {
        currentNodes.push(makeLineBreakNode())
      } else if (token.kind === 'link') {
        currentNodes.push(makeLinkNodeFromToken(token))
      }
    }
  }
  flushInline()
  return segments
}

function convertCommentInlineSegments(
  spans: readonly Span[],
  markDefs: readonly MarkDef[] | undefined,
): CommentInlineSegment[] {
  const markMap = buildMarkDefMap(markDefs)
  const segments: CommentInlineSegment[] = []
  let i = 0

  while (i < spans.length) {
    const span = spans[i]!
    const specialKey = findSpecialMarkKey(span)

    if (specialKey === null) {
      const parentDecorators = standardDecoratorsFromMarks(span.marks)
      const tokens = sanitizeCommentSpanText(span.text, parentDecorators)
      segments.push(...tokensToSegments(tokens))
      i += 1
      continue
    }

    const markDef = markMap.get(specialKey)
    if (markDef === undefined) {
      const parentDecorators = standardDecoratorsFromMarks(span.marks)
      const tokens = sanitizeCommentSpanText(span.text, parentDecorators)
      segments.push(...tokensToSegments(tokens))
      i += 1
      continue
    }

    const groupSpans: Span[] = []
    let j = i
    while (j < spans.length) {
      const next = spans[j]!
      if (findSpecialMarkKey(next) === specialKey) {
        groupSpans.push(next)
        j += 1
      } else {
        break
      }
    }

    const childrenNodes: InklingInlineNode[] = []
    for (const s of groupSpans) {
      const parentDecorators = standardDecoratorsFromMarks(s.marks)
      const tokens = sanitizeCommentSpanText(s.text, parentDecorators)
      const collapsed = tokens.map<SanitizeToken>((token) =>
        token.kind === 'paragraph-split' ? { kind: 'linebreak' } : token,
      )
      childrenNodes.push(...tokensToInlineNodes(collapsed))
    }

    const node = buildSpecialMarkNode(markDef, childrenNodes)
    segments.push({ kind: 'inline', nodes: [node] })
    i = j
  }

  return segments
}

function commentSegmentsToInlineNodes(segments: readonly CommentInlineSegment[]): InklingInlineNode[] {
  const out: InklingInlineNode[] = []
  let textBuffer: InklingTextNode[] = []

  function flushText() {
    if (textBuffer.length === 0) {
      return
    }
    const first = textBuffer[0]!
    out.push({
      type: 'text',
      version: 1,
      text: textBuffer.map((n) => n.text).join(''),
      format: first.format,
    })
    textBuffer = []
  }

  for (const segment of segments) {
    if (segment.kind === 'paragraph-split') {
      flushText()
      out.push(makeLineBreakNode())
      continue
    }

    for (const node of segment.nodes) {
      if (node.type === 'text') {
        if (textBuffer.length > 0 && textBuffer[0]!.format !== node.format) {
          flushText()
        }
        textBuffer.push(node)
      } else {
        flushText()
        out.push(node)
      }
    }
  }
  flushText()
  return out
}

function makeCommentBlock(
  style: 'paragraph' | 'quote',
  baseKey: string,
  children: InklingInlineNode[],
  index: number,
): InklingParagraphNode | InklingQuoteNode {
  const key = index === 0 ? baseKey : `${baseKey}-p${index}`
  const base = makeBaseNode()
  if (style === 'quote') {
    return {
      type: 'quote',
      version: 1,
      ...base,
      key,
      children,
    }
  }
  return {
    type: 'paragraph',
    version: 1,
    ...base,
    key,
    children,
  }
}

function commentSegmentsToBlocks(
  segments: readonly CommentInlineSegment[],
  style: 'paragraph' | 'quote',
  baseKey: string,
): (InklingParagraphNode | InklingQuoteNode)[] {
  const blocks: (InklingParagraphNode | InklingQuoteNode)[] = []
  let current: InklingInlineNode[] = []
  let textBuffer: InklingTextNode[] = []

  function flushText() {
    if (textBuffer.length === 0) {
      return
    }
    const first = textBuffer[0]!
    current.push({
      type: 'text',
      version: 1,
      text: textBuffer.map((n) => n.text).join(''),
      format: first.format,
    })
    textBuffer = []
  }

  function flushBlock() {
    flushText()
    if (current.length === 0) {
      return
    }
    blocks.push(makeCommentBlock(style, baseKey, current, blocks.length))
    current = []
  }

  for (const segment of segments) {
    if (segment.kind === 'paragraph-split') {
      flushBlock()
      continue
    }

    for (const node of segment.nodes) {
      if (node.type === 'text') {
        if (textBuffer.length > 0 && textBuffer[0]!.format !== node.format) {
          flushText()
        }
        textBuffer.push(node)
      } else {
        flushText()
        current.push(node)
      }
    }
  }
  flushBlock()
  if (blocks.length === 0) {
    blocks.push(makeCommentBlock(style, baseKey, [], 0))
  }
  return blocks
}

function convertCommentTextBlockToBlocks(
  block: TextBlock,
  style: 'paragraph' | 'quote',
): InklingNonRecursiveBlockNode[] {
  const segments = convertCommentInlineSegments(block.children, block.markDefs)
  return commentSegmentsToBlocks(segments, style, block._key) as InklingNonRecursiveBlockNode[]
}

function convertInlineSpans(
  spans: readonly Span[],
  markDefs: readonly MarkDef[] | undefined,
  mode: ConversionMode = 'article',
): InklingInlineNode[] {
  if (mode === 'comment') {
    return commentSegmentsToInlineNodes(convertCommentInlineSegments(spans, markDefs))
  }

  const markMap = buildMarkDefMap(markDefs)
  const out: InklingInlineNode[] = []
  let i = 0

  while (i < spans.length) {
    const span = spans[i]!
    const specialKey = findSpecialMarkKey(span)

    if (specialKey === null) {
      if (span.text === '\n') {
        out.push(makeLineBreakNode())
      } else {
        out.push(makeTextNode(span))
      }
      i += 1
      continue
    }

    const markDef = markMap.get(specialKey)
    if (markDef === undefined) {
      // Dangling mark reference: treat as plain text.
      out.push(makeTextNode(span))
      i += 1
      continue
    }

    // Consume consecutive spans sharing the same special mark key.
    const groupSpans: Span[] = []
    let j = i
    while (j < spans.length) {
      const next = spans[j]!
      if (findSpecialMarkKey(next) === specialKey) {
        groupSpans.push(next)
        j += 1
      } else {
        break
      }
    }

    const children = groupSpans.map((span) => makeTextNode(span))
    const inlineNode = buildSpecialMarkNode(markDef, children)
    out.push(inlineNode)
    i = j
  }

  return out
}

function buildSpecialMarkNode(markDef: MarkDef, children: readonly InklingInlineNode[]): InklingInlineNode {
  switch (markDef._type) {
    case 'link': {
      const textChildren = children.filter((child): child is InklingTextNode | InklingLineBreakNode =>
        ['text', 'linebreak'].includes(child.type),
      )
      const linkNode: InklingLinkNode = {
        type: 'link',
        version: 1,
        key: markDef._key,
        url: markDef.href,
        target: markDef.target,
        rel: markDef.rel,
        direction: null,
        format: '',
        indent: 0,
        children: textChildren,
      }
      return linkNode
    }
    case 'mathInline': {
      const mathNode: InklingInlineMathNode = {
        type: 'inline-math',
        version: 1,
        key: markDef._key,
        tex: markDef.tex,
        mathml: markDef.mathml,
      }
      return mathNode
    }
    case 'footnoteRef': {
      const refNode: InklingFootnoteRefNode = {
        type: 'footnote-ref',
        version: 1,
        key: markDef._key,
        targetKey: markDef.targetKey,
        refKey: markDef._key,
        index: markDef.index,
      }
      return refNode
    }
  }
}

function convertTextBlockToInline(block: TextBlock, mode: ConversionMode = 'article'): InklingInlineNode[] {
  return convertInlineSpans(block.children, block.markDefs, mode)
}

function convertParagraph(block: TextBlock, mode: ConversionMode = 'article'): InklingParagraphNode {
  return {
    type: 'paragraph',
    version: 1,
    ...makeBaseNode(),
    key: block._key,
    children: convertTextBlockToInline(block, mode),
  }
}

function convertHeading(block: TextBlock, mode: ConversionMode = 'article'): InklingHeadingNode {
  const style = block.style
  if (style !== 'h1' && style !== 'h2' && style !== 'h3' && style !== 'h4') {
    throw new MigrationError(`Unsupported heading style: ${style}`)
  }
  return {
    type: 'heading',
    version: 1,
    ...makeBaseNode(),
    key: block._key,
    tag: style,
    children: convertTextBlockToInline(block, mode),
  }
}

function convertQuote(block: TextBlock, mode: ConversionMode = 'article'): InklingQuoteNode {
  return {
    type: 'quote',
    version: 1,
    ...makeBaseNode(),
    key: block._key,
    children: convertTextBlockToInline(block, mode),
  }
}

function isListBlock(block: Block): block is TextBlock {
  return block._type === 'block' && block.listItem !== undefined
}

function consumeListStreak(
  blocks: readonly Block[],
  start: number,
  mode: ConversionMode = 'article',
): { node: InklingListNode; consumed: number } {
  const first = blocks[start]
  if (!isListBlock(first)) {
    throw new MigrationError('consumeListStreak called with non-list block')
  }

  const rootKind: 'bullet' | 'number' = first.listItem === 'bullet' ? 'bullet' : 'number'
  const root: InklingListNode = {
    type: 'list',
    version: 1,
    key: first._key,
    listType: rootKind,
    ...makeBaseNode(),
    children: [],
  }

  const stack: InklingListNode[] = [root]
  let i = start

  while (i < blocks.length) {
    const block = blocks[i]
    if (!isListBlock(block)) {
      break
    }

    const kind: 'bullet' | 'number' = block.listItem === 'bullet' ? 'bullet' : 'number'
    const level = Math.max(1, block.level ?? 1)

    if (level === 1 && kind !== rootKind) {
      break
    }

    while (stack.length > level) {
      stack.pop()
    }

    while (stack.length < level) {
      const parentList = stack[stack.length - 1]
      if (parentList === undefined) {
        throw new MigrationError('List stack underflow while building nested list')
      }
      const parentItem = parentList.children[parentList.children.length - 1]
      if (parentItem === undefined) {
        // Create an empty placeholder item to host the nested list.
        const placeholder: InklingListItemNode = {
          type: 'listitem',
          version: 1,
          value: 1,
          ...makeBaseNode(),
          children: [{ type: 'text', version: 1, text: '' }],
        }
        parentList.children.push(placeholder)
      }
      const hostItem = parentList.children[parentList.children.length - 1]!
      const subKind: 'bullet' | 'number' = level === stack.length + 1 ? kind : 'bullet'
      const subList: InklingListNode = {
        type: 'list',
        version: 1,
        listType: subKind,
        ...makeBaseNode(),
        children: [],
      }
      hostItem.children.push(subList)
      stack.push(subList)
    }

    const target = stack[stack.length - 1]
    if (target === undefined || target.listType !== kind) {
      break
    }

    const listItem: InklingListItemNode = {
      type: 'listitem',
      version: 1,
      key: block._key,
      value: target.children.length + 1,
      ...makeBaseNode(),
      children: convertTextBlockToInline(block, mode),
    }
    target.children.push(listItem)
    i += 1
  }

  return { node: root, consumed: i - start }
}

function convertImageBlock(block: ImageBlock): InklingImageCardNode {
  const node: InklingImageCardNode = {
    type: 'image-card',
    version: 1,
    key: block._key,
    src: block.src,
  }
  if (block.alt !== undefined) {
    node.alt = block.alt
  }
  if (block.caption !== undefined) {
    node.caption = block.caption
  }
  if (block.layout !== undefined) {
    node.layout = block.layout
  }
  if (block.width !== undefined) {
    node.width = block.width
  }
  if (block.height !== undefined) {
    node.height = block.height
  }
  if (block.thumbhash !== undefined) {
    node.thumbhash = block.thumbhash
  }
  if (block.storagePath !== undefined) {
    node.storagePath = block.storagePath
  }
  if (block.imageId !== undefined) {
    node.imageId = block.imageId
  }
  return node
}

function convertCodeBlock(block: CodeBlock): InklingCodeBlockNode {
  const node: InklingCodeBlockNode = {
    type: 'code-block',
    version: 1,
    key: block._key,
    code: block.code,
  }
  if (block.language !== undefined) {
    node.language = block.language
  }
  if (block.highlightedHtml !== undefined) {
    node.highlightedHtml = block.highlightedHtml
  }
  return node
}

function convertMathBlock(block: MathBlock): InklingMathBlockNode {
  const node: InklingMathBlockNode = {
    type: 'math-block',
    version: 1,
    key: block._key,
    tex: block.tex,
  }
  if (block.mathml !== undefined) {
    node.mathml = block.mathml
  }
  return node
}

function convertHorizontalRule(block: HorizontalRuleBlock): InklingHorizontalRuleNode {
  return {
    type: 'horizontal-rule',
    version: 1,
    key: block._key,
  }
}

function convertMusicPlayer(block: MusicPlayerBlock): InklingMusicCardNode {
  const node: InklingMusicCardNode = {
    type: 'music-card',
    version: 1,
    key: block._key,
    playerId: block.playerId,
  }
  if (block.auto !== undefined) {
    node.auto = block.auto
  }
  if (block.center !== undefined) {
    node.center = block.center
  }
  return node
}

function convertTableCell(
  cell: TableCell,
  isHeaderRow: boolean,
  mode: ConversionMode = 'article',
): InklingTableCellNode {
  const node: InklingTableCellNode = {
    type: 'tablecell',
    version: 1,
    key: cell._key,
    isHeader: cell.isHeader ?? isHeaderRow,
    ...makeBaseNode(),
    children: convertInlineSpans(cell.content, cell.markDefs, mode),
  }
  return node
}

function convertTableBlock(block: TableBlock, mode: ConversionMode = 'article'): InklingTableNode {
  const rows: InklingTableRowNode[] = []
  for (let rowIndex = 0; rowIndex < block.rows.length; rowIndex += 1) {
    const row = block.rows[rowIndex]!
    const isHeaderRow = block.hasHeaderRow === true && rowIndex === 0
    rows.push({
      type: 'tablerow',
      version: 1,
      key: row._key,
      cells: row.cells.map((cell) => convertTableCell(cell, isHeaderRow, mode)),
    })
  }
  return {
    type: 'table',
    version: 1,
    key: block._key,
    rows,
  }
}

function convertNonRecursiveBlock(
  block: NonRecursiveBlock,
  mode: ConversionMode = 'article',
): InklingNonRecursiveBlockNode | InklingNonRecursiveBlockNode[] {
  switch (block._type) {
    case 'block': {
      const style = block.style ?? 'normal'
      if (style === 'normal') {
        if (mode === 'comment') {
          return convertCommentTextBlockToBlocks(block, 'paragraph')
        }
        return convertParagraph(block, mode)
      }
      if (style === 'blockquote') {
        if (mode === 'comment') {
          return convertCommentTextBlockToBlocks(block, 'quote')
        }
        return convertQuote(block, mode)
      }
      return convertHeading(block, mode)
    }
    case 'image':
      return convertImageBlock(block)
    case 'code':
      return convertCodeBlock(block)
    case 'mathBlock':
      return convertMathBlock(block)
    case 'horizontalRule':
      return convertHorizontalRule(block)
    case 'musicPlayer':
      return convertMusicPlayer(block)
    case 'table':
      return convertTableBlock(block, mode)
  }
}

function pushNonRecursiveBlock(
  out: InklingNonRecursiveBlockNode[],
  block: InklingNonRecursiveBlockNode | InklingNonRecursiveBlockNode[],
): void {
  if (Array.isArray(block)) {
    out.push(...block)
  } else {
    out.push(block)
  }
}

function convertSolutionBlock(block: SolutionBlock, mode: ConversionMode = 'article'): InklingSolutionNode {
  const children: InklingNonRecursiveBlockNode[] = []
  for (const child of block.children) {
    pushNonRecursiveBlock(children, convertNonRecursiveBlock(child, mode))
  }
  return {
    type: 'solution',
    version: 1,
    key: block._key,
    children,
  }
}

function convertTwoColumnBlock(block: TwoColumnBlock, mode: ConversionMode = 'article'): InklingTwoColumnNode {
  const left: InklingNonRecursiveBlockNode[] = []
  const right: InklingNonRecursiveBlockNode[] = []
  for (const child of block.left) {
    pushNonRecursiveBlock(left, convertNonRecursiveBlock(child, mode))
  }
  for (const child of block.right) {
    pushNonRecursiveBlock(right, convertNonRecursiveBlock(child, mode))
  }
  return {
    type: 'two-column',
    version: 1,
    key: block._key,
    left,
    right,
  }
}

function convertFootnoteDefinition(
  block: FootnoteDefinitionBlock,
  mode: ConversionMode = 'article',
): InklingFootnoteDefinitionNode {
  const children: InklingNonRecursiveBlockNode[] = []
  for (const child of block.children) {
    pushNonRecursiveBlock(children, convertNonRecursiveBlock(child, mode))
  }
  return {
    type: 'footnote-definition',
    version: 1,
    key: block._key,
    targetKey: block._key,
    index: block.index,
    children,
  }
}

function convertPortableTextBlockToInkling(
  block: Block,
  mode: ConversionMode = 'article',
): InklingBlockNode | InklingBlockNode[] {
  switch (block._type) {
    case 'block': {
      const style = block.style ?? 'normal'
      if (style === 'normal') {
        if (mode === 'comment') {
          return convertCommentTextBlockToBlocks(block, 'paragraph')
        }
        return convertParagraph(block, mode)
      }
      if (style === 'blockquote') {
        if (mode === 'comment') {
          return convertCommentTextBlockToBlocks(block, 'quote')
        }
        return convertQuote(block, mode)
      }
      return convertHeading(block, mode)
    }
    case 'image':
      return convertImageBlock(block)
    case 'code':
      return convertCodeBlock(block)
    case 'mathBlock':
      return convertMathBlock(block)
    case 'horizontalRule':
      return convertHorizontalRule(block)
    case 'musicPlayer':
      return convertMusicPlayer(block)
    case 'table':
      return convertTableBlock(block, mode)
    case 'solution':
      return convertSolutionBlock(block, mode)
    case 'twoColumn':
      return convertTwoColumnBlock(block, mode)
    case 'footnoteDefinition':
      return convertFootnoteDefinition(block, mode)
  }
}

function pushBlock(out: InklingBlockNode[], block: InklingBlockNode | InklingBlockNode[]): void {
  if (Array.isArray(block)) {
    out.push(...block)
  } else {
    out.push(block)
  }
}

function convertTopLevelBlocks(body: PortableTextBody, mode: ConversionMode = 'article'): InklingBlockNode[] {
  const out: InklingBlockNode[] = []
  let i = 0
  while (i < body.length) {
    const block = body[i]!
    if (isListBlock(block)) {
      const { node, consumed } = consumeListStreak(body, i, mode)
      out.push(node)
      i += consumed
      continue
    }
    pushBlock(out, convertPortableTextBlockToInkling(block, mode))
    i += 1
  }
  return out
}

export function portableTextToInklingDocument(body: PortableTextBody): InklingDocument {
  const validated = validatePortableTextInput(body)
  if (validated.length === 0) {
    return createEmptyInklingDocument()
  }
  return {
    _type: 'inkling',
    schemaVersion: 1,
    lexicalVersion: INKLING_LEXICAL_VERSION,
    root: {
      type: 'root',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children: convertTopLevelBlocks(validated, 'article'),
    },
  }
}

export function commentPortableTextToInklingDocument(body: CommentBody): InklingDocument {
  const validated = validateCommentInput(body)
  assertNoArticleOnlyBlocks(validated as PortableTextBody)
  if (validated.length === 0) {
    return createEmptyInklingDocument()
  }
  return {
    _type: 'inkling',
    schemaVersion: 1,
    lexicalVersion: INKLING_LEXICAL_VERSION,
    root: {
      type: 'root',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children: convertTopLevelBlocks(validated as PortableTextBody, 'comment'),
    },
  }
}

// --- Reverse conversion: Inkling -> PortableText (temporary adapter) ----------

// Same Lexical-aligned bits as the forward map; reuse the shared constants so
// both directions can never drift apart.
const REVERSE_FORMAT_BOLD = INKLING_FORMAT_BOLD
const REVERSE_FORMAT_ITALIC = INKLING_FORMAT_ITALIC
const REVERSE_FORMAT_UNDERLINE = INKLING_FORMAT_UNDERLINE
const REVERSE_FORMAT_CODE = INKLING_FORMAT_CODE
const REVERSE_FORMAT_STRIKETHROUGH = INKLING_FORMAT_STRIKETHROUGH

const FORMAT_TO_DECORATOR: Record<number, StandardDecorator> = {
  [REVERSE_FORMAT_BOLD]: 'strong',
  [REVERSE_FORMAT_ITALIC]: 'em',
  [REVERSE_FORMAT_UNDERLINE]: 'underline',
  [REVERSE_FORMAT_CODE]: 'code',
  [REVERSE_FORMAT_STRIKETHROUGH]: 'strike-through',
}

function formatToMarks(format: number | undefined): StandardDecorator[] {
  const marks: StandardDecorator[] = []
  if (format === undefined) {
    return marks
  }
  for (const [bit, decorator] of Object.entries(FORMAT_TO_DECORATOR)) {
    if ((format & Number(bit)) !== 0) {
      marks.push(decorator)
    }
  }
  return marks
}

interface ReverseCtx {
  nextKey: number
  blocks: CommentBlock[]
  pendingListItems: Array<{ level: number; kind: 'bullet' | 'number'; children: Span[] }>
}

function nextKey(ctx: ReverseCtx): string {
  const key = `k${ctx.nextKey}`
  ctx.nextKey += 1
  return key
}

function buildSpan(text: string, marks: string[], ctx: ReverseCtx): Span {
  return {
    _type: 'span',
    _key: nextKey(ctx),
    text,
    marks,
  }
}

function convertInlineNodes(nodes: readonly InklingInlineNode[], markDefs: CommentMarkDef[], ctx: ReverseCtx): Span[] {
  const spans: Span[] = []
  for (const node of nodes) {
    switch (node.type) {
      case 'text': {
        spans.push(buildSpan(node.text, formatToMarks(node.format), ctx))
        break
      }
      case 'linebreak': {
        spans.push(buildSpan('\n', [], ctx))
        break
      }
      case 'inline-math': {
        const markDef: CommentMarkDef = {
          _type: 'mathInline',
          _key: nextKey(ctx),
          tex: node.tex,
          mathml: node.mathml,
        }
        markDefs.push(markDef)
        spans.push(buildSpan(node.tex, [markDef._key], ctx))
        break
      }
      case 'link': {
        const markDef: CommentMarkDef = {
          _type: 'link',
          _key: nextKey(ctx),
          href: node.url,
        }
        if (node.target !== undefined && node.target !== null) {
          markDef.target = node.target
        }
        if (node.rel !== undefined && node.rel !== null) {
          markDef.rel = node.rel
        }
        markDefs.push(markDef)
        for (const child of node.children) {
          if (child.type === 'text') {
            spans.push(buildSpan(child.text, [...formatToMarks(child.format), markDef._key], ctx))
          } else if (child.type === 'linebreak') {
            spans.push(buildSpan('\n', [markDef._key], ctx))
          }
        }
        break
      }
      case 'footnote-ref': {
        // Footnote refs are not allowed in comment bodies; drop them.
        break
      }
    }
  }
  return spans
}

function flushListItems(ctx: ReverseCtx): void {
  for (const item of ctx.pendingListItems) {
    ctx.blocks.push({
      _type: 'block',
      _key: nextKey(ctx),
      style: 'normal',
      listItem: item.kind,
      level: item.level,
      children: item.children,
    })
  }
  ctx.pendingListItems = []
}

function collectListItems(node: InklingListNode, level: number, ctx: ReverseCtx): void {
  for (const item of node.children) {
    const itemSpans: Span[] = []
    for (const child of item.children) {
      if (child.type === 'list') {
        flushListItems(ctx)
        collectListItems(child, level + 1, ctx)
      } else {
        const markDefs: CommentMarkDef[] = []
        itemSpans.push(...convertInlineNodes([child], markDefs, ctx))
      }
    }
    ctx.pendingListItems.push({ level, kind: node.listType, children: itemSpans })
  }
}

function convertInklingBlockToCommentBlock(node: InklingBlockNode, ctx: ReverseCtx): void {
  switch (node.type) {
    case 'paragraph': {
      flushListItems(ctx)
      const markDefs: CommentMarkDef[] = []
      ctx.blocks.push({
        _type: 'block',
        _key: nextKey(ctx),
        style: 'normal',
        children: convertInlineNodes(node.children, markDefs, ctx),
        markDefs,
      })
      break
    }
    case 'quote': {
      flushListItems(ctx)
      const markDefs: CommentMarkDef[] = []
      ctx.blocks.push({
        _type: 'block',
        _key: nextKey(ctx),
        style: 'blockquote',
        children: convertInlineNodes(node.children, markDefs, ctx),
        markDefs,
      })
      break
    }
    case 'list': {
      flushListItems(ctx)
      collectListItems(node, 1, ctx)
      flushListItems(ctx)
      break
    }
    case 'code-block': {
      flushListItems(ctx)
      ctx.blocks.push({
        _type: 'code',
        _key: nextKey(ctx),
        code: node.code,
        language: node.language,
        highlightedHtml: node.highlightedHtml,
      })
      break
    }
    case 'math-block': {
      flushListItems(ctx)
      ctx.blocks.push({
        _type: 'mathBlock',
        _key: nextKey(ctx),
        tex: node.tex,
        mathml: node.mathml,
      })
      break
    }
    case 'heading':
    case 'horizontal-rule':
    case 'image-card':
    case 'music-card':
    case 'solution':
    case 'table':
    case 'two-column':
    case 'footnote-definition': {
      throw new MigrationError(`Comment body cannot contain article-only block: ${node.type}`)
    }
  }
}

export function inklingDocumentToCommentBody(document: InklingDocument): CommentBody {
  const ctx: ReverseCtx = { nextKey: 1, blocks: [], pendingListItems: [] }
  for (const block of document.root.children) {
    convertInklingBlockToCommentBlock(block, ctx)
  }
  flushListItems(ctx)
  return commentBodySchema.parse(ctx.blocks)
}
