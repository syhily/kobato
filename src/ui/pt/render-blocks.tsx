import { type PortableTextTypeComponentProps } from '@portabletext/react'
import { use, type ReactNode } from 'react'

import type {
  CodeBlock,
  HorizontalRuleBlock,
  ImageBlock,
  ImageBlockLayout,
  MarkDef,
  MathBlock,
  MusicPlayerBlock,
  Span,
  TableBlock,
  TextBlock,
} from '@/shared/pt/schema'

import { cn } from '@/ui/lib/cn'
import { sanitizeHtml } from '@/ui/lib/sanitize-html'
import { BlockImage } from '@/ui/pt/blocks/BlockImage'
import { CodeBlock as CodeBlockComponent } from '@/ui/pt/blocks/CodeBlock'
import { MusicPlayer } from '@/ui/pt/blocks/MusicPlayer'
import { FootnoteReference } from '@/ui/pt/Footnotes'
import { renderMathMarkupOrTexFallback } from '@/ui/pt/render-marks'
import { HeadingIdByBlockKeyContext, MusicPresentationContext, PT_INLINE } from '@/ui/pt/render-shared'

export function alignClass(align: string | undefined): string | undefined {
  if (align === 'center') {
    return 'text-center'
  }
  if (align === 'right') {
    return 'text-right'
  }
  if (align === 'left') {
    return 'text-left'
  }
  return undefined
}

function imageFigureLayoutClass(layout: ImageBlock['layout']): string {
  const l: ImageBlockLayout = layout ?? 'center'
  return cn(
    'block max-w-full',
    l === 'left' && 'mr-auto ml-0 w-fit',
    l === 'center' && 'mx-auto w-fit',
    l === 'right' && 'mr-0 ml-auto w-fit',
  )
}

export function HeadingBlock({
  children,
  value,
  Tag,
}: {
  children?: ReactNode
  value: TextBlock
  Tag: 'h1' | 'h2' | 'h3' | 'h4'
}) {
  const ids = use(HeadingIdByBlockKeyContext)
  const id = ids.get(value._key) ?? ''
  const cls = alignClass(value.align)
  return (
    <Tag id={id} className={cn('scroll-mt-20', cls)}>
      {children}
    </Tag>
  )
}

export function ParagraphBlock({ value, children }: { value: TextBlock; children: ReactNode }) {
  const cls = alignClass(value.align)
  return <p className={cls}>{children}</p>
}

export function BlockquoteBlock({ value, children }: { value: TextBlock; children: ReactNode }) {
  const cls = alignClass(value.align)
  return <blockquote className={cls}>{children}</blockquote>
}

export function ImageBlockComponent({ value }: PortableTextTypeComponentProps<ImageBlock>) {
  return (
    <figure className={imageFigureLayoutClass(value.layout)}>
      <BlockImage
        src={value.src}
        alt={value.alt ?? ''}
        width={value.width}
        height={value.height}
        data-thumbhash={value.thumbhash}
      />
      {value.caption !== undefined && value.caption !== '' ? <figcaption>{value.caption}</figcaption> : null}
    </figure>
  )
}

export function CodeBlockNodeComponent({ value }: PortableTextTypeComponentProps<CodeBlock>) {
  if (value.highlightedHtml !== undefined && value.highlightedHtml !== '') {
    return (
      <CodeBlockComponent
        className={value.language !== undefined ? `language-${value.language}` : undefined}
        copyText={value.code}
        data-language={value.language}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(value.highlightedHtml, 'shiki') }}
      />
    )
  }
  return (
    <CodeBlockComponent>
      <code
        className={value.language !== undefined ? `language-${value.language}` : undefined}
        data-language={value.language}
      >
        {value.code}
      </code>
    </CodeBlockComponent>
  )
}

export function MathBlockComponent({ value }: PortableTextTypeComponentProps<MathBlock>) {
  return renderMathMarkupOrTexFallback(value.tex, value.mathml, value.svg, 'display')
}

export function HorizontalRuleComponent(_props: PortableTextTypeComponentProps<HorizontalRuleBlock>) {
  return <hr />
}

export function MusicPlayerComponent({ value }: PortableTextTypeComponentProps<MusicPlayerBlock>) {
  const { suppressAutoplay } = use(MusicPresentationContext)
  return (
    <MusicPlayer
      id={value.playerId}
      auto={suppressAutoplay ? false : value.auto === true}
      alignment={value.center === true ? 'center' : 'start'}
    />
  )
}

export function TableBlockComponent({ value }: PortableTextTypeComponentProps<TableBlock>) {
  const rows = value.rows ?? []
  const hasHeader = value.hasHeaderRow ?? false
  const headRows = hasHeader ? rows.slice(0, 1) : []
  const bodyRows = hasHeader ? rows.slice(1) : rows
  return (
    <div className="pt-table-wrapper overflow-x-auto">
      <table className="pt-table">
        {headRows.length > 0 ? (
          <thead>
            {headRows.map((row) => (
              <tr key={row._key}>
                {row.cells.map((cell) => (
                  <th key={cell._key}>{renderSpansInline(cell.content, cell.markDefs ?? [])}</th>
                ))}
              </tr>
            ))}
          </thead>
        ) : null}
        <tbody>
          {bodyRows.map((row) => (
            <tr key={row._key}>
              {row.cells.map((cell) => {
                const Tag = cell.isHeader === true ? 'th' : 'td'
                return <Tag key={cell._key}>{renderSpansInline(cell.content, cell.markDefs ?? [])}</Tag>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function renderSpansInline(spans: readonly Span[], markDefs: readonly MarkDef[]): ReactNode {
  return spans.map((span) => <SpanInline key={span._key} span={span} markDefs={markDefs} />)
}

function SpanInline({ span, markDefs }: { span: Span; markDefs: readonly MarkDef[] }) {
  const marks = span.marks ?? []
  if (marks.length === 0) {
    return <>{span.text}</>
  }
  let node: ReactNode = span.text
  for (const markName of marks) {
    node = applyInlineMark(node, markName, markDefs)
  }
  return <>{node}</>
}

function applyInlineMark(node: ReactNode, markName: string, markDefs: readonly MarkDef[]): ReactNode {
  switch (markName) {
    case 'strong':
      return <strong className={PT_INLINE.strong}>{node}</strong>
    case 'em':
      return <em className={PT_INLINE.em}>{node}</em>
    case 'underline':
      return <u className={PT_INLINE.underline}>{node}</u>
    case 'strike-through':
      return <s className={PT_INLINE.strike}>{node}</s>
    case 'code':
      return <code className={PT_INLINE.code}>{node}</code>
  }
  const def = markDefs.find((entry) => entry._key === markName)
  if (def === undefined) {
    return node
  }
  switch (def._type) {
    case 'link': {
      // Defense-in-depth: never emit executable JavaScript or data URLs
      // even if the schema filter is somehow bypassed.
      const href = /^\s*(javascript|data):/i.test(def.href) ? '#' : def.href
      return (
        <a href={href} rel={def.rel} target={def.target} className={PT_INLINE.link}>
          {node}
        </a>
      )
    }
    case 'mathInline':
      return renderMathMarkupOrTexFallback(def.tex, def.mathml, def.svg, 'inline')
    case 'footnoteRef':
      return (
        <FootnoteReference id={`user-content-fnref-${def.index}`} data-footnote-ref="">
          <a href={`#user-content-fn-${def.index}`} className="footnote-ref">
            {def.index}
          </a>
        </FootnoteReference>
      )
  }
}
