// The `music-player` host card (plan docs/plans/inkling-editor-replacement.md,
// round R10): kobato's 音乐播放器. The serialized dataset is `playerId` plus
// the save-time meta snapshot (`name` / `artist` / `cover` / `audioUrl` /
// `lyric` — the server-owned keys pinned in `@/shared/lexical/artifacts`
// `MUSIC_PLAYER_META_KEYS`, filled by
// `@/server/domains/pt/lexical-music-snapshot`); unlike PT, nothing resolves
// at request time. Same dual-entry sharing contract as `./solution`.
//
// Full-fidelity markup mirrors the retired PT public renderer (R13 deleted
// `src/ui/pt/`): the wrapper div plus the `.aplayer`
// mount point — carried as data attributes (`data-id` + the meta snapshot)
// so the hydration-enhancement hook (`useMusicPlayers`) builds the
// MusicPlayerCard without a
// server round-trip — plus a static fallback card inside the mount point so
// the no-JS render shows the song instead of an empty box. The feed variant
// reproduces the retired PT rssMode figure (cover/audio absolutized against
// the site origin), or the placeholder paragraph when the snapshot is absent.

import type { DecoratorNodeProperty } from '@/inkling/headless'

import {
  absolutizeAssetSrcForFeed,
  type CardRenderContext,
  type CardRenderOutput,
  elementFromHtml,
  isFeedVariantRender,
} from '@/shared/lexical/cards/card-html'
import { resolveKobatoImageRenderEnv } from '@/shared/lexical/cards/kobato-image'
import { MUSIC_PLAYER_NODE_TYPE } from '@/shared/lexical/node-whitelist'
import { MUSIC_PLAYER_PROJECTION_PLACEHOLDER } from '@/shared/lexical/projection-state'

export const MUSIC_PLAYER_CARD_PROPERTIES = [
  { name: 'playerId', default: '' },
  // The five server-owned meta snapshot keys below MUST stay verbatim-aligned
  // with `MUSIC_PLAYER_META_KEYS` in `@/shared/lexical/artifacts`.
  { name: 'name', default: '', wordCount: true },
  { name: 'artist', default: '', wordCount: true },
  { name: 'cover', default: '', urlType: 'url' },
  { name: 'audioUrl', default: '', urlType: 'url' },
  { name: 'lyric', default: '' },
] as const satisfies readonly DecoratorNodeProperty[]

/** Classes shared by the exportDOM markup and the decorate chrome. The
 * `fallback*` set mirrors the `MusicPlayerCard` paused initial render
 * (`@/ui/public/music-player/music-player`) so the hydration swap does not
 * shift layout — pinned by the snap/parity tests. */
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

/** The meta view both render states consume. All fields default to ''. */
export interface MusicPlayerCardMeta {
  playerId: string
  name: string
  artist: string
  cover: string
  audioUrl: string
  lyric: string
}

/** Reads the meta snapshot off the generated node (its dataset type). */
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

/** The snapshot counts as present when the resolver embedded it — the five
 * meta keys are written together, so the audio URL is the witness. */
export function hasMusicPlayerMeta(meta: MusicPlayerCardMeta): boolean {
  return meta.audioUrl !== ''
}

/**
 * The static fallback card markup (inside the `.aplayer` mount point,
 * replaced by the hydrated `MusicPlayerCard`; the decorate chrome renders the
 * same structure from these constants). It mirrors the player's paused
 * initial render — cover/glyph + meta + an inert progress row (`0:00` /
 * `--:--` + empty track) — so the hydration swap does not shift layout.
 * `escape` is the caller's text escaper — the server renderer passes
 * `context.escapeText`, the React side relies on JSX escaping and never
 * calls this.
 */
export function musicPlayerFallbackHtml(meta: MusicPlayerCardMeta, escape: (value: string) => string): string {
  const cover =
    meta.cover === ''
      ? `<span class="${MUSIC_PLAYER_CARD_CLASSES.fallbackGlyph}" aria-hidden="true">🎵</span>`
      : `<img class="${MUSIC_PLAYER_CARD_CLASSES.fallbackCover}" src="${escape(meta.cover)}" alt="${escape(meta.name)}" />`
  const body = `<div class="${MUSIC_PLAYER_CARD_CLASSES.fallbackBody}">${cover}<div class="${MUSIC_PLAYER_CARD_CLASSES.fallbackMeta}"><div class="${MUSIC_PLAYER_CARD_CLASSES.fallbackName}">${escape(meta.name)}</div><div class="${MUSIC_PLAYER_CARD_CLASSES.fallbackArtist}">${escape(meta.artist)}</div></div></div>`
  const progress = `<div class="${MUSIC_PLAYER_CARD_CLASSES.fallbackProgress}"><span class="${MUSIC_PLAYER_CARD_CLASSES.fallbackTime}">0:00</span><div class="${MUSIC_PLAYER_CARD_CLASSES.fallbackBar}"><div class="${MUSIC_PLAYER_CARD_CLASSES.fallbackBarTrack}"></div></div><span class="${MUSIC_PLAYER_CARD_CLASSES.fallbackTimeTotal}">--:--</span></div>`
  return `<div class="${MUSIC_PLAYER_CARD_CLASSES.fallback}" data-music-player-fallback="">${body}${progress}</div>`
}

/** The exportDOM render (both variants). */
export function renderMusicPlayerCard(node: MusicPlayerCardMeta, context: CardRenderContext): CardRenderOutput {
  const document = context.createDocument()
  const raw = musicPlayerCardMeta(node)
  const escape = context.escapeText
  // Render-boundary URL policy: the snapshot is server-resolved (a forged
  // client body is stripped at canonicalize), but the media keys still go
  // through the render context's safe-URL seam before hitting markup.
  const meta = { ...raw, cover: context.safeUrl('media', raw.cover), audioUrl: context.safeUrl('media', raw.audioUrl) }

  if (isFeedVariantRender(context)) {
    if (!hasMusicPlayerMeta(meta)) {
      return {
        element: elementFromHtml(document, `<p>${MUSIC_PLAYER_PROJECTION_PLACEHOLDER}</p>`, MUSIC_PLAYER_NODE_TYPE),
        type: 'outer',
      }
    }
    // PT rssMode parity (the retired pt-html renderMusicPlayer): cover and
    // audio join the site origin — feed readers resolve URLs off-origin. The
    // origin arrives through the image render env (answered for both passes).
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
    // Today's SSR placeholder for an unresolved player (MusicPlayer.tsx).
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
