import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { useDisposableStore } from '@/hooks/useDisposableStore'
import { useInklingLabels } from '@/hooks/useInklingLabels'
import trackEvent from '@/utils/analytics'
import {
  buildPinturaOptions,
  bustImageCache,
  createPinturaAssetLoader,
  createPinturaCloseGate,
  type PinturaAssetPorts,
} from '@/utils/services/pintura-session'

export interface PinturaConfig {
  jsUrl?: string
  cssUrl?: string
  /** Pintura `locale` overrides — merged ON TOP of the labels table's
   * `pintura.*` entries, so a host can patch any Pintura string the labels
   * table does not cover. */
  locale?: Record<string, string>
}

interface UsePinturaEditorOptions {
  config?: PinturaConfig
  disabled?: boolean
}

interface PinturaHandleSaveResult {
  dest: Blob
}

interface UsePinturaEditorResult {
  isEnabled: boolean
  openEditor: ({ image, handleSave }: { image: string; handleSave: (blob: Blob) => void }) => void
  error: Error | null
}

declare global {
  interface Window {
    pintura?: {
      openDefaultEditor: (options: Record<string, unknown>) => PinturaEditor
    }
  }
}

interface PinturaEditor {
  on(event: 'loaderror', handler: (error: unknown) => void): void
  on(event: 'process', handler: (result: PinturaHandleSaveResult) => void): void
}

// the adapter's DOM ports: the loader, the options table, and the close
// gate live headless in @/utils/services/pintura-session
function createDomPorts(): PinturaAssetPorts {
  return {
    importModule: (url) => import(/* @vite-ignore */ url),
    isScriptPresent: () => typeof window !== 'undefined' && !!window.pintura,
    queryCssLink: (href) => typeof document !== 'undefined' && !!document.querySelector(`link[href="${href}"]`),
    appendCssLink: (href, { onLoad, onError }) => {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.type = 'text/css'
      link.href = href
      link.onload = onLoad
      link.onerror = onError
      document.head.appendChild(link)
    },
    baseUrl: typeof window !== 'undefined' ? window.location.href : undefined,
  }
}

export default function usePinturaEditor({
  config,
  disabled = false,
}: UsePinturaEditorOptions = {}): UsePinturaEditorResult {
  const labels = useInklingLabels()

  // the loader is recreated on jsUrl/cssUrl change; the old generation is
  // disposed so a stale in-flight load never flips the new loader's flags
  const loader = useDisposableStore(
    () => createPinturaAssetLoader({ jsUrl: config?.jsUrl, cssUrl: config?.cssUrl }, createDomPorts()),
    [config?.jsUrl, config?.cssUrl],
  )
  const { scriptLoaded, cssLoaded, error: assetError } = useSyncExternalStore(loader.subscribe, loader.getSnapshot)
  // the editor's own loaderror channel (asset errors ride the loader's snapshot)
  const [editorError, setEditorError] = useState<Error | null>(null)

  const closeGate = useMemo(() => createPinturaCloseGate(), [])
  useEffect(
    () =>
      closeGate.attach((handler) => {
        window.addEventListener('click', handler, { capture: true })
        return () => window.removeEventListener('click', handler, { capture: true })
      }),
    [closeGate],
  )

  const isEnabled = !disabled && scriptLoaded && cssLoaded

  const openEditor = useCallback(
    ({ image, handleSave }: { image: string; handleSave: (blob: Blob) => void }) => {
      closeGate.reset()

      trackEvent('Image Edit Button Clicked', { location: 'editor' })
      if (image && isEnabled && window.pintura) {
        const editor = window.pintura.openDefaultEditor(
          buildPinturaOptions({
            imageSrc: bustImageCache(image, window.location.href),
            labels: {
              exportButton: labels['pintura.export'],
              cropPresetCustom: labels['pintura.cropPreset.custom'],
              cropPresetSquare: labels['pintura.cropPreset.square'],
            },
            hostLocale: config?.locale,
            willClose: closeGate.willClose,
          }),
        )

        // no unsubscribe: Pintura's public API only exposes `on` (no
        // `off`/unsub in the @pqina/pintura type declarations), and each
        // openDefaultEditor call creates a fresh modal instance that auto
        // destructs on close — the listeners die with the instance
        editor.on('loaderror', (err) => {
          setEditorError(err instanceof Error ? err : new Error('Pintura editor load error'))
        })

        editor.on('process', (result) => {
          // save edited image
          handleSave(result.dest)
          trackEvent('Image Edit Saved', { location: 'editor' })
        })
      }
    },
    [isEnabled, labels, config?.locale, closeGate],
  )

  return {
    isEnabled,
    openEditor,
    error: assetError ?? editorError,
  }
}
