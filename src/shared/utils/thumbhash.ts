/**
 * ThumbHash — compact perceptual image hash for blur placeholders.
 * TS port of evanw/thumbhash@0.1.1; snapshot tests guard against
 * drift from the upstream algorithm.
 */

/**
 * Encodes an RGBA image to a ThumbHash. RGB should not be
 * premultiplied by A. Input must be ≤100×100 (`w*h*4` pixels).
 */
export function rgbaToThumbHash(w: number, h: number, rgba: ArrayLike<number>): Uint8Array {
  if (w > 100 || h > 100) {
    throw new Error(`${w}x${h} doesn't fit in 100x100`)
  }

  const { PI, round, max, cos, abs } = Math

  let avgR = 0
  let avgG = 0
  let avgB = 0
  let avgA = 0
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    const alpha = rgba[j + 3] / 255
    avgR += (alpha / 255) * rgba[j]
    avgG += (alpha / 255) * rgba[j + 1]
    avgB += (alpha / 255) * rgba[j + 2]
    avgA += alpha
  }
  if (avgA) {
    avgR /= avgA
    avgG /= avgA
    avgB /= avgA
  }

  const hasAlpha = avgA < w * h
  const lLimit = hasAlpha ? 5 : 7 // Use fewer luminance bits if there's alpha
  const lx = max(1, round(lLimit * (w / max(w, h))))
  const ly = max(1, round(lLimit * (h / max(w, h))))

  const l: number[] = [] // luminance
  const p: number[] = [] // yellow - blue
  const q: number[] = [] // red - green
  const a: number[] = [] // alpha

  // Convert the image from RGBA to LPQA (composite atop the average color)
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    const alpha = rgba[j + 3] / 255
    const r = avgR * (1 - alpha) + (alpha / 255) * rgba[j]
    const g = avgG * (1 - alpha) + (alpha / 255) * rgba[j + 1]
    const b = avgB * (1 - alpha) + (alpha / 255) * rgba[j + 2]
    l[i] = (r + g + b) / 3
    p[i] = (r + g) / 2 - b
    q[i] = r - g
    a[i] = alpha
  }

  // Encode using the DCT into DC (constant) and normalized AC (varying) terms
  function encodeChannel(channel: number[], nx: number, ny: number): [number, number[], number] {
    let dc = 0
    const ac: number[] = []
    let scale = 0
    const fx: number[] = []
    for (let cy = 0; cy < ny; cy++) {
      for (let cx = 0; cx * ny < nx * (ny - cy); cx++) {
        let f = 0
        for (let x = 0; x < w; x++) {
          fx[x] = cos((PI / w) * cx * (x + 0.5))
        }
        for (let y = 0; y < h; y++) {
          const fy = cos((PI / h) * cy * (y + 0.5))
          for (let x = 0; x < w; x++) {
            f += channel[x + y * w] * fx[x] * fy
          }
        }
        f /= w * h
        if (cx || cy) {
          ac.push(f)
          scale = max(scale, abs(f))
        } else {
          dc = f
        }
      }
    }
    if (scale) {
      for (let i = 0; i < ac.length; i++) {
        ac[i] = 0.5 + (0.5 / scale) * ac[i]
      }
    }
    return [dc, ac, scale]
  }

  const [lDC, lAC, lScale] = encodeChannel(l, max(3, lx), max(3, ly))
  const [pDC, pAC, pScale] = encodeChannel(p, 3, 3)
  const [qDC, qAC, qScale] = encodeChannel(q, 3, 3)
  const [aDC, aAC, aScale] = hasAlpha ? encodeChannel(a, 5, 5) : [0, [], 0]

  // Write the constants
  const isLandscape = w > h
  const header24 =
    round(63 * lDC) |
    (round(31.5 + 31.5 * pDC) << 6) |
    (round(31.5 + 31.5 * qDC) << 12) |
    (round(31 * lScale) << 18) |
    (Number(hasAlpha) << 23)
  const header16 =
    (isLandscape ? ly : lx) | (round(63 * pScale) << 3) | (round(63 * qScale) << 9) | (Number(isLandscape) << 15)

  const hash = [header24 & 255, (header24 >> 8) & 255, header24 >> 16, header16 & 255, header16 >> 8]
  const acStart = hasAlpha ? 6 : 5
  let acIndex = 0
  if (hasAlpha) {
    hash.push(round(15 * aDC) | (round(15 * aScale) << 4))
  }

  // Write the varying factors
  const acChannels = hasAlpha ? [lAC, pAC, qAC, aAC] : [lAC, pAC, qAC]
  for (const ac of acChannels) {
    for (const f of ac) {
      hash[acStart + (acIndex >> 1)] |= round(15 * f) << ((acIndex & 1) << 2)
      acIndex++
    }
  }

  return new Uint8Array(hash)
}

