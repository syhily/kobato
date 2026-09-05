import type { ColorSwatchData } from '@/components/ui/ColorPicker'

import { getAccentColor } from '@/utils/getAccentColor'

/**
 * The swatch keyword grammar — the one home of the color-value vocabulary
 * the color picker speaks: the `'accent'` / `'transparent'` / `'image'`
 * keywords versus a raw hex. The ColorPicker (hex input color), the
 * ColorIndicator (button paint + selected-swatch title), and the
 * ColorSwatch (select mapping) used to each re-resolve it; the per-context
 * divergence (what `'transparent'` paints as) arrives as data. The accent
 * VALUE itself stays with header-accent-color — this module owns the
 * grammar, not the palette.
 */

export type ColorKeyword = 'accent' | 'transparent' | 'image'

const KEYWORDS: ReadonlySet<string> = new Set<ColorKeyword>(['accent', 'transparent', 'image'])

export function isColorKeyword(value: string): value is ColorKeyword {
  return KEYWORDS.has(value)
}

/**
 * The display color for a value: `'accent'` resolves through
 * getAccentColor, `'image'` paints transparent (the icon carries the
 * meaning), `'transparent'` paints as the caller's stand-in (`''` for the
 * picker's HexColorPicker, `'white'` for the indicator button), and a raw
 * hex passes through.
 */
export function resolveSwatchDisplayColor(value: string, { transparentAs }: { transparentAs: string }): string {
  if (value === 'accent') {
    return getAccentColor()
  }
  if (value === 'image') {
    return 'transparent'
  }
  if (value === 'transparent') {
    return transparentAs
  }
  return value
}

/** The value a swatch selects: its keyword when it carries one, else its hex. */
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

/** The title of the swatch a value selects, if any — the keyword lookups first, then the hex match. */
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
