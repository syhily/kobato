/**
 * The Pintura session — the one headless module owning the editor's
 * third-party lifecycle (the last integration not behind a seam; emoji,
 * FastAverageColor, gif, and yjs all have one). Three pieces:
 *
 * - the asset loader (`createPinturaAssetLoader`): the dynamic import +
 *   CSS link choreography behind DOM ports, composed from the
 *   tracked-request skeleton (src/utils/services/service-machine.ts) over
 *   the request-track guard so a `jsUrl` change mid-load never lets the
 *   stale import flip the flag for the new URL (the CSS line is
 *   callback-driven, not a promise — it keeps the explicit guard);
 * - `buildPinturaOptions`: the options table (frame options, crop presets,
 *   the locale-merge precedence "labels first, host locale on top") as pure
 *   data + policy;
 * - the close gate (`createPinturaCloseGate`): the allow-close state and
 *   the Pintura-DOM knowledge (`.PinturaModal button[title="Close"]`)
 *   behind a listener port.
 *
 * `usePinturaEditor` is the thin adapter. Note `resolvePinturaImportUrl` /
 * `bustImageCache` take a base URL so RELATIVE srcs resolve instead of
 * throwing (the pre-seam code crashed on them).
 */

import { createRequestTrack } from '@/utils/services/request-track'
import { runTrackedRequest } from '@/utils/services/service-machine'
import { createSnapshotStore } from '@/utils/services/snapshot-store'

/**
 * Strips query/hash for the module import. A relative jsUrl resolves
 * against `baseUrl` (the adapter passes window.location.href) — previously
 * an uncaught throw.
 */
export function resolvePinturaImportUrl(jsUrl: string, baseUrl?: string): string {
  const url = baseUrl ? new URL(jsUrl, baseUrl) : new URL(jsUrl)
  return `${url.protocol}//${url.host}${url.pathname}`
}

/**
 * The cache-bust applied to the edited image's src (avoids CORS issues with
 * cached images): stamps `?v=<now>` unless the src already carries one.
 * Relative srcs resolve against `baseUrl` instead of throwing.
 */
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
  /** Supersede every in-flight load (unmount, or a jsUrl/cssUrl change recreating the loader). */
  dispose: () => void
}

/**
 * The asset-load choreography: already-present detection, the dynamic
 * import, the CSS link — behind ports, with the request-track guard so a
 * stale load never applies (a jsUrl change recreates the loader and
 * disposes the old generation). Absent jsUrl/cssUrl are no-ops.
 */
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
  /** The editor's `willClose` callback — true only after the close button's click, so Escape never closes. */
  willClose: () => boolean
  /** A freshly opened editor starts disallowed. */
  reset: () => void
  /** Attach the DOM listener through the injected port (an effect's job, so it can return the teardown). */
  attach: (listen: (handler: (event: MouseEvent) => void) => () => void) => () => void
}

/**
 * The close lifecycle: Pintura offers no close-policy option, so the gate
 * watches for the modal's close-button click behind a listener port and
 * only then lets `willClose` pass. The adapter attaches in an effect and
 * tears the listener down on unmount.
 */
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

/**
 * The options table for `openDefaultEditor`: frame options, crop presets,
 * and the locale merge — the labels table's `pintura.*` entries first, the
 * host's `pinturaConfig.locale` ON TOP, so a
 * host can patch any Pintura string the labels table does not cover.
 *
 * The `Record<string, unknown>` return is deliberate: Pintura is a
 * host-loaded commercial package with no dependency (or types) in this repo,
 * so the options contract can't be imported — a hand-written interface would
 * just be an unmaintained copy of their schema.
 */
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
      // No frame
      [undefined, (locale: { labelNone: string }) => locale.labelNone],

      // Sharp edge frame
      ['solidSharp', (locale: { frameLabelMatSharp: string }) => locale.frameLabelMatSharp],

      // Rounded edge frame
      ['solidRound', (locale: { frameLabelMatRound: string }) => locale.frameLabelMatRound],

      // A single line frame
      ['lineSingle', (locale: { frameLabelLineSingle: string }) => locale.frameLabelLineSingle],

      // A frame with cornenr hooks
      ['hook', (locale: { frameLabelCornerHooks: string }) => locale.frameLabelCornerHooks],

      // A polaroid frame
      ['polaroid', (locale: { frameLabelPolaroid: string }) => locale.frameLabelPolaroid],
    ],
    cropSelectPresetFilter: 'landscape',
    cropSelectPresetOptions: [
      [undefined, labels.cropPresetCustom],
      [1, labels.cropPresetSquare],
      // shown when cropSelectPresetFilter is set to 'landscape'
      [2 / 1, '2:1'],
      [3 / 2, '3:2'],
      [4 / 3, '4:3'],
      [16 / 10, '16:10'],
      [16 / 9, '16:9'],
      // shown when cropSelectPresetFilter is set to 'portrait'
      [1 / 2, '1:2'],
      [2 / 3, '2:3'],
      [3 / 4, '3:4'],
      [10 / 16, '10:16'],
      [9 / 16, '9:16'],
    ],
    locale: {
      labelButtonExport: labels.exportButton,
      // the host's pinturaConfig.locale patches any Pintura string on top of
      // the labels table (higher priority)
      ...hostLocale,
    },
    previewPad: true,
    willClose,
  }
}
