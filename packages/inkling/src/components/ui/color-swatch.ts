import type { ColorSwatchData } from '@kobato/inkling-internal/components/ui/ColorPicker'

import { getAccentColor } from '@kobato/inkling-internal/utils/get-accent-color'

export type ColorKeyword = 'accent' | 'transparent' | 'image'
const KEYWORDS: ReadonlySet<string> = new Set<ColorKeyword>(['accent', 'transparent', 'image'])
export function isColorKeyword(value: string): value is ColorKeyword {
  return KEYWORDS.has(value)
}

export function resolveSwatchDisplayColor(
  value: string,
  { transparentAs, rootElement }: { transparentAs: string; rootElement?: HTMLElement | null },
): string {
  if (value === 'accent') {
    return getAccentColor(rootElement)
  }
  if (value === 'image') {
    return 'transparent'
  }
  if (value === 'transparent') {
    return transparentAs
  }
  return value
}

export function resolveSwatchValue(swatch: {
  hex?: string
  accent?: boolean
  transparent?: boolean
}): string | undefined {
  if (swatch.accent) {
    return 'accent'
  }
  if (swatch.transparent) {
    return 'transparent'
  }
  return swatch.hex
}

export function resolveSelectedSwatchTitle(value: string, swatches: ColorSwatchData[]): string | undefined {
  if (value === 'accent') {
    return swatches.find((swatch) => swatch.accent)?.title
  }
  if (value === 'image') {
    return swatches.find((swatch) => swatch.image)?.title
  }
  if (value === 'transparent') {
    return swatches.find((swatch) => swatch.transparent)?.title
  }
  return swatches.find((swatch) => swatch.hex === value)?.title
}
