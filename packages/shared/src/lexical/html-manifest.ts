// Lexical render manifest — the single source of truth for the public
// HTML contract of the Lexical body renderers. Both render adapters
// (the React tree in `LexicalBody.tsx` and the string renderer in
// `lexicalBodyToHtml.ts`) read these constants, so the two can never
// drift into divergent markup.
//
// Lexical is the single body dialect (the PT track was retired); the
// values were copied from the PT render adapters during the migration
// (`@kobato/editor/renderer/render-shared.ts` PT_INLINE, the block
// classNames in `render-blocks.tsx` / `render-marks.tsx`, and the
// retired server feed form `pt-html.ts`). Footnote anchor ids / hrefs
// are owned by `@kobato/shared/lexical/footnote-anchors` and are NOT
// duplicated here.
//
// Mode contract:
//   - `default` — full-class form, identical to the React renderer
//   - `rss`     — classless degraded form (the retired PT feed branch)
//   - `email`   — classless form (provisional; comment renderer TBD)

// --- inline marks (byte-identical to `render-shared.ts` PT_INLINE) ----------

export const PT_INLINE = {
  strong: 'font-semibold text-ink-1',
  em: 'italic',
  underline: 'underline underline-offset-2',
  strike: 'line-through text-ink-3',
  code: 'rounded bg-muted/80 px-1 py-0.5 font-mono text-[0.875em] text-ink-3',
  link: 'text-brand underline decoration-brand/40 underline-offset-2',
  mathTex: 'math-inline rounded bg-muted/50 px-0.5 font-mono text-ink-3',
} as const

// --- alignment (element `format` vocabulary) ---------------------------------

export const ALIGN_CLASS = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const

/** Map a lexical element `format` to its text-align utility, `undefined` when unset. */
export function alignClass(align: string | undefined): string | undefined {
  if (align === 'left' || align === 'center' || align === 'right') {
    return ALIGN_CLASS[align]
  }
  return undefined
}

// --- headings ----------------------------------------------------------------

/** Base class of every heading (`render-blocks.tsx` HeadingBlock). */
export const HEADING_CLASS = 'scroll-mt-20'

// --- image -------------------------------------------------------------------

export type ImageLayout = 'left' | 'center' | 'right'

/** Base figure class (`render-blocks.tsx` imageFigureLayoutClass). */
export const IMAGE_FIGURE_CLASS = 'block max-w-full'

/** Per-layout figure classes (`render-blocks.tsx` imageFigureLayoutClass). */
export const IMAGE_LAYOUT_CLASS = {
  left: 'mr-auto ml-0 w-fit',
  center: 'mx-auto w-fit',
  right: 'mr-0 ml-auto w-fit',
} as const satisfies Record<ImageLayout, string>

// `<img>` contract — the string renderer emits what `BlockImage`
// (`renderer/blocks/BlockImage.tsx`) renders under SSR, EXCEPT `srcset`
// (computed from client asset settings) and the thumbhash `style`
// (client-side decode; SSR emits none). `IMG_DIM_CLASS` is the value of
// `DARK_IMAGE_DIM_CLASS` (`widgets/Image.tsx`) — copied here so
// the string renderer stays free of the React widget import graph.
export const IMG_LOADING = 'lazy'
export const IMG_DECODING = 'async'
export const IMG_SIZES = '100vw'
export const IMG_DIM_CLASS =
  'transition-[filter] duration-300 dark:[filter:brightness(0.72)_contrast(0.95)_saturate(0.9)]'
/** BlockImage's aspect-ratio placeholder style when no dimensions are known. */
export const IMG_ASPECT_RATIO_STYLE = 'aspect-ratio:16/9'

// --- math --------------------------------------------------------------------

/** Inline math wrapper (`render-marks.tsx` renderMathMarkupOrTexFallback). */
export const MATH_INLINE_CLASS = 'math-inline inline-block align-middle'
/** Display math wrapper (`render-marks.tsx` renderMathMarkupOrTexFallback). */
export const MATH_DISPLAY_CLASS = 'math math-display text-center [&_svg]:mx-auto [&_svg]:block [&_svg]:max-w-none'

// --- table -------------------------------------------------------------------

/** Table wrapper (`render-blocks.tsx` TableBlockComponent). */
export const TABLE_WRAPPER_CLASS = 'pt-table-wrapper overflow-x-auto'
export const TABLE_CLASS = 'pt-table'

