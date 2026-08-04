import type {
  LexicalBlockNode,
  LexicalBody,
  LexicalFootnoteDefinitionNode,
  LexicalHeadingNode,
  LexicalInlineNode,
  LexicalListItemNode,
  LexicalNonContainerBlockNode,
  LexicalParagraphNode,
  LexicalTableCellNode,
} from '@kobato/shared/lexical/schema'

import { safeRel } from '@kobato/editor/engine/lib/link'
import { sanitizeHtml } from '@kobato/editor/engine/lib/sanitize-html'
import {
  alignClass,
  BODY_WRAPPER_CLASS,
  codeLanguageClass,
  FOOTNOTES_HEADING_CLASS,
  FOOTNOTES_SECTION_CLASS,
  FOOTNOTES_SECTION_FALLBACK_TITLE,
  FOOTNOTE_BACKREF_CLASS,
  FOOTNOTE_BACKREF_TEXT,
  FOOTNOTE_REF_CLASS,
  HEADING_CLASS,
  IMAGE_FIGURE_CLASS,
  IMAGE_LAYOUT_CLASS,
  IMG_ASPECT_RATIO_STYLE,
  IMG_DECODING,
  IMG_DIM_CLASS,
  IMG_LOADING,
  IMG_SIZES,
  MATH_DISPLAY_CLASS,
  MATH_INLINE_CLASS,
  MUSIC_MISSING_PLACEHOLDER,
  MUSIC_WRAPPER_RENDERED_CLASS,
  PT_INLINE,
  SOLUTION_BEGIN_CLASS,
  SOLUTION_BEGIN_TEXT,
  SOLUTION_CLASS,
  SOLUTION_QED_CLASS,
  SOLUTION_QED_SVG,
  TABLE_CLASS,
  TABLE_WRAPPER_CLASS,
  TWO_COLUMN_CLASS,
  TWO_COLUMN_PANE_CLASS,
} from '@kobato/editor/lexical-html/manifest'
import {
  FOOTNOTE_BACKREF_ARIA_LABEL,
  FOOTNOTE_BACKREF_ATTRIBUTE,
  FOOTNOTES_SECTION_HEADING_ID,
  footnoteAnchorHref,
  footnoteAnchorId,
  footnoteRefHref,
  footnoteRefId,
} from '@kobato/shared/lexical/footnote-anchors'
import { sanitizeUrl } from '@kobato/shared/sanitize-url'
import { Slugger } from '@kobato/shared/slug'
import { escapeHtml } from '@kobato/shared/utils/security'

// Pure-JSON string renderer for `LexicalBody` — the server-side twin of
// `LexicalBody.tsx`. NO `@lexical/*` runtime and NO React: this module
// walks the plain EditorState JSON and emits the manifest contract
// (`./manifest`) as an HTML string, so feeds and other string sinks can
// render without a DOM or a component tree.
//
// Output contract per `mode`:
//   - `default` — full-class form, byte-identical to the React renderer
//     (except `img srcset`, which needs client asset settings, and the
//     music player body, which is a client APlayer widget in React vs.
//     the feed `<figure><audio>` form here)
//   - `rss`     — classless degraded form mirroring pt-html.ts's RSS
//     branch (math/code fall back to escaped TeX/text, twoColumn
//     concatenates, music keeps the figure+audio form)
//   - `email`   — classless form. PROVISIONAL: the comment-body renderer
//     this mode is meant to mirror does not exist yet (R5+); the current
//     semantics are "default structure minus class attributes", with
//     code escaped like RSS.
//
// Escaping follows React's SSR serializer so the two renderers agree
// byte-for-byte on text nodes: `&`, `<`, `>`, `"` are escaped in both
// text content and attribute values (`escapeHtml`).
//
// Heading anchors: heading slots are zipped against `headingSlugs` in
// `collectHeadingSlotsInLexicalRenderOrder` order (the renderer visits
// headings in exactly that order); a missing/empty slug falls back to a
// body-wide `Slugger` over the heading's plain text — the client-safe
// fallback, so SSR and hydration agree.

