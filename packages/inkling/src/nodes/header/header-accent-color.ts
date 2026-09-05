import { FastAverageColor } from 'fast-average-color'

import { Color, textColorForBackgroundColor } from '@/utils'
import { getAccentColor } from '@/utils/getAccentColor'

// Header accent color — the one owner of the header card's color policy
// (previously inline in HeaderCard, reachable only through the full settings
// panel): the 'accent' keyword resolution, the transparency-over-white
// merge, the readable-counterpart pick, and the async background-image
// resolution behind it all. HeaderCard keeps only the race guard and the
// write.

/**
 * Resolves a header color token to a hex value: the 'accent' keyword reads
 * the host accent color; everything else passes through trimmed.
 */
export function headerHexColor(color: string): string {
  if (color === 'accent') {
    return getAccentColor().trim()
  }
  return color.trim()
}

/**
 * The text color matching a header background: 'transparent' matches
 * nothing (keeps the inherited color); everything else gets a readable
 * counterpart for the resolved hex.
 */
export function matchingHeaderTextColor(color: string): string {
  return color === 'transparent' ? '' : textColorForBackgroundColor(headerHexColor(color)).hex()
}

/**
 * Converts a semi-transparent color to a fully opaque one by merging it
 * over a white background (a transparent image's average reads as
 * semi-transparent).
 */
export function mergeWhiteColor({ r, g, b, a }: { r: number; g: number; b: number; a: number }): string {
  const aPercentage = a / 255

  return Color({
    r: r * aPercentage + 255 * (1 - aPercentage),
    g: g * aPercentage + 255 * (1 - aPercentage),
    b: b * aPercentage + 255 * (1 - aPercentage),
  }).hex()
}

/**
 * Resolves the text color matching a header background IMAGE: averages the
 * image (defaulting to white when it can't be read), merges transparency
 * over white, and picks a readable counterpart. Returns null when the
 * policy doesn't apply — no src, the split layout (whose media panel owns
 * its background), or the image failed to average — so the caller keeps the
 * current color.
 */
export async function resolveHeaderImageTextColor(
  src: string | undefined,
  layout: string | undefined,
): Promise<string | null> {
  if (!src || layout === 'split') {
    return null
  }

  try {
    const color = await new FastAverageColor().getColorAsync(src, { defaultColor: [255, 255, 255, 255] })
    const correctedHex = mergeWhiteColor({
      r: color.value[0],
      g: color.value[1],
      b: color.value[2],
      a: color.value[3],
    })
    return matchingHeaderTextColor(correctedHex)
  } catch {
    // failed to load/average the image — keep the current text color
    return null
  }
}
