import { createContext } from 'react'

import type { FootnoteDefinitionBlock } from '@/shared/pt/schema'

// Decorator marks carry their own Tailwind classes so inline emphasis stays
// visible even when `.prose` typography rules lose the cascade (shadcn
// `text-*` inheritance, nested shells, or `post-content` rules not applying).
export const PT_INLINE = {
  strong: 'font-semibold text-ink-1',
  em: 'italic',
  underline: 'underline underline-offset-2',
  strike: 'line-through text-ink-3',
  code: 'rounded bg-muted/80 px-1 py-0.5 font-mono text-[0.875em] text-ink-3',
  link: 'text-brand underline decoration-brand/40 underline-offset-2',
  mathTex: 'math-inline rounded bg-muted/50 px-0.5 font-mono text-ink-3',
} as const

// React context fan-out for footnote definitions. Every renderer
// component reads what it needs through this context instead of prop
// drilling, which doesn't compose with the `@portabletext/react`
// component map (the library only passes the node + its index to each
// component).

export interface FootnoteRefCtx {
  definitions: ReadonlyMap<string, FootnoteDefinitionBlock>
}
export const FootnoteRefContext = createContext<FootnoteRefCtx>({ definitions: new Map() })

export const EMPTY_HEADING_IDS = new Map<string, string>()

// Heading ids: precomputed slug list (optional) is zipped to
// `collectHeadingSlotsInPortableTextRenderOrder`; each block's `_key`
// maps to its final id. Pure data + pure useMemo — no render-phase
// counters (Strict Mode / parent re-renders cannot desync SSR/CSR).
export const HeadingIdByBlockKeyContext = createContext<Map<string, string>>(EMPTY_HEADING_IDS)

export interface MusicPresentationCtx {
  suppressAutoplay: boolean
}
export const MusicPresentationContext = createContext<MusicPresentationCtx>({
  suppressAutoplay: false,
})

export const FOOTNOTES_SECTION_FALLBACK_TITLE = '尾声礼记'
