import { createContext } from 'react'

import type { MusicPlayerBlockMeta } from '@/shared/types/music'

export const INKLING_INLINE = {
  strong: 'font-semibold text-ink-1',
  em: 'italic',
  underline: 'underline underline-offset-2',
  strike: 'line-through text-ink-3',
  code: 'rounded bg-muted/80 px-1 py-0.5 font-mono text-[0.875em] text-ink-3',
  link: 'text-brand underline decoration-brand/40 underline-offset-2',
  mathTex: 'math-inline rounded bg-muted/50 px-0.5 font-mono text-ink-3',
} as const

export interface InklingMusicPresentationCtx {
  suppressAutoplay: boolean
}

export const InklingMusicPresentationContext = createContext<InklingMusicPresentationCtx>({
  suppressAutoplay: false,
})

export type InklingMusicMetaMap = Record<string, MusicPlayerBlockMeta | undefined>

export const InklingMusicMetaContext = createContext<InklingMusicMetaMap | undefined>(undefined)

export const EMPTY_HEADING_IDS = new Map<string, string>()

export const InklingHeadingIdByKeyContext = createContext<Map<string, string>>(EMPTY_HEADING_IDS)

export const FOOTNOTES_SECTION_FALLBACK_TITLE = '尾声礼记'
