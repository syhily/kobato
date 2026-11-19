import { useDisposableStore } from '@kobato/inkling-internal/hooks/useDisposableStore'
import { useInklingLabels } from '@kobato/inkling-internal/hooks/useInklingLabels'
import { importPinturaModule } from '@kobato/inkling-internal/services/pintura-import'
import {
  buildPinturaOptions,
  bustImageCache,
  createPinturaAssetLoader,
  createPinturaCloseGate,
  type PinturaAssetPorts,
} from '@kobato/inkling-internal/services/pintura-session'
import trackEvent from '@kobato/inkling-internal/utils/analytics'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

export interface PinturaConfig {
  jsUrl?: string
  cssUrl?: string
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

function createDomPorts(): PinturaAssetPorts {
  return {
    importModule: importPinturaModule,
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

  const loader = useDisposableStore(
    () => createPinturaAssetLoader({ jsUrl: config?.jsUrl, cssUrl: config?.cssUrl }, createDomPorts()),
    [config?.jsUrl, config?.cssUrl],
  )
  const { scriptLoaded, cssLoaded, error: assetError } = useSyncExternalStore(loader.subscribe, loader.getSnapshot)

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

        editor.on('loaderror', (err) => {
          setEditorError(err instanceof Error ? err : new Error('Pintura editor load error'))
        })

        editor.on('process', (result) => {
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
