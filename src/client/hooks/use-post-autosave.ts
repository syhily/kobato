import type { UseAutosaveOptions, AutosaveStatus } from '@/client/hooks/use-autosave'

import { useAutosave } from '@/client/hooks/use-autosave'

export type UsePostAutosaveOptions = UseAutosaveOptions
export type { AutosaveStatus }

export function usePostAutosave(options: UsePostAutosaveOptions): {
  forceFlush: () => Promise<void>
} {
  return useAutosave(options)
}
