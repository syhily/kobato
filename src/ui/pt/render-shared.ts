import { createContext } from 'react'

import type { FootnoteDefinitionBlock } from '@/shared/pt/schema'

export const PT_INLINE = {
  strong: 'font-semibold text-ink-1',
  em: 'italic',
  underline: 'underline underline-offset-2',
  strike: 'line-through text-ink-3',
  code: 'rounded bg-muted/80 px-1 py-0.5 font-mono text-[0.875em] text-ink-3',
  link: 'text-brand underline decoration-brand/40 underline-offset-2',
  mathTex: 'math-inline rounded bg-muted/50 px-0.5 font-mono text-ink-3',
} as const

export interface FootnoteRefCtx {
  definitions: ReadonlyMap<string, FootnoteDefinitionBlock>
}
export const FootnoteRefContext = createContext<FootnoteRefCtx>({ definitions: new Map() })

export const EMPTY_HEADING_IDS = new Map<string, string>()

export const HeadingIdByBlockKeyContext = createContext<Map<string, string>>(EMPTY_HEADING_IDS)

export interface MusicPresentationCtx {
  suppressAutoplay: boolean
}
export const MusicPresentationContext = createContext<MusicPresentationCtx>({
  suppressAutoplay: false,
})

export const FOOTNOTES_SECTION_FALLBACK_TITLE = '尾声礼记'
