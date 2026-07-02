import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { DRAG_DROP_PASTE } from '@lexical/rich-text'
import { $canShowPlaceholder } from '@lexical/text'
import { $createParagraphNode, $getRoot, $isDecoratorNode, type LexicalNode } from 'lexical'
import React from 'react'

import { $selectDecoratorNode } from '@/ui/inkling-editor/utils/$selectDecoratorNode'

interface ExternalControlAPI {
  editorInstance: ReturnType<typeof useLexicalComposerContext>[0]
  serialize: () => string
  editorIsEmpty: () => boolean | undefined
  focusEditor: (options?: { position?: 'top' | 'bottom' }) => void
  blurEditor: () => void
  insertParagraphAtTop: (options?: { focus?: boolean }) => void
  insertParagraphAtBottom: (options?: { focus?: boolean }) => void
  insertFiles: (files: File[]) => void
  lastNodeIsDecorator: () => boolean
}

function hasSelectMethod(node: LexicalNode): node is LexicalNode & { select: () => void } {
  return 'select' in node && typeof (node as Record<string, unknown>).select === 'function'
}

// used to register a minimal API for controlling the editor from the consuming app
// designed to allow typical behaviours without the consuming app needing to bundle the lexical library
export const ExternalControlPlugin = ({ registerAPI }: { registerAPI: (api: ExternalControlAPI | null) => void }) => {
  const [editor] = useLexicalComposerContext()

  React.useEffect(() => {
    if (!registerAPI) {
      return
    }

    const API: ExternalControlAPI = {
      // give access to the editor instance so the Lexical API can be used directly if needed
      editorInstance: editor,
      // simplified API methods for typical consumer app actions
      serialize() {
        return JSON.stringify(editor.getEditorState())
      },
      editorIsEmpty() {
        return editor.getEditorState().read(() => $canShowPlaceholder(false))
      },
      focusEditor({ position = 'bottom' } = {}) {
        editor.focus(() => {})

        if (position === 'top') {
          // Lexical does not automatically select a decorator node
          editor.update(() => {
            const root = $getRoot()
            const firstChild = root.getFirstChild()

            if ($isDecoratorNode(firstChild)) {
              $selectDecoratorNode(firstChild)
              // selecting a decorator node does not change the
              // window selection (there's no caret) so we need
              // to manually move focus to the editor element
              editor.getRootElement()?.focus()
            }
          })
        }
        if (position === 'bottom') {
          // Lexical does not automatically select a decorator node
          editor.update(() => {
            const root = $getRoot()
            const lastChild = root.getLastChild()

            if ($isDecoratorNode(lastChild)) {
              $selectDecoratorNode(lastChild)
              // selecting a decorator node does not change the
              // window selection (there's no caret) so we need
              // to manually move focus to the editor element
              editor.getRootElement()?.focus()
            } else if (lastChild && hasSelectMethod(lastChild)) {
              lastChild.select()
            }
          })
        }
      },
      blurEditor() {
        editor.blur()
      },
      insertParagraphAtTop({ focus = true } = {}) {
        editor.update(() => {
          const paragraphNode = $createParagraphNode()
          const [firstChild] = $getRoot().getChildren()

          if (firstChild) {
            firstChild.insertBefore(paragraphNode)
          } else {
            $getRoot().append(paragraphNode)
          }

          if (focus) {
            paragraphNode.selectStart()
          }
        })
      },
      insertParagraphAtBottom({ focus = true } = {}) {
        editor.update(() => {
          const paragraphNode = $createParagraphNode()
          $getRoot().append(paragraphNode)

          if (focus) {
            paragraphNode.selectStart()
          }
        })
      },
      insertFiles(files: File[]) {
        editor.dispatchCommand(DRAG_DROP_PASTE, files)
      },
      lastNodeIsDecorator() {
        let isDecorator = false
        editor.getEditorState().read(() => {
          const nodes = $getRoot().getChildren()
          const lastNode = nodes[nodes.length - 1]

          isDecorator = lastNode !== undefined && $isDecoratorNode(lastNode)
        })
        return isDecorator
      },
    }

    registerAPI(API)

    return () => {
      registerAPI(null)
    }
  }, [editor, registerAPI])
  return null
}

export default ExternalControlPlugin
