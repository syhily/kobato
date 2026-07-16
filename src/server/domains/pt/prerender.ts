import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { Block, NonRecursiveBlock, PortableTextBody } from '@/shared/pt/schema'
import type { MusicPlayerBlockMeta } from '@/shared/types/music'

import { getPublicMusicMetasByIds } from '@/server/domains/music/services/read'
import { visitNestedBlocks } from '@/shared/pt/utils'

/**
 * Walks a PortableText value and resolves `musicPlayer` blocks into SSR-ready
 * metadata. The resolved DTO is embedded into each block's `value.meta` so the
 * React component can render without a client-side fetch.
 *
 * Music players nested inside `solution`, `footnoteDefinition`, and `twoColumn`
 * blocks are also resolved.
 */
export async function prerenderMusicPlayerBlocks(
  db: NodePgDatabase,
  body: PortableTextBody | null,
): Promise<PortableTextBody | null> {
  if (body === null || body.length === 0) {
    return body
  }

  const metaByPlayerId = await resolveMusicPlayerMeta(db, body)
  if (metaByPlayerId.size === 0) {
    return body
  }

  return body.map((block) => enrichBlock(block, metaByPlayerId)) as PortableTextBody
}

async function resolveMusicPlayerMeta(
  db: NodePgDatabase,
  body: PortableTextBody,
): Promise<Map<string, MusicPlayerBlockMeta>> {
  const playerIds = collectMusicPlayerIds(body)
  if (playerIds.length === 0) {
    return new Map()
  }

  const uniqueIds = [...new Set(playerIds)]
  const metas = await getPublicMusicMetasByIds(db, uniqueIds)
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

function collectMusicPlayerIds(body: PortableTextBody): string[] {
  const ids: string[] = []
  visitNestedBlocks(body, (block) => {
    if (block._type === 'musicPlayer') {
      ids.push(block.playerId)
    }
  })
  return ids
}

function enrichBlock(block: Block, metaByPlayerId: Map<string, MusicPlayerBlockMeta>): Block {
  if (block._type === 'musicPlayer') {
    return enrichMusicBlock(block, metaByPlayerId)
  }

  if (block._type === 'solution' || block._type === 'footnoteDefinition') {
    return { ...block, children: block.children.map((child) => enrichNestedBlock(child, metaByPlayerId)) }
  }

  if (block._type === 'twoColumn') {
    return {
      ...block,
      left: block.left.map((child) => enrichNestedBlock(child, metaByPlayerId)),
      right: block.right.map((child) => enrichNestedBlock(child, metaByPlayerId)),
    }
  }

  return block
}

function enrichNestedBlock(
  block: NonRecursiveBlock,
  metaByPlayerId: Map<string, MusicPlayerBlockMeta>,
): NonRecursiveBlock {
  if (block._type === 'musicPlayer') {
    return enrichMusicBlock(block, metaByPlayerId)
  }
  return block
}

function enrichMusicBlock(
  block: Extract<Block, { _type: 'musicPlayer' }>,
  metaByPlayerId: Map<string, MusicPlayerBlockMeta>,
): Extract<Block, { _type: 'musicPlayer' }> {
  const meta = metaByPlayerId.get(block.playerId)
  if (meta === undefined) {
    return block
  }
  return { ...block, meta }
}
