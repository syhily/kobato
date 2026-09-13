// @vitest-environment happy-dom

import { act, renderHook as renderDomHook } from '@testing-library/react'
import { createRef, type RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderHook } from '#/_helpers/hook'
import { useMediumZoom } from '@/client/hooks/use-medium-zoom'

const mocks = vi.hoisted(() => {
  const attach = vi.fn()
  const detach = vi.fn()
  return { attach, detach, mediumZoom: vi.fn(() => ({ attach, detach })) }
})

vi.mock('medium-zoom/dist/pure', () => ({ default: mocks.mediumZoom }))
vi.mock('medium-zoom/dist/style.css', () => ({}))

function mountContainer(html: string): { container: HTMLDivElement; ref: RefObject<HTMLDivElement | null> } {
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  const ref = createRef<HTMLDivElement>()
  ;(ref as { current: HTMLDivElement | null }).current = container
  return { container, ref }
}

beforeEach(() => {
  mocks.mediumZoom.mockClear()
  mocks.attach.mockClear()
  mocks.detach.mockClear()
})

afterEach(() => {
  document.body.replaceChildren()
})

describe('useMediumZoom', () => {
  it('renders without error when container ref is null', () => {
    expect(() => renderHook(() => useMediumZoom({ current: null }, ''))).not.toThrow()
  })

  it('defers the zoom-library import when the container carries no image', async () => {
    const { ref } = mountContainer('<p>text only</p>')
    await act(async () => {
      renderDomHook(() => useMediumZoom(ref, '<p>text only</p>'))
      await Promise.resolve()
    })
    expect(mocks.mediumZoom).not.toHaveBeenCalled()
    expect(mocks.attach).not.toHaveBeenCalled()
  })

  it('attaches images found by the container probe (no bodyHtml substring gate)', async () => {
    const { container, ref } = mountContainer('<img src="/x.png" alt="">')
    await act(async () => {
      // The re-scan key intentionally carries no '<img' marker — the
      // container probe, not a markup substring, gates the dynamic import.
      renderDomHook(() => useMediumZoom(ref, 'rescan-key'))
      await Promise.resolve()
    })
    expect(mocks.attach).toHaveBeenCalledTimes(1)
    const targets = mocks.attach.mock.calls[0]?.[0] as HTMLImageElement[]
    expect(targets).toHaveLength(1)
    expect(targets[0]).toBe(container.querySelector('img'))
  })
})
