/* oxlint-disable typescript/no-unsafe-type-assertion */
import { PortableText, type PortableTextComponents, type PortableTextTypeComponentProps } from '@portabletext/react'
import { useMemo, type ReactNode } from 'react'

import type { EnrichedPortableTextBody } from '@/shared/pt/enriched'
import type {
  FootnoteDefinitionBlock,
  NonRecursiveBlock,
  PortableTextBlock,
  SolutionBlock,
  TextBlock,
  TwoColumnBlock,
} from '@/shared/pt/schema'

import {
  FOOTNOTE_BACKREF_ARIA_LABEL,
  FOOTNOTE_BACKREF_ATTRIBUTE,
  FOOTNOTES_SECTION_HEADING_ID,
  footnoteAnchorId,
  footnoteRefHref,
} from '@/shared/pt/footnote-anchors'
import { partitionFootnoteDefinitions } from '@/shared/pt/footnote-merge'
import { buildHeadingIdByBlockKey } from '@/shared/pt/utils'
import { Slugger } from '@/shared/slug'
import { Solution } from '@/ui/pt/blocks/Solution'
import { FootnoteProvider, FootnotePreviewRegistrar } from '@/ui/pt/Footnotes'
import { ImageMetaProvider, type ImageMetaMap } from '@/ui/pt/image-meta-context'
import {
  BlockquoteBlock,
  CodeBlockNodeComponent,
  HeadingBlock,
  HorizontalRuleComponent,
  ImageBlockComponent,
  MathBlockComponent,
  MusicPlayerComponent,
  ParagraphBlock,
  TableBlockComponent,
} from '@/ui/pt/render-blocks'
import { FootnoteRefMarkRenderer, LinkMark, MathInlineMarkRenderer } from '@/ui/pt/render-marks'
import {
  FOOTNOTES_SECTION_FALLBACK_TITLE,
  FootnoteRefContext,
  type FootnoteRefCtx,
  HeadingIdByBlockKeyContext,
  MusicPresentationContext,
  type MusicPresentationCtx,
  PT_INLINE,
} from '@/ui/pt/render-shared'

// PortableText renderer delegating standard pipeline to `@portabletext/react`
// and kobato-specific blocks/marks to sibling modules.
//
// Headings use precomputed slugs zipped by index; fallback `Slugger` runs over
// plain text (never React children) so SSR/hydration stay in sync.

export interface PortableTextBodyProps {
  body: EnrichedPortableTextBody
  /** Optional thumbhash hydration map keyed by image src, supplied by the route loader. */
  imageMeta?: ImageMetaMap
  headingSlugs?: readonly string[]
  musicAutoplay?: 'suppressed' | 'default'
  footnotesSectionTitle?: string
}

export function PortableTextBody({
  body,
  imageMeta,
  headingSlugs,
  musicAutoplay,
  footnotesSectionTitle,
}: PortableTextBodyProps) {
  const footnoteCtx = useMemo<FootnoteRefCtx>(() => ({ definitions: collectFootnoteDefinitions(body) }), [body])

  const headingIdByBlockKey = useMemo(() => {
    const fallbackSlugger = new Slugger()
    return buildHeadingIdByBlockKey(body, headingSlugs, (plainText) => fallbackSlugger.slug(plainText))
  }, [body, headingSlugs])

  // Footnote definitions render at the bottom — never inline.
  const { prose, definitions } = useMemo(() => partitionFootnoteDefinitions(body), [body])

  const musicPresentation = useMemo<MusicPresentationCtx>(
    () => ({ suppressAutoplay: musicAutoplay === 'suppressed' }),
    [musicAutoplay],
  )

  const resolvedFootnotesHeading =
    footnotesSectionTitle !== undefined && footnotesSectionTitle.trim().length > 0
      ? footnotesSectionTitle.trim()
      : FOOTNOTES_SECTION_FALLBACK_TITLE

  return (
    <ImageMetaProvider value={imageMeta}>
      <MusicPresentationContext value={musicPresentation}>
        <FootnoteProvider>
          <FootnoteRefContext value={footnoteCtx}>
            <HeadingIdByBlockKeyContext value={headingIdByBlockKey}>
              <div className="portable-text-body">
                <PortableText value={prose as PortableTextBlock[]} components={portableTextComponents} />
                {definitions.length > 0 ? (
                  <FootnotesSection definitions={definitions} sectionTitle={resolvedFootnotesHeading} />
                ) : null}
              </div>
            </HeadingIdByBlockKeyContext>
          </FootnoteRefContext>
        </FootnoteProvider>
      </MusicPresentationContext>
    </ImageMetaProvider>
  )
}

function collectFootnoteDefinitions(body: EnrichedPortableTextBody): Map<string, FootnoteDefinitionBlock> {
  const out = new Map<string, FootnoteDefinitionBlock>()
  for (const block of body) {
    if (block._type === 'footnoteDefinition') {
      out.set(block._key, block)
    }
  }
  return out
}

