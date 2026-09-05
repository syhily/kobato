import type { LexicalEditor } from 'lexical'

import { mergeRegister } from '@lexical/utils'
import { $getNearestNodeFromDOMNode, CLICK_COMMAND, COMMAND_PRIORITY_LOW, CUT_COMMAND } from 'lexical'

import { shouldIgnoreEvent } from '@/utils/shouldIgnoreEvent'

import { $selectCard } from './card-adjacency'

export function registerClickAndCut(editor: LexicalEditor) {
  return mergeRegister(
    editor.registerCommand(
      CLICK_COMMAND,
      (event) => {
        const target = event.target
        if (target instanceof HTMLElement && target.matches('[data-lexical-decorator="true"]')) {
          // clicked on a decorator node, select it
          // - only occurs when the padding above a card is clicked as our
          //   cards have their own click handlers
          event.preventDefault()
          const cardNode = $getNearestNodeFromDOMNode(target)
          if (cardNode) {
            $selectCard(editor, cardNode.getKey())
          }
          return true
        }

        return false
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      CUT_COMMAND,
      (event) => {
        // prevent cut events inside card editors triggering lexical behaviour
        if (shouldIgnoreEvent(event)) {
          return true
        }

        return false
      },
      COMMAND_PRIORITY_LOW,
    ),
  )
}
