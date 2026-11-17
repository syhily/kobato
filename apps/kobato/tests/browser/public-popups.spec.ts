import type { Browser } from '@playwright/test'

import { browserEnv } from './support/env'
import { expect, test } from './support/fixtures'
import { collectConsoleIssues, waitForHydration } from './support/journey'

const env = browserEnv()
const MOTION_CHUNK = /\/node_modules\/\.vite\/deps\/motion_react\.js|\/assets\/lazy-motion-[^/]+\.js/
const QR_SOCIALS = [
  {
    name: '微信',
    network: 'wechat',
    type: 'qrcode',
    title: '扫码加我微信好友',
    link: 'https://u.wechat.com/EBpmuKmrVz4YVFnoCJdnruA',
  },
]

interface PopupScenario {
  trigger: string
  dialog: string
}

async function expectStableColdPopup(browser: Browser, scenario: PopupScenario): Promise<void> {
  const context = await browser.newContext({ baseURL: env.baseUrl })
  try {
    const page = await context.newPage()
    const issues = collectConsoleIssues(page)
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    await page.route(MOTION_CHUNK, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500))
      await route.continue()
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const trigger = page.getByRole('button', { name: scenario.trigger, exact: true })
    await waitForHydration(page, `button[aria-label="${scenario.trigger}"]`)
    await page.evaluate(() => {
      const target = window as unknown as {
        __popupCapture: { staticFrames: number; replacements: number; previousWrapper: Element | null }
      }
      target.__popupCapture = { staticFrames: 0, replacements: 0, previousWrapper: null }
      const sample = () => {
        const capture = target.__popupCapture
        const wrapper = document.querySelector('[role="dialog"][aria-modal="true"]')?.parentElement ?? null
        if (wrapper) {
          if (!wrapper.hasAttribute('style') && getComputedStyle(wrapper).opacity === '1') {
            capture.staticFrames += 1
          }
          if (capture.previousWrapper !== null && capture.previousWrapper !== wrapper) {
            capture.replacements += 1
          }
          capture.previousWrapper = wrapper
        }
        requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    await trigger.click()

    const dialog = page.getByRole('dialog', { name: scenario.dialog, exact: true })
    await expect(dialog).toBeVisible({ timeout: 3_000 })
    await expect(dialog.locator('..')).toHaveCSS('opacity', '1', { timeout: 3_000 })
    await page.waitForTimeout(700)
    await expect(dialog).toBeVisible()
    const capture = await page.evaluate(() => {
      const target = window as unknown as {
        __popupCapture: { staticFrames: number; replacements: number; previousWrapper: Element | null }
      }
      const { staticFrames, replacements } = target.__popupCapture
      return { staticFrames, replacements }
    })
    expect(capture).toEqual({ staticFrames: 0, replacements: 0 })
    expect(issues.hydration).toEqual([])
  } finally {
    await context.close()
  }
}

test('the search popup survives its first cold-load open without DOM replacement', async ({ browser }) => {
  await expectStableColdPopup(browser, { trigger: '打开搜索', dialog: '搜索文章' })
})

test('the QR popup survives its first cold-load open without DOM replacement', async ({ browser, settingsApi }) => {
  await settingsApi.updateSocials(QR_SOCIALS)
  try {
    await expectStableColdPopup(browser, { trigger: '扫码加我微信好友', dialog: '扫码加我微信好友' })
  } finally {
    await settingsApi.updateSocials([])
  }
})