export type LexicalHtmlMode = 'default' | 'rss' | 'email'

/** Feed-shaped music metadata (name/artist/audio/cover — pt-html.ts's MusicMeta). */
export interface LexicalMusicMeta {
  name: string
  artist: string
  audioUrl: string
  cover: string
}

export interface LexicalBodyToHtmlOptions {
  /** Precomputed heading slugs in render order; missing entries fall back to a shared Slugger. */
  headingSlugs?: readonly string[]
  /** Music metadata resolver; `undefined` results render the feed placeholder. */
  musicMeta?: (playerId: string) => LexicalMusicMeta | undefined
  mode?: LexicalHtmlMode
  /** Footnotes section heading; defaults to `FOOTNOTES_SECTION_FALLBACK_TITLE`. */
  footnotesSectionTitle?: string
}

interface RenderContext {
  mode: LexicalHtmlMode
  headingSlugs: readonly string[]
  /** Mutable slot cursor — one heading slot per non-empty heading in render order. */
  headingSlotIndex: number
  /** Body-wide fallback slugger so duplicate plain texts dedup (`foo`, `foo-1`). */
  fallbackSlugger: Slugger
  musicMeta: LexicalBodyToHtmlOptions['musicMeta']
  footnotesSectionTitle: string
}

export function lexicalBodyToHtml(body: LexicalBody, options: LexicalBodyToHtmlOptions = {}): string {
  const mode = options.mode ?? 'default'
  const ctx: RenderContext = {
    mode,
    headingSlugs: options.headingSlugs ?? [],
    headingSlotIndex: 0,
    fallbackSlugger: new Slugger(),
    musicMeta: options.musicMeta,
    footnotesSectionTitle:
      options.footnotesSectionTitle !== undefined && options.footnotesSectionTitle.trim().length > 0
        ? options.footnotesSectionTitle.trim()
        : FOOTNOTES_SECTION_FALLBACK_TITLE,
  }

  const definitions: LexicalFootnoteDefinitionNode[] = []
  const blocks: LexicalBlockNode[] = []
  for (const block of body.root.children) {
    if (block.type === 'footnoteDefinition') {
      definitions.push(block)
    } else {
      blocks.push(block)
    }
  }

  const main = blocks.map((block) => renderBlock(block, ctx)).join('')
  const footnotes = definitions.length > 0 ? renderFootnotesSection(definitions, ctx) : ''

  if (mode === 'default') {
    return `<div class="${BODY_WRAPPER_CLASS}">${main}${footnotes}</div>`
  }
  return main + footnotes
}

// --- attribute helpers --------------------------------------------------------
//
// `escapeHtml` escapes `& < > "` — the same set React's SSR serializer
// applies to both text content and attribute values, so string and React
// outputs agree byte-for-byte.

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

/** Blocks the renderer recurses into: root-level blocks plus list items (list ⇄ listitem). */
type RenderableBlock = LexicalBlockNode | LexicalListItemNode

