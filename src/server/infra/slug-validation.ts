import { DomainError } from '@/server/infra/http/errors'
import { deriveSlug } from '@/server/infra/slug'
import { DERIVED_SLUG_PATTERN, SLUG_MAX } from '@/shared/slug'

// Route-prefix fence shared by posts and pages. Slug uniqueness across
// the two tables is enforced by `validateSlugFence` at catalog snapshot
// rebuild time, not here.
export const RESERVED_SLUGS = new Set<string>([
  'posts',
  'cats',
  'tags',
  'archives',
  'search',
  'admin',
  'api',
  'feed',
  'sitemap.xml',
  'robots.txt',
])

export function ensureSlugLegal(slug: string, entity: 'post' | 'page'): void {
  const label = entity === 'post' ? '文章' : '页面'
  if (!DERIVED_SLUG_PATTERN.test(slug)) {
    throw new DomainError('BAD_REQUEST', `${label} slug 格式不合法（仅允许小写字母、数字、\`-\`）。`)
  }
  if (slug.length > SLUG_MAX) {
    throw new DomainError('BAD_REQUEST', `${label} slug 长度不得超过 ${SLUG_MAX} 个字符。`)
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new DomainError('BAD_REQUEST', `slug "${slug}" 是站点保留路径。`)
  }
}

// Resolve the effective slug. An explicit non-empty value wins; an
// empty / missing value falls back to `deriveSlug(title)`.
export function resolveSlug(explicit: string | undefined, title: string): string {
  if (typeof explicit === 'string' && explicit.trim() !== '') {
    return explicit.trim()
  }
  const derived = deriveSlug(title)
  if (derived === '') {
    throw new DomainError('BAD_REQUEST', '无法从标题推导出 slug，请手动填写。', [
      { message: '标题推导出空 slug，请手动填写', path: ['slug'] },
    ])
  }
  return derived
}
