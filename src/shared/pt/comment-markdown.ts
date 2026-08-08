import type { CommentBlock, CommentBody, CommentTextBlock } from '@/shared/pt/comment-schema'
import type { Span } from '@/shared/pt/schema'

// Serialise a comment PT body to markdown — stored in `comment.content`
// as a rollback snapshot on every save.

const NEWLINE = '\n'
const INDENT_STEP = '  '

interface MarkDefLookup {
  link: Map<string, { href: string }>
  mathInline: Map<string, { tex: string }>
}

function buildMarkDefLookup(block: CommentTextBlock): MarkDefLookup {
  const link = new Map<string, { href: string }>()
  const mathInline = new Map<string, { tex: string }>()
  for (const def of block.markDefs ?? []) {
    if (def._type === 'link') {
      link.set(def._key, { href: def.href })
    } else if (def._type === 'mathInline') {
      mathInline.set(def._key, { tex: def.tex })
    }
  }
  return { link, mathInline }
}

function renderSpan(span: Span, lookup: MarkDefLookup): string {
  const marks = span.marks ?? []
  // mathInline overrides text content — the displayed glyph is the
  // tex source wrapped in `$…$`, not the (typically empty) span text.
  for (const name of marks) {
    const math = lookup.mathInline.get(name)
    if (math !== undefined) {
      return `$${math.tex}$`
    }
  }
  let text = escapeInline(span.text)
  // Decorators wrap from innermost to outermost.
  if (marks.includes('code')) {
    // `code` wins over other decorators on the same span.
    text = `\`${span.text}\``
    return wrapLinkIfAny(text, marks, lookup)
  }
  if (marks.includes('strike-through')) {
    text = `~~${text}~~`
  }
  if (marks.includes('em')) {
    text = `*${text}*`
  }
  if (marks.includes('strong')) {
    text = `**${text}**`
  }
  if (marks.includes('underline')) {
    text = `<u>${text}</u>`
  }
  return wrapLinkIfAny(text, marks, lookup)
}

function wrapLinkIfAny(text: string, marks: ReadonlyArray<string>, lookup: MarkDefLookup): string {
  for (const name of marks) {
    const link = lookup.link.get(name)
    if (link !== undefined) {
      // URLs containing parentheses break markdown link syntax.
      const href = link.href.includes(')') ? `<${link.href}>` : link.href
      return `[${text}](${href})`
    }
  }
  return text
}

function escapeInline(text: string): string {
  // Escape the markdown chars that would re-parse through `marked`;
  // deliberately NOT `<`/`>` — `<u>` is the only inline HTML we emit.
  return text.replace(/([\\`*_])/g, '\\$1')
}

function renderInline(block: CommentTextBlock): string {
  const lookup = buildMarkDefLookup(block)
  let out = ''
  for (const child of block.children) {
    out += renderSpan(child, lookup)
  }
  return out
}

function renderTextBlock(block: CommentTextBlock): string[] {
  const inline = renderInline(block)
  if (block.listItem !== undefined) {
    const level = block.level ?? 1
    const indent = INDENT_STEP.repeat(Math.max(0, level - 1))
    const bullet = block.listItem === 'number' ? '1.' : '-'
    return [`${indent}${bullet} ${inline}`]
  }
  if (block.style === 'blockquote') {
    return inline.split(NEWLINE).map((line) => `> ${line}`)
  }
  return [inline]
}

function renderCodeBlock(block: Extract<CommentBlock, { _type: 'code' }>): string[] {
  const fence = '```'
  const head = block.language ? `${fence}${block.language}` : fence
  return [head, block.code, fence]
}

function renderMathBlock(block: Extract<CommentBlock, { _type: 'mathBlock' }>): string[] {
  return [`$$${block.tex}$$`]
}

function renderBlock(block: CommentBlock): string[] {
  switch (block._type) {
    case 'block':
      return renderTextBlock(block)
    case 'code':
      return renderCodeBlock(block)
    case 'mathBlock':
      return renderMathBlock(block)
    default:
      return []
  }
}

// Adjacent list items render without a blank line between them; every
// other block boundary takes a blank line.
function shouldSeparateWithBlankLine(prev: CommentBlock, next: CommentBlock): boolean {
  if (prev._type === 'block' && next._type === 'block') {
    const prevIsList = prev.listItem !== undefined
    const nextIsList = next.listItem !== undefined
    if (prevIsList && nextIsList) {
      return false
    }
    if (prev.style === 'blockquote' && next.style === 'blockquote') {
      return false
    }
  }
  return true
}

export function commentBodyToMarkdown(body: CommentBody): string {
  const out: string[] = []
  for (let i = 0; i < body.length; i++) {
    const block = body[i]
    if (i > 0 && shouldSeparateWithBlankLine(body[i - 1], block)) {
      out.push('')
    }
    for (const line of renderBlock(block)) {
      out.push(line)
    }
  }
  return out.join(NEWLINE).trim()
}
