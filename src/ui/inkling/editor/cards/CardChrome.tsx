import type { NodeKey } from 'lexical'
import type { ReactNode } from 'react'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { Trash2Icon } from 'lucide-react'
import { useContext } from 'react'

import InklingCardWrapper from '@/ui/inkling-editor/components/InklingCardWrapper'
import CardContext from '@/ui/inkling-editor/context/CardContext'
import { DELETE_CARD_COMMAND } from '@/ui/inkling-editor/plugins/InklingBehaviourPlugin'

/**
 * Shared chrome for every yufan.me card: the vendored card wrapper (selection
 * outline, click-to-select/edit, drag handle) plus a delete icon button that
 * appears in the card's top-right corner while the card is selected. All card
 * components render through this instead of using `InklingCardWrapper`
 * directly, so the affordance stays uniform across card types.
 */
export function InklingCardChrome({
  nodeKey,
  children,
  ...wrapperProps
}: {
  nodeKey: NodeKey
  children: ReactNode
  /** Forwarded to the vendored wrapper (e.g. `wrapperStyle`, `width`). */
  [key: string]: unknown
}) {
  return (
    <InklingCardWrapper nodeKey={nodeKey} {...wrapperProps}>
      <CardDeleteButton nodeKey={nodeKey} />
      {children}
    </InklingCardWrapper>
  )
}

function CardDeleteButton({ nodeKey }: { nodeKey: NodeKey }) {
  const [editor] = useLexicalComposerContext()
  const { isSelected, isEditing } = useContext(CardContext)

  if (!isSelected || isEditing) {
    return null
  }

  return (
    // `data-inkling-allow-clickthrough="false"` keeps the wrapper's
    // click-to-edit handler from firing when the button is pressed.
    <div className="absolute top-1.5 right-1.5 z-10" data-inkling-allow-clickthrough="false">
      <button
        type="button"
        title="删除卡片"
        aria-label="删除卡片"
        // Prevent the editor from stealing selection before the click lands —
        // without this the NodeSelection collapses and the delete no-ops.
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          editor.dispatchCommand(DELETE_CARD_COMMAND, { cardKey: nodeKey })
        }}
        className="inline-flex size-7 items-center justify-center rounded-md border border-line bg-background/95 text-ink-4 shadow-sm transition hover:border-alert hover:text-alert"
      >
        <Trash2Icon className="size-4" />
      </button>
    </div>
  )
}
