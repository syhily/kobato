import { Fragment, useMemo, type ReactNode } from 'react'

import type {
  InklingBlockNode,
  InklingDocument,
  InklingFootnoteDefinitionNode,
  InklingInlineNode,
  InklingTableCellNode,
  InklingTableNode,
} from '@/shared/inkling/schema'

import { collectInklingHeadingSlots } from '@/shared/inkling/headings'
import { INKLING_LEXICAL_VERSION } from '@/shared/inkling/schema'
import { walkInkling, type InklingWalkerHandlers } from '@/shared/inkling/walk'
import { BlockquoteBlock } from '@/ui/inkling/render/blocks/BlockquoteBlock'
import { CodeBlock } from '@/ui/inkling/render/blocks/CodeBlock'
import { HeadingBlock } from '@/ui/inkling/render/blocks/HeadingBlock'
import { HorizontalRuleBlock } from '@/ui/inkling/render/blocks/HorizontalRuleBlock'
import { ImageBlock } from '@/ui/inkling/render/blocks/ImageBlock'
import { MathBlock } from '@/ui/inkling/render/blocks/MathBlock'
import { MusicBlock } from '@/ui/inkling/render/blocks/MusicBlock'
import { ParagraphBlock } from '@/ui/inkling/render/blocks/ParagraphBlock'
import { FootnoteProvider, FootnotePreviewRegistrar } from '@/ui/inkling/render/components/Footnotes'
import { ImageMetaProvider, type ImageMetaMap } from '@/ui/inkling/render/components/image-meta-context'
import { Solution } from '@/ui/inkling/render/components/Solution'
import { FootnoteRefMark } from '@/ui/inkling/render/marks/FootnoteRefMark'
import { LinkMark } from '@/ui/inkling/render/marks/LinkMark'
import { renderMathMarkupOrTexFallback } from '@/ui/inkling/render/marks/MathMark'
import { TextMark } from '@/ui/inkling/render/marks/TextMark'
import {
  FOOTNOTES_SECTION_FALLBACK_TITLE,
  InklingHeadingIdByKeyContext,
  InklingMusicMetaContext,
  type InklingMusicMetaMap,
  InklingMusicPresentationContext,
} from '@/ui/inkling/render/render-shared'

export interface InklingBodyProps {
  document: InklingDocument
  imageMeta?: ImageMetaMap
  headingSlugs?: readonly string[]
  musicAutoplay?: 'suppressed' | 'default'
  musicMeta?: InklingMusicMetaMap
  footnotesSectionTitle?: string
}

interface ReactRenderCtx {
  stack: ReactNode[][]
}

function enter(ctx: ReactRenderCtx): void {
  ctx.stack.push([])
}

function leave(ctx: ReactRenderCtx): ReactNode[] {
  return ctx.stack.pop() ?? []
}

function append(ctx: ReactRenderCtx, node: ReactNode): void {
  ctx.stack[ctx.stack.length - 1]!.push(node)
}

// Fallback React key for nodes whose `key` field is absent. Lexical always
// assigns keys to real documents; the fallback only guards against
// hand-built or partially-migrated data. It is the positional index of the
// element among its siblings (the current top stack frame length, captured
// before `append` pushes), prefixed with `_` so it can never collide with a
// real Lexical key (which is always a bare numeric string).
function siblingKey(c: ReactRenderCtx): string {
  return `_${c.stack[c.stack.length - 1]!.length}`
}

function makeSingleBlockDocument(node: InklingBlockNode): InklingDocument {
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
      children: [node],
    },
  }
}

function renderBlockNode(node: InklingBlockNode): ReactNode {
  const ctx: ReactRenderCtx = { stack: [[]] }
  const handlers = buildReactHandlers(ctx)
  walkInkling(makeSingleBlockDocument(node), handlers, ctx)
  return ctx.stack[0]![0] ?? null
}

function renderInlineNode(node: InklingInlineNode, key: string): ReactNode {
  switch (node.type) {
    case 'text':
      return <TextMark key={key} text={node.text} format={node.format} />
    case 'linebreak':
      return <br key={key} />
    case 'inline-math':
      return <Fragment key={key}>{renderMathMarkupOrTexFallback(node.tex, node.mathml, 'inline')}</Fragment>
    case 'footnote-ref':
      return <FootnoteRefMark key={key} index={node.index} />
    case 'link': {
      const children = renderInlineNodes(node.children)
      return (
        <LinkMark key={key} url={node.url} target={node.target} rel={node.rel} title={node.title}>
          {children}
        </LinkMark>
      )
    }
  }
}

function renderInlineNodes(nodes: readonly InklingInlineNode[]): ReactNode {
  return nodes.map((node, index) => renderInlineNode(node, node.key ?? `inline-${index}`))
}

function renderTableCellContent(cell: InklingTableCellNode): ReactNode {
  return renderInlineNodes(cell.children)
}

