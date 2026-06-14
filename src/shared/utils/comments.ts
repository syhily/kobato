/**
 * Opaque entity reference used in comment URLs and filters.
 * Comments are attached to either a `post` or a `page`; the `ownerId`
 * is the bigint primary key of that entity.
 */
export interface CommentEntityRef {
  type: 'post' | 'page'
  ownerId: bigint
}

/**
 * Parse the `?entity=<type>:<ownerId>` parameter used by the "my comments"
 * self-service view. Malformed values are dropped silently so hand-edited
 * URLs degrade to the unfiltered list instead of producing an error page.
 */
export function parseCommentEntity(raw: string | null | undefined): CommentEntityRef | null {
  if (!raw) {
    return null
  }

  const idx = raw.indexOf(':')
  if (idx <= 0) {
    return null
  }

  const type = raw.slice(0, idx)
  if (type !== 'post' && type !== 'page') {
    return null
  }

  const rest = raw.slice(idx + 1)
  if (!/^\d+$/.test(rest)) {
    return null
  }

  try {
    return { type, ownerId: BigInt(rest) }
  } catch {
    return null
  }
}

/**
 * Serialize a comment entity reference back to the opaque wire form
 * `<type>:<ownerId>` used in combobox values and URL parameters.
 */
export function serializeCommentEntity(entity: CommentEntityRef): string {
  return `${entity.type}:${entity.ownerId}`
}
