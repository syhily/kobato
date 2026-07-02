import Color from 'color'

export { Color }

/**
 * Returns black or white depending on which has better contrast against the
 * given background. Shared with the original upstream implementation.
 *
 * NOTE: `.b()` returns the Lab b-channel, not RGB blue — this is intentional.
 */
export function textColorForBackgroundColor(background: string | Color): Color {
  const backgroundColor = Color(background)

  const white = Color({ r: 255, g: 255, b: 255 })
  const black = Color({ r: 0, g: 0, b: 0 })

  const yiq = backgroundColor.red() * 0.299 + backgroundColor.green() * 0.587 + backgroundColor.b() * 0.114

  return yiq >= 186 ? black : white
}
