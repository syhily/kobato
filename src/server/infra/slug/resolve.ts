import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { DomainError } from '@/server/infra/http/errors'
import { deriveSlug } from '@/server/infra/slug/derive'
import { RESERVED_SLUGS } from '@/server/infra/slug/reservation'
import { DERIVED_SLUG_PATTERN, SLUG_MAX } from '@/shared/slug'

export type SlugEntity = 'post' | 'page' | 'taxonomy'

// Explicit non-empty slug wins (validated inline); blank falls back to
// `deriveSlug(name)`. Failures throw `BAD_REQUEST` with `issues` path
// `['slug']`; taxonomy skips the route-prefix fence. The entity noun is the
// machine kind — the catalog's ICU `select` localizes it.
export function resolveSlug(
  explicit: string | undefined,
  fallbackName: string,
  options: { entity: SlugEntity },
): string {
  if (typeof explicit === 'string' && explicit.trim() !== '') {
    const slug = explicit.trim()
    if (!DERIVED_SLUG_PATTERN.test(slug)) {
      const descriptor = descriptorFor('content.error.slugFormat', { entity: options.entity })
      throw new DomainError('BAD_REQUEST', descriptor, [{ ...descriptor, path: ['slug'] }])
    }
    if (slug.length > SLUG_MAX) {
      const descriptor = descriptorFor('content.error.slugTooLong', { entity: options.entity, max: SLUG_MAX })
      throw new DomainError('BAD_REQUEST', descriptor, [{ ...descriptor, path: ['slug'] }])
    }
    if (options.entity !== 'taxonomy' && RESERVED_SLUGS.has(slug)) {
      const descriptor = descriptorFor('content.error.slugReserved', { slug })
      throw new DomainError('BAD_REQUEST', descriptor, [{ ...descriptor, path: ['slug'] }])
    }
    return slug
  }
  const derived = deriveSlug(fallbackName)
  if (derived === '') {
    const descriptor = descriptorFor('content.error.slugUnderivable', {
      source: options.entity === 'taxonomy' ? 'name' : 'title',
    })
    throw new DomainError('BAD_REQUEST', descriptor, [{ ...descriptor, path: ['slug'] }])
  }
  return derived
}
