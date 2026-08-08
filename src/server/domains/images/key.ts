import { DomainError } from '@/server/infra/http/errors'

// S3 object key generator. Generic keys are unique per upload (always
// insert); category/friend keys are state keys — re-upload with the same
// slug/host overwrites.

export type ImageKindSpec =
  | { kind: 'generic'; now: Date }
  | { kind: 'category'; slug: string }
  | { kind: 'friend'; host: string }

const SAFE_PATH_SEGMENT = /^[a-z0-9._-]+$/

/**
 * Whitelist guard for state-key path segments; rejects `/` (path
 * traversal) and any non-ASCII byte.
 */
function assertSafePathSegment(value: string, label: string): string {
  if (!SAFE_PATH_SEGMENT.test(value)) {
    throw new DomainError('BAD_REQUEST', `${label}只能使用 ASCII 字母、数字、\`.\`、\`_\`、\`-\``, [
      { message: `非法${label}: \`${value}\``, path: [label] },
    ])
  }
  return value
}

export function buildObjectKey(spec: ImageKindSpec): string {
  switch (spec.kind) {
    case 'generic': {
      const yyyy = spec.now.getUTCFullYear().toString().padStart(4, '0')
      const MM = String(spec.now.getUTCMonth() + 1).padStart(2, '0')
      const dd = String(spec.now.getUTCDate()).padStart(2, '0')
      const HH = String(spec.now.getUTCHours()).padStart(2, '0')
      const mm = String(spec.now.getUTCMinutes()).padStart(2, '0')
      const ss = String(spec.now.getUTCSeconds()).padStart(2, '0')
      // Deliberate `% 100` of ms (JS lacks ns precision) — key format pinned.
      const nn = String(spec.now.getUTCMilliseconds() % 100).padStart(2, '0')
      return `images/${yyyy}/${MM}/${yyyy}${MM}${dd}${HH}${mm}${ss}${nn}.jpg`
    }
    case 'category':
      return `images/categories/${assertSafePathSegment(spec.slug, '分类 slug')}.jpg`
    case 'friend':
      return `images/links/${assertSafePathSegment(spec.host, '友链 host')}.jpg`
  }
}

/**
 * Normalise a friend's homepage URL into a bare hostname for the S3 key
 * segment; throws `DomainError('BAD_REQUEST')` on invalid URLs.
 */
export function extractHostForFriendKey(homepage: string): string {
  let host: string
  try {
    host = new URL(homepage).hostname.toLowerCase()
  } catch {
    throw new DomainError('BAD_REQUEST', '友链主页 URL 无效，无法提取 host', [
      { message: '主页 URL 无效', path: ['homepage'] },
    ])
  }
  if (host === '') {
    throw new DomainError('BAD_REQUEST', '友链主页 URL 无效，无法提取 host', [
      { message: '主页 URL 无效', path: ['homepage'] },
    ])
  }
  return assertSafePathSegment(host, '友链 host')
}
