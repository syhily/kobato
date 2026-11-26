import type { SettingsSection } from '@kobato/settings/sections'
import type { SiteIdentitySettings } from '@kobato/settings/types'

import { mergeSectionPatch } from '@kobato/server/domains/settings/services/merge-section-patch'
import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { FakeBroadcastChannel } from '@kobato/test/fake-broadcast-channel'
import { wrapWithI18n } from '@kobato/ui/tests/utils/i18n-render'
import { publishLocaleChange } from '@kobato/web-kit/ui/lib/locale-sync'
import { LocaleSyncProvider } from '@kobato/web-kit/ui/lib/LocaleSyncProvider'
// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GeneralForm } from '@/ui/settings/general/GeneralForm'
import { SettingsFlushProvider } from '@/ui/settings/shell/SettingsFlushProvider'
import { SettingsPanel } from '@/ui/settings/shell/SettingsPanel'

const commit = vi.hoisted(() => vi.fn())
const reload = vi.fn()

const settingsMutation = await import('@/ui/settings/use-settings-mutation')
vi.spyOn(settingsMutation, 'useSettingsMutation').mockImplementation(() => ({
  commit,
  isPending: false,
  status: 'idle',
}))

afterAll(() => {
  vi.restoreAllMocks()
})

const INITIAL = TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!
const TIME_ZONES = ['Asia/Shanghai', 'UTC', 'America/New_York'] as const

let server: SiteIdentitySettings
let payloads: Array<{ section: SettingsSection; payload: Record<string, unknown> }>
let rejectFields: Set<string>
let gate: { field: string; promise: Promise<void>; release: () => void } | null = null

function startServer(): void {
  server = structuredClone(INITIAL)
  payloads = []
  rejectFields = new Set()
  gate = null
  commit.mockReset()
  commit.mockImplementation(async (section: SettingsSection, payload: Record<string, unknown>) => {
    payloads.push({ section, payload })
    if (gate !== null && gate.field in payload) {
      await gate.promise
    }
    for (const field of rejectFields) {
      if (field in payload) {
        return { ok: false as const }
      }
    }
    server = mergeSectionPatch(server, payload)
    return { ok: true as const, section: server }
  })
}

function gateField(field: string): () => void {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  gate = { field, promise, release }
  return release
}

function renderClient(siteIdentity: SiteIdentitySettings) {
  return render(
    wrapWithI18n(
      <LocaleSyncProvider locale={siteIdentity.locale} revision="tab-revision">
        <SettingsFlushProvider>
          <SettingsPanel>
            <GeneralForm siteIdentity={siteIdentity} timeZones={TIME_ZONES} />
          </SettingsPanel>
        </SettingsFlushProvider>
      </LocaleSyncProvider>,
    ),
  )
}

function byId(container: HTMLElement, id: string): HTMLElement {
  const element = container.querySelector(`#${id}`)
  expect(element).not.toBeNull()
  return element as HTMLElement
}

async function pickOption(container: HTMLElement, triggerId: string, label: string): Promise<void> {
  fireEvent.click(byId(container, triggerId))
  const option = await screen.findByRole('option', { name: label })
  fireEvent.pointerDown(option)
  fireEvent.click(option)
}