function renderBlock(node: RenderableBlock, ctx: RenderContext): string {
  switch (node.type) {
    case 'paragraph':
      return `<p${modeClsAttr(ctx, alignClass(node.format))}>${renderInlines(node.children, ctx)}</p>`
    case 'heading':
      return renderHeading(node, ctx)
    case 'quote':
      return `<blockquote${modeClsAttr(ctx, alignClass(node.format))}>${node.children
        .map((child) => renderBlock(child, ctx))
        .join('')}</blockquote>`
    case 'list':
      return `<${node.tag}>${node.children.map((child) => renderBlock(child, ctx)).join('')}</${node.tag}>`
    case 'listitem':
      return `<li>${node.children
        .map((child) => {
          if (child.type === 'list') {
            return renderBlock(child, ctx)
          }
          if (child.type === 'paragraph') {
            // The PT-mapping / pre-canonical paragraph alias.
            return renderBlock(child, ctx)
          }
          // The 0.45 runtime shape: inline children directly in the item
          // (canonicalization flattens the paragraph alias away).
          return renderInline(child, ctx)
        })
        .join('')}</li>`
    case 'code':
      return renderCode(node, ctx)
    case 'image':
      return renderImage(node, ctx)
    case 'mathBlock':
      return renderMathBlock(node, ctx)
    case 'musicPlayer':
      return renderMusicPlayer(node, ctx)
    case 'horizontalrule':
      return '<hr/>'
    case 'table':
      return renderTable(node, ctx)
    case 'solution':
      return renderSolution(node, ctx)
    case 'twoColumn':
      return renderTwoColumn(node, ctx)
    case 'footnoteDefinition':
      // Definitions are collected at the top level and rendered in the
      // footnotes section — never inline (schema also forbids nesting).
      return ''
    default:
      // Defense-in-depth: the zod gate rejects unknown node types, but a
      // hand-crafted body that bypasses it must not leak `undefined` text.
      return ''
  }
}

function renderHeading(node: LexicalHeadingNode, ctx: RenderContext): string {
  const id = takeHeadingId(node, ctx)
  const cls = [HEADING_CLASS, alignClass(node.format)].filter((part): part is string => part !== undefined).join(' ')
  const idAttr = id === '' ? '' : attr('id', id)
  return `<${node.tag}${idAttr}${modeClsAttr(ctx, cls)}>${renderInlines(node.children, ctx)}</${node.tag}>`
}

/**
 * Consume the next heading slot. Empty-text headings are NOT slots
 * (`collectHeadingSlotsInLexicalRenderOrder` skips them), so they never
 * advance the cursor and get no id.
 */
function takeHeadingId(node: LexicalHeadingNode, ctx: RenderContext): string {
  const plainText = inlineText(node.children).trim()
  if (plainText.length === 0) {
    return ''
  }
  const pre = ctx.headingSlugs[ctx.headingSlotIndex]
  ctx.headingSlotIndex += 1
  if (typeof pre === 'string' && pre.length > 0) {
    return pre
  }
  return ctx.fallbackSlugger.slug(plainText)
}

/** Plain-text projection of inline nodes — same semantics as `walk.ts`'s private helper. */
function inlineText(nodes: readonly LexicalInlineNode[]): string {
  let out = ''
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        out += node.text
        break
      case 'linebreak':
        out += '\n'
        break
      case 'link':
        out += inlineText(node.children)
        break
      case 'footnoteRef':
        out += String(node.index)
        break
      case 'mathInline':
        // The PT span text behind mathInline is empty; contribute nothing.
        break
    }
  }
  return out
}

function renderCode(node: Extract<LexicalNonContainerBlockNode, { type: 'code' }>, ctx: RenderContext): string {
  // Server prerender artifact (`code.highlightedHtml`, Shiki) renders only
  // in default mode — sanitized through the same 'shiki' gate the React
  // renderer applies. RSS/email fall back to plain escaped text (feed
  // readers drop CDATA anyway; mail clients strip classes), mirroring
  // pt-html.ts's RSS branch.
  const text = node.children.map((child) => child.text).join('')
  const language = node.language
  const langClass = codeLanguageClass(language)
  if (ctx.mode === 'default' && node.highlightedHtml !== undefined && node.highlightedHtml !== '') {
    return `<pre><code${clsAttr(langClass)}${attr('data-language', language)}>${sanitizeHtml(node.highlightedHtml, 'shiki')}</code></pre>`
  }
  return `<pre><code${clsAttr(langClass)}${attr('data-language', language)}>${escapeHtml(text)}</code></pre>`
}

