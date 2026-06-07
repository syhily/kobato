import type { PublicMusicMeta as MusicMeta } from '@/shared/types/music'

import { orpc } from '@/client/api/client'

/**
 * Fetch music metadata by id for the browser-side APlayer.
 * Goes through the internal /rpc/music.get RPC endpoint.
 */
export async function loadMusic(id: string): Promise<MusicMeta | null> {
  try {
    const res = await orpc.music.get({ id })
    return (res.music as MusicMeta | null) ?? null
  } catch (err) {
    console.warn('Failed to load music:', err)
    return null
  }
}
