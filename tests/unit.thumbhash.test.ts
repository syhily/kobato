import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import {
  rgbaToDataURL,
  rgbaToThumbHash,
  thumbHashToApproximateAspectRatio,
  thumbHashToAverageRGBA,
  thumbHashToDataURL,
  thumbHashToRGBA,
} from '@/shared/utils/thumbhash'

// Snapshots generated once from npm thumbhash@0.1.1. If the algorithm ever
// changes intentionally, delete this file and rerun the generator script.
const SNAPSHOTS: Array<{
  name: string
  source: { w: number; h: number }
  hashBase64: string
  decoded: { w: number; h: number; rgbaBase64: string }
  averageRGBA: { r: number; g: number; b: number; a: number }
  aspectRatio: number
  thumbHashToDataURL: string
  rgbaToDataURL: string
}> = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/thumbhash/snapshots.json'), 'utf-8'))

const FIXTURE_DIR = resolve(__dirname, 'fixtures/thumbhash')

async function loadRGBA(path: string): Promise<{ w: number; h: number; rgba: Uint8Array }> {
  const { data, info } = await sharp(path)
    .resize(100, 100, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return {
    w: info.width,
    h: info.height,
    rgba: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

describe('thumbhash', () => {
  it('has fixture images and snapshots', () => {
    expect(SNAPSHOTS.length).toBe(5)
    for (const s of SNAPSHOTS) {
      expect(readFileSync(resolve(FIXTURE_DIR, s.name)).length).toBeGreaterThan(0)
    }
  })

  it('rgbaToThumbHash produces identical hashes', async () => {
    for (const s of SNAPSHOTS) {
      const { w, h, rgba } = await loadRGBA(resolve(FIXTURE_DIR, s.name))
      const hash = rgbaToThumbHash(w, h, rgba)
      expect(bytesToBase64(hash)).toBe(s.hashBase64)
    }
  })

  it('thumbHashToRGBA round-trips dimensions and pixels', async () => {
    for (const s of SNAPSHOTS) {
      const hash = Uint8Array.from(atob(s.hashBase64), (c) => c.charCodeAt(0))
      const decoded = thumbHashToRGBA(hash)
      expect(decoded.w).toBe(s.decoded.w)
      expect(decoded.h).toBe(s.decoded.h)
      expect(bytesToBase64(decoded.rgba)).toBe(s.decoded.rgbaBase64)
    }
  })

  it('thumbHashToAverageRGBA matches snapshot', async () => {
    for (const s of SNAPSHOTS) {
      const hash = Uint8Array.from(atob(s.hashBase64), (c) => c.charCodeAt(0))
      const avg = thumbHashToAverageRGBA(hash)
      expect(avg.r).toBe(s.averageRGBA.r)
      expect(avg.g).toBe(s.averageRGBA.g)
      expect(avg.b).toBe(s.averageRGBA.b)
      expect(avg.a).toBe(s.averageRGBA.a)
    }
  })

  it('thumbHashToApproximateAspectRatio matches snapshot', async () => {
    for (const s of SNAPSHOTS) {
      const hash = Uint8Array.from(atob(s.hashBase64), (c) => c.charCodeAt(0))
      expect(thumbHashToApproximateAspectRatio(hash)).toBe(s.aspectRatio)
    }
  })

  it('rgbaToDataURL produces identical PNGs', async () => {
    for (const s of SNAPSHOTS) {
      const hash = Uint8Array.from(atob(s.hashBase64), (c) => c.charCodeAt(0))
      const decoded = thumbHashToRGBA(hash)
      expect(rgbaToDataURL(decoded.w, decoded.h, decoded.rgba)).toBe(s.rgbaToDataURL)
    }
  })

  it('thumbHashToDataURL produces identical PNGs', async () => {
    for (const s of SNAPSHOTS) {
      const hash = Uint8Array.from(atob(s.hashBase64), (c) => c.charCodeAt(0))
      expect(thumbHashToDataURL(hash)).toBe(s.thumbHashToDataURL)
    }
  })

  it('handles images with transparency', async () => {
    const rgba = new Uint8Array([255, 0, 0, 128, 0, 255, 0, 128, 0, 0, 255, 128, 255, 255, 255, 128])
    const hash = rgbaToThumbHash(2, 2, rgba)
    expect(hash).toBeInstanceOf(Uint8Array)
    expect(hash.length).toBeGreaterThan(0)
    const decoded = thumbHashToRGBA(hash)
    // thumbhash decodes to a fixed minimum size regardless of original dimensions
    expect(decoded.w).toBeGreaterThanOrEqual(1)
    expect(decoded.h).toBeGreaterThanOrEqual(1)
    expect(decoded.rgba).toBeInstanceOf(Uint8Array)
    expect(decoded.rgba.length).toBe(decoded.w * decoded.h * 4)
  })

  it('handles small images', async () => {
    const rgba = new Uint8Array([255, 0, 0, 255])
    const hash = rgbaToThumbHash(1, 1, rgba)
    expect(hash).toBeInstanceOf(Uint8Array)
    expect(hash.length).toBeGreaterThan(0)
    const decoded = thumbHashToRGBA(hash)
    expect(decoded.w).toBeGreaterThanOrEqual(1)
    expect(decoded.h).toBeGreaterThanOrEqual(1)
    expect(decoded.rgba).toBeInstanceOf(Uint8Array)
    expect(decoded.rgba.length).toBe(decoded.w * decoded.h * 4)
  })
})
