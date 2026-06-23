import { $getSelection, $isNodeSelection } from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useCallback } from 'react'

import type { CodeCardNode } from '@/ui/inkling/editor/cards/simple-card-nodes'
import { ActionToolbar } from '@/ui/inkling/components/ui/ActionToolbar'
import { ToolbarMenu, ToolbarMenuItem } from '@/ui/inkling/components/ui/ToolbarMenu'
import { CodeBlockCard } from '@/ui/inkling/components/ui/cards/CodeBlockCard'
import { useCardContext } from '@/ui/inkling/context/CardContext'
import { DELETE_CARD_COMMAND } from '@/ui/inkling/editor/commands'
import { KoenigCardWrapper } from '@/ui/inkling/components/KoenigCardWrapper'

/**
 * Code card component — connects CodeCardNode to the Koenig card system.
 *
 * Replaces the old CodeCardComponent that used CardShell + CodeBlockRenderer.
 * Now uses KoenigCardWrapper for selection/editing state and CodeBlockCard
 * (CodeMirror) for the editor.
 */
export function CodeCardComponent({ node }: { node: CodeCardNode }) {
  const [editor] = useLexicalComposerContext()
  const { isSelected, isEditing, setEditing } = useCardContext()

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
    <KoenigCardWrapper nodeKey={node.getKey()} wrapperStyle="code-card">
      <ActionToolbar isVisible={isSelected && !isEditing}>
        <ToolbarMenu>
          <ToolbarMenuItem icon="edit" label="编辑" onClick={() => setEditing(true)} />
          <ToolbarMenuItem
            icon="trash"
            label="删除"
            onClick={() => editor.dispatchCommand(DELETE_CARD_COMMAND, undefined)}
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
    </KoenigCardWrapper>
  )
}
