export const DEFAULT_COMMENT_BADGE_BACKGROUND = '#007a82'

const LIGHT_TEXT = '#ffffff'
const DARK_TEXT = '#151b2b'

interface Rgb {
  r: number
  g: number
  b: number
}

interface CommentBadgeSource {
  badgeName: string | null
  badgeColor: string | null
  // Optional explicit override stored on the user row. When non-empty
  // it short-circuits the WCAG auto-pick below; legacy rows without an
  // override pass `null`/`undefined` and keep the historical behaviour.
  badgeTextColor?: string | null
}

export function commentBadgeTextColor(backgroundColor: string | null | undefined): string {
  const background = parseHexColor(backgroundColor) ?? parseHexColor(DEFAULT_COMMENT_BADGE_BACKGROUND)
  if (background === null) {
    return LIGHT_TEXT
  }

  const lightContrast = contrastRatio(background, { r: 255, g: 255, b: 255 })
  const darkContrast = contrastRatio(background, parseHexColor(DARK_TEXT)!)
  return darkContrast > lightContrast ? DARK_TEXT : LIGHT_TEXT
}

export function withCommentBadgeTextColor<T extends CommentBadgeSource>(
  comment: T,
): T & { badgeTextColor: string | null } {
  if (!comment.badgeName) {
    // No badge → no text colour to project.
    return { ...comment, badgeTextColor: null }
  }
  // Honour the admin-set override verbatim when present (after a trim
  // sanity check), otherwise fall back to the WCAG-based auto-pick so
  // accounts that never customised the field render exactly as before.
  const override = comment.badgeTextColor?.trim()
  return {
    ...comment,
    badgeTextColor: override ? override : commentBadgeTextColor(comment.badgeColor),
  }
}

function parseHexColor(color: string | null | undefined): Rgb | null {
  const raw = color?.trim()
  if (!raw) {
    return null
  }

  const hex = raw.startsWith('#') ? raw.slice(1) : raw
  const normalized =
    hex.length === 3 || hex.length === 4
      ? hex
          .slice(0, 3)
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : hex.slice(0, 6)

  if (!/^[\da-f]{6}$/i.test(normalized)) {
    return null
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const lighter = Math.max(relativeLuminance(a), relativeLuminance(b))
  const darker = Math.min(relativeLuminance(a), relativeLuminance(b))
  return (lighter + 0.05) / (darker + 0.05)
}

function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b)
}

function linearChannel(value: number): number {
  const channel = value / 255
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}
