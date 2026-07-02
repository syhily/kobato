// Triggers the file selection dialog from a given referenced element

import type { RefObject } from 'react'

export interface OpenFileSelectionOptions {
  fileInputRef: RefObject<HTMLInputElement | null>
}

export function openFileSelection({ fileInputRef }: OpenFileSelectionOptions): void {
  fileInputRef.current?.click()
}
