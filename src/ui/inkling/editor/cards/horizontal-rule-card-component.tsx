import type { ReactNode } from 'react'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useContext } from 'react'

import type { HorizontalRuleCardNode } from '@/ui/inkling/editor/cards/simple-card-nodes'

import { ActionToolbar } from '@/ui/inkling-editor/components/ui/ActionToolbar'
import { ToolbarMenu, ToolbarMenuItem } from '@/ui/inkling-editor/components/ui/ToolbarMenu'
import CardContext from '@/ui/inkling-editor/context/CardContext'
import { DELETE_CARD_COMMAND } from '@/ui/inkling-editor/plugins/InklingBehaviourPlugin'
import { InklingCardChrome } from '@/ui/inkling/editor/cards/CardChrome'

export function HorizontalRuleCardComponent({ node }: { node: HorizontalRuleCardNode }): ReactNode {
  const [editor] = useLexicalComposerContext()
  const { isSelected } = useContext(CardContext)

  return (
    <InklingCardChrome nodeKey={node.getKey()}>
      <ActionToolbar isVisible={isSelected}>
        <ToolbarMenu>
          <ToolbarMenuItem
            icon="remove"
            isActive={false}
            label="删除"
            onClick={() => editor.dispatchCommand(DELETE_CARD_COMMAND, { cardKey: node.getKey() })}
          />
        </ToolbarMenu>
      </ActionToolbar>
      <div className="py-3">
        <hr className="border-grey-300 dark:border-grey-700" />
      </div>
    </InklingCardChrome>
  )
}
