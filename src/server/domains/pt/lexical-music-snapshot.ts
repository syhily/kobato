import type { MusicEmbedResolver } from '@/server/domains/pt/embeds'
import type { LexicalEditorState } from '@/shared/lexical/schema'

import { getLogger } from '@/server/infra/logger'
import { collectLexicalMusicPlayerIds } from '@/shared/lexical/collect'
import { visitLexicalNodes } from '@/shared/lexical/walk'

const log = getLogger('pt.lexical-music-snapshot')

// The Lexical music contract flips PT's "store playerId-only, enrich at
// request time" into "resolve at save time and embed a meta snapshot"
// (plan docs/plans/inkling-editor-replacement.md, round R9a) — the headless
// HTML projection is synchronous and has no resolver, so the dataset must
// carry the meta. The snapshot goes stale when the library row changes;
// that is the accepted trade-off. Field names live in
// `@/shared/lexical/artifacts` (`MUSIC_PLAYER_META_KEYS`) — R10's
// `defineCard` reads exactly those keys.

/**
 * Resolves every `music-player` node's `playerId` through the injected
 * music-domain resolver and writes the meta snapshot (`name` / `artist` /
 * `cover` / `audioUrl` / `lyric`) into the node dataset, in place. Nodes
 * whose playerId fails to resolve keep their stripped (meta-less) shape; a
 * throwing resolver degrades the whole pass to a log line — a save must
 * never fail because the music library hiccuped.
 */
export async function snapshotMusicPlayerMeta(
  state: LexicalEditorState,
  resolveMusicEmbeds: MusicEmbedResolver,
): Promise<void> {
  const playerIds = collectLexicalMusicPlayerIds(state)
  if (playerIds.length === 0) {
    return
  }

  let metas: Awaited<ReturnType<MusicEmbedResolver>>
  try {
    metas = await resolveMusicEmbeds(playerIds)
  } catch (err) {
    log.warn('music meta snapshot failed; music-player nodes stay meta-less', { error: String(err) })
    return
  }

  visitLexicalNodes(state, (node) => {
    if (node.type !== 'music-player') {
      return
    }
    const record = node as Record<string, unknown>
    const playerId = record.playerId
    if (typeof playerId !== 'string' || playerId === '') {
      return
    }
    const meta = metas.get(playerId)
    if (meta === undefined) {
      return
    }
    record.name = meta.name
    record.artist = meta.artist
    record.cover = meta.pic
    record.audioUrl = meta.url
    record.lyric = meta.lyric
  })
}
