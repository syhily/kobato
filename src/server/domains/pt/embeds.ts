import type { PublicMusicMeta } from '@/shared/contracts/music'

// The embed-resolution seam owned by PT. PortableText is the wire/storage
// format domain (CONTEXT.md): it knows that a `musicPlayer` block needs
// public music metadata to render, but it must not depend on the music
// business domain that owns the rows (the domain graph is a DAG). So PT
// declares the minimal input here — player ids in, public metas out — and
// the caller wires the implementation at the call site: pass
// `(playerIds) => getPublicMusicMetasByIds(db, playerIds)` from
// `@/server/domains/music/services/read`. Callers (routes, render, http)
// sit in layers that may import music; PT never does.
export type MusicEmbedResolver = (playerIds: readonly string[]) => Promise<Map<string, PublicMusicMeta>>
