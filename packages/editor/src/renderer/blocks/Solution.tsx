import type { ReactNode } from 'react'

export interface SolutionProps {
  children?: ReactNode
}

export function Solution({ children }: SolutionProps) {
  return (
    <blockquote className="solution relative flow-root overflow-x-auto overflow-y-hidden p-[1.2rem] pr-9 pb-9 [-webkit-overflow-scrolling:touch]">
      <div className="solution-begin mb-2 block text-[1.2rem] font-extrabold text-brand">解：</div>
      {children}
      <span
        className="solution-qed pointer-events-none absolute right-3 bottom-3 inline-flex h-3.5 w-3.5 items-center justify-center text-ink-3"
        aria-hidden="true"
      >
        <svg viewBox="0 0 14 14" className="block h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="1" y="1" width="12" height="12" />
        </svg>
      </span>
    </blockquote>
  )
}

export interface UnstyledSolutionProps {
  children?: ReactNode
}

export function UnstyledSolution({ children }: UnstyledSolutionProps) {
  return <blockquote>{children}</blockquote>
}
