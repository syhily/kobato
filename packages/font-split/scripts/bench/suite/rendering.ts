import type { StaticRoute } from '@kobato/font-split/scripts/bench/static-server'
import type { SlicedPackage } from '@kobato/font-split/scripts/bench/suite/package'
import type { RenderingRow, ResolvedFont, SuiteContext } from '@kobato/font-split/scripts/bench/suite/types'
import type { Browser, BrowserContext } from '@playwright/test'

import { launchHeadlessBrowser, relaunchingOnLoss } from '@kobato/font-split/scripts/bench/browser'
import { startStaticServer } from '@kobato/font-split/scripts/bench/static-server'
import { shippedDirFor } from '@kobato/font-split/scripts/bench/suite/context'
import { escapeHtml, loadPackage } from '@kobato/font-split/scripts/bench/suite/package'
import { RENDERING_STRINGS } from '@kobato/font-split/scripts/bench/suite/profile'
import { readFileSync } from 'node:fs'
import sharp from 'sharp'

const ORIGINAL_FAMILY = 'BenchOriginal'
const FONT_SIZE_PX = 48
const PADDING_PX = 6
const SOURCES = ['original', 'package'] as const
type Source = (typeof SOURCES)[number]

interface Shot {
  width: number
  height: number
  pixels: Buffer
  fetched: number
}

function renderHtml(pkg: SlicedPackage, fontKey: string, source: Source, text: string): string {
  const family = source === 'original' ? ORIGINAL_FAMILY : pkg.family
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<link rel="stylesheet" href="/pkg/${fontKey}/result.css">` +
    `<style>@font-face{font-family:"${ORIGINAL_FAMILY}";src:url("/orig/${fontKey}.ttf")format("truetype");` +
    `font-weight:${pkg.fontWeight};font-style:normal;font-display:block}` +
    'html,body{margin:0;background:#fff}' +
    `#s{display:inline-block;font-size:${FONT_SIZE_PX}px;line-height:72px;padding:${PADDING_PX}px;white-space:pre;` +
    'font-kerning:normal;font-variant-ligatures:common-ligatures;text-rendering:optimizeLegibility;' +
    `font-family:"${family}"}</style></head><body><div id="s">${escapeHtml(text)}</div></body></html>`
  )
}

async function shoot(
  context: BrowserContext,
  origin: string,
  path: string,
  family: string,
  text: string,
  extension: string,
): Promise<Shot> {
  const page = await context.newPage()
  let fetched = 0
  page.on('response', (response) => {
    if (response.url().endsWith(extension) && response.status() === 200) {
      fetched += 1
    }
  })
  try {
    await page.goto(`${origin}${path}`, { waitUntil: 'load' })
    await page.evaluate(
      async ({ family, text }) => {
        await document.fonts.load(`48px "${family}"`, text)
        await document.fonts.ready
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      },
      { family, text },
    )
    const width = await page.evaluate(() => document.querySelector('#s')!.getBoundingClientRect().width)
    const png = await page.locator('#s').screenshot()
    const raw = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    return { width, height: raw.info.height, pixels: raw.data, fetched }
  } finally {
    await page.close()
  }
}

function differingPixels(left: Buffer, right: Buffer): number {
  let differing = 0
  for (let index = 0; index < left.length; index += 4) {
    if (left[index] !== right[index] || left[index + 1] !== right[index + 1] || left[index + 2] !== right[index + 2]) {
      differing += 1
    }
  }
  return differing
}

export async function measureRendering(ctx: SuiteContext): Promise<Record<string, RenderingRow[]>> {
  const fonts = ctx.fonts.map((font) => ({ font, pkg: loadPackage(shippedDirFor(ctx, font)) }))
  const routes = new Map<string, StaticRoute>()
  const pages = new Map<string, string>()
  for (const { font, pkg } of fonts) {
    routes.set(`/orig/${font.key}.ttf`, { body: readFileSync(font.path), type: 'font/ttf' })
    for (const [name, body] of pkg.files) {
      routes.set(`/pkg/${font.key}/${name}`, {
        body,
        type: name.endsWith('.css') ? 'text/css; charset=utf-8' : 'font/woff2',
      })
    }
    for (const [index, string] of RENDERING_STRINGS.entries()) {
      for (const source of SOURCES) {
        pages.set(`/page/${font.key}/${source}/${index}.html`, renderHtml(pkg, font.key, source, string.text))
      }
    }
  }
  const server = await startStaticServer(routes, (url) => {
    const html = pages.get(url)
    return html === undefined ? null : { body: Buffer.from(html), type: 'text/html; charset=utf-8' }
  })
  let browser = await launchHeadlessBrowser()
  const results: Record<string, RenderingRow[]> = {}
  try {
    for (const { font, pkg } of fonts) {
      const outcome = await relaunchingOnLoss(
        (message) => ctx.log(message),
        browser,
        (active) => renderFont(active, server.h1Origin, font, pkg),
      )
      browser = outcome.browser
      const rows = outcome.value
      ctx.log(
        `rendering: ${font.label} — ${rows.filter((row) => row.identical).length}/${rows.length} strings pixel-identical`,
      )
      results[font.key] = rows
    }
    return results
  } finally {
    await browser.close().catch(() => undefined)
    await server.close()
  }
}

async function renderFont(
  browser: Browser,
  origin: string,
  font: ResolvedFont,
  pkg: SlicedPackage,
): Promise<RenderingRow[]> {
  const context = await browser.newContext({ deviceScaleFactor: 1 })
  try {
    const rows: RenderingRow[] = []
    for (const [index, string] of RENDERING_STRINGS.entries()) {
      const original = await shoot(
        context,
        origin,
        `/page/${font.key}/original/${index}.html`,
        ORIGINAL_FAMILY,
        string.text,
        '.ttf',
      )
      const pack = await shoot(
        context,
        origin,
        `/page/${font.key}/package/${index}.html`,
        pkg.family,
        string.text,
        '.woff2',
      )
      if (pack.fetched === 0) {
        throw new Error(
          `Chrome fetched no package face for ${font.label} — the family "${pkg.family}" is installed locally and ` +
            'the local() source wins; uninstall it to benchmark the package',
        )
      }
      const sameShape = original.height === pack.height && original.pixels.length === pack.pixels.length
      const differing = sameShape ? differingPixels(original.pixels, pack.pixels) : -1
      rows.push({
        text: string.text,
        note: string.note,
        originalWidth: original.width,
        packageWidth: pack.width,
        identical: sameShape && differing === 0 && original.width === pack.width,
        differingPixels: differing,
        packageFaces: pack.fetched,
      })
    }
    return rows
  } finally {
    await context.close().catch(() => undefined)
  }
}