const portableTextComponents: PortableTextComponents = {
  block: {
    h1: ({ children, value }) => (
      <HeadingBlock Tag="h1" value={value as TextBlock}>
        {children}
      </HeadingBlock>
    ),
    h2: ({ children, value }) => (
      <HeadingBlock Tag="h2" value={value as TextBlock}>
        {children}
      </HeadingBlock>
    ),
    h3: ({ children, value }) => (
      <HeadingBlock Tag="h3" value={value as TextBlock}>
        {children}
      </HeadingBlock>
    ),
    h4: ({ children, value }) => (
      <HeadingBlock Tag="h4" value={value as TextBlock}>
        {children}
      </HeadingBlock>
    ),
    normal: ({ children, value }) => <ParagraphBlock value={value as TextBlock}>{children}</ParagraphBlock>,
    blockquote: ({ children, value }) => <BlockquoteBlock value={value as TextBlock}>{children}</BlockquoteBlock>,
  },
  list: {
    bullet: ({ children }) => <ul>{children}</ul>,
    number: ({ children }) => <ol>{children}</ol>,
  },
  listItem: {
    bullet: ({ children }) => <li>{children}</li>,
    number: ({ children }) => <li>{children}</li>,
  },
  marks: {
    strong: ({ children }) => <strong className={PT_INLINE.strong}>{children}</strong>,
    em: ({ children }) => <em className={PT_INLINE.em}>{children}</em>,
    underline: ({ children }) => <u className={PT_INLINE.underline}>{children}</u>,
    'strike-through': ({ children }) => <s className={PT_INLINE.strike}>{children}</s>,
    code: ({ children }) => <code className={PT_INLINE.code}>{children}</code>,
    link: LinkMark,
    mathInline: MathInlineMarkRenderer,
    footnoteRef: FootnoteRefMarkRenderer,
  },
  types: {
    image: ImageBlockComponent,
    code: CodeBlockNodeComponent,
    mathBlock: MathBlockComponent,
    horizontalRule: HorizontalRuleComponent,
    musicPlayer: MusicPlayerComponent,
    solution: SolutionBlockComponent,
    twoColumn: TwoColumnBlockComponent,
    table: TableBlockComponent,
  },
  hardBreak: () => <br />,
  unknownType: () => {
    return null
  },
  unknownMark: ({ children }) => {
    return <>{children}</>
  },
  unknownBlockStyle: ({ children }) => {
    return <p>{children}</p>
  },
  unknownList: ({ children }) => <ul>{children}</ul>,
  unknownListItem: ({ children }) => <li>{children}</li>,
}

function SolutionBlockComponent({ value }: PortableTextTypeComponentProps<SolutionBlock>) {
  return (
    <Solution>
      <PortableText value={value.children as PortableTextBlock[]} components={portableTextComponents} />
    </Solution>
  )
}

function TwoColumnBlockComponent({ value }: PortableTextTypeComponentProps<TwoColumnBlock>) {
  return (
    <section className="my-6 grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8" data-pt-two-column="">
      <div className="min-w-0" data-pt-two-column-pane="" data-side="left">
        <PortableText value={value.left as PortableTextBlock[]} components={portableTextComponents} />
      </div>
      <div className="min-w-0" data-pt-two-column-pane="" data-side="right">
        <PortableText value={value.right as PortableTextBlock[]} components={portableTextComponents} />
      </div>
    </section>
  )
}

function lastNormalParagraphKey(children: readonly NonRecursiveBlock[]): string | null {
  for (let i = children.length - 1; i >= 0; i--) {
    const b = children[i]
    if (b._type === 'block' && b.style === 'normal') {
      return b._key
    }
  }
  return null
}

function FootnoteBackrefLink({ footnoteIndex }: { footnoteIndex: number }) {
  return (
    <a
      href={footnoteRefHref(footnoteIndex)}
      {...{ [FOOTNOTE_BACKREF_ATTRIBUTE]: '' }}
      aria-label={FOOTNOTE_BACKREF_ARIA_LABEL}
      className="data-footnote-backref"
    >
      ↩
    </a>
  )
}

function footnotesPortableComponents(lastParagraphKey: string | null, footnoteIndex: number): PortableTextComponents {
  return {
    ...portableTextComponents,
    block: {
      ...portableTextComponents.block,
      normal: ({ children, value }) => {
        const tb = value as TextBlock
        if (lastParagraphKey !== null && tb._key === lastParagraphKey) {
          return (
            <p>
              {children}
              <FootnoteBackrefLink footnoteIndex={footnoteIndex} />
            </p>
          )
        }
        return <ParagraphBlock value={value as TextBlock}>{children}</ParagraphBlock>
      },
    },
  } as PortableTextComponents
}

function FootnotesSection({
  definitions,
  sectionTitle,
}: {
  definitions: readonly FootnoteDefinitionBlock[]
  sectionTitle: string
}): ReactNode {
  return (
    <section className="footnotes" data-footnotes="" aria-labelledby={FOOTNOTES_SECTION_HEADING_ID}>
      <h3 id={FOOTNOTES_SECTION_HEADING_ID} className="mt-10 mb-3 scroll-mt-20 text-lg font-semibold text-ink-1">
        {sectionTitle}
      </h3>
      <ol>
        {definitions.map((definition) => {
          const anchorId = footnoteAnchorId(definition.index)
          const lastPk = lastNormalParagraphKey(definition.children)
          const comps = footnotesPortableComponents(lastPk, definition.index)
          const preview = (
            <PortableText value={definition.children as PortableTextBlock[]} components={portableTextComponents} />
          )
          return (
            <li key={definition._key} id={anchorId}>
              <FootnotePreviewRegistrar anchorId={anchorId} preview={preview} />
              <PortableText value={definition.children as PortableTextBlock[]} components={comps} />
              {lastPk === null ? (
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
