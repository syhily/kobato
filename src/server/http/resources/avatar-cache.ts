import { Buffer } from 'node:buffer'

import { createInflight } from '@/server/infra/redis/inflight'
import { storage } from '@/server/infra/redis/storage'
import { getCacheSettings } from '@/shared/config/getters'

export interface Avatar {
  status: AvatarStatus
  buffer: Buffer | null
}

export enum AvatarStatus {
  HAVE_AVATAR = 0,
  NO_AVATAR = 1,
}

// Dedupe concurrent loads for the same email so a hot avatar (e.g. the site
// owner appearing in every comment thread) only round-trips Redis once per
// concurrent burst instead of once per requesting comment.
const avatarInflight = createInflight<Avatar | null>()

// Prefix + TTL pulled from the live snapshot so an admin rename in
// `/admin/settings/cache` applies to the next read / write. Old keys
// under the previous prefix age out at their stored TTL.
function avatarConfig(): { prefix: string; ttlSeconds: number } {
  return getCacheSettings().cache.avatar
}
const avatarKey = (email: string, size: number): string => `${avatarConfig().prefix}${size}:${email}`

// The fetch size is part of the cache key: the endpoint serves the size its
// caller asked for via `?s=` (120 by default), and the upstream is queried
// at exactly that size — a 120px entry must never serve a `?s=512` request
// (or vice versa). Entries under sizes nobody requests anymore age out at
// their stored TTL, same as a prefix rename.

// Single-key cache layout (was two keys: `avatar-status-${email}` plus
// `avatar-${email}`). Byte 0 is the status sentinel, the rest is the
// avatar payload (only present for HAVE_AVATAR).
//
// The previous two-key layout cost two Redis round-trips on every
// non-cached avatar render (status GET → payload GET); this design halves
// that to a single GET and removes the cross-key consistency footgun
// where the status key could outlive its payload (or vice versa) if a
// write was interrupted.
function encodeAvatar(status: AvatarStatus, buffer: Buffer | null): Buffer {
  if (status === AvatarStatus.NO_AVATAR || buffer === null) {
    return Buffer.from([AvatarStatus.NO_AVATAR])
  }
  const out = Buffer.allocUnsafe(buffer.length + 1)
  out[0] = AvatarStatus.HAVE_AVATAR
  buffer.copy(out, 1)
  return out
}

function decodeAvatar(payload: unknown): Avatar | null {
  if (!Buffer.isBuffer(payload) || payload.length === 0) {
    return null
  }
  const status = payload[0] as AvatarStatus
  if (status === AvatarStatus.NO_AVATAR) {
    return { status, buffer: null }
  }
  if (status === AvatarStatus.HAVE_AVATAR) {
    return { status, buffer: payload.subarray(1) as Buffer }
  }
  return null
}

export async function loadAvatar(email: string, size: number): Promise<Avatar | null> {
  const key = avatarKey(email, size)
  return avatarInflight(key, async () => {
    const payload = await storage.getItemRaw(key)
    return decodeAvatar(payload)
  })
}

export async function cacheAvatar(
  args:
    | { email: string; size: number; buffer: Buffer; status: AvatarStatus.HAVE_AVATAR }
    | { email: string; size: number; status: AvatarStatus.NO_AVATAR },
) {
  const buffer = args.status === AvatarStatus.HAVE_AVATAR ? args.buffer : null
  await storage.setItemRaw(avatarKey(args.email, args.size), encodeAvatar(args.status, buffer), {
    ttl: avatarConfig().ttlSeconds,
  })
}
