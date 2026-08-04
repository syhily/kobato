import type {
  LexicalBlockNode,
  LexicalBody,
  LexicalFootnoteDefinitionNode,
  LexicalHeadingNode,
  LexicalInlineNode,
  LexicalLinkNode,
  LexicalListItemNode,
  LexicalNonContainerBlockNode,
  LexicalParagraphNode,
  LexicalTableCellNode,
  LexicalTextNode,
} from '@kobato/shared/lexical/schema'
import type { MusicPlayerBlockMeta } from '@kobato/shared/types/music'

import { cn } from '@kobato/editor/engine/lib/cn'
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
  PT_INLINE,
  TABLE_CLASS,
  TABLE_WRAPPER_CLASS,
  TWO_COLUMN_CLASS,
  TWO_COLUMN_PANE_CLASS,
} from '@kobato/editor/lexical-html/manifest'
import { BlockImage } from '@kobato/editor/renderer/blocks/BlockImage'
import { CodeBlock as CodeBlockComponent } from '@kobato/editor/renderer/blocks/CodeBlock'
import { MusicPlayer } from '@kobato/editor/renderer/blocks/MusicPlayer'
import { Solution } from '@kobato/editor/renderer/blocks/Solution'
import { FootnotePreviewRegistrar, FootnoteProvider, FootnoteReference } from '@kobato/editor/renderer/Footnotes'
import { ImageMetaProvider, type ImageMetaMap } from '@kobato/editor/renderer/image-meta-context'
import { renderMathMarkupOrTexFallback } from '@kobato/editor/renderer/render-marks'
import { MusicPresentationContext } from '@kobato/editor/renderer/render-shared'
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
import { useMemo, type ElementType, type ReactNode } from 'react'

// React tree renderer for `LexicalBody` — the client/SSR twin of the
// string renderer in `./lexicalBodyToHtml`. Pure JSON traversal over the
// EditorState (NO `@lexical/*` runtime): the same manifest constants the
// string renderer uses, so both adapters emit the same HTML contract.
// Interactive chrome that only makes sense in a React tree (the code
// copy button, the APlayer music widget, footnote preview tooltips)
// renders as its component here and as its feed form in the string
// renderer — the one deliberate structural divergence (see the module
// doc of `lexicalBodyToHtml.ts`).
//
// Heading anchors are assigned by RENDER POSITION: the renderer consumes
// one slot per non-empty heading in `collectHeadingSlotsInLexicalRenderOrder`
// order against `headingSlugs`; missing entries fall back to a body-wide
// `Slugger` (the client-safe fallback, so SSR and hydration agree).
//
// oxlint-disable react/no-array-index-key -- static-document renderer: every
// mapped list below is a fresh positional pass over an immutable serialized
// EditorState that never reorders or filters (blocks/inlines carry no stable
// key field in the dialect), so the array index IS the stable reconciliation
// identity — the renderer rebuilds the whole tree per render anyway. Index
// keys would only be wrong for a list that moves items across renders.

export interface LexicalBodyProps {
  body: LexicalBody
  /** Optional thumbhash/dimension hydration map keyed by image src (route loader). */
  imageMeta?: ImageMetaMap
  /** Precomputed heading slugs in render order. */
  headingSlugs?: readonly string[]
  musicAutoplay?: 'suppressed' | 'default'
  footnotesSectionTitle?: string
  /** Music metadata resolver; `undefined` results render the placeholder player. */
  musicMeta?: (playerId: string) => MusicPlayerBlockMeta | undefined
}

interface RenderContext {
  headingSlugs: readonly string[]
  /** Mutable slot cursor — one heading slot per non-empty heading in render order. */
  headingSlotIndex: number
  /** Body-wide fallback slugger so duplicate plain texts dedup (`foo`, `foo-1`). */
  fallbackSlugger: Slugger
  musicMeta: LexicalBodyProps['musicMeta']
  suppressAutoplay: boolean
  footnotesSectionTitle: string
}

