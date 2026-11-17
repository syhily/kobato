/**
 * Reads `--inkling-accent-color` from the asking editor's own `.inkling-lexical` wrapper,
 * so a page with several editors never resolves a neighbour's accent. Without a root
 * element the probe falls back to a document-wide lookup; a scoped miss returns the brand
 * default rather than leaking across editors.
 */
export function getAccentColor(rootElement?: HTMLElement | null) {
  const editor = rootElement ? rootElement.closest('.inkling-lexical') : document.body.querySelector('.inkling-lexical')

  return (editor && getComputedStyle(editor).getPropertyValue('--inkling-accent-color')) || '#ff0095'
}
