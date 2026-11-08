import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ErrorMessageDescriptor } from '@/shared/contracts/api-error'

const mathMock = vi.hoisted(() => vi.fn())

vi.mock('@/client/api/client', () => ({ orpc: { admin: { renders: { math: mathMock } } } }))

const { makeRenderMath, resolveMathError } = await import('@/client/editor/render-math')

// The editor's math channel receives a wire descriptor (never a hardcoded
// server sentence); the adapter resolves it with the caller's active locale.
const RENDER_FAILED: ErrorMessageDescriptor = {
  messageKey: 'admin.editor.math.renderFailed',
  fallbackMessage: 'Could not render the formula',
}

describe('client/editor/render-math — descriptor resolution', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mathMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves the wire descriptor through the caller locale', async () => {
    mathMock.mockResolvedValue({ mathml: '', error: RENDER_FAILED })
    const resolveError = vi.fn(() => '无法渲染公式')
    const renderMath = makeRenderMath(resolveError, '渲染失败，请重试')

    const result = renderMath({ tex: 'x^2', display: false })
    await vi.advanceTimersByTimeAsync(200)

    await expect(result).resolves.toEqual({ error: '无法渲染公式' })
    expect(resolveError).toHaveBeenCalledWith(RENDER_FAILED)
  })

  it('keeps the translated fallback for a non-Error rejection', async () => {
    mathMock.mockRejectedValue('boom')
    const renderMath = makeRenderMath(() => 'unused', '渲染失败，请重试')

    const result = renderMath({ tex: 'x^2', display: false })
    await vi.advanceTimersByTimeAsync(200)

    await expect(result).resolves.toEqual({ error: '渲染失败，请重试' })
  })
})

describe('client/editor/render-math — resolveMathError', () => {
  it('returns the locale-resolved sentence for a known key', () => {
    expect(resolveMathError(RENDER_FAILED, () => 'Could not render the formula')).toBe('Could not render the formula')
  })

  it('uses fallbackMessage when the localizer does not know the key', () => {
    // `localizeMessage` passes an unknown id through unchanged; the editor must
    // show the server's English fallback, never the raw catalog key.
    const localizeMessage = (value: string) => value
    expect(resolveMathError(RENDER_FAILED, localizeMessage)).toBe('Could not render the formula')
  })
})
