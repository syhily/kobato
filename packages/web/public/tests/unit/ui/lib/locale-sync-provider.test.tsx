import { FakeBroadcastChannel } from '@kobato/test/fake-broadcast-channel.ts'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { publishLocaleChange, subscribeLocaleChange } from '@kobato/web-client/lib/locale-sync.ts'
import { wrapWithI18n } from '@kobato/web-public/tests/utils/i18n-render.tsx'
import {
  LocaleSyncProvider,
  useLocaleSyncHostRegistration,
  useLocaleSyncPublish,
} from '@kobato/web-public/ui/lib/LocaleSyncProvider.tsx'
// @vitest-environment happy-dom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const reload = vi.fn()

interface LocaleSyncHostSpy {
  runTransaction: ReturnType<typeof vi.fn>
  flushAllAndWait: ReturnType<typeof vi.fn>
  isBusy: ReturnType<typeof vi.fn>
}

function makeHost(overrides: Partial<LocaleSyncHostSpy> = {}): LocaleSyncHostSpy {
  return {
    runTransaction: vi.fn(async (task: () => unknown) => task()),
    flushAllAndWait: vi.fn(async () => true),
    isBusy: vi.fn(() => false),
    ...overrides,
  }
}

function RegisterHost({ host }: { host: LocaleSyncHostSpy }) {
  const register = useLocaleSyncHostRegistration()
  useEffect(() => register(host as never), [register, host])
  return null
}

function PublishProbe() {
  const { t } = useI18n()
  const publish = useLocaleSyncPublish()
  return (
    <button type="button" onClick={() => publish('en-US')}>
      {t('common.action.save')}
    </button>
  )
}

function UnsavedEditor() {
  const [text, setText] = useState('')
  return (
    <>
      <label htmlFor="unsaved-editor">Draft</label>
      <textarea id="unsaved-editor" value={text} onChange={(event) => setText(event.target.value)} />
    </>
  )
}

function renderDocument(
  options: { locale?: 'zh-CN' | 'en-US'; revision?: string; host?: LocaleSyncHostSpy; editor?: boolean } = {},
) {
  const locale = options.locale ?? 'zh-CN'
  return render(
    wrapWithI18n(
      <LocaleSyncProvider locale={locale} revision={options.revision ?? 'rev-1'}>
        {options.host ? <RegisterHost host={options.host} /> : null}
        {options.editor ? <UnsavedEditor /> : null}
        <PublishProbe />
      </LocaleSyncProvider>,
      { locale },
    ),
  )
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
})

afterEach(() => {
  vi.unstubAllGlobals()
  FakeBroadcastChannel.instances.length = 0
})

describe('LocaleSyncProvider — document without a flush host (editor/setup/public)', () => {
  it('never auto-reloads an editor with unsaved input; it keeps the draft until an explicit Reload', async () => {
    renderDocument({ editor: true })
    const draft = screen.getByLabelText('Draft')
    fireEvent.change(draft, { target: { value: 'half-written post' } })

    act(() => publishLocaleChange('en-US', 'peer-tab', 'rev-2'))

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(reload).not.toHaveBeenCalled()
    expect(draft).toHaveValue('half-written post')
    expect(screen.getByRole('alert').textContent).toContain('其他标签页已切换语言')
    expect(screen.getByRole('alert').textContent).toContain('未保存的内容在刷新前会保留在页面上')

    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => expect(reload).toHaveBeenCalledOnce())
    expect(draft).toHaveValue('half-written post')
  })

  it('shows one notice for repeated announcements, and offers it again after dismissal', async () => {
    renderDocument()

    act(() => publishLocaleChange('en-US', 'peer-tab', 'rev-2'))
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1))

    act(() => publishLocaleChange('en-US', 'third-tab', 'rev-2'))
    await settle()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(reload).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    act(() => publishLocaleChange('en-US', 'third-tab', 'rev-2'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(reload).not.toHaveBeenCalled()
  })

  it('ignores the locale already loaded and a repeat after a reload attempt', async () => {
    renderDocument()

    act(() => publishLocaleChange('zh-CN', 'peer-tab', 'rev-2'))
    await settle()
    expect(screen.queryByRole('alert')).toBeNull()

    act(() => publishLocaleChange('en-US', 'peer-tab', 'rev-2'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => expect(reload).toHaveBeenCalledOnce())

    act(() => publishLocaleChange('en-US', 'third-tab', 'rev-2'))
    await settle()
    expect(reload).toHaveBeenCalledOnce()
  })
})

describe('LocaleSyncProvider — settings workspace host', () => {
  it('flushes every dirty card inside the transaction, then reloads automatically', async () => {
    const host = makeHost()
    renderDocument({ host })

    act(() => publishLocaleChange('en-US', 'peer-tab', 'rev-2'))

    await waitFor(() => expect(reload).toHaveBeenCalledOnce())
    expect(host.runTransaction).toHaveBeenCalledOnce()
    expect(host.flushAllAndWait).toHaveBeenCalledOnce()
    expect(host.runTransaction.mock.invocationCallOrder[0]!).toBeLessThan(reload.mock.invocationCallOrder[0]!)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps the edits, shows Retry + Reload and never auto-reloads when the flush fails', async () => {
    const host = makeHost({ flushAllAndWait: vi.fn(async () => false) })
    renderDocument({ host })

    act(() => publishLocaleChange('en-US', 'peer-tab', 'rev-2'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())

    expect(reload).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('其他标签页已切换语言')
    expect(screen.getByRole('alert').textContent).toContain('本页没有重新加载')
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '刷新' })).toBeTruthy()
  })

  it('retries the flush after a failure, then reloads (the token was never consumed)', async () => {
    const host = makeHost({ flushAllAndWait: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true) })
    renderDocument({ host })

    act(() => publishLocaleChange('en-US', 'peer-tab', 'rev-2'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(reload).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '重试' }))

    await waitFor(() => expect(reload).toHaveBeenCalledOnce())
    expect(host.flushAllAndWait).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('lets a repeat run again after a failed flush was dismissed (no early dedupe)', async () => {
    const host = makeHost({ flushAllAndWait: vi.fn(async () => false) })
    renderDocument({ host })

    act(() => publishLocaleChange('en-US', 'peer-tab', 'rev-2'))
    await waitFor(() => expect(host.flushAllAndWait).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))

    act(() => publishLocaleChange('en-US', 'third-tab', 'rev-2'))
    await waitFor(() => expect(host.flushAllAndWait).toHaveBeenCalledTimes(2))
    expect(reload).not.toHaveBeenCalled()
  })

  it('ignores an announcement while the workspace is mid-transaction', async () => {
    const host = makeHost({ isBusy: vi.fn(() => true) })
    renderDocument({ host })

    act(() => publishLocaleChange('en-US', 'peer-tab', 'rev-2'))
    await settle()

    expect(host.flushAllAndWait).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('LocaleSyncProvider — publishing', () => {
  it('publishes exactly one announcement carrying the bootstrap revision and ignores its own echo', () => {
    const received: unknown[] = []
    const unsubscribe = subscribeLocaleChange('listener', (announcement) => received.push(announcement))
    renderDocument({ revision: 'rev-9' })

    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(received).toEqual([{ locale: 'en-US', revision: 'rev-9' }])
    expect(reload).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('degrades to a no-op when BroadcastChannel is unavailable', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    renderDocument()

    expect(() => fireEvent.click(screen.getByRole('button', { name: '保存' }))).not.toThrow()
    await settle()
    expect(reload).not.toHaveBeenCalled()
  })
})
