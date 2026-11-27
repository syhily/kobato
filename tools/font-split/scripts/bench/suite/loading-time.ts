import type { StaticRoute } from '@kobato/font-split/scripts/bench/static-server'
import type { SlicedPackage } from '@kobato/font-split/scripts/bench/suite/package'
import type { LoadingPlan } from '@kobato/font-split/scripts/bench/suite/profile'
import type {
  LoadingCondition,
  LoadingPair,
  LoadingRun,
  LoadingTimeResult,
  SuiteContext,
} from '@kobato/font-split/scripts/bench/suite/types'
import type { Browser, Page } from '@playwright/test'

import { launchHeadlessBrowser, relaunchingOnLoss, throttle } from '@kobato/font-split/scripts/bench/browser'
import { startStaticServer } from '@kobato/font-split/scripts/bench/static-server'
import { packageDirFor } from '@kobato/font-split/scripts/bench/suite/context'
import {
  faceIndexesFor,
  facesBytes,
  loadPackage,
  loadPages,
  pageHtml,
} from '@kobato/font-split/scripts/bench/suite/package'
import { blogPagesFixture } from '@kobato/font-split/scripts/bench/suite/paths'
import { LINKS, loadingPlan, LOADING_LAMBDAS_KB } from '@kobato/font-split/scripts/bench/suite/profile'

interface Measured {
  fontsEndMs: number
  network: string[]
  cached: number
  expected: string[]
}

type Pages = readonly (readonly number[])[]
type PagePair = { coldPage: number; nextPage: number }

const PAGE_ROUTE = /^\/page\/l(\d+)\/(\d+)\.html$/

function routeName(lambdaKb: number): string {
  return `l${lambdaKb * 1000}`
}

function pairIndices(pageCount: number, pairs: number): PagePair[] {
  return Array.from({ length: pairs }, (_, index) => {
    const coldPage = Math.round((index * pageCount) / pairs)
    return { coldPage, nextPage: (coldPage + 1) % pageCount }
  })
}

async function measure(
  page: Page,
  origin: string,
  pkg: SlicedPackage,
  route: string,
  index: number,
  codepoints: readonly number[],
): Promise<Measured> {
  await page.goto(`${origin}/page/${route}/${index}.html`, { waitUntil: 'load' })
  const expected = faceIndexesFor(pkg, codepoints).map((faceIndex) => pkg.faces[faceIndex]!.file)
  const measured = await page.evaluate(async (expectedCount: number) => {
    const deadline = performance.now() + 180_000
    let entries: PerformanceResourceTiming[] = []
    for (;;) {
      await document.fonts.ready
      entries = performance
        .getEntriesByType('resource')
        .filter((entry): entry is PerformanceResourceTiming => 'transferSize' in entry)
        .filter((entry) => entry.name.endsWith('.woff2'))
      if (entries.length >= expectedCount && document.fonts.status === 'loaded') {
        break
      }
      if (performance.now() > deadline) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    return {
      fontsEndMs: entries.length === 0 ? 0 : Math.max(...entries.map((entry) => entry.responseEnd)),
      network: entries
        .filter((entry) => entry.transferSize > 0)
        .map((entry) => entry.name.slice(entry.name.lastIndexOf('/') + 1)),
      cached: entries.filter((entry) => entry.transferSize === 0).length,
    }
  }, expected.length)
  return { ...measured, expected }
}

function assertFetched(label: string, expected: readonly string[], network: readonly string[]): void {
  const fetched = new Set(network)
  const missing = expected.filter((file) => !fetched.has(file))
  const allowed = new Set(expected)
  const unexpected = network.filter((file) => !allowed.has(file))
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `${label}: the browser fetched ${network.length} faces where ${expected.length} were predicted ` +
        `(${missing.length} missing, ${unexpected.length} unexpected)`,
    )
  }
}

