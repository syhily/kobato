import InklingUiPrefsContext from '@kobato/inkling-internal/context/InklingUiPrefsContext'
import usePinturaEditor from '@kobato/inkling-internal/hooks/usePinturaEditor'
import { resolveLabels, type InklingLabelsInput } from '@kobato/inkling-internal/labels/inkling-labels'
import { act, renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const ink_utils_analytics = await import('@kobato/inkling-internal/utils/analytics')
vi.spyOn(ink_utils_analytics, 'default').mockImplementation(vi.fn() as never)

afterAll(() => {
  vi.restoreAllMocks()
})

class MockPinturaEditor {
  on(): void {}
}

async function captureOpenOptions({
  config = {},
  labels: labelsInput,
}: { config?: Record<string, unknown>; labels?: InklingLabelsInput } = {}) {
  const openDefaultEditor = vi.fn((_options: Record<string, unknown>) => new MockPinturaEditor())
  window.pintura = { openDefaultEditor } as unknown as typeof window.pintura

  function Wrapper({ children }: { children: React.ReactNode }) {
    const prefsValue = React.useMemo(() => ({ darkMode: false, labels: resolveLabels(labelsInput) }), [])
    return React.createElement(InklingUiPrefsContext.Provider, { value: prefsValue }, children)
  }

  const { result } = renderHook(
    () =>
      usePinturaEditor({
        config: {
          jsUrl: 'https://example.com/pintura.js',
          cssUrl: 'https://example.com/pintura.css',
          ...config,
        },
      }),
    { wrapper: Wrapper },
  )

  const link = document.querySelector('link[href="https://example.com/pintura.css"]')
  act(() => {
    ;(link as HTMLLinkElement).onload?.(new Event('load'))
  })

  await waitFor(() => {
    expect(result.current.isEnabled).toBe(true)
  })

  act(() => {
    result.current.openEditor({ image: 'https://example.com/image.jpg', handleSave: vi.fn() })
  })

  expect(openDefaultEditor).toHaveBeenCalledTimes(1)
  return openDefaultEditor.mock.calls[0][0]
}

describe('usePinturaEditor', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    delete (window as { pintura?: unknown }).pintura
    vi.clearAllMocks()
  })

  it('returns isEnabled false and no error by default', () => {
    const { result } = renderHook(() => usePinturaEditor())

    expect(result.current.isEnabled).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('sets error when the script URL is invalid', async () => {
    const { result } = renderHook(() => usePinturaEditor({ config: { jsUrl: 'http://' } }))
    await waitFor(() => {
      expect(result.current.error).toBeTruthy()
    })

    expect(String((result.current.error as Error).cause)).toContain('Invalid URL')
  })

  it('sets error when the script import fails', async () => {
    const { result } = renderHook(() => usePinturaEditor({ config: { jsUrl: 'https://example.com/pintura.js' } }))

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error)
    })

    expect(result.current.error?.message).toBe('Failed to load Pintura script from https://example.com/pintura.js')
  })

  it('sets error when the stylesheet fails to load', async () => {
    const { result } = renderHook(() => usePinturaEditor({ config: { cssUrl: 'https://example.com/pintura.css' } }))

    const link = document.querySelector('link[href="https://example.com/pintura.css"]')
    expect(link).not.toBeNull()

    act(() => {
      ;(link as HTMLLinkElement).onerror?.(new Event('error'))
    })

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error)
    })

    expect(result.current.error?.message).toBe('Failed to load Pintura stylesheet from https://example.com/pintura.css')
  })

  it('sets error when the editor emits a loaderror', async () => {
    const loaderrorHandlers: unknown[] = []
    class MockPinturaEditor {
      on(event: 'loaderror', handler: (error: unknown) => void): void
      on(event: 'process', handler: (result: { dest: Blob }) => void): void
      on(event: 'loaderror' | 'process', handler: ((error: unknown) => void) | ((result: { dest: Blob }) => void)) {
        if (event === 'loaderror') {
          loaderrorHandlers.push(handler)
        }
      }
    }

    window.pintura = {
      openDefaultEditor: vi.fn(() => new MockPinturaEditor()),
    }

    const { result } = renderHook(() =>
      usePinturaEditor({
        config: {
          jsUrl: 'https://example.com/pintura.js',
          cssUrl: 'https://example.com/pintura.css',
        },
      }),
    )

    const link = document.querySelector('link[href="https://example.com/pintura.css"]')
    act(() => {
      ;(link as HTMLLinkElement).onload?.(new Event('load'))
    })

    await waitFor(() => {
      expect(result.current.isEnabled).toBe(true)
    })

    const loadError = new Error('Pintura failed to load image')
    act(() => {
      result.current.openEditor({
        image: 'https://example.com/image.jpg',
        handleSave: vi.fn(),
      })
    })

    act(() => {
      loaderrorHandlers.forEach((handler) => {
        if (typeof handler === 'function') {
          handler(loadError)
        }
      })
    })

    await waitFor(() => {
      expect(result.current.error).toBe(loadError)
    })
  })

  it('feeds the labels table into the Pintura locale (C7)', async () => {
    const options = await captureOpenOptions()

    expect((options.locale as Record<string, string>).labelButtonExport).toBe('Save and close')
    expect(options.cropSelectPresetOptions).toContainEqual([undefined, 'Custom'])
    expect(options.cropSelectPresetOptions).toContainEqual([1, 'Square'])
  })

  it('resolves pintura.* keys from the composer labels overrides', async () => {
    const options = await captureOpenOptions({
      labels: {
        'pintura.export': '保存并关闭',
        'pintura.cropPreset.custom': '自定义',
      },
    })

    expect((options.locale as Record<string, string>).labelButtonExport).toBe('保存并关闭')
    expect(options.cropSelectPresetOptions).toContainEqual([undefined, '自定义'])
  })

  it('merges pinturaConfig.locale on top of the labels table', async () => {
    const options = await captureOpenOptions({
      labels: { 'pintura.export': '保存并关闭' },
      config: {
        locale: { labelButtonExport: 'Export now', labelCancel: 'Cancel' },
      },
    })

    expect(options.locale).toEqual({ labelButtonExport: 'Export now', labelCancel: 'Cancel' })
  })
  it('removes the capture-phase click listener on unmount', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = renderHook(() => usePinturaEditor())

    const clickAddCalls = addEventListenerSpy.mock.calls.filter(
      (call) => call[0] === 'click' && (call[2] as AddEventListenerOptions)?.capture === true,
    )
    expect(clickAddCalls.length).toBe(1)

    unmount()

    const clickRemoveCalls = removeEventListenerSpy.mock.calls.filter(
      (call) => call[0] === 'click' && (call[1] as EventListener) === (clickAddCalls[0][1] as EventListener),
    )
    expect(clickRemoveCalls.length).toBe(1)
    expect((clickRemoveCalls[0][2] as AddEventListenerOptions)?.capture).toBe(true)

    addEventListenerSpy.mockRestore()
    removeEventListenerSpy.mockRestore()
  })
})
