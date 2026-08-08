import type { MusicEmbedResolver } from '@/server/domains/pt/embeds'
import type { EnrichedBlock, EnrichedPortableTextBody } from '@/shared/pt/enriched'
import type { Block, PortableTextBody } from '@/shared/pt/schema'
import type { MusicPlayerBlockMeta } from '@/shared/types/music'

import { collectMusicPlayerIds, mapNestedBlocks } from '@/shared/pt/utils'

/**
 * Resolves `musicPlayer` blocks into SSR-ready metadata embedded in each
 * block's `value.meta`; enrichment is request-scoped — the stored body
 * stays storage-pure.
 */
export async function prerenderMusicPlayerBlocks(
  body: PortableTextBody | null,
  resolveMusicEmbeds: MusicEmbedResolver,
): Promise<EnrichedPortableTextBody | null> {
  if (body === null || body.length === 0) {
    return body
  }

  const metaByPlayerId = await resolveMusicPlayerMeta(body, resolveMusicEmbeds)
  if (metaByPlayerId.size === 0) {
    return body
  }

  return mapNestedBlocks(body, (block) => enrichBlock(block, metaByPlayerId))
}

async function resolveMusicPlayerMeta(
  body: PortableTextBody,
  resolveMusicEmbeds: MusicEmbedResolver,
): Promise<Map<string, MusicPlayerBlockMeta>> {
  const playerIds = collectMusicPlayerIds(body)
  if (playerIds.length === 0) {
    return new Map()
  }

  const metas = await resolveMusicEmbeds(playerIds)
  const map = new Map<string, MusicPlayerBlockMeta>()
  for (const [playerId, meta] of metas) {
    map.set(playerId, {
      id: meta.id,
      name: meta.name,
      artist: meta.artist,
      cover: meta.pic,
      audioUrl: meta.url,
      lyric: meta.lyric,
    })
  }
  return map
}

function enrichBlock(block: Block, metaByPlayerId: Map<string, MusicPlayerBlockMeta>): EnrichedBlock {
  if (block._type !== 'musicPlayer') {
    return block
  }
  const meta = metaByPlayerId.get(block.playerId)
  if (meta === undefined) {
    return block
  }
  return { ...block, meta }
}
