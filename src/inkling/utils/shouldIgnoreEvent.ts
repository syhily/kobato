// Events originating from an editor element inside a card must not be handled by Inkling.
export const shouldIgnoreEvent = (
  event: { metaKey?: boolean; key?: string; target?: EventTarget | null } | null | undefined,
): boolean => {
  if (!event) {
    return false
  }

  const { metaKey, key, target } = event
  const isEscape = key === 'Escape'
  const isMetaEnter = metaKey && key === 'Enter'

  // Escape and meta+Enter always pass through: they are overridden to toggle card editing.
  if (isEscape || isMetaEnter) {
    return false
  }

  // On cut events CodeMirror may process the event first and remove the target element
  // from the DOM before the event bubbles to Lexical, so `target.closest('.cm-editor')`
  // returns null; fall back to document.activeElement when the target is disconnected.
  const targetEl = target instanceof Element ? target : null
  const targetIsDisconnected = target instanceof Node ? !target.isConnected : true
  const isFromCardEditor =
    !!targetEl?.matches('input, textarea') ||
    !!targetEl?.closest('.cm-editor') ||
    (targetIsDisconnected && !!document.activeElement?.closest('.cm-editor'))

  return isFromCardEditor
}
