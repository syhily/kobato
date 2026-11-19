// The paste dialect's lazy-engine port (same import-port shape as
// `@kobato/inkling-internal/services/lazy-collaboration`): markdown-it + its plugin
// stack stay out of the editor island, loading through `loadPasteDialect` —
// pre-warmed on editor mount by MarkdownPastePlugin and awaited on the cold
// paste path before the markdown command dispatches.
//
// Two consumers cannot await — the paste command handler
// (`@kobato/inkling-internal/plugins/behaviour/markdown-paste`), which runs synchronously
// inside the editor update, and the markdown card's HTML export
// (`@kobato/inkling-internal/nodes/base/nodes/markdown/markdown-renderer`), whose exportDOM is
// a sync pipeline — so they read the loaded engine through
// `getLoadedPasteDialect`. The pre-warm covers the browser; the headless HTML
// surface seeds its bundled engine via `registerLoadedPasteDialect`.
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
