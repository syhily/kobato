// The `music-player` host card (plan docs/plans/inkling-editor-replacement.md,
// round R10): kobato's 音乐播放器. The serialized dataset is `playerId` plus
// the save-time meta snapshot (`name` / `artist` / `cover` / `audioUrl` /
// `lyric` — the server-owned keys pinned in `@/shared/lexical/artifacts`
// `MUSIC_PLAYER_META_KEYS`, filled by
// `@/server/domains/pt/lexical-music-snapshot`); unlike PT, nothing resolves
// at request time. Same dual-entry sharing contract as `./solution`.
//
// Full-fidelity markup mirrors the existing public renderer
// (`src/ui/pt/blocks/MusicPlayer.tsx`): the wrapper div plus the `.aplayer`
// mount point — carried as data attributes (`data-id` + the meta snapshot)
// so R13's hydration-enhancement script builds the APlayer without a
// server round-trip — plus a static fallback card inside the mount point so
// the no-JS render shows the song instead of an empty box. The feed variant
// reproduces the PT rssMode figure (`src/server/render/pt-html.ts`
// renderMusicPlayer), or the placeholder paragraph when the snapshot is
// absent.

import type { DecoratorNodeProperty } from '@inkling/editor/headless'

import {
  type CardRenderContext,
  type CardRenderOutput,
  elementFromHtml,
  isFeedVariantRender,
} from '@/shared/lexical/cards/card-html'
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

/** Classes shared by the exportDOM markup and the decorate chrome. */
export const MUSIC_PLAYER_CARD_CLASSES = {
  wrapper: 'mt-5 mb-[1.375rem] max-w-[21.875rem] max-xl:mx-auto max-md:mx-0 max-md:mt-0 max-md:mb-5 max-md:max-w-full',
  fallback: 'flex items-center gap-3 rounded-md border border-border p-3',
  fallbackCover: 'size-11 shrink-0 rounded object-cover',
  fallbackGlyph: 'flex size-11 shrink-0 items-center justify-center rounded bg-ink-3/10',
  fallbackMeta: 'min-w-0',
  fallbackName: 'truncate text-sm font-medium text-ink',
  fallbackArtist: 'truncate text-xs text-ink-3',
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
 * replaced by the hydrated APlayer; the decorate chrome renders the same
 * structure from these constants). `escape` is the caller's text escaper —
 * the server renderer passes `context.escapeText`, the React side relies on
 * JSX escaping and never calls this.
 */
export function musicPlayerFallbackHtml(meta: MusicPlayerCardMeta, escape: (value: string) => string): string {
  const cover =
    meta.cover === ''
      ? `<span class="${MUSIC_PLAYER_CARD_CLASSES.fallbackGlyph}" aria-hidden="true">🎵</span>`
      : `<img class="${MUSIC_PLAYER_CARD_CLASSES.fallbackCover}" src="${escape(meta.cover)}" alt="${escape(meta.name)}" />`
  return `<div class="${MUSIC_PLAYER_CARD_CLASSES.fallback}" data-music-player-fallback="">${cover}<div class="${MUSIC_PLAYER_CARD_CLASSES.fallbackMeta}"><div class="${MUSIC_PLAYER_CARD_CLASSES.fallbackName}">${escape(meta.name)}</div><div class="${MUSIC_PLAYER_CARD_CLASSES.fallbackArtist}">${escape(meta.artist)}</div></div></div>`
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
    // PT rssMode parity (pt-html.ts renderMusicPlayer).
    const name = escape(meta.name)
    const element = elementFromHtml(
      document,
      `<figure><img src="${escape(meta.cover)}" alt="${name}" /><audio controls preload="none" src="${escape(meta.audioUrl)}"></audio><figcaption>🎵 ${name} — ${escape(meta.artist)}</figcaption></figure>`,
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
