import { Color, textColorForBackgroundColor } from '@kobato/inkling-internal/utils'
import { getAccentColor } from '@kobato/inkling-internal/utils/get-accent-color'
import { FastAverageColor } from 'fast-average-color'

export function headerHexColor(color: string, rootElement?: HTMLElement | null): string {
  if (color === 'accent') {
    return getAccentColor(rootElement).trim()
  }
  return color.trim()
}

export function matchingHeaderTextColor(color: string, rootElement?: HTMLElement | null): string {
  return color === 'transparent' ? '' : textColorForBackgroundColor(headerHexColor(color, rootElement)).hex()
}

export function mergeWhiteColor({ r, g, b, a }: { r: number; g: number; b: number; a: number }): string {
  const aPercentage = a / 255
  return Color({
    r: r * aPercentage + 255 * (1 - aPercentage),
    g: g * aPercentage + 255 * (1 - aPercentage),
    b: b * aPercentage + 255 * (1 - aPercentage),
  }).hex()
}

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
    return null
  }
}
