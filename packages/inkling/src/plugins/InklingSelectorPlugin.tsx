import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister, COMMAND_PRIORITY_LOW } from 'lexical'
import React from 'react'

import GifPlugin from '@/components/ui/GifPlugin'
import LibraryPlugin from '@/components/ui/LibraryPlugin'
import { OPEN_GIF_SELECTOR_COMMAND, OPEN_IMAGE_LIBRARY_COMMAND } from '@/nodes/cards/card-commands'
import { $createImageNode, ImageNode } from '@/nodes/ImageNode'
import { INSERT_CARD_COMMAND } from '@/plugins/behaviour/commands'
import { registerSelectorInsertCommands } from '@/plugins/behaviour/selector-insertion'

// defined with the other card commands (`@/nodes/cards/card-commands`) and
// the selector-insertion behaviour module; re-exported here to keep this
// module's public surface unchanged
export { OPEN_GIF_SELECTOR_COMMAND }
export { INSERT_FROM_GIF_COMMAND, INSERT_FROM_LIBRARY_COMMAND } from '@/plugins/behaviour/selector-insertion'

// the insert surgeries and their command registrations live in
// `@/plugins/behaviour/selector-insertion`; this plugin keeps only the
// OPEN_* placeholder dispatches, which name the React overlay components.
// The two registrations are one skeleton folded through a table — the
// overlay component is the only datum that varies.
const SELECTOR_OPEN_COMMANDS = [
  [OPEN_GIF_SELECTOR_COMMAND, GifPlugin],
  [OPEN_IMAGE_LIBRARY_COMMAND, LibraryPlugin],
] as const

export const InklingSelectorPlugin = () => {
  const [editor] = useLexicalComposerContext()

  React.useEffect(() => {
    if (!editor.hasNodes([ImageNode])) {
      return
    }
    return mergeRegister(
      ...SELECTOR_OPEN_COMMANDS.map(([command, Selector]) =>
        editor.registerCommand(
          command,
          (dataset) => {
            const cardNode = $createImageNode({
              ...dataset,
              selector: Selector,
              isImageHidden: true,
            })

            editor.dispatchCommand(INSERT_CARD_COMMAND, { cardNode })

            return true
          },
          COMMAND_PRIORITY_LOW,
        ),
      ),
      registerSelectorInsertCommands(editor),
    )
  }, [editor])

  return null
}

export default InklingSelectorPlugin
