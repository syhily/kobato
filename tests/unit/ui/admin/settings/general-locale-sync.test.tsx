// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SettingsSection } from '@/shared/config/sections'
import type { SiteIdentitySettings } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { FakeBroadcastChannel } from '#/_helpers/fake-broadcast-channel'
import { wrapWithI18n } from '#/_helpers/i18n-render'
import { publishLocaleChange } from '@/client/lib/locale-sync'
import { mergeSectionPatch } from '@/shared/config/merge-section-patch'
import { GeneralForm } from '@/ui/admin/settings/GeneralForm'
import { SettingsFlushProvider } from '@/ui/admin/settings/shell/SettingsFlushProvider'
import { SettingsPanel } from '@/ui/admin/settings/shell/SettingsPanel'
import { LocaleSyncProvider } from '@/ui/lib/LocaleSyncProvider'

// Two REAL GeneralForm workspaces against one fake settings server, connected by
// the real BroadcastChannel transport (the tab-pair harness). The subscription
// lives in the ROOT `LocaleSyncProvider` (one per tab) and the settings
// workspace registers its flush host with it, so this exercises the real
// production wiring: useSettingsCard (sparse diff) → useSettingsMutation (fake
// server) → useLocaleSwitch (announce) → LocaleSyncProvider (receive) →
// SettingsFlushProvider (transaction + flush).
//
// The mock server deep-merges exactly like `src/shared/config/merge-section-patch`
// and answers with the merged section, so assertions read the PERSISTED state,
// not only the call arguments.

const commit = vi.hoisted(() => vi.fn())
const toastMock = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn(), success: vi.fn() }))
const reload = vi.fn()

vi.mock('@/ui/admin/settings/useSettingsMutation', () => ({
  useSettingsMutation: () => ({ commit, isPending: false, status: 'idle' }),
}))

vi.mock('sonner', () => ({ toast: toastMock, Toaster: () => null }))

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

/** Hold the next commit carrying `field` until the returned release fn runs. */
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
  // The popup is portalled to the document; only one is open at a time.
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

    // B narrows the timezone (field-scoped save) …
    await pickOption(tabB.container, 'general-timezone', 'UTC')
    await waitFor(() => expect(payloads).toHaveLength(1))
    expect(payloadOf(0)).toEqual({ timeZone: 'UTC' })

    // … and types a custom time format without blurring: still dirty.
    const formatInput = byId(tabB.container, 'general-time-format') as HTMLInputElement
    fireEvent.change(formatInput, { target: { value: 'yyyy/MM/dd' } })

    const release = gateField('timeFormat')

    // A switches to English. Its own flow: flush (nothing dirty) → locale commit
    // → announcement → reload.
    await pickOption(tabA.container, 'general-locale', 'English (United States)')
    await waitFor(() => expect(server.locale).toBe('en-US'))
    await waitFor(() => expect(reload).toHaveBeenCalledOnce())

    // B received the announcement and is saving its dirty field through a
    // WHOLE-CARD flush: the patch carries the time format alone. A full
    // fromState re-send would have included B's stale `locale: zh-CN` and
    // reverted A's switch.
    await waitFor(() => expect(payloads).toHaveLength(3))
    expect(payloadOf(1)).toEqual({ locale: 'en-US' })
    expect(payloadOf(2)).toEqual({ timeFormat: 'yyyy/MM/dd' })
    expect(payloadOf(2)).not.toHaveProperty('locale')
    expect(payloadOf(2)).not.toHaveProperty('timeZone')

    // B's reload waits for that save — not one moment earlier.
    expect(reload).toHaveBeenCalledOnce()
    // The response (which carries A's en-US) never wrote into B's form.
    expect(byId(tabB.container, 'general-locale').textContent).toContain('简体中文（中国大陆）')
    expect(server.locale).toBe('en-US')

    release()
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(2))
    expect(server.timeFormat).toBe('yyyy/MM/dd')
    expect(server.locale).toBe('en-US')

    // No broadcast loop: neither tab publishes again, so no extra commits and
    // no third reload; the workspace comes back from `inert` on both sides.
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
    // A reloaded for its own switch; B's flush failed, so B must NOT reload.
    expect(reload).toHaveBeenCalledOnce()
    // The rejected edit is still on screen, the workspace is usable again, and
    // the server never received the rejected value.
    expect(formatInput).toHaveValue('yyyy/MM/dd')
    expect(tabB.container.querySelector('[inert]')).toBeNull()
    expect(server.timeFormat).toBe(INITIAL.timeFormat)

    // B can still save it once the server accepts it.
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

    // No announcement path → B keeps its edits and does not reload on its own.
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
    // The receiver never commits the locale itself.
    expect(payloads.some((entry) => 'locale' in entry.payload)).toBe(false)
  })

  it('ignores an announcement for the locale already loaded, and repeats while a sync runs', async () => {
    const view = renderClient(structuredClone(INITIAL))
    const formatInput = byId(view.container, 'general-time-format') as HTMLInputElement

    // Loaded locale — nothing to apply.
    publishLocaleChange('zh-CN', 'peer-tab')
    await settle()
    expect(payloads).toEqual([])
    expect(reload).not.toHaveBeenCalled()

    fireEvent.change(formatInput, { target: { value: 'yyyy/MM/dd' } })
    const release = gateField('timeFormat')
    publishLocaleChange('en-US', 'peer-tab')
    await waitFor(() => expect(payloads).toHaveLength(1))

    // A second announcement (another peer, same moment) must not start a second
    // flush/reload chain while the first is still running.
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

    // The workspace goes inert for the sync transaction (same host as a local
    // switch), so no input can be dropped behind the reload.
    await waitFor(() => expect(payloads).toHaveLength(1))
    expect(view.container.querySelector('[inert]')).not.toBeNull()
    // A real browser drops focus when the subtree goes inert.
    formatInput.blur()

    release()
    await settle()

    expect(reload).not.toHaveBeenCalled()
    expect(formatInput).toHaveValue('yyyy/MM/dd')
    expect(view.container.querySelector('[inert]')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(formatInput))
  })
})
