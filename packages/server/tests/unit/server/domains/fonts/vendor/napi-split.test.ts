import {
  FontSplitRejectedError,
  fontSplit,
  fontSplitAlgorithmVersion,
} from '@kobato/server/domains/fonts/vendor/napi-split'
import { __clearLogCaptureForTests, __logCaptureForTests } from '@kobato/server/infra/logger'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const addon = vi.hoisted(() => ({ fontSplit: vi.fn(), fontSplitAlgorithmVersion: vi.fn(() => 'fingerprint') }))

vi.mock('@kobato/server/infra/sea/native-require', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kobato/server/infra/sea/native-require')>()
  return { ...actual, nativeRequire: vi.fn(() => addon) }
})

const FILES = [
  { name: 'result.css', data: Buffer.from('@font-face{}') },
  { name: 'abc.woff2', data: Buffer.from([0x77, 0x4f, 0x46, 0x32]) },
]

beforeEach(() => {
  __clearLogCaptureForTests()
  addon.fontSplit.mockReset()
})

afterEach(() => {
  __clearLogCaptureForTests()
})

describe('fontSplit — native binding seam', () => {
  it('hands the font and the stringified CSS options to the addon and returns the files', async () => {
    addon.fontSplit.mockResolvedValue({ files: FILES, warnings: [] })

    const result = await fontSplit({ input: new Uint8Array([1, 2, 3]), css: { fontFamily: 'Barlow', fontWeight: 700 } })

    expect(addon.fontSplit).toHaveBeenCalledWith(Buffer.from([1, 2, 3]), {
      css: { fontFamily: 'Barlow', fontWeight: '700' },
    })
    expect(result.map((file) => file.name)).toEqual(['result.css', 'abc.woff2'])
    expect(result[1]?.data).toBeInstanceOf(Uint8Array)
    expect(Array.from(result[1]?.data ?? [])).toEqual([0x77, 0x4f, 0x46, 0x32])
    expect(__logCaptureForTests().filter((entry) => entry.level === 'warn')).toEqual([])
  })

  it('logs every native warning instead of dropping it', async () => {
    const warning = 'failed to read the GSUB table (offset=4096, size=812): boom'
    addon.fontSplit.mockResolvedValue({ files: FILES, warnings: [warning] })

    const result = await fontSplit({ input: new Uint8Array([1]) })

    expect(result).toHaveLength(2)
    expect(__logCaptureForTests()).toEqual([
      expect.objectContaining({ scope: 'fonts.napi-split', level: 'warn', ctx: { warning } }),
    ])
  })

  it('wraps a native rejection as FontSplitRejectedError', async () => {
    addon.fontSplit.mockRejectedValue(new Error('font split failed: unreadable cmap'))

    await expect(fontSplit({ input: new Uint8Array([1]) })).rejects.toBeInstanceOf(FontSplitRejectedError)
    expect(__logCaptureForTests()).toEqual([])
  })

  it('reads the algorithm version from the same binding', () => {
    expect(fontSplitAlgorithmVersion()).toBe('fingerprint')
  })
})
