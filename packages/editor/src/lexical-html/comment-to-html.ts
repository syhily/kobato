import type {
  LexicalCommentBlockNode,
  LexicalCommentBody,
  LexicalCommentInlineNode,
  LexicalCommentLinkNode,
  LexicalCommentListItemNode,
  LexicalCommentListNode,
  LexicalCommentParagraphNode,
  LexicalCommentQuoteNode,
} from '@kobato/shared/lexical/comment-schema'

import { safeRel } from '@kobato/editor/engine/lib/link'
import { sanitizeHtml } from '@kobato/editor/engine/lib/sanitize-html'
import {
  BODY_WRAPPER_CLASS,
  codeLanguageClass,
  MATH_DISPLAY_CLASS,
  MATH_INLINE_CLASS,
  PT_INLINE,
} from '@kobato/editor/lexical-html/manifest'
import { sanitizeUrl } from '@kobato/shared/sanitize-url'
import { escapeHtml } from '@kobato/shared/utils/security'

// Pure-JSON string renderer for `LexicalCommentBody` — the string twin
// of the body renderer (`lexicalBodyToHtml`) restricted to the comment
// dialect. NO `@lexical/*` runtime and NO React: this module walks the
// plain EditorState JSON and emits the manifest contract as an HTML
// string, so feeds and email sinks can render without a DOM.
//
// Output contract per `mode`:
//   - `default` — full-class form on the comment subset of the body
//     renderer's structure: `PT_INLINE` mark classes, `alignClass`
//     paragraph/quote alignment, `MATH_INLINE_CLASS` /
//     `MATH_DISPLAY_CLASS` wrappers (sanitized MathML/SVG markup),
//     `language-*` / `data-language` code blocks, wrapped in
//     `BODY_WRAPPER_CLASS` (the `PortableTextBody` wrapper). Quote
//     children render as `<p>`; listitem children render paragraphs
//     (with `<p>`) and nested lists; the 0.45 runtime inline children
//     render bare inside `<li>`.
//   - `email` — classless form mirroring the R2 legacy
//     `commentBodyToHtml` semantics: math renders as TeX inside
//     `<code>` (`$…$` inline, `$$…$$` block), decorators follow the
//     legacy order (code exclusive, then del/em/strong/u), links get
//     the legacy defaults (`rel="nofollow noreferrer"`,
//     `target="_blank"` when unset), quote/listitem paragraphs render
//     as bare inline runs, no wrapper element.
//
// Escaping follows React's SSR serializer: `&`, `<`, `>`, `"` are
// escaped in both text content and attribute values (`escapeHtml`).

export type LexicalCommentHtmlMode = 'default' | 'email'

export interface LexicalCommentBodyToHtmlOptions {
  /** `default` (classful) or `email` (classless, legacy semantics). */
  mode?: LexicalCommentHtmlMode
}

interface RenderContext {
  mode: LexicalCommentHtmlMode
}

export function lexicalCommentBodyToHtml(
  body: LexicalCommentBody,
  options: LexicalCommentBodyToHtmlOptions = {},
): string {
  const ctx: RenderContext = { mode: options.mode ?? 'default' }
  const main = body.root.children.map((block) => renderBlock(block, ctx)).join('')
  if (ctx.mode === 'default') {
    return `<div class="${BODY_WRAPPER_CLASS}">${main}</div>`
  }
  return main
}

// --- attribute helpers --------------------------------------------------------
//
// `escapeHtml` escapes `& < > "` — the same set React's SSR serializer
// applies to both text content and attribute values.

function attr(name: string, value: string | number | undefined | null): string {
  if (value === undefined || value === null) {
    return ''
  }
  return ` ${name}="${escapeHtml(String(value))}"`
}

function clsAttr(cls: string | undefined): string {
  if (cls === undefined || cls === '') {
    return ''
  }
  return ` class="${escapeHtml(cls)}"`
}

/** `class` attribute unless the mode is classless. */
function modeClsAttr(ctx: RenderContext, cls: string | undefined): string {
  return ctx.mode === 'default' ? clsAttr(cls) : ''
}

// --- block rendering ----------------------------------------------------------