/** Decodes a ThumbHash to an RGBA image (RGB not premultiplied by A). */
export function thumbHashToRGBA(hash: ArrayLike<number>): {
  w: number
  h: number
  rgba: Uint8Array
} {
  const { PI, min, max, cos, round } = Math

  // Read the constants
  const header24 = hash[0] | (hash[1] << 8) | (hash[2] << 16)
  const header16 = hash[3] | (hash[4] << 8)
  const lDC = (header24 & 63) / 63
  const pDC = ((header24 >> 6) & 63) / 31.5 - 1
  const qDC = ((header24 >> 12) & 63) / 31.5 - 1
  const lScale = ((header24 >> 18) & 31) / 31
  const hasAlpha = header24 >> 23
  const pScale = ((header16 >> 3) & 63) / 63
  const qScale = ((header16 >> 9) & 63) / 63
  const isLandscape = header16 >> 15
  const lx = max(3, isLandscape ? (hasAlpha ? 5 : 7) : header16 & 7)
  const ly = max(3, isLandscape ? header16 & 7 : hasAlpha ? 5 : 7)
  const aDC = hasAlpha ? (hash[5] & 15) / 15 : 1
  const aScale = hasAlpha ? (hash[5] >> 4) / 15 : 0

  // Read the varying factors (boost saturation by 1.25x to compensate for quantization)
  const acStart = hasAlpha ? 6 : 5
  let acIndex = 0
  function decodeChannel(nx: number, ny: number, scale: number): number[] {
    const ac: number[] = []
    for (let cy = 0; cy < ny; cy++) {
      for (let cx = cy ? 0 : 1; cx * ny < nx * (ny - cy); cx++) {
        ac.push((((hash[acStart + (acIndex >> 1)] >> ((acIndex & 1) << 2)) & 15) / 7.5 - 1) * scale)
        acIndex++
      }
    }
    return ac
  }

  const lAC = decodeChannel(lx, ly, lScale)
  const pAC = decodeChannel(3, 3, pScale * 1.25)
  const qAC = decodeChannel(3, 3, qScale * 1.25)
  const aAC = hasAlpha ? decodeChannel(5, 5, aScale) : null

  // Decode using the DCT into RGB
  const ratio = thumbHashToApproximateAspectRatio(hash)
  const w = round(ratio > 1 ? 32 : 32 * ratio)
  const h = round(ratio > 1 ? 32 / ratio : 32)
  const rgba = new Uint8Array(w * h * 4)

  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i += 4) {
      let l = lDC
      let p = pDC
      let q = qDC
      let a = aDC

      const fx: number[] = []
      const fy: number[] = []
      for (let cx = 0, n = max(lx, hasAlpha ? 5 : 3); cx < n; cx++) {
        fx[cx] = cos((PI / w) * (x + 0.5) * cx)
      }
      for (let cy = 0, n = max(ly, hasAlpha ? 5 : 3); cy < n; cy++) {
        fy[cy] = cos((PI / h) * (y + 0.5) * cy)
      }

      // Decode L
      for (let cy = 0, j = 0; cy < ly; cy++) {
        for (let cx = cy ? 0 : 1, fy2 = fy[cy] * 2; cx * ly < lx * (ly - cy); cx++, j++) {
          l += lAC[j] * fx[cx] * fy2
        }
      }

      // Decode P and Q
      for (let cy = 0, j = 0; cy < 3; cy++) {
        for (let cx = cy ? 0 : 1, fy2 = fy[cy] * 2; cx < 3 - cy; cx++, j++) {
          const f = fx[cx] * fy2
          p += pAC[j] * f
          q += qAC[j] * f
        }
      }

      // Decode A
      if (hasAlpha && aAC) {
        for (let cy = 0, j = 0; cy < 5; cy++) {
          for (let cx = cy ? 0 : 1, fy2 = fy[cy] * 2; cx < 5 - cy; cx++, j++) {
            a += aAC[j] * fx[cx] * fy2
          }
        }
      }

      const b = l - (2 / 3) * p
      const r = (3 * l - b + q) / 2
      const g = r - q
      rgba[i] = max(0, 255 * min(1, r))
      rgba[i + 1] = max(0, 255 * min(1, g))
      rgba[i + 2] = max(0, 255 * min(1, b))
      rgba[i + 3] = max(0, 255 * min(1, a))
    }
  }

  return { w, h, rgba }
}