export function LexicalBody({
  body,
  imageMeta,
  headingSlugs,
  musicAutoplay,
  footnotesSectionTitle,
  musicMeta,
}: LexicalBodyProps) {
  // The context object is rebuilt per render on purpose: the heading
  // slot cursor is per-pass state, and a stale cursor (from a previous
  // render pass) would mis-assign anchors after re-renders.
  const ctx: RenderContext = {
    headingSlugs: headingSlugs ?? [],
    headingSlotIndex: 0,
    fallbackSlugger: new Slugger(),
    musicMeta,
    suppressAutoplay: musicAutoplay === 'suppressed',
    footnotesSectionTitle:
      footnotesSectionTitle !== undefined && footnotesSectionTitle.trim().length > 0
        ? footnotesSectionTitle.trim()
        : FOOTNOTES_SECTION_FALLBACK_TITLE,
  }

  const musicPresentation = useMemo(() => ({ suppressAutoplay: musicAutoplay === 'suppressed' }), [musicAutoplay])

  const definitions: LexicalFootnoteDefinitionNode[] = []
  const blocks: LexicalBlockNode[] = []
  for (const block of body.root.children) {
    if (block.type === 'footnoteDefinition') {
      definitions.push(block)
    } else {
      blocks.push(block)
    }
  }

  return (
    <ImageMetaProvider value={imageMeta}>
      <MusicPresentationContext value={musicPresentation}>
        <FootnoteProvider>
          <div className={BODY_WRAPPER_CLASS}>
            {blocks.map((block, index) => (
              <FragmentBlock key={index} block={block} ctx={ctx} />
            ))}
            {definitions.length > 0 ? <FootnotesSection definitions={definitions} ctx={ctx} /> : null}
          </div>
        </FootnoteProvider>
      </MusicPresentationContext>
    </ImageMetaProvider>
  )
}

// A tiny element wrapper lets the block renderers stay plain functions
// while still receiving stable keys from the array mappers.
function FragmentBlock({ block, ctx }: { block: RenderableBlock; ctx: RenderContext }): ReactNode {
  return renderBlock(block, ctx)
}

// --- block rendering ----------------------------------------------------------

/** Blocks the renderer recurses into: root-level blocks, list items (list ⇄ listitem), and the runtime inline children of canonical list items. */
type RenderableBlock = LexicalBlockNode | LexicalListItemNode | LexicalInlineNode

function renderBlock(node: RenderableBlock, ctx: RenderContext): ReactNode {
  switch (node.type) {
    case 'paragraph':
      return <p className={alignClass(node.format)}>{renderInlines(node.children, ctx)}</p>
    case 'heading':
      return renderHeading(node, ctx)
    case 'quote':
      return (
        <blockquote className={alignClass(node.format)}>
          {node.children.map((child, index) => (
            <FragmentBlock key={index} block={child} ctx={ctx} />
          ))}
        </blockquote>
      )
    case 'list':
      return node.tag === 'ul' ? (
        <ul>
          {node.children.map((child, index) => (
            <FragmentBlock key={index} block={child} ctx={ctx} />
          ))}
        </ul>
      ) : (
        <ol>
          {node.children.map((child, index) => (
            <FragmentBlock key={index} block={child} ctx={ctx} />
          ))}
        </ol>
      )
    case 'listitem':
      return (
        <li>
          {node.children.map((child, index) => {
            if (child.type === 'paragraph' || child.type === 'list') {
              return <FragmentBlock key={index} block={child} ctx={ctx} />
            }
            // The 0.45 runtime shape: inline children directly in the item.
            return <FragmentBlock key={index} block={child} ctx={ctx} />
          })}
        </li>
      )
    case 'code':
      return renderCode(node, ctx)
    case 'image':
      return renderImage(node)
    case 'mathBlock':
      return renderMathMarkupOrTexFallback(node.tex, node.mathml, node.svg, 'display')
    case 'musicPlayer':
      return renderMusicPlayer(node, ctx)
    case 'horizontalrule':
      return <hr />
    case 'table':
      return renderTable(node, ctx)
    case 'solution':
      return (
        <Solution>
          {node.children.map((child, index) => (
            <FragmentBlock key={index} block={child} ctx={ctx} />
          ))}
        </Solution>
      )
    case 'twoColumn':
      return renderTwoColumn(node, ctx)
    case 'text':
    case 'linebreak':
    case 'link':
    case 'mathInline':
    case 'footnoteRef':
      // The 0.45 runtime shape: canonical list items hold inline children
      // directly (the paragraph alias was flattened by canonicalization).
      return renderInline(node, ctx)
    case 'footnoteDefinition':
      // Definitions are collected at the top level and rendered in the
      // footnotes section — never inline (schema also forbids nesting).
      return null
  }
}

