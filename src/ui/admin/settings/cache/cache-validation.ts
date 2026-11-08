import type { CacheBucketId } from '@/shared/types/cache'
import type { I18nValue } from '@/ui/lib/I18nProvider'

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
  t: I18nValue['t'],
): string | null {
  function collides(a: string, b: string): boolean {
    return a === b || a.startsWith(b) || b.startsWith(a)
  }

  const trimmed = draft.prefix.trim()
  if (trimmed.length === 0) {
    return t('admin.settings.cache.validation.prefixRequired')
  }
  if (!PREFIX_PATTERN.test(trimmed)) {
    return t('admin.settings.cache.validation.prefixPattern')
  }
  const reserved = RESERVED_PREFIXES.find((slot) => collides(trimmed, slot))
  if (reserved !== undefined) {
    return t('admin.settings.cache.validation.reserved', { prefix: reserved })
  }
  // Defensive skip: an "other" entry sharing this card's bucket id shouldn't exist.
  for (const other of others) {
    if (other.id === bucketId) {
      continue
    }
    if (collides(trimmed, other.prefix)) {
      return t('admin.settings.cache.validation.collision', { bucket: other.id, prefix: other.prefix })
    }
  }
  return null
}