function renderImage(node: Extract<LexicalNonContainerBlockNode, { type: 'image' }>, ctx: RenderContext): string {
  if (ctx.mode === 'rss') {
    // pt-html.ts's feed form: bare figure, alt/width/height only when set.
    return `<figure><img${attr('src', node.src)}${attr('alt', node.alt !== undefined && node.alt !== '' ? node.alt : undefined)}${
      attr('width', node.width) + attr('height', node.height)
    }/>${renderFigcaption(node.caption)}</figure>`
  }
  // default / email — BlockImage's SSR contract minus `srcset` (client
  // asset settings) and the thumbhash `style` (client-side decode). The
  // attribute ORDER mirrors React's serialization of BlockImage's props
  // (oxc-compiled JSX reorders the duplicate width/height/alt after the
  // spread): src, width, height, data-thumbhash, alt, loading, decoding,
  // sizes, class, style.
  const layoutClass = node.layout !== undefined ? IMAGE_LAYOUT_CLASS[node.layout] : undefined
  const figureClass = ctx.mode === 'default' ? clsAttr(`${IMAGE_FIGURE_CLASS} ${layoutClass ?? ''}`.trim()) : ''
  const hasWidth = typeof node.width === 'number' && node.width > 0
  const style = hasWidth ? '' : attr('style', IMG_ASPECT_RATIO_STYLE)
  const img = `<img${attr('src', node.src)}${attr('width', node.width)}${attr('height', node.height)}${
    attr('data-thumbhash', node.thumbhash) + attr('alt', node.alt ?? '')
  }${attr('loading', ctx.mode === 'default' ? IMG_LOADING : undefined)}${attr('decoding', ctx.mode === 'default' ? IMG_DECODING : undefined)}${
    attr('sizes', ctx.mode === 'default' ? IMG_SIZES : undefined) +
    (ctx.mode === 'default' ? clsAttr(IMG_DIM_CLASS) : '')
  }${style}/>`
  return `<figure${figureClass}>${img}${renderFigcaption(node.caption)}</figure>`
}

function renderFigcaption(caption: string | undefined): string {
  return caption !== undefined && caption !== '' ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''
}

function renderMathBlock(
  node: Extract<LexicalNonContainerBlockNode, { type: 'mathBlock' }>,
  ctx: RenderContext,
): string {
  const markup = renderMathMarkup(node.tex, node.mathml, node.svg, ctx)
  if (markup !== undefined) {
    // React preference order: mathml first, then legacy svg.
    return ctx.mode === 'default' ? `<div${clsAttr(MATH_DISPLAY_CLASS)}>${markup}</div>` : `<div>${markup}</div>`
  }
  if (ctx.mode === 'rss') {
    return `<pre><code>${escapeHtml(node.tex)}</code></pre>`
  }
  return `<pre${ctx.mode === 'default' ? clsAttr('math math-display') : ''}><code>${escapeHtml(node.tex)}</code></pre>`
}

/** Sanitized mathml/svg fragment, or `undefined` when the node has none. */
function renderMathMarkup(
  tex: string,
  mathml: string | undefined,
  svg: string | undefined,
  ctx: RenderContext,
): string | undefined {
  if (ctx.mode === 'rss') {
    // Feed readers cannot safely consume raw MathML/SVG — pt-html.ts's
    // RSS branch always falls back to plain TeX inside `<code>`.
    return undefined
  }
  const markup = mathml !== undefined && mathml !== '' ? mathml : svg
  if (markup === undefined || markup === '') {
    return undefined
  }
  // The 'math' strategy whitelists MathML tags/attributes and strips
  // active content — same gate as the React renderer.
  return sanitizeHtml(markup, 'math')
}

