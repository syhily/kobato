// React must own the comment `active` attribute: mutating the streamed comment
// DOM before its Suspense boundary hydrates is read back by React as a
// hydration mismatch ("server HTML didn't match"), and React refuses to patch
// it. use-focus-hash writes the flashed id here after the scroll settles;
// CommentRow subscribes and renders the class itself.

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
