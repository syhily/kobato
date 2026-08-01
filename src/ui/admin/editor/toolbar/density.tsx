import { MaximizeIcon, MinimizeIcon } from 'lucide-react'
import { useCallback, useSyncExternalStore } from 'react'

import { ToolbarButton } from '@/ui/admin/editor/toolbar/ToolbarButton'

export type ToolbarDensity = 'compact' | 'full'

const TOOLBAR_DENSITY_STORAGE_KEY = 'kobato/admin/page-editor/toolbar-density'

// Snapshot cache: `useSyncExternalStore` requires `getSnapshot` to return a
// referentially stable value between store changes, so the parsed density
// is cached against the raw storage string (same idiom as
// `use-comment-guest.ts`).
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

// Persistent toolbar density preference. SSR-consistent via
// `useSyncExternalStore` (audit P1-4): the server snapshot is always
// `'full'`, so SSR and the hydration render agree even for users WITH a
// stored preference, and React swaps to the stored value right after
// hydration — no mismatch. SPA navigations mount client-side and read the
// client snapshot on the first render, so the preference applies instantly
// there. The outer `flex-wrap` container grows to more rows when space is
// tight.
export function useToolbarDensityPreference(): [ToolbarDensity, (next: ToolbarDensity) => void] {
  const density = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const setDensity = useCallback((next: ToolbarDensity) => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(TOOLBAR_DENSITY_STORAGE_KEY, next)
      } catch {
        // localStorage may throw in private mode / quota-exceeded; the
        // preference is best-effort, so silently move on.
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

// Two-state toggle: full ↔ compact. The icon mirrors the action that
// firing the button will perform — when expanded ('full') we show the
// "collapse inward" chevron; when collapsed ('compact') we show the
// "expand outward" chevron.
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
