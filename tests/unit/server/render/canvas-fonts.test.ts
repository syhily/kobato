import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ensureCanvasFont, resetCanvasFont, resetFontCache } from '@/server/render/canvas-fonts'

// Unit tests for the canvas font single-flight (`ensureCanvasFont`). The
// invariant under test: one in-flight load per slot, the loaded slot is
// assigned unconditionally (even when the family is already registered),
// and the null / error paths are never memoized. The slot loader runs for
// real — only its leaf dependencies (settings, fs, the native font
// registry) are mocked.

const mocks = vi.hoisted(() => ({
  access: vi.fn<(path: string) => Promise<void>>(),
  readFile: vi.fn<(path: string) => Promise<Buffer>>(),
  fontsHas: vi.fn<(family: string) => boolean>(() => false),
  fontsRegister: vi.fn<(buffer: Buffer, family: string) => void>(),
  families: { og: '', calendar: '' } as Record<'og' | 'calendar', string>,
  throwOnSection: false,
}))

vi.mock('node:fs/promises', () => ({
  access: mocks.access,
  readFile: mocks.readFile,
}))

// The native font registry is a static import in the module under test,
// so the mock targets the package directly.
vi.mock('@napi-rs/canvas', () => ({
  GlobalFonts: {
    has: mocks.fontsHas,
    register: mocks.fontsRegister,
  },
}))

vi.mock('@/shared/config/getters', () => ({
  requireBlogSettingsSection: vi.fn((section: string) => {
    if (mocks.throwOnSection) {
      throw new Error('settings not hydrated')
    }
    if (section === 'fonts') {
      return {
        og: { family: mocks.families.og },
        calendar: { family: mocks.families.calendar },
      }
    }
    throw new Error(`unexpected settings section: ${section}`)
  }),
}))

const TTF_BUFFER = Buffer.from('fake-ttf-bytes')

beforeEach(() => {
  vi.clearAllMocks()
  resetCanvasFont()
  // Drop the in-process buffer cache too so `readFile` call counts are
  // deterministic per test (it otherwise survives across cases).
  resetFontCache()
  mocks.families.og = ''
  mocks.families.calendar = ''
  mocks.throwOnSection = false
  mocks.fontsHas.mockReturnValue(false)
  // Default fs state: a .ttf exists for every slot and reads fine.
  mocks.access.mockResolvedValue(undefined)
  mocks.readFile.mockResolvedValue(TTF_BUFFER)
})

describe('render/canvas-fonts — ensureCanvasFont', () => {
  it('coalesces concurrent calls into a single TTF read and one registration', async () => {
    mocks.families.og = 'OPPO Sans'

    const [a, b, c] = await Promise.all([ensureCanvasFont('og'), ensureCanvasFont('og'), ensureCanvasFont('og')])

    expect(a).toEqual({ buffer: TTF_BUFFER, family: 'OPPO Sans' })
    expect(b).toEqual(a)
    expect(c).toEqual(a)
    expect(mocks.readFile).toHaveBeenCalledTimes(1)
    expect(mocks.fontsRegister).toHaveBeenCalledTimes(1)
    expect(mocks.fontsRegister).toHaveBeenCalledWith(TTF_BUFFER, 'OPPO Sans')
  })

  it('clears the flight when the load throws so the next call retries', async () => {
    mocks.families.og = 'OPPO Sans'
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
    mocks.families.calendar = 'OPPO Serif'
    const slot = await ensureCanvasFont('calendar')
    expect(slot).toEqual({ buffer: TTF_BUFFER, family: 'OPPO Serif' })
    expect(mocks.fontsRegister).toHaveBeenCalledTimes(1)
  })

  it('assigns the slot even when GlobalFonts already has the family (drift regression)', async () => {
    // HMR re-registration, or the og and calendar slots sharing a family:
    // the registry already knows the family before our load finishes. The
    // slot must still be assigned — otherwise every render falls back to
    // the system font despite the custom font being registered.
    mocks.families.calendar = 'OPPO Serif'
    mocks.fontsHas.mockReturnValue(true)

    const slot = await ensureCanvasFont('calendar')
    expect(slot).toEqual({ buffer: TTF_BUFFER, family: 'OPPO Serif' })
    // Already registered → no duplicate registration…
    expect(mocks.fontsRegister).not.toHaveBeenCalled()
    // …but the slot survives, so the next call takes the fast path.
    const again = await ensureCanvasFont('calendar')
    expect(again).toEqual(slot)
    expect(mocks.readFile).toHaveBeenCalledTimes(1)
  })

  it('keeps slots independent — og state does not leak into calendar', async () => {
    mocks.families.og = 'OPPO Sans'

    await expect(ensureCanvasFont('calendar')).resolves.toBeNull()
    const ogSlot = await ensureCanvasFont('og')
    expect(ogSlot).toEqual({ buffer: TTF_BUFFER, family: 'OPPO Sans' })
    await expect(ensureCanvasFont('calendar')).resolves.toBeNull()
  })

  it('resetCanvasFont(slot) clears only that slot', async () => {
    mocks.families.og = 'OPPO Sans'
    mocks.families.calendar = 'OPPO Serif'
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
    mocks.families.og = 'OPPO Sans'
    await ensureCanvasFont('og')
    expect(mocks.fontsRegister).toHaveBeenCalledWith(TTF_BUFFER, 'OPPO Sans')

    // Fast path is now armed: the registry has the old family.
    mocks.fontsHas.mockImplementation((family) => family === 'OPPO Sans')

    // Admin edits the family in settings: the very next render reloads.
    mocks.families.og = 'OPPO Serif'
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
    mocks.families.og = 'OPPO Sans'
    await ensureCanvasFont('og')
    expect(mocks.fontsRegister).toHaveBeenCalledTimes(1)

    // Admin clears the family: the stale slot must be dropped and the
    // render resolves null (Canvas falls back to its system font).
    mocks.fontsHas.mockReturnValue(true)
    mocks.families.og = ''
    await expect(ensureCanvasFont('og')).resolves.toBeNull()
    // The empty family short-circuits before any disk access…
    expect(mocks.readFile).toHaveBeenCalledTimes(1)
    // …and the slot is NOT retained: a second call also resolves null.
    await expect(ensureCanvasFont('og')).resolves.toBeNull()
  })
})
