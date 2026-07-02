import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useCallback, useContext } from 'react'

import type { CodeCardNode } from '@/ui/inkling/editor/cards/simple-card-nodes'

import { ActionToolbar } from '@/ui/inkling-editor/components/ui/ActionToolbar'
import { ToolbarMenu, ToolbarMenuItem } from '@/ui/inkling-editor/components/ui/ToolbarMenu'
import CardContext from '@/ui/inkling-editor/context/CardContext'
import { DELETE_CARD_COMMAND } from '@/ui/inkling-editor/plugins/InklingBehaviourPlugin'
import { CodeBlockCard } from '@/ui/inkling/components/ui/cards/CodeBlockCard'
import { InklingCardChrome } from '@/ui/inkling/editor/cards/CardChrome'

/**
 * Code card component — connects CodeCardNode to the Koenig card system.
 *
 * Replaces the old CodeCardComponent that used CardShell + CodeBlockRenderer.
 * Now uses InklingCardWrapper for selection/editing state and CodeBlockCard
 * (CodeMirror) for the editor.
 */
export function CodeCardComponent({ node }: { node: CodeCardNode }) {
  const [editor] = useLexicalComposerContext()
  const { isSelected, isEditing, setEditing } = useContext(CardContext)

  const code = node.getCode()
  const language = node.getLanguage() ?? ''

  const onCodeChange = useCallback(
    (newCode: string) => {
      editor.update(
        () => {
          node.setCode(newCode)
          node.setHighlightedHtml(undefined)
        },
        { tag: 'history-merge' },
      )
    },
    [editor, node],
  )

  const onLanguageChange = useCallback(
    (newLang: string) => {
      editor.update(
        () => {
          node.setLanguage(newLang)
          node.setHighlightedHtml(undefined)
        },
        { tag: 'history-merge' },
      )
    },
    [editor, node],
  )

  return (
    <InklingCardChrome nodeKey={node.getKey()} wrapperStyle="code-card">
      <ActionToolbar isVisible={isSelected && !isEditing}>
        <ToolbarMenu>
          <ToolbarMenuItem icon="edit" isActive={false} label="编辑" onClick={() => setEditing(true)} />
          <ToolbarMenuItem
            icon="remove"
            isActive={false}
            label="删除"
            onClick={() => editor.dispatchCommand(DELETE_CARD_COMMAND, { cardKey: node.getKey() })}
          />
        </ToolbarMenu>
      </ActionToolbar>

      <CodeBlockCard
        code={code}
        language={language}
        isEditing={isEditing}
        onCodeChange={onCodeChange}
        onLanguageChange={onLanguageChange}
      />
    </InklingCardChrome>
  )
}
