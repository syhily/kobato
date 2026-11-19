import { createRequestTrack } from '@kobato/inkling-internal/services/request-track'
import { runTrackedRequest } from '@kobato/inkling-internal/services/service-machine'
import { createSnapshotStore } from '@kobato/inkling-internal/services/snapshot-store'

export function resolvePinturaImportUrl(jsUrl: string, baseUrl?: string): string {
  const url = baseUrl ? new URL(jsUrl, baseUrl) : new URL(jsUrl)
  return `${url.protocol}//${url.host}${url.pathname}`
}

export function bustImageCache(image: string, baseUrl?: string, now: number = Date.now()): string {
  const url = baseUrl ? new URL(image, baseUrl) : new URL(image)
  if (!url.searchParams.has('v')) {
    url.searchParams.set('v', String(now))
  }
  return url.href
}

export interface PinturaAssetSnapshot {
  scriptLoaded: boolean
  cssLoaded: boolean
  error: Error | null
}

export interface PinturaAssetPorts {
  importModule: (url: string) => Promise<unknown>
  isScriptPresent: () => boolean
  queryCssLink: (href: string) => boolean
  appendCssLink: (href: string, handlers: { onLoad: () => void; onError: () => void }) => void
  baseUrl?: string
}

export interface PinturaAssetLoader {
  getSnapshot: () => PinturaAssetSnapshot
  subscribe: (listener: () => void) => () => void

  dispose: () => void
}

export function createPinturaAssetLoader(
  { jsUrl, cssUrl }: { jsUrl?: string; cssUrl?: string },
  ports: PinturaAssetPorts,
): PinturaAssetLoader {
  const store = createSnapshotStore<PinturaAssetSnapshot>({
    scriptLoaded: ports.isScriptPresent(),
    cssLoaded: !!cssUrl && ports.queryCssLink(cssUrl),
    error: null,
  })
  const track = createRequestTrack()
  const generation = track.next()
  if (jsUrl && !ports.isScriptPresent()) {
    let importUrl = ''
    try {
      importUrl = resolvePinturaImportUrl(jsUrl, ports.baseUrl)
    } catch (e) {
      store.emit({ error: e instanceof Error ? e : new Error('Failed to load Pintura script') })
    }
    if (importUrl) {
      void runTrackedRequest(track, generation, () => ports.importModule(importUrl)).then((outcome) => {
        if (!outcome) {
          return
        }
        if (outcome.ok) {
          store.emit({ scriptLoaded: true })
        } else {
          store.emit({ error: new Error(`Failed to load Pintura script from ${jsUrl}`) })
        }
      })
    }
  }

  if (cssUrl && !ports.queryCssLink(cssUrl)) {
    ports.appendCssLink(cssUrl, {
      onLoad: () => {
        if (track.isLatest(generation)) {
          store.emit({ cssLoaded: true })
        }
      },
      onError: () => {
        if (track.isLatest(generation)) {
          store.emit({ error: new Error(`Failed to load Pintura stylesheet from ${cssUrl}`) })
        }
      },
    })
  }

  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    dispose: () => {
      track.dispose()
      store.dispose()
    },
  }
}

export interface PinturaCloseGate {
  willClose: () => boolean

  reset: () => void

  attach: (listen: (handler: (event: MouseEvent) => void) => () => void) => () => void
}

export function createPinturaCloseGate(): PinturaCloseGate {
  let allowClose = false

  const handler = (event: MouseEvent) => {
    const target = event.target
    if (target instanceof Element && target.closest('.PinturaModal button[title="Close"]')) {
      allowClose = true
    }
  }

  return {
    willClose: () => allowClose,
    reset: () => {
      allowClose = false
    },
    attach: (listen) => listen(handler),
  }
}

export interface PinturaOptionsLabels {
  exportButton: string
  cropPresetCustom: string
  cropPresetSquare: string
}

export function buildPinturaOptions({
  imageSrc,
  labels,
  hostLocale,
  willClose,
}: {
  imageSrc: string
  labels: PinturaOptionsLabels
  hostLocale?: Record<string, string>
  willClose: () => boolean
}): Record<string, unknown> {
  return {
    src: imageSrc,
    enableTransparencyGrid: true,
    util: 'crop',
    utils: ['crop', 'filter', 'finetune', 'redact', 'annotate', 'trim', 'frame', 'resize'],
    frameOptions: [
      [undefined, (locale: { labelNone: string }) => locale.labelNone],
      ['solidSharp', (locale: { frameLabelMatSharp: string }) => locale.frameLabelMatSharp],
      ['solidRound', (locale: { frameLabelMatRound: string }) => locale.frameLabelMatRound],
      ['lineSingle', (locale: { frameLabelLineSingle: string }) => locale.frameLabelLineSingle],

      ['hook', (locale: { frameLabelCornerHooks: string }) => locale.frameLabelCornerHooks],

      ['polaroid', (locale: { frameLabelPolaroid: string }) => locale.frameLabelPolaroid],
    ],
    cropSelectPresetFilter: 'landscape',
    cropSelectPresetOptions: [
      [undefined, labels.cropPresetCustom],
      [1, labels.cropPresetSquare],

      [2 / 1, '2:1'],
      [3 / 2, '3:2'],
      [4 / 3, '4:3'],
      [16 / 10, '16:10'],
      [16 / 9, '16:9'],

      [1 / 2, '1:2'],
      [2 / 3, '2:3'],
      [3 / 4, '3:4'],
      [10 / 16, '10:16'],
      [9 / 16, '9:16'],
    ],
    locale: {
      labelButtonExport: labels.exportButton,
      ...hostLocale,
    },
    previewPad: true,
    willClose,
  }
}
