let current: string | null = null
const listeners = new Set<() => void>()

export function subscribeCommentFlash(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getCommentFlashSnapshot(): string | null {
  return current
}

export function getCommentFlashServerSnapshot(): string | null {
  return null
}

export function flashCommentTarget(commentId: string): void {
  if (current === commentId) {
    return
  }
  current = commentId
  for (const listener of listeners) {
    listener()
  }
}
