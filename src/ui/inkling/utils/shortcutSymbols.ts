/** Faithful copy of Koenig's shortcutSymbols.js */
function isMac() {
  return typeof navigator !== 'undefined' && navigator.userAgent.indexOf('Mac') !== -1
}

export function ctrlOrCmdSymbol() {
  return isMac() ? '⌘' : 'Ctrl'
}

export function ctrlOrSymbol() {
  return isMac() ? '⌃' : 'Ctrl'
}

export function altOrOption() {
  return isMac() ? '⌥' : 'Alt'
}
