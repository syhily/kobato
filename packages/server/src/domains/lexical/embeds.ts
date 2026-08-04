import type { PublicMusicMeta } from '@kobato/shared/contracts/music'

// The embed-resolution seam (previously owned by the retired PT track).
// The Lexical body knows that a `musicPlayer` node needs public music
// metadata to render, but the domain graph is a DAG: the body dialect
// must not depend on the music business domain that owns the rows. So
// the dialect declares the minimal input here — player ids in, public
// metas out — and the caller wires the implementation at the call site:
// pass `(playerIds) => getPublicMusicMetasByIds(db, playerIds)` from
// `@kobato/server/domains/music/services/read`. Callers (routes, render, http)
// sit in layers that may import music; the dialect never does.
export type MusicEmbedResolver = (playerIds: readonly string[]) => Promise<Map<string, PublicMusicMeta>>