function renderBlock(node: LexicalCommentBlockNode | LexicalCommentListItemNode, ctx: RenderContext): string {
  switch (node.type) {
    case 'paragraph':
      return renderParagraph(node, ctx)
    case 'quote':
      return renderQuote(node, ctx)
    case 'list':
      return renderList(node, ctx)
    case 'listitem':
      return renderListItem(node, ctx)
    case 'code':
      return renderCode(node, ctx)
    case 'mathBlock':
      return renderMathBlock(node, ctx)
    default:
      // Defense-in-depth: the zod gate rejects unknown node types, but a
      // hand-crafted body that bypasses it must not leak `undefined` text.
      return ''
  }
}

function renderParagraph(node: LexicalCommentParagraphNode, ctx: RenderContext): string {
  return `<p${modeClsAttr(ctx, alignClassOf(node.format))}>${renderInlines(node.children, ctx)}</p>`
}

function renderQuote(node: LexicalCommentQuoteNode, ctx: RenderContext): string {
  if (ctx.mode === 'email') {
    // Legacy form: the blockquote carries the inline run(s) directly,
    // no inner `<p>`.
    return `<blockquote>${node.children.map((child) => renderInlines(child.children, ctx)).join('')}</blockquote>`
  }
  return `<blockquote${modeClsAttr(ctx, alignClassOf(node.format))}>${node.children
    .map((child) => renderBlock(child, ctx))
    .join('')}</blockquote>`
}

function renderList(node: LexicalCommentListNode, ctx: RenderContext): string {
  const items = node.children.map((child) => renderBlock(child, ctx)).join('')
  return `<${node.tag}>${items}</${node.tag}>`
}

function renderListItem(node: LexicalCommentListItemNode, ctx: RenderContext): string {
  const inner = node.children
    .map((child) => {
      if (child.type === 'list') {
        return renderBlock(child, ctx)
      }
      if (child.type === 'paragraph') {
        // default mode keeps the `<p>` wrapper (body-renderer parity);
        // email mode renders the inline run bare — the legacy form.
        return ctx.mode === 'email' ? renderInlines(child.children, ctx) : renderBlock(child, ctx)
      }
      // The 0.45 runtime shape: inline children directly in the item.
      return renderInline(child, ctx)
    })
    .join('')
  return `<li>${inner}</li>`
}

function renderCode(node: Extract<LexicalCommentBlockNode, { type: 'code' }>, ctx: RenderContext): string {
  const text = node.children.map((child) => child.text).join('')
  const language = node.language
  if (ctx.mode === 'email') {
    // Legacy form: `data-language` only when set, no class.
    return `<pre><code${attr('data-language', language)}>${escapeHtml(text)}</code></pre>`
  }
  if (node.highlightedHtml !== undefined && node.highlightedHtml !== '') {
    // Server prerender artifact (Shiki) renders only in default mode —
    // sanitized through the same 'shiki' gate as the body renderers.
    return `<pre><code${clsAttr(codeLanguageClass(language))}${attr('data-language', language)}>${sanitizeHtml(
      node.highlightedHtml,
      'shiki',
    )}</code></pre>`
  }
  return `<pre><code${clsAttr(codeLanguageClass(language))}${attr('data-language', language)}>${escapeHtml(text)}</code></pre>`
}

function renderMathBlock(node: Extract<LexicalCommentBlockNode, { type: 'mathBlock' }>, ctx: RenderContext): string {
  const tex = node.tex
  if (ctx.mode === 'email') {
    // Legacy form: TeX only, wrapped in `$$…$$`.
    return `<pre><code>$$${escapeHtml(tex)}$$</code></pre>`
  }
  const markup = renderMathMarkup(node.mathml, node.svg)
  if (markup !== undefined) {
    return `<div${clsAttr(MATH_DISPLAY_CLASS)}>${markup}</div>`
  }
  // TeX fallback — the same class pair `renderMathMarkupOrTexFallback`
  // emits (`math math-display`), NOT the full `MATH_DISPLAY_CLASS` (its
  // `[&_svg]` variants are meaningless on a `<pre>` and would drift from
  // the React twin's output).
  return `<pre${clsAttr('math math-display')}><code>${escapeHtml(tex)}</code></pre>`
}

/** Sanitized mathml/svg fragment, or `undefined` when the node has none. */
function renderMathMarkup(mathml: string | undefined, svg: string | undefined): string | undefined {
  const markup = mathml !== undefined && mathml !== '' ? mathml : svg
  if (markup === undefined || markup === '') {
    return undefined
  }
  // The 'math' strategy whitelists MathML tags/attributes and strips
  // active content — same gate as the body renderers.
  return sanitizeHtml(markup, 'math')
}

