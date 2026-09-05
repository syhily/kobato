export function getAccentColor() {
  const editor = document.body.querySelector('.inkling-lexical')

  return (editor && getComputedStyle(editor).getPropertyValue('--inkling-accent-color')) || '#ff0095'
}
