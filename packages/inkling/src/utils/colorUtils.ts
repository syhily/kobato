// Native color helpers (replacing the `color` package): hex parsing,
// UPPERCASE hex serialization, the Lab b-channel the upstream contrast
// formula relies on, and the `Color` call signature its consumers use.
// Behavior is pinned byte-for-byte by test/utils/colorUtils.test.ts —
// including the quirk that `b()` returns the Lab b-channel, NOT RGB blue
// (intentional; it flips #cccccc to white text).

export interface ColorInstance {
  hex(): string
  red(): number
  green(): number
  /** The Lab b-channel (NOT RGB blue) — the upstream quirk, preserved. */
  b(): number
}

interface Rgb {
  r: number
  g: number
  b: number
}

function toHexChannel(value: number): string {
  return Math.round(value).toString(16).padStart(2, '0')
}

function rgbToHex({ r, g, b }: Rgb): string {
  return `#${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(b)}`.toUpperCase()
}

function hexToRgb(hex: string): Rgb {
  const match = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) {
    throw new Error(`Unable to parse color: ${hex}`)
  }
  const value = match[1]
  if (value.length === 3) {
    return {
      r: parseInt(value[0] + value[0], 16),
      g: parseInt(value[1] + value[1], 16),
      b: parseInt(value[2] + value[2], 16),
    }
  }
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  }
}

// sRGB (D65) → CIE L*a*b* b-channel
function rgbToLabB({ r, g, b }: Rgb): number {
  const linearize = (channel: number) => {
    const c = channel / 255
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const rl = linearize(r)
  const gl = linearize(g)
  const bl = linearize(b)

  const y = rl * 0.2126 + gl * 0.7152 + bl * 0.0722
  const z = rl * 0.0193 + gl * 0.1192 + bl * 0.9505

  const pivot = (t: number) => {
    const delta = 6 / 29
    return t > delta * delta * delta ? Math.cbrt(t) : t / (3 * delta * delta) + 4 / 29
  }

  return 200 * (pivot(y / 1.0) - pivot(z / 1.08883))
}

function isRgb(value: unknown): value is Rgb {
  return (
    typeof value === 'object' &&
    value !== null &&
    'r' in value &&
    'g' in value &&
    'b' in value &&
    typeof value.r === 'number' &&
    typeof value.g === 'number' &&
    typeof value.b === 'number'
  )
}

class NativeColor implements ColorInstance {
  private readonly rgb: Rgb

  constructor(input: string | Rgb | ColorInstance) {
    if (typeof input === 'string') {
      this.rgb = hexToRgb(input)
    } else if (input instanceof NativeColor) {
      this.rgb = input.rgb
    } else if ('hex' in input && typeof input.hex === 'function') {
      this.rgb = hexToRgb(input.hex())
    } else if (isRgb(input)) {
      this.rgb = { r: input.r, g: input.g, b: input.b }
    } else {
      throw new Error('Unable to parse color')
    }
  }

  hex(): string {
    return rgbToHex(this.rgb)
  }

  red(): number {
    return this.rgb.r
  }

  green(): number {
    return this.rgb.g
  }

  b(): number {
    return rgbToLabB(this.rgb)
  }
}

/** The `color` package's call signature: hex string, `{ r, g, b }`, or another instance. */
export function Color(input: string | Rgb | ColorInstance): ColorInstance {
  return new NativeColor(input)
}

/**
 * Returns black or white depending on which has better contrast against the
 * given background. Shared with the original upstream implementation.
 *
 * NOTE: `.b()` returns the Lab b-channel, not RGB blue — this is intentional.
 */
export function textColorForBackgroundColor(background: string | ColorInstance): ColorInstance {
  const backgroundColor = Color(background)

  const white = Color({ r: 255, g: 255, b: 255 })
  const black = Color({ r: 0, g: 0, b: 0 })

  const yiq = backgroundColor.red() * 0.299 + backgroundColor.green() * 0.587 + backgroundColor.b() * 0.114

  return yiq >= 186 ? black : white
}