function renderMusicPlayer(
  node: Extract<LexicalNonContainerBlockNode, { type: 'musicPlayer' }>,
  ctx: RenderContext,
): string {
  const meta = ctx.musicMeta?.(node.playerId)
  if (meta === undefined) {
    return `<p>${MUSIC_MISSING_PLACEHOLDER}</p>`
  }
  const figure = `<figure><img${attr('src', meta.cover)}${attr('alt', meta.name)}/><audio controls preload="none"${attr(
    'src',
    meta.audioUrl,
  )}></audio><figcaption>🎵 ${escapeHtml(meta.name)} — ${escapeHtml(meta.artist)}</figcaption></figure>`
  if (ctx.mode !== 'default') {
    return figure
  }
  // default mode wraps the feed form in the wrapper class MusicPlayer
  // actually renders (see MUSIC_WRAPPER_RENDERED_CLASS — the component's
  // truthy-alignment quirk means every player gets the centered classes).
  return `<div${clsAttr(MUSIC_WRAPPER_RENDERED_CLASS)}>${figure}</div>`
}

// Table: the first row becomes `<thead>` when EVERY cell carries the
// row-header bit (headerState 1) — the shape `mapTable` produces for PT's
// `hasHeaderRow`. Body cells render `<th>` when they carry the
// column-header bit (2). colSpan/rowSpan surface only when > 1 (the PT
// mapping always emits 1). Cells render their paragraph children's inline
// content concatenated — no `<p>` wrapper, matching the PT cell contract.
function renderTable(node: Extract<LexicalNonContainerBlockNode, { type: 'table' }>, ctx: RenderContext): string {
  const rows = node.children
  const firstRow = rows[0]
  const hasHeaderRow = firstRow !== undefined && firstRow.children.every((cell) => (cell.headerState & 1) !== 0)
  const headRows = hasHeaderRow ? rows.slice(0, 1) : []
  const bodyRows = hasHeaderRow ? rows.slice(1) : rows

  let inner = ''
  if (headRows.length > 0) {
    inner += '<thead>'
    for (const row of headRows) {
      inner += `<tr>${row.children.map((cell) => renderCell(cell, ctx, 'th')).join('')}</tr>`
    }
    inner += '</thead>'
  }
  inner += '<tbody>'
  for (const row of bodyRows) {
    inner += `<tr>${row.children.map((cell) => renderCell(cell, ctx, (cell.headerState & 2) !== 0 ? 'th' : 'td')).join('')}</tr>`
  }
  inner += '</tbody>'

  if (ctx.mode === 'default') {
    return `<div${clsAttr(TABLE_WRAPPER_CLASS)}><table${clsAttr(TABLE_CLASS)}>${inner}</table></div>`
  }
  return `<table>${inner}</table>`
}

function renderCell(cell: LexicalTableCellNode, ctx: RenderContext, tag: 'th' | 'td'): string {
  // React 19 serializes the camelCase prop names (`colSpan`/`rowSpan`) as-is.
  const spans = cell.colSpan > 1 ? attr('colSpan', cell.colSpan) : ''
  const rowspan = cell.rowSpan > 1 ? attr('rowSpan', cell.rowSpan) : ''
  const inline = cell.children.map((paragraph) => renderInlines(paragraph.children, ctx)).join('')
  return `<${tag}${spans}${rowspan}>${inline}</${tag}>`
}

function renderSolution(node: Extract<LexicalBlockNode, { type: 'solution' }>, ctx: RenderContext): string {
  if (ctx.mode === 'rss') {
    // pt-html.ts's RSS branch renders the children bare — no wrapper.
    return node.children.map((child) => renderBlock(child, ctx)).join('')
  }
  const children = node.children.map((child) => renderBlock(child, ctx)).join('')
  if (ctx.mode === 'email') {
    return `<blockquote><div>${SOLUTION_BEGIN_TEXT}</div>${children}<span aria-hidden="true">${SOLUTION_QED_SVG}</span></blockquote>`
  }
  return (
    `<blockquote${clsAttr(SOLUTION_CLASS)}><div${clsAttr(SOLUTION_BEGIN_CLASS)}>${SOLUTION_BEGIN_TEXT}</div>${children}` +
    `<span${clsAttr(SOLUTION_QED_CLASS)} aria-hidden="true">${SOLUTION_QED_SVG}</span></blockquote>`
  )
}

