import { sliceFont } from '@kobato/server/domains/fonts/slice'
import {
  FontSplitRejectedError,
  fontSplit,
  type FontSplitOutputFile,
} from '@kobato/server/domains/fonts/vendor/napi-split'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@kobato/server/domains/fonts/vendor/napi-split', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kobato/server/domains/fonts/vendor/napi-split')>()
  return { ...actual, fontSplit: vi.fn() }
})

function slicedPackage(): FontSplitOutputFile[] {
  return [
    { name: 'result.css', data: new TextEncoder().encode('@font-face{}') },
    { name: 'abc.woff2', data: new Uint8Array([0x77, 0x4f, 0x46, 0x32]) },
    { name: 'def.woff2', data: new Uint8Array([0x77, 0x4f, 0x46, 0x32]) },
  ]
}

beforeEach(() => {
  vi.mocked(fontSplit).mockReset()
})

describe('sliceFont — addon contract', () => {
  it('asks for a reproducible stylesheet and forwards the family', async () => {
    vi.mocked(fontSplit).mockResolvedValue(slicedPackage())
    const source = new Uint8Array([1, 2, 3])

    const result = await sliceFont(source, { fontFamily: 'Barlow' })

    expect(fontSplit).toHaveBeenCalledWith({ input: source, css: { commentBase: false, fontFamily: 'Barlow' } })
    expect(result.chunkCount).toBe(2)
    expect(result.totalBytes).toBe(result.css.length + 8)
  })

  it('omits the family when none is given', async () => {
    vi.mocked(fontSplit).mockResolvedValue(slicedPackage())

    await sliceFont(new Uint8Array([1]))

    expect(fontSplit).toHaveBeenCalledWith({ input: new Uint8Array([1]), css: { commentBase: false } })
  })

  it('reports a package without result.css as a contract drift, not as a bad font', async () => {
    vi.mocked(fontSplit).mockResolvedValue(slicedPackage().filter((file) => file.name !== 'result.css'))

    await expect(sliceFont(new Uint8Array([1]))).rejects.toThrow('did not emit result.css')
  })
})

describe('sliceFont — failures', () => {
  it('turns an addon rejection into a BAD_REQUEST that names the unreadable-font message', async () => {
    vi.mocked(fontSplit).mockRejectedValue(
      new FontSplitRejectedError({ cause: new Error('font split failed: unreadable cmap') }),
    )

    await expect(sliceFont(new Uint8Array([1]))).rejects.toMatchObject({
      name: 'DomainError',
      code: 'BAD_REQUEST',
      descriptor: { messageKey: 'fonts.error.unreadable' },
    })
  })

  it('does not disguise an unavailable addon as a bad font', async () => {
    vi.mocked(fontSplit).mockRejectedValue(new Error('font-split native addon is unavailable'))

    const rejection = await sliceFont(new Uint8Array([1])).then(
      () => undefined,
      (error: unknown) => error,
    )

    expect(rejection).toBeInstanceOf(Error)
    expect(rejection).not.toBeInstanceOf(FontSplitRejectedError)
    expect(rejection).toMatchObject({ message: 'font-split native addon is unavailable' })
  })
})
