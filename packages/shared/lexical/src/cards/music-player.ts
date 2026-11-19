import type { DecoratorNodeProperty } from '@kobato/inkling/headless'

import {
  absolutizeAssetSrcForFeed,
  type CardRenderContext,
  type CardRenderOutput,
  elementFromHtml,
  isFeedVariantRender,
} from '@kobato/lexical/cards/card-html.ts'
import { resolveKobatoImageRenderEnv } from '@kobato/lexical/cards/kobato-image.ts'
import { MUSIC_PLAYER_NODE_TYPE } from '@kobato/lexical/node-whitelist.ts'
import { MUSIC_PLAYER_PROJECTION_PLACEHOLDER } from '@kobato/lexical/projection-state.ts'

export const MUSIC_PLAYER_CARD_PROPERTIES = [
  { name: 'playerId', default: '' },
  { name: 'name', default: '', wordCount: true },
  { name: 'artist', default: '', wordCount: true },
  { name: 'cover', default: '', urlType: 'url' },
  { name: 'audioUrl', default: '', urlType: 'url' },
  { name: 'lyric', default: '' },
] as const satisfies readonly DecoratorNodeProperty[]

export const MUSIC_PLAYER_CARD_CLASSES = {
  wrapper: 'mt-5 mb-[1.375rem] max-w-[21.875rem] max-xl:mx-auto max-md:mx-0 max-md:mb-5 max-md:max-w-full',
  fallback: 'not-typeset overflow-hidden rounded-md border border-line-muted bg-canvas',
  fallbackBody: 'flex items-center gap-3 p-3',
  fallbackCover: 'size-12 shrink-0 rounded-md object-cover',
  fallbackGlyph: 'flex size-12 shrink-0 items-center justify-center rounded-md bg-surface-dim text-lg',
  fallbackMeta: 'min-w-0 flex-1',
  fallbackName: 'truncate text-sm font-medium text-ink-1',
  fallbackArtist: 'truncate text-xs text-ink-3',
  fallbackProgress: 'flex items-center gap-2 px-3 pb-1 text-xs text-ink-4 tabular-nums',
  fallbackTime: 'w-9 shrink-0 whitespace-nowrap',
  fallbackTimeTotal: 'w-9 shrink-0 text-right whitespace-nowrap',
  fallbackBar: 'flex flex-1 items-center py-1.5',
  fallbackBarTrack: 'h-1 w-full rounded-full bg-surface-dim',
} as const

export interface MusicPlayerCardMeta {
  playerId: string
  name: string
  artist: string
  cover: string
  audioUrl: string
  lyric: string
}

export function musicPlayerCardMeta(node: MusicPlayerCardMeta): MusicPlayerCardMeta {
  return {
    playerId: node.playerId,
    name: node.name,
    artist: node.artist,
    cover: node.cover,
    audioUrl: node.audioUrl,
    lyric: node.lyric,
  }
}

export function hasMusicPlayerMeta(meta: MusicPlayerCardMeta): boolean {
  return meta.audioUrl !== ''
}

export function musicPlayerFallbackHtml(meta: MusicPlayerCardMeta, escape: (value: string) => string): string {
  const cover =
    meta.cover === ''
      ? `<span class="${MUSIC_PLAYER_CARD_CLASSES.fallbackGlyph}" aria-hidden="true">🎵</span>`
      : `<img class="${MUSIC_PLAYER_CARD_CLASSES.fallbackCover}" src="${escape(meta.cover)}" alt="${escape(meta.name)}" />`
  const body = `<div class="${MUSIC_PLAYER_CARD_CLASSES.fallbackBody}">${cover}<div class="${MUSIC_PLAYER_CARD_CLASSES.fallbackMeta}"><div class="${MUSIC_PLAYER_CARD_CLASSES.fallbackName}">${escape(meta.name)}</div><div class="${MUSIC_PLAYER_CARD_CLASSES.fallbackArtist}">${escape(meta.artist)}</div></div></div>`
  const progress = `<div class="${MUSIC_PLAYER_CARD_CLASSES.fallbackProgress}"><span class="${MUSIC_PLAYER_CARD_CLASSES.fallbackTime}">00:00</span><div class="${MUSIC_PLAYER_CARD_CLASSES.fallbackBar}"><div class="${MUSIC_PLAYER_CARD_CLASSES.fallbackBarTrack}"></div></div><span class="${MUSIC_PLAYER_CARD_CLASSES.fallbackTimeTotal}">--:--</span></div>`
  return `<div class="${MUSIC_PLAYER_CARD_CLASSES.fallback}" data-music-player-fallback="">${body}${progress}</div>`
}

export function renderMusicPlayerCard(node: MusicPlayerCardMeta, context: CardRenderContext): CardRenderOutput {
  const document = context.createDocument()
  const raw = musicPlayerCardMeta(node)
  const escape = context.escapeText
  const meta = { ...raw, cover: context.safeUrl('media', raw.cover), audioUrl: context.safeUrl('media', raw.audioUrl) }

  if (isFeedVariantRender(context)) {
    if (!hasMusicPlayerMeta(meta)) {
      return {
        element: elementFromHtml(document, `<p>${MUSIC_PLAYER_PROJECTION_PLACEHOLDER}</p>`, MUSIC_PLAYER_NODE_TYPE),
        type: 'outer',
      }
    }
    const siteOrigin = resolveKobatoImageRenderEnv(context)?.siteOrigin
    const name = escape(meta.name)
    const cover = escape(absolutizeAssetSrcForFeed(meta.cover, siteOrigin))
    const audioUrl = escape(absolutizeAssetSrcForFeed(meta.audioUrl, siteOrigin))
    const element = elementFromHtml(
      document,
      `<figure><img src="${cover}" alt="${name}" /><audio controls preload="none" src="${audioUrl}"></audio><figcaption>🎵 ${name} — ${escape(meta.artist)}</figcaption></figure>`,
      MUSIC_PLAYER_NODE_TYPE,
    )
    return { element, type: 'outer' }
  }

  if (!hasMusicPlayerMeta(meta)) {
    const element = elementFromHtml(
      document,
      `<div class="${MUSIC_PLAYER_CARD_CLASSES.wrapper}"><div class="aplayer" data-id="${escape(meta.playerId)}"></div></div>`,
      MUSIC_PLAYER_NODE_TYPE,
    )
    return { element, type: 'outer' }
  }

  const element = elementFromHtml(
    document,
    `<div class="${MUSIC_PLAYER_CARD_CLASSES.wrapper}"><div class="aplayer" data-id="${escape(meta.playerId)}" data-name="${escape(meta.name)}" data-artist="${escape(meta.artist)}" data-url="${escape(meta.audioUrl)}" data-cover="${escape(meta.cover)}" data-lrc="${escape(meta.lyric)}">${musicPlayerFallbackHtml(meta, escape)}</div></div>`,
    MUSIC_PLAYER_NODE_TYPE,
  )
  return { element, type: 'outer' }
}
