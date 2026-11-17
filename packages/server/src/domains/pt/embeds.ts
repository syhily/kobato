import type { PublicMusicMeta } from '@kobato/shared/contracts/music.ts'

// PT-owned seam for `musicPlayer` embeds: player ids in, public metas out.
// PT must not depend on the music domain — callers wire the implementation
// (e.g. `getPublicMusicMetasByIds`) at the call site.
export type MusicEmbedResolver = (playerIds: readonly string[]) => Promise<Map<string, PublicMusicMeta>>
