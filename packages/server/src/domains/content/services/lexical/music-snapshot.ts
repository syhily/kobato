import type { LexicalEditorState } from '@kobato/inkling/headless/schema'
import type { MusicEmbedResolver } from '@kobato/server/domains/content/services/lexical/embeds'

import { collectLexicalMusicPlayerIds } from '@kobato/inkling/headless/collect'
import { visitLexicalNodes } from '@kobato/inkling/headless/walk'
import { getLogger } from '@kobato/server/infra/logger'
import { parseAssetUrl } from '@kobato/server/infra/storage/public-url'

const log = getLogger('lexical.music-snapshot')

function toOriginRelativeAssetUrl(url: string): string {
  if (url === '') {
    return url
  }
  const parsed = parseAssetUrl(url, { anyOrigin: true })
  return parsed === null ? url : `${parsed.route}${parsed.key}`
}

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
