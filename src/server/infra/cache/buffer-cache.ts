import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Buffer } from 'node:buffer'

import { createInflight } from '@/server/infra/cache/inflight'
import { getItemRaw, setItemRaw } from '@/server/infra/cache/kv-store'

// Coalesce concurrent loaders for the same key — without this, a cold OG /
// calendar / avatar image getting hit by 50 simultaneous requests right after
// a deploy would render 50 times in parallel before the first write to
// `kv_cache` is observable to the rest.
const bufferInflight = createInflight<Buffer>()

export async function loadBuffer(
  db: NodePgDatabase,
  key: string,
  loader: () => Promise<Buffer>,
  ttl: number,
  bucket: string,
): Promise<Buffer> {
  // Single kv_cache round-trip on the hot path: `getItemRaw` returns the
  // value when present and `null` otherwise, replacing the previous
  // `hasItem` + `getItemRaw` pair (and the non-null assertion that came with
  // it). The `bufferInflight` below still dedupes concurrent cold loads so
  // a deploy spike doesn't fan out into N parallel renders.
  if (import.meta.env.PROD) {
    const cached = await getItemRaw(db, key)
    if (cached !== null) {
      return cached
    }
  }
  return bufferInflight(key, async () => {
    const buffer = await loader()
    await setItemRaw(db, key, buffer, { ttlSeconds: ttl, bucket })
    return buffer
  })
}
