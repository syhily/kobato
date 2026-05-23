import { PortableText, type PortableTextComponents, type PortableTextTypeComponentProps } from '@portabletext/react'
import GithubSlugger from 'github-slugger'
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
  MermaidBlockComponent,
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

// SSR/CSR renderer for PortableText. Built on top of `@portabletext/react`'s
// composable component map so the standard text/list/heading/decorator
// pipeline (including consecutive list-item folding) is delegated to the
// official toolkit, while every yufan.me-specific block / mark
// (`image`, `code`, `mathBlock`, `mermaid`, `horizontalRule`,
// `musicPlayer`, `solution`, `twoColumn`, `footnoteDefinition`, `table`,
// plus `mathInline` / `footnoteRef` mark defs) is handled in a sibling
// `render-blocks.tsx` / `render-marks.tsx` (with `render-shared.ts` for
// the inline-class constants and React contexts).
//
// **Component reuse**: every custom block type maps onto a sibling
// `@/ui/pt/blocks/*` component so the renderer composes the same React
// tree across pages and posts.
//
// **Anchors**: each heading uses the Portable Text block `_key` to look
// up a stable id. Slots are collected with
// `collectHeadingSlotsInPortableTextRenderOrder` (same order as this
// renderer: main column + solution innards + twoColumn (left then right)
// + footnotes). Precomputed slugs from the loader zip by index; any
// gap uses `github-slugger` over the saved **plain** heading text —
// never `react` children, so SSR and hydration cannot disagree when a
// heading wraps marks or decorators.
//
// **Why split now?** The renderer had grown past 700 LOC. We split
// once on a stable seam: marks (3 renderers), standard + custom blocks
// (12 renderers), and shared constants/contexts. The components map
// stays inline in this file so the toolkit still receives a single
// frozen map (no per-render allocation).

export interface PortableTextBodyProps {
  body: PortableTextBodyType
  /** Optional thumbhash hydration map. Mirrors the MDX `<PostBody>` prop. */
  imageMeta?: ImageMetaMap
  /**
   * Precomputed heading anchor IDs, in the order this body's heading
   * blocks appear. SSR loaders pass `collectHeadings(body, deriveSlug)
   * .map(h => h.slug)` so anchors line up with the canonical pinyin
   * pipeline (and stay byte-identical to the MDX `rehype-slug` output
   * for ASCII headings).
   *
   * When omitted (e.g. editor live-preview before the
   * server round-trip), the renderer falls back to a local
   * `github-slugger` pass over the raw text — the anchor still
   * disambiguates duplicates, but Han-only headings keep glyphs verbatim
   * instead of pinyin. The full SSR path
   * always supplies this prop, so the fallback is editor-only.
   */
  headingSlugs?: readonly string[]
  /**
   * When `'suppressed'`, every `musicPlayer` block renders with autoplay
   * forced off so admin surfaces (live preview pane, SSR preview HTML)
   * stay silent while still honouring `alignment` for layout.
   */
  musicAutoplay?: 'suppressed' | 'default'
  /** Visible `<h3>` above the footnotes list; defaults to 「尾声礼记」 when omitted. */
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
    const fallbackSlugger = new GithubSlugger()
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

  // Footnote definitions (block type `footnoteDefinition`) are
  // rendered together at the bottom of the body — never inline —
  // matching the GFM `<section data-footnotes>` convention.
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
      <MusicPresentationContext.Provider value={musicPresentation}>
        <FootnoteProvider>
          <FootnoteRefContext.Provider value={footnoteCtx}>
            <HeadingIdByBlockKeyContext.Provider value={headingIdByBlockKey}>
              <div className="portable-text-body">
                <PortableText value={inlineBody as PortableTextBlock[]} components={portableTextComponents} />
                {footnotes.length > 0 ? (
                  <FootnotesSection definitions={footnotes} sectionTitle={resolvedFootnotesHeading} />
                ) : null}
              </div>
            </HeadingIdByBlockKeyContext.Provider>
          </FootnoteRefContext.Provider>
        </FootnoteProvider>
      </MusicPresentationContext.Provider>
    </ImageMetaProvider>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectFootnoteDefinitions(body: PortableTextBodyType): Map<string, FootnoteDefinitionBlock> {
  const out = new Map<string, FootnoteDefinitionBlock>()
  for (const block of body) {
    if (block._type === 'footnoteDefinition') {
      out.set(block._key, block)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// PortableText component map (built once at module load — frozen reference)
// ---------------------------------------------------------------------------

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
  // `@portabletext/react` collapses consecutive list items sharing the
  // same `listItem` + `level` into a single `<ul>` / `<ol>` for us;
  // we just declare the wrapper. Nested lists are handled because the
  // bridge writes higher-level items into `level: 2 / 3 / …` — the
  // toolkit nests them automatically when `listNestingMode` is the
  // default `html`.
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
    mermaid: MermaidBlockComponent,
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

// ---------------------------------------------------------------------------
// Recursive blocks (need access to portableTextComponents above)
// ---------------------------------------------------------------------------

function SolutionBlockComponent({ value }: PortableTextTypeComponentProps<SolutionBlock>) {
  // Solution children are themselves a (one-deep) PortableText body.
  // Recurse through `<PortableText>` so list-folding etc. continue to
  // work inside the solution wrapper.
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

// ---------------------------------------------------------------------------
// Footnotes section
// ---------------------------------------------------------------------------

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
