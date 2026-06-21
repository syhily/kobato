import type { ReactNode } from 'react'

import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { GripVerticalIcon } from 'lucide-react'

import type { InklingImageLayout } from '@/shared/inkling/schema'

import { cn } from '@/ui/lib/cn'

interface CardShellProps {
  nodeKey: string
  children: ReactNode
  className?: string
}

/** Ghost-style card wrapper — brand ring on select, faint brand tint on
 *  hover. The selection state mirrors Koenig's `kg-card-selected`: a 2px
 *  brand outline. Hover shows a 1px brand hairline so the user can tell a
 *  card is interactive before clicking. */
export function CardShell({ nodeKey, children, className }: CardShellProps): ReactNode {
  const [isSelected] = useLexicalNodeSelection(nodeKey)
  return (
    <div
      className={cn(
        'inkling-card relative rounded-lg transition-shadow',
        isSelected
          ? 'z-20 shadow-[0_0_0_2px_var(--brand)]'
          : 'hover:shadow-[0_0_0_1px_color-mix(in_oklab,var(--brand)_45%,transparent)]',
        className,
      )}
      data-inkling-card
      data-inkling-card-key={nodeKey}
      data-inkling-card-selected={isSelected || undefined}
    >
      {isSelected ? (
        <div
          className="inkling-card-drag-handle absolute top-1 -left-7 flex cursor-grab items-center rounded p-0.5 text-muted-foreground hover:text-foreground active:cursor-grabbing"
          draggable
          title="拖拽排序"
        >
          <GripVerticalIcon className="h-4 w-4" />
        </div>
      ) : null}
      {children}
    </div>
  )
}

export function parseImageLayout(value: string): InklingImageLayout | undefined {
  switch (value) {
    case 'left':
    case 'center':
    case 'right':
      return value
    default:
      return undefined
  }
}

/** Common language list for the code card's `<datalist>` suggestions. */
export const COMMON_LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'rust',
  'go',
  'java',
  'c',
  'cpp',
  'html',
  'css',
  'json',
  'yaml',
  'bash',
  'sql',
  'ruby',
  'swift',
  'kotlin',
  'php',
  'markdown',
  'plaintext',
]
