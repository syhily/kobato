import type { BrowserEnv } from '@kobato/instance/client/browser-env'
import type { APIRequestContext, BrowserContext, Locator, Page } from '@playwright/test'

import { isRecord } from '@kobato/base/utils/type-guards'
import { BASELINE_GENERAL } from '@kobato/instance/browser/settings-api'
import { expect } from '@playwright/test'

export const LOCALE_LABELS = {
  'en-US': 'English (United States)',
  'zh-HK': '繁體中文（香港）',
  'zh-TW': '正體中文（台灣）',
  'zh-CN': '简体中文（中国大陆）',
} as const

export type JourneyLocale = keyof typeof LOCALE_LABELS

export async function bootstrapCsrfToken(request: APIRequestContext): Promise<string> {
  const response = await request.post('/rpc/public/content/bootstrap', { data: { json: {} } })
  if (!response.ok()) {
    throw new Error(`bootstrap returned ${response.status()}`)
  }
  const parsed: unknown = await response.json()
  const token =
    isRecord(parsed) && isRecord(parsed.json) && typeof parsed.json.csrfToken === 'string'
      ? parsed.json.csrfToken
      : null
  if (token === null) {
    throw new Error('bootstrap carried no csrfToken')
  }
  return token
}

export async function signInAdmin(context: BrowserContext, env: BrowserEnv): Promise<void> {
  const request = context.request
  const csrfToken = await bootstrapCsrfToken(request)
  const response = await request.post('/rpc/account/auth/login', {
    data: { json: { email: env.adminEmail, password: env.adminPassword, redirectTo: '/admin' } },
    headers: { 'x-csrf-token': csrfToken },
  })
  const parsed: unknown = await response.json()
  const json = isRecord(parsed) && isRecord(parsed.json) ? parsed.json : null
  if (response.status() !== 200 || json === null || json.type !== 'redirect') {
    throw new Error(`admin sign-in returned ${response.status()} — check KOBATO_BROWSER_ADMIN_*`)
  }
}

export async function waitForSettingsReady(page: Page): Promise<void> {
  await expect(page.locator('#general-locale')).toBeVisible()
  await waitForHydration(page, '#general-description')
  await expect(page.locator('#general-title')).toHaveValue(BASELINE_GENERAL.title)
  await expect(page.locator('#general-description')).toHaveValue(BASELINE_GENERAL.description)
  await page.waitForTimeout(400)
}

export async function openSettings(page: Page): Promise<void> {
  await page.goto('/admin/settings')
  await waitForSettingsReady(page)
}

export async function waitForHydration(page: Page, selector: string): Promise<void> {
  await page.waitForFunction(
    (target) => {
      const element = document.querySelector(target)
      return element !== null && Object.keys(element).some((key) => key.startsWith('__reactProps$'))
    },
    selector,
    { timeout: 20_000 },
  )
}

export async function switchLocale(page: Page, locale: JourneyLocale): Promise<void> {
  await page.locator('#general-locale').click()
  await page.getByRole('option', { name: LOCALE_LABELS[locale], exact: true }).click()
}

export async function replaceInput(page: Page, locator: Locator, value: string): Promise<void> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await locator.focus()
      await locator.selectText()
      await locator.pressSequentially(value, { delay: 5 })
      if ((await locator.inputValue()) === value) {
        return
      }
    } catch (error) {
      if (!/not attached|detached|not visible|element is not/i.test(String(error))) {
        throw error
      }
      lastError = error
    }
    await page.waitForTimeout(300)
  }
  throw new Error(
    `could not replace the input value${
      lastError instanceof Error ? `: ${lastError.message}` : ''
    } (wanted "${value}")`,
  )
}

export async function chooseTimeZone(page: Page, timeZone: string): Promise<void> {
  await page.locator('#general-timezone').click()
  const popup = page.locator('[data-slot="combobox-content"]')
  await expect(popup).toBeVisible()
  const search = popup.locator('input')
  await search.focus()
  await search.pressSequentially(timeZone)
  const option = popup.getByRole('option', { name: timeZone, exact: true })
  await expect(option).toBeVisible()
  await option.click()
}

export interface ConsoleIssues {
  errors: string[]

  hydration: string[]
}

const HYDRATION_PATTERNS = [
  /hydrat/i,
  /did not match/i,
  /server rendered/i,
  /server-rendered/i,
  /Minified React error #(?:418|421|422|423|425)/,
]

export function collectConsoleIssues(page: Page): ConsoleIssues {
  const issues: ConsoleIssues = { errors: [], hydration: [] }
  const record = (text: string) => {
    issues.errors.push(text)
    if (HYDRATION_PATTERNS.some((pattern) => pattern.test(text))) {
      issues.hydration.push(text)
    }
  }
  page.on('console', (message) => {
    if (message.type() === 'error') {
      record(message.text())
    }
  })
  page.on('pageerror', (error) => record(error.message))
  return issues
}

const JOURNEY_MARKER_KEY = '__kobatoJourneyMarker'

export async function markWindow(page: Page, value: string): Promise<void> {
  await page.evaluate(
    ([key, marker]) => {
      Reflect.set(window, key, marker)
    },
    [JOURNEY_MARKER_KEY, value],
  )
}

export function readWindowMarker(page: Page): Promise<unknown> {
  return page.evaluate((key) => Reflect.get(window, key), JOURNEY_MARKER_KEY)
}

export async function fetchHtmlLang(page: Page): Promise<string | null> {
  const response = await page.request.get('/')
  expect(response.status()).toBe(200)
  const html = await response.text()
  return /<html[^>]*\blang="([^"]+)"/.exec(html)?.[1] ?? null
}
