// util to avoid processing events in Inkling when they originate from an editor
// element inside a card
export const shouldIgnoreEvent = (
  event: { metaKey?: boolean; key?: string; target?: EventTarget | null } | null | undefined,
): boolean => {
  if (!event) {
    return false
  }

  const { metaKey, key, target } = event
  const isEscape = key === 'Escape'
  const isMetaEnter = metaKey && key === 'Enter'

  // we want to allow some keys presses to pass through as we
  // always override them to toggle card editing mode
  if (isEscape || isMetaEnter) {
    return false
  }

  // Check for standard form inputs and CodeMirror editors.
  // For cut events, CodeMirror may process the event first and remove the
  // target element from the DOM before the event bubbles to Lexical, so
  // target.closest('.cm-editor') would return null. Fall back to checking
  // document.activeElement when the target is disconnected.
  const targetEl = target as Element | null
  const isFromCardEditor =
    !!targetEl?.matches?.('input, textarea') ||
    !!targetEl?.closest?.('.cm-editor') ||
    (!targetEl?.isConnected && !!document.activeElement?.closest?.('.cm-editor'))

  return isFromCardEditor
}
