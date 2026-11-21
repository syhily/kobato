import type { PublicMusicMeta } from '@kobato/api/contracts/music'

export type MusicEmbedResolver = (playerIds: readonly string[]) => Promise<Map<string, PublicMusicMeta>>
