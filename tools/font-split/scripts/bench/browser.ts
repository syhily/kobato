import type { Browser, BrowserContext, Page } from '@playwright/test'

import { chromium } from '@playwright/test'

export interface LinkProfile {
  downloadBytesPerSecond: number
  uploadBytesPerSecond: number
  latencyMs: number
}

function browserChannel(): string {
  return process.env.KOBATO_BROWSER_CHANNEL ?? 'chrome'
}

export async function launchHeadlessBrowser(): Promise<Browser> {
  return chromium.launch({ channel: browserChannel(), headless: true })
}

export async function throttle(context: BrowserContext, page: Page, link: LinkProfile): Promise<void> {
  const session = await context.newCDPSession(page)
  await session.send('Network.enable')
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: link.downloadBytesPerSecond,
    uploadThroughput: link.uploadBytesPerSecond,
    latency: link.latencyMs,
  })
}

const LOST_BROWSER = /has been closed|Target closed|Connection closed/
const MAX_ATTEMPTS = 3

export async function relaunchingOnLoss<T>(
  log: (message: string) => void,
  browser: Browser,
  run: (active: Browser) => Promise<T>,
  launch: () => Promise<Browser> = launchHeadlessBrowser,
): Promise<{ browser: Browser; value: T }> {
  let active = browser
  for (let attempt = 1; ; attempt += 1) {
    try {
      return { browser: active, value: await run(active) }
    } catch (error) {
      const firstLine = error instanceof Error ? error.message.split('\n')[0] : String(error)
      if (!LOST_BROWSER.test(firstLine) || attempt >= MAX_ATTEMPTS) {
        throw error
      }
      log(`the browser went away (${firstLine}) — relaunching, attempt ${attempt + 1} of ${MAX_ATTEMPTS}`)
      await active.close().catch(() => undefined)
      active = await launch()
    }
  }
}