// --- inline rendering ---------------------------------------------------------

function renderInlines(nodes: readonly LexicalCommentInlineNode[], ctx: RenderContext): string {
  return nodes.map((node) => renderInline(node, ctx)).join('')
}

function renderInline(node: LexicalCommentInlineNode, ctx: RenderContext): string {
  switch (node.type) {
    case 'text':
      return renderText(node, ctx)
    case 'linebreak':
      return '<br/>'
    case 'link':
      return renderLink(node, ctx)
    case 'mathInline':
      return renderMathInline(node, ctx)
  }
}

function renderText(node: Extract<LexicalCommentInlineNode, { type: 'text' }>, ctx: RenderContext): string {
  const format = node.format
  if (ctx.mode === 'email') {
    // Legacy `renderSpan` order: `code` wins over the typography
    // decorators (inline code doesn't honour bold/italic); the others
    // nest del innermost, then em, strong, u.
    if ((format & 16) !== 0) {
      return `<code>${escapeHtml(node.text)}</code>`
    }
    let out = escapeHtml(node.text)
    if ((format & 4) !== 0) {
      out = `<del>${out}</del>`
    }
    if ((format & 2) !== 0) {
      out = `<em>${out}</em>`
    }
    if ((format & 1) !== 0) {
      out = `<strong>${out}</strong>`
    }
    if ((format & 8) !== 0) {
      out = `<u>${out}</u>`
    }
    return out
  }
  // default mode — the body renderer's ascending-bit order with the
  // manifest `PT_INLINE` classes.
  let out = escapeHtml(node.text)
  if ((format & 1) !== 0) {
    out = `<strong${clsAttr(PT_INLINE.strong)}>${out}</strong>`
  }
  if ((format & 2) !== 0) {
    out = `<em${clsAttr(PT_INLINE.em)}>${out}</em>`
  }
  if ((format & 4) !== 0) {
    out = `<s${clsAttr(PT_INLINE.strike)}>${out}</s>`
  }
  if ((format & 8) !== 0) {
    out = `<u${clsAttr(PT_INLINE.underline)}>${out}</u>`
  }
  if ((format & 16) !== 0) {
    out = `<code${clsAttr(PT_INLINE.code)}>${out}</code>`
  }
  return out
}

function renderLink(node: LexicalCommentLinkNode, ctx: RenderContext): string {
  // Defense-in-depth: never emit executable JavaScript or data URLs
  // even if the gate is bypassed. `sanitizeUrl` also strips C0 control
  // chars.
  const href = sanitizeUrl(node.url)
  const children = renderInlines(node.children, ctx)
  if (ctx.mode === 'email') {
    // Legacy defaults: nofollow noreferrer / _blank when unset.
    const rel = node.rel ?? 'nofollow noreferrer'
    const target = node.target ?? '_blank'
    return `<a${attr('href', href)}${attr('rel', rel)}${attr('target', target)}>${children}</a>`
  }
  const rel = safeRel(node.target, node.rel)
  return `<a${attr('href', href)}${attr('rel', rel)}${attr('target', node.target)}${modeClsAttr(ctx, PT_INLINE.link)}>${children}</a>`
}

function renderMathInline(node: Extract<LexicalCommentInlineNode, { type: 'mathInline' }>, ctx: RenderContext): string {
  if (ctx.mode === 'email') {
    // Legacy form: TeX only, wrapped in `$…$` (MathML support in mail
    // clients is poor).
    return `<code>$${escapeHtml(node.tex)}$</code>`
  }
  const markup = renderMathMarkup(node.mathml, node.svg)
  if (markup !== undefined) {
    return `<span${clsAttr(MATH_INLINE_CLASS)}>${markup}</span>`
  }
  return `<span${clsAttr(MATH_INLINE_CLASS)}><code${clsAttr(PT_INLINE.mathTex)}>${escapeHtml(node.tex)}</code></span>`
}

// --- alignment -----------------------------------------------------------------

const ALIGN_CLASS = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const

/** Map a lexical element `format` to its text-align utility, `undefined` when unset. */
function alignClassOf(align: string | undefined): string | undefined {
  if (align === 'left' || align === 'center' || align === 'right') {
    return ALIGN_CLASS[align]
  }
  return undefined
}