// --- twoColumn ---------------------------------------------------------------

/** `<section>` classes (`render.tsx` TwoColumnBlockComponent). */
export const TWO_COLUMN_CLASS = 'my-6 grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8'
/** Pane `<div>` classes (`render.tsx` TwoColumnBlockComponent). */
export const TWO_COLUMN_PANE_CLASS = 'min-w-0'

// --- solution ----------------------------------------------------------------

/** `<blockquote>` classes (`renderer/blocks/Solution.tsx`). */
export const SOLUTION_CLASS =
  'solution relative flow-root overflow-x-auto overflow-y-hidden p-[1.2rem] pr-9 pb-9 [-webkit-overflow-scrolling:touch]'
export const SOLUTION_BEGIN_CLASS = 'solution-begin mb-2 block text-[1.2rem] font-extrabold text-brand'
export const SOLUTION_BEGIN_TEXT = '解：'
export const SOLUTION_QED_CLASS =
  'solution-qed pointer-events-none absolute right-3 bottom-3 inline-flex h-3.5 w-3.5 items-center justify-center text-ink-3'
/** QED marker markup — the string form of the `<svg>` in `Solution.tsx`. */
export const SOLUTION_QED_SVG =
  '<svg viewBox="0 0 14 14" class="block h-full w-full" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="12" height="12"></rect></svg>'

// --- footnotes ---------------------------------------------------------------

/** `<section>` classes (`render.tsx` FootnotesSection). */
export const FOOTNOTES_SECTION_CLASS = 'footnotes'
/** `<h3>` classes (`render.tsx` FootnotesSection). */
export const FOOTNOTES_HEADING_CLASS = 'mt-10 mb-3 scroll-mt-20 text-lg font-semibold text-ink-1'
/** Fallback section title (`render-shared.ts` FOOTNOTES_SECTION_FALLBACK_TITLE). */
export const FOOTNOTES_SECTION_FALLBACK_TITLE = '尾声礼记'
/** Inline reference link class (`render-marks.tsx` FootnoteRefMarkRenderer). */
export const FOOTNOTE_REF_CLASS = 'footnote-ref'
/** Back-reference link class (`render.tsx` FootnoteBackrefLink). */
export const FOOTNOTE_BACKREF_CLASS = 'data-footnote-backref'
export const FOOTNOTE_BACKREF_TEXT = '↩'

// --- music player ------------------------------------------------------------

/** Music wrapper classes (`renderer/blocks/MusicPlayer.tsx` wrapperClass). */
export const MUSIC_WRAPPER_CLASS =
  'mt-5 mb-[1.375rem] max-w-[21.875rem] max-xl:mx-auto max-md:mx-0 max-md:mt-0 max-md:mb-5 max-md:max-w-full'
/** Extra wrapper class when the player is centered (`MusicPlayer.tsx`). */
export const MUSIC_WRAPPER_CENTER_CLASS = 'mx-auto max-md:mx-auto'
/**
 * The ACTUAL wrapper class MusicPlayer renders. Its `alignment` prop is
 * destructured as `center` and passed through `cn` with a truthy check —
 * and `'start'` is truthy, so EVERY player gets the center classes, and
 * tailwind-merge drops `max-md:mx-0` in favor of `max-md:mx-auto`. The
 * string renderer mirrors this exact merged output instead of
 * re-implementing `cn`.
 */
export const MUSIC_WRAPPER_RENDERED_CLASS =
  'mt-5 mb-[1.375rem] max-w-[21.875rem] max-xl:mx-auto max-md:mt-0 max-md:mb-5 max-md:max-w-full mx-auto max-md:mx-auto'
/** Feed/string placeholder when metadata is missing. */
export const MUSIC_MISSING_PLACEHOLDER = '🎵 此文章包含音乐播放器，请访问原文收听。'

// --- body wrapper ------------------------------------------------------------

/** Outer wrapper class of the React tree (`render.tsx` PortableTextBody). */
export const BODY_WRAPPER_CLASS = 'portable-text-body'

// --- code --------------------------------------------------------------------

/**
 * `class` / `data-language` value for a code node — mirrors
 * `render-blocks.tsx` CodeBlockNodeComponent (undefined-only check).
 */
export function codeLanguageClass(language: string | undefined): string | undefined {
  return language !== undefined ? `language-${language}` : undefined
}
