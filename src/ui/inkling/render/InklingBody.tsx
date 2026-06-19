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
import { walkInkling, type InklingWalkerHandlers } from '@/shared/inkling/walk'
import { Slugger } from '@/shared/slug'
import { BlockquoteBlock } from '@/ui/inkling/render/blocks/BlockquoteBlock'
import { CodeBlock } from '@/ui/inkling/render/blocks/CodeBlock'
import { HeadingBlock } from '@/ui/inkling/render/blocks/HeadingBlock'
import { HorizontalRuleBlock } from '@/ui/inkling/render/blocks/HorizontalRuleBlock'
import { ImageBlock } from '@/ui/inkling/render/blocks/ImageBlock'
import { MathBlock } from '@/ui/inkling/render/blocks/MathBlock'
import { MusicBlock } from '@/ui/inkling/render/blocks/MusicBlock'
import { ParagraphBlock } from '@/ui/inkling/render/blocks/ParagraphBlock'
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
import { Solution } from '@/ui/pt/blocks/Solution'
import { FootnoteProvider, FootnotePreviewRegistrar } from '@/ui/pt/Footnotes'
import { ImageMetaProvider, type ImageMetaMap } from '@/ui/pt/image-meta-context'

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

function makeSingleBlockDocument(node: InklingBlockNode): InklingDocument {
  return {
    _type: 'inkling',
    schemaVersion: 1,
    lexicalVersion: '0.45.0',
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

function renderInlineNode(node: InklingInlineNode): ReactNode {
  switch (node.type) {
    case 'text':
      return <TextMark text={node.text} format={node.format} />
    case 'linebreak':
      return <br />
    case 'inline-math':
      return renderMathMarkupOrTexFallback(node.tex, node.mathml, 'inline')
    case 'footnote-ref':
      return <FootnoteRefMark index={node.index} />
    case 'link': {
      const children = node.children.map(renderInlineNode)
      return (
        <LinkMark url={node.url} target={node.target} rel={node.rel} title={node.title}>
          {children}
        </LinkMark>
      )
    }
  }
}

function renderInlineNodes(nodes: readonly InklingInlineNode[]): ReactNode {
  return nodes.map((node, index) => <Fragment key={node.key ?? `inline-${index}`}>{renderInlineNode(node)}</Fragment>)
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
            {headRows.map((row) => (
              <tr key={row.key ?? row.cells.map((c) => c.key).join('-')}>
                {row.cells.map((cell) => (
                  <th key={cell.key}>{renderTableCellContent(cell)}</th>
                ))}
              </tr>
            ))}
          </thead>
        ) : null}
        <tbody>
          {bodyRows.map((row) => (
            <tr key={row.key ?? row.cells.map((c) => c.key).join('-')}>
              {row.cells.map((cell) => {
                const Tag = cell.isHeader === true ? 'th' : 'td'
                return <Tag key={cell.key}>{renderTableCellContent(cell)}</Tag>
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
      append(c, <ParagraphBlock node={node}>{children}</ParagraphBlock>)
    },
    heading: (node, c, walkChildren) => {
      enter(c)
      walkChildren()
      const children = leave(c)
      append(c, <HeadingBlock node={node}>{children}</HeadingBlock>)
    },
    quote: (node, c, walkChildren) => {
      enter(c)
      walkChildren()
      const children = leave(c)
      append(c, <BlockquoteBlock node={node}>{children}</BlockquoteBlock>)
    },
    list: (node, c, walkChildren) => {
      enter(c)
      walkChildren()
      const children = leave(c)
      const Tag = node.listType === 'bullet' ? 'ul' : 'ol'
      append(c, <Tag>{children}</Tag>)
    },
    listitem: (node, c, walkChildren) => {
      enter(c)
      walkChildren()
      const children = leave(c)
      append(c, <li>{children}</li>)
    },
    text: (node, c) => {
      append(c, <TextMark text={node.text} format={node.format} />)
    },
    linebreak: (_node, c) => {
      append(c, <br />)
    },
    link: (node, c, walkChildren) => {
      enter(c)
      walkChildren()
      const children = leave(c)
      append(
        c,
        <LinkMark url={node.url} target={node.target} rel={node.rel} title={node.title}>
          {children}
        </LinkMark>,
      )
    },
    inlineMath: (node, c) => {
      append(c, renderMathMarkupOrTexFallback(node.tex, node.mathml, 'inline'))
    },
    footnoteRef: (node, c) => {
      append(c, <FootnoteRefMark index={node.index} />)
    },
    image: (node, c) => {
      append(c, <ImageBlock node={node} />)
    },
    code: (node, c) => {
      append(c, <CodeBlock node={node} />)
    },
    mathBlock: (node, c) => {
      append(c, <MathBlock node={node} />)
    },
    music: (node, c) => {
      append(c, <MusicBlock node={node} />)
    },
    horizontalRule: (_node, c) => {
      append(c, <HorizontalRuleBlock />)
    },
    table: (node, c) => {
      append(c, renderTable(node))
    },
    solution: (node, c) => {
      append(c, <Solution>{node.children.map((child) => renderBlockNode(child))}</Solution>)
    },
    twoColumn: (node, c) => {
      append(
        c,
        <section className="my-6 grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8" data-pt-two-column="">
          <div className="min-w-0" data-pt-two-column-pane="" data-side="left">
            {node.left.map((child) => renderBlockNode(child))}
          </div>
          <div className="min-w-0" data-pt-two-column-pane="" data-side="right">
            {node.right.map((child) => renderBlockNode(child))}
          </div>
        </section>,
      )
    },
  }
}

function lastNormalParagraphKey(children: readonly InklingBlockNode[]): string | null {
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i]
    if (child?.type === 'paragraph') {
      return child.key ?? null
    }
  }
  return null
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

function renderFootnoteDefinitionChildren(node: InklingFootnoteDefinitionNode, footnoteIndex: number): ReactNode {
  const lastKey = lastNormalParagraphKey(node.children)
  return node.children.map((child, index) => {
    if (child.type === 'paragraph' && child.key === lastKey) {
      return (
        <p key={child.key ?? `fnp-${index}`}>
          {renderInlineNodes(child.children)}
          <FootnoteBackrefLink footnoteIndex={footnoteIndex} />
        </p>
      )
    }
    return <span key={child.key ?? `fn-${index}`}>{renderBlockNode(child)}</span>
  })
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
          const preview = <>{renderFootnoteDefinitionChildren(definition, definition.index)}</>
          return (
            <li key={definition.key ?? definition.targetKey} id={anchorId}>
              <FootnotePreviewRegistrar anchorId={anchorId} preview={preview} />
              {preview}
              {lastNormalParagraphKey(definition.children) === null ? (
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
    const fallbackSlugger = new Slugger()
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]
      const pre = headingSlugs?.[i]
      const id =
        headingSlugs !== undefined && typeof pre === 'string' && pre.length > 0
          ? pre
          : fallbackSlugger.slug(slot.plainText)
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
