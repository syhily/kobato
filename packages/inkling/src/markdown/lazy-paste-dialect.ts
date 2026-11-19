import type { pasteDialect } from '@kobato/inkling-internal/markdown/paste-dialect'

export interface PasteDialectChunk {
  pasteDialect: typeof pasteDialect
}

export type LoadPasteDialect = () => Promise<PasteDialectChunk>

let loadedChunk: PasteDialectChunk | null = null
let pendingChunk: Promise<PasteDialectChunk> | null = null

export function loadPasteDialect(
  load: LoadPasteDialect = () => import('@kobato/inkling-internal/markdown/paste-dialect'),
): Promise<PasteDialectChunk> {
  if (loadedChunk) {
    return Promise.resolve(loadedChunk)
  }
  pendingChunk ??= load().then((chunk) => {
    loadedChunk = chunk
    return chunk
  })
  return pendingChunk
}

export function getLoadedPasteDialect(): PasteDialectChunk['pasteDialect'] | null {
  return loadedChunk?.pasteDialect ?? null
}

export function registerLoadedPasteDialect(chunk: PasteDialectChunk): void {
  loadedChunk = chunk
}
