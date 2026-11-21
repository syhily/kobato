import { ensureCanvasFont, resetCanvasFont, resetFontCache } from '@kobato/server/render/canvas-fonts.ts'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings.ts'
import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  access: vi.fn<(path: string) => Promise<void>>(),
  readFile: vi.fn<(path: string) => Promise<Buffer>>(),
  fontsHas: vi.fn<(family: string) => boolean>(() => false),
  fontsRegister: vi.fn<(buffer: Buffer, family: string) => void>(),
}))

vi.mock('node:fs/promises', () => ({
  access: mocks.access,
  readFile: mocks.readFile,
}))

vi.mock('@napi-rs/canvas', () => ({
  GlobalFonts: {
    has: mocks.fontsHas,
    register: mocks.fontsRegister,
  },
}))

const TTF_BUFFER = Buffer.from('fake-ttf-bytes')

function seedFontFamilies(families: { og?: string; calendar?: string }) {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    fonts: {
      ...TEST_BLOG_SETTINGS_BUNDLE.fonts!,
      og: { family: families.og ?? '' },
      calendar: { family: families.calendar ?? '' },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  resetCanvasFont()
  resetFontCache()
  mocks.fontsHas.mockReturnValue(false)
  mocks.access.mockResolvedValue(undefined)
  mocks.readFile.mockResolvedValue(TTF_BUFFER)
})

