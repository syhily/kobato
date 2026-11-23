import type { ErrorMessageDescriptor } from '@kobato/api/contracts/primitives'

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mathMock = vi.hoisted(() => vi.fn())

const apiClientMod = await import('@kobato/web-client/api/client')
vi.spyOn(apiClientMod, 'orpc', 'get').mockImplementation(() => ({ admin: { renders: { math: mathMock } } }) as never)

afterAll(() => {
  vi.restoreAllMocks()
})

const { makeRenderMath, resolveMathError } = await import('@kobato/web-admin/ui/editor/render-math')

const RENDER_FAILED: ErrorMessageDescriptor = {
  messageKey: 'admin.editor.math.renderFailed',
  fallbackMessage: 'Could not render the formula',
}

describe('ui/admin/editor/render-math — descriptor resolution', () => {
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

describe('ui/admin/editor/render-math — resolveMathError', () => {
  it('returns the locale-resolved sentence for a known key', () => {
    expect(resolveMathError(RENDER_FAILED, () => 'Could not render the formula')).toBe('Could not render the formula')
  })

  it('uses fallbackMessage when the localizer does not know the key', () => {
    const localizeMessage = (value: string) => value
    expect(resolveMathError(RENDER_FAILED, localizeMessage)).toBe('Could not render the formula')
  })
})
