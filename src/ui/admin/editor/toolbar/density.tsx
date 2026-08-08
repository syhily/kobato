import { MaximizeIcon, MinimizeIcon } from 'lucide-react'
import { useCallback, useSyncExternalStore } from 'react'

import { ToolbarButton } from '@/ui/admin/editor/toolbar/ToolbarButton'

export type ToolbarDensity = 'compact' | 'full'

const TOOLBAR_DENSITY_STORAGE_KEY = 'kobato/admin/page-editor/toolbar-density'

// Cache the parsed snapshot: `useSyncExternalStore` demands referential
// stability between store changes.
let cachedRaw: string | null | undefined
let cachedDensity: ToolbarDensity = 'full'

function getSnapshot(): ToolbarDensity {
  let raw: string | null = null
  if (typeof window !== 'undefined') {
    try {
      raw = window.localStorage.getItem(TOOLBAR_DENSITY_STORAGE_KEY)
    } catch {
      // localStorage may throw in private mode — treat as nothing stored.
      raw = null
    }
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedDensity = raw === 'compact' || raw === 'full' ? raw : 'full'
  }
  return cachedDensity
}

function getServerSnapshot(): ToolbarDensity {
  return 'full'
}

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emitChange(): void {
  for (const listener of listeners) {
    listener()
  }
}

// Persistent toolbar density, SSR-consistent via `useSyncExternalStore`
// (audit P1-4): the server snapshot is always `'full'`, so SSR and hydration
// agree; SPA navigations read the client snapshot on first render.
export function useToolbarDensityPreference(): [ToolbarDensity, (next: ToolbarDensity) => void] {
  const density = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const setDensity = useCallback((next: ToolbarDensity) => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(TOOLBAR_DENSITY_STORAGE_KEY, next)
      } catch {
        // localStorage may throw (private mode / quota); the preference is best-effort.
      }
    }
    emitChange()
  }, [])
  return [density, setDensity]
}

interface DensityToggleButtonProps {
  density: ToolbarDensity
  onChange: (next: ToolbarDensity) => void
  disabled?: boolean
}

// Two-state toggle: the icon mirrors the action firing the button performs.
export function DensityToggleButton({ density, onChange, disabled }: DensityToggleButtonProps) {
  const next: ToolbarDensity = density === 'full' ? 'compact' : 'full'
  const title = density === 'full' ? '收起工具栏' : '展开工具栏'
  const Icon = density === 'full' ? MinimizeIcon : MaximizeIcon
  return (
    <ToolbarButton title={title} disabled={disabled} onClick={() => onChange(next)}>
      <Icon />
    </ToolbarButton>
  )
}
