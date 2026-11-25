import type { ReactNode } from 'react'
export function SlashMenu({ children }: { children?: ReactNode }) {
  return <div data-inkling-slash-menu>{children}</div>
}
