/** Opaque entity reference in comment URLs and filters: `post`/`page` + the bigint primary key. */
export interface CommentEntityRef {
  type: 'post' | 'page'
  ownerId: number
}

/** Parse the `?entity=<type>:<ownerId>` param; malformed values drop silently to the unfiltered list. */
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
    return { type, ownerId: Number(rest) }
  } catch {
    return null
  }
}

/** Serialize an entity ref to the opaque wire form `<type>:<ownerId>` used in combobox values / URL params. */
export function serializeCommentEntity(entity: CommentEntityRef): string {
  return `${entity.type}:${entity.ownerId}`
}
