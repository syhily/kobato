// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SettingsSection } from '@/shared/config/sections'
import type { SiteIdentitySettings } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { wrapWithI18n } from '#/_helpers/i18n-render'
import { GeneralForm } from '@/ui/admin/settings/GeneralForm'
import { SettingsFlushProvider } from '@/ui/admin/settings/shell/SettingsFlushProvider'

// Step 6a — the locale switch contract, exercised through the REAL GeneralForm
// cards + flush provider: dirty cards first, then the locale field, then one
// reload — and nothing at all when any step fails.

const commit = vi.hoisted(() => vi.fn())
const toastMock = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn(), success: vi.fn() }))

vi.mock('@/ui/admin/settings/useSettingsMutation', () => ({
  useSettingsMutation: () => ({ commit, isPending: false, status: 'idle' }),
}))

vi.mock('sonner', () => ({ toast: toastMock, Toaster: () => null }))

const SITE_IDENTITY = TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!
const reload = vi.fn()

function renderForm(siteIdentity: SiteIdentitySettings = SITE_IDENTITY) {
  return render(
    wrapWithI18n(
      <SettingsFlushProvider>
        <GeneralForm siteIdentity={siteIdentity} timeZones={['Asia/Shanghai', 'UTC']} />
      </SettingsFlushProvider>,
    ),
  )
}

function setInput(id: string, value: string): void {
  const input = document.getElementById(id) as HTMLInputElement | null
  expect(input).not.toBeNull()
  fireEvent.change(input!, { target: { value } })
}

async function pickLocale(label: string): Promise<void> {
  fireEvent.click(document.getElementById('general-locale')!)
  const option = await screen.findByRole('option', { name: label })
  fireEvent.pointerDown(option)
  fireEvent.click(option)
}

/** Section payloads in commit order. */
function committedPayloads(): Array<{ section: SettingsSection; payload: Record<string, unknown> }> {
  return commit.mock.calls.map(([section, payload]) => ({
    section: section as SettingsSection,
    payload: payload as Record<string, unknown>,
  }))
}

function localeCommits(): Array<Record<string, unknown>> {
  return committedPayloads()
    .map((entry) => entry.payload)
    .filter((payload) => 'locale' in payload)
}

/** Commit echoes a merged section, so `onSaved` sees the new language. */
function echoCommit(section: SettingsSection, payload: Record<string, unknown>) {
  return Promise.resolve({
    ok: true as const,
    section: {
      ...SITE_IDENTITY,
      ...payload,
      ...(section === 'general' ? {} : {}),
    },
  })
}

beforeEach(() => {
  commit.mockReset()
  commit.mockImplementation(echoCommit)
  toastMock.error.mockReset()
  reload.mockReset()
  // happy-dom's Location: the reload method is writable on the instance.
  Object.defineProperty(window.location, 'reload', { configurable: true, writable: true, value: reload })
})

describe('General locale switch — flush all, then commit locale, then reload', () => {
  it('saves every dirty card BEFORE the locale, then reloads exactly once', async () => {
    renderForm()
    setInput('general-title', 'New Title')
    setInput('general-author-name', 'New Author')

    await pickLocale('English (United States)')

    await waitFor(() => expect(localeCommits()).toHaveLength(1))
    const payloads = committedPayloads()
    // The locale is the LAST commit — every dirty card went first.
    expect(payloads[payloads.length - 1]!.payload).toEqual({ locale: 'en-US' })
    const dirtyPayloads = payloads.slice(0, -1).map((entry) => entry.payload)
    expect(dirtyPayloads.some((payload) => payload.title === 'New Title')).toBe(true)
    expect(
      dirtyPayloads.some((payload) => (payload.author as { name?: string } | undefined)?.name === 'New Author'),
    ).toBe(true)
    await waitFor(() => expect(reload).toHaveBeenCalledOnce())
  })

  it('does NOT switch, save the locale, or reload when a dirty card fails to save', async () => {
    commit.mockImplementation((section: SettingsSection, payload: Record<string, unknown>) => {
      if ('title' in payload) {
        return Promise.resolve({ ok: false as const })
      }
      return echoCommit(section, payload)
    })

    renderForm()
    setInput('general-title', 'Unsaved Title')
    await pickLocale('English (United States)')

    await waitFor(() => expect(toastMock.error).not.toHaveBeenCalled())
    // A rejected card blocks the switch: no locale commit, no reload, dirty text intact.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(localeCommits()).toHaveLength(0)
    expect(reload).not.toHaveBeenCalled()
    expect((document.getElementById('general-title') as HTMLInputElement).value).toBe('Unsaved Title')
    expect(document.body.textContent).toContain('简体中文（中国大陆）')
  })

  it('keeps invalid unsaved input (no rollback) and vetoes the switch', async () => {
    renderForm()
    setInput('general-title', '')
    setInput('general-author-name', 'Still here')

    await pickLocale('English (United States)')

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledOnce())
    expect(localeCommits()).toHaveLength(0)
    expect(reload).not.toHaveBeenCalled()
    // The panel flush must NOT reset the dirty input.
    expect((document.getElementById('general-title') as HTMLInputElement).value).toBe('')
  })

  it('does not reload when the locale commit itself fails, and a retry works', async () => {
    let failLocale = true
    commit.mockImplementation((section: SettingsSection, payload: Record<string, unknown>) => {
      if ('locale' in payload && failLocale) {
        return Promise.resolve({ ok: false as const })
      }
      return echoCommit(section, payload)
    })

    renderForm()
    setInput('general-title', 'New Title')
    await pickLocale('English (United States)')

    await waitFor(() => expect(localeCommits()).toHaveLength(1))
    expect(reload).not.toHaveBeenCalled()
    // The card stays retryable: the failed locale field is still dirty.
    expect(document.body.textContent).toContain('English (United States)')

    // Retry: the next pick flushes the still-dirty locale field and succeeds.
    failLocale = false
    await pickLocale('正體中文（台灣）')
    await waitFor(() => expect(reload).toHaveBeenCalledOnce())
  })

  it('does not reload for a same-value locale reselect or another general save', async () => {
    renderForm()

    // Same-value reselect: the field-scoped patch is empty → no commit, no reload.
    await pickLocale('简体中文（中国大陆）')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(commit).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()

    // A normal text save keeps the language — no reload.
    const title = document.getElementById('general-title') as HTMLInputElement
    fireEvent.change(title, { target: { value: 'Only the title' } })
    fireEvent.blur(title)
    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    expect(reload).not.toHaveBeenCalled()
  })
})
