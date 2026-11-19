import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'
import { deriveSlug } from '@kobato/server/infra/slug/derive.ts'
import { RESERVED_SLUGS } from '@kobato/server/infra/slug/reservation.ts'
import { DERIVED_SLUG_PATTERN, SLUG_MAX } from '@kobato/utils/slug.ts'

export type SlugEntity = 'post' | 'page' | 'taxonomy'

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
