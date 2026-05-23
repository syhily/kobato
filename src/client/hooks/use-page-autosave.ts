import type { UseAutosaveOptions, AutosaveStatus } from '@/client/hooks/use-autosave'

import { useAutosave } from '@/client/hooks/use-autosave'

export type UsePageAutosaveOptions = UseAutosaveOptions
export type { AutosaveStatus }

export function usePageAutosave(options: UsePageAutosaveOptions): {
  forceFlush: () => Promise<void>
} {
  return useAutosave(options)
}
