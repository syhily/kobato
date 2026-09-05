import { describe, expect, it, vi } from 'vitest'

import {
  buildPinturaOptions,
  bustImageCache,
  createPinturaAssetLoader,
  createPinturaCloseGate,
  resolvePinturaImportUrl,
  type PinturaAssetPorts,
} from '@/utils/services/pintura-session'

const BASE = 'https://cms.example.com/admin/posts/'

describe('resolvePinturaImportUrl', () => {
  it('strips query and hash from an absolute URL', () => {
    expect(resolvePinturaImportUrl('https://cdn.example.com/pintura.js?v=1#frag')).toBe(
      'https://cdn.example.com/pintura.js',
    )
  })

  it('resolves a relative URL against the base instead of throwing', () => {
    expect(resolvePinturaImportUrl('/static/pintura.js', BASE)).toBe('https://cms.example.com/static/pintura.js')
  })
})

describe('bustImageCache', () => {
  it('stamps ?v= when missing and keeps an existing one', () => {
    expect(bustImageCache('https://cdn.example.com/a.png', BASE, 123)).toBe('https://cdn.example.com/a.png?v=123')
    expect(bustImageCache('https://cdn.example.com/a.png?v=9', BASE, 123)).toBe('https://cdn.example.com/a.png?v=9')
  })

  it('resolves a relative src against the base instead of throwing', () => {
    expect(bustImageCache('/media/a.png', BASE, 123)).toBe('https://cms.example.com/media/a.png?v=123')
  })
})

function ports(overrides: Partial<PinturaAssetPorts> = {}): PinturaAssetPorts {
  return {
    importModule: () => Promise.resolve({}),
    isScriptPresent: () => false,
    queryCssLink: () => false,
    appendCssLink: () => {},
    baseUrl: BASE,
    ...overrides,
  }
}

describe('createPinturaAssetLoader', () => {
  it('starts loaded when the script and css are already present', () => {
    const loader = createPinturaAssetLoader(
      { jsUrl: 'https://cdn.example.com/p.js', cssUrl: 'https://cdn.example.com/p.css' },
      ports({ isScriptPresent: () => true, queryCssLink: () => true }),
    )

    expect(loader.getSnapshot()).toEqual({ scriptLoaded: true, cssLoaded: true, error: null })
  })

  it('flips scriptLoaded when the import resolves', async () => {
    const loader = createPinturaAssetLoader({ jsUrl: 'https://cdn.example.com/p.js' }, ports())
    expect(loader.getSnapshot().scriptLoaded).toBe(false)

    await Promise.resolve()
    await Promise.resolve()

    expect(loader.getSnapshot().scriptLoaded).toBe(true)
  })

  it('imports the stripped URL', async () => {
    const importModule = vi.fn(() => Promise.resolve({}))
    createPinturaAssetLoader({ jsUrl: 'https://cdn.example.com/p.js?v=3' }, ports({ importModule }))

    expect(importModule).toHaveBeenCalledWith('https://cdn.example.com/p.js')
  })

  it('surfaces an import rejection as an error', async () => {
    const loader = createPinturaAssetLoader(
      { jsUrl: 'https://cdn.example.com/p.js' },
      ports({ importModule: () => Promise.reject(new Error('404')) }),
    )

    await Promise.resolve()
    await Promise.resolve()

    expect(loader.getSnapshot().error?.message).toBe('Failed to load Pintura script from https://cdn.example.com/p.js')
  })

  it('a disposed loader never applies a late resolution', async () => {
    let resolveImport!: () => void
    const loader = createPinturaAssetLoader(
      { jsUrl: 'https://cdn.example.com/p.js' },
      ports({
        importModule: () =>
          new Promise((res) => {
            resolveImport = () => res({})
          }),
      }),
    )

    loader.dispose()
    resolveImport()
    await Promise.resolve()
    await Promise.resolve()

    expect(loader.getSnapshot().scriptLoaded).toBe(false)
  })

  it('appends the css link and flips on load; surfaces onerror', () => {
    let handlers!: { onLoad: () => void; onError: () => void }
    const loader = createPinturaAssetLoader(
      { cssUrl: 'https://cdn.example.com/p.css' },
      ports({
        appendCssLink: (_href, h) => {
          handlers = h
        },
      }),
    )

    handlers.onLoad()
    expect(loader.getSnapshot().cssLoaded).toBe(true)

    const failing = createPinturaAssetLoader(
      { cssUrl: 'https://cdn.example.com/missing.css' },
      ports({
        appendCssLink: (_href, h) => {
          h.onError()
        },
      }),
    )
    expect(failing.getSnapshot().error?.message).toContain('Failed to load Pintura stylesheet')
  })

  it('is a no-op without jsUrl/cssUrl', () => {
    const importModule = vi.fn()
    const loader = createPinturaAssetLoader({}, ports({ importModule }))

    expect(importModule).not.toHaveBeenCalled()
    expect(loader.getSnapshot()).toEqual({ scriptLoaded: false, cssLoaded: false, error: null })
  })
})

describe('createPinturaCloseGate', () => {
  function setup() {
    let handler!: (event: MouseEvent) => void
    const gate = createPinturaCloseGate()
    gate.attach((h) => {
      handler = h
      return () => {}
    })
    return { gate, click: (target: EventTarget) => handler({ target } as MouseEvent) }
  }

  it('disallows closing until the close button is clicked', () => {
    const { gate, click } = setup()
    expect(gate.willClose()).toBe(false)

    const closeButton = document.createElement('button')
    closeButton.title = 'Close'
    const modal = document.createElement('div')
    modal.className = 'PinturaModal'
    modal.appendChild(closeButton)

    click(closeButton)
    expect(gate.willClose()).toBe(true)

    gate.reset()
    expect(gate.willClose()).toBe(false)
  })

  it('ignores clicks elsewhere', () => {
    const { gate, click } = setup()
    click(document.createElement('div'))
    expect(gate.willClose()).toBe(false)
  })
})

describe('buildPinturaOptions', () => {
  it('uses the labels table entries and spreads the host locale on top', () => {
    const willClose = () => false
    const options = buildPinturaOptions({
      imageSrc: 'https://cdn.example.com/a.png?v=1',
      labels: { exportButton: 'Save', cropPresetCustom: 'Custom', cropPresetSquare: 'Square' },
      hostLocale: { labelButtonExport: 'Host save', customHostKey: 'host' },
      willClose,
    })

    expect(options.src).toBe('https://cdn.example.com/a.png?v=1')
    expect(options.willClose).toBe(willClose)
    const locale = options.locale as Record<string, string>
    expect(locale.labelButtonExport).toBe('Host save')
    expect(locale.customHostKey).toBe('host')
  })

  it('falls back to the labels entry when the host does not patch it', () => {
    const options = buildPinturaOptions({
      imageSrc: 'x',
      labels: { exportButton: 'Save', cropPresetCustom: 'Custom', cropPresetSquare: 'Square' },
      willClose: () => true,
    })

    expect((options.locale as Record<string, string>).labelButtonExport).toBe('Save')
    const presets = options.cropSelectPresetOptions as Array<[unknown, unknown]>
    expect(presets[0]).toEqual([undefined, 'Custom'])
    expect(presets[1]).toEqual([1, 'Square'])
  })
})