describe('render/canvas-fonts — ensureCanvasFont', () => {
  it('coalesces concurrent calls into a single TTF read and one registration', async () => {
    seedFontFamilies({ og: 'OPPO Sans' })

    const [a, b, c] = await Promise.all([ensureCanvasFont('og'), ensureCanvasFont('og'), ensureCanvasFont('og')])

    expect(a).toEqual({ buffer: TTF_BUFFER, family: 'OPPO Sans' })
    expect(b).toEqual(a)
    expect(c).toEqual(a)
    expect(mocks.readFile).toHaveBeenCalledTimes(1)
    expect(mocks.fontsRegister).toHaveBeenCalledTimes(1)
    expect(mocks.fontsRegister).toHaveBeenCalledWith(TTF_BUFFER, 'OPPO Sans')
  })

  it('clears the flight when the load throws so the next call retries', async () => {
    seedFontFamilies({ og: 'OPPO Sans' })
    mocks.fontsRegister.mockImplementationOnce(() => {
      throw new Error('native register blew up')
    })

    await expect(ensureCanvasFont('og')).rejects.toThrow('native register blew up')

    const slot = await ensureCanvasFont('og')
    expect(slot).toEqual({ buffer: TTF_BUFFER, family: 'OPPO Sans' })
    expect(mocks.fontsRegister).toHaveBeenCalledTimes(2)
  })

  it('does not memoize the null path — a later configured family is picked up', async () => {
    await expect(ensureCanvasFont('calendar')).resolves.toBeNull()
    expect(mocks.readFile).not.toHaveBeenCalled()
    expect(mocks.fontsRegister).not.toHaveBeenCalled()

    seedFontFamilies({ calendar: 'OPPO Serif' })
    const slot = await ensureCanvasFont('calendar')
    expect(slot).toEqual({ buffer: TTF_BUFFER, family: 'OPPO Serif' })
    expect(mocks.fontsRegister).toHaveBeenCalledTimes(1)
  })

  it('assigns the slot even when GlobalFonts already has the family (drift regression)', async () => {
    seedFontFamilies({ calendar: 'OPPO Serif' })
    mocks.fontsHas.mockReturnValue(true)

    const slot = await ensureCanvasFont('calendar')
    expect(slot).toEqual({ buffer: TTF_BUFFER, family: 'OPPO Serif' })
    expect(mocks.fontsRegister).not.toHaveBeenCalled()
    const again = await ensureCanvasFont('calendar')
    expect(again).toEqual(slot)
    expect(mocks.readFile).toHaveBeenCalledTimes(1)
  })

  it('keeps slots independent — og state does not leak into calendar', async () => {
    seedFontFamilies({ og: 'OPPO Sans' })

    await expect(ensureCanvasFont('calendar')).resolves.toBeNull()
    const ogSlot = await ensureCanvasFont('og')
    expect(ogSlot).toEqual({ buffer: TTF_BUFFER, family: 'OPPO Sans' })
    await expect(ensureCanvasFont('calendar')).resolves.toBeNull()
  })

  it('does not commit an in-flight load that raced a reset (font-upload regression)', async () => {
    seedFontFamilies({ og: 'OPPO Sans' })
    let releaseRead!: (buffer: Buffer) => void
    mocks.readFile.mockImplementationOnce(
      () =>
        new Promise<Buffer>((resolve) => {
          releaseRead = resolve
        }),
    )

    const pending = ensureCanvasFont('og')
    await new Promise((resolve) => setImmediate(resolve))
    expect(mocks.readFile).toHaveBeenCalledTimes(1)
    resetFontCache()
    resetCanvasFont('og')
    releaseRead(TTF_BUFFER)

    await expect(pending).resolves.toBeNull()
    expect(mocks.fontsRegister).not.toHaveBeenCalled()

    const newBuffer = Buffer.from('new-ttf-bytes')
    mocks.readFile.mockResolvedValue(newBuffer)
    const slot = await ensureCanvasFont('og')
    expect(slot).toEqual({ buffer: newBuffer, family: 'OPPO Sans' })
    expect(mocks.fontsRegister).toHaveBeenCalledTimes(1)
    expect(mocks.fontsRegister).toHaveBeenCalledWith(newBuffer, 'OPPO Sans')
  })

  it('does not join an in-flight load from a different pinned settings generation', async () => {
    seedFontFamilies({ og: 'OPPO Sans' })
    let releaseOld!: (buffer: Buffer) => void
    mocks.readFile.mockImplementationOnce(
      () =>
        new Promise<Buffer>((resolve) => {
          releaseOld = resolve
        }),
    )

    const pendingOld = ensureCanvasFont('og')
    await new Promise((resolve) => setImmediate(resolve))
    expect(mocks.readFile).toHaveBeenCalledTimes(1)

    const newer = {
      ...TEST_BLOG_SETTINGS_BUNDLE,
      fonts: { ...TEST_BLOG_SETTINGS_BUNDLE.fonts!, og: { family: 'OPPO Serif' } },
    }
    const serifBuffer = Buffer.from('serif-ttf')
    mocks.readFile.mockResolvedValueOnce(serifBuffer)
    const pendingNew = ensureCanvasFont('og', newer)
    await new Promise((resolve) => setImmediate(resolve))
    expect(mocks.readFile).toHaveBeenCalledTimes(2)

    releaseOld(TTF_BUFFER)
    await expect(pendingOld).resolves.toBeNull()
    await expect(pendingNew).resolves.toEqual({ buffer: serifBuffer, family: 'OPPO Serif' })
    expect(mocks.fontsRegister).toHaveBeenCalledTimes(1)
    expect(mocks.fontsRegister).toHaveBeenCalledWith(serifBuffer, 'OPPO Serif')

    mocks.fontsHas.mockImplementation((family) => family === 'OPPO Serif')
    await expect(ensureCanvasFont('og', newer)).resolves.toEqual({ buffer: serifBuffer, family: 'OPPO Serif' })
  })

  it('resetCanvasFont(slot) clears only that slot', async () => {
    seedFontFamilies({ og: 'OPPO Sans', calendar: 'OPPO Serif' })
    mocks.fontsHas.mockReturnValue(true)

    await ensureCanvasFont('og')
    await ensureCanvasFont('calendar')
    expect(mocks.readFile).toHaveBeenCalledTimes(2)

    resetCanvasFont('og')
    mocks.fontsHas.mockReturnValue(false)
    await ensureCanvasFont('og')
    expect(mocks.fontsRegister).toHaveBeenCalledTimes(1)
    expect(mocks.readFile).toHaveBeenCalledTimes(2)
  })

  it('drops the cached slot when the settings family changes — edit takes effect without restart', async () => {
    seedFontFamilies({ og: 'OPPO Sans' })
    await ensureCanvasFont('og')
    expect(mocks.fontsRegister).toHaveBeenCalledWith(TTF_BUFFER, 'OPPO Sans')

    mocks.fontsHas.mockImplementation((family) => family === 'OPPO Sans')

    seedFontFamilies({ og: 'OPPO Serif' })
    const slot = await ensureCanvasFont('og')
    expect(slot).toEqual({ buffer: TTF_BUFFER, family: 'OPPO Serif' })
    expect(mocks.fontsRegister).toHaveBeenCalledTimes(2)
    expect(mocks.fontsRegister).toHaveBeenLastCalledWith(TTF_BUFFER, 'OPPO Serif')
    expect(mocks.readFile).toHaveBeenCalledTimes(1)

    mocks.fontsHas.mockImplementation((family) => family === 'OPPO Serif')
    const again = await ensureCanvasFont('og')
    expect(again).toEqual(slot)
    expect(mocks.fontsRegister).toHaveBeenCalledTimes(2)
  })

  it('falls back to the system font when the settings family is cleared — no cached slot retained', async () => {
    seedFontFamilies({ og: 'OPPO Sans' })
    await ensureCanvasFont('og')
    expect(mocks.fontsRegister).toHaveBeenCalledTimes(1)

    mocks.fontsHas.mockReturnValue(true)
    seedFontFamilies({ og: '' })
    await expect(ensureCanvasFont('og')).resolves.toBeNull()
    expect(mocks.readFile).toHaveBeenCalledTimes(1)
    await expect(ensureCanvasFont('og')).resolves.toBeNull()
  })
})
