import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type {
  InklingBlockNode,
  InklingDocument,
  InklingMusicCardNode,
  InklingNonRecursiveBlockNode,
} from '@/shared/inkling/schema'
import type { MusicPlayerBlockMeta } from '@/shared/types/music'

import { getMusicMetaForPlayer } from '@/server/domains/music/services/read'
import { walkInkling } from '@/shared/inkling/walk'

/**
 * Walks an Inkling document and resolves `music-card` blocks into SSR-ready
 * metadata. The resolved DTO is embedded into each block's `meta` so the React
 * component can render without a client-side fetch.
 *
 * Music cards nested inside `solution`, `two-column`, and `footnote-definition`
 * blocks are also resolved.
 */
export async function prerenderInklingMusicPlayers(
  db: NodePgDatabase,
  document: InklingDocument | null,
): Promise<InklingDocument | null> {
  if (document === null) {
    return null
  }

  const playerIds = collectMusicPlayerIds(document)
  if (playerIds.length === 0) {
    return document
  }

  const metaByPlayerId = await resolveMusicPlayerMeta(db, playerIds)
  if (metaByPlayerId.size === 0) {
    return document
  }

  return enrichDocument(document, metaByPlayerId)
}

async function resolveMusicPlayerMeta(
  db: NodePgDatabase,
  playerIds: string[],
): Promise<Map<string, MusicPlayerBlockMeta>> {
  const uniqueIds = [...new Set(playerIds)]
  if (uniqueIds.length === 0) {
    return new Map()
  }

  const map = new Map<string, MusicPlayerBlockMeta>()

  await Promise.all(
    uniqueIds.map(async (playerId) => {
      const meta = await getMusicMetaForPlayer(db, playerId)
      if (meta === null) {
        return
      }
      map.set(playerId, {
        id: meta.id,
        name: meta.name,
        artist: meta.artist,
        cover: meta.pic,
        audioUrl: meta.url,
        lyric: meta.lyric,
      })
    }),
  )

  return map
}

function collectMusicPlayerIds(document: InklingDocument): string[] {
  const ids: string[] = []

  walkInkling(
    document,
    {
      music: (node) => {
        ids.push(node.playerId)
      },
    },
    undefined,
  )

  return ids
}

function enrichDocument(document: InklingDocument, metaByPlayerId: Map<string, MusicPlayerBlockMeta>): InklingDocument {
  return {
    ...document,
    root: {
      ...document.root,
      children: document.root.children.map((child) => enrichBlock(child, metaByPlayerId)),
    },
  }
}

function enrichBlock(block: InklingBlockNode, metaByPlayerId: Map<string, MusicPlayerBlockMeta>): InklingBlockNode {
  if (block.type === 'music-card') {
    return enrichMusicBlock(block, metaByPlayerId)
  }
  if (block.type === 'solution' || block.type === 'footnote-definition') {
    return { ...block, children: block.children.map((child) => enrichNonRecursiveBlock(child, metaByPlayerId)) }
  }
  if (block.type === 'two-column') {
    return {
      ...block,
      left: block.left.map((child) => enrichNonRecursiveBlock(child, metaByPlayerId)),
      right: block.right.map((child) => enrichNonRecursiveBlock(child, metaByPlayerId)),
    }
  }
  return block
}

function enrichNonRecursiveBlock(
  block: InklingNonRecursiveBlockNode,
  metaByPlayerId: Map<string, MusicPlayerBlockMeta>,
): InklingNonRecursiveBlockNode {
  if (block.type === 'music-card') {
    return enrichMusicBlock(block, metaByPlayerId)
  }
  return block
}

function enrichMusicBlock(
  block: InklingMusicCardNode,
  metaByPlayerId: Map<string, MusicPlayerBlockMeta>,
): InklingMusicCardNode {
  const meta = metaByPlayerId.get(block.playerId)
  if (meta === undefined) {
    return block
  }
  return { ...block, meta }
}
