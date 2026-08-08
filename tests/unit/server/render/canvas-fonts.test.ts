import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { ensureCanvasFont, resetCanvasFont, resetFontCache } from '@/server/render/canvas-fonts'

// Unit tests for the canvas font single-flight (`ensureCanvasFont`). The
// slot loader runs for real — only its leaf dependencies (settings, fs,
// the native font registry) are mocked.

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

// The slot loader re-reads the settings snapshot on every call.
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
  // Drop the in-process buffer cache so readFile counts are deterministic.
  resetFontCache()
  mocks.fontsHas.mockReturnValue(false)
  // Default fs state: a .ttf exists for every slot and reads fine.
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
    // Family not configured yet: null result, no registration.
    await expect(ensureCanvasFont('calendar')).resolves.toBeNull()
    expect(mocks.readFile).not.toHaveBeenCalled()
    expect(mocks.fontsRegister).not.toHaveBeenCalled()

    // Admin configures the family afterwards: the very next render loads it.
    seedFontFamilies({ calendar: 'OPPO Serif' })
    const slot = await ensureCanvasFont('calendar')
    expect(slot).toEqual({ buffer: TTF_BUFFER, family: 'OPPO Serif' })
    expect(mocks.fontsRegister).toHaveBeenCalledTimes(1)
  })

  it('assigns the slot even when GlobalFonts already has the family (drift regression)', async () => {
    // The slot must be assigned even when the registry already knows the family.
    seedFontFamilies({ calendar: 'OPPO Serif' })
    mocks.fontsHas.mockReturnValue(true)

    const slot = await ensureCanvasFont('calendar')
    expect(slot).toEqual({ buffer: TTF_BUFFER, family: 'OPPO Serif' })
    // No re-registration; the slot survives for the fast path.
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
    // Hold the read so the upload's invalidation lands mid-flight.
    let releaseRead!: (buffer: Buffer) => void
    mocks.readFile.mockImplementationOnce(
      () =>
        new Promise<Buffer>((resolve) => {
          releaseRead = resolve
        }),
    )

    const pending = ensureCanvasFont('og')
    // Let the flight reach readFile (the fs probes resolve as microtasks).
    await new Promise((resolve) => setImmediate(resolve))
    expect(mocks.readFile).toHaveBeenCalledTimes(1)
    // The upload path resets while the old read is still in flight.
    resetFontCache()
    resetCanvasFont('og')
    releaseRead(TTF_BUFFER)

    // The stale result must not commit: null result, no registration.
    await expect(pending).resolves.toBeNull()
    expect(mocks.fontsRegister).not.toHaveBeenCalled()

    // Next render loads the NEW bytes — the raced buffer must not be cached.
    const newBuffer = Buffer.from('new-ttf-bytes')
    mocks.readFile.mockResolvedValue(newBuffer)
    const slot = await ensureCanvasFont('og')
    expect(slot).toEqual({ buffer: newBuffer, family: 'OPPO Sans' })
    expect(mocks.fontsRegister).toHaveBeenCalledTimes(1)
    expect(mocks.fontsRegister).toHaveBeenCalledWith(newBuffer, 'OPPO Sans')
  })

  it('resetCanvasFont(slot) clears only that slot', async () => {
    seedFontFamilies({ og: 'OPPO Sans', calendar: 'OPPO Serif' })
    mocks.fontsHas.mockReturnValue(true)

    await ensureCanvasFont('og')
    await ensureCanvasFont('calendar')
    expect(mocks.readFile).toHaveBeenCalledTimes(2)

    resetCanvasFont('og')
    // Fast path is gone for og → it re-enters the load; calendar is untouched.
    mocks.fontsHas.mockReturnValue(false)
    await ensureCanvasFont('og')
    expect(mocks.fontsRegister).toHaveBeenCalledTimes(1)
    expect(mocks.readFile).toHaveBeenCalledTimes(2) // buffer cache survives
  })

  it('drops the cached slot when the settings family changes — edit takes effect without restart', async () => {
    seedFontFamilies({ og: 'OPPO Sans' })
    await ensureCanvasFont('og')
    expect(mocks.fontsRegister).toHaveBeenCalledWith(TTF_BUFFER, 'OPPO Sans')

    // Fast path is now armed: the registry has the old family.
    mocks.fontsHas.mockImplementation((family) => family === 'OPPO Sans')

    // Admin edits the family in settings: the very next render reloads.
    seedFontFamilies({ og: 'OPPO Serif' })
    const slot = await ensureCanvasFont('og')
    expect(slot).toEqual({ buffer: TTF_BUFFER, family: 'OPPO Serif' })
    expect(mocks.fontsRegister).toHaveBeenCalledTimes(2)
    expect(mocks.fontsRegister).toHaveBeenLastCalledWith(TTF_BUFFER, 'OPPO Serif')
    // Same file path → the buffer cache survives; only registration re-runs.
    expect(mocks.readFile).toHaveBeenCalledTimes(1)

    // The next call fast-paths on the NEW family.
    mocks.fontsHas.mockImplementation((family) => family === 'OPPO Serif')
    const again = await ensureCanvasFont('og')
    expect(again).toEqual(slot)
    expect(mocks.fontsRegister).toHaveBeenCalledTimes(2)
  })

  it('falls back to the system font when the settings family is cleared — no cached slot retained', async () => {
    seedFontFamilies({ og: 'OPPO Sans' })
    await ensureCanvasFont('og')
    expect(mocks.fontsRegister).toHaveBeenCalledTimes(1)

    // Family cleared: stale slot dropped, render resolves null.
    mocks.fontsHas.mockReturnValue(true)
    seedFontFamilies({ og: '' })
    await expect(ensureCanvasFont('og')).resolves.toBeNull()
    // Empty family short-circuits disk access; no slot is retained.
    expect(mocks.readFile).toHaveBeenCalledTimes(1)
    await expect(ensureCanvasFont('og')).resolves.toBeNull()
  })
})