function renderTable(node: InklingTableNode): ReactNode {
  const rows = node.rows
  const hasHeader = rows.length > 0 && rows[0]!.cells.some((cell) => cell.isHeader === true)
  const headRows = hasHeader ? rows.slice(0, 1) : []
  const bodyRows = hasHeader ? rows.slice(1) : rows
  return (
    <div className="pt-table-wrapper overflow-x-auto">
      <table className="pt-table">
        {headRows.length > 0 ? (
          <thead>
            {headRows.map((row, rowIndex) => (
              <tr key={row.key ?? `tr-${rowIndex}`}>
                {row.cells.map((cell, cellIndex) => (
                  <th key={cell.key ?? `th-${cellIndex}`}>{renderTableCellContent(cell)}</th>
                ))}
              </tr>
            ))}
          </thead>
        ) : null}
        <tbody>
          {bodyRows.map((row, rowIndex) => (
            <tr key={row.key ?? `tr-${rowIndex}`}>
              {row.cells.map((cell, cellIndex) => {
                const Tag = cell.isHeader === true ? 'th' : 'td'
                return <Tag key={cell.key ?? `td-${cellIndex}`}>{renderTableCellContent(cell)}</Tag>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function buildReactHandlers(_ctx: ReactRenderCtx): InklingWalkerHandlers<ReactRenderCtx> {
  return {
    paragraph: (node, c, walkChildren) => {
      enter(c)
      walkChildren()
      const children = leave(c)
      append(
        c,
        <ParagraphBlock key={node.key ?? siblingKey(c)} node={node}>
          {children}
        </ParagraphBlock>,
      )
    },
    heading: (node, c, walkChildren) => {
      enter(c)
      walkChildren()
      const children = leave(c)
      append(
        c,
        <HeadingBlock key={node.key ?? siblingKey(c)} node={node}>
          {children}
        </HeadingBlock>,
      )
    },
    quote: (node, c, walkChildren) => {
      enter(c)
      walkChildren()
      const children = leave(c)
      append(
        c,
        <BlockquoteBlock key={node.key ?? siblingKey(c)} node={node}>
          {children}
        </BlockquoteBlock>,
      )
    },
    list: (node, c, walkChildren) => {
      enter(c)
      walkChildren()
      const children = leave(c)
      const Tag = node.listType === 'bullet' ? 'ul' : 'ol'
      append(c, <Tag key={node.key ?? siblingKey(c)}>{children}</Tag>)
    },
    listitem: (node, c, walkChildren) => {
      enter(c)
      walkChildren()
      const children = leave(c)
      append(c, <li key={node.key ?? siblingKey(c)}>{children}</li>)
    },
    text: (node, c) => {
      append(c, <TextMark key={node.key ?? siblingKey(c)} text={node.text} format={node.format} />)
    },
    linebreak: (node, c) => {
      append(c, <br key={node.key ?? siblingKey(c)} />)
    },
    link: (node, c, walkChildren) => {
      enter(c)
      walkChildren()
      const children = leave(c)
      append(
        c,
        <LinkMark key={node.key ?? siblingKey(c)} url={node.url} target={node.target} rel={node.rel} title={node.title}>
          {children}
        </LinkMark>,
      )
    },
    inlineMath: (node, c) => {
      append(
        c,
        <Fragment key={node.key ?? siblingKey(c)}>
          {renderMathMarkupOrTexFallback(node.tex, node.mathml, 'inline')}
        </Fragment>,
      )
    },
    footnoteRef: (node, c) => {
      append(c, <FootnoteRefMark key={node.key ?? siblingKey(c)} index={node.index} />)
    },
    image: (node, c) => {
      append(c, <ImageBlock key={node.key ?? siblingKey(c)} node={node} />)
    },
    code: (node, c) => {
      append(c, <CodeBlock key={node.key ?? siblingKey(c)} node={node} />)
    },
    mathBlock: (node, c) => {
      append(c, <MathBlock key={node.key ?? siblingKey(c)} node={node} />)
    },
    music: (node, c) => {
      append(c, <MusicBlock key={node.key ?? siblingKey(c)} node={node} />)
    },
    horizontalRule: (node, c) => {
      append(c, <HorizontalRuleBlock key={node.key ?? siblingKey(c)} />)
    },
    table: (node, c) => {
      append(c, <Fragment key={node.key ?? siblingKey(c)}>{renderTable(node)}</Fragment>)
    },
    solution: (node, c) => {
      append(
        c,
        <Solution key={node.key ?? siblingKey(c)}>
          {node.children.map((child, index) => (
            <Fragment key={child.key ?? `_sol-${index}`}>{renderBlockNode(child)}</Fragment>
          ))}
        </Solution>,
      )
    },
    twoColumn: (node, c) => {
      append(
        c,
        <section
          key={node.key ?? siblingKey(c)}
          className="my-6 grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8"
          data-pt-two-column=""
        >
          <div className="min-w-0" data-pt-two-column-pane="" data-side="left">
            {node.left.map((child, index) => (
              <Fragment key={child.key ?? `_2col-l-${index}`}>{renderBlockNode(child)}</Fragment>
            ))}
          </div>
          <div className="min-w-0" data-pt-two-column-pane="" data-side="right">
            {node.right.map((child, index) => (
              <Fragment key={child.key ?? `_2col-r-${index}`}>{renderBlockNode(child)}</Fragment>
            ))}
          </div>
        </section>,
      )
    },
  }
}

function FootnoteBackrefLink({ footnoteIndex }: { footnoteIndex: number }): ReactNode {
  return (
    <a
      href={`#user-content-fnref-${footnoteIndex}`}
      data-footnote-backref=""
      aria-label="返回引用"
      className="data-footnote-backref"
    >
      ↩
    </a>
  )
}

function renderFootnoteDefinitionChildren(node: InklingFootnoteDefinitionNode): ReactNode {
  // NOTE: we intentionally do NOT inline the backref into the last
  // paragraph here. The SSR string renderer
  // (`renderFootnotesSection` in `server/render/inkling/html.ts`) always
  // appends a standalone trailing `<p>` backref, so we mirror that here
  // to keep the two outputs structurally identical (RSS / plaintext
  // extraction relies on the same shape as the React render).
  return node.children.map((child, index) => <span key={child.key ?? `fn-${index}`}>{renderBlockNode(child)}</span>)
}

function FootnotesSection({
  definitions,
  sectionTitle,
}: {
  definitions: readonly InklingFootnoteDefinitionNode[]
  sectionTitle: string
}): ReactNode {
  return (
    <section className="footnotes" data-footnotes="" aria-labelledby="footnotes-section-heading">
      <h3 id="footnotes-section-heading" className="mt-10 mb-3 scroll-mt-20 text-lg font-semibold text-ink-1">
        {sectionTitle}
      </h3>
      <ol>
        {definitions.map((definition) => {
          const anchorId = `user-content-fn-${definition.index}`
          const preview = renderFootnoteDefinitionChildren(definition)
          return (
            <li key={definition.key ?? definition.targetKey} id={anchorId}>
              <FootnotePreviewRegistrar anchorId={anchorId} preview={preview} />
              {preview}
              {/* Standalone backref paragraph — matches the SSR string
                  renderer so RSS / plaintext extraction agrees with the
                  React render. */}
              <p>
                <FootnoteBackrefLink footnoteIndex={definition.index} />
              </p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export function InklingBody({
  document,
  imageMeta,
  headingSlugs,
  musicAutoplay,
  musicMeta,
  footnotesSectionTitle,
}: InklingBodyProps): ReactNode {
  const headingIdByBlockKey = useMemo(() => {
    const slots = collectInklingHeadingSlots(document)
    const map = new Map<string, string>()
    // `headingSlugs` are precomputed by the route loader using the
    // server-side `deriveSlug` (pinyin-pro romanisation → slugify). They
    // are the source of truth — every detail route passes them in.
    //
    // The fallback below only runs if a caller forgets to pass
    // `headingSlugs` or if a slot's precomputed slug is empty. We use a
    // stable index-based id (`heading-{i}`) rather than `Slugger` because
    // the client cannot import `pinyin-pro` (~150 KB) and a pure-slugify
    // fallback would disagree with the server for any CJK heading. An
    // index-based id is deterministic, never empty, and obviously not the
    // canonical slug — so the divergence is loud rather than silent.
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]
      const pre = headingSlugs?.[i]
      const id = headingSlugs !== undefined && typeof pre === 'string' && pre.length > 0 ? pre : `heading-${i}`
      map.set(slot.blockKey, id)
    }
    return map
  }, [document, headingSlugs])

  const footnotes = useMemo(
    () =>
      document.root.children.filter(
        (node): node is InklingFootnoteDefinitionNode => node.type === 'footnote-definition',
      ),
    [document],
  )

  const musicPresentation = useMemo(() => ({ suppressAutoplay: musicAutoplay === 'suppressed' }), [musicAutoplay])

  const resolvedFootnotesHeading =
    footnotesSectionTitle !== undefined && footnotesSectionTitle.trim().length > 0
      ? footnotesSectionTitle.trim()
      : FOOTNOTES_SECTION_FALLBACK_TITLE

  const ctx: ReactRenderCtx = { stack: [[]] }
  const handlers = buildReactHandlers(ctx)
  walkInkling(document, handlers, ctx)
  const bodyChildren = ctx.stack[0] ?? []

  return (
    <ImageMetaProvider value={imageMeta}>
      <InklingMusicPresentationContext value={musicPresentation}>
        <InklingMusicMetaContext value={musicMeta}>
          <FootnoteProvider>
            <InklingHeadingIdByKeyContext value={headingIdByBlockKey}>
              <div className="inkling-body">
                {bodyChildren}
                {footnotes.length > 0 ? (
                  <FootnotesSection definitions={footnotes} sectionTitle={resolvedFootnotesHeading} />
                ) : null}
              </div>
            </InklingHeadingIdByKeyContext>
          </FootnoteProvider>
        </InklingMusicMetaContext>
      </InklingMusicPresentationContext>
    </ImageMetaProvider>
  )
}
