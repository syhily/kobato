import type { ReactNode } from 'react'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'

import type { HorizontalRuleCardNode } from '@/ui/inkling/editor/cards/simple-card-nodes'

import { KoenigCardWrapper } from '@/ui/inkling/components/KoenigCardWrapper'
import { ActionToolbar } from '@/ui/inkling/components/ui/ActionToolbar'
import { ToolbarMenu, ToolbarMenuItem } from '@/ui/inkling/components/ui/ToolbarMenu'
import { useCardContext } from '@/ui/inkling/context/CardContext'
import { DELETE_CARD_COMMAND } from '@/ui/inkling/editor/commands'

export function HorizontalRuleCardComponent({ node }: { node: HorizontalRuleCardNode }): ReactNode {
  const [editor] = useLexicalComposerContext()
  const { isSelected } = useCardContext()

  return (
    <KoenigCardWrapper nodeKey={node.getKey()}>
      <ActionToolbar isVisible={isSelected}>
        <ToolbarMenu>
          <ToolbarMenuItem
            icon="remove"
            label="删除"
            onClick={() => editor.dispatchCommand(DELETE_CARD_COMMAND, undefined)}
          />
        </ToolbarMenu>
      </ActionToolbar>
      <div className="py-3">
        <hr className="border-grey-300 dark:border-grey-700" />
      </div>
    </KoenigCardWrapper>
  )
}
