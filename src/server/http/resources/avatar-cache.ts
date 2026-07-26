import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { get, set } from '@/server/infra/cache/registry'

export interface Avatar {
  status: AvatarStatus
  buffer: Buffer | null
}

// The numeric values are part of the persisted byte protocol — byte 0 of
// the cached blob is this sentinel. The encoder / decoder lives in the
// avatar declaration of `@/server/infra/cache/registry`; keep the enum
// values in sync with it (0 = payload follows, 1 = negative entry).
export enum AvatarStatus {
  HAVE_AVATAR = 0,
  NO_AVATAR = 1,
}

// Concurrent reads of the same email coalesce inside the cache module,
// so a hot avatar (e.g. the site owner appearing in every comment
// thread) only round-trips kv_cache once per concurrent burst instead of
// once per requesting comment.
export async function loadAvatar(db: NodePgDatabase, email: string, size: number): Promise<Avatar | null> {
  return get<'avatar', Avatar>(db, 'avatar', { size, email })
}

export async function cacheAvatar(
  db: NodePgDatabase,
  args:
    | { email: string; size: number; buffer: Buffer; status: AvatarStatus.HAVE_AVATAR }
    | { email: string; size: number; status: AvatarStatus.NO_AVATAR },
) {
  const buffer = args.status === AvatarStatus.HAVE_AVATAR ? args.buffer : null
  const entry: Avatar = { status: args.status, buffer }
  await set(db, 'avatar', { size: args.size, email: args.email }, entry)
}
