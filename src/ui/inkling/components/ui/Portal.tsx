import { createPortal } from 'react-dom'

/**
 * Portal wrapper — renders children into document.body so floating toolbars
 * and popovers escape any overflow:hidden / overflow:auto containers in the
 * editor's DOM tree.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') {
    return null
  }
  return createPortal(children, document.body)
}