/** Average color from a ThumbHash; RGB not premultiplied, values 0–1. */
export function thumbHashToAverageRGBA(hash: ArrayLike<number>): {
  r: number
  g: number
  b: number
  a: number
} {
  const { min, max } = Math
  const header = hash[0] | (hash[1] << 8) | (hash[2] << 16)
  const l = (header & 63) / 63
  const p = ((header >> 6) & 63) / 31.5 - 1
  const q = ((header >> 12) & 63) / 31.5 - 1
  const hasAlpha = header >> 23
  const a = hasAlpha ? (hash[5] & 15) / 15 : 1
  const b = l - (2 / 3) * p
  const r = (3 * l - b + q) / 2
  const g = r - q
  return {
    r: max(0, min(1, r)),
    g: max(0, min(1, g)),
    b: max(0, min(1, b)),
    a,
  }
}

/** Approximate aspect ratio of the original image (width / height). */
export function thumbHashToApproximateAspectRatio(hash: ArrayLike<number>): number {
  const header = hash[3]
  const hasAlpha = hash[2] & 0x80
  const isLandscape = hash[4] & 0x80
  const lx = isLandscape ? (hasAlpha ? 5 : 7) : header & 7
  const ly = isLandscape ? header & 7 : hasAlpha ? 5 : 7
  return lx / ly
}

/**
 * Encodes an RGBA image to a PNG data URL (RGB not premultiplied by
 * A). Optimized for speed, not size — uncompressed. Input must be
 * ≤100×100 (`w*h*4` pixels).
 */
export function rgbaToDataURL(w: number, h: number, rgba: ArrayLike<number>): string {
  const row = w * 4 + 1
  const idat = 6 + h * (5 + row)
  const bytes: number[] = [
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
    0,
    0,
    0,
    13,
    73,
    72,
    68,
    82,
    0,
    0,
    w >> 8,
    w & 255,
    0,
    0,
    h >> 8,
    h & 255,
    8,
    6,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    idat >>> 24,
    (idat >> 16) & 255,
    (idat >> 8) & 255,
    idat & 255,
    73,
    68,
    65,
    84,
    120,
    1,
  ]

  const table = [
    0, 498536548, 997073096, 651767980, 1994146192, 1802195444, 1303535960, 1342533948, -306674912, -267414716,
    -690576408, -882789492, -1687895376, -2032938284, -1609899400, -1111625188,
  ]

  let a = 1
  let b = 0
  for (let y = 0, i = 0, end = row - 1; y < h; y++, end += row - 1) {
    bytes.push(y + 1 < h ? 0 : 1, row & 255, row >> 8, ~row & 255, (row >> 8) ^ 255, 0)
    for (b = (b + a) % 65521; i < end; i++) {
      const u = rgba[i] & 255
      bytes.push(u)
      a = (a + u) % 65521
      b = (b + a) % 65521
    }
  }

  bytes.push(b >> 8, b & 255, a >> 8, a & 255, 0, 0, 0, 0, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130)

  for (const [start, endInit] of [
    [12, 29],
    [37, 41 + idat],
  ] as [number, number][]) {
    let c = ~0
    for (let i = start; i < endInit; i++) {
      c ^= bytes[i]
      c = (c >>> 4) ^ table[c & 15]
      c = (c >>> 4) ^ table[c & 15]
    }
    c = ~c
    let end = endInit
    bytes[end++] = c >>> 24
    bytes[end++] = (c >> 16) & 255
    bytes[end++] = (c >> 8) & 255
    bytes[end++] = c & 255
  }

  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return 'data:image/png;base64,' + btoa(binary)
}

export function thumbHashToDataURL(hash: ArrayLike<number>): string {
  const image = thumbHashToRGBA(hash)
  return rgbaToDataURL(image.w, image.h, image.rgba)
}
