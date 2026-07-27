import { DomainError } from '@/server/infra/http/errors'
import { deriveSlug } from '@/server/infra/slug/derive'
import { RESERVED_SLUGS } from '@/server/infra/slug/reservation'
import { DERIVED_SLUG_PATTERN, SLUG_MAX } from '@/shared/slug'

export type SlugEntity = 'post' | 'page' | 'taxonomy'

// The single fused slug resolver. An explicit non-empty value wins and is
// validated inline (pattern, length, and — for posts/pages only — the
// route-prefix fence); blank / missing falls back to `deriveSlug(name)`.
// Every failure throws `DomainError('BAD_REQUEST', ...)` carrying a
// zod-style `issues` array with path `['slug']` so editor errors attach
// to the slug field. Taxonomy slugs skip the fence because they are never
// mounted at a route prefix of their own.
export function resolveSlug(
  explicit: string | undefined,
  fallbackName: string,
  options: { entity: SlugEntity },
): string {
  if (typeof explicit === 'string' && explicit.trim() !== '') {
    const slug = explicit.trim()
    if (options.entity === 'taxonomy') {
      if (!DERIVED_SLUG_PATTERN.test(slug)) {
        throw new DomainError('BAD_REQUEST', 'slug 格式不合法（仅允许小写字母、数字、`-`）。', [
          { message: 'slug 格式不合法', path: ['slug'] },
        ])
      }
      if (slug.length > SLUG_MAX) {
        throw new DomainError('BAD_REQUEST', `slug 长度不得超过 ${SLUG_MAX} 个字符。`, [
          { message: `slug 长度不得超过 ${SLUG_MAX} 个字符`, path: ['slug'] },
        ])
      }
      return slug
    }
    const label = options.entity === 'post' ? '文章' : '页面'
    if (!DERIVED_SLUG_PATTERN.test(slug)) {
      throw new DomainError('BAD_REQUEST', `${label} slug 格式不合法（仅允许小写字母、数字、\`-\`）。`, [
        { message: `${label} slug 格式不合法`, path: ['slug'] },
      ])
    }
    if (slug.length > SLUG_MAX) {
      throw new DomainError('BAD_REQUEST', `${label} slug 长度不得超过 ${SLUG_MAX} 个字符。`, [
        { message: `${label} slug 长度不得超过 ${SLUG_MAX} 个字符`, path: ['slug'] },
      ])
    }
    if (RESERVED_SLUGS.has(slug)) {
      throw new DomainError('BAD_REQUEST', `slug "${slug}" 是站点保留路径。`, [
        { message: `slug "${slug}" 是站点保留路径`, path: ['slug'] },
      ])
    }
    return slug
  }
  const derived = deriveSlug(fallbackName)
  if (derived === '') {
    const fallbackLabel = options.entity === 'taxonomy' ? '名称' : '标题'
    throw new DomainError('BAD_REQUEST', `无法从${fallbackLabel}推导出 slug，请手动填写。`, [
      { message: `${fallbackLabel}推导出空 slug，请手动填写`, path: ['slug'] },
    ])
  }
  return derived
}
