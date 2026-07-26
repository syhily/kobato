import { MaximizeIcon, MinimizeIcon } from 'lucide-react'
import { useCallback, useState } from 'react'

import { ToolbarButton } from '@/ui/admin/editor/toolbar/ToolbarButton'

export type ToolbarDensity = 'compact' | 'full'

const TOOLBAR_DENSITY_STORAGE_KEY = 'kobato/admin/page-editor/toolbar-density'

// Persistent toolbar density preference. Defaults to `'full'` so SSR +
// hydration agree on the initial render; the outer `flex-wrap` container
// grows to more rows when space is tight.
export function useToolbarDensityPreference(): [ToolbarDensity, (next: ToolbarDensity) => void] {
  // Lazy initializer so SSR + first client render agree on the default
  // (the linter-friendly alternative to setState-in-effect).
  const [density, setDensityState] = useState<ToolbarDensity>(readDensity)
  const setDensity = useCallback((next: ToolbarDensity) => {
    setDensityState(next)
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem(TOOLBAR_DENSITY_STORAGE_KEY, next)
    } catch {
      // localStorage may throw in private mode / quota-exceeded; the
      // preference is best-effort, so silently move on.
    }
  }, [])
  return [density, setDensity]
}

function readDensity(): ToolbarDensity {
  if (typeof window === 'undefined') {
    return 'full'
  }
  try {
    const raw = window.localStorage.getItem(TOOLBAR_DENSITY_STORAGE_KEY)
    if (raw === 'compact' || raw === 'full') {
      return raw
    }
  } catch {
    // ignore — return the safe default.
  }
  return 'full'
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