async function runPair(
  browser: Browser,
  origin: string,
  plan: LoadingPlan,
  pairIndex: number,
  pair: PagePair,
  packages: ReadonlyMap<number, SlicedPackage>,
  pages: Pages,
): Promise<LoadingPair> {
  const lambdasKb = [...LOADING_LAMBDAS_KB]
  const runs: Record<string, LoadingRun> = {}
  for (let position = 0; position < lambdasKb.length; position += 1) {
    const lambdaKb = lambdasKb[(position + pairIndex) % lambdasKb.length]!
    const pkg = packages.get(lambdaKb)
    if (pkg === undefined) {
      throw new Error(`no package for λ=${lambdaKb} KB`)
    }
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    try {
      await context.addInitScript(() => performance.setResourceTimingBufferSize(4000))
      const page = await context.newPage()
      await throttle(context, page, LINKS[plan.link])
      const route = routeName(lambdaKb)
      const coldFaces = faceIndexesFor(pkg, pages[pair.coldPage]!)
      const cold = await measure(page, origin, pkg, route, pair.coldPage, pages[pair.coldPage]!)
      assertFetched(`λ=${lambdaKb} cold page ${pair.coldPage}`, cold.expected, cold.network)
      const fresh = faceIndexesFor(pkg, pages[pair.nextPage]!).filter((faceIndex) => !coldFaces.includes(faceIndex))
      const next = await measure(page, origin, pkg, route, pair.nextPage, pages[pair.nextPage]!)
      assertFetched(
        `λ=${lambdaKb} next page ${pair.nextPage}`,
        fresh.map((faceIndex) => pkg.faces[faceIndex]!.file),
        next.network,
      )
      runs[String(lambdaKb)] = {
        coldMs: cold.fontsEndMs,
        coldFaces: coldFaces.length,
        coldBytes: facesBytes(pkg, coldFaces),
        nextMs: next.fontsEndMs,
        nextNewFaces: fresh.length,
        nextNewBytes: facesBytes(pkg, fresh),
        nextCachedFaces: next.cached,
      }
    } finally {
      await context.close()
    }
  }
  return { index: pairIndex, coldPage: pair.coldPage, nextPage: pair.nextPage, runs }
}

export async function measureLoadingTime(ctx: SuiteContext): Promise<LoadingTimeResult> {
  const pages = loadPages(blogPagesFixture)
  const packages = new Map<number, SlicedPackage>()
  const routes = new Map<string, StaticRoute>()
  for (const lambdaKb of LOADING_LAMBDAS_KB) {
    const pkg = loadPackage(packageDirFor(ctx, ctx.primary, lambdaKb))
    packages.set(lambdaKb, pkg)
    for (const [name, body] of pkg.files) {
      routes.set(`/pkg/${routeName(lambdaKb)}/${name}`, {
        body,
        type: name.endsWith('.css') ? 'text/css; charset=utf-8' : 'font/woff2',
      })
    }
  }
  const server = await startStaticServer(routes, (url) => {
    const match = PAGE_ROUTE.exec(url)
    const pkg = match === null ? undefined : packages.get(Number(match[1]) / 1000)
    const codepoints = match === null ? undefined : pages[Number(match[2])]
    if (match === null || pkg === undefined || codepoints === undefined) {
      return null
    }
    const stylesheet = `/pkg/l${match[1]}/result.css`
    return { body: Buffer.from(pageHtml(pkg, stylesheet, codepoints)), type: 'text/html; charset=utf-8' }
  })
  let browser = await launchHeadlessBrowser()
  const conditions: LoadingCondition[] = []
  try {
    for (const entry of loadingPlan(ctx.options.quick)) {
      const origin = entry.protocol === 'h1' ? server.h1Origin : server.h2Origin
      const pairs: LoadingPair[] = []
      for (const [pairIndex, pair] of pairIndices(pages.length, entry.pairs).entries()) {
        const outcome = await relaunchingOnLoss(
          (message) => ctx.log(message),
          browser,
          (active) => runPair(active, origin, entry, pairIndex, pair, packages, pages),
        )
        browser = outcome.browser
        pairs.push(outcome.value)
      }
      conditions.push({ protocol: entry.protocol, link: entry.link, pairs })
      ctx.log(
        `loading time: HTTP/${entry.protocol === 'h1' ? '1.1' : '2'} ${entry.link} — ${pairs.length} page pairs × ${LOADING_LAMBDAS_KB.length} λ`,
      )
    }
    const pairsOn = (link: 'slow' | 'fast'): number =>
      conditions.find((condition) => condition.link === link)?.pairs.length ?? 0
    return {
      browser: browser.version(),
      lambdasKb: [...LOADING_LAMBDAS_KB],
      links: LINKS,
      pairsPerLink: { slow: pairsOn('slow'), fast: pairsOn('fast') },
      conditions,
    }
  } finally {
    await browser.close().catch(() => undefined)
    await server.close()
  }
}
