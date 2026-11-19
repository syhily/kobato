export function getAccentColor(rootElement?: HTMLElement | null) {
  const editor = rootElement ? rootElement.closest('.inkling-lexical') : document.body.querySelector('.inkling-lexical')

  return (editor && getComputedStyle(editor).getPropertyValue('--inkling-accent-color')) || '#ff0095'
}
