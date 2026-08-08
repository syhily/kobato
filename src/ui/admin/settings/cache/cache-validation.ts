import type { CacheBucketId } from '@/shared/types/cache'

import { PREFIX_PATTERN, RESERVED_PREFIXES, SECONDS_PER_HOUR } from '@/ui/admin/settings/cache/cache-constants'

export interface BucketDraft {
  prefix: string
  ttlHours: number
}

export function snapshotFromSettings(settings: { prefix: string; ttlSeconds: number }): BucketDraft {
  return {
    prefix: settings.prefix,
    ttlHours: Math.round(settings.ttlSeconds / SECONDS_PER_HOUR),
  }
}

export function draftsEqual(a: BucketDraft, b: BucketDraft): boolean {
  return a.prefix === b.prefix && a.ttlHours === b.ttlHours
}

// Conflict error for another bucket's or a reserved system prefix; `null` when acceptable.
export function validateBucket(
  draft: BucketDraft,
  bucketId: CacheBucketId,
  others: { id: CacheBucketId; prefix: string }[],
): string | null {
  function collides(a: string, b: string): boolean {
    return a === b || a.startsWith(b) || b.startsWith(a)
  }

  const trimmed = draft.prefix.trim()
  if (trimmed.length === 0) {
    return '前缀不能为空'
  }
  if (!PREFIX_PATTERN.test(trimmed)) {
    return '前缀只能包含字母 / 数字 / `_` / `-`，且必须以 `-` 或 `:` 结尾'
  }
  const reserved = RESERVED_PREFIXES.find((slot) => collides(trimmed, slot))
  if (reserved !== undefined) {
    return `与系统保留前缀 \`${reserved}\` 冲突，请换一个名字`
  }
  // Defensive skip: an "other" entry sharing this card's bucket id shouldn't exist.
  for (const other of others) {
    if (other.id === bucketId) {
      continue
    }
    if (collides(trimmed, other.prefix)) {
      return `与「${other.id}」的前缀 \`${other.prefix}\` 冲突，会让前缀扫描互相误伤`
    }
  }
  return null
}
