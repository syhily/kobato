import type { Image, SKRSContext2D } from '@napi-rs/canvas'
import type { Buffer } from 'node:buffer'

import { Canvas, loadImage } from '@napi-rs/canvas'

import { compressImage } from '@/server/infra/image/compress'
import { ensureCanvasFont, type FontSlot } from '@/server/render/canvas-fonts'
import { logoDark } from '@/server/render/og/assets'
import { requireBlogSettingsSection } from '@/shared/config/getters'

// Statically imported; the SEA bundler redirects the platform addon load to nativeRequire.

/**
 * Draw the OpenGraph card. Based on yuaanlin/yual.in's og_image code
 * (no license; reuse approved by the author — https://twitter.com/yuaanlin).
 */
function getStringWidth(text: string, fontSize: number) {
  let result = 0
  for (let idx = 0; idx < text.length; idx++) {
    if (text.charCodeAt(idx) > 255) {
      result += fontSize
    } else {
      result += fontSize * 0.5
    }
  }
  return result
}

function printAt(
  context: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  lineHeight: number,
  fitWidth: number,
  fontSize: number,
) {
  const width = fitWidth || 0

  if (width <= 0) {
    context.fillText(text, x, y)
    return
  }

  for (let idx = 1; idx <= text.length; idx++) {
    const str = text.substring(0, idx)
    if (getStringWidth(str, fontSize) > width) {
      // Always advance one char: a lone glyph wider than fitWidth would otherwise recurse forever.
      const end = Math.max(idx - 1, 1)
      context.fillText(text.substring(0, end), x, y)
      printAt(context, text.substring(end), x, y + lineHeight, lineHeight, width, fontSize)
      return
    }
  }
  context.fillText(text, x, y)
}

// Modified snippet from https://stackoverflow.com/questions/21961839/simulation-background-size-cover-in-canvas
function drawImageProp(
  ctx: SKRSContext2D,
  img: Image,
  x: number,
  y: number,
  w: number,
  h: number,
  offsetX: number,
  offsetY: number,
) {
  let ox = offsetX
  if (offsetX < 0) {
    ox = 0
  }
  if (offsetX > 1) {
    ox = 1
  }
  let oy = offsetY
  if (offsetY < 0) {
    oy = 0
  }
  if (offsetY > 1) {
    oy = 1
  }

  const iw = img.width
  const ih = img.height
  const r = Math.min(w / iw, h / ih)

  let nw = iw * r
  let nh = ih * r
  let ar = 1

  if (nw < w) {
    ar = w / nw
  }
  if (Math.abs(ar - 1) < 1e-14 && nh < h) {
    ar = h / nh
  }
  nw *= ar
  nh *= ar

  let cw = iw / (nw / w)
  let ch = ih / (nh / h)

  let cx = (iw - cw) * ox
  let cy = (ih - ch) * oy

  if (cx < 0) {
    cx = 0
  }
  if (cy < 0) {
    cy = 0
  }
  if (cw > iw) {
    cw = iw
  }
  if (ch > ih) {
    ch = ih
  }

  ctx.drawImage(img, cx, cy, cw, ch, x, y, w, h)
}

export interface OpenGraphProps {
  title: string
  summary: string
  cover: string
}

// Font registration lives in `render/canvas-fonts.ts` (`ensureCanvasFont`) —
// one single-flight per slot, shared with the calendar renderer.
function ensureFonts(): Promise<FontSlot | null> {
  return ensureCanvasFont('og')
}

export async function drawOpenGraph({ title, summary, cover }: OpenGraphProps): Promise<Buffer> {
  const ogFontSlot = await ensureFonts()
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const seo = requireBlogSettingsSection('seo')

  const [coverImage, logoBuffer] = await Promise.all([loadImage(cover), logoDark()])
  const logoImage = await loadImage(logoBuffer)

  let description = summary.replace(/<[^>]+>/g, '').trim()
  if (description.length > 80) {
    description = `${description.slice(0, 80)} ...`
  }

  const canvas = new Canvas(seo.og.width, seo.og.height)
  const ctx = canvas.getContext('2d')
  drawImageProp(ctx, coverImage, 0, 0, seo.og.width, seo.og.height, 0.5, 0.5)
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(0, 0, seo.og.width, seo.og.height)
  ctx.save()

  const ogFont = ogFontSlot?.family ?? 'sans-serif'

  ctx.fillStyle = '#e0c2bb'
  ctx.font = `900 70px ${ogFont}`
  printAt(ctx, siteIdentity.title, 96, 180, 96, seo.og.width, 70)

  ctx.drawImage(logoImage, 940, 120, 160, 160)

  ctx.fillStyle = '#fff'
  ctx.font = `800 48px ${ogFont}`
  printAt(ctx, title, 96, seo.og.height / 2 - 64, 96, seo.og.width - 192, 64)

  ctx.font = `600 36px ${ogFont}`
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  printAt(ctx, description, 96, seo.og.height - 200, 48, seo.og.width - 192, 36)

  ctx.restore()

  const encodedImage = await canvas.encode('png')
  return compressImage(encodedImage)
}
