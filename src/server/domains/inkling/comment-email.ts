import type {
  InklingDocument,
  InklingInlineMathNode,
  InklingInlineNode,
  InklingLineBreakNode,
  InklingLinkNode,
  InklingListItemNode,
  InklingListNode,
  InklingTextNode,
} from '@/shared/inkling/schema'

import { validateInklingDocumentForMode } from '@/shared/inkling/features'
import {
  INKLING_FORMAT_BOLD,
  INKLING_FORMAT_CODE,
  INKLING_FORMAT_ITALIC,
  INKLING_FORMAT_STRIKETHROUGH,
  INKLING_FORMAT_UNDERLINE,
} from '@/shared/inkling/format'
import { walkInkling } from '@/shared/inkling/walk'
import { sanitizeUrl } from '@/shared/sanitize-url'
import { escapeHtml } from '@/shared/utils/security'

// Email-friendly server renderer for Inkling comment bodies. Produces a
// compact HTML string suitable for embedding in transactional email templates
// via `dangerouslySetInnerHTML`.
//
// This renderer intentionally emits NO MathML and NO Shiki highlighted HTML:
// MathML support in mail clients is poor, and syntax-highlighting classes are
// stripped by most clients. It only handles the comment feature subset; any
// article-only node causes an error so that migration problems surface loudly.

// Lexical text format bits (re-exported from the shared source of truth so
// they stay in sync with lexical's IS_* constants).
const FORMAT_BOLD = INKLING_FORMAT_BOLD
const FORMAT_ITALIC = INKLING_FORMAT_ITALIC
const FORMAT_UNDERLINE = INKLING_FORMAT_UNDERLINE
const FORMAT_CODE = INKLING_FORMAT_CODE
const FORMAT_STRIKETHROUGH = INKLING_FORMAT_STRIKETHROUGH

interface RenderCtx {
  out: string[]
}

function escapeAttr(input: string): string {
  return escapeHtml(input)
}

function hasFormat(format: number | undefined, bit: number): boolean {
  return ((format ?? 0) & bit) !== 0
}

function assertCommentOnlyInlineType(type: string): void {
  if (type === 'footnote-ref') {
    throw new Error('comment-email cannot render article-only inline node: footnote-ref')
  }
}

function renderTextNode(node: InklingTextNode): string {
  let html = escapeHtml(node.text)
  const format = node.format ?? 0
  // CODE is exclusive per Lexical semantics.  Nesting order (outermost
  // first): STRIKETHROUGH > UNDERLINE > ITALIC > BOLD, matching all
  // other renderers (html.ts, comment-html.ts, CommentInklingBody, TextMark).
  if (hasFormat(format, FORMAT_CODE)) {
    html = `<code>${html}</code>`
  } else {
    if (hasFormat(format, FORMAT_STRIKETHROUGH)) {
      html = `<s>${html}</s>`
    }
    if (hasFormat(format, FORMAT_UNDERLINE)) {
      html = `<u>${html}</u>`
    }
    if (hasFormat(format, FORMAT_ITALIC)) {
      html = `<em>${html}</em>`
    }
    if (hasFormat(format, FORMAT_BOLD)) {
      html = `<strong>${html}</strong>`
    }
  }
  return html
}

function renderInlineMathNode(node: InklingInlineMathNode): string {
  return `<code>$${escapeHtml(node.tex)}$</code>`
}

function renderLinkNode(node: InklingLinkNode): string {
  // Defense-in-depth: shared protocol whitelist + control-character
  // stripping via sanitizeUrl. Replaces the previous ad-hoc
  // /^\s*(javascript|data):/i regex which missed vbscript: and was
  // bypassable via control characters. Mirrors LinkMark.tsx and html.ts.
  const href = sanitizeUrl(node.url)
  const rel = node.rel ?? 'nofollow noreferrer'
  const target = node.target ?? '_blank'
  const titleAttr = node.title ? ` title="${escapeAttr(node.title)}"` : ''
  return `<a href="${escapeAttr(href)}" rel="${escapeAttr(rel)}" target="${escapeAttr(target)}"${titleAttr}>${renderInlineChildren(node.children)}</a>`
}

function renderLineBreakNode(_node: InklingLineBreakNode): string {
  return '<br/>'
}

function renderInlineNode(node: InklingInlineNode): string {
  switch (node.type) {
    case 'text':
      return renderTextNode(node)
    case 'linebreak':
      return renderLineBreakNode(node)
    case 'inline-math':
      return renderInlineMathNode(node)
    case 'link':
      return renderLinkNode(node)
    case 'footnote-ref':
      assertCommentOnlyInlineType(node.type)
      return ''
  }
}

function renderInlineChildren(children: ReadonlyArray<InklingInlineNode>): string {
  return children.map((child) => renderInlineNode(child)).join('')
}

function renderListNode(node: InklingListNode, ctx: RenderCtx): void {
  const tag = node.listType === 'number' ? 'ol' : 'ul'
  ctx.out.push(`<${tag}>`)
  for (const item of node.children) {
    renderListItem(item, ctx)
  }
  ctx.out.push(`</${tag}>`)
}

function renderListItem(item: InklingListItemNode, ctx: RenderCtx): void {
  ctx.out.push('<li>')
  for (const child of item.children) {
    if (child.type === 'list') {
      renderListNode(child, ctx)
    } else {
      ctx.out.push(renderInlineNode(child))
    }
  }
  ctx.out.push('</li>')
}

export function commentInklingToEmailHtml(document: InklingDocument): string {
  const modeValidation = validateInklingDocumentForMode(document, 'comment')
  if (!modeValidation.ok) {
    throw new Error(
      `comment-email cannot render article-only node: ${modeValidation.forbiddenType} at ${modeValidation.path}`,
    )
  }

  const ctx: RenderCtx = { out: [] }

  walkInkling(
    document,
    {
      paragraph: (node, c) => {
        c.out.push(`<p>${renderInlineChildren(node.children)}</p>`)
      },
      quote: (node, c) => {
        c.out.push(`<blockquote>${renderInlineChildren(node.children)}</blockquote>`)
      },
      list: (node, c) => {
        renderListNode(node, c)
      },
      code: (node, c) => {
        const language =
          node.language !== undefined && node.language.length > 0 ? ` data-language="${escapeAttr(node.language)}"` : ''
        c.out.push(`<pre><code${language}>${escapeHtml(node.code)}</code></pre>`)
      },
      mathBlock: (node, c) => {
        c.out.push(`<pre><code>$$${escapeHtml(node.tex)}$$</code></pre>`)
      },
    },
    ctx,
  )

  return ctx.out.join('')
}
