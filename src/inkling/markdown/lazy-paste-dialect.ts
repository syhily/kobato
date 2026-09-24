// The paste dialect's lazy-engine port (same import-port shape as
// `@/inkling/utils/services/lazy-collaboration`): markdown-it + its plugin
// stack stay out of the editor island, loading through `loadPasteDialect` —
// kicked on editor mount by MarkdownPastePlugin (pre-warm) and awaited on the
// cold paste path before the markdown command dispatches.
//
// Two consumers cannot await, so they read the loaded engine synchronously
// through `getLoadedPasteDialect`:
// - the paste command handler (`@/inkling/plugins/behaviour/markdownPaste`) —
//   a Lexical command handler runs synchronously inside the editor update
// - the markdown card's HTML export
//   (`@/inkling/nodes/base/nodes/markdown/markdown-renderer`) — exportDOM is a
//   sync pipeline
// Both are covered by the pre-warm (browser) and the static seed (the
// headless HTML surface registers its bundled engine through
// `registerLoadedPasteDialect` — server bundle size is irrelevant there, and
// its exportDOM path cannot await a chunk).
import type { pasteDialect } from '@/inkling/markdown/paste-dialect'

/** The lazy chunk's public shape — the dialect handle is all consumers use. */
export interface PasteDialectChunk {
  pasteDialect: typeof pasteDialect
}

/** The dynamic import — tests inject a scripted one. */
export type LoadPasteDialect = () => Promise<PasteDialectChunk>

let loadedChunk: PasteDialectChunk | null = null
let pendingChunk: Promise<PasteDialectChunk> | null = null

export function loadPasteDialect(
  load: LoadPasteDialect = () => import('@/inkling/markdown/paste-dialect'),
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

/** The loaded engine, or null while the chunk is still in flight. */
export function getLoadedPasteDialect(): PasteDialectChunk['pasteDialect'] | null {
  return loadedChunk?.pasteDialect ?? null
}

/** Synchronous seed for a host that already holds the engine statically
 * (the `@/inkling/headless` HTML surface). */
export function registerLoadedPasteDialect(chunk: PasteDialectChunk): void {
  loadedChunk = chunk
}
