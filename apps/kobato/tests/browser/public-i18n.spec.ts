import { browserEnv } from '@kobato/browser/browser-env.ts'
import { expect, test } from '@tests/browser/support/fixtures.ts'
import { collectConsoleIssues, waitForHydration } from '@tests/browser/support/journey.ts'

const env = browserEnv()

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

  expect(labelRequests).toEqual([])

  await waitForHydration(page, '.kobato-comment-editor')
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

  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(page.locator('html')).not.toHaveAttribute('dir', 'rtl')

  const skipLink = page.getByText('跳转到主要内容', { exact: false }).first()
  await expect(skipLink).toBeVisible()
  await expect(skipLink).not.toHaveAttribute('lang', 'ar')

  expect(issues.hydration).toEqual([])
})
