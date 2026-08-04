import { DomainError } from '@kobato/server/infra/http/errors'

// S3 object key generator for the three upload entry points. Pure
// functions only — no DB, no S3, no settings — so the unit tests can
// exercise every branch without setup. See AGENTS.md for the rationale
// behind the three key shapes:
//
//   - generic   → `images/yyyy/MM/yyyyMMddHHmmssNN.jpg` (always insert,
//                 timestamp picks practically-unique key)
//   - category  → `images/categories/<slug>.jpg`        (state key,
//                 re-upload with same slug overwrites)
//   - friend    → `images/links/<host>.jpg`             (state key,
//                 re-upload with same host overwrites)

export type ImageKindSpec =
  | { kind: 'generic'; now: Date }
  | { kind: 'category'; slug: string }
  | { kind: 'friend'; host: string }

const SAFE_PATH_SEGMENT = /^[a-z0-9._-]+$/

/**
 * Whitelist guard for the path segment of state-keyed kinds. Forbids
 * anything that could let the caller smuggle a `/` (path traversal) or
 * a non-printable / non-ASCII byte (defence against typos that the S3
 * SDK would technically accept but the operator would never recognise
 * in the dashboard).
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
      // JS has no nanosecond precision: the closest analogue to the
      // referenced Go snippet `nano % 100` is `getUTCMilliseconds() % 100`,
      // which is documented in AGENTS.md so a future archeology dig
      // doesn't try to "fix" it back.
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
 * Normalise a friend's `homepage` URL into a bare hostname suitable for
 * use as an S3 key segment. Strips scheme / port / path / query /
 * fragment, lowercases the host, and rejects anything that doesn't
 * survive the safe-segment whitelist.
 *
 * Examples:
 *   `https://blog.foo.com/bar?q=1` → `blog.foo.com`
 *   `http://Example.COM:8080`      → `example.com`
 *   `not-a-url`                    → throws `DomainError('BAD_REQUEST')`
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
