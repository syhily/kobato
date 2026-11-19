import type { PublicMusicMeta } from '@kobato/contracts/music.ts'

export type MusicEmbedResolver = (playerIds: readonly string[]) => Promise<Map<string, PublicMusicMeta>>
