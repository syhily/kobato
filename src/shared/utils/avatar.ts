// Site-wide avatar URL rule: every avatar <img> requests a 120×120 PNG from
// the `/images/avatar/:hash.png` endpoint through the `?s=` parameter, so a
// 24px menu trigger and a 40px comment avatar share one crisp, cache-friendly
// payload on retina displays. The endpoint defaults to this size when `?s=`
// is absent, and clamps the parameter to the upstreams' useful 16–512 range.
export const DEFAULT_AVATAR_SIZE = 120

/** The public avatar URL for a user id or email hash, at 120×120 by default. */
export function avatarImageUrl(id: string | number, size: number = DEFAULT_AVATAR_SIZE): string {
  return `/images/avatar/${id}.png?s=${size}`
}