const settle = async (): Promise<void> => {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

beforeEach(() => {
  FakeBroadcastChannel.instances.length = 0
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
  reload.mockReset()
  Object.defineProperty(window.location, 'reload', { configurable: true, writable: true, value: reload })
  startServer()
})

afterEach(() => {
  vi.unstubAllGlobals()
  FakeBroadcastChannel.instances.length = 0
})

function payloadOf(index: number): Record<string, unknown> {
  return payloads[index]!.payload
}

describe('General locale sync — two tabs sharing one server', () => {
  it('A switches the language; B saves only its dirty field, never the locale, and reloads after that save', async () => {
    const tabA = renderClient(structuredClone(INITIAL))
    const tabB = renderClient(structuredClone(INITIAL))

    await pickOption(tabB.container, 'general-timezone', 'UTC')
    await waitFor(() => expect(payloads).toHaveLength(1))
    expect(payloadOf(0)).toEqual({ timeZone: 'UTC' })

    const formatInput = byId(tabB.container, 'general-time-format') as HTMLInputElement
    fireEvent.change(formatInput, { target: { value: 'yyyy/MM/dd' } })

    const release = gateField('timeFormat')

    await pickOption(tabA.container, 'general-locale', 'English (United States)')
    await waitFor(() => expect(server.locale).toBe('en-US'))
    await waitFor(() => expect(reload).toHaveBeenCalledOnce())

    await waitFor(() => expect(payloads).toHaveLength(3))
    expect(payloadOf(1)).toEqual({ locale: 'en-US' })
    expect(payloadOf(2)).toEqual({ timeFormat: 'yyyy/MM/dd' })
    expect(payloadOf(2)).not.toHaveProperty('locale')
    expect(payloadOf(2)).not.toHaveProperty('timeZone')

    expect(reload).toHaveBeenCalledOnce()
    expect(byId(tabB.container, 'general-locale').textContent).toContain('简体中文（中国大陆）')
    expect(server.locale).toBe('en-US')

    release()
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(2))
    expect(server.timeFormat).toBe('yyyy/MM/dd')
    expect(server.locale).toBe('en-US')

    await settle()
    expect(payloads).toHaveLength(3)
    expect(reload).toHaveBeenCalledTimes(2)
    expect(tabA.container.querySelector('[inert]')).toBeNull()
    expect(tabB.container.querySelector('[inert]')).toBeNull()
  })

  it('never reloads a receiver whose dirty save fails — the edits stay and the workspace unlocks', async () => {
    rejectFields.add('timeFormat')
    const tabA = renderClient(structuredClone(INITIAL))
    const tabB = renderClient(structuredClone(INITIAL))

    const formatInput = byId(tabB.container, 'general-time-format') as HTMLInputElement
    fireEvent.change(formatInput, { target: { value: 'yyyy/MM/dd' } })

    await pickOption(tabA.container, 'general-locale', 'English (United States)')
    await waitFor(() => expect(server.locale).toBe('en-US'))
    await waitFor(() => expect(payloads).toHaveLength(2))
    expect(payloadOf(1)).toEqual({ timeFormat: 'yyyy/MM/dd' })

    await settle()
    expect(reload).toHaveBeenCalledOnce()
    expect(formatInput).toHaveValue('yyyy/MM/dd')
    expect(tabB.container.querySelector('[inert]')).toBeNull()
    expect(server.timeFormat).toBe(INITIAL.timeFormat)

    rejectFields.delete('timeFormat')
    fireEvent.blur(formatInput)
    await waitFor(() => expect(payloads).toHaveLength(3))
    expect(payloadOf(2)).toEqual({ timeFormat: 'yyyy/MM/dd' })
    expect(server.timeFormat).toBe('yyyy/MM/dd')
    expect(reload).toHaveBeenCalledOnce()
  })

  it('degrades safely without BroadcastChannel: A reloads once, B is never disturbed', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const tabA = renderClient(structuredClone(INITIAL))
    const tabB = renderClient(structuredClone(INITIAL))

    const formatInput = byId(tabB.container, 'general-time-format') as HTMLInputElement
    fireEvent.change(formatInput, { target: { value: 'yyyy/MM/dd' } })

    await pickOption(tabA.container, 'general-locale', 'English (United States)')
    await waitFor(() => expect(server.locale).toBe('en-US'))
    await waitFor(() => expect(reload).toHaveBeenCalledOnce())
    await settle()

    expect(reload).toHaveBeenCalledOnce()
    expect(payloads).toHaveLength(1)
    expect(formatInput).toHaveValue('yyyy/MM/dd')
    expect(tabB.container.querySelector('[inert]')).toBeNull()
  })
})

describe('General locale sync — a peer announcement', () => {
  it('flushes this workspace’s dirty fields BEFORE reloading, exactly once', async () => {
    const view = renderClient(structuredClone(INITIAL))
    const formatInput = byId(view.container, 'general-time-format') as HTMLInputElement
    fireEvent.change(formatInput, { target: { value: 'yyyy/MM/dd' } })

    publishLocaleChange('en-US', 'peer-tab')

    await waitFor(() => expect(payloads).toHaveLength(1))
    expect(payloadOf(0)).toEqual({ timeFormat: 'yyyy/MM/dd' })
    await waitFor(() => expect(reload).toHaveBeenCalledOnce())
    expect(payloads.some((entry) => 'locale' in entry.payload)).toBe(false)
  })

  it('ignores an announcement for the locale already loaded, and repeats while a sync runs', async () => {
    const view = renderClient(structuredClone(INITIAL))
    const formatInput = byId(view.container, 'general-time-format') as HTMLInputElement

    publishLocaleChange('zh-CN', 'peer-tab')
    await settle()
    expect(payloads).toEqual([])
    expect(reload).not.toHaveBeenCalled()

    fireEvent.change(formatInput, { target: { value: 'yyyy/MM/dd' } })
    const release = gateField('timeFormat')
    publishLocaleChange('en-US', 'peer-tab')
    await waitFor(() => expect(payloads).toHaveLength(1))

    publishLocaleChange('en-US', 'third-tab')
    await settle()
    expect(payloads).toHaveLength(1)

    release()
    await waitFor(() => expect(reload).toHaveBeenCalledOnce())
    await settle()
    expect(payloads).toHaveLength(1)
    expect(reload).toHaveBeenCalledOnce()
  })

  it('keeps dirty edits, releases inert and restores focus when the flush fails', async () => {
    rejectFields.add('timeFormat')
    const view = renderClient(structuredClone(INITIAL))
    const formatInput = byId(view.container, 'general-time-format') as HTMLInputElement
    formatInput.focus()
    fireEvent.change(formatInput, { target: { value: 'yyyy/MM/dd' } })

    const release = gateField('timeFormat')
    publishLocaleChange('en-US', 'peer-tab')

    await waitFor(() => expect(payloads).toHaveLength(1))
    expect(view.container.querySelector('[inert]')).not.toBeNull()
    formatInput.blur()

    release()
    await settle()

    expect(reload).not.toHaveBeenCalled()
    expect(formatInput).toHaveValue('yyyy/MM/dd')
    expect(view.container.querySelector('[inert]')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(formatInput))
  })
})
