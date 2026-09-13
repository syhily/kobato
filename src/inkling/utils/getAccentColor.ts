/**
 * Reads `--inkling-accent-color` scoped to the ASKING editor: pass the
 * editor's root element and the probe walks to its own `.inkling-lexical`
 * wrapper, so a page with several editors (article + comment) never resolves
 * a neighbour's accent. Without a root element (no composer mounted, e.g.
 * isolated unit tests) the probe falls back to the document-wide lookup the
 * unscoped version did; a scoped miss — the root exists but carries no
 * wrapper — returns the brand default rather than leaking across editors.
 */
export function getAccentColor(rootElement?: HTMLElement | null) {
  const editor = rootElement ? rootElement.closest('.inkling-lexical') : document.body.querySelector('.inkling-lexical')

  return (editor && getComputedStyle(editor).getPropertyValue('--inkling-accent-color')) || '#ff0095'
}