function renderHeading(node: LexicalHeadingNode, ctx: RenderContext): ReactNode {
  const id = takeHeadingId(node, ctx)
  const Tag = node.tag as ElementType
  return (
    <Tag id={id === '' ? undefined : id} className={cn(HEADING_CLASS, alignClass(node.format))}>
      {renderInlines(node.children, ctx)}
    </Tag>
  )
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

function renderCode(node: Extract<LexicalNonContainerBlockNode, { type: 'code' }>, _ctx: RenderContext): ReactNode {
  const text = node.children.map((child) => child.text).join('')
  const language = node.language
  const langClass = codeLanguageClass(language)
  if (node.highlightedHtml !== undefined && node.highlightedHtml !== '') {
    // Server prerender artifact (Shiki) — the PT-era CodeBlockNodeComponent
    // contract: inject the sanitized highlight through CodeBlock's
    // dangerouslySetInnerHTML branch (the copy button copies the plain
    // text). Mirrors the string renderer's default-mode branch.
    return (
      <CodeBlockComponent
        className={langClass}
        copyText={text}
        data-language={language}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(node.highlightedHtml, 'shiki') }}
      />
    )
  }
  return (
    <CodeBlockComponent>
      <code className={langClass} data-language={language}>
        {text}
      </code>
    </CodeBlockComponent>
  )
}

function renderImage(node: Extract<LexicalNonContainerBlockNode, { type: 'image' }>): ReactNode {
  const layoutClass = node.layout !== undefined ? IMAGE_LAYOUT_CLASS[node.layout] : undefined
  return (
    <figure className={cn(IMAGE_FIGURE_CLASS, layoutClass)}>
      <BlockImage
        src={node.src}
        alt={node.alt ?? ''}
        width={node.width}
        height={node.height}
        data-thumbhash={node.thumbhash}
      />
      {node.caption !== undefined && node.caption !== '' ? <figcaption>{node.caption}</figcaption> : null}
    </figure>
  )
}

function renderMusicPlayer(
  node: Extract<LexicalNonContainerBlockNode, { type: 'musicPlayer' }>,
  ctx: RenderContext,
): ReactNode {
  return (
    <MusicPlayer
      id={node.playerId}
      meta={ctx.musicMeta?.(node.playerId)}
      auto={ctx.suppressAutoplay ? false : node.auto === true}
      alignment={node.center === true ? 'center' : 'start'}
    />
  )
}

function renderTwoColumn(node: Extract<LexicalBlockNode, { type: 'twoColumn' }>, ctx: RenderContext): ReactNode {
  const [leftPane, rightPane] = node.children
  const renderPane = (pane: (typeof node.children)[number], side: 'left' | 'right'): ReactNode => (
    <div className={cn(TWO_COLUMN_PANE_CLASS)} data-pt-two-column-pane="" data-side={side}>
      {pane.children.map((child, index) => (
        <FragmentBlock key={index} block={child} ctx={ctx} />
      ))}
    </div>
  )
  return (
    <section className={cn(TWO_COLUMN_CLASS)} data-pt-two-column="">
      {renderPane(leftPane, 'left')}
      {renderPane(rightPane, 'right')}
    </section>
  )
}

