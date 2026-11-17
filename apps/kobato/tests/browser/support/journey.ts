// Shared browser-journey helpers: sign-in, settings-panel interactions, and
// console-error collection. Selectors anchor on the real controls (`#general-*`
// ids the settings rows own) and ARIA roles — never on styling.

import type { BrowserContext, Locator, Page } from '@playwright/test'

import { expect } from '@playwright/test'

import type { BrowserEnv } from './env'

import { BASELINE_GENERAL } from './settings-api'

/** Endonyms, deliberately NOT translated (see `LOCALE_DISPLAY_NAMES`). */
export const LOCALE_LABELS = {
  'en-US': 'English (United States)',
  'zh-HK': '繁體中文（香港）',
  'zh-TW': '正體中文（台灣）',
  'zh-CN': '简体中文（中国大陆）',
} as const

export type JourneyLocale = keyof typeof LOCALE_LABELS

/**
 * Establish a real server session for the worker's browser context. The sign-in form
 * is not driven through the UI: its two-step flow keeps the email in React state, and
 * filling step one before hydration lands posts an empty email. This is the same
 * credential POST the HTTP e2e suite issues, so the cookies match a browser login.
 */
export async function signInAdmin(context: BrowserContext, env: BrowserEnv): Promise<void> {
  const request = context.request
  const page = await request.get('/admin/signin')
  expect(page.status()).toBe(200)
  const html = await page.text()
  const csrfToken = /name="csrf_token" value="([^"]+)"/.exec(html)?.[1]
  if (!csrfToken) {
    throw new Error('no csrf_token hidden input on /admin/signin')
  }
  const response = await request.post('/admin/signin', {
    form: { csrf_token: csrfToken, email: env.adminEmail, password: env.adminPassword },
    maxRedirects: 0,
  })
  if (response.status() !== 302) {
    throw new Error(`admin sign-in returned ${response.status()}, expected 302 — check KOBATO_BROWSER_ADMIN_*`)
  }
}

/** Wait until the settings form is hydrated, seeded, and past its post-hydration re-render. */
export async function waitForSettingsReady(page: Page): Promise<void> {
  await expect(page.locator('#general-locale')).toBeVisible()
  await waitForHydration(page, '#general-description')
  // RHF seeds `defaultValues` from a mount effect that can land after hydration;
  // filling earlier is silently reverted. The baseline proves the seeding ran.
  await expect(page.locator('#general-title')).toHaveValue(BASELINE_GENERAL.title)
  await expect(page.locator('#general-description')).toHaveValue(BASELINE_GENERAL.description)
  // A post-hydration re-render can replace the SSR inputs and the select's portal items.
  await page.waitForTimeout(400)
}

/** Open the settings panel and wait until React has hydrated and seeded the form. */
export async function openSettings(page: Page): Promise<void> {
  await page.goto('/admin/settings')
  await waitForSettingsReady(page)
}

/**
 * Wait for React to hydrate the node behind `selector`: before hydration the server
 * markup carries no React expando properties, so a `fill` would update the DOM without
 * the component's state and the next render would drop the input.
 */
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

/**
 * Pick a language in the General card. The locale switch flushes dirty cards, commits,
 * broadcasts and reloads, so callers that care arm `page.waitForEvent('load')` first.
 */
export async function switchLocale(page: Page, locale: JourneyLocale): Promise<void> {
  await page.locator('#general-locale').click()
  await page.getByRole('option', { name: LOCALE_LABELS[locale], exact: true }).click()
}

/**
 * Replace an input's value with real keyboard input: `locator.fill()` updates the DOM
 * but leaves the RHF field clean, so the next render restores the baseline.
 */
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
      // A settings re-render can replace the SSR input right after the page
      // settles; re-resolve the locator and retype into the live element.
      if (!/not attached|detached|not visible|element is not/i.test(String(error))) {
        throw error
      }
      lastError = error
    }
    await page.waitForTimeout(300)
  }
  throw new Error(
    `could not replace the input value${lastError === null ? '' : `: ${String(lastError)}`} (wanted "${value}")`,
  )
}

/** Pick a time zone through the searchable combobox (field-scoped commit). */
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
  /** Every console error / uncaught page error, in arrival order. */
  errors: string[]
  /** The subset that points at a hydration mismatch (React 18/19 wording or minified codes). */
  hydration: string[]
}

const HYDRATION_PATTERNS = [
  /hydrat/i,
  /did not match/i,
  /server rendered/i,
  /server-rendered/i,
  /Minified React error #(?:418|421|422|423|425)/,
]

/** Collect console errors and uncaught exceptions for the lifetime of the page. */
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

/** A window marker that a full reload would erase. */
export async function markWindow(page: Page, value: string): Promise<void> {
  await page.evaluate((marker) => {
    ;(window as unknown as Record<string, unknown>).__kobatoJourneyMarker = marker
  }, value)
}

export function readWindowMarker(page: Page): Promise<unknown> {
  return page.evaluate(() => (window as unknown as Record<string, unknown>).__kobatoJourneyMarker)
}

/** The public document's `<html lang>` as served (not the DOM after client work). */
export async function fetchHtmlLang(page: Page): Promise<string | null> {
  const response = await page.request.get('/')
  expect(response.status()).toBe(200)
  const html = await response.text()
  return /<html[^>]*\blang="([^"]+)"/.exec(html)?.[1] ?? null
}
