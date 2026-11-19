export const shouldIgnoreEvent = (
  event: { metaKey?: boolean; key?: string; target?: EventTarget | null } | null | undefined,
): boolean => {
  if (!event) {
    return false
  }

  const { metaKey, key, target } = event
  const isEscape = key === 'Escape'
  const isMetaEnter = metaKey && key === 'Enter'

  if (isEscape || isMetaEnter) {
    return false
  }

  const targetEl = target instanceof Element ? target : null
  const targetIsDisconnected = target instanceof Node ? !target.isConnected : true
  const isFromCardEditor =
    !!targetEl?.matches('input, textarea') ||
    !!targetEl?.closest('.cm-editor') ||
    (targetIsDisconnected && !!document.activeElement?.closest('.cm-editor'))

  return isFromCardEditor
}
