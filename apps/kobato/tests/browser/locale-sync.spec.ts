import { expect, test } from '@kobato/instance/browser/fixtures'
import {
  chooseTimeZone,
  collectConsoleIssues,
  fetchHtmlLang,
  LOCALE_LABELS,
  markWindow,
  openSettings,
  readWindowMarker,
  replaceInput,
  switchLocale,
  waitForSettingsReady,
} from '@kobato/instance/browser/journey'
import { BASELINE_GENERAL } from '@kobato/instance/browser/settings-api'

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ settingsApi }) => {
  await settingsApi.resetGeneral()
})

test('a failed dirty-card flush vetoes the locale switch', async ({ adminPage: page }) => {
  await openSettings(page)
  await markWindow(page, 'journey-1')

  const updateBodies: string[] = []
  let releaseFailedFlush: () => void = () => undefined
  const failedFlush = new Promise<void>((resolve) => {
    releaseFailedFlush = resolve
  })
  await page.route('**/rpc/admin/settings/update', async (route) => {
    const body = route.request().postData() ?? ''
    updateBodies.push(body)
    if (body.includes('"locale"')) {
      await route.continue()
      return
    }
    releaseFailedFlush()
    await route.abort('failed')
  })

  const unsavedDescription = 'Unsaved description that must survive the veto'
  await replaceInput(page, page.locator('#general-description'), unsavedDescription)

  const reloaded = page
    .waitForEvent('load', { timeout: 5_000 })
    .then(() => true)
    .catch(() => false)

  await switchLocale(page, 'zh-TW')
  await failedFlush
  await page.waitForTimeout(1_000)

  await expect(page.locator('#general-locale')).not.toHaveAttribute('aria-busy', 'true')
  await expect(page.locator('#general-locale')).toBeFocused()

  expect(await reloaded).toBe(false)
  expect(await readWindowMarker(page)).toBe('journey-1')

  expect(updateBodies.some((body) => body.includes('"locale"'))).toBe(false)
  await expect(page.locator('#general-description')).toHaveValue(unsavedDescription)
  await expect(page.locator('#general-locale')).toHaveText(LOCALE_LABELS['zh-CN'])

  expect(await fetchHtmlLang(page)).toBe('zh-CN')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')

  await page.unroute('**/rpc/admin/settings/update')
  await replaceInput(page, page.locator('#general-description'), BASELINE_GENERAL.description)
})

test('a successful switch saves the dirty card, reloads once, and hydrates cleanly', async ({ adminPage: page }) => {
  const issues = collectConsoleIssues(page)
  await openSettings(page)

  const savedDescription = `Saved by the switch ${Date.now()}`
  await replaceInput(page, page.locator('#general-description'), savedDescription)

  const reload = page.waitForEvent('load', { timeout: 30_000 })
  await switchLocale(page, 'zh-TW')
  await reload

  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW')
  await expect(page.locator('#general-description')).toHaveValue(savedDescription)

  await expect(page.getByRole('heading', { name: '站點', exact: true }).first()).toBeVisible()

  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW')
  await expect(page.getByText('跳至主要內容', { exact: false }).first()).toBeVisible()

  expect(issues.hydration).toEqual([])
})

test('every locale reloads with its own html lang and menu, with clean hydration', async ({ adminPage: page }) => {
  const issues = collectConsoleIssues(page)
  await openSettings(page)

  const siteGroupHeading = {
    'en-US': 'Site',
    'zh-HK': '站點',
    'zh-TW': '站點',
    'zh-CN': '站点',
  } as const

  for (const locale of ['en-US', 'zh-HK', 'zh-TW', 'zh-CN'] as const) {
    const reload = page.waitForEvent('load', { timeout: 30_000 })
    await waitForSettingsReady(page)
    await switchLocale(page, locale)
    await reload

    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.locator('#general-locale')).toHaveText(LOCALE_LABELS[locale])
    await expect(page.getByRole('heading', { name: siteGroupHeading[locale], exact: true }).first()).toBeVisible()
    await expect(page.locator('#general-description')).toBeVisible()
  }

  expect(issues.hydration).toEqual([])
})

test('two tabs: A switches the language while B saves its own field and never writes the locale', async ({
  adminContext,
}) => {
  const pageA = await adminContext.newPage()
  const pageB = await adminContext.newPage()
  try {
    await openSettings(pageA)
    await openSettings(pageB)

    const bSettingsWrites: string[] = []
    pageB.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/rpc/admin/settings/update')) {
        bSettingsWrites.push(request.postData() ?? '')
      }
    })

    const timeZoneSaved = pageB.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().includes('/rpc/admin/settings/update'),
    )
    await chooseTimeZone(pageB, 'Asia/Tokyo')
    await timeZoneSaved
    await expect(pageB.locator('#general-timezone')).toContainText('Asia/Tokyo')

    const bTitle = `B dirty title ${Date.now()}`
    await replaceInput(pageB, pageB.locator('#general-title'), bTitle)

    const reloadA = pageA.waitForEvent('load', { timeout: 30_000 })
    const reloadB = pageB.waitForEvent('load', { timeout: 30_000 })
    await switchLocale(pageA, 'zh-TW')
    await Promise.all([reloadA, reloadB])

    await expect(pageA.locator('html')).toHaveAttribute('lang', 'zh-TW')
    await expect(pageB.locator('html')).toHaveAttribute('lang', 'zh-TW')
    await expect(pageB.locator('#general-title')).toHaveValue(bTitle)
    await expect(pageB.locator('#general-timezone')).toContainText('Asia/Tokyo')

    expect(bSettingsWrites.length).toBeGreaterThan(0)
    expect(bSettingsWrites.filter((body) => body.includes('"locale"'))).toEqual([])

    expect(await fetchHtmlLang(pageA)).toBe('zh-TW')
  } finally {
    await pageA.close()
    await pageB.close()
  }
})

test('an editor with unsaved content is not hard-reloaded by the locale broadcast', async ({ adminContext }) => {
  const settings = await adminContext.newPage()
  const editor = await adminContext.newPage()
  try {
    await openSettings(settings)
    await editor.goto('/editor/post/new')

    await expect(editor.locator('[contenteditable="true"]').first()).toBeVisible({ timeout: 30_000 })

    const title = editor.getByRole('textbox', { name: '文章标题', exact: true })
    await expect(title).toBeVisible()
    const draftTitle = `Unsaved draft ${Date.now()}`
    await replaceInput(editor, title, draftTitle)
    const body = editor.locator('[contenteditable="true"]').first()
    await body.click()
    await editor.keyboard.type('Unsaved prose that a hard reload would discard.')

    await markWindow(editor, 'editor-unsaved')

    const editorReloaded = editor
      .waitForEvent('load', { timeout: 5_000 })
      .then(() => true)
      .catch(() => false)
    const settingsReloaded = settings.waitForEvent('load', { timeout: 30_000 })

    await switchLocale(settings, 'zh-TW')
    await settingsReloaded
    expect(await editorReloaded).toBe(false)

    expect(await readWindowMarker(editor)).toBe('editor-unsaved')
    await expect(title).toHaveValue(draftTitle)

    const notice = editor.getByRole('alert').filter({ hasText: '其他标签页已切换语言' })
    await expect(notice).toBeVisible({ timeout: 10_000 })
    await expect(notice.getByRole('button', { name: '刷新' })).toBeVisible()
  } finally {
    await settings.close()
    await editor.close()
  }
})