function renderTwoColumn(node: Extract<LexicalBlockNode, { type: 'twoColumn' }>, ctx: RenderContext): string {
  const [leftPane, rightPane] = node.children
  const renderPane = (pane: (typeof node.children)[number]): string =>
    pane.children.map((child) => renderBlock(child, ctx)).join('')
  if (ctx.mode === 'rss') {
    // pt-html.ts's RSS branch concatenates the panes — no wrapper.
    return renderPane(leftPane) + renderPane(rightPane)
  }
  const paneClass = ctx.mode === 'default' ? clsAttr(TWO_COLUMN_PANE_CLASS) : ''
  const left = `<div${paneClass} data-pt-two-column-pane="" data-side="left">${renderPane(leftPane)}</div>`
  const right = `<div${paneClass} data-pt-two-column-pane="" data-side="right">${renderPane(rightPane)}</div>`
  return `<section${modeClsAttr(ctx, TWO_COLUMN_CLASS)} data-pt-two-column="">${left}${right}</section>`
}

// --- inline rendering ---------------------------------------------------------

function renderInlines(nodes: readonly LexicalInlineNode[], ctx: RenderContext): string {
  return nodes.map((node) => renderInline(node, ctx)).join('')
}

function renderInline(node: LexicalInlineNode, ctx: RenderContext): string {
  switch (node.type) {
    case 'text': {
      let out = escapeHtml(node.text)
      // Decorator marks fold into the format bitmask (PT_DECORATOR_TO_FORMAT_BIT);
      // wrap in ascending bit order — the deterministic render order.
      const cls = (clsName: string): string => (ctx.mode === 'default' ? clsAttr(clsName) : '')
      if ((node.format & 1) !== 0) {
        out = `<strong${cls(PT_INLINE.strong)}>${out}</strong>`
      }
      if ((node.format & 2) !== 0) {
        out = `<em${cls(PT_INLINE.em)}>${out}</em>`
      }
      if ((node.format & 4) !== 0) {
        out = `<s${cls(PT_INLINE.strike)}>${out}</s>`
      }
      if ((node.format & 8) !== 0) {
        out = `<u${cls(PT_INLINE.underline)}>${out}</u>`
      }
      if ((node.format & 16) !== 0) {
        out = `<code${cls(PT_INLINE.code)}>${out}</code>`
      }
      return out
    }
    case 'linebreak':
      return '<br/>'
    case 'link':
      return renderLink(node, ctx)
    case 'mathInline':
      return renderMathInline(node, ctx)
    case 'footnoteRef':
      return renderFootnoteRef(node, ctx)
  }
}

function renderLink(node: Extract<LexicalInlineNode, { type: 'link' }>, ctx: RenderContext): string {
  // Defense-in-depth: never emit executable JavaScript or data URLs even
  // if the gate is bypassed. `sanitizeUrl` also strips C0 control chars.
  const href = sanitizeUrl(node.url)
  const rel = safeRel(node.target, node.rel)
  const children = renderInlines(node.children, ctx)
  return `<a${attr('href', href)}${attr('rel', rel)}${attr('target', node.target)}${modeClsAttr(ctx, PT_INLINE.link)}>${children}</a>`
}

function renderMathInline(node: Extract<LexicalInlineNode, { type: 'mathInline' }>, ctx: RenderContext): string {
  if (ctx.mode === 'rss') {
    return `<code>${escapeHtml(node.tex)}</code>`
  }
  const markup = renderMathMarkup(node.tex, node.mathml, node.svg, ctx)
  if (markup !== undefined) {
    return ctx.mode === 'default' ? `<span${clsAttr(MATH_INLINE_CLASS)}>${markup}</span>` : `<span>${markup}</span>`
  }
  const code =
    ctx.mode === 'default'
      ? `<code${clsAttr(PT_INLINE.mathTex)}>${escapeHtml(node.tex)}</code>`
      : `<code>${escapeHtml(node.tex)}</code>`
  return ctx.mode === 'default' ? `<span${clsAttr(MATH_INLINE_CLASS)}>${code}</span>` : `<span>${code}</span>`
}

