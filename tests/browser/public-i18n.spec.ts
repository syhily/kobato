import { browserEnv } from './support/env'
import { expect, test } from './support/fixtures'
import { collectConsoleIssues, waitForHydration } from './support/journey'

const env = browserEnv()

// Production chunk (`zh-CN-<hash>.js`) and Vite-dev module (`…/zh-CN.ts`).
const LOCALE_LABEL_REQUEST = /\/(en-US|zh-CN|zh-HK|zh-TW)(?:[.-][^/]*)?\.(?:js|ts)(?:\?|$)/

test.beforeEach(async ({ settingsApi }) => {
  await settingsApi.resetGeneral()
})

test('the public comment composer loads only the active locale label chunk', async ({ adminPage: page }) => {
  const issues = collectConsoleIssues(page)
  const labelRequests: string[] = []
  page.on('request', (request) => {
    if (LOCALE_LABEL_REQUEST.test(request.url())) {
      labelRequests.push(request.url())
    }
  })

  await page.goto(`/posts/${env.postSlug}`)
  const placeholder = page.locator('.kobato-comment-editor').first()
  await expect(placeholder).toBeVisible({ timeout: 30_000 })

  // The composer is interaction-gated: nothing label-bearing may load before.
  expect(labelRequests).toEqual([])

  await waitForHydration(page, '.kobato-comment-editor')
  // `focus()` is the keyboard activation path (`onFocus` -> `activate`); a
  // pointer click can land before the streamed boundary's handlers are live.
  // Retry until the real contenteditable mounts (labels + composer chunks).
  await expect
    .poll(
      async () => {
        if ((await page.locator('[contenteditable="true"]').count()) > 0) {
          return true
        }
        const interactive = page.locator('.kobato-comment-editor[role="textbox"]')
        if ((await interactive.count()) > 0) {
          await interactive
            .first()
            .focus()
            .catch(() => undefined)
        }
        return (await page.locator('[contenteditable="true"]').count()) > 0
      },
      { timeout: 30_000 },
    )
    .toBe(true)
  await expect.poll(() => labelRequests.length, { timeout: 20_000 }).toBeGreaterThan(0)

  const loadedLocales = labelRequests.map((url) => LOCALE_LABEL_REQUEST.exec(url)?.[1])
  expect(loadedLocales).toEqual(['zh-CN'])
  expect(labelRequests).toHaveLength(1)
  expect(issues.hydration).toEqual([])
})

test('contentLanguage ar stamps lang and dir=auto on the body only', async ({ adminPage: page }) => {
  const issues = collectConsoleIssues(page)
  await page.goto(`/posts/${env.postSlug}`)

  const body = page.locator('.post-content').first()
  await expect(body).toBeVisible()
  await expect(body).toHaveAttribute('lang', 'ar')
  await expect(body).toHaveAttribute('dir', 'auto')

  // The document keeps the UI locale and LTR chrome; the content language
  // never changes the UI catalog or the page direction.
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(page.locator('html')).not.toHaveAttribute('dir', 'rtl')

  // A chrome element outside the body never inherits the content language.
  const skipLink = page.getByText('跳转到主要内容', { exact: false }).first()
  await expect(skipLink).toBeVisible()
  await expect(skipLink).not.toHaveAttribute('lang', 'ar')

  expect(issues.hydration).toEqual([])
})