// Table: the first row becomes `<thead>` when EVERY cell carries the
// row-header bit (headerState 1) — the shape `mapTable` produces for PT's
// `hasHeaderRow`. Body cells render `<th>` when they carry the
// column-header bit (2). colSpan/rowSpan surface only when > 1. Cells
// render their paragraph children's inline content concatenated — no
// `<p>` wrapper, matching the PT cell contract.
function renderTable(node: Extract<LexicalNonContainerBlockNode, { type: 'table' }>, ctx: RenderContext): ReactNode {
  const rows = node.children
  const firstRow = rows[0]
  const hasHeaderRow = firstRow !== undefined && firstRow.children.every((cell) => (cell.headerState & 1) !== 0)
  const headRows = hasHeaderRow ? rows.slice(0, 1) : []
  const bodyRows = hasHeaderRow ? rows.slice(1) : rows

  return (
    <div className={cn(TABLE_WRAPPER_CLASS)}>
      <table className={cn(TABLE_CLASS)}>
        {headRows.length > 0 ? (
          <thead>
            {headRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.children.map((cell, cellIndex) => (
                  <th key={cellIndex} {...spanProps(cell)}>
                    {renderCellContent(cell, ctx)}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
        ) : null}
        <tbody>
          {bodyRows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.children.map((cell, cellIndex) => {
                const Tag = (cell.headerState & 2) !== 0 ? 'th' : 'td'
                return (
                  <Tag key={cellIndex} {...spanProps(cell)}>
                    {renderCellContent(cell, ctx)}
                  </Tag>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function spanProps(cell: LexicalTableCellNode): { colSpan?: number; rowSpan?: number } {
  return {
    ...(cell.colSpan > 1 ? { colSpan: cell.colSpan } : {}),
    ...(cell.rowSpan > 1 ? { rowSpan: cell.rowSpan } : {}),
  }
}

function renderCellContent(cell: LexicalTableCellNode, ctx: RenderContext): ReactNode {
  return cell.children.map((paragraph, index) => <FragmentInline key={index} nodes={paragraph.children} ctx={ctx} />)
}

// --- inline rendering ---------------------------------------------------------

function FragmentInline({ nodes, ctx }: { nodes: readonly LexicalInlineNode[]; ctx: RenderContext }): ReactNode {
  return renderInlines(nodes, ctx)
}

function renderInlines(nodes: readonly LexicalInlineNode[], ctx: RenderContext): ReactNode {
  return nodes.map((node, index) => <FragmentInlineNode key={index} node={node} ctx={ctx} />)
}

function FragmentInlineNode({ node, ctx }: { node: LexicalInlineNode; ctx: RenderContext }): ReactNode {
  return renderInline(node, ctx)
}

function renderInline(node: LexicalInlineNode, ctx: RenderContext): ReactNode {
  switch (node.type) {
    case 'text':
      return renderTextNode(node)
    case 'linebreak':
      return <br />
    case 'link':
      return renderLink(node, ctx)
    case 'mathInline':
      return renderMathMarkupOrTexFallback(node.tex, node.mathml, node.svg, 'inline')
    case 'footnoteRef':
      return (
        <FootnoteReference id={footnoteRefId(node.index)} data-footnote-ref="">
          <a href={footnoteAnchorHref(node.index)} className={FOOTNOTE_REF_CLASS}>
            {node.index}
          </a>
        </FootnoteReference>
      )
  }
}

function renderTextNode(node: LexicalTextNode): ReactNode {
  // Decorator marks fold into the format bitmask (PT_DECORATOR_TO_FORMAT_BIT);
  // wrap in ascending bit order — the deterministic render order.
  let out: ReactNode = node.text
  if ((node.format & 1) !== 0) {
    out = <strong className={PT_INLINE.strong}>{out}</strong>
  }
  if ((node.format & 2) !== 0) {
    out = <em className={PT_INLINE.em}>{out}</em>
  }
  if ((node.format & 4) !== 0) {
    out = <s className={PT_INLINE.strike}>{out}</s>
  }
  if ((node.format & 8) !== 0) {
    out = <u className={PT_INLINE.underline}>{out}</u>
  }
  if ((node.format & 16) !== 0) {
    out = <code className={PT_INLINE.code}>{out}</code>
  }
  return out
}

function renderLink(node: LexicalLinkNode, ctx: RenderContext): ReactNode {
  // Defense-in-depth: never emit executable JavaScript or data URLs even
  // if the gate is bypassed. `sanitizeUrl` also strips C0 control chars.
  return (
    <a
      href={sanitizeUrl(node.url)}
      rel={safeRel(node.target, node.rel)}
      target={node.target ?? undefined}
      className={PT_INLINE.link}
    >
      {renderInlines(node.children, ctx)}
    </a>
  )
}

// --- footnotes section --------------------------------------------------------

function FootnoteBackrefLink({ footnoteIndex }: { footnoteIndex: number }) {
  return (
    <a
      href={footnoteRefHref(footnoteIndex)}
      {...{ [FOOTNOTE_BACKREF_ATTRIBUTE]: '' }}
      aria-label={FOOTNOTE_BACKREF_ARIA_LABEL}
      className={FOOTNOTE_BACKREF_CLASS}
    >
      {FOOTNOTE_BACKREF_TEXT}
    </a>
  )
}

function FootnotesSection({
  definitions,
  ctx,
}: {
  definitions: readonly LexicalFootnoteDefinitionNode[]
  ctx: RenderContext
}): ReactNode {
  return (
    <section className={FOOTNOTES_SECTION_CLASS} data-footnotes="" aria-labelledby={FOOTNOTES_SECTION_HEADING_ID}>
      <h3 id={FOOTNOTES_SECTION_HEADING_ID} className={FOOTNOTES_HEADING_CLASS}>
        {ctx.footnotesSectionTitle}
      </h3>
      <ol>
        {definitions.map((definition) => {
          const anchorId = footnoteAnchorId(definition.index)
          const lastParagraph = lastParagraphIn(definition.children)
          // The preview renders the definition with a CLONED slot cursor:
          // it must show the same heading anchors as the real row, but its
          // evaluation must not advance the main render's cursor.
          const previewCtx = { ...ctx, headingSlotIndex: ctx.headingSlotIndex }
          const preview = definition.children.map((child, index) => (
            <FragmentBlock key={index} block={child} ctx={previewCtx} />
          ))
          return (
            <li key={definition.ptKey ?? definition.index} id={anchorId}>
              <FootnotePreviewRegistrar anchorId={anchorId} preview={preview} />
              {definition.children.map((child, index) =>
                child === lastParagraph ? (
                  <FragmentParagraphWithBackref
                    key={index}
                    paragraph={child}
                    footnoteIndex={definition.index}
                    ctx={ctx}
                  />
                ) : (
                  <FragmentBlock key={index} block={child} ctx={ctx} />
                ),
              )}
              {lastParagraph === null ? (
                <p>
                  <FootnoteBackrefLink footnoteIndex={definition.index} />
                </p>
              ) : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
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

function FragmentParagraphWithBackref({
  paragraph,
  footnoteIndex,
  ctx,
}: {
  paragraph: LexicalParagraphNode
  footnoteIndex: number
  ctx: RenderContext
}): ReactNode {
  return (
    <p className={alignClass(paragraph.format)}>
      {renderInlines(paragraph.children, ctx)}
      <FootnoteBackrefLink footnoteIndex={footnoteIndex} />
    </p>
  )
}
