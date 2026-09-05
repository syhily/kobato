import type { LexicalEditor } from 'lexical'

import { $getSelection, $isNodeSelection } from 'lexical'

import { $isInklingCard } from '@/nodes/base'

import { DESELECT_CARD_COMMAND } from './commands'

interface MouseEventsDeps {
  containerElem: React.RefObject<HTMLElement | null>
  isNested?: boolean
}

export function registerMouseEvents(editor: LexicalEditor, deps: MouseEventsDeps) {
  const { containerElem, isNested } = deps

  // deselect cards on mousedown outside of the editor container
  const onMousedown = (event: MouseEvent) => {
    if (!event.target || !(event.target instanceof Node) || !document.body.contains(event.target)) {
      // The event target is no longer in the DOM
      // This is possible if we have listeners in the capture phase of the event (e.g. dropdowns)
      return
    }

    // clicks outside of editor should deselect cards
    //  this more generic handling prevents the need to handle blur for codemirror cards (and likely others)
    if (containerElem.current && !containerElem.current.contains(event.target)) {
      editor.getEditorState().read(() => {
        const selection = $getSelection()
        if ($isNodeSelection(selection)) {
          const selectedNode = selection.getNodes()[0]
          if ($isInklingCard(selectedNode)) {
            editor.dispatchCommand(DESELECT_CARD_COMMAND, { cardKey: selectedNode.getKey() })
          }
        }
      })
    }
  }

  if (!isNested) {
    window.addEventListener('mousedown', onMousedown)
  }

  return () => {
    window.removeEventListener('mousedown', onMousedown)
  }
}
