function isMac() {
  return navigator.userAgent.includes('Mac')
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
