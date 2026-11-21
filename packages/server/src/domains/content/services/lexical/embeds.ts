import type { PublicMusicMeta } from '@kobato/contracts/music'

export type MusicEmbedResolver = (playerIds: readonly string[]) => Promise<Map<string, PublicMusicMeta>>
