import { PortableText, type PortableTextComponents, type PortableTextTypeComponentProps } from '@portabletext/react'
import { useMemo, type ReactNode } from 'react'

import type {
  FootnoteDefinitionBlock,
  NonRecursiveBlock,
  PortableTextBlock,
  PortableTextBody as PortableTextBodyType,
  SolutionBlock,
  TextBlock,
  TwoColumnBlock,
} from '@/shared/pt/schema'

import { collectHeadingSlotsInPortableTextRenderOrder } from '@/shared/pt/utils'
import { Slugger } from '@/shared/slug'
import { unsafeCast } from '@/shared/utils/unsafe-cast'
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
  body: PortableTextBodyType
  /** Optional thumbhash hydration map. Mirrors the MDX `<PostBody>` prop. */
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
    const slots = collectHeadingSlotsInPortableTextRenderOrder(body)
    const map = new Map<string, string>()
    const fallbackSlugger = new Slugger()
    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i]
      const pre = headingSlugs?.[i]
      const id =
        headingSlugs !== undefined && typeof pre === 'string' && pre.length > 0
          ? pre
          : fallbackSlugger.slug(slot.plainText)
      map.set(slot.blockKey, id)
    }
    return map
  }, [body, headingSlugs])

  // Footnote definitions render at the bottom — never inline.
  const inlineBody = useMemo(() => body.filter((block) => block._type !== 'footnoteDefinition'), [body])
  const footnotes = useMemo(
    () => body.filter((block): block is FootnoteDefinitionBlock => block._type === 'footnoteDefinition'),
    [body],
  )

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
                <PortableText value={unsafeCast<PortableTextBlock[]>(inlineBody)} components={portableTextComponents} />
                {footnotes.length > 0 ? (
                  <FootnotesSection definitions={footnotes} sectionTitle={resolvedFootnotesHeading} />
                ) : null}
              </div>
            </HeadingIdByBlockKeyContext>
          </FootnoteRefContext>
        </FootnoteProvider>
      </MusicPresentationContext>
    </ImageMetaProvider>
  )
}

function collectFootnoteDefinitions(body: PortableTextBodyType): Map<string, FootnoteDefinitionBlock> {
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
      <HeadingBlock Tag="h1" value={unsafeCast<TextBlock>(value)}>
        {children}
      </HeadingBlock>
    ),
    h2: ({ children, value }) => (
      <HeadingBlock Tag="h2" value={unsafeCast<TextBlock>(value)}>
        {children}
      </HeadingBlock>
    ),
    h3: ({ children, value }) => (
      <HeadingBlock Tag="h3" value={unsafeCast<TextBlock>(value)}>
        {children}
      </HeadingBlock>
    ),
    h4: ({ children, value }) => (
      <HeadingBlock Tag="h4" value={unsafeCast<TextBlock>(value)}>
        {children}
      </HeadingBlock>
    ),
    normal: ({ children, value }) => <ParagraphBlock value={unsafeCast<TextBlock>(value)}>{children}</ParagraphBlock>,
    blockquote: ({ children, value }) => (
      <BlockquoteBlock value={unsafeCast<TextBlock>(value)}>{children}</BlockquoteBlock>
    ),
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
      <PortableText value={unsafeCast<PortableTextBlock[]>(value.children)} components={portableTextComponents} />
    </Solution>
  )
}

function TwoColumnBlockComponent({ value }: PortableTextTypeComponentProps<TwoColumnBlock>) {
  return (
    <section className="my-6 grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8" data-pt-two-column="">
      <div className="min-w-0" data-pt-two-column-pane="" data-side="left">
        <PortableText value={unsafeCast<PortableTextBlock[]>(value.left)} components={portableTextComponents} />
      </div>
      <div className="min-w-0" data-pt-two-column-pane="" data-side="right">
        <PortableText value={unsafeCast<PortableTextBlock[]>(value.right)} components={portableTextComponents} />
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
      href={`#user-content-fnref-${footnoteIndex}`}
      data-footnote-backref=""
      aria-label="返回引用"
      className="data-footnote-backref"
    >
      ↩
    </a>
  )
}

function footnotesPortableComponents(lastParagraphKey: string | null, footnoteIndex: number): PortableTextComponents {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- spreading PortableTextComponents with an overridden block requires the assertion; type-safe at runtime
  return {
    ...portableTextComponents,
    block: {
      ...portableTextComponents.block,
      normal: ({ children, value }) => {
        const tb = unsafeCast<TextBlock>(value)
        if (lastParagraphKey !== null && tb._key === lastParagraphKey) {
          return (
            <p>
              {children}
              <FootnoteBackrefLink footnoteIndex={footnoteIndex} />
            </p>
          )
        }
        return <ParagraphBlock value={unsafeCast<TextBlock>(value)}>{children}</ParagraphBlock>
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
    <section className="footnotes" data-footnotes="" aria-labelledby="footnotes-section-heading">
      <h3 id="footnotes-section-heading" className="mt-10 mb-3 scroll-mt-20 text-lg font-semibold text-ink-1">
        {sectionTitle}
      </h3>
      <ol>
        {definitions.map((definition) => {
          const anchorId = `user-content-fn-${definition.index}`
          const lastPk = lastNormalParagraphKey(definition.children)
          const comps = footnotesPortableComponents(lastPk, definition.index)
          const preview = (
            <PortableText
              value={unsafeCast<PortableTextBlock[]>(definition.children)}
              components={portableTextComponents}
            />
          )
          return (
            <li key={definition._key} id={anchorId}>
              <FootnotePreviewRegistrar anchorId={anchorId} preview={preview} />
              <PortableText value={unsafeCast<PortableTextBlock[]>(definition.children)} components={comps} />
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
