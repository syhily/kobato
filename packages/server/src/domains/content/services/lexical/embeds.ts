import type { PublicMusicMeta } from '@kobato/contracts/music.ts'

// Lexical-owned seam for `musicPlayer` embeds: player ids in, public metas out.
// Lexical must not depend on the music domain — callers wire the implementation
// (e.g. `getPublicMusicMetasByIds`) at the call site.
export type MusicEmbedResolver = (playerIds: readonly string[]) => Promise<Map<string, PublicMusicMeta>>
