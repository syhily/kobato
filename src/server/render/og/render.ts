import type { Image, SKRSContext2D } from '@napi-rs/canvas'
import type { Buffer } from 'node:buffer'

import { Canvas, loadImage } from '@napi-rs/canvas'

import { compressImage } from '@/server/infra/image/compress'
import { ensureCanvasFont, type FontSlot } from '@/server/render/canvas-fonts'
import { logoDark } from '@/server/render/og/assets'
import { layoutCanvasLines } from '@/server/render/pretext-layout'
import { requireBlogSettingsSection } from '@/shared/config/getters'

// Statically imported; the SEA bundler redirects the platform addon load to nativeRequire.

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

  const description = summary.replace(/<[^>]+>/g, '').trim()

  const canvas = new Canvas(seo.og.width, seo.og.height)
  const ctx = canvas.getContext('2d')
  drawImageProp(ctx, coverImage, 0, 0, seo.og.width, seo.og.height, 0.5, 0.5)
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(0, 0, seo.og.width, seo.og.height)
  ctx.save()

  const ogFont = ogFontSlot?.family ?? 'sans-serif'
  const textWidth = seo.og.width - 192

  ctx.fillStyle = '#e0c2bb'
  const siteTitleFont = `900 70px ${ogFont}`
  const siteTitleLines = layoutCanvasLines(ctx, siteIdentity.title, siteTitleFont, textWidth, 2)
  ctx.font = siteTitleFont
  siteTitleLines.forEach((line, index) => ctx.fillText(line, 96, 180 + index * 96))

  ctx.drawImage(logoImage, 940, 120, 160, 160)

  ctx.fillStyle = '#fff'
  const titleFont = `800 48px ${ogFont}`
  const titleLines = layoutCanvasLines(ctx, title, titleFont, textWidth, 2)
  ctx.font = titleFont
  titleLines.forEach((line, index) => ctx.fillText(line, 96, seo.og.height / 2 - 64 + index * 96))

  const summaryFont = `600 36px ${ogFont}`
  const summaryLines = layoutCanvasLines(ctx, description, summaryFont, textWidth, 3)
  ctx.font = summaryFont
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  summaryLines.forEach((line, index) => ctx.fillText(line, 96, seo.og.height - 200 + index * 48))

  ctx.restore()

  const encodedImage = await canvas.encode('png')
  return compressImage(encodedImage)
}
