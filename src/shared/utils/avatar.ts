// Site-wide avatar URL rule: every avatar <img> requests 120×120 PNG from
// `/images/avatar/:hash.png` via `?s=`; the endpoint clamps to 16–512 and
// rounds up to fixed size buckets (32/64/128/256) to bound the cache keys.
export const DEFAULT_AVATAR_SIZE = 120

// Avatar upstream chain, evaluated in admin-configured order
// (`comments.avatar.sources`); the site default avatar is the implicit
// final fallback and never appears in the list.
export const AVATAR_SOURCES = ['qq', 'github', 'gravatar'] as const

export type AvatarSource = (typeof AVATAR_SOURCES)[number]

/** The public avatar URL for a user id or email hash, at 120×120 by default. */
export function avatarImageUrl(id: string | number, size: number = DEFAULT_AVATAR_SIZE): string {
  return `/images/avatar/${id}.png?s=${size}`
}
