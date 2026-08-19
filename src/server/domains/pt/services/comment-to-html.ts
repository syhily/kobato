import { toHTML, type PortableTextComponents } from '@portabletext/to-html'

/* oxlint-disable typescript/no-unsafe-argument, typescript/no-unsafe-type-assertion */
import type { CommentBlock, CommentBody, CommentTextBlock } from '@/shared/pt/comment-schema'
import type { CodeBlock, MathBlock, PortableTextBlock, Span } from '@/shared/pt/schema'

import { escapeHtml } from '@/shared/utils/security'

// Email-friendly HTML renderer for comment bodies (transactional mail):
// no Shiki/KaTeX class names or MathML — math renders as inline TeX in
// `<code>`. Handles the comment dialect only.
//
// Deliberate pins keeping the output identical to the hand-rolled renderer
// this replaced:
// - `escapeHTML: escapeHtml` — the package default also escapes `'` and
//   collapses runs of spaces into `&nbsp;`, which the old renderer never did.
// - `hardBreak: () => '\n'` — the old renderer emitted raw newlines, not
//   `<br />`.
// - The list/listItem components restore the old renderer's '\n' between
//   every structural element (toHTML joins children with no separator), and
//   consecutive list items are chunked into runs (split on a top-level
//   bullet↔number flip) so the runs can be joined with '\n' too.
// - `normalizeBlock` re-applies the old renderer's mark precedence rules the
//   toolkit does not know: mathInline wins over everything on the span,
//   inline `code` suppresses the typography decorators (markdown semantics),
//   and a list item's block style is ignored.

interface LinkMarkValue {
  href?: string
  rel?: string
  target?: string
}

interface MathInlineMarkValue {
  tex?: string
}

function renderLinkMark(children: string, value: LinkMarkValue): string {
  const href = escapeHtml(value.href ?? '')
  const rel = escapeHtml(value.rel ?? 'nofollow noreferrer')
  const target = escapeHtml(value.target ?? '_blank')
  return `<a href="${href}" rel="${rel}" target="${target}">${children}</a>`
}

// The displayed glyph is the TeX source; the span's own text is dropped.
function renderMathInlineMark(value: MathInlineMarkValue | undefined): string {
  return `<code>$${escapeHtml(value?.tex ?? '')}$</code>`
}

function renderCodeBlock(value: CodeBlock): string {
  const language = value.language ? ` data-language="${escapeHtml(value.language)}"` : ''
  return `<pre><code${language}>${escapeHtml(value.code)}</code></pre>`
}

function renderMathBlock(value: MathBlock): string {
  return `<pre><code>$$${escapeHtml(value.tex)}$$</code></pre>`
}

const components: PortableTextComponents = {
  block: {
    normal: ({ children }) => `<p>${children}</p>`,
    blockquote: ({ children }) => `<blockquote>${children}</blockquote>`,
  },
  marks: {
    strong: ({ children }) => `<strong>${children}</strong>`,
    em: ({ children }) => `<em>${children}</em>`,
    underline: ({ children }) => `<u>${children}</u>`,
    'strike-through': ({ children }) => `<del>${children}</del>`,
    code: ({ children }) => `<code>${children}</code>`,
    link: ({ value, children }) => (value === undefined ? children : renderLinkMark(children, value)),
    mathInline: ({ value }) => renderMathInlineMark(value),
  },
  list: {
    bullet: ({ children }) => `<ul>${children}\n</ul>`,
    number: ({ children }) => `<ol>${children}\n</ol>`,
  },
  listItem: {
    bullet: ({ children }) => `\n<li>${children}</li>`,
    number: ({ children }) => `\n<li>${children}</li>`,
  },
  types: {
    code: ({ value }) => renderCodeBlock(value as CodeBlock),
    mathBlock: ({ value }) => renderMathBlock(value as MathBlock),
  },
  hardBreak: () => '\n',
  escapeHTML: escapeHtml,
  unknownType: () => '',
  unknownMark: ({ children }) => children,
  unknownBlockStyle: ({ children }) => `<p>${children}</p>`,
  unknownList: ({ children }) => `<ul>${children}</ul>`,
  unknownListItem: ({ children }) => `<li>${children}</li>`,
}

const TYPOGRAPHY_DECORATORS = new Set(['em', 'strong', 'underline', 'strike-through'])

function normalizeSpan(span: Span, mathInlineKeys: ReadonlySet<string>): Span {
  const marks = span.marks
  if (marks === undefined || marks.length === 0) {
    return span
  }
  // mathInline wins over every other mark on the span (annotations included).
  const mathKey = marks.find((mark) => mathInlineKeys.has(mark))
  if (mathKey !== undefined) {
    return marks.length === 1 ? span : { ...span, marks: [mathKey] }
  }
  if (!marks.includes('code')) {
    return span
  }
  // `code` wins over the typography decorators (markdown inline code);
  // annotation keys (link) are unaffected.
  const filtered = marks.filter((mark) => mark === 'code' || !TYPOGRAPHY_DECORATORS.has(mark))
  return filtered.length === marks.length ? span : { ...span, marks: filtered }
}

function normalizeBlock(block: CommentBlock): CommentBlock {
  if (block._type !== 'block') {
    return block
  }
  const mathInlineKeys = new Set(
    (block.markDefs ?? []).filter((def) => def._type === 'mathInline').map((def) => def._key),
  )
  const children = block.children.map((child) => normalizeSpan(child, mathInlineKeys))
  // A list item's block style is ignored — the toolkit would otherwise wrap
  // the item's children in a <blockquote>.
  const style = block.listItem !== undefined ? undefined : block.style
  return { ...block, children, style }
}

function renderChunk(chunk: CommentBlock[]): string {
  return toHTML(chunk.map(normalizeBlock) as PortableTextBlock[], { components })
}

// toHTML joins top-level nodes with no separator, so consecutive list items
// (which nestLists must see as one run) are rendered per run and the runs are
// joined with '\n' — the old renderer's block separator. A level-1 item whose
// list type differs from the run's top-level list starts a new run: the old
// renderer closed and reopened the list there.
export function commentBodyToHtml(body: CommentBody): string {
  const out: string[] = []
  let listRun: CommentTextBlock[] = []
  let runRootType: 'bullet' | 'number' | undefined
  const flushListRun = (): void => {
    if (listRun.length > 0) {
      out.push(renderChunk(listRun))
      listRun = []
      runRootType = undefined
    }
  }
  for (const block of body) {
    if (block._type === 'block' && block.listItem !== undefined) {
      if ((block.level ?? 1) === 1) {
        if (runRootType !== undefined && block.listItem !== runRootType) {
          flushListRun()
        }
        runRootType = block.listItem
      }
      listRun.push(block)
      continue
    }
    flushListRun()
    out.push(renderChunk([block]))
  }
  flushListRun()
  return out.join('\n')
}