function renderFootnoteRef(node: Extract<LexicalInlineNode, { type: 'footnoteRef' }>, ctx: RenderContext): string {
  const index = node.index
  if (ctx.mode === 'rss') {
    return `<sup><a${attr('href', footnoteAnchorHref(index))}>${index}</a></sup>`
  }
  return (
    `<sup${attr('id', footnoteRefId(index))} data-footnote-ref=""><a${attr('href', footnoteAnchorHref(index))}` +
    `${modeClsAttr(ctx, FOOTNOTE_REF_CLASS)}>${index}</a></sup>`
  )
}

// --- footnotes section --------------------------------------------------------

function renderFootnotesSection(definitions: readonly LexicalFootnoteDefinitionNode[], ctx: RenderContext): string {
  const heading = ctx.mode === 'default' ? clsAttr(FOOTNOTES_HEADING_CLASS) : ''
  const sectionClass = ctx.mode === 'default' ? clsAttr(FOOTNOTES_SECTION_CLASS) : ''
  let html =
    `<section${sectionClass} data-footnotes="" aria-labelledby="${FOOTNOTES_SECTION_HEADING_ID}">` +
    `<h3${attr('id', FOOTNOTES_SECTION_HEADING_ID)}${heading}>${escapeHtml(ctx.footnotesSectionTitle)}</h3><ol>`
  for (const definition of definitions) {
    html += `<li${attr('id', footnoteAnchorId(definition.index))}>${renderDefinitionChildren(definition, ctx)}</li>`
  }
  html += '</ol></section>'
  return html
}

/** Definition children with the back-reference appended to the LAST paragraph (top-level only). */
function renderDefinitionChildren(definition: LexicalFootnoteDefinitionNode, ctx: RenderContext): string {
  const children = definition.children
  const lastParagraph = lastParagraphIn(children)
  if (lastParagraph === null) {
    return children.map((child) => renderBlock(child, ctx)).join('') + renderBackrefParagraph(definition.index, ctx)
  }
  const backref = renderBackrefLink(definition.index, ctx)
  return children
    .map((child) => {
      if (child !== lastParagraph) {
        return renderBlock(child, ctx)
      }
      return `<p${modeClsAttr(ctx, alignClass(lastParagraph.format))}>${renderInlines(lastParagraph.children, ctx)}${backref}</p>`
    })
    .join('')
}

function isParagraphNode(node: LexicalNonContainerBlockNode): node is LexicalParagraphNode {
  return node.type === 'paragraph'
}

/** The definition's last top-level paragraph, or null when there is none (the backref then gets its own `<p>`). */
function lastParagraphIn(children: readonly LexicalNonContainerBlockNode[]): LexicalParagraphNode | null {
  for (let i = children.length - 1; i >= 0; i -= 1) {
    const child = children[i]!
    if (isParagraphNode(child)) {
      return child
    }
  }
  return null
}

function renderBackrefParagraph(index: number, ctx: RenderContext): string {
  return `<p>${renderBackrefLink(index, ctx)}</p>`
}

function renderBackrefLink(index: number, ctx: RenderContext): string {
  return (
    `<a${attr('href', footnoteRefHref(index))} ${FOOTNOTE_BACKREF_ATTRIBUTE}=""${attr('aria-label', FOOTNOTE_BACKREF_ARIA_LABEL)}` +
    `${modeClsAttr(ctx, FOOTNOTE_BACKREF_CLASS)}>${FOOTNOTE_BACKREF_TEXT}</a>`
  )
}
