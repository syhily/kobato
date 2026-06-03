import type { CommentBlock, CommentBody, CommentTextBlock } from '@/shared/pt/comment-schema'
import type { LinkMarkDef, MathInlineMarkDef, Span } from '@/shared/pt/schema'

// Email-friendly server renderer for comment bodies. Produces a
// compact HTML string suitable for embedding in transactional email
// templates via `dangerouslySetInnerHTML`.
//
// Unlike the public-site `<PortableTextBody>` SSR renderer this
// helper:
//
//   * Emits no Shiki / KaTeX class names. Email clients strip class
//     attributes anyway; rendering the pre-baked syntax HTML would
//     leak ~1KB per code block for no visual gain. We fall back to
//     plain `<pre><code>` instead.
//   * Renders math as inline TeX inside `<code>` rather than MathML
//     — MathML support across mail clients is poor enough that the
//     TeX source is a better default.
//   * Has no React dependency, so server code can compose the HTML
//     into an email template `dangerouslySetInnerHTML` without crossing
//     the `server → ui` import boundary.
//
// This module ONLY handles the comment dialect. The (richer) blog
// post / page rendering path stays on `<PortableTextBody>`.

const NEWLINE = '\n'

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(input: string): string {
  return escapeHtml(input)
}

interface MarkLookup {
  links: Map<string, LinkMarkDef>
  mathInline: Map<string, MathInlineMarkDef>
}

function buildMarkLookup(block: CommentTextBlock): MarkLookup {
  const links = new Map<string, LinkMarkDef>()
  const mathInline = new Map<string, MathInlineMarkDef>()
  for (const def of block.markDefs ?? []) {
    if (def._type === 'link') {
      links.set(def._key, def)
    } else if (def._type === 'mathInline') {
      mathInline.set(def._key, def)
    }
  }
  return { links, mathInline }
}

function renderSpan(span: Span, lookup: MarkLookup): string {
  const marks = span.marks ?? []
  // mathInline span: the displayed glyph is the TeX source.
  for (const name of marks) {
    const math = lookup.mathInline.get(name)
    if (math !== undefined) {
      return `<code>$${escapeHtml(math.tex)}$</code>`
    }
  }
  let html = escapeHtml(span.text)
  // `code` decorator wins over the typography decorators (markdown
  // inline code doesn't honour bold/italic inside backticks). Apply
  // the link wrapper last so the URL covers the whole span.
  if (marks.includes('code')) {
    html = `<code>${escapeHtml(span.text)}</code>`
  } else {
    if (marks.includes('strike-through')) {
      html = `<del>${html}</del>`
    }
    if (marks.includes('em')) {
      html = `<em>${html}</em>`
    }
    if (marks.includes('strong')) {
      html = `<strong>${html}</strong>`
    }
    if (marks.includes('underline')) {
      html = `<u>${html}</u>`
    }
  }
  for (const name of marks) {
    const link = lookup.links.get(name)
    if (link !== undefined) {
      const rel = link.rel ?? 'nofollow noreferrer'
      const target = link.target ?? '_blank'
      html = `<a href="${escapeAttr(link.href)}" rel="${escapeAttr(rel)}" target="${escapeAttr(target)}">${html}</a>`
      break
    }
  }
  return html
}

function renderInline(block: CommentTextBlock): string {
  const lookup = buildMarkLookup(block)
  let out = ''
  for (const child of block.children) {
    out += renderSpan(child, lookup)
  }
  return out
}

interface ListFrame {
  ordered: boolean
  level: number
}

function renderListItem(block: CommentTextBlock, stack: ListFrame[], out: string[]): void {
  const ordered = block.listItem === 'number'
  const level = block.level ?? 1
  // Close frames that sit deeper than (or at the same level but with a
  // different ordering than) the current item.
  while (stack.length > 0) {
    const top = stack[stack.length - 1]
    if (top.level > level || (top.level === level && top.ordered !== ordered)) {
      out.push(top.ordered ? '</ol>' : '</ul>')
      stack.pop()
      continue
    }
    break
  }
  // Open frames up to the current level.
  while (stack.length === 0 || stack[stack.length - 1].level < level) {
    out.push(ordered ? '<ol>' : '<ul>')
    stack.push({ ordered, level: (stack[stack.length - 1]?.level ?? 0) + 1 })
  }
  out.push(`<li>${renderInline(block)}</li>`)
}

function closeListStack(stack: ListFrame[], out: string[]): void {
  while (stack.length > 0) {
    const top = stack.pop()!
    out.push(top.ordered ? '</ol>' : '</ul>')
  }
}

function renderTextBlock(block: CommentTextBlock, stack: ListFrame[], out: string[]): void {
  if (block.listItem !== undefined) {
    renderListItem(block, stack, out)
    return
  }
  closeListStack(stack, out)
  const inner = renderInline(block)
  if (block.style === 'blockquote') {
    out.push(`<blockquote>${inner}</blockquote>`)
  } else {
    out.push(`<p>${inner}</p>`)
  }
}

function renderCodeBlock(block: Extract<CommentBlock, { _type: 'code' }>, out: string[]): void {
  const language = block.language ? ` data-language="${escapeAttr(block.language)}"` : ''
  out.push(`<pre><code${language}>${escapeHtml(block.code)}</code></pre>`)
}

function renderMathBlock(block: Extract<CommentBlock, { _type: 'mathBlock' }>, out: string[]): void {
  out.push(`<pre><code>$$${escapeHtml(block.tex)}$$</code></pre>`)
}

export function commentBodyToHtml(body: CommentBody): string {
  const out: string[] = []
  const stack: ListFrame[] = []
  for (const block of body) {
    if (block._type === 'block') {
      renderTextBlock(block, stack, out)
      continue
    }
    closeListStack(stack, out)
    if (block._type === 'code') {
      renderCodeBlock(block, out)
    } else if (block._type === 'mathBlock') {
      renderMathBlock(block, out)
    }
  }
  closeListStack(stack, out)
  return out.join(NEWLINE)
}
