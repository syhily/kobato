import type { MusicEmbedResolver } from '@kobato/server/domains/pt/embeds.ts'
import type { LexicalEditorState } from '@kobato/shared/lexical/schema.ts'

import { getLogger } from '@kobato/server/infra/logger.ts'
import { parseAssetUrl } from '@kobato/server/infra/storage/public-url.ts'
import { collectLexicalMusicPlayerIds } from '@kobato/shared/lexical/collect.ts'
import { visitLexicalNodes } from '@kobato/shared/lexical/walk.ts'

const log = getLogger('pt.lexical-music-snapshot')

// The Lexical music contract resolves metas at SAVE time and embeds a snapshot
// in the node dataset: the headless HTML projection is synchronous and has no
// resolver. The snapshot goes stale when the library row changes — the accepted
// trade-off. Field names: `MUSIC_PLAYER_META_KEYS` (`@/shared/lexical/artifacts`).
//
// Media URLs (`cover` / `audioUrl`) are stored ORIGIN-RELATIVE
// (`/storage/<key>`), never absolute: an absolute URL bakes the save-time
// `siteIdentity.website` into stored content, so a database copy served from
// another origin points media at the old one. The feed variant re-absolutizes
// against the CURRENT site origin (`absolutizeAssetSrcForFeed`).

/** Site-owned asset URL (absolute or already relative) → origin-relative form; anything else passes through. */
function toOriginRelativeAssetUrl(url: string): string {
  if (url === '') {
    return url
  }
  const parsed = parseAssetUrl(url, { anyOrigin: true })
  return parsed === null ? url : `${parsed.route}${parsed.key}`
}

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
    record.cover = toOriginRelativeAssetUrl(meta.pic)
    record.audioUrl = toOriginRelativeAssetUrl(meta.url)
    record.lyric = meta.lyric
  })
}
