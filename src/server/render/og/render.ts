import type { Image, SKRSContext2D } from '@napi-rs/canvas'
import type { Buffer } from 'node:buffer'

import { Canvas, GlobalFonts, loadImage } from '@napi-rs/canvas'

import { compressImage } from '@/server/render/image-compress'
import { logoDark, oppoSans } from '@/server/render/og/assets'
import { requireBlogSettingsSection } from '@/shared/config/blog'

/**
 * Generate the open graph.
 * It's highly inspired by the code from https://github.com/yuaanlin/yual.in/blob/main/pages/og_image/%5Bslug%5D.tsx
 * The original open source code don't have any license.
 * But I have get the approvement to use them here by asking the author https://twitter.com/yuaanlin.
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

// Print text on SKRSContext with wrapping
function printAt(
  context: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  lineHeight: number,
  fitWidth: number,
  fontSize: number,
) {
  // Avoid invalid fitWidth.
  const width = fitWidth || 0

  if (width <= 0) {
    context.fillText(text, x, y)
    return
  }

  for (let idx = 1; idx <= text.length; idx++) {
    const str = text.substring(0, idx)
    if (getStringWidth(str, fontSize) > width) {
      context.fillText(text.substring(0, idx - 1), x, y)
      printAt(context, text.substring(idx - 1), x, y + lineHeight, lineHeight, width, fontSize)
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
  // keep bounds [0.0, 1.0]
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

  // new prop.width
  let nw = iw * r
  // new prop.height
  let nh = ih * r
  let ar = 1

  // decide which gap to fill
  if (nw < w) {
    ar = w / nw
  }
  if (Math.abs(ar - 1) < 1e-14 && nh < h) {
    ar = h / nh
  } // updated
  nw *= ar
  nh *= ar

  // calc source rectangle
  let cw = iw / (nw / w)
  let ch = ih / (nh / h)

  let cx = (iw - cw) * ox
  let cy = (ih - ch) * oy

  // make sure source rectangle is valid
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

  // fill image in dest. rectangle
  ctx.drawImage(img, cx, cy, cw, ch, x, y, w, h)
}

export interface OpenGraphProps {
  title: string
  summary: string
  cover: string
}

// Single-flight font registration: if a deploy spike fires 50 OG
// renders in parallel, only the first one fetches the TTF — the rest
// await the same Promise. Buffer is null when the admin hasn't
// configured the URL yet (or the fetch failed); in that case we skip
// `GlobalFonts.register` and Canvas falls back to its built-in CJK
// shaper so the OG image still renders, just with system typography.
//
// CRITICAL: the single-flight promise must NOT memoize the "skipped"
// path. If the admin starts with an empty URL, paste a URL later, and
// we'd kept a resolved no-op promise here, every subsequent render
// would short-circuit on that cached resolution and never re-attempt
// the fetch — the dynamic-URL strategy would only take effect after a
// process restart. So we clear `ogFontReady` whenever the font is
// *not* registered after the work runs, both on success-but-null and
// on caught error.
let ogFontReady: Promise<void> | null = null
function ensureFonts(): Promise<void> {
  // Fast path: font already registered. No promise indirection needed.
  if (GlobalFonts.has('OPPOSans')) {
    return Promise.resolve()
  }
  if (ogFontReady === null) {
    ogFontReady = (async () => {
      const buffer = await oppoSans()
      if (buffer !== null && !GlobalFonts.has('OPPOSans')) {
        GlobalFonts.register(buffer, 'OPPOSans')
      }
    })()
      .catch((err) => {
        ogFontReady = null
        throw err
      })
      .finally(() => {
        // If the work resolved without actually registering (null
        // buffer, snapshot race), drop the single-flight so the next
        // render re-reads settings and re-fetches.
        if (!GlobalFonts.has('OPPOSans')) {
          ogFontReady = null
        }
      })
  }
  return ogFontReady
}

export async function drawOpenGraph({ title, summary, cover }: OpenGraphProps): Promise<Buffer> {
  await ensureFonts()
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const seo = requireBlogSettingsSection('seo')

  // Fetch the cover image as the background
  const [coverImage, logoImage] = await Promise.all([loadImage(cover), loadImage(logoDark())])

  // Mark sure the summary length is small enough to fit in
  let description = summary.replace(/<[^>]+>/g, '').trim()
  if (description.length > 80) {
    description = `${description.slice(0, 80)} ...`
  }

  // Start drawing the open graph
  const canvas = new Canvas(seo.og.width, seo.og.height)
  const ctx = canvas.getContext('2d')
  drawImageProp(ctx, coverImage, 0, 0, seo.og.width, seo.og.height, 0.5, 0.5)
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(0, 0, seo.og.width, seo.og.height)
  ctx.save()

  // Add website title
  ctx.fillStyle = '#e0c2bb'
  ctx.font = '900 70px OPPOSans'
  printAt(ctx, siteIdentity.title, 96, 180, 96, seo.og.width, 70)

  // Add website logo
  ctx.drawImage(logoImage, 940, 120, 160, 160)

  // Add article title
  ctx.fillStyle = '#fff'
  ctx.font = '800 48px OPPOSans'
  printAt(ctx, title, 96, seo.og.height / 2 - 64, 96, seo.og.width - 192, 64)

  // Add article summary
  ctx.font = '600 36px OPPOSans'
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  printAt(ctx, description, 96, seo.og.height - 200, 48, seo.og.width - 192, 36)

  ctx.restore()

  const encodedImage = await canvas.encode('png')
  return await compressImage(encodedImage)
}
