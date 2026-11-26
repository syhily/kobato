import type { SettingsSection } from '@kobato/settings/sections'
import type { SiteIdentitySettings } from '@kobato/settings/types'

import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { wrapWithI18n } from '@kobato/ui/tests/utils/i18n-render'
// @vitest-environment happy-dom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { GeneralForm } from '@/ui/settings/general/GeneralForm'
import { SettingsFlushProvider } from '@/ui/settings/shell/SettingsFlushProvider'
import { SettingsPanel } from '@/ui/settings/shell/SettingsPanel'

const commit = vi.hoisted(() => vi.fn())
import { toast } from 'sonner'
const toastMock = vi.mocked(toast)

const settingsMutation = await import('@/ui/settings/use-settings-mutation')
vi.spyOn(settingsMutation, 'useSettingsMutation').mockImplementation(() => ({
  commit,
  isPending: false,
  status: 'idle',
}))

afterAll(() => {
  vi.restoreAllMocks()
})

const SITE_IDENTITY = TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!
const reload = vi.fn()

function renderForm(siteIdentity: SiteIdentitySettings = SITE_IDENTITY) {
  return render(
    wrapWithI18n(
      <SettingsFlushProvider>
        <SettingsPanel>
          <GeneralForm siteIdentity={siteIdentity} timeZones={['Asia/Shanghai', 'UTC']} />
        </SettingsPanel>
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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

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
    expect((document.getElementById('general-title') as HTMLInputElement).value).toBe('')
  })

  it('does not reload when the locale commit itself fails, and the retry persists the NEW locale', async () => {
    const localePayloads: unknown[] = []
    let failFirstLocale = true
    commit.mockImplementation((section: SettingsSection, payload: Record<string, unknown>) => {
      if ('locale' in payload) {
        localePayloads.push(payload.locale)
        if (failFirstLocale) {
          failFirstLocale = false
          return Promise.resolve({ ok: false as const })
        }
      }
      return echoCommit(section, payload)
    })

    renderForm()
    setInput('general-title', 'New Title')
    await pickLocale('English (United States)')

    await waitFor(() => expect(localePayloads).toEqual(['en-US']))
    expect(reload).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(document.getElementById('general-locale')!.textContent).toContain('简体中文（中国大陆）'),
    )

    await pickLocale('正體中文（台灣）')
    await waitFor(() => expect(reload).toHaveBeenCalledOnce())
    expect(localePayloads).toEqual(['en-US', 'zh-TW'])
  })

  it('keeps invalid text across the blur that precedes a locale pick, vetoing the switch', async () => {
    renderForm()
    const title = document.getElementById('general-title') as HTMLInputElement

    fireEvent.change(title, { target: { value: '' } })
    fireEvent.blur(title)
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledOnce())
    expect(title.value).toBe('')
    expect(document.body.textContent).toContain('请填写站点标题')

    await pickLocale('English (United States)')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(localeCommits()).toHaveLength(0)
    expect(reload).not.toHaveBeenCalled()
    expect(title.value).toBe('')
    expect(document.body.textContent).toContain('请填写站点标题')
  })

  it('reloads only after every dirty card and the locale commit have settled', async () => {
    const titleGate = deferred<{ ok: true; section: unknown }>()
    commit.mockImplementation((section: SettingsSection, payload: Record<string, unknown>) => {
      if ('title' in payload) {
        return titleGate.promise
      }
      return echoCommit(section, payload)
    })

    renderForm()
    setInput('general-title', 'Delayed Title')
    await pickLocale('English (United States)')

    await waitFor(() => expect(document.getElementById('general-locale')).toHaveAttribute('aria-busy', 'true'))
    expect(localeCommits()).toHaveLength(0)
    expect(reload).not.toHaveBeenCalled()

    const workspace = document.querySelector('[inert]')
    expect(workspace).not.toBeNull()
    expect(workspace).toHaveAttribute('aria-busy', 'true')
    expect(workspace!.contains(document.getElementById('general-title'))).toBe(true)

    const trigger = document.getElementById('general-locale')!
    expect(trigger.matches(':disabled, [aria-disabled="true"]')).toBe(true)
    fireEvent.click(trigger)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.queryByRole('option', { name: '正體中文（台灣）' })).toBeNull()

    titleGate.resolve({ ok: true, section: { ...SITE_IDENTITY, title: 'Delayed Title' } })
    await waitFor(() => expect(localeCommits()).toEqual([{ locale: 'en-US' }]))
    await waitFor(() => expect(reload).toHaveBeenCalledOnce())
    await waitFor(() => expect(document.querySelector('[inert]')).toBeNull())

    const payloads = committedPayloads().map((entry) => entry.payload)
    expect(payloads).toHaveLength(2)
    expect(payloads[0]).toMatchObject({ title: 'Delayed Title' })
    expect(payloads[1]).toEqual({ locale: 'en-US' })
    expect((document.getElementById('general-title') as HTMLInputElement).value).toBe('Delayed Title')
  })

  it('restores the workspace after a failed locale commit so other cards stay editable', async () => {
    commit.mockImplementation((section: SettingsSection, payload: Record<string, unknown>) => {
      if ('locale' in payload) {
        return Promise.resolve({ ok: false as const })
      }
      return echoCommit(section, payload)
    })

    renderForm()
    const title = document.getElementById('general-title') as HTMLInputElement
    fireEvent.change(title, { target: { value: 'Before the failure' } })

    await pickLocale('English (United States)')
    await waitFor(() => expect(document.querySelector('[inert]')).toBeNull())
    expect(reload).not.toHaveBeenCalled()
    expect(title.value).toBe('Before the failure')

    fireEvent.change(title, { target: { value: 'After the failure' } })
    fireEvent.blur(title)
    await waitFor(() =>
      expect(committedPayloads().some((entry) => entry.payload.title === 'After the failure')).toBe(true),
    )
  })

  it('restores focus to the trigger after a vetoed switch whose portal option unmounted', async () => {
    const localeGate = deferred<{ ok: false }>()
    commit.mockImplementation((section: SettingsSection, payload: Record<string, unknown>) =>
      'locale' in payload ? localeGate.promise : echoCommit(section, payload),
    )

    renderForm()
    const trigger = document.getElementById('general-locale') as HTMLButtonElement
    fireEvent.click(trigger)
    const option = await screen.findByRole('option', { name: 'English (United States)' })
    option.focus()
    fireEvent.pointerDown(option)
    fireEvent.click(option)

    await waitFor(() => expect(document.querySelector('[inert]')).not.toBeNull())
    expect(option.isConnected).toBe(false)
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    expect(document.activeElement === null || document.activeElement === document.body).toBe(true)

    await act(async () => {
      localeGate.resolve({ ok: false })
    })
    await waitFor(() => expect(document.activeElement).toBe(trigger))
    expect(reload).not.toHaveBeenCalled()
  })

  it('does not reload for a same-value locale reselect or another general save', async () => {
    renderForm()

    await pickLocale('简体中文（中国大陆）')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(commit).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()

    const title = document.getElementById('general-title') as HTMLInputElement
    fireEvent.change(title, { target: { value: 'Only the title' } })
    fireEvent.blur(title)
    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    expect(reload).not.toHaveBeenCalled()
  })
})
